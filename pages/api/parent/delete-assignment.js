// pages/api/parent/delete-assignment.js
//
// Parent/teacher removes a row from the Chapter Assignments table. Forwards
// to the Apps Script action=deleteChapterAssignment, which finds the row by
// AssignmentID and deletes it from the sheet outright (not a soft-delete —
// see the note in WIRING_ASSIGNMENT_EDIT_DELETE.md if you'd rather archive
// instead of hard-delete).
//
// DELETE /api/parent/delete-assignment
// Body: { assignmentId }
// Response: { success: true } or { success:false, message }

const SCRIPT_URL = process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

export default async function handler(req, res) {
  if (req.method !== 'DELETE' && req.method !== 'POST') return res.status(405).end();

  const { assignmentId } = req.body || {};
  if (!assignmentId) {
    return res.status(400).json({ success: false, message: 'assignmentId is required.' });
  }

  try {
    const url = `${SCRIPT_URL}?action=deleteChapterAssignment`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignmentId }),
      signal: AbortSignal.timeout(12000),
    });
    const raw = await r.text();
    const data = JSON.parse(raw);
    if (data.error) throw new Error(data.error);
    return res.status(200).json(data);

  } catch (err) {
    console.error('[parent/delete-assignment]', err.message);
    return res.status(503).json({ success: false, message: 'Could not delete the assignment. Please try again.' });
  }
}
