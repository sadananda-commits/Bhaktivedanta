// pages/api/portal-stats.js
// Aggregates everything index.js's "Home Page Dashboard" section (Req #8)
// needs, from two sources:
//   1. Script 1 (Vedanta Academy Students sheet) via ?action=portalStats — total
//      students, total questions attempted/correct, recent activity feed.
//   2. The same public question-bank CSV sheets portal-config.js already
//      reads — just to count total questions available across all subjects.
//   3. Script 1's ?action=leaderboard — for Top Performers (overall +
//      per-subject champions), reusing the same aggregation the portal's
//      own Leaderboard tab uses.
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

let cache   = null;
let cacheAt = 0;
const TTL   = 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  if (cache && Date.now() - cacheAt < TTL) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cache);
  }

  try {
    const [statsRes, leaderboardRes, questionCounts, topicCounts] = await Promise.all([
      fetch(`${SCRIPT_URL}?action=portalStats`, { signal: AbortSignal.timeout(12000) }),
      fetch(`${SCRIPT_URL}?action=leaderboard`, { signal: AbortSignal.timeout(12000) }),
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

    cache = {
      totalStudents:           stats.totalStudents || 0,
      totalQuestionsAvailable: totalQuestionsAvailable,
      totalQuestionsAttempted: stats.totalQuestionsAttempted || 0,
      totalCorrectAnswers:     stats.totalCorrectAnswers || 0,
      totalSubjectsAvailable:  totalSubjectsAvailable,
      totalTopicsAvailable:    totalTopicsAvailable,
      topPerformers,
      // Full ranked list (not just the top performer) — backs the home
      // page's "Top Students" leaderboard table (Req #7): rank, student,
      // questions attempted, accuracy. Capped at 50 here; the table itself
      // paginates client-side from this array so there's no need for the
      // client to request more than one page of raw data.
      leaderboardOverall: overall.slice(0, 50),
      recentActivity: stats.recentActivity || [],
    };
    cacheAt = Date.now();
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(cache);

  } catch (err) {
    console.error('[portal-stats]', err.message);
    if (cache) { res.setHeader('X-Cache', 'STALE'); return res.status(200).json(cache); }
    return res.status(200).json({
      totalStudents: 0, totalQuestionsAvailable: 0, totalQuestionsAttempted: 0,
      totalCorrectAnswers: 0, totalSubjectsAvailable: 0, totalTopicsAvailable: 0,
      topPerformers: { overall: null, bySubject: {} }, leaderboardOverall: [], recentActivity: [],
      _error: err.message,
    });
  }
}
