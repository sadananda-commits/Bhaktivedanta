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
// READ BUDGET — this is the part that matters most here (see the Sept 2026
// "50K reads/day exceeded" outage): a naive version of this route reads
// EVERY answer document, for EVERY participant (live included), for EVERY
// quiz, on every cache miss — and the live cohort's answers are pure waste
// to read here, since their scores are already sitting frozen in
// `leaderboard`. Two changes bring that down by roughly two orders of
// magnitude:
//   1. ONE shared cache for the whole raw dataset, not one per `days`
//      filter. The old version cached "days=0", "days=7", "days=30" etc.
//      completely separately, so a visitor clicking through the Window
//      pills multiplied Firestore reads by up to 5x for identical
//      underlying data. Now there's a single `rawCache` with everything
//      un-filtered by date; each `days` value just filters that same
//      in-memory array — zero extra reads.
//   2. Solo scoring no longer touches collectionGroup('answers') at all.
//      For each quiz, only participants who are mode:'solo', still
//      "present" (status !== 'left'), and have actually finished
//      (soloQuestionIndex >= totalQuestions) get their answers read — via
//      a targeted `quizRef.collection('answers').where('participantId',
//      'in', [...])` query, chunked to Firestore's 'in' limit. This reads
//      only the documents genuinely needed to score them, instead of
//      every question every player (live or solo) ever answered.
// `participants` is still read as one collectionGroup — it's a much
// smaller collection (one doc per person per quiz, not one per question),
// so it isn't the expensive part, and every live row still needs its
// participant doc for a join-time timestamp.
//
// CACHE TTL: 5 minutes (RAW_TTL below), not 60 seconds. This is a
// leaderboard, not a live scoreboard — a few minutes of staleness costs
// nothing, and cutting refresh frequency 5x cuts reads 5x on top of the
// two changes above. If reads are still a concern, raising this further
// (e.g. 15 minutes) is the single easiest lever to pull.
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
const RAW_TTL = 5 * 60 * 1000; // 5 minutes — see READ BUDGET comment above
const ANSWERS_IN_CHUNK = 10;   // conservative Firestore 'in'-clause batch size

let rawCache = null; // { at, quizzes, live, solo } — shared across every `days` value

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

// One full pass over every quiz. Reads: 1 `quizzes` collection scan, 1
// `participants` collectionGroup scan, plus one small targeted `answers`
// query per chunk of finished-solo-participants per quiz (0 queries for a
// quiz with no finished solo attempts). Called at most once per RAW_TTL.
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
    // participants who are actually solo and actually finished. This is
    // the read-budget-critical part; see the file header comment.
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
    let cacheHit = true;
    if (!rawCache || Date.now() - rawCache.at > RAW_TTL) {
      cacheHit = false;
      const data = await buildRawData();
      rawCache = { at: Date.now(), ...data };
    }
    res.setHeader('X-Cache', cacheHit ? 'HIT' : 'MISS');
    return res.status(200).json(buildPayload(rawCache, days));

  } catch (err) {
    console.error('[quiz-leaderboard]', err.message);
    if (rawCache) {
      // Serve stale raw data rather than nothing — still zero extra reads.
      res.setHeader('X-Cache', 'STALE');
      return res.status(200).json(buildPayload(rawCache, days));
    }
    return res.status(200).json({
      live: { overall: [], byQuiz: {} },
      solo: { overall: [], byQuiz: {} },
      quizzes: [],
      _error: err.message,
    });
  }
}
