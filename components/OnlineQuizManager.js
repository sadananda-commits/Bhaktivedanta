// components/OnlineQuizManager.js
//
// Lets a logged-in teacher or parent create a new quiz (Quiz Config row)
// and see the quizzes they've already created, with quick links to the
// host panel and the student join link. Rendered inside parent-portal.js's
// main content area.
//
// Styled with the same color/type tokens as the live-quiz screens (see
// lib/quizTheme.js) but scoped locally rather than taking over the page —
// this panel lives inside Parent Portal's existing chrome, not a
// standalone full-bleed screen.

import { useState, useEffect, useCallback } from 'react';
import { quizApi } from '../lib/quizApi';
import { QuizFonts } from '../lib/quizTheme';
import QuizQuestionUploader from './QuizQuestionUploader';
import QuizQuestionManager from './QuizQuestionManager';

// Short, easy-to-read-aloud host code: no 0/O/1/I so it's unambiguous on a
// projector or read out over a classroom.
function randomHostCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const STATUS_COLORS = {
  draft: '#9296c4', lobby: '#6c7bff', live: '#22d3b0', paused: '#ffb020', ended: '#9296c4',
};

export default function OnlineQuizManager({ hostEmail }) {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);
  const [copiedHostCode, setCopiedHostCode] = useState(null);
  const [uploaderForQuiz, setUploaderForQuiz] = useState(null);
  const [questionsRefreshKey, setQuestionsRefreshKey] = useState(0);
  const [resettingQuizId, setResettingQuizId] = useState(null);

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

  function copyHostCode(quizId, hostCode) {
    navigator.clipboard.writeText(hostCode).then(() => {
      setCopiedHostCode(quizId);
      setTimeout(() => setCopiedHostCode(null), 1800);
    });
  }

  if (!hostEmail) {
    return (
      <div className="qxm-scope">
        <QuizFonts /><QxmStyles />
        <div className="qxm-empty"><i className="fa-solid fa-triangle-exclamation" /> Could not determine your login identity — try signing out and back in.</div>
      </div>
    );
  }

  return (
    <div className="qxm-scope">
      <QuizFonts /><QxmStyles />
      <div className="qxm-header">
        <div>
          <div className="qxm-eyebrow">Live quizzes</div>
          <div className="qxm-h1">Online Quizzes</div>
          <div className="qxm-sub">Create a quiz and host it live for your class</div>
        </div>
        <button className="qxm-btn qxm-btn-primary" onClick={() => setShowCreate(v => !v)}>
          <i className={`fa-solid ${showCreate ? 'fa-xmark' : 'fa-plus'}`} /> {showCreate ? 'Cancel' : 'New Quiz'}
        </button>
      </div>

      {showCreate && <CreateQuizForm hostEmail={hostEmail} onCreated={() => { setShowCreate(false); load(); }} />}

      {error && <div className="qxm-error">⚠ {error}</div>}

      {loading ? (
        <div className="qxm-empty"><i className="fa-solid fa-circle-notch fa-spin" /> Loading your quizzes…</div>
      ) : quizzes.length === 0 ? (
        <div className="qxm-empty">
          <i className="fa-solid fa-gamepad" style={{ fontSize: 30, opacity: .5, display: 'block', marginBottom: 10 }} />
          No quizzes yet — create one to get started.
        </div>
      ) : (
        <div className="qxm-list">
          {quizzes.map(q => (
            <div key={q.quizId} className="qxm-card">
              <div className="qxm-card-top">
                <div>
                  <div className="qxm-card-title">{q.title}</div>
                  <div className="qxm-card-code">{q.quizId}</div>
                </div>
                <span className="qxm-badge" style={{ background: STATUS_COLORS[q.status] || '#9296c4' }}>{q.status}</span>
              </div>
              {q.description && <div className="qxm-card-desc">{q.description}</div>}
              {q.hostCode && (
                <div className="qxm-hostcode-row">
                  <span className="qx-muted" style={{ fontSize: 12 }}>Host code</span>
                  <span className="qxm-hostcode">{q.hostCode}</span>
                  <button className="qxm-hostcode-copy" onClick={() => copyHostCode(q.quizId, q.hostCode)} title="Copy host code">
                    <i className="fa-solid fa-copy" /> {copiedHostCode === q.quizId ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              )}
              <div className="qxm-card-actions">
                <a
                  className="qxm-btn qxm-btn-primary qxm-btn-sm"
                  href={`/quiz-host/${q.quizId}${q.hostCode ? `?hostCode=${encodeURIComponent(q.hostCode)}` : ''}`}
                  target="_blank" rel="noopener noreferrer"
                >
                  <i className="fa-solid fa-tv" /> Open Host Panel
                </a>
                <button className="qxm-btn qxm-btn-outline" onClick={() => copyJoinLink(q.quizId)}>
                  <i className="fa-solid fa-link" /> {copiedCode === q.quizId ? 'Copied!' : 'Copy Join Link'}
                </button>
                <button
                  className="qxm-btn qxm-btn-outline"
                  onClick={() => setUploaderForQuiz(v => v === q.quizId ? null : q.quizId)}
                >
                  <i className="fa-solid fa-list-check" /> {uploaderForQuiz === q.quizId ? 'Close' : 'Manage Questions'}
                </button>
                {(q.status === 'paused' || q.status === 'ended') && (
                  <button
                    className="qxm-btn qxm-btn-outline qxm-btn-danger"
                    disabled={resettingQuizId === q.quizId}
                    onClick={async () => {
                      if (!window.confirm('Reset this quiz back to the start? Every submitted answer and the leaderboard will be cleared — participants stay joined and can play again from Question 1.')) return;
                      setResettingQuizId(q.quizId);
                      setError('');
                      try {
                        await quizApi.resetQuiz(q.quizId, q.hostCode);
                        load();
                      } catch (err) {
                        setError(err.message);
                      } finally {
                        setResettingQuizId(null);
                      }
                    }}
                  >
                    {resettingQuizId === q.quizId
                      ? <i className="fa-solid fa-circle-notch fa-spin" />
                      : <i className="fa-solid fa-rotate-left" />} Reset Quiz
                  </button>
                )}
              </div>

              {uploaderForQuiz === q.quizId && (
                <>
                  <QuizQuestionUploader
                    quizId={q.quizId}
                    hostCode={q.hostCode}
                    onDone={() => setQuestionsRefreshKey(k => k + 1)}
                  />
                  <QuizQuestionManager
                    key={questionsRefreshKey}
                    quizId={q.quizId}
                    hostCode={q.hostCode}
                    quizStatus={q.status}
                  />
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateQuizForm({ hostEmail, onCreated }) {
  const [quizId, setQuizId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [defaultTimeLimit, setDefaultTimeLimit] = useState(20);
  const [hostCode, setHostCode] = useState(randomHostCode);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setErr('');
    if (!quizId.trim()) { setErr('Enter a quiz code.'); return; }
    if (!/^[A-Za-z0-9]{3,12}$/.test(quizId.trim())) { setErr('Code should be 3–12 letters/numbers, no spaces.'); return; }
    if (!hostCode.trim()) { setErr('Enter a host code (or click Generate).'); return; }
    if (!/^[A-Za-z0-9]{4,10}$/.test(hostCode.trim())) { setErr('Host code should be 4–10 letters/numbers.'); return; }
    setSaving(true);
    try {
      await quizApi.createQuiz(
        quizId.trim().toUpperCase(),
        title.trim() || quizId.trim().toUpperCase(),
        description.trim(),
        hostEmail,
        hostCode.trim().toUpperCase(),
        { defaultTimeLimit: Number(defaultTimeLimit) || 20 }
      );
      onCreated();
    } catch (error) {
      setErr(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="qxm-form">
      <div className="qxm-form-row">
        <div className="qxm-field">
          <label className="qxm-label">Quiz Code</label>
          <input className="qxm-input" value={quizId} onChange={e => setQuizId(e.target.value.toUpperCase())} placeholder="e.g. MATH7A" maxLength={12} />
        </div>
        <div className="qxm-field">
          <label className="qxm-label">Default time per question (sec)</label>
          <input className="qxm-input" type="number" min="5" max="120" value={defaultTimeLimit} onChange={e => setDefaultTimeLimit(e.target.value)} />
        </div>
      </div>
      <div className="qxm-field">
        <label className="qxm-label">Title</label>
        <input className="qxm-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Chapter 7 Recap" />
      </div>
      <div className="qxm-field">
        <label className="qxm-label">Description (optional)</label>
        <input className="qxm-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Shown to students in the lobby" />
      </div>
      <div className="qxm-field">
        <label className="qxm-label">Host Access Code</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="qxm-input"
            value={hostCode}
            onChange={e => setHostCode(e.target.value.toUpperCase())}
            placeholder="e.g. K7QX4M"
            maxLength={10}
          />
          <button type="button" className="qxm-btn qxm-btn-outline" style={{ whiteSpace: 'nowrap' }} onClick={() => setHostCode(randomHostCode())}>
            <i className="fa-solid fa-shuffle" /> Generate
          </button>
        </div>
        <p className="qxm-hint" style={{ marginBottom: 0 }}>
          This is what unlocks the host/big-screen panel for this quiz — no portal login needed there.
          Keep it, you'll type it in (or it'll be pre-filled) when you open the Host Panel.
        </p>
      </div>
      <p className="qxm-hint">
        After creating, add questions from the <strong>Upload Questions</strong> button on the quiz card
        (fill in the Excel template and upload it — no spreadsheet back-end editing needed), or add them
        directly to the <strong>Quiz Questions</strong> tab in the Quiz System sheet under this exact code.
        For a question with more than one correct answer, list them together in <strong>Correct Answer</strong>
        separated by commas (e.g. <code>A,C</code>) — the quiz will automatically let students pick multiple
        options for that question.
      </p>
      {err && <div className="qxm-error">⚠ {err}</div>}
      <button className="qxm-btn qxm-btn-primary" type="submit" disabled={saving}>
        {saving ? <><i className="fa-solid fa-circle-notch fa-spin" /> Creating…</> : <><i className="fa-solid fa-check" /> Create Quiz</>}
      </button>
    </form>
  );
}

function QxmStyles() {
  return (
    <style jsx global>{`
      .qxm-scope {
        --qxm-bg-card: #1d1f42; --qxm-bg-well: #262a52; --qxm-border: #383c6e;
        --qxm-accent: #22d3b0; --qxm-accent-2: #ffb020; --qxm-danger: #ff5c7a;
        --qxm-text: #f5f6ff; --qxm-muted: #9296c4;
        --qxm-font-display: 'Fredoka', ui-rounded, sans-serif;
        --qxm-font-mono: 'Space Mono', ui-monospace, monospace;
        font-family: 'Manrope', -apple-system, sans-serif;
        color: var(--qxm-text);
      }
      .qxm-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 14px; margin-bottom: 22px; }
      .qxm-eyebrow { font-family: var(--qxm-font-mono); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--qxm-accent); font-weight: 700; margin-bottom: 4px; }
      .qxm-h1 { font-family: var(--qxm-font-display); font-size: 26px; font-weight: 600; }
      .qxm-sub { color: var(--qxm-muted); font-size: 14px; margin-top: 2px; }

      .qxm-btn {
        padding: 12px 20px; border-radius: 12px; border: 1px solid var(--qxm-border);
        background: var(--qxm-bg-well); color: var(--qxm-text); font-weight: 700; cursor: pointer;
        display: inline-flex; align-items: center; gap: 8px; font-size: 14px;
        text-decoration: none; white-space: nowrap;
      }
      .qxm-btn-primary { background: var(--qxm-accent); border-color: var(--qxm-accent); color: #072922; }
      .qxm-btn-outline { background: transparent; }
      .qxm-btn-danger { color: var(--qxm-danger); border-color: rgba(255,92,122,.4); }
      .qxm-btn-sm { padding: 9px 14px; font-size: 13px; }
      .qxm-btn:disabled { opacity: .5; cursor: not-allowed; }

      .qxm-empty { padding: 30px 20px; text-align: center; color: var(--qxm-muted); background: var(--qxm-bg-card); border: 1px solid var(--qxm-border); border-radius: 18px; }
      .qxm-error { background: rgba(255,92,122,.12); border: 1px solid rgba(255,92,122,.3); color: var(--qxm-danger); padding: 12px 16px; border-radius: 12px; margin-bottom: 16px; font-weight: 600; font-size: 13px; }

      .qxm-form { background: var(--qxm-bg-card); border: 1px solid var(--qxm-border); border-radius: 18px; padding: 22px; margin-bottom: 22px; }
      .qxm-form-row { display: flex; gap: 16px; flex-wrap: wrap; }
      .qxm-field { flex: 1; min-width: 180px; margin-bottom: 14px; }
      .qxm-label { display: block; font-size: 12px; color: var(--qxm-muted); margin-bottom: 6px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
      .qxm-input {
        width: 100%; padding: 12px 14px; border-radius: 10px; border: 1.5px solid var(--qxm-border);
        background: var(--qxm-bg-well); color: var(--qxm-text); font-size: 15px; box-sizing: border-box;
        font-family: inherit;
      }
      .qxm-input:focus { outline: none; border-color: var(--qxm-accent); }
      .qxm-hint { font-size: 12px; color: var(--qxm-muted); margin: 4px 0 14px; line-height: 1.5; }
      .qxm-hint code { background: var(--qxm-bg-well); padding: 1px 6px; border-radius: 4px; font-family: var(--qxm-font-mono); }

      .qxm-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
      .qxm-card { background: var(--qxm-bg-card); border: 1px solid var(--qxm-border); border-radius: 16px; padding: 18px; }
      .qxm-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
      .qxm-card-title { font-weight: 700; font-size: 15px; }
      .qxm-card-code { font-family: var(--qxm-font-mono); letter-spacing: 1px; color: var(--qxm-muted); font-size: 13px; margin-top: 2px; }
      .qxm-card-desc { font-size: 13px; color: var(--qxm-muted); margin: 8px 0; }
      .qxm-hostcode-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; padding: 8px 10px; background: var(--qxm-bg-well); border-radius: 8px; }
      .qxm-hostcode { font-family: var(--qxm-font-mono); font-weight: 700; letter-spacing: 1px; flex: 1; }
      .qxm-hostcode-copy { background: none; border: none; color: var(--qxm-accent); font-weight: 700; font-size: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; padding: 2px 4px; }
      .qxm-badge { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; padding: 4px 10px; border-radius: 100px; color: #0e0f24; height: fit-content; }
      .qxm-card-actions { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
    `}</style>
  );
}
