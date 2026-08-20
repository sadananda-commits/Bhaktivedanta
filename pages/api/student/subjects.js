// pages/api/student/subjects.js
//
// Returns the real subject-level progress for a specific student from
// the Progress tab in the Vedanta Academy Students Sheet.
//
// Apps Script action=subjectProgress should return:
//   { subjects: [ { Subject, TopicsDone, TotalTopics, LastUpdated,
//                   QuestionsAttempted, QuestionsCorrect,
//                   'Progress %', 'Color (Hex)' }, ... ] }
//
// Expected Progress tab columns:
//   StudentID | Subject | TopicsDone | TotalTopics | QuestionsAttempted |
//   QuestionsCorrect | LastUpdated | Color
//
// The 'Progress %' is computed here from TopicsDone/TotalTopics if the
// Apps Script doesn't compute it, so the client always gets a consistent shape.
//
// NOTE: This supplements (not replaces) the quiz-answer-level progress
// derived from StudentProgress rows in portal.js. The Progress tab is for
// teacher-managed topic completion tracking; StudentProgress rows are for
// per-question analytics. Both sources are shown in the dashboard.

const SCRIPT_URL = process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

const cache = {};
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes

// Subject brand colours — used as fallback if not specified in the sheet
const SUBJECT_COLORS = {
  'English Grammar': '#3b82f6', 'Mathematics': '#f97316', 'Science': '#22c55e',
  'Social Studies': '#eab308', 'General Knowledge': '#a855f7',
  'English': '#3b82f6', 'Maths': '#f97316', 'History': '#a855f7', 'Geography': '#eab308',
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { studentId } = req.query;
  if (!studentId) return res.status(400).json({ subjects: [], message: 'studentId is required.' });

  const cacheKey = `subjects:${studentId}`;
  if (cache[cacheKey] && Date.now() - cache[cacheKey].at < CACHE_TTL) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cache[cacheKey].data);
  }

  try {
    const url  = `${SCRIPT_URL}?action=subjectProgress&studentId=${encodeURIComponent(studentId)}`;
    const r    = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (data.error) throw new Error(data.error);

    const subjects = (data.subjects || []).map(s => {
      const done  = Number(s.TopicsDone  || s['Topics Done']  || 0);
      const total = Number(s.TotalTopics || s['Total Topics'] || 0);
      const pct   = total ? Math.round((done / total) * 100) : 0;
      const color = s.Color || s['Color (Hex)'] || SUBJECT_COLORS[s.Subject] || '#00c6a7';
      return {
        Subject:             s.Subject || '',
        'Topics Done':       done,
        'Total Topics':      total,
        'Progress %':        s['Progress %'] !== undefined ? Number(s['Progress %']) : pct,
        QuestionsAttempted:  Number(s.QuestionsAttempted  || 0),
        QuestionsCorrect:    Number(s.QuestionsCorrect    || 0),
        QuestionsIncorrect:  Number(s.QuestionsIncorrect  || 0),
        LastAttemptDate:     s.LastUpdated || s.LastAttemptDate || '',
        'Color (Hex)':       color,
        'Display Order':     Number(s['Display Order'] || 0),
        Active:              s.Active !== false && s.Active !== 'FALSE',
      };
    });

    const result = { subjects };
    cache[cacheKey] = { data: result, at: Date.now() };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(result);

  } catch (err) {
    console.error('[student/subjects]', err.message);
    if (cache[cacheKey]) {
      res.setHeader('X-Cache', 'STALE');
      return res.status(200).json(cache[cacheKey].data);
    }
    return res.status(200).json({ subjects: [], _error: err.message });
  }
}
