// pages/api/parent/create-assignment.js
//
// Parent/teacher submits the "assign a chapter" builder form from the
// Parent Portal's My Students → Assignments tab. Forwards to the Apps
// Script action=createChapterAssignment, which appends one row to the
// ChapterAssignments tab (one row per chapter assigned) with Status
// defaulted to "Task assigned".
//
// POST /api/parent/create-assignment
// Body: { studentId, studentName, classLevel, subject, moduleId,
//         chapterTitle, fromQuestion, toQuestion, totalQuestions,
//         assignedDate, comments, createdBy }
// Response: { success: true, assignment: {...} } or { success:false, message }

const SCRIPT_URL = process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    studentId, studentName, classLevel, subject, moduleId, chapterTitle,
    fromQuestion, toQuestion, totalQuestions, assignedDate, comments, createdBy,
  } = req.body || {};

  if (!studentId || !subject || !moduleId || !fromQuestion || !toQuestion) {
    return res.status(400).json({
      success: false,
      message: 'studentId, subject, moduleId, fromQuestion and toQuestion are required.',
    });
  }

  try {
    const url = `${SCRIPT_URL}?action=createChapterAssignment`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId, studentName, classLevel, subject, moduleId, chapterTitle,
        fromQuestion, toQuestion, totalQuestions, assignedDate, comments, createdBy,
      }),
      signal: AbortSignal.timeout(12000),
    });
    const raw = await r.text();
    const data = JSON.parse(raw);
    if (data.error) throw new Error(data.error);
    return res.status(200).json(data);

  } catch (err) {
    console.error('[parent/create-assignment]', err.message);
    return res.status(503).json({ success: false, message: 'Could not save the assignment. Please try again.' });
  }
}
