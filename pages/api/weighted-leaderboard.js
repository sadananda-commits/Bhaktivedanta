// pages/api/student/weighted-leaderboard.js
//
// ═══════════════════════════════════════════════════════════════════════════
//  WEIGHTED LEADERBOARD — a copy of /api/student/leaderboard, but scoped to
//  only the questions a student was actually *assigned* via the "Assignments
//  for you" tab (ChapterAssignments), and ranked by accuracy % instead of
//  raw points scored.
//  ─────────────────────────────────────────────────────────────────────────
//  Rules (per requirements):
//    a. Only StudentProgress rows that fall inside a range the student was
//       assigned (same StudentID + ModuleID, QuestionNumber between that
//       assignment's FromQuestion..ToQuestion) count toward this board. A
//       student who has never been assigned anything — or who has only
//       answered *un*-assigned questions — never appears here.
//    b. A student needs at least 50 *unique assigned questions attempted*
//       to qualify (MIN_ASSIGNED_ATTEMPTS in Code.gs). Retries of the same
//       question don't count twice toward this threshold. Everyone else is
//       excluded, not just ranked low.
//    c. Sorted by accuracy % (pointsScored / maxPoints), not raw attempted
//       count.
//    d. Points, not questions: a normal question is worth 1 point if the
//       student's latest attempt was correct; a Match-The-Following question
//       is worth one point per correctly matched pair. See
//       aggregatePoints_()/scoreRow_() in Code.gs.
//
//  Same Apps Script web app as leaderboard.js — just a different `action`.
//  Response shape mirrors leaderboard.js exactly: { overall, bySubject }.
//  Row shape mirrors leaderboard.js's rows too (studentId, studentName,
//  pointsScored, maxPoints, correct [legacy alias], accuracy, attempted,
//  lastActivity) so the existing Leaderboard UI components can be reused
//  as-is.
//
//  ?days= selects the time window (0 = all-time, the default) — same
//  accepted set and per-window cache as leaderboard.js.
//
//  Used by: the portal's Leaderboard tab, "Weighted Leaderboard" section.
//
//  ─────────────────────────────────────────────────────────────────────────
//  Code.gs does not currently expose this aggregate in its revamped form —
//  see leaderboard-appsscript-snippet.gs.js for buildWeightedLeaderboard(),
//  aggregatePoints_(), scoreRow_() and the doGet(e) branch that resolves
//  action=weightedLeaderboard&days=N.
// ═══════════════════════════════════════════════════════════════════════════

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

const ALLOWED_DAYS = new Set([0, 1, 7, 30, 90]);
const TTL = 60 * 1000; // 60s per window — same cadence as leaderboard.js

const cacheByDays = {}; // days -> { data, at }

function normalizeDays(raw) {
  const n = parseInt(raw, 10);
  return ALLOWED_DAYS.has(n) ? n : 0;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const days = normalizeDays(req.query.days);
  const entry = cacheByDays[days];

  if (entry && Date.now() - entry.at < TTL) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(entry.data);
  }

  try {
    const r = await fetch(`${SCRIPT_URL}?action=weightedLeaderboard&days=${days}`, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (data.error) throw new Error(data.error);

    const payload = { overall: data.overall || [], bySubject: data.bySubject || {} };
    cacheByDays[days] = { data: payload, at: Date.now() };
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(payload);

  } catch (err) {
    console.error('[student/weighted-leaderboard]', err.message);
    if (entry) { res.setHeader('X-Cache', 'STALE'); return res.status(200).json(entry.data); }
    return res.status(200).json({ overall: [], bySubject: {}, _error: err.message });
  }
}
