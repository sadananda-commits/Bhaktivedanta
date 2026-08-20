// pages/api/student/call.js
//
// Signaling proxy for 1:1 audio calls between students (WebRTC). Mirrors
// chat-messages.js: this route does no validation itself, it just forwards
// to the Apps Script Web App (chat-apps-script.gs), which owns a new
// "Calls" sheet tab — same CHAT_APPS_SCRIPT_URL the chat feature already
// uses, so no new script deployment, env var, or CORS setup needed.
//
// This route only ever carries WebRTC *signaling* data (call metadata,
// SDP offer/answer, ICE candidates) — never audio itself, which flows
// peer-to-peer (or via TURN relay) directly between the two students'
// browsers once connected.
//
// GET  ?action=incoming&studentId=...      → any ringing call for this student
// GET  ?action=state&callId=...            → full state of one call (for polling)
// Note: 'start' can come back as { error: 'offline' } — that means the
// callee has no fresh presence at all (never signed in, or explicitly
// signed out on every device) and no call row was even created. Anything
// else (idle or active) proceeds as a normal ring; the call UI should show
// a distinct "they're signed out" message for the offline case rather than
// ringing and then timing out.
//
// POST { action:'start',    callerId, callerName, calleeId, calleeName, offer }
// POST { action:'answer',   callId, answer }
// POST { action:'decline',  callId }
// POST { action:'candidate',callId, role, candidate }   // role: 'caller' | 'callee'
// POST { action:'end',      callId }

const ACTION_MAP = {
  incoming:  'incomingCall',
  state:     'callState',
  start:     'startCall',
  answer:    'answerCall',
  decline:   'declineCall',
  candidate: 'sendCallCandidate',
  end:       'endCall',
};

export default async function handler(req, res) {
  const base = process.env.CHAT_APPS_SCRIPT_URL;
  if (!base) return res.status(500).json({ error: 'CHAT_APPS_SCRIPT_URL is not configured' });

  if (req.method === 'GET') {
    const { action, studentId, callId } = req.query;
    const scriptAction = ACTION_MAP[action];
    if (!scriptAction) return res.status(400).json({ error: 'Unknown action' });

    try {
      const params = new URLSearchParams({ action: scriptAction });
      if (studentId) params.set('calleeId', studentId);
      if (callId) params.set('callId', callId);
      const r = await fetch(`${base}?${params.toString()}`, { signal: AbortSignal.timeout(10000) });
      const data = await r.json();
      return res.status(200).json(data);
    } catch (err) {
      console.error('[student/call] GET error:', err.message);
      return res.status(200).json({}); // fail soft — next poll tries again
    }
  }

  if (req.method === 'POST') {
    const { action, ...rest } = req.body || {};
    const scriptAction = ACTION_MAP[action];
    if (!scriptAction) return res.status(400).json({ error: 'Unknown action' });

    try {
      const r = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: scriptAction, ...rest }),
        signal: AbortSignal.timeout(10000),
      });
      const data = await r.json();
      return res.status(200).json(data);
    } catch (err) {
      console.error('[student/call] POST error:', err.message);
      return res.status(500).json({ error: 'Call signaling failed — try again' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
