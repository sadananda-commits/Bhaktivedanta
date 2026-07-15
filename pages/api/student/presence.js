// pages/api/student/presence.js
//
// Tiny presence proxy — lets a student's browser send a heartbeat every
// ~25s ("I'm online") and lets any other student ask "who's online right
// now" so GroupChat.jsx can show a green dot next to a classmate's name —
// same CHAT_APPS_SCRIPT_URL / new "Presence" sheet tab, no separate
// deployment needed.
//
// GET  ?action=online              → { online: ['S001','S002',...] }
// POST { studentId, studentName }  → records/refreshes this student's heartbeat

export default async function handler(req, res) {
  const base = process.env.CHAT_APPS_SCRIPT_URL;
  if (!base) return res.status(500).json({ error: 'CHAT_APPS_SCRIPT_URL is not configured' });

  if (req.method === 'GET') {
    try {
      const r = await fetch(`${base}?action=onlineStudents`, { signal: AbortSignal.timeout(10000) });
      const data = await r.json();
      return res.status(200).json(data);
    } catch (err) {
      console.error('[student/presence] GET error:', err.message);
      return res.status(200).json({ online: [] }); // fail soft — next poll tries again
    }
  }

  if (req.method === 'POST') {
    const { studentId, studentName } = req.body || {};
    if (!studentId) return res.status(400).json({ error: 'studentId is required' });
    try {
      const r = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'heartbeat', studentId, studentName }),
        signal: AbortSignal.timeout(10000),
      });
      const data = await r.json();
      return res.status(200).json(data);
    } catch (err) {
      console.error('[student/presence] POST error:', err.message);
      return res.status(200).json({ ok: false }); // fail soft — heartbeat just retries in ~25s
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
