// components/OnlineQuizManager.js
//
// Lets a logged-in teacher create a new quiz (Quiz Config row) and see the
// quizzes they've already created, with quick links to the host panel and
// the student join link. Rendered inside parent-portal.js's main content
// area when the teacher clicks "Online Quizzes" in the sidebar.
//
// hostEmail is whatever identity string parent-portal.js's login captured
// (see INTEGRATION note) — it must match Code.gs's Host Email comparisons
// exactly (case-insensitive) for start/next/end actions on quizzes created
// here to work later.

import { useState, useEffect, useCallback } from 'react';
import { quizApi } from '../lib/quizApi';

const STATUS_COLORS = {
  draft: '#94a3b8', lobby: '#60a5fa', live: '#4ade80', paused: '#fbbf24', ended: '#94a3b8',
};

export default function OnlineQuizManager({ hostEmail }) {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);

  const load = useCallback(() => {
    if (!hostEmail) return;
    setLoading(true);
    quizApi.getMyQuizzes(hostEmail)
      .then(res => setQuizzes(res.quizzes))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [hostEmail]);

  useEffect(() => { load(); }, [load]);

  function copyJoinLink(code) {
    const url = `${window.location.origin}/quiz/${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 1800);
    });
  }

  if (!hostEmail) {
    return (
      <div className="oqm-empty">
        <i className="fa-solid fa-triangle-exclamation" />
        Could not determine your host identity — quizzes need a stable login
        email/username to know which ones are yours. Try signing out and back in.
      </div>
    );
  }

  return (
    <div className="oqm-wrap">
      <div className="oqm-header">
        <div>
          <div className="pt-ph">Online Quizzes</div>
          <div className="pt-ps">Create a Kahoot-style quiz and host it live for your class</div>
        </div>
        <button className="ptbtn" style={{ width: 'auto', padding: '10px 18px' }} onClick={() => setShowCreate(v => !v)}>
          <i className={`fa-solid ${showCreate ? 'fa-xmark' : 'fa-plus'}`} /> {showCreate ? 'Cancel' : 'New Quiz'}
        </button>
      </div>

      {showCreate && (
        <CreateQuizForm
          hostEmail={hostEmail}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}

      {error && <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 12, padding: 16, color: '#f87171', marginBottom: 16 }}>⚠ {error}</div>}

      {loading ? (
        <div className="pt-empty"><i className="fa-solid fa-circle-notch fa-spin" /> Loading your quizzes…</div>
      ) : quizzes.length === 0 ? (
        <div className="pt-empty">
          <i className="fa-solid fa-gamepad" style={{ fontSize: 32, color: 'var(--muted)', display: 'block', marginBottom: 12 }} />
          You haven't created any quizzes yet.
        </div>
      ) : (
        <div className="oqm-list">
          {quizzes.map(q => (
            <div key={q.quizId} className="oqm-card">
              <div className="oqm-card-top">
                <div>
                  <div className="oqm-card-title">{q.title}</div>
                  <div className="oqm-card-code">{q.quizId}</div>
                </div>
                <span className="oqm-badge" style={{ background: STATUS_COLORS[q.status] || '#94a3b8' }}>{q.status}</span>
              </div>
              {q.description && <div className="oqm-card-desc">{q.description}</div>}
              <div className="oqm-card-actions">
                <a className="ptbtn oqm-btn-sm" href={`/quiz-host/${q.quizId}`} target="_blank" rel="noopener noreferrer">
                  <i className="fa-solid fa-tv" /> Open Host Panel
                </a>
                <button className="oqm-btn-outline" onClick={() => copyJoinLink(q.quizId)}>
                  <i className="fa-solid fa-link" /> {copiedCode === q.quizId ? 'Copied!' : 'Copy Join Link'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <OqmStyles />
    </div>
  );
}

function CreateQuizForm({ hostEmail, onCreated }) {
  const [quizId, setQuizId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [defaultTimeLimit, setDefaultTimeLimit] = useState(20);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setErr('');
    if (!quizId.trim()) { setErr('Enter a quiz code.'); return; }
    if (!/^[A-Za-z0-9]{3,12}$/.test(quizId.trim())) { setErr('Code should be 3–12 letters/numbers, no spaces.'); return; }
    setSaving(true);
    try {
      await quizApi.createQuiz(quizId.trim().toUpperCase(), title.trim() || quizId.trim().toUpperCase(), description.trim(), hostEmail, { defaultTimeLimit: Number(defaultTimeLimit) || 20 });
      onCreated();
    } catch (error) {
      setErr(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="pt-card oqm-create-form">
      <div className="oqm-form-row">
        <div className="oqm-field">
          <label className="ptll">Quiz Code</label>
          <input className="pt-input" value={quizId} onChange={e => setQuizId(e.target.value.toUpperCase())} placeholder="e.g. MATH7A" maxLength={12} />
        </div>
        <div className="oqm-field">
          <label className="ptll">Default time per question (sec)</label>
          <input className="pt-input" type="number" min="5" max="120" value={defaultTimeLimit} onChange={e => setDefaultTimeLimit(e.target.value)} />
        </div>
      </div>
      <div className="oqm-field">
        <label className="ptll">Title</label>
        <input className="pt-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Chapter 7 Recap" />
      </div>
      <div className="oqm-field">
        <label className="ptll">Description (optional)</label>
        <input className="pt-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Shown to students in the lobby" />
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 12px' }}>
        After creating, add your questions to the <strong>Quiz Questions</strong> tab in the Quiz System
        sheet under this exact code before starting the quiz.
      </p>
      {err && <div className="pterr">⚠ {err}</div>}
      <button className="ptbtn" type="submit" disabled={saving} style={{ width: 'auto', padding: '10px 20px' }}>
        {saving ? <><i className="fa-solid fa-circle-notch fa-spin" /> Creating…</> : <><i className="fa-solid fa-check" /> Create Quiz</>}
      </button>
    </form>
  );
}

function OqmStyles() {
  return (
    <style jsx global>{`
      .oqm-wrap { padding: 4px; }
      .oqm-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
      .oqm-empty { padding: 24px; color: #f87171; }
      .oqm-create-form { margin-bottom: 24px; }
      .oqm-form-row { display: flex; gap: 16px; flex-wrap: wrap; }
      .oqm-field { flex: 1; min-width: 180px; margin-bottom: 12px; }
      .oqm-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
      .oqm-card { background: var(--surf, #1e293b); border: 1px solid var(--border, #334155); border-radius: 14px; padding: 16px; }
      .oqm-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
      .oqm-card-title { font-weight: 700; font-size: 15px; }
      .oqm-card-code { font-family: monospace; letter-spacing: 1px; color: var(--muted, #94a3b8); font-size: 13px; margin-top: 2px; }
      .oqm-card-desc { font-size: 13px; color: var(--muted, #94a3b8); margin: 8px 0; }
      .oqm-badge { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; padding: 3px 9px; border-radius: 100px; color: #0f172a; height: fit-content; }
      .oqm-card-actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
      .oqm-btn-sm { padding: 8px 14px !important; font-size: 13px !important; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
      .oqm-btn-outline { padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border, #334155); background: transparent; color: var(--text, #fff); font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
    `}</style>
  );
}
