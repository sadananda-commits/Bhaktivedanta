// pages/api/student/progress-history.js
// Reads a single student's raw StudentProgress rows back from the sheet, so
// the dashboard/progress views can rebuild correct state on a device that
// doesn't have it in localStorage (e.g. student logs in on a new phone).
//
// GET /api/student/progress-history?studentId=APX123456

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { studentId } = req.query;
  if (!studentId) return res.status(400).json({ progress: [], message: 'studentId is required.' });

  try {
    const url = `${SCRIPT_URL}?action=progress&studentId=${encodeURIComponent(studentId)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (data.error) throw new Error(data.error);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ progress: data.progress || [] });

  } catch (err) {
    console.error('[student/progress-history]', err.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ progress: [], _error: err.message });
  }
}
