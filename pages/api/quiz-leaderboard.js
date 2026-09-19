// pages/api/quiz-leaderboard.js
//
// Aggregates results across every Online Quiz into one cross-quiz
// leaderboard, split into Live and Self-Paced ("solo") sections — the same
// split OnlineQuizHost.js's own Final Results screen already uses.
//
// LIVE rows come straight from each quiz doc's own `leaderboard` array
// (Firestore quizzes/{quizId}.leaderboard) — a one-time frozen snapshot
// pages/api/quiz.js's endQuiz() writes when the host ends the live round,
// already carrying correctAnswers/incorrectAnswers/avgResponseMs/mode:'live'.
//
// SOLO rows do NOT exist anywhere in that array — self-paced never gets
// "frozen" the way the live cohort does (see quiz.js's own comment above
// computeSoloLeaderboard). quiz.js recomputes solo standings from scratch
// on every getResults call, straight from a single quiz's `participants` +
// `answers` subcollections. This route mirrors that per quiz.
//
// READ BUDGET — CACHE IS FIRESTORE-BACKED, NOT IN-MEMORY. This route used
// to cache its (expensive) raw dataset in a plain module-level variable
// (`let rawCache`). That only helps if the *same* serverless instance
// handles the next request — Vercel gives no such guarantee, especially
// for a lightly-trafficked route like this one, so in practice nearly
// every request could hit a cold instance and pay full price again. That
// was the real cause of the Sept 2026 "30K reads from basically no
// traffic" incident: a single page load could cold-start straight into a
// full rebuild that scores every finished self-paced attempt across
// EVERY quiz, all-time (hundreds of participants × ~15 answers each).
//
// The fix: the raw dataset lives in one small Firestore document
// (CACHE_DOC below), not server memory. Every instance — cold-started or
// not — checks that single document first:
//   - fresh (< RAW_TTL old)  -> use its payload directly. Costs exactly
//     ONE read, no matter which instance handles the request.
//   - stale or missing       -> rebuild (the expensive part, described
//     below), then write the result back to that same document so every
//     OTHER instance — this one included, next time — reads the cheap
//     path instead of rebuilding again. This is what actually bounds the
//     expensive rebuild to "at most once per RAW_TTL, globally" instead
//     of "at most once per RAW_TTL, per lucky warm instance."
//
// The rebuild itself is still the targeted version from the previous fix:
//   - Live rows never touch `answers` at all — their scores are already
//     frozen in `leaderboard`.
//   - Solo rows only read the `answers` of participants who are actually
//     mode:'solo' and actually finished (soloQuestionIndex >=
//     totalQuestions), via a small `where('participantId', 'in', [...])`
//     query per quiz — not a full collectionGroup('answers') scan of
//     every question everyone (live included) ever answered.
// `participants` is still read as one collectionGroup — much smaller than
// `answers` (one doc per person per quiz, not one per question), and every
// live row still needs its participant doc for a join-time timestamp.
//
// CACHE TTL: 10 minutes (RAW_TTL below). This is a leaderboard, not a live
// scoreboard — staleness measured in minutes costs nothing, and the
// Firestore-backed cache means this TTL is now a genuinely global bound on
// rebuild frequency, not a per-instance best-effort one.
//
// GROUPING KEY: per-quiz groups (`byQuiz`) are keyed by quizId (the
// DAY17-style code from the quiz's URL), not by title — a quiz's title is
// optional and falls back to its quizId, so keying by title would silently
// break filtering the day someone actually sets a distinct title.
//
// DEDUPE: with no login, a student just retypes their name each attempt,
// so retaking a quiz (mainly self-paced, which allows replays) used to
// show up as several rows under one name. dedupeBestPerName() collapses
// those to that name's single best attempt (by score, then by average
// response time) before ranking — scoped to one quizId + mode, so it never
// merges a name across different quizzes or across live vs. solo.
//
// DATA SOURCE: reads Firestore through lib/firebaseAdmin.js using a
// service account, which bypasses firestore.rules entirely (see the
// earlier comment history of this file for why it's not on the client SDK).
//
// TIME WINDOW — APPROXIMATE: no document anywhere stores a true "result
// completed at" timestamp. Live rows use the participant's `joinTime`;
// solo rows use `soloStartedAt` (falling back to `joinTime`) — actually
// when they started their LAST question, not when they finished, so this
// is approximate for solo the same way it always has been.

import { db } from '../../lib/firebaseAdmin';

const ALLOWED_DAYS = new Set([0, 1, 7, 30, 90]);
const RAW_TTL = 10 * 60 * 1000; // 10 minutes — see READ BUDGET comment above
const ANSWERS_IN_CHUNK = 10;    // conservative Firestore 'in'-clause batch size

// One small doc holds the entire raw (un-filtered-by-day) dataset, shared
// across every serverless instance — see the CACHE IS FIRESTORE-BACKED
// comment above for why this replaced a module-level variable.
const CACHE_DOC = db.collection('system').doc('quizLeaderboardCache');

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Same tie-break endQuiz() uses in quiz.js: higher score wins; ties go to
// whoever answered faster on average.
function rankAndShape(rows) {
  const sorted = [...rows].sort((a, b) =>
    b.totalScore - a.totalScore || (a.avgResponseMs ?? Infinity) - (b.avgResponseMs ?? Infinity)
  );
  sorted.forEach((r, i) => { r.rank = i + 1; });
  return sorted;
}

function groupByQuiz(rows) {
  const groups = {};
  rows.forEach(r => { (groups[r.quizId] = groups[r.quizId] || []).push(r); });
  Object.keys(groups).forEach(k => { groups[k] = rankAndShape(groups[k]); });
  return groups;
}

// No login means a student just retypes their name each attempt, so a
// retaken quiz (mainly self-paced, which allows replays) shows up as
// several rows under one name. Collapse those down to that name's single
// best attempt on that quiz, using the same tie-break as rankAndShape:
// higher score wins, ties go to whoever answered faster on average.
// Scoped to quizId + mode, so this never touches a name's rows on a
// *different* quiz or in the other (live/solo) section.
function dedupeBestPerName(rows) {
  const bestByKey = {};
  rows.forEach(r => {
    const key = `${r.quizId}::${(r.studentName || '').trim().toLowerCase()}`;
    const existing = bestByKey[key];
    if (!existing) { bestByKey[key] = r; return; }
    const better = r.totalScore > existing.totalScore ||
      (r.totalScore === existing.totalScore && (r.avgResponseMs ?? Infinity) < (existing.avgResponseMs ?? Infinity));
    if (better) bestByKey[key] = r;
  });
  return Object.values(bestByKey);
}

// One full pass over every quiz — the expensive path, only meant to run
// once per RAW_TTL window, globally (see CACHE_DOC above). Reads: 1
// `quizzes` collection scan, 1 `participants` collectionGroup scan, plus
// one small targeted `answers` query per chunk of finished-solo-
// participants per quiz (0 queries for a quiz with no finished solo
// attempts).
async function buildRawData() {
  const [quizzesSnap, participantsSnap] = await Promise.all([
    db.collection('quizzes').get(),
    db.collectionGroup('participants').get(),
  ]);

  // "<quizId>::<participantId>" -> participant fields, and "<quizId>" ->
  // [participant, ...] for the per-quiz solo scan below.
  const participantsByKey = {};
  const participantsByQuiz = {};
  participantsSnap.forEach(docSnap => {
    const quizId = docSnap.ref.parent.parent?.id;
    if (!quizId) return;
    const p = docSnap.data();
    const entry = { participantId: docSnap.id, ...p };
    participantsByKey[`${quizId}::${docSnap.id}`] = entry;
    (participantsByQuiz[quizId] = participantsByQuiz[quizId] || []).push(entry);
  });

  const live = [];
  const solo = [];
  const quizTitleById = {};

  await Promise.all(quizzesSnap.docs.map(async (docSnap) => {
    const q = docSnap.data();
    const quizId = q.quizId || docSnap.id;
    const quizTitle = q.title || quizId;
    const totalQuestions = Number(q.totalQuestions) || 0;
    quizTitleById[quizId] = quizTitle;

    // ── Live: read straight from the frozen snapshot — no answers read ──
    (q.leaderboard || []).forEach(r => {
      const participant = participantsByKey[`${quizId}::${r.participantId}`];
      const timestamp = participant?.joinTime || q.createdAt || '';
      const correct = r.correctAnswers ?? 0;
      const incorrect = r.incorrectAnswers ?? 0;
      const attempted = correct + incorrect;

      live.push({
        quizId,
        quizTitle,
        participantId: r.participantId,
        studentName: r.name || 'A student',
        totalScore: r.totalScore ?? 0,
        correctAnswers: correct,
        incorrectAnswers: incorrect,
        attempted,
        accuracy: attempted ? Math.round((correct / attempted) * 100) : 0,
        avgResponseMs: typeof r.avgResponseMs === 'number' ? r.avgResponseMs : null,
        timestamp,
      });
    });

    // ── Solo: never stored — recompute, but ONLY read the answers of
    // participants who are actually solo and actually finished.
    const finishedSolo = (participantsByQuiz[quizId] || []).filter(p =>
      p.mode === 'solo' && p.status !== 'left' &&
      totalQuestions > 0 && Number(p.soloQuestionIndex) >= totalQuestions
    );
    if (!finishedSolo.length) return;

    const answersByParticipant = {};
    const idChunks = chunkArray(finishedSolo.map(p => p.participantId), ANSWERS_IN_CHUNK);
    await Promise.all(idChunks.map(async (ids) => {
      const snap = await docSnap.ref.collection('answers').where('participantId', 'in', ids).get();
      snap.forEach(aDoc => {
        const a = aDoc.data();
        (answersByParticipant[a.participantId] = answersByParticipant[a.participantId] || []).push(a);
      });
    }));

    finishedSolo.forEach(p => {
      const timestamp = p.soloStartedAt || p.joinTime || q.createdAt || '';
      const mine = answersByParticipant[p.participantId] || [];
      const correct = mine.filter(a => a.isCorrect === true).length;
      const totalScore = mine.reduce((sum, a) => sum + (Number(a.pointsEarned) || 0), 0);
      const avgResponseMs = mine.length
        ? Math.round(mine.reduce((sum, a) => sum + (Number(a.responseDurationMs) || 0), 0) / mine.length)
        : null;
      const incorrect = Math.max(0, totalQuestions - correct);

      solo.push({
        quizId,
        quizTitle,
        participantId: p.participantId,
        studentName: p.name || 'A student',
        totalScore,
        correctAnswers: correct,
        incorrectAnswers: incorrect,
        attempted: totalQuestions,
        accuracy: totalQuestions ? Math.round((correct / totalQuestions) * 100) : 0,
        avgResponseMs,
        timestamp,
      });
    });
  }));

  return {
    quizzes: Object.entries(quizTitleById).map(([quizId, title]) => ({ quizId, title })),
    live,
    solo,
  };
}

// Reads the shared Firestore cache doc (1 read). Rebuilds and writes it
// back (the expensive path + 1 write) only when it's missing or stale —
// and because this check lives in Firestore, not server memory, that's
// true across every instance, not just whichever one happens to be warm.
async function getRawData() {
  const snap = await CACHE_DOC.get();
  const cached = snap.exists ? snap.data() : null;

  if (cached?.computedAt && Date.now() - cached.computedAt < RAW_TTL && cached.payload) {
    return { raw: JSON.parse(cached.payload), cacheStatus: 'HIT' };
  }

  const raw = await buildRawData();
  // Best-effort write-back — if it fails (e.g. a race with another
  // instance also rebuilding right now), the freshly-built `raw` is still
  // returned to THIS request either way, so nothing breaks; the next
  // request just rebuilds again a little sooner than ideal.
  try {
    await CACHE_DOC.set({ computedAt: Date.now(), payload: JSON.stringify(raw) });
  } catch (err) {
    console.error('[quiz-leaderboard] cache write failed', err.message);
  }
  return { raw, cacheStatus: 'MISS' };
}

function withinWindow(row, cutoff) {
  if (!cutoff) return true;
  const ms = row.timestamp ? Date.parse(row.timestamp) : 0;
  return !!ms && ms >= cutoff;
}

function buildPayload(raw, days) {
  const cutoff = days > 0 ? Date.now() - days * 86400000 : 0;
  const dedupedLive = dedupeBestPerName(raw.live.filter(r => withinWindow(r, cutoff)));
  const dedupedSolo = dedupeBestPerName(raw.solo.filter(r => withinWindow(r, cutoff)));
  return {
    live: { overall: rankAndShape(dedupedLive).slice(0, 500), byQuiz: groupByQuiz(dedupedLive) },
    solo: { overall: rankAndShape(dedupedSolo).slice(0, 500), byQuiz: groupByQuiz(dedupedSolo) },
    quizzes: raw.quizzes,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const requestedDays = Number(req.query.days);
  const days = ALLOWED_DAYS.has(requestedDays) ? requestedDays : 0;

  try {
    const { raw, cacheStatus } = await getRawData();
    res.setHeader('X-Cache', cacheStatus);
    return res.status(200).json(buildPayload(raw, days));

  } catch (err) {
    console.error('[quiz-leaderboard]', err.message);
    // Last resort: try the cache doc directly, even if it's stale — still
    // just the one read, and far better than a blank leaderboard.
    try {
      const snap = await CACHE_DOC.get();
      if (snap.exists && snap.data().payload) {
        res.setHeader('X-Cache', 'STALE');
        return res.status(200).json(buildPayload(JSON.parse(snap.data().payload), days));
      }
    } catch (_) { /* fall through to the empty payload below */ }

    return res.status(200).json({
      live: { overall: [], byQuiz: {} },
      solo: { overall: [], byQuiz: {} },
      quizzes: [],
      _error: err.message,
    });
  }
}
