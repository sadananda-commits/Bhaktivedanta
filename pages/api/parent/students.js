// pages/api/parent/students.js
//
// Returns the progress history for every student a parent/teacher is
// authorized to view, plus each student's basic account details. This is
// the single data-fetch that backs the entire Parent-Teacher Portal
// dashboard — one call returns everything the frontend needs.
//
// POST /api/parent/students
// Body: { linkedStudentIDs: ["APX123", "APX456"] }
//       or { linkedStudentIDs: ["*"] } for a teacher who sees all students
//
// Response shape:
// {
//   students: [
//     {
//       studentId:   "APX262834",
//       studentName: "Rohan Sharma",
//       classLevel:  "Class 3",
//       progress: [   // raw StudentProgress rows
//         { Subject, Topic, ModuleID, QuestionNumber, AnswerGiven,
//           CorrectAnswer, Status, Date, Timestamp }, ...
//       ]
//     }, ...
//   ]
// }

const SCRIPT_URL = process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

// Light cache: 2 minutes. Parents refreshing frequently shouldn't hammer
// the Apps Script quota, but data should feel reasonably live.
const CACHE = {};       // key: sorted studentIds joined → { data, at }
const CACHE_TTL = 2 * 60 * 1000;

async function fetchStudentList() {
  // Re-uses the existing ?action=accounts response which already returns all
  // student rows (same endpoint student auth uses). We parse out the fields
  // we need (StudentID, Username→displayName, ClassLevel).
  const res  = await fetch(`${SCRIPT_URL}?action=accounts`, { signal: AbortSignal.timeout(12000) });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return (data.accounts || []).map(a => ({
    studentId:   a.StudentID  || a.Username || '',
    studentName: a.FullName   || a.Username || a.StudentID || '',
    classLevel:  a.ClassLevel || a.Class    || '',
  }));
}

async function fetchProgressForStudent(studentId) {
  const url = `${SCRIPT_URL}?action=progress&studentId=${encodeURIComponent(studentId)}`;
  const res  = await fetch(url, { signal: AbortSignal.timeout(12000) });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.progress || [];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { linkedStudentIDs = [] } = req.body || {};

  if (!Array.isArray(linkedStudentIDs) || linkedStudentIDs.length === 0)
    return res.status(400).json({ students: [], message: 'linkedStudentIDs is required.' });

  const cacheKey = [...linkedStudentIDs].sort().join(',');
  if (CACHE[cacheKey] && Date.now() - CACHE[cacheKey].at < CACHE_TTL) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(CACHE[cacheKey].data);
  }

  try {
    // 1. Get all student accounts to resolve names/class levels
    const allStudents = await fetchStudentList();

    // 2. Determine which student IDs to fetch
    const seeAll = linkedStudentIDs.includes('*');
    const targets = seeAll
      ? allStudents
      : allStudents.filter(s => linkedStudentIDs.includes(s.studentId));

    if (targets.length === 0) {
      return res.status(200).json({ students: [], _note: 'No matching students found for linked IDs.' });
    }

    // 3. Fetch progress and assignments for each target student in parallel
    const [progressResults, assignmentResults] = await Promise.all([
      Promise.allSettled(targets.map(s => fetchProgressForStudent(s.studentId))),
      Promise.allSettled(targets.map(async s => {
        try {
          const url  = `${SCRIPT_URL}?action=assignments&studentId=${encodeURIComponent(s.studentId)}`;
          const r    = await fetch(url, { signal: AbortSignal.timeout(10000) });
          const data = await r.json();
          return data.assignments || [];
        } catch { return []; }
      })),
    ]);

    const students = targets.map((s, i) => ({
      ...s,
      progress:    progressResults[i].status === 'fulfilled'    ? progressResults[i].value    : [],
      assignments: assignmentResults[i].status === 'fulfilled'  ? assignmentResults[i].value  : [],
    }));

    const result = { students };
    CACHE[cacheKey] = { data: result, at: Date.now() };
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(result);

  } catch (err) {
    console.error('[parent/students]', err.message);
    if (CACHE[cacheKey]) {
      res.setHeader('X-Cache', 'STALE');
      return res.status(200).json(CACHE[cacheKey].data);
    }
    return res.status(200).json({ students: [], _error: err.message });
  }
}
