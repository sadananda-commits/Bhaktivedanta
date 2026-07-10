// pages/api/student/chat-dm.js
//
// GET  ?classLevel=...&excludeStudentId=...  → classmates available to DM
// POST { studentId, studentName, otherStudentId, otherStudentName, classLevel }
//      → finds or creates the 1:1 chat between these two students
//
// Two different backends, on purpose:
//  - GET reads the classmate list from the MAIN Apps Script's existing
//    Accounts sheet (?action=accounts) — the same one profile.js and
//    students.js already use. No new sheet, no new roster to maintain.
//  - POST creates/finds the DM "group" row in the CHAT Apps Script's Chat
//    Groups sheet (chat-apps-script.gs) — same one chat-groups.js and
//    chat-messages.js talk to. A DM is just a 2-person group row there,
//    so it inherits every server-side safety check (kindness filter, link
//    allowlist, rate limit) the moment messages start flowing through the
//    existing chat-messages.js route — nothing new to enforce.

const MAIN_SCRIPT_URL = process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

const CHAT_SCRIPT_URL = process.env.CHAT_APPS_SCRIPT_URL;

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { classLevel, excludeStudentId } = req.query;
    if (!classLevel) return res.status(400).json({ error: 'classLevel is required' });
    try {
      const r = await fetch(`${MAIN_SCRIPT_URL}?action=accounts`, {
        signal: AbortSignal.timeout(12000),
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);

      const classmates = (data.accounts || [])
        .filter(a => String(a.Active).toString().toUpperCase() !== 'FALSE')
        .filter(a => String(a.ClassLevel || a.Class || '').trim().toLowerCase() === String(classLevel).trim().toLowerCase())
        .filter(a => String(a.StudentID || '') !== String(excludeStudentId || ''))
        .map(a => ({
          studentId:   a.StudentID || '',
          studentName: a.FullName || a.Username || a.StudentID || '',
        }))
        .filter(c => c.studentId);

      return res.status(200).json({ classmates });
    } catch (err) {
      console.error('[chat-dm] GET error:', err.message);
      return res.status(200).json({ classmates: [] }); // fail soft — picker just shows empty
    }
  }

  if (req.method === 'POST') {
    if (!CHAT_SCRIPT_URL) return res.status(500).json({ error: 'CHAT_APPS_SCRIPT_URL is not configured' });
    const { studentId, studentName, otherStudentId, otherStudentName, classLevel } = req.body || {};
    if (!studentId || !otherStudentId) return res.status(400).json({ error: 'studentId and otherStudentId are required' });
    try {
      const r = await fetch(CHAT_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'startDirectMessage', studentId, studentName, otherStudentId, otherStudentName, classLevel }),
      });
      const data = await r.json();
      return res.status(200).json(data);
    } catch (err) {
      console.error('[chat-dm] POST error:', err.message);
      return res.status(500).json({ error: 'Could not start chat — try again' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
