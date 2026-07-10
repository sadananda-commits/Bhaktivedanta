// pages/api/student/chat-messages.js
//
// GET  ?groupId=...&since=ISO_TIMESTAMP   → messages newer than `since`
//      (omit `since` on first load to get the group's full history)
// POST { groupId, studentId, studentName, message }  → send a message
//
// Both proxy to the Apps Script Web App (see chat-apps-script.gs), which
// does the actual validation (length cap, no links, kindness filter, rate
// limit, membership check) — this route doesn't re-implement those checks,
// it just forwards the request and relays the result (including error
// messages, so the UI can show *why* a message was rejected).

export default async function handler(req, res) {
  const base = process.env.CHAT_APPS_SCRIPT_URL;
  if (!base) return res.status(500).json({ error: 'CHAT_APPS_SCRIPT_URL is not configured' });

  if (req.method === 'GET') {
    const { groupId, since } = req.query;
    if (!groupId) return res.status(400).json({ error: 'groupId is required' });
    try {
      const url = `${base}?action=listMessages&groupId=${encodeURIComponent(groupId)}${since ? `&since=${encodeURIComponent(since)}` : ''}`;
      const r = await fetch(url);
      const data = await r.json();
      return res.status(200).json(data);
    } catch (err) {
      console.error('[chat-messages] GET error:', err);
      return res.status(200).json({ messages: [] }); // fail soft — next poll tries again
    }
  }

  if (req.method === 'POST') {
    const { groupId, studentId, studentName, message, action } = req.body || {};

    // A single POST endpoint also handles "report this message" so the
    // client doesn't need a third route — action defaults to sending.
    if (action === 'reportMessage') {
      const { messageId } = req.body || {};
      if (!messageId) return res.status(400).json({ error: 'messageId is required' });
      try {
        const r = await fetch(base, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reportMessage', messageId }),
        });
        const data = await r.json();
        return res.status(200).json(data);
      } catch (err) {
        console.error('[chat-messages] report error:', err);
        return res.status(500).json({ error: 'Could not report message' });
      }
    }

    if (!groupId || !studentId || !message) return res.status(400).json({ error: 'groupId, studentId and message are required' });
    try {
      const r = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'postMessage', groupId, studentId, studentName, message }),
      });
      const data = await r.json();
      return res.status(200).json(data);
    } catch (err) {
      console.error('[chat-messages] POST error:', err);
      return res.status(500).json({ error: 'Could not send message — try again' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
