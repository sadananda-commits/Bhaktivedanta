// pages/api/student/assignments.js
//
// Returns the real assignment records for a specific student from the
// Assignments tab in the Vedanta Academy Students Sheet.
//
// The Apps Script handler for action=assignments should read the
// Assignments tab, filter rows where StudentID matches, and return:
//   { assignments: [ { AssignmentID, StudentID, Subject, Title, Description,
//                       DueDate, Status, Grade, Difficulty, ClassLevel,
//                       TeacherNotes, CreatedDate }, ... ] }
//
// Expected Assignments tab columns:
//   AssignmentID | StudentID | Subject | Title | Description | DueDate |
//   Status       | Grade     | Difficulty | ClassLevel | TeacherNotes |
//   CreatedDate
//
// Status values: Not Started | In Progress | Completed | Overdue
// Difficulty:    Beginner | Intermediate | Advanced
// (The client computes 'Overdue' from DueDate < today if Status is still
//  "Not Started" or "In Progress", so teachers don't need to keep this
//  field up-to-date manually.)

const SCRIPT_URL = process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

// Short cache: 90s — assignments change infrequently within a session, but
// a teacher posting a new one should show within 2 minutes.
const cache = {};
const CACHE_TTL = 90 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { studentId } = req.query;
  if (!studentId) return res.status(400).json({ assignments: [], message: 'studentId is required.' });

  const cacheKey = `assignments:${studentId}`;
  if (cache[cacheKey] && Date.now() - cache[cacheKey].at < CACHE_TTL) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cache[cacheKey].data);
  }

  try {
    const url  = `${SCRIPT_URL}?action=assignments&studentId=${encodeURIComponent(studentId)}`;
    const r    = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (data.error) throw new Error(data.error);

    const result = { assignments: data.assignments || [] };
    cache[cacheKey] = { data: result, at: Date.now() };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(result);

  } catch (err) {
    console.error('[student/assignments]', err.message);
    // Return stale cache rather than failing silently — the UI handles
    // empty gracefully, but stale data is better than a blank screen.
    if (cache[cacheKey]) {
      res.setHeader('X-Cache', 'STALE');
      return res.status(200).json(cache[cacheKey].data);
    }
    return res.status(200).json({ assignments: [], _error: err.message });
  }
}
