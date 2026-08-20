// pages/api/parent/all-students.js
//
// Returns every student account (StudentID, name, class) so the Parent
// Portal's "Add Student" panel can offer a dropdown to pick from, instead
// of (or alongside) typing a Student ID manually.
//
// GET /api/parent/all-students
// Response: { students: [ { studentId, studentName, classLevel }, ... ] }

const SCRIPT_URL = process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

// Cache for 5 minutes — the full student list changes rarely.
let cache = null;
let cacheAt = 0;
const CACHE_TTL = 5 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  if (cache && Date.now() - cacheAt < CACHE_TTL) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cache);
  }

  try {
    const res2 = await fetch(`${SCRIPT_URL}?action=accounts`, { signal: AbortSignal.timeout(12000) });
    const data = await res2.json();
    if (data.error) throw new Error(data.error);

    const students = (data.accounts || []).map(a => ({
      studentId:   a.StudentID  || a.Username || '',
      studentName: a.FullName   || a.Username || a.StudentID || '',
      classLevel:  a.ClassLevel || a.Class    || '',
    })).filter(s => s.studentId);

    const result = { students };
    cache = result; cacheAt = Date.now();
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(result);

  } catch (err) {
    console.error('[parent/all-students]', err.message);
    if (cache) { res.setHeader('X-Cache', 'STALE'); return res.status(200).json(cache); }
    return res.status(200).json({ students: [], _error: err.message });
  }
}
