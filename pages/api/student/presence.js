// pages/api/student/presence.js
//
// Presence proxy — lets a student's browser send a heartbeat every ~25s
// ("I'm online, and here's whether I'm active or idle") and lets any other
// student ask "who's online right now" so GroupChat.jsx can show a dot next
// to a classmate's name — same CHAT_APPS_SCRIPT_URL / "Presence" sheet tab,
// no separate deployment needed.
//
// Presence is now per-device (studentId + deviceId), so a student open on
// a laptop and a tablet at once shows up as online with two rows — that's
// what lets an incoming call ring on every device they're signed into.
//
// GET  ?action=online                                            → { online: [...], status: { studentId: 'active'|'idle' } }
// GET  ?action=presenceFor&studentId=...                         → { status: 'active'|'idle'|'offline' }  (used before dialing a call)
// POST { studentId, studentName, deviceId, deviceType, status }  → heartbeat (status: 'active' | 'idle')
// POST { action: 'signOut', studentId, deviceId }                → removes just that device's row immediately

export default async function handler(req, res) {
  const base = process.env.CHAT_APPS_SCRIPT_URL;
  if (!base) return res.status(500).json({ error: 'CHAT_APPS_SCRIPT_URL is not configured' });

  if (req.method === 'GET') {
    const { action, studentId } = req.query;
    try {
      if (action === 'presenceFor') {
        if (!studentId) return res.status(400).json({ error: 'studentId is required' });
        const r = await fetch(`${base}?action=presenceFor&studentId=${encodeURIComponent(studentId)}`, { signal: AbortSignal.timeout(10000) });
        const data = await r.json();
        return res.status(200).json(data);
      }
      const r = await fetch(`${base}?action=onlineStudents`, { signal: AbortSignal.timeout(10000) });
      const data = await r.json();
      return res.status(200).json(data);
    } catch (err) {
      console.error('[student/presence] GET error:', err.message);
      return res.status(200).json({ online: [], status: {} }); // fail soft — next poll tries again
    }
  }

  if (req.method === 'POST') {
    const { action, studentId, studentName, deviceId, deviceType, status } = req.body || {};
    if (!studentId) return res.status(400).json({ error: 'studentId is required' });

    // Explicit sign-out — a device saying "I'm gone right now", not just a
    // missed heartbeat. Uses sendBeacon on the client so it fires reliably
    // during page unload.
    if (action === 'signOut') {
      try {
        const r = await fetch(base, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'signOut', studentId, deviceId }),
          signal: AbortSignal.timeout(10000),
        });
        const data = await r.json();
        return res.status(200).json(data);
      } catch (err) {
        console.error('[student/presence] signOut error:', err.message);
        // Fail soft here too — worst case the row just expires via the
        // normal 60s heartbeat timeout instead of disappearing instantly.
        return res.status(200).json({ ok: false });
      }
    }

    try {
      const r = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'heartbeat', studentId, studentName, deviceId, deviceType, status }),
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
