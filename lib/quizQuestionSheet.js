// lib/quizQuestionSheet.js
//
// Shared parsing/validation for quiz-question spreadsheet rows.
//
// Used by BOTH:
//   components/QuizQuestionUploader.js    — one sheet -> questions for ONE existing quiz
//   components/QuizWorkbookUploader.js    — one workbook, many sheets -> MANY new quizzes
//
// Keeping the header-matching and row-validation rules in one place means
// the two uploaders can never drift apart on what counts as a valid
// question row, and a fix to one applies to both.

// Accepts a handful of reasonable header spellings so a teacher who tweaks
// the template a little (extra spaces, different casing, "Q. Text" instead
// of "Question Text") doesn't get a confusing failure.
export const HEADER_ALIASES = {
  questionText: ['question text', 'question', 'q text'],
  optionA: ['option a', 'a', 'option 1'],
  optionB: ['option b', 'b', 'option 2'],
  optionC: ['option c', 'c', 'option 3'],
  optionD: ['option d', 'd', 'option 4'],
  correctAnswer: ['correct answer', 'correct', 'answer'],
  explanation: ['explanation', 'why', 'rationale'],
  timeLimitSec: ['time limit (sec)', 'time limit', 'time limit sec', 'seconds'],
  points: ['points', 'point value'],
  mediaUrl: ['media url', 'image url', 'media'],
  qNum: ['q num', 'question number', 'q#', 'no', '#'],
};

export const REQUIRED_FIELDS = ['questionText', 'optionA', 'optionB', 'correctAnswer'];

// Column layout + example rows for the downloadable templates (single-quiz
// and workbook templates both use this so they never fall out of sync).
export const TEMPLATE_HEADERS = [
  'Q Num', 'Question Text', 'Option A', 'Option B', 'Option C', 'Option D',
  'Correct Answer', 'Explanation', 'Time Limit (sec)', 'Points', 'Media URL',
];
export const TEMPLATE_COL_WIDTHS = [
  { wch: 6 }, { wch: 44 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
  { wch: 14 }, { wch: 44 }, { wch: 14 }, { wch: 8 }, { wch: 20 },
];
export const TEMPLATE_EXAMPLE_ROWS = [
  [1, 'What is the capital of France?', 'Paris', 'Rome', 'Berlin', 'Madrid', 'A',
    'Paris has been the capital of France since the 10th century.', 20, 1000, ''],
  [2, 'Which of these are primary colors? (pick all that apply)', 'Red', 'Green', 'Blue', 'Orange', 'A,C',
    'Red and blue are primary colors; green and orange are made by mixing them with others.', 25, 1000, ''],
];

export function normalizeHeader(h) {
  return String(h || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildHeaderMap(firstRow) {
  const map = {}; // field -> actual column key present in the parsed row
  const rowHeaders = Object.keys(firstRow || {});
  Object.entries(HEADER_ALIASES).forEach(([field, aliases]) => {
    const match = rowHeaders.find(h => aliases.includes(normalizeHeader(h)));
    if (match) map[field] = match;
  });
  return map;
}

// Turns the raw array from XLSX.utils.sheet_to_json(sheet, { defval: '' })
// into { rows, problems }. `problems` is only ever non-empty for STRUCTURAL
// issues (no data rows at all, or a required column header is missing) — in
// that case `rows` is always []. Per-row content problems are a separate
// step (see validateRow/validateRows below) since a workbook importer wants
// to show those inline per sheet rather than as a blocking structural error.
export function parseSheetRows(raw) {
  if (!raw || !raw.length) {
    return { rows: [], problems: ['This sheet has no data rows below the header.'] };
  }

  const headerMap = buildHeaderMap(raw[0]);
  const missingRequired = REQUIRED_FIELDS.filter(f => !headerMap[f]);
  if (missingRequired.length) {
    return {
      rows: [],
      problems: [`Couldn't find a column for: ${missingRequired.join(', ')}. Check the header row matches the template.`],
    };
  }

  let parsed = raw.map(r => ({
    qNum: headerMap.qNum ? Number(r[headerMap.qNum]) || null : null,
    questionText: String(r[headerMap.questionText] || '').trim(),
    optionA: String(r[headerMap.optionA] || '').trim(),
    optionB: String(r[headerMap.optionB] || '').trim(),
    optionC: headerMap.optionC ? String(r[headerMap.optionC] || '').trim() : '',
    optionD: headerMap.optionD ? String(r[headerMap.optionD] || '').trim() : '',
    correctAnswer: String(r[headerMap.correctAnswer] || '').trim(),
    explanation: headerMap.explanation ? String(r[headerMap.explanation] || '').trim() : '',
    timeLimitSec: headerMap.timeLimitSec ? Number(r[headerMap.timeLimitSec]) || null : null,
    points: headerMap.points ? Number(r[headerMap.points]) || null : null,
    mediaUrl: headerMap.mediaUrl ? String(r[headerMap.mediaUrl] || '').trim() : '',
  })).filter(r => r.questionText || r.optionA || r.optionB || r.correctAnswer); // skip fully blank rows

  // Honor a Q Num column for ordering if every row has one; otherwise keep
  // file order (still fine — the backend just appends in array order).
  if (parsed.length && parsed.every(r => r.qNum !== null)) {
    parsed = parsed.slice().sort((a, b) => a.qNum - b.qNum);
  }

  return { rows: parsed, problems: [] };
}

// Validates one parsed row. Returns an array of problem strings (empty = OK).
export function validateRow(row, index) {
  const problems = [];
  const label = `Row ${index + 1}`;
  if (!row.questionText) problems.push(`${label}: missing Question Text.`);
  if (!row.optionA) problems.push(`${label}: missing Option A.`);
  if (!row.optionB) problems.push(`${label}: missing Option B.`);
  const correct = String(row.correctAnswer || '').trim();
  if (!correct) {
    problems.push(`${label}: missing Correct Answer.`);
  } else {
    const letters = correct.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    const options = { A: row.optionA, B: row.optionB, C: row.optionC, D: row.optionD };
    letters.forEach(l => {
      if (!['A', 'B', 'C', 'D'].includes(l)) problems.push(`${label}: Correct Answer "${l}" isn't A, B, C, or D.`);
      else if (!options[l]) problems.push(`${label}: Correct Answer "${l}" has no matching option filled in.`);
    });
  }
  return problems;
}

export function validateRows(rows) {
  return rows.flatMap((r, i) => validateRow(r, i));
}
