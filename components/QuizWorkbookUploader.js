// components/QuizWorkbookUploader.js
//
// Bulk quiz creation: upload ONE Excel workbook where each TAB is a whole
// quiz (tab name -> quiz title, tab contents -> its questions, in the exact
// same column format as the single-quiz template from
// QuizQuestionUploader.js). The system reads every sheet, shows a preview
// of what will be created, and on confirm creates each quiz
// (quizApi.createQuiz) and adds its questions (quizApi.addQuestions) —
// no manual "New Quiz" + "Upload Questions" round trip per quiz.
//
// This deliberately does NOT need any backend changes: it's a client-side
// loop over the same two API actions the single-quiz flow already uses, so
// Code.gs's existing createQuiz/addQuestions validation is the only source
// of truth either way. If a quiz code collides with one that already
// exists, that specific row reports the server's error and can be retried
// with an edited code — nothing else in the batch is rolled back.
//
// Requires the SheetJS package client-side (already a dependency of
// QuizQuestionUploader.js): `npm install xlsx`

import { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { quizApi } from '../lib/quizApi';
import {
  parseSheetRows, validateRows,
  TEMPLATE_HEADERS, TEMPLATE_COL_WIDTHS, TEMPLATE_EXAMPLE_ROWS,
} from '../lib/quizQuestionSheet';

const QUIZ_ID_RE = /^[A-Za-z0-9]{3,12}$/;
const HOST_CODE_RE = /^[A-Za-z0-9]{4,10}$/;

// Same charset/shape as OnlineQuizManager.js's randomHostCode: no 0/O/1/I
// so it's unambiguous read aloud in a classroom.
function randomHostCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function slugCode(name, fallbackIndex) {
  let s = String(name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!s) s = `QUIZ${fallbackIndex + 1}`;
  if (s.length < 3) s = (s + 'XXX').slice(0, 3);
  if (s.length > 12) s = s.slice(0, 12);
  return s;
}

function dedupeCode(code, used) {
  if (!used.has(code)) return code;
  const base = code.length > 10 ? code.slice(0, 10) : code;
  let n = 2;
  let candidate = `${base}${n}`;
  while (used.has(candidate)) { n += 1; candidate = `${base}${n}`; }
  return candidate;
}

function downloadWorkbookTemplate() {
  const wb = XLSX.utils.book_new();

  const readme = XLSX.utils.aoa_to_sheet([
    ['How this template works'],
    [''],
    ['Each TAB in this workbook becomes its own quiz.'],
    ['The tab name becomes that quiz\'s title — rename tabs freely (spaces and punctuation are fine).'],
    ['Duplicate the "Example Quiz A" tab for each new quiz (right-click the tab -> Move or Copy -> Create a copy), then fill in its questions.'],
    ['This Read Me tab is skipped automatically — no need to delete it before uploading.'],
    ['Every quiz tab needs its own Question Text / Option A / Option B / Correct Answer columns, same as the single-quiz template.'],
    ['For a question with more than one correct answer, list the letters together in Correct Answer, e.g. A,C.'],
  ]);
  readme['!cols'] = [{ wch: 92 }];
  XLSX.utils.book_append_sheet(wb, readme, 'Read Me');

  ['Example Quiz A', 'Example Quiz B'].forEach((name) => {
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...TEMPLATE_EXAMPLE_ROWS]);
    ws['!cols'] = TEMPLATE_COL_WIDTHS;
    XLSX.utils.book_append_sheet(wb, ws, name);
  });

  XLSX.writeFile(wb, 'quiz-workbook-template.xlsx');
}

// Per-item validation, computed fresh on every render from current state —
// cheap enough (a handful of sheets) and keeps every edit instantly in sync
// with duplicate-code / format checks across the whole batch.
function computeIssues(items) {
  const codeCounts = {};
  items.forEach((it) => {
    if (!it.include) return;
    const key = it.quizId.trim().toUpperCase();
    codeCounts[key] = (codeCounts[key] || 0) + 1;
  });

  return items.map((it) => {
    if (!it.include) return [];
    const issues = [];
    if (!QUIZ_ID_RE.test(it.quizId.trim())) issues.push('Quiz code should be 3–12 letters/numbers, no spaces.');
    if (!HOST_CODE_RE.test(it.hostCode.trim())) issues.push('Host code should be 4–10 letters/numbers.');
    if (codeCounts[it.quizId.trim().toUpperCase()] > 1) issues.push('This quiz code is used by another sheet in this batch — make it unique.');
    if (it.structuralProblems.length) issues.push(...it.structuralProblems);
    if (it.rowProblems.length) issues.push(`${it.rowProblems.length} question row issue${it.rowProblems.length === 1 ? '' : 's'} in this sheet — see details below.`);
    return issues;
  });
}

export default function QuizWorkbookUploader({ hostEmail, existingQuizIds = [], onImported }) {
  const [items, setItems] = useState([]); // one entry per sheet
  const [fileName, setFileName] = useState('');
  const [globalError, setGlobalError] = useState('');
  const [defaultTimeLimit, setDefaultTimeLimit] = useState(20);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const issuesByItem = useMemo(() => computeIssues(items), [items]);

  function updateItem(sheetName, patch) {
    setItems(prev => prev.map(it => (it.sheetName === sheetName ? { ...it, ...patch } : it)));
  }

  function removeFile() {
    setItems([]);
    setFileName('');
    setGlobalError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setGlobalError('');
    setItems([]);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        const used = new Set(existingQuizIds.map(id => String(id).toUpperCase()));
        const next = [];

        wb.SheetNames.forEach((sheetName, idx) => {
          // The template's instructions tab has no question columns and
          // isn't meant to become a quiz — skip it by name so users don't
          // have to remember to delete it first.
          if (/^read\s*me$/i.test(sheetName.trim())) return;

          const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
          const { rows, problems: structuralProblems } = parseSheetRows(raw);
          const rowProblems = structuralProblems.length ? [] : validateRows(rows);

          let quizId = slugCode(sheetName, idx);
          quizId = dedupeCode(quizId, used);
          used.add(quizId);

          next.push({
            sheetName,
            quizId,
            title: sheetName.trim() || quizId,
            description: '',
            hostCode: randomHostCode(),
            rows,
            structuralProblems,
            rowProblems,
            include: rows.length > 0 && structuralProblems.length === 0,
            quizCreated: false,
            status: 'pending', // pending | creating | adding | done | error
            error: '',
            result: null,
          });
        });

        if (!next.length) {
          setGlobalError('No usable sheets found in that workbook — add at least one quiz tab.');
        }
        setItems(next);
      } catch (err) {
        setGlobalError('Could not read that file — make sure it\'s a .xlsx or .xls workbook.');
      }
    };
    reader.readAsBinaryString(file);
  }

  async function importOne(item) {
    updateItem(item.sheetName, { status: item.quizCreated ? 'adding' : 'creating', error: '' });
    try {
      if (!item.quizCreated) {
        await quizApi.createQuiz(
          item.quizId.trim().toUpperCase(),
          item.title.trim() || item.quizId.trim().toUpperCase(),
          item.description.trim(),
          hostEmail,
          item.hostCode.trim().toUpperCase(),
          { defaultTimeLimit: Number(defaultTimeLimit) || 20 }
        );
        updateItem(item.sheetName, { quizCreated: true, status: 'adding' });
      }
      const res = await quizApi.addQuestions(item.quizId.trim().toUpperCase(), item.hostCode.trim().toUpperCase(), item.rows);
      updateItem(item.sheetName, { status: 'done', result: res });
    } catch (err) {
      updateItem(item.sheetName, { status: 'error', error: err.message });
    }
  }

  async function handleImportAll() {
    setGlobalError('');
    const targets = items.filter((it, i) => it.include && it.status !== 'done' && issuesByItem[i].length === 0);
    if (!targets.length) {
      setGlobalError('Nothing to import — include at least one sheet with no errors below.');
      return;
    }
    setImporting(true);
    // Sequential on purpose: each row's status updates live in the UI as it
    // goes, and it keeps createQuiz/addQuestions calls from racing on the
    // shared "existing quizzes" state the backend checks against.
    // eslint-disable-next-line no-restricted-syntax
    for (const it of targets) {
      // eslint-disable-next-line no-await-in-loop
      await importOne(it);
    }
    setImporting(false);
    onImported?.();
  }

  const includedCount = items.filter(it => it.include).length;
  const doneCount = items.filter(it => it.status === 'done').length;
  const hasBlockingIssues = items.some((it, i) => it.include && it.status !== 'done' && issuesByItem[i].length > 0);

  return (
    <div className="qxw-scope">
      <QxwStyles />
      <div className="qxw-steps">
        <div className="qxw-step">
          <span className="qxw-step-num">1</span>
          <div>
            <div className="qxw-step-title">Download the workbook template</div>
            <button type="button" className="qxm-btn qxm-btn-outline qxw-btn-sm" onClick={downloadWorkbookTemplate}>
              <i className="fa-solid fa-download" /> Download Workbook Template
            </button>
            <p className="qxw-hint">One tab per quiz — the tab name becomes the quiz title. Duplicate a tab for each new quiz.</p>
          </div>
        </div>
        <div className="qxw-step">
          <span className="qxw-step-num">2</span>
          <div>
            <div className="qxw-step-title">Fill it in and upload the whole workbook here</div>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="qxw-file-input" />
            {fileName && (
              <div className="qxw-file-chip">
                <i className="fa-solid fa-file-excel" />
                <span>{fileName}</span>
                <button type="button" className="qxw-file-remove" onClick={removeFile} title="Remove this file" aria-label="Remove this file">
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
            )}
          </div>
        </div>
        {items.length > 0 && (
          <div className="qxw-step">
            <span className="qxw-step-num">3</span>
            <div style={{ flex: 1 }}>
              <div className="qxw-step-title">Review each quiz, then import</div>
              <label className="qxw-label" style={{ marginTop: 0 }}>Default time per question (sec) — applied to every quiz below</label>
              <input
                className="qxm-input qxw-time-input"
                type="number" min="5" max="120"
                value={defaultTimeLimit}
                disabled={importing}
                onChange={e => setDefaultTimeLimit(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {globalError && <div className="qxm-error" style={{ marginTop: 14 }}>⚠ {globalError}</div>}

      {items.length > 0 && (
        <div className="qxw-items">
          {items.map((it, i) => {
            const issues = issuesByItem[i];
            const locked = it.status === 'creating' || it.status === 'adding' || it.status === 'done';
            return (
              <div key={it.sheetName} className={`qxw-item ${!it.include ? 'qxw-item-excluded' : ''}`}>
                <div className="qxw-item-top">
                  <label className="qxw-checkbox">
                    <input
                      type="checkbox"
                      checked={it.include}
                      disabled={locked || importing}
                      onChange={e => updateItem(it.sheetName, { include: e.target.checked })}
                    />
                    <span className="qxw-sheet-name"><i className="fa-solid fa-table-list" /> {it.sheetName}</span>
                  </label>
                  <StatusBadge status={it.status} count={it.rows.length} />
                </div>

                {it.include && (
                  <>
                    <div className="qxw-item-fields">
                      <div className="qxw-field">
                        <label className="qxw-label">Quiz Code</label>
                        <input
                          className="qxm-input" maxLength={12} disabled={locked || importing}
                          value={it.quizId}
                          onChange={e => updateItem(it.sheetName, { quizId: e.target.value.toUpperCase() })}
                        />
                      </div>
                      <div className="qxw-field">
                        <label className="qxw-label">Title</label>
                        <input
                          className="qxm-input" disabled={locked || importing}
                          value={it.title}
                          onChange={e => updateItem(it.sheetName, { title: e.target.value })}
                        />
                      </div>
                      <div className="qxw-field">
                        <label className="qxw-label">Host Code</label>
                        <input
                          className="qxm-input" maxLength={10} disabled={locked || importing}
                          value={it.hostCode}
                          onChange={e => updateItem(it.sheetName, { hostCode: e.target.value.toUpperCase() })}
                        />
                      </div>
                    </div>

                    {it.rows.length > 0 && (
                      <details className="qxw-details">
                        <summary>{it.rows.length} question{it.rows.length === 1 ? '' : 's'} parsed — preview</summary>
                        <div className="qxw-table-scroll">
                          <table className="qxw-table">
                            <thead><tr><th>#</th><th>Question</th><th>Correct</th></tr></thead>
                            <tbody>
                              {it.rows.map((r, ri) => (
                                <tr key={ri}>
                                  <td>{ri + 1}</td>
                                  <td className="qxw-qtext">{r.questionText}</td>
                                  <td className="qxw-correct">{r.correctAnswer}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    )}

                    {issues.length > 0 && (
                      <div className="qxm-error qxw-issue-box">
                        {issues.map((p, pi) => <div key={pi}>⚠ {p}</div>)}
                      </div>
                    )}

                    {it.status === 'error' && (
                      <div className="qxm-error qxw-issue-box">
                        ⚠ {it.error}
                        <button type="button" className="qxm-btn qxm-btn-outline qxw-btn-sm" style={{ marginTop: 8 }} onClick={() => importOne(it)} disabled={importing}>
                          <i className="fa-solid fa-rotate-right" /> Retry this quiz
                        </button>
                      </div>
                    )}

                    {it.status === 'done' && (
                      <div className="qxw-success">
                        <i className="fa-solid fa-circle-check" /> Created — {it.result?.added ?? it.rows.length} question{(it.result?.added ?? it.rows.length) === 1 ? '' : 's'} added.{' '}
                        <a href={`/quiz-host/${it.quizId}?hostCode=${encodeURIComponent(it.hostCode)}`} target="_blank" rel="noopener noreferrer">Open Host Panel</a>
                      </div>
                    )}
                  </>
                )}
                {!it.include && it.rows.length === 0 && (
                  <div className="qxw-hint" style={{ margin: '8px 0 0' }}>No question rows found on this sheet — skipped.</div>
                )}
              </div>
            );
          })}

          <div className="qxw-import-bar">
            <button
              className="qxm-btn qxm-btn-primary"
              disabled={importing || includedCount === 0 || hasBlockingIssues}
              onClick={handleImportAll}
            >
              {importing
                ? <><i className="fa-solid fa-circle-notch fa-spin" /> Importing…</>
                : <><i className="fa-solid fa-upload" /> Import {includedCount} Quiz{includedCount === 1 ? '' : 'zes'}</>}
            </button>
            {doneCount > 0 && <span className="qxw-hint">{doneCount} of {includedCount} created so far.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, count }) {
  const map = {
    pending: { label: `${count} question${count === 1 ? '' : 's'}`, cls: 'qxw-badge-neutral' },
    creating: { label: 'Creating quiz…', cls: 'qxw-badge-active' },
    adding: { label: 'Adding questions…', cls: 'qxw-badge-active' },
    done: { label: 'Created', cls: 'qxw-badge-done' },
    error: { label: 'Failed', cls: 'qxw-badge-error' },
  };
  const s = map[status] || map.pending;
  return <span className={`qxw-badge ${s.cls}`}>{s.label}</span>;
}

function QxwStyles() {
  return (
    <style jsx global>{`
      .qxw-scope { margin-top: 14px; padding: 16px; background: var(--qxm-bg-well); border: 1px solid var(--qxm-border); border-radius: 14px; }
      .qxw-steps { display: flex; flex-direction: column; gap: 16px; }
      .qxw-step { display: flex; gap: 12px; align-items: flex-start; }
      .qxw-step-num {
        width: 24px; height: 24px; border-radius: 50%; background: var(--qxm-accent); color: #072922;
        display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 12px; flex-shrink: 0;
      }
      .qxw-step-title { font-weight: 700; font-size: 13px; margin-bottom: 8px; }
      .qxw-btn-sm { padding: 9px 14px; font-size: 13px; margin-top: 0; }
      .qxw-hint { font-size: 12px; color: var(--qxm-muted); margin: 8px 0 0; }
      .qxw-file-input { font-size: 13px; color: var(--qxm-text); }
      .qxw-file-chip {
        display: inline-flex; align-items: center; gap: 8px; margin-top: 8px; padding: 7px 10px 7px 12px;
        background: var(--qxm-bg-card); border: 1px solid var(--qxm-border); border-radius: 999px; font-size: 12px;
      }
      .qxw-file-chip i.fa-file-excel { color: var(--qxm-accent); }
      .qxw-file-remove {
        border: none; background: var(--qxm-border); color: var(--qxm-text); width: 20px; height: 20px;
        border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;
        font-size: 10px; padding: 0; flex-shrink: 0;
      }
      .qxw-time-input { max-width: 140px; }
      .qxw-label { display: block; font-size: 11px; color: var(--qxm-muted); margin: 12px 0 5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }

      .qxw-items { margin-top: 18px; display: flex; flex-direction: column; gap: 12px; }
      .qxw-item { background: var(--qxm-bg-card); border: 1px solid var(--qxm-border); border-radius: 14px; padding: 14px 16px; }
      .qxw-item-excluded { opacity: 0.55; }
      .qxw-item-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
      .qxw-checkbox { display: flex; align-items: center; gap: 10px; cursor: pointer; }
      .qxw-checkbox input { width: 16px; height: 16px; accent-color: var(--qxm-accent); }
      .qxw-sheet-name { font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 8px; }
      .qxw-sheet-name i { color: var(--qxm-accent); font-size: 12px; }

      .qxw-badge { font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 100px; white-space: nowrap; }
      .qxw-badge-neutral { background: var(--qxm-border); color: var(--qxm-text); }
      .qxw-badge-active { background: var(--qxm-accent-2); color: #241a00; }
      .qxw-badge-done { background: var(--qxm-accent); color: #072922; }
      .qxw-badge-error { background: rgba(255,92,122,.18); color: var(--qxm-danger); }

      .qxw-item-fields { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 4px; }
      .qxw-item-fields .qxw-field { flex: 1; min-width: 150px; }

      .qxw-details { margin-top: 12px; font-size: 12px; color: var(--qxm-muted); }
      .qxw-details summary { cursor: pointer; font-weight: 600; }
      .qxw-table-scroll { overflow-x: auto; margin-top: 10px; }
      .qxw-table { width: 100%; border-collapse: collapse; min-width: 420px; }
      .qxw-table th, .qxw-table td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--qxm-border); font-size: 12px; }
      .qxw-table th { font-family: var(--qxm-font-mono); font-size: 10px; text-transform: uppercase; color: var(--qxm-muted); }
      .qxw-qtext { max-width: 320px; }
      .qxw-correct { font-weight: 700; color: var(--qxm-accent); }

      .qxw-issue-box { margin-top: 10px; }
      .qxw-success { margin-top: 10px; color: var(--qxm-accent); font-weight: 600; font-size: 13px; }
      .qxw-success a { color: inherit; text-decoration: underline; }

      .qxw-import-bar { display: flex; align-items: center; gap: 14px; margin-top: 4px; }
    `}</style>
  );
}
