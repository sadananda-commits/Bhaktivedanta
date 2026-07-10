// pages/api/parent/update-assignment.js
//
// Parent/teacher edits an existing row in the Chapter Assignments table
// (My Students → Assignments → Chapter Assignments). Forwards to the Apps
// Script action=updateChapterAssignment, which finds the row by
// AssignmentID and overwrites its editable fields in place — Status and
// CreatedDate are left untouched so editing a chapter assignment doesn't
// reset a student's progress on it or its original creation timestamp.
//
// PUT /api/parent/update-assignment
// Body: { assignmentId, studentId, studentName, classLevel, subject,
//         moduleId, chapterTitle, fromQuestion, toQuestion,
//         totalQuestions, assignedDate, comments, updatedBy }
// Response: { success: true, assignment: {...} } or { success:false, message }
//
// NOTE: this requires a matching `action=updateChapterAssignment` case to
// be added to Code.gs (Apps Script) — see WIRING_ASSIGNMENT_EDIT_DELETE.md
// for the expected shape. Without that, this route will reach the script
// but get an "unknown action" style error back.

const SCRIPT_URL = process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

export default async function handler(req, res) {
  if (req.method !== 'PUT' && req.method !== 'POST') return res.status(405).end();

  const {
    assignmentId, studentId, studentName, classLevel, subject, moduleId, chapterTitle,
    fromQuestion, toQuestion, totalQuestions, assignedDate, comments, updatedBy,
  } = req.body || {};

  if (!assignmentId) {
    return res.status(400).json({ success: false, message: 'assignmentId is required.' });
  }
  if (!studentId || !subject || !moduleId || !fromQuestion || !toQuestion) {
    return res.status(400).json({
      success: false,
      message: 'studentId, subject, moduleId, fromQuestion and toQuestion are required.',
    });
  }

  try {
    const url = `${SCRIPT_URL}?action=updateChapterAssignment`;
    const r = await fetch(url, {
      method: 'POST', // Apps Script web apps only accept GET/POST — action is chosen by the `action` query param, not the HTTP verb
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assignmentId, studentId, studentName, classLevel, subject, moduleId, chapterTitle,
        fromQuestion, toQuestion, totalQuestions, assignedDate, comments, updatedBy,
      }),
      signal: AbortSignal.timeout(12000),
    });
    const raw = await r.text();
    const data = JSON.parse(raw);
    if (data.error) throw new Error(data.error);
    return res.status(200).json(data);

  } catch (err) {
    console.error('[parent/update-assignment]', err.message);
    return res.status(503).json({ success: false, message: 'Could not update the assignment. Please try again.' });
  }
}
