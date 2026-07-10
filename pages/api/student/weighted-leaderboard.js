// pages/api/student/weighted-leaderboard.js
//
// ═══════════════════════════════════════════════════════════════════════════
//  WEIGHTED LEADERBOARD — a copy of /api/student/leaderboard, but scoped to
//  only the questions a student was actually *assigned* via the "Assignments
//  for you" tab (ChapterAssignments), and ranked by accuracy % instead of
//  raw questions-attempted.
//  ─────────────────────────────────────────────────────────────────────────
//  Rules (per requirements):
//    a. Only StudentProgress rows that fall inside a range the student was
//       assigned (same StudentID + ModuleID, QuestionNumber between that
//       assignment's FromQuestion..ToQuestion) count toward this board. A
//       student who has never been assigned anything — or who has only
//       answered *un*-assigned questions — never appears here.
//    b. A student needs at least 50 *assigned* questions attempted to
//       qualify (MIN_ASSIGNED_ATTEMPTS below). Everyone else is excluded,
//       not just ranked low.
//    c. Sorted by accuracy % (correct / attempted), not attempted count.
//
//  Same Apps Script web app as leaderboard.js — just a different `action`.
//  Response shape mirrors leaderboard.js exactly: { overall, bySubject }.
//  Row shape mirrors leaderboard.js's rows too (studentId, studentName,
//  correct, accuracy, attempted, lastActivity) so the existing Leaderboard
//  UI components can be reused as-is.
//
//  Used by: the portal's Leaderboard tab, "Weighted Leaderboard" section.
//
//  ─────────────────────────────────────────────────────────────────────────
//  APPS_SCRIPT_SNIPPET — Code.gs does not currently expose this aggregate.
//  Paste this alongside the existing buildLeaderboard() function, and add
//  the doGet(e) branch below it, so action=weightedLeaderboard resolves.
//
//  function buildWeightedLeaderboard() {
//    const ss  = SpreadsheetApp.openById('YOUR_STUDENTS_SHEET_ID');
//    const caSheet = ss.getSheetByName('ChapterAssignments');
//    const spSheet = ss.getSheetByName('StudentProgress');
//    if (!caSheet || !spSheet) return { overall: [], bySubject: {} };
//
//    const MIN_ASSIGNED_ATTEMPTS = 50;
//
//    // ── 1. Build per-student assigned ranges: {moduleId, from, to, subject}
//    const caRows = caSheet.getDataRange().getValues();
//    const caHead = caRows.shift();
//    const ci = h => caHead.indexOf(h);
//    const assignedRanges = {}; // studentId -> [ {moduleId, from, to, subject} ]
//    caRows.forEach(row => {
//      const studentId = row[ci('StudentID')];
//      if (!studentId) return;
//      (assignedRanges[studentId] = assignedRanges[studentId] || []).push({
//        moduleId: String(row[ci('ModuleID')]),
//        from:     Number(row[ci('FromQuestion')]) || 0,
//        to:       Number(row[ci('ToQuestion')])   || 0,
//        subject:  row[ci('Subject')],
//      });
//    });
//
//    // ── 2. Walk StudentProgress, keep only rows matching an assigned range
//    const spRows = spSheet.getDataRange().getValues();
//    const spHead = spRows.shift();
//    const si = h => spHead.indexOf(h);
//    const agg = {}; // studentId -> { studentName, attempted, correct, lastActivity, bySubject }
//    spRows.forEach(row => {
//      const studentId = row[si('StudentID')];
//      const ranges = assignedRanges[studentId];
//      if (!studentId || !ranges) return; // never assigned anything -> excluded
//
//      const moduleId = String(row[si('ModuleID')]);
//      const qNum     = Number(row[si('QuestionNumber')]) || 0;
//      const inRange  = ranges.some(r => r.moduleId === moduleId && qNum >= r.from && qNum <= r.to);
//      if (!inRange) return;
//
//      const status    = String(row[si('Status')] || '').trim().toLowerCase();
//      const subject   = row[si('Subject')];
//      const timestamp = row[si('Timestamp')] || row[si('Date')];
//
//      if (!agg[studentId]) {
//        agg[studentId] = {
//          studentId, studentName: row[si('StudentName')] || '',
//          attempted: 0, correct: 0, lastActivity: null, bySubject: {},
//        };
//      }
//      const a = agg[studentId];
//      a.attempted++;
//      if (status === 'correct') a.correct++;
//      if (timestamp && (!a.lastActivity || new Date(timestamp) > new Date(a.lastActivity))) a.lastActivity = timestamp;
//
//      if (subject) {
//        const bs = a.bySubject[subject] = a.bySubject[subject] || { attempted: 0, correct: 0, lastActivity: null };
//        bs.attempted++;
//        if (status === 'correct') bs.correct++;
//        if (timestamp && (!bs.lastActivity || new Date(timestamp) > new Date(bs.lastActivity))) bs.lastActivity = timestamp;
//      }
//    });
//
//    // ── 3. Filter by MIN_ASSIGNED_ATTEMPTS, compute accuracy, sort desc
//    const toRow = (studentId, name, stats) => ({
//      studentId, studentName: name,
//      attempted: stats.attempted, correct: stats.correct,
//      accuracy: stats.attempted ? Math.round((stats.correct / stats.attempted) * 100) : 0,
//      lastActivity: stats.lastActivity,
//    });
//
//    const overall = Object.values(agg)
//      .filter(a => a.attempted >= MIN_ASSIGNED_ATTEMPTS)
//      .map(a => toRow(a.studentId, a.studentName, a))
//      .sort((x, y) => y.accuracy - x.accuracy || y.correct - x.correct);
//
//    const bySubject = {};
//    Object.values(agg).forEach(a => {
//      Object.entries(a.bySubject).forEach(([subject, bs]) => {
//        if (bs.attempted < MIN_ASSIGNED_ATTEMPTS) return;
//        (bySubject[subject] = bySubject[subject] || []).push(toRow(a.studentId, a.studentName, bs));
//      });
//    });
//    Object.keys(bySubject).forEach(s => {
//      bySubject[s].sort((x, y) => y.accuracy - x.accuracy || y.correct - x.correct);
//    });
//
//    return { overall, bySubject };
//  }
//
//  // In doGet(e), alongside the existing `action === 'leaderboard'` branch:
//  if (e.parameter.action === 'weightedLeaderboard') {
//    return ContentService.createTextOutput(JSON.stringify(buildWeightedLeaderboard()))
//      .setMimeType(ContentService.MimeType.JSON);
//  }
// ═══════════════════════════════════════════════════════════════════════════

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

let cache   = null;
let cacheAt = 0;
const TTL   = 60 * 1000; // 60s — same cadence as leaderboard.js

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  if (cache && Date.now() - cacheAt < TTL) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cache);
  }

  try {
    const r = await fetch(`${SCRIPT_URL}?action=weightedLeaderboard`, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (data.error) throw new Error(data.error);

    cache   = { overall: data.overall || [], bySubject: data.bySubject || {} };
    cacheAt = Date.now();
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(cache);

  } catch (err) {
    console.error('[student/weighted-leaderboard]', err.message);
    if (cache) { res.setHeader('X-Cache', 'STALE'); return res.status(200).json(cache); }
    return res.status(200).json({ overall: [], bySubject: {}, _error: err.message });
  }
}
