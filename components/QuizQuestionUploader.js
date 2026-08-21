// components/QuizQuestionUploader.js
//
// Lets a teacher/parent add a whole quiz's worth of questions by filling in
// an Excel template and uploading it, instead of hand-editing the Quiz
// Questions tab in the Quiz System sheet.
//
// Flow: Download Template -> fill it in Excel -> upload it here -> preview
// with validation -> Confirm & Add. Nothing is written until the user
// confirms the preview, and Code.gs (addQuestions_) re-validates everything
// again server-side before writing any row.
//
// Requires the SheetJS package client-side: `npm install xlsx`
//   import * as XLSX from 'xlsx'

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { quizApi } from '../lib/quizApi';

// Accepts a handful of reasonable header spellings so a teacher who tweaks
// the template a little (extra spaces, different casing, "Q. Text" instead
// of "Question Text") doesn't get a confusing failure.
const HEADER_ALIASES = {
  questionText: ['question text', 'question', 'q text'],
  optionA: ['option a', 'a', 'option 1'],
  optionB: ['option b', 'b', 'option 2'],
  optionC: ['option c', 'c', 'option 3'],
  optionD: ['option d', 'd', 'option 4'],
  correctAnswer: ['correct answer', 'correct', 'answer'],
  timeLimitSec: ['time limit (sec)', 'time limit', 'time limit sec', 'seconds'],
  points: ['points', 'point value'],
  mediaUrl: ['media url', 'image url', 'media'],
  qNum: ['q num', 'question number', 'q#', 'no', '#'],
};

function normalizeHeader(h) {
  return String(h || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildHeaderMap(firstRow) {
  const map = {}; // field -> actual column key present in the parsed row
  const rowHeaders = Object.keys(firstRow);
  Object.entries(HEADER_ALIASES).forEach(([field, aliases]) => {
    const match = rowHeaders.find(h => aliases.includes(normalizeHeader(h)));
    if (match) map[field] = match;
  });
  return map;
}

function downloadTemplate() {
  const headers = ['Q Num', 'Question Text', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer', 'Time Limit (sec)', 'Points', 'Media URL'];
  const example = [
    [1, 'What is the capital of France?', 'Paris', 'Rome', 'Berlin', 'Madrid', 'A', 20, 1000, ''],
    [2, 'Which of these are primary colors? (pick all that apply)', 'Red', 'Green', 'Blue', 'Orange', 'A,C', 25, 1000, ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...example]);
  ws['!cols'] = [{ wch: 6 }, { wch: 44 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Questions');
  XLSX.writeFile(wb, 'quiz-questions-template.xlsx');
}

// Validates one parsed row. Returns an array of problem strings (empty = OK).
function validateRow(row, index) {
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

export default function QuizQuestionUploader({ quizId, hostCode, onDone }) {
  const [rows, setRows] = useState([]);
  const [problems, setProblems] = useState([]);
  const [fileName, setFileName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setSubmitError('');

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        if (!raw.length) { setRows([]); setProblems(['The file has no data rows below the header.']); return; }

        const headerMap = buildHeaderMap(raw[0]);
        const missingRequired = ['questionText', 'optionA', 'optionB', 'correctAnswer'].filter(f => !headerMap[f]);
        if (missingRequired.length) {
          setRows([]);
          setProblems([`Couldn't find a column for: ${missingRequired.join(', ')}. Check the header row matches the template.`]);
          return;
        }

        let parsed = raw.map(r => ({
          qNum: headerMap.qNum ? Number(r[headerMap.qNum]) || null : null,
          questionText: String(r[headerMap.questionText] || '').trim(),
          optionA: String(r[headerMap.optionA] || '').trim(),
          optionB: String(r[headerMap.optionB] || '').trim(),
          optionC: headerMap.optionC ? String(r[headerMap.optionC] || '').trim() : '',
          optionD: headerMap.optionD ? String(r[headerMap.optionD] || '').trim() : '',
          correctAnswer: String(r[headerMap.correctAnswer] || '').trim(),
          timeLimitSec: headerMap.timeLimitSec ? Number(r[headerMap.timeLimitSec]) || null : null,
          points: headerMap.points ? Number(r[headerMap.points]) || null : null,
          mediaUrl: headerMap.mediaUrl ? String(r[headerMap.mediaUrl] || '').trim() : '',
        })).filter(r => r.questionText || r.optionA || r.optionB || r.correctAnswer); // skip fully blank rows

        // Honor a Q Num column for ordering if every row has one; otherwise
        // keep file order (still works fine — the backend just appends in
        // the order the array arrives in).
        if (parsed.every(r => r.qNum !== null)) {
          parsed = parsed.slice().sort((a, b) => a.qNum - b.qNum);
        }

        const allProblems = parsed.flatMap((r, i) => validateRow(r, i));
        setRows(parsed);
        setProblems(allProblems);
      } catch (err) {
        setRows([]);
        setProblems(['Could not read that file — make sure it\'s a .xlsx or .xls file saved from the template.']);
      }
    };
    reader.readAsBinaryString(file);
  }

  async function handleConfirm() {
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await quizApi.addQuestions(quizId, hostCode, rows);
      setResult(res);
      setRows([]);
      setFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="qxu-scope">
      <QxuStyles />
      <div className="qxu-steps">
        <div className="qxu-step">
          <span className="qxu-step-num">1</span>
          <div>
            <div className="qxu-step-title">Download the template</div>
            <button type="button" className="qxm-btn qxm-btn-outline qxu-btn-sm" onClick={downloadTemplate}>
              <i className="fa-solid fa-download" /> Download Excel Template
            </button>
          </div>
        </div>
        <div className="qxu-step">
          <span className="qxu-step-num">2</span>
          <div>
            <div className="qxu-step-title">Fill it in and upload it here</div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFile}
              className="qxu-file-input"
            />
            {fileName && <div className="qx-muted" style={{ fontSize: 12, marginTop: 4 }}>{fileName}</div>}
          </div>
        </div>
      </div>

      {problems.length > 0 && (
        <div className="qxm-error" style={{ marginTop: 14 }}>
          {problems.map((p, i) => <div key={i}>⚠ {p}</div>)}
        </div>
      )}

      {rows.length > 0 && problems.length === 0 && (
        <div className="qxu-preview">
          <div className="qxu-preview-title">{rows.length} question{rows.length === 1 ? '' : 's'} ready to add</div>
          <div className="qxu-table-scroll">
            <table className="qxu-table">
              <thead><tr><th>#</th><th>Question</th><th>A</th><th>B</th><th>C</th><th>D</th><th>Correct</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td className="qxu-qtext">{r.questionText}</td>
                    <td>{r.optionA}</td><td>{r.optionB}</td><td>{r.optionC}</td><td>{r.optionD}</td>
                    <td className="qxu-correct">{r.correctAnswer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {submitError && <div className="qxm-error">⚠ {submitError}</div>}
          <button className="qxm-btn qxm-btn-primary" disabled={submitting} onClick={handleConfirm}>
            {submitting ? <><i className="fa-solid fa-circle-notch fa-spin" /> Adding…</> : <><i className="fa-solid fa-check" /> Confirm &amp; Add to Quiz</>}
          </button>
        </div>
      )}

      {result && (
        <div className="qxu-success">
          <i className="fa-solid fa-circle-check" /> Added {result.added} question{result.added === 1 ? '' : 's'} (Q{result.firstQNum}–Q{result.lastQNum}).
          <button className="qxm-btn qxm-btn-outline qxu-btn-sm" style={{ marginTop: 10 }} onClick={onDone}>Done</button>
        </div>
      )}
    </div>
  );
}

function QxuStyles() {
  return (
    <style jsx global>{`
      .qxu-scope { margin-top: 14px; padding: 16px; background: var(--qxm-bg-well); border: 1px solid var(--qxm-border); border-radius: 14px; }
      .qxu-steps { display: flex; flex-direction: column; gap: 14px; }
      .qxu-step { display: flex; gap: 12px; align-items: flex-start; }
      .qxu-step-num {
        width: 24px; height: 24px; border-radius: 50%; background: var(--qxm-accent); color: #072922;
        display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 12px; flex-shrink: 0;
      }
      .qxu-step-title { font-weight: 700; font-size: 13px; margin-bottom: 8px; }
      .qxu-btn-sm { padding: 9px 14px; font-size: 13px; margin-top: 0; }
      .qxu-file-input { font-size: 13px; color: var(--qxm-text); }

      .qxu-preview { margin-top: 16px; }
      .qxu-preview-title { font-weight: 700; font-size: 13px; margin-bottom: 10px; }
      .qxu-table-scroll { overflow-x: auto; margin-bottom: 14px; }
      .qxu-table { width: 100%; border-collapse: collapse; min-width: 560px; }
      .qxu-table th, .qxu-table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--qxm-border); font-size: 13px; }
      .qxu-table th { font-family: var(--qxm-font-mono); font-size: 10px; text-transform: uppercase; color: var(--qxm-muted); }
      .qxu-qtext { max-width: 260px; }
      .qxu-correct { font-weight: 700; color: var(--qxm-accent); }

      .qxu-success { margin-top: 14px; color: var(--qxm-accent); font-weight: 600; font-size: 14px; }
    `}</style>
  );
}
