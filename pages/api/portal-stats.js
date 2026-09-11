// pages/api/portal-stats.js
// Aggregates everything index.js's "Home Page Dashboard" section (Req #8)
// needs, from two sources:
//   1. Script 1 (Vedanta Academy Students sheet) via ?action=portalStats — total
//      students, total questions attempted/correct, recent activity feed.
//   2. The same public question-bank CSV sheets portal-config.js already
//      reads — just to count total questions available across all subjects.
//   3. Script 1's ?action=leaderboard&days=0 — for Top Performers (overall +
//      per-subject champions), reusing the same points-based, de-duplicated
//      aggregation the portal's own Leaderboard tab uses. days=0 = all-time,
//      matching this page's "all-time top performers" framing. Rows carry
//      `pointsScored`/`maxPoints`/`accuracy` (see leaderboard.js); `correct`
//      is kept only as a legacy alias of `pointsScored`.
//
// This is a public, unauthenticated route (it backs the public home page),
// so it deliberately returns only counts/rankings — never anything that
// could expose what a specific student got wrong on a specific question.

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

// Same question-bank sheet IDs as portal-config.js — kept in sync manually;
// if you add a new subject there, mirror it here too so "Total Questions
// Available" stays accurate.
const SHEETS = {
  master: '1DRrtTtWsUNH38LOPuVNa4B9bHKXkRK1UccV3WMT2fx0',
  subjects: {
    'Mathematics':       '1pNLKtuG90F28NyLBjz53NK8Nl8I9kC18UwRyA8EZ8tU',
    'Science':           '13zZy6TdtTFHh0aGEIF3T2Hw_dC4sDi6yVABI5qbcUrY',
    'English Grammar':   '1rsoL-ZBgcejtefzZ1KjR2DRcyxMhSVbwgO7Mu6IC65U',
    'Social Studies':    '1H4tLGOZBXWNeQbXAtlCtSktMvzwcEdwmiEvQpyD9xqs',
    'General Knowledge': '1AcPo8DPmZYJeno3kYTgvPO2sS8GcEQJX6guDLJ3qfWA',
    'Artificial Intelegence': '1GL0oIaFc3TnyTrMIZmqpWTBrYfb-Me8k5X8WwZKCE2I',
  },
};

const CSV_URL = (sheetId, tabName) =>
  `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\r') { /* skip */ }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// We only need a row *count* here (minus the header), not full objects —
// counting non-blank data rows is enough for "Total Questions Available".
function countDataRows(csvRows) {
  if (csvRows.length <= 1) return 0;
  return csvRows.slice(1).filter(r => r.some(c => (c || '').trim() !== '')).length;
}

async function countQuestionsInTab(sheetId, tabName) {
  try {
    const res = await fetch(CSV_URL(sheetId, tabName));
    if (!res.ok) return 0;
    // Same UTF-8 decoding fix as portal-config.js's fetchTab() — see the
    // comment there for why res.text() alone isn't reliable here.
    const buf  = await res.arrayBuffer();
    const text = new TextDecoder('utf-8').decode(buf);
    if (text.trimStart().startsWith('<')) return 0; // not shared / wrong tab name
    return countDataRows(parseCSV(text));
  } catch {
    return 0;
  }
}

// Cache is keyed BY `days` — it used to be a single shared object, which
// meant the first request with any ?days= value would get cached and then
// served back to every other caller regardless of what they asked for
// (including the home page's own all-time stats). Each day-window now gets
// its own cache slot so /leaderboard's Window filter (Today/7d/30d/90d/All
// time) and the home page's unscoped call never clobber each other.
// Restricted to the same allowed windows the leaderboard endpoint uses —
// anything else collapses to all-time so this object can't grow unbounded
// from arbitrary query values.
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
    const [statsRes, leaderboardRes, questionCounts, topicCounts] = await Promise.all([
      // `days` scopes portalStats' resultsByDate/questions-attempted feed —
      // this is the only one of these four calls the Window filter affects.
      fetch(`${SCRIPT_URL}?action=portalStats&days=${days}`, { signal: AbortSignal.timeout(12000) }),
      // Top Performers / Top Students stay all-time regardless of `days` —
      // that section is deliberately framed as an all-time honor roll, not
      // something the Window filter should reshuffle.
      fetch(`${SCRIPT_URL}?action=leaderboard&days=0`, { signal: AbortSignal.timeout(12000) }),
      Promise.all(Object.keys(SHEETS.subjects).map(name => countQuestionsInTab(SHEETS.subjects[name], 'Learning Steps'))),
      // Total Topics Available (Req #6) — same per-subject sheets, just the
      // Learning Modules tab (one row per topic) instead of Learning Steps
      // (one row per question).
      Promise.all(Object.keys(SHEETS.subjects).map(name => countQuestionsInTab(SHEETS.subjects[name], 'Learning Modules'))),
    ]);

    const stats       = statsRes.ok ? await statsRes.json() : {};
    const leaderboard = leaderboardRes.ok ? await leaderboardRes.json() : {};
    if (stats.error) throw new Error(stats.error);

    const totalQuestionsAvailable = questionCounts.reduce((sum, n) => sum + n, 0);
    const totalTopicsAvailable    = topicCounts.reduce((sum, n) => sum + n, 0);
    const totalSubjectsAvailable  = Object.keys(SHEETS.subjects).length;

    const overall = leaderboard.overall || [];
    const bySubject = leaderboard.bySubject || {};
    const topPerformers = {
      overall: overall[0] || null,
      bySubject: Object.fromEntries(
        Object.entries(bySubject).map(([subject, rows]) => [subject, rows[0] || null])
      ),
    };

    const payload = {
      totalStudents:           stats.totalStudents || 0,
      totalQuestionsAvailable: totalQuestionsAvailable,
      totalQuestionsAttempted: stats.totalQuestionsAttempted || 0,
      totalCorrectAnswers:     stats.totalCorrectAnswers || 0,
      totalSubjectsAvailable:  totalSubjectsAvailable,
      totalTopicsAvailable:    totalTopicsAvailable,
      topPerformers,
      // Full ranked list (not just the top performer) — backs the home
      // page's "Top Students" leaderboard table (Req #7): rank, student,
      // points scored, accuracy. Capped at 50 here; the table itself
      // paginates client-side from this array so there's no need for the
      // client to request more than one page of raw data.
      leaderboardOverall: overall.slice(0, 50),
      recentActivity: stats.recentActivity || [],
      // NEW — real per-date quiz results (score, points, accuracy), scoped
      // to the requested `days` window. Backs /leaderboard's "Results By
      // Date" tab. Passed through as-is from the Apps Script response.
      resultsByDate: stats.resultsByDate || [],
    };
    cacheByDays[days] = { data: payload, at: Date.now() };
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(payload);

  } catch (err) {
    console.error('[portal-stats]', err.message);
    if (cacheByDays[days]) { res.setHeader('X-Cache', 'STALE'); return res.status(200).json(cacheByDays[days].data); }
    return res.status(200).json({
      totalStudents: 0, totalQuestionsAvailable: 0, totalQuestionsAttempted: 0,
      totalCorrectAnswers: 0, totalSubjectsAvailable: 0, totalTopicsAvailable: 0,
      topPerformers: { overall: null, bySubject: {} }, leaderboardOverall: [], recentActivity: [], resultsByDate: [],
      _error: err.message,
    });
  }
}
