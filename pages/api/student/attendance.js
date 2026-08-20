// pages/api/student/attendance.js
//
// Returns the real attendance records for a specific student from the
// Attendance tab in the Vedanta Academy Students Sheet.
//
// Apps Script action=attendance should return:
//   { records: [ { Date, Present, ClassSubject, Notes }, ... ],
//     summary: { total, attended, rate } }   ← optional, computed here if absent
//
// Expected Attendance tab columns:
//   StudentID | Date | Present | ClassSubject | Notes
//
// Present: TRUE / FALSE (or Yes/No — normalised client-side)

const SCRIPT_URL = process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

const cache = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes — attendance changes daily, not by the minute

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { studentId } = req.query;
  if (!studentId) return res.status(400).json({ records: [], summary: null, message: 'studentId is required.' });

  const cacheKey = `attendance:${studentId}`;
  if (cache[cacheKey] && Date.now() - cache[cacheKey].at < CACHE_TTL) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cache[cacheKey].data);
  }

  try {
    const url  = `${SCRIPT_URL}?action=attendance&studentId=${encodeURIComponent(studentId)}`;
    const r    = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (data.error) throw new Error(data.error);

    const records = (data.records || []);
    // Compute summary server-side if the Apps Script doesn't include it,
    // so the client always gets the same shape regardless of Apps Script version.
    const total    = records.length;
    const attended = records.filter(r => {
      const v = String(r.Present || '').trim().toUpperCase();
      return v === 'TRUE' || v === 'YES' || v === '1';
    }).length;
    const rate = total ? Math.round((attended / total) * 100) : 0;

    const result = {
      records,
      summary: data.summary || { total, attended, absent: total - attended, rate },
    };
    cache[cacheKey] = { data: result, at: Date.now() };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(result);

  } catch (err) {
    console.error('[student/attendance]', err.message);
    if (cache[cacheKey]) {
      res.setHeader('X-Cache', 'STALE');
      return res.status(200).json(cache[cacheKey].data);
    }
    return res.status(200).json({ records: [], summary: null, _error: err.message });
  }
}
