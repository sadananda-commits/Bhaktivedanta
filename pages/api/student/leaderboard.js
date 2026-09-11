// pages/api/student/leaderboard.js
// Proxies the Apps Script's `?action=leaderboard&days=N` action and returns
// its { overall, bySubject } shape as-is — this is the ranked-table data
// source for pages/leaderboard.js (public Community Leaderboard) and is
// also what a logged-in Student Dashboard leaderboard tab should call.
//
// This file was missing from the deploy, which is why /leaderboard's ranked
// table stopped loading (fetch('/api/student/leaderboard?...') 404'd,
// r.json() threw on the HTML error body, and the page fell into dataErr).
// portal-stats.js already calls the same Apps Script action, but only to
// grab overall[0]/bySubject[x][0] for the home page's "Top Performers"
// summary — it never exposed the full ranked list at this path.
//
// Same SCRIPT_URL, same ALLOWED_DAYS window, and the same per-days cache
// pattern as portal-stats.js — kept in sync manually if the deployment URL
// ever changes.

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

const ALLOWED_DAYS = new Set([0, 1, 7, 30, 90]);
const cacheByDays = {};
const TTL = 60 * 1000;

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
    const scriptRes = await fetch(`${SCRIPT_URL}?action=leaderboard&days=${days}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (!scriptRes.ok) throw new Error(`HTTP ${scriptRes.status}`);

    const data = await scriptRes.json();
    if (data.error) throw new Error(data.error);

    const payload = {
      overall:   data.overall || [],
      bySubject: data.bySubject || {},
    };

    cacheByDays[days] = { data: payload, at: Date.now() };
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(payload);

  } catch (err) {
    console.error('[student/leaderboard]', err.message);
    if (cacheByDays[days]) {
      res.setHeader('X-Cache', 'STALE');
      return res.status(200).json(cacheByDays[days].data);
    }
    return res.status(200).json({ overall: [], bySubject: {}, _error: err.message });
  }
}
