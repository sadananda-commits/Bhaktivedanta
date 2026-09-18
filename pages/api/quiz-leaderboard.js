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
// computeSoloLeaderboard: someone can finish a self-paced attempt at any
// time, indefinitely, so there's no single moment to snapshot). quiz.js
// instead recomputes solo standings from scratch on every getResults call,
// straight from each quiz's participants + answers subcollections. This
// route mirrors that exact computation across every quiz — filtering to
// participants with mode:'solo' who've actually finished
// (soloQuestionIndex >= totalQuestions), then scoring each one from their
// own answers docs — instead of reading a field that would just be empty.
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
// service account, which bypasses firestore.rules entirely. This route
// switched from the client SDK (lib/firebaseClient.js) because the
// public rules were rejecting server-side reads with "Missing or
// insufficient permissions" — the client SDK always evaluates rules,
// and there's no authenticated user on the server to satisfy them. The
// Admin SDK reads as a trusted backend instead, so no rule changes are
// needed to keep this working. Both collectionGroup() reads below (
// `participants` and `answers`) are bare — no where()/orderBy() — so
// neither needs a composite index.
//
// TIME WINDOW — APPROXIMATE: no document anywhere stores a true "result
// completed at" timestamp. For solo rows this uses the participant's own
// `soloStartedAt` (falling back to `joinTime`) as a stand-in for "when
// this result happened" — that's actually when they started their LAST
// question, not when they finished, so it's approximate the same way the
// rest of this route already documents. For live rows it uses `joinTime`.

import { db } from '../../lib/firebaseAdmin';

const ALLOWED_DAYS = new Set([0, 1, 7, 30, 90]);
const cacheByDays = {};
const TTL = 60 * 1000;

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

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const requestedDays = Number(req.query.days);
  const days = ALLOWED_DAYS.has(requestedDays) ? requestedDays : 0;

  const cached = cacheByDays[days];
  if (cached && Date.now() - cached.at < TTL) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cached.data);
  }

  try {
    const [quizzesSnap, participantsSnap, answersSnap] = await Promise.all([
      db.collection('quizzes').get(),
      db.collectionGroup('participants').get(),
      db.collectionGroup('answers').get(),
    ]);

    // "<quizId>::<participantId>" -> participant fields — built once so the
    // per-quiz loop below is a plain lookup, not a nested query.
    const participantsByKey = {};
    // "<quizId>" -> [participant, ...] — same data, grouped for the solo scan.
    const participantsByQuiz = {};
    participantsSnap.forEach(docSnap => {
      const quizId = docSnap.ref.parent.parent?.id;
      if (!quizId) return;
      const p = docSnap.data();
      const entry = { participantId: docSnap.id, ...p };
      participantsByKey[`${quizId}::${docSnap.id}`] = entry;
      (participantsByQuiz[quizId] = participantsByQuiz[quizId] || []).push(entry);
    });

    // "<quizId>::<participantId>" -> [answer, ...] — every answer doc for
    // that participant on that quiz, used to score finished solo attempts
    // exactly the way computeSoloLeaderboard() does in quiz.js.
    const answersByKey = {};
    answersSnap.forEach(docSnap => {
      const quizId = docSnap.ref.parent.parent?.id;
      if (!quizId) return;
      const a = docSnap.data();
      const pid = a.participantId;
      if (!pid) return;
      const key = `${quizId}::${pid}`;
      (answersByKey[key] = answersByKey[key] || []).push(a);
    });

    const cutoff = days > 0 ? Date.now() - days * 86400000 : 0;
    const live = [];
    const solo = [];
    const quizTitleById = {};

    quizzesSnap.forEach(docSnap => {
      const q = docSnap.data();
      const quizId = q.quizId || docSnap.id;
      const quizTitle = q.title || quizId;
      const totalQuestions = Number(q.totalQuestions) || 0;
      quizTitleById[quizId] = quizTitle;

      // ── Live: read straight from the frozen snapshot ──
      (q.leaderboard || []).forEach(r => {
        const participant = participantsByKey[`${quizId}::${r.participantId}`];
        const timestamp = participant?.joinTime || q.createdAt || '';

        if (cutoff) {
          const ms = timestamp ? Date.parse(timestamp) : 0;
          if (!ms || ms < cutoff) return; // outside the requested window
        }

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

      // ── Solo: never stored — recompute from participants + answers,
      // same as computeSoloLeaderboard() in quiz.js. Only participants who
      // have actually finished every question count; someone partway
      // through their own attempt shouldn't show up with a partial score.
      (participantsByQuiz[quizId] || [])
        .filter(p => p.mode === 'solo' && p.status !== 'left' &&
          totalQuestions > 0 && Number(p.soloQuestionIndex) >= totalQuestions)
        .forEach(p => {
          const timestamp = p.soloStartedAt || p.joinTime || q.createdAt || '';
          if (cutoff) {
            const ms = timestamp ? Date.parse(timestamp) : 0;
            if (!ms || ms < cutoff) return; // outside the requested window
          }

          const mine = answersByKey[`${quizId}::${p.participantId}`] || [];
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
    });

    // Collapse repeat attempts under the same name (same quiz, same mode)
    // down to that name's best attempt before either ranking kicks in, so
    // a retaken quiz can't inflate "overall" with duplicate rows or push
    // someone else out of a per-quiz leaderboard.
    const dedupedLive = dedupeBestPerName(live);
    const dedupedSolo = dedupeBestPerName(solo);

    const payload = {
      live: { overall: rankAndShape(dedupedLive).slice(0, 500), byQuiz: groupByQuiz(dedupedLive) },
      solo: { overall: rankAndShape(dedupedSolo).slice(0, 500), byQuiz: groupByQuiz(dedupedSolo) },
      quizzes: Object.entries(quizTitleById).map(([quizId, title]) => ({ quizId, title })),
    };

    cacheByDays[days] = { data: payload, at: Date.now() };
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(payload);

  } catch (err) {
    console.error('[quiz-leaderboard]', err.message);
    if (cacheByDays[days]) {
      res.setHeader('X-Cache', 'STALE');
      return res.status(200).json(cacheByDays[days].data);
    }
    return res.status(200).json({
      live: { overall: [], byQuiz: {} },
      solo: { overall: [], byQuiz: {} },
      quizzes: [],
      _error: err.message,
    });
  }
}
