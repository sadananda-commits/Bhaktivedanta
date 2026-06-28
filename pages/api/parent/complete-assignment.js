// pages/api/student/complete-assignment.js
//
// Called automatically by the Student Portal the instant a student finishes
// answering every question in their assigned range under "Assignments for
// you". Marks that ChapterAssignments row's Status as "Completed".
//
// POST /api/student/complete-assignment
// Body: { assignmentId }
// Response: { success: true } or { success:false, message }

const SCRIPT_URL = process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { assignmentId } = req.body || {};
  if (!assignmentId) return res.status(400).json({ success: false, message: 'assignmentId is required.' });

  try {
    const url = `${SCRIPT_URL}?action=completeChapterAssignment`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignmentId }),
      signal: AbortSignal.timeout(12000),
    });
    const raw = await r.text();
    const data = JSON.parse(raw);
    return res.status(200).json(data);

  } catch (err) {
    console.error('[student/complete-assignment]', err.message);
    // Non-fatal from the student's point of view — the quiz itself already
    // finished and saved locally; this just couldn't sync the status flag.
    return res.status(200).json({ success: false, message: 'Could not sync completion status — it will show as completed once reloaded if it was actually saved.' });
  }
}
