// pages/api/student/leaderboard.js
// Reads the pre-aggregated leaderboard (overall + per-subject rankings)
// computed server-side by Code.gs's buildLeaderboard(). Same Apps Script
// web app as enroll.js/auth.js — just a different `action` query param.
//
// Used by: the portal's Leaderboard tab, and the home page's "Top Performers"
// section (index.js).

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

let cache   = null;
let cacheAt = 0;
const TTL   = 60 * 1000; // 60s — leaderboard doesn't need to feel instant

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  if (cache && Date.now() - cacheAt < TTL) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cache);
  }

  try {
    const r = await fetch(`${SCRIPT_URL}?action=leaderboard`, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (data.error) throw new Error(data.error);

    cache   = { overall: data.overall || [], bySubject: data.bySubject || {} };
    cacheAt = Date.now();
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(cache);

  } catch (err) {
    console.error('[student/leaderboard]', err.message);
    if (cache) { res.setHeader('X-Cache', 'STALE'); return res.status(200).json(cache); }
    return res.status(200).json({ overall: [], bySubject: {}, _error: err.message });
  }
}
