// pages/api/quiz-leaderboard.js
//
// Aggregates every Online Quiz's own `leaderboard` array (Firestore
// quizzes/{quizId}.leaderboard — see the fields dump you shared for DAY1)
// into one cross-quiz leaderboard, split into Live and Self-Paced ("solo")
// sections — the same split OnlineQuizHost.js's own Final Results screen
// already uses (`r.mode !== 'solo'` vs `r.mode === 'solo'`). This route
// doesn't recompute any scores — it only reads and regroups what each
// quiz doc already has, then merges across quizzes and re-ranks.
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
// needed to keep this working. The `participants` read below is a bare
// collectionGroup() call with no where()/orderBy(), so it needs no
// composite index.
//
// TIME WINDOW — APPROXIMATE: no document anywhere stores a true "result
// completed at" timestamp. The only real per-answer timestamp
// (`answers/{id}.answeredAt`) lives in a subcollection this route still
// doesn't read from (to keep the query cheap), so it uses each
// participant's `joinTime` (live) or `soloStartedAt` (solo) as a
// stand-in for "when this result happened" — accurate for live quizzes
// (joining and playing happen back-to-back), only approximate for
// self-paced ones (a player can keep going for a while after joining).
// Now that this route is on the Admin SDK, reading `answers` directly
// for exact per-result timestamps is possible if that precision is ever
// worth the extra read.

import { db } from '../../lib/firebaseAdmin';

const ALLOWED_DAYS = new Set([0, 1, 7, 30, 90]);
const cacheByDays = {};
const TTL = 60 * 1000;

// Same tie-break endQuiz_ used in the pre-Firebase Apps Script version:
// higher score wins; ties go to whoever answered faster on average.
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
    const [quizzesSnap, participantsSnap] = await Promise.all([
      db.collection('quizzes').get(),
      db.collectionGroup('participants').get(),
    ]);

    // "<quizId>::<participantId>" -> { mode, timestamp } — built once so the
    // per-leaderboard-row loop below is a plain lookup, not a nested query.
    const participantMeta = {};
    participantsSnap.forEach(docSnap => {
      const quizId = docSnap.ref.parent.parent?.id;
      if (!quizId) return;
      const p = docSnap.data();
      const mode = p.mode === 'solo' ? 'solo' : 'live';
      const timestamp = mode === 'solo' ? (p.soloStartedAt || p.joinTime) : p.joinTime;
      participantMeta[`${quizId}::${docSnap.id}`] = { mode, timestamp: timestamp || '' };
    });

    const cutoff = days > 0 ? Date.now() - days * 86400000 : 0;
    const live = [];
    const solo = [];
    const quizTitleById = {};

    quizzesSnap.forEach(docSnap => {
      const q = docSnap.data();
      const quizId = q.quizId || docSnap.id;
      const quizTitle = q.title || quizId;
      quizTitleById[quizId] = quizTitle;

      (q.leaderboard || []).forEach(r => {
        const meta = participantMeta[`${quizId}::${r.participantId}`];
        const mode = (r.mode === 'solo' || meta?.mode === 'solo') ? 'solo' : 'live';
        const timestamp = meta?.timestamp || q.createdAt || '';

        if (cutoff) {
          const ms = timestamp ? Date.parse(timestamp) : 0;
          if (!ms || ms < cutoff) return; // outside the requested window
        }

        const correct = r.correctAnswers ?? 0;
        const incorrect = r.incorrectAnswers ?? 0;
        const attempted = correct + incorrect;

        const row = {
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
        };
        (mode === 'solo' ? solo : live).push(row);
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
