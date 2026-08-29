// pages/api/guest-lead.js
//
// Records one guest quiz attempt (name + which chapter + score) so the
// school can follow up with people who tried a quiz via a shared link but
// don't have an account yet. Mirrors pages/api/student/progress.js's
// pattern exactly — same Apps Script web app, just a different payload key
// (`guestLead` instead of `progress`).
//
// On the Apps Script side (Code.gs), doPost needs one new branch added
// alongside the existing `payload.testTime` handler:
//
//   if (payload.guestLead) {
//     var glSheet = ss.getSheetByName('GuestLeads');
//     if (!glSheet) {
//       glSheet = ss.insertSheet('GuestLeads');
//       glSheet.appendRow(['Name','ModuleID','ChapterTitle','Subject','ClassLevel',
//                           'Correct','Attempted','Total','Timestamp','Date']);
//     }
//     appendRow(glSheet, payload.guestLead);
//   }
//
// (appendRow() already exists in Code.gs and auto-creates any missing
// header column, so this is safe even before that tab exists — but seeding
// the headers up front keeps the column order tidy.)

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ success: false, message: 'Method not allowed' });

  const {
    name, moduleId, chapterTitle, subject, classLevel,
    correct, attempted, total,
  } = req.body || {};

  if (!name || !moduleId)
    return res.status(400).json({ success: false, message: 'Missing required fields.' });

  const now = new Date();
  const payload = {
    guestLead: {
      Name:         name,
      ModuleID:     moduleId,
      ChapterTitle: chapterTitle || '',
      Subject:      subject || '',
      ClassLevel:   classLevel || '',
      Correct:      correct   !== undefined ? String(correct)   : '',
      Attempted:    attempted !== undefined ? String(attempted) : '',
      Total:        total     !== undefined ? String(total)     : '',
      Timestamp:    now.toISOString(),
      Date:         now.toISOString().slice(0, 10),
    },
  };

  try {
    const r = await fetch(SCRIPT_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(15000),
    });

    const raw = await r.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = { raw }; }

    if (!r.ok || data.error) {
      console.error('[guest-lead]', data.error || `HTTP ${r.status}`);
      return res.status(502).json({ success: false, message: data.error || 'Sheet write failed.' });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('[guest-lead]', err.message);
    // Non-fatal from the caller's point of view — pages/quiz.js already
    // treats this as best-effort (.catch(()=>{})) and never blocks the
    // guest's results screen on it.
    return res.status(502).json({ success: false, message: `Sync failed: ${err.message}` });
  }
}
