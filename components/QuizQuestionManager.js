// components/QuizQuestionManager.js
//
// Lets the host list, add, edit, and delete individual questions directly
// from the front end — no spreadsheet editing needed, and no re-uploading a
// whole Excel file just to fix one typo or swap a correct answer. Sits
// alongside QuizQuestionUploader.js (bulk Excel import) in the same "Upload
// Questions" panel on each quiz card — use either, or both, in any order:
// upload a batch, then hand-tweak a few; or start from nothing and add
// questions one at a time here.
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

  const editable = quizStatus === 'lobby';

  const load = useCallback(() => {
    setLoading(true);
    quizApi.getQuestions(quizId, hostCode)
      .then(res => setQuestions(res.questions || []))
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

  return (
    <div className="qxu-scope" style={{ marginTop: 14 }}>
      <QqmStyles />
      <div className="qxu-preview-title" style={{ marginBottom: 10 }}>
        Manage Questions{questions.length > 0 ? ` (${questions.length})` : ''}
      </div>

      {!editable && (
        <div className="qxm-error" style={{ marginBottom: 12 }}>
          ⚠ This quiz has already started ({quizStatus}) — questions are locked and can no longer be added, edited, or deleted.
        </div>
      )}

      {error && <div className="qxm-error" style={{ marginBottom: 12 }}>⚠ {error}</div>}

      {loading ? (
        <div className="qx-muted" style={{ fontSize: 13 }}><i className="fa-solid fa-circle-notch fa-spin" /> Loading questions…</div>
      ) : (
        <div className="qqm-list">
          {questions.map(q => (
            <div key={q.qNum} className="qqm-row">
              {editingQNum === q.qNum ? (
                <QuestionForm form={form} setForm={setForm} toggleLetter={toggleLetter} saving={saving} onSave={save} onCancel={cancelEdit} />
              ) : (
                <>
                  <div className="qqm-row-main">
                    <span className="qqm-qnum">Q{q.qNum}</span>
                    <span className="qqm-qtext">{q.questionText}</span>
                    <span className="qqm-correct-badge">{q.correctAnswer}</span>
                  </div>
                  {editable && (
                    <div className="qqm-row-actions">
                      <button className="qxm-btn qxm-btn-outline qxu-btn-sm" onClick={() => startEdit(q)}><i className="fa-solid fa-pen" /> Edit</button>
                      <button className="qxm-btn qxm-btn-outline qxu-btn-sm" disabled={deletingQNum === q.qNum} onClick={() => remove(q.qNum)}>
                        {deletingQNum === q.qNum ? <i className="fa-solid fa-circle-notch fa-spin" /> : <i className="fa-solid fa-trash" />} Delete
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}

          {editingQNum === 'new' && (
            <div className="qqm-row">
              <QuestionForm form={form} setForm={setForm} toggleLetter={toggleLetter} saving={saving} onSave={save} onCancel={cancelEdit} />
            </div>
          )}

          {editable && editingQNum === null && (
            <button className="qxm-btn qxm-btn-primary qxu-btn-sm" style={{ marginTop: 10 }} onClick={startAdd}>
              <i className="fa-solid fa-plus" /> Add Question
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function QuestionForm({ form, setForm, toggleLetter, saving, onSave, onCancel }) {
  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));
  return (
    <div className="qqm-form">
      <label className="qxm-label">Question Text</label>
      <textarea className="qxm-input qqm-textarea" value={form.questionText} onChange={set('questionText')} rows={2} />

      <div className="qqm-options-grid">
        {['A', 'B', 'C', 'D'].map(letter => (
          <div key={letter} className="qqm-option-field">
            <label className="qqm-option-label">
              <input
                type="checkbox"
                checked={form.correctLetters.includes(letter)}
                onChange={() => toggleLetter(letter)}
              />
              Option {letter} {form.correctLetters.includes(letter) && <span className="qqm-correct-tag">correct</span>}
            </label>
            <input className="qxm-input" value={form['option' + letter]} onChange={set('option' + letter)} placeholder={letter === 'A' || letter === 'B' ? 'Required' : 'Optional'} />
          </div>
        ))}
      </div>

      <div className="qxm-form-row" style={{ marginTop: 10 }}>
        <div className="qxm-field">
          <label className="qxm-label">Time Limit (sec)</label>
          <input className="qxm-input" type="number" min="5" max="120" value={form.timeLimitSec} onChange={set('timeLimitSec')} placeholder="Quiz default" />
        </div>
        <div className="qxm-field">
          <label className="qxm-label">Points</label>
          <input className="qxm-input" type="number" min="0" value={form.points} onChange={set('points')} placeholder="Quiz default" />
        </div>
      </div>
      <label className="qxm-label">Media URL (optional)</label>
      <input className="qxm-input" value={form.mediaUrl} onChange={set('mediaUrl')} placeholder="https://..." />

      <div className="qqm-form-actions">
        <button className="qxm-btn qxm-btn-primary qxu-btn-sm" disabled={saving} onClick={onSave}>
          {saving ? <><i className="fa-solid fa-circle-notch fa-spin" /> Saving…</> : <><i className="fa-solid fa-check" /> Save</>}
        </button>
        <button className="qxm-btn qxm-btn-outline qxu-btn-sm" disabled={saving} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function QqmStyles() {
  return (
    <style jsx global>{`
      .qqm-list { display: flex; flex-direction: column; gap: 8px; }
      .qqm-row { background: var(--qxm-bg-card); border: 1px solid var(--qxm-border); border-radius: 10px; padding: 10px 12px; }
      .qqm-row-main { display: flex; align-items: baseline; gap: 10px; }
      .qqm-qnum { font-family: var(--qxm-font-mono); font-size: 11px; color: var(--qxm-muted); flex-shrink: 0; }
      .qqm-qtext { flex: 1; font-size: 13px; }
      .qqm-correct-badge { font-family: var(--qxm-font-mono); font-size: 11px; font-weight: 700; color: var(--qxm-accent); flex-shrink: 0; }
      .qqm-row-actions { display: flex; gap: 6px; margin-top: 8px; }

      .qqm-form { display: flex; flex-direction: column; gap: 4px; }
      .qqm-textarea { resize: vertical; font-family: inherit; }
      .qqm-options-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-top: 10px; }
      .qqm-option-field { display: flex; flex-direction: column; gap: 4px; }
      .qqm-option-label { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--qxm-muted); font-weight: 700; }
      .qqm-correct-tag { font-size: 10px; color: var(--qxm-accent); text-transform: uppercase; }
      .qqm-form-actions { display: flex; gap: 8px; margin-top: 12px; }
    `}</style>
  );
}
