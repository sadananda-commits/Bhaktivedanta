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
// DATA SOURCE: reads Firestore directly through lib/firebaseClient.js —
// the same public, rules-gated client already used for realtime updates
// elsewhere in the app. firestore.rules allows public read on `quizzes`
// and its `participants` subcollection, so no firebase-admin / service
// account is needed for this route. The `participants` read below is a
// bare `collectionGroup()` call with no where()/orderBy(), so it needs no
// composite index either.
//
// TIME WINDOW — APPROXIMATE: no document anywhere stores a true "result
// completed at" timestamp. The only real per-answer timestamp
// (`answers/{id}.answeredAt`) lives in a subcollection firestore.rules
// explicitly denies public read on, so this route can't see it with the
// client SDK. Instead it uses each participant's `joinTime` (live) or
// `soloStartedAt` (solo) as a stand-in for "when this result happened" —
// accurate for live quizzes (joining and playing happen back-to-back), only
// approximate for self-paced ones (a player can keep going for a while
// after joining). If exact per-result timestamps ever matter enough to be
// worth it, this route would need to move to lib/firebaseAdmin.js so it
// can read `answers` too.

import { collection, collectionGroup, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebaseClient';

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
  rows.forEach(r => { (groups[r.quizTitle] = groups[r.quizTitle] || []).push(r); });
  Object.keys(groups).forEach(k => { groups[k] = rankAndShape(groups[k]); });
  return groups;
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
      getDocs(collection(db, 'quizzes')),
      getDocs(collectionGroup(db, 'participants')),
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

    const payload = {
      live: { overall: rankAndShape(live).slice(0, 500), byQuiz: groupByQuiz(live) },
      solo: { overall: rankAndShape(solo).slice(0, 500), byQuiz: groupByQuiz(solo) },
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
