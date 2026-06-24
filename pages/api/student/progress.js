// pages/api/student/progress.js
// Writes one progress event (a single answered question) to Script 1
// (Vedanta Academy Students sheet → StudentProgress tab). Mirrors enroll.js's
// pattern: same Apps Script web app, just a different payload key.
//
// portal.js calls this once per answered question via saveLearnProgress(),
// sending the full merged per-module progress patch. We translate that into
// one StudentProgress row per call — the sheet ends up with one row per
// (student, module, question) attempt, which is exactly the shape the
// requirements doc asks for and what Code.gs's buildLeaderboard() expects.

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ success: false, message: 'Method not allowed' });

  const {
    studentId, studentName, subject, topic, moduleId,
    questionNumber, answerGiven, correctAnswer, status,
  } = req.body || {};

  if (!studentId || !moduleId || questionNumber === undefined || questionNumber === null)
    return res.status(400).json({ success: false, message: 'Missing required fields.' });

  const now = new Date();
  const payload = {
    progress: {
      StudentID:      studentId,
      StudentName:    studentName || '',
      Subject:        subject || '',
      Topic:          topic || '',
      ModuleID:       moduleId,
      QuestionNumber: String(questionNumber),
      AnswerGiven:    answerGiven || '',
      CorrectAnswer:  correctAnswer || '',
      Status:         status || '',
      Date:           now.toISOString().slice(0, 10),
      Timestamp:      now.toISOString(),
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
      console.error('[student/progress]', data.error || `HTTP ${r.status}`);
      return res.status(502).json({ success: false, message: data.error || 'Sheet write failed.' });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('[student/progress]', err.message);
    // Non-fatal from the client's point of view — localStorage already has
    // the progress, this is just the cross-device sync. Still return an
    // error status so callers can log/retry if they want, but the portal
    // itself already treats this as best-effort (.catch(()=>{})).
    return res.status(502).json({ success: false, message: `Sync failed: ${err.message}` });
  }
}
