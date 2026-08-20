// pages/api/student/test-time.js
//
// ═══════════════════════════════════════════════════════════════════════════
//  TEST TIMER LOG — records how long a student spent on a test/module.
//  ─────────────────────────────────────────────────────────────────────────
//  Called automatically by the portal once the final question is submitted
//  (or the finish button clicked). Writes one row to the "TestTimeLogs" tab
//  in Script 1 (Vedanta Academy Students sheet) via the same Apps Script
//  web-app URL used by enroll.js and progress.js.
//
//  Payload key:  "testTime"
//  Required fields: studentId, moduleId, totalSeconds
//  Optional fields: studentName, classLevel, subject, topic, completedAt
//
//  The Apps Script Code.gs handler must recognise the "testTime" key and
//  append a row to the "TestTimeLogs" tab. See APPS_SCRIPT_SNIPPET below
//  for the exact gs block to paste into Code.gs.
//
//  APPS_SCRIPT_SNIPPET ──────────────────────────────────────────────────────
//  Paste this inside the doPost(e) handler in Code.gs, alongside the
//  existing "progress" and "enroll" branches:
//
//  if (payload.testTime) {
//    const t  = payload.testTime;
//    const ss = SpreadsheetApp.openById('YOUR_STUDENTS_SHEET_ID');
//    let   sh = ss.getSheetByName('TestTimeLogs');
//    if (!sh) {
//      sh = ss.insertSheet('TestTimeLogs');
//      sh.appendRow(['StudentID','StudentName','ClassLevel','Subject','Topic',
//                    'ModuleID','TotalSeconds','HH:MM:SS','CompletedAt','Date']);
//    }
//    const secs = Number(t.TotalSeconds) || 0;
//    const hms  = new Date(secs * 1000).toISOString().slice(11, 19); // HH:MM:SS
//    sh.appendRow([
//      t.StudentID, t.StudentName, t.ClassLevel, t.Subject, t.Topic,
//      t.ModuleID,  secs, hms, t.CompletedAt, t.Date,
//    ]);
//    return ContentService
//      .createTextOutput(JSON.stringify({ success: true }))
//      .setMimeType(ContentService.MimeType.JSON);
//  }
// ═══════════════════════════════════════════════════════════════════════════

const SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ success: false, message: 'Method not allowed' });

  const {
    studentId, studentName, classLevel, subject, topic,
    moduleId, totalSeconds, completedAt,
  } = req.body || {};

  if (!studentId || !moduleId || totalSeconds === undefined || totalSeconds === null)
    return res.status(400).json({ success: false, message: 'Missing required fields.' });

  const secs = Math.round(Number(totalSeconds));
  const now  = completedAt ? new Date(completedAt) : new Date();

  // Build HH:MM:SS string server-side too (redundant but useful for debugging)
  const h = String(Math.floor(secs / 3600)).padStart(2, '0');
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  const hms = `${h}:${m}:${s}`;

  const payload = {
    testTime: {
      StudentID:    studentId,
      StudentName:  studentName || '',
      ClassLevel:   classLevel  || '',
      Subject:      subject     || '',
      Topic:        topic       || '',
      ModuleID:     moduleId,
      TotalSeconds: secs,
      'HH:MM:SS':   hms,
      CompletedAt:  now.toISOString(),
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
      console.error('[student/test-time]', data.error || `HTTP ${r.status}`);
      return res.status(502).json({ success: false, message: data.error || 'Sheet write failed.' });
    }

    return res.status(200).json({ success: true, hms, totalSeconds: secs });

  } catch (err) {
    console.error('[student/test-time]', err.message);
    // Best-effort — client already has the data in localStorage.
    return res.status(502).json({ success: false, message: `Sync failed: ${err.message}` });
  }
}
