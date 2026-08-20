// pages/api/student/chapter-assignments.js
//
// Returns the chapter-specific assignments a parent/teacher has assigned to
// this student (the "Assignments for you" tab in the Student Portal) —
// backed by the ChapterAssignments tab in the same Google Sheet, via the
// Apps Script action=chapterAssignments.
//
// GET /api/student/chapter-assignments?studentId=APX262834
// Response: { assignments: [ { AssignmentID, StudentID, StudentName,
//             ClassLevel, Subject, ModuleID, ChapterTitle, FromQuestion,
//             ToQuestion, TotalQuestions, AssignedDate, Comments, Status,
//             CreatedBy, CreatedDate, CompletedDate }, ... ] }

const SCRIPT_URL = process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

// Short cache — a parent assigning a new chapter should show up for the
// student within a couple of minutes, same pattern as student/assignments.js.
const cache = {};
const CACHE_TTL = 90 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { studentId } = req.query;
  if (!studentId) return res.status(400).json({ assignments: [], message: 'studentId is required.' });

  const cacheKey = `chapterAssignments:${studentId}`;
  if (cache[cacheKey] && Date.now() - cache[cacheKey].at < CACHE_TTL) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cache[cacheKey].data);
  }

  try {
    const url = `${SCRIPT_URL}?action=chapterAssignments&studentId=${encodeURIComponent(studentId)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (data.error) throw new Error(data.error);

    const result = { assignments: data.assignments || [] };
    cache[cacheKey] = { data: result, at: Date.now() };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(result);

  } catch (err) {
    console.error('[student/chapter-assignments]', err.message);
    if (cache[cacheKey]) {
      res.setHeader('X-Cache', 'STALE');
      return res.status(200).json(cache[cacheKey].data);
    }
    return res.status(200).json({ assignments: [], _error: err.message });
  }
}
