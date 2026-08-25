// components/QuizQuestionManager.js
//
// Lets the host list, add, edit, and delete individual questions directly
// from the front end — no spreadsheet editing needed, and no re-uploading a
// whole Excel file just to fix one typo or swap a correct answer. Rendered
// as a full-width table (one row per question, one column per option) so a
// whole question bank is scannable at a glance — mounted full-page-width by
// OnlineQuizManager.js (outside the card grid), not squeezed into one card's
// column. Sits alongside QuizQuestionUploader.js (bulk Excel import) in the
// same panel — use either, or both, in any order: upload a batch, then
// hand-tweak a few; or start from nothing and add questions one at a time
// here.
//
// Only usable while the quiz is still in the lobby (hasn't been started) —
// enforced server-side too (assertEditableQuestions in pages/api/quiz.js).
// Once a quiz goes live its question bank is frozen, so edits can't land
// underneath an in-progress question on the projector.

import { useState, useEffect, useCallback } from 'react';
import { quizApi } from '../lib/quizApi';

const BLANK_FORM = {
  questionText: '', optionA: '', optionB: '', optionC: '', optionD: '',
  correctLetters: [], timeLimitSec: '', points: '', mediaUrl: '',
};

function toForm(q) {
  return {
    questionText: q.questionText || '',
    optionA: q.optionA || '', optionB: q.optionB || '', optionC: q.optionC || '', optionD: q.optionD || '',
    correctLetters: (q.correctAnswer || '').split(',').map(s => s.trim()).filter(Boolean),
    timeLimitSec: q.timeLimitSec || '', points: q.points || '', mediaUrl: q.mediaUrl || '',
  };
}

function toApiFields(form) {
  return {
    questionText: form.questionText.trim(),
    optionA: form.optionA.trim(), optionB: form.optionB.trim(), optionC: form.optionC.trim(), optionD: form.optionD.trim(),
    correctAnswer: form.correctLetters.join(','),
    timeLimitSec: form.timeLimitSec ? Number(form.timeLimitSec) : null,
    points: form.points ? Number(form.points) : null,
    mediaUrl: form.mediaUrl.trim(),
  };
}

export default function QuizQuestionManager({ quizId, hostCode, quizStatus }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingQNum, setEditingQNum] = useState(null); // null | 'new' | number
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingQNum, setDeletingQNum] = useState(null);
  const [selected, setSelected] = useState(() => new Set()); // qNums checked for bulk delete
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  const editable = quizStatus === 'lobby';

  const load = useCallback(() => {
    setLoading(true);
    quizApi.getQuestions(quizId, hostCode)
      .then(res => {
        setQuestions(res.questions || []);
        setSelected(new Set()); // question numbers can be renumbered after a delete, so don't carry old selections forward
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [quizId, hostCode]);

  useEffect(() => { load(); }, [load]);

  function startEdit(q) {
    setEditingQNum(q.qNum);
    setForm(toForm(q));
    setError('');
  }

  function startAdd() {
    setEditingQNum('new');
    setForm(BLANK_FORM);
    setError('');
  }

  function cancelEdit() {
    setEditingQNum(null);
    setForm(BLANK_FORM);
  }

  function toggleLetter(letter) {
    setForm(f => ({
      ...f,
      correctLetters: f.correctLetters.includes(letter)
        ? f.correctLetters.filter(l => l !== letter)
        : [...f.correctLetters, letter],
    }));
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const fields = toApiFields(form);
      if (editingQNum === 'new') {
        await quizApi.addQuestions(quizId, hostCode, [fields]);
      } else {
        await quizApi.updateQuestion(quizId, hostCode, editingQNum, fields);
      }
      cancelEdit();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(qNum) {
    if (!window.confirm('Delete question ' + qNum + '? Questions after it will shift down by one.')) return;
    setDeletingQNum(qNum);
    setError('');
    try {
      await quizApi.deleteQuestion(quizId, hostCode, qNum);
      if (editingQNum === qNum) cancelEdit();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingQNum(null);
    }
  }

  function toggleSelected(qNum) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(qNum)) next.delete(qNum); else next.add(qNum);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected(prev => (prev.size === questions.length ? new Set() : new Set(questions.map(q => q.qNum))));
  }

  // Deletes every checked question in one request rather than one round trip
  // per row — this is what makes "check a batch, delete them" fast enough to
  // actually use instead of clicking the trash icon N times.
  async function removeSelected() {
    const qNums = Array.from(selected);
    if (!qNums.length) return;
    if (!window.confirm(`Delete ${qNums.length} selected question${qNums.length === 1 ? '' : 's'}? The remaining questions will be renumbered.`)) return;
    setBulkDeleting(true);
    setError('');
    try {
      await quizApi.deleteQuestions(quizId, hostCode, qNums);
      cancelEdit();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkDeleting(false);
    }
  }

  // Wipes the whole question bank for this quiz — the "start over" button
  // for a host who uploaded the wrong Excel file and wants to re-upload a
  // fresh one, without deleting questions one row (or one checkbox-batch)
  // at a time first.
  async function clearAll() {
    if (!questions.length) return;
    if (!window.confirm(`Delete ALL ${questions.length} question${questions.length === 1 ? '' : 's'} in this quiz? This can't be undone — you'll need to re-add or re-upload a question set before starting the quiz.`)) return;
    setClearingAll(true);
    setError('');
    try {
      await quizApi.deleteAllQuestions(quizId, hostCode);
      cancelEdit();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setClearingAll(false);
    }
  }

  return (
    <div className="qqm-scope">
      <QqmStyles />
      <div className="qqm-toolbar">
        <div className="qqm-title">Manage Questions{questions.length > 0 ? ` (${questions.length})` : ''}</div>
        <div className="qqm-toolbar-actions">
          {editable && selected.size > 0 && (
            <button className="qqm-btn qqm-btn-danger" disabled={bulkDeleting || clearingAll} onClick={removeSelected}>
              {bulkDeleting ? <i className="fa-solid fa-circle-notch fa-spin" /> : <i className="fa-solid fa-trash" />} Delete Selected ({selected.size})
            </button>
          )}
          {editable && questions.length > 0 && editingQNum === null && (
            <button className="qqm-btn qqm-btn-danger" disabled={clearingAll || bulkDeleting} onClick={clearAll} title="Remove every question so you can upload a fresh sheet">
              {clearingAll ? <i className="fa-solid fa-circle-notch fa-spin" /> : <i className="fa-solid fa-broom" />} Delete All Questions
            </button>
          )}
          {editable && editingQNum === null && (
            <button className="qqm-btn qqm-btn-primary" onClick={startAdd}>
              <i className="fa-solid fa-plus" /> Add Question
            </button>
          )}
        </div>
      </div>

      {!editable && (
        <div className="qqm-banner">⚠ This quiz has already started ({quizStatus}) — questions are locked and can no longer be added, edited, or deleted.</div>
      )}
      {error && <div className="qqm-banner qqm-banner-error">⚠ {error}</div>}

      {loading ? (
        <div className="qqm-loading"><i className="fa-solid fa-circle-notch fa-spin" /> Loading questions…</div>
      ) : (
        <div className="qqm-table-wrap">
          <table className="qqm-table">
            <thead>
              <tr>
                {editable && (
                  <th className="qqm-col-check">
                    <input
                      type="checkbox"
                      checked={questions.length > 0 && selected.size === questions.length}
                      onChange={toggleSelectAll}
                      disabled={questions.length === 0}
                      title="Select all"
                    />
                  </th>
                )}
                <th className="qqm-col-num">#</th>
                <th className="qqm-col-question">Question</th>
                <th>Option A</th>
                <th>Option B</th>
                <th>Option C</th>
                <th>Option D</th>
                <th className="qqm-col-narrow">Time (s)</th>
                <th className="qqm-col-narrow">Points</th>
                <th className="qqm-col-narrow">Media</th>
                {editable && <th className="qqm-col-actions">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {questions.map(q => (
                editingQNum === q.qNum ? (
                  <EditableRow key={q.qNum} qNum={q.qNum} form={form} setForm={setForm} toggleLetter={toggleLetter}
                    saving={saving} onSave={save} onCancel={cancelEdit} editable={editable} />
                ) : (
                  <ReadRow key={q.qNum} q={q} editable={editable} onEdit={() => startEdit(q)}
                    onDelete={() => remove(q.qNum)} deleting={deletingQNum === q.qNum}
                    checked={selected.has(q.qNum)} onToggleChecked={() => toggleSelected(q.qNum)} />
                )
              ))}
              {editingQNum === 'new' && (
                <EditableRow qNum="new" form={form} setForm={setForm} toggleLetter={toggleLetter}
                  saving={saving} onSave={save} onCancel={cancelEdit} editable={editable} />
              )}
              {questions.length === 0 && editingQNum !== 'new' && (
                <tr><td colSpan={editable ? 11 : 9} className="qqm-empty">No questions yet — upload an Excel file above, or click "Add Question".</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReadRow({ q, editable, onEdit, onDelete, deleting, checked, onToggleChecked }) {
  const correct = new Set((q.correctAnswer || '').split(',').map(s => s.trim()));
  return (
    <tr>
      {editable && (
        <td className="qqm-col-check">
          <input type="checkbox" checked={!!checked} onChange={onToggleChecked} />
        </td>
      )}
      <td className="qqm-col-num">{q.qNum}</td>
      <td className="qqm-td-question">{q.questionText}</td>
      <td className={correct.has('A') ? 'qqm-td-correct' : ''}>{q.optionA}</td>
      <td className={correct.has('B') ? 'qqm-td-correct' : ''}>{q.optionB}</td>
      <td className={correct.has('C') ? 'qqm-td-correct' : ''}>{q.optionC}</td>
      <td className={correct.has('D') ? 'qqm-td-correct' : ''}>{q.optionD}</td>
      <td className="qqm-col-narrow qqm-muted">{q.timeLimitSec || '—'}</td>
      <td className="qqm-col-narrow qqm-muted">{q.points || '—'}</td>
      <td className="qqm-col-narrow qqm-muted">{q.mediaUrl ? <a href={q.mediaUrl} target="_blank" rel="noopener noreferrer">link</a> : '—'}</td>
      {editable && (
        <td className="qqm-col-actions">
          <button className="qqm-btn qqm-btn-icon" onClick={onEdit} title="Edit"><i className="fa-solid fa-pen" /></button>
          <button className="qqm-btn qqm-btn-icon" disabled={deleting} onClick={onDelete} title="Delete">
            {deleting ? <i className="fa-solid fa-circle-notch fa-spin" /> : <i className="fa-solid fa-trash" />}
          </button>
        </td>
      )}
    </tr>
  );
}

function OptionCell({ letter, form, setForm, toggleLetter }) {
  const key = 'option' + letter;
  return (
    <td className="qqm-td-option-edit">
      <label className="qqm-correct-check">
        <input type="checkbox" checked={form.correctLetters.includes(letter)} onChange={() => toggleLetter(letter)} />
        <span>correct</span>
      </label>
      <input
        className="qqm-cell-input"
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        placeholder={letter === 'A' || letter === 'B' ? 'Required' : 'Optional'}
      />
    </td>
  );
}

function EditableRow({ qNum, form, setForm, toggleLetter, saving, onSave, onCancel, editable }) {
  return (
    <tr className="qqm-row-editing">
      {editable && <td className="qqm-col-check" />}
      <td className="qqm-col-num">{qNum === 'new' ? 'new' : qNum}</td>
      <td className="qqm-td-question-edit">
        <textarea
          className="qqm-cell-input qqm-cell-textarea"
          rows={2}
          value={form.questionText}
          onChange={e => setForm(f => ({ ...f, questionText: e.target.value }))}
        />
      </td>
      <OptionCell letter="A" form={form} setForm={setForm} toggleLetter={toggleLetter} />
      <OptionCell letter="B" form={form} setForm={setForm} toggleLetter={toggleLetter} />
      <OptionCell letter="C" form={form} setForm={setForm} toggleLetter={toggleLetter} />
      <OptionCell letter="D" form={form} setForm={setForm} toggleLetter={toggleLetter} />
      <td className="qqm-col-narrow">
        <input className="qqm-cell-input" type="number" min="5" max="120" value={form.timeLimitSec}
          onChange={e => setForm(f => ({ ...f, timeLimitSec: e.target.value }))} placeholder="Default" />
      </td>
      <td className="qqm-col-narrow">
        <input className="qqm-cell-input" type="number" min="0" value={form.points}
          onChange={e => setForm(f => ({ ...f, points: e.target.value }))} placeholder="Default" />
      </td>
      <td className="qqm-col-narrow">
        <input className="qqm-cell-input" value={form.mediaUrl}
          onChange={e => setForm(f => ({ ...f, mediaUrl: e.target.value }))} placeholder="URL" />
      </td>
      <td className="qqm-col-actions">
        <button className="qqm-btn qqm-btn-icon qqm-btn-save" disabled={saving} onClick={onSave} title="Save">
          {saving ? <i className="fa-solid fa-circle-notch fa-spin" /> : <i className="fa-solid fa-check" />}
        </button>
        <button className="qqm-btn qqm-btn-icon" disabled={saving} onClick={onCancel} title="Cancel">
          <i className="fa-solid fa-xmark" />
        </button>
      </td>
    </tr>
  );
}

function QqmStyles() {
  return (
    <style jsx global>{`
      .qqm-scope {
        --qqm-bg: #1d1f42; --qqm-bg-well: #262a52; --qqm-border: #383c6e;
        --qqm-accent: #22d3b0; --qqm-danger: #ff5c7a; --qqm-text: #f5f6ff; --qqm-muted: #9296c4;
        font-family: 'Manrope', -apple-system, sans-serif;
        color: var(--qqm-text);
      }
      .qqm-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
      .qqm-toolbar-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .qqm-title { font-weight: 700; font-size: 16px; }
      .qqm-col-check { width: 32px; text-align: center; }
      .qqm-col-check input { width: 15px; height: 15px; cursor: pointer; }

      .qqm-banner { background: rgba(255,176,32,.12); border: 1px solid rgba(255,176,32,.3); color: #ffb020; padding: 10px 14px; border-radius: 10px; margin-bottom: 14px; font-size: 13px; font-weight: 600; }
      .qqm-banner-error { background: rgba(255,92,122,.12); border-color: rgba(255,92,122,.3); color: var(--qqm-danger); }
      .qqm-loading { padding: 20px; text-align: center; color: var(--qqm-muted); font-size: 13px; }
      .qqm-empty { padding: 24px; text-align: center; color: var(--qqm-muted); font-size: 13px; }

      .qqm-table-wrap { overflow-x: auto; border: 1px solid var(--qqm-border); border-radius: 12px; }
      .qqm-table { width: 100%; border-collapse: collapse; min-width: 980px; font-size: 13px; }
      .qqm-table th {
        text-align: left; padding: 10px 12px; background: var(--qqm-bg-well); font-family: 'Space Mono', ui-monospace, monospace;
        font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: var(--qqm-muted); font-weight: 700;
        border-bottom: 1px solid var(--qqm-border); position: sticky; top: 0;
      }
      .qqm-table td { padding: 10px 12px; border-bottom: 1px solid var(--qqm-border); vertical-align: top; background: var(--qqm-bg); }
      .qqm-table tr:last-child td { border-bottom: none; }
      .qqm-col-num { width: 36px; font-family: 'Space Mono', ui-monospace, monospace; color: var(--qqm-muted); }
      .qqm-col-narrow { width: 90px; }
      .qqm-col-actions { width: 90px; white-space: nowrap; }
      .qqm-td-question { max-width: 320px; }
      .qqm-td-correct { color: var(--qqm-accent); font-weight: 700; }
      .qqm-muted { color: var(--qqm-muted); }

      .qqm-row-editing td { background: var(--qqm-bg-well); }
      .qqm-cell-input {
        width: 100%; padding: 7px 9px; border-radius: 6px; border: 1.5px solid var(--qqm-border);
        background: var(--qqm-bg); color: var(--qqm-text); font-size: 12px; font-family: inherit; box-sizing: border-box;
      }
      .qqm-cell-input:focus { outline: none; border-color: var(--qqm-accent); }
      .qqm-cell-textarea { resize: vertical; min-width: 220px; }
      .qqm-td-question-edit { min-width: 220px; }
      .qqm-td-option-edit { min-width: 140px; }
      .qqm-correct-check { display: flex; align-items: center; gap: 5px; font-size: 10px; color: var(--qqm-muted); font-weight: 700; text-transform: uppercase; margin-bottom: 5px; }

      .qqm-btn {
        border: 1px solid var(--qqm-border); background: var(--qqm-bg-well); color: var(--qqm-text);
        border-radius: 8px; cursor: pointer; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;
        padding: 8px 14px; font-size: 13px; font-family: inherit;
      }
      .qqm-btn-primary { background: var(--qqm-accent); border-color: var(--qqm-accent); color: #072922; }
      .qqm-btn-danger { background: var(--qqm-danger); border-color: var(--qqm-danger); color: #2a0410; }
      .qqm-btn-icon { padding: 7px 10px; margin-right: 4px; }
      .qqm-btn-save { background: var(--qqm-accent); border-color: var(--qqm-accent); color: #072922; }
      .qqm-btn:disabled { opacity: .5; cursor: not-allowed; }
    `}</style>
  );
}
