// pages/api/student/chat-groups.js
//
// Proxies to the Apps Script Web App's `listGroups` action. Set
// CHAT_APPS_SCRIPT_URL in your environment to the deployed Web App's /exec
// URL (see chat-apps-script.gs). If you already have one Apps Script Web
// App serving multiple endpoints, point this at that same URL instead —
// this route just forwards `action=listGroups&studentId=...`.

export default async function handler(req, res) {
  const { studentId } = req.query;
  if (!studentId) return res.status(400).json({ error: 'studentId is required' });

  const base = process.env.CHAT_APPS_SCRIPT_URL;
  if (!base) return res.status(500).json({ error: 'CHAT_APPS_SCRIPT_URL is not configured' });

  try {
    const url = `${base}?action=listGroups&studentId=${encodeURIComponent(studentId)}`;
    const r = await fetch(url);
    const data = await r.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error('[chat-groups] fetch error:', err);
    return res.status(200).json({ groups: [] }); // fail soft — chat just shows empty state
  }
}
