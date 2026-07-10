// pages/api/parent/link-student.js
//
// Adds or removes a student from a parent/teacher's LinkedStudentIDs, so
// they can control which students show up in their own Parent Portal
// sidebar. Persisted to the ParentTeacher tab — survives logout/login and
// is editable directly in the sheet too.
//
// POST /api/parent/link-student
// Body: { ptId, studentId, mode: 'add' | 'remove' }
// Response: { success: true, linkedStudentIDs: [...] } or { success:false, message }

const SCRIPT_URL = process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { ptId, studentId, mode } = req.body || {};

  if (!ptId || !studentId || !['add', 'remove'].includes(mode)) {
    return res.status(400).json({ success: false, message: 'ptId, studentId and a valid mode (add/remove) are required.' });
  }

  try {
    const action = mode === 'add' ? 'ptLinkStudent' : 'ptUnlinkStudent';
    const r = await fetch(`${SCRIPT_URL}?action=${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ptId, studentId }),
      signal: AbortSignal.timeout(12000),
    });
    const contentType = r.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(`Apps Script returned HTTP ${r.status} (non-JSON) — check the action is wired into doPost.`);
    }
    const data = await r.json();
    return res.status(200).json(data);

  } catch (err) {
    console.error('[parent/link-student]', err.message);
    return res.status(503).json({ success: false, message: err.message || 'Could not update linked students. Please try again.' });
  }
}
