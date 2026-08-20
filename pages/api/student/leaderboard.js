// pages/api/student/leaderboard.js
// Reads the pre-aggregated leaderboard (overall + per-subject rankings)
// computed server-side by Code.gs's buildLeaderboard(). Same Apps Script
// web app as enroll.js/auth.js — just a different `action` query param.
//
// Rows are points-based and de-duplicated to one entry per unique question
// (retries don't inflate the count or the score) — see
// buildLeaderboard()/aggregatePoints_() in Code.gs for the aggregation
// rules, and pointsScored/maxPoints/accuracy in the row shape below.
//
// ?days= selects the time window (0 = all-time, the default). Only a small
// fixed set of windows is accepted — anything else falls back to 0 — since
// each distinct value is cached separately server-side.
//
// Used by: the portal's Leaderboard tab (time-filter pills), and the home
// page's "Top Performers" section (index.js, always requests all-time).

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

const ALLOWED_DAYS = new Set([0, 1, 7, 30, 90]);
const TTL = 60 * 1000; // 60s per window — leaderboard doesn't need to feel instant

// Cache is keyed by day-window since each window is a genuinely different
// aggregate (not just a client-side filter of the same data anymore).
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
    const r = await fetch(`${SCRIPT_URL}?action=leaderboard&days=${days}`, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (data.error) throw new Error(data.error);

    const payload = { overall: data.overall || [], bySubject: data.bySubject || {} };
    cacheByDays[days] = { data: payload, at: Date.now() };
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(payload);

  } catch (err) {
    console.error('[student/leaderboard]', err.message);
    if (entry) { res.setHeader('X-Cache', 'STALE'); return res.status(200).json(entry.data); }
    return res.status(200).json({ overall: [], bySubject: {}, _error: err.message });
  }
}
