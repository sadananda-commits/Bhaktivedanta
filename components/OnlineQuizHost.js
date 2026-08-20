// components/OnlineQuizHost.js
//
// Host control panel: lobby (participant list + Start), live view (current
// question, live answered-count, timer, Next/Reveal/Pause/End), and final
// leaderboard with CSV export. Rendered by pages/quiz-host/[code].js.
//
// hostEmail MUST be the actual logged-in teacher/admin's email — Code.gs
// re-validates it against the quiz's "Host Email" column on every action,
// so a mismatched email will fail loudly rather than silently no-op.

import { useState, useEffect, useCallback } from 'react';
import { quizApi } from '../lib/quizApi';
import { subscribeToQuiz } from '../lib/quizPusher';

export default function OnlineQuizHost({ quizCode, hostEmail }) {
  const [status, setStatus] = useState('loading'); // loading | lobby | live | paused | ended | error
  const [title, setTitle] = useState('');
  const [participants, setParticipants] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [question, setQuestion] = useState(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [reveal, setReveal] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [deadline, setDeadline] = useState(null);

  const [leaderboard, setLeaderboard] = useState(null);

  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/quiz/${quizCode}` : '';

  const refreshParticipants = useCallback(() => {
    quizApi.getParticipants(quizCode, hostEmail)
      .then(res => setParticipants(res.participants))
      .catch(err => setError(err.message));
  }, [quizCode, hostEmail]);

  // ── Initial load ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    quizApi.getQuizState(quizCode)
      .then(state => {
        if (cancelled) return;
        setTitle(state.title || quizCode);
        setStatus(state.status === 'lobby' ? 'lobby' : state.status);
        if (state.currentQuestion) {
          setQuestion(state.currentQuestion);
          setDeadline(Date.parse(state.currentQuestion.startedAt) + state.currentQuestion.timeLimitSec * 1000);
        }
      })
      .catch(err => setError(err.message));
    refreshParticipants();
    return () => { cancelled = true; };
  }, [quizCode, refreshParticipants]);

  // ── Pusher ───────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = subscribeToQuiz(quizCode, {
      'participant-joined': () => refreshParticipants(),
      'quiz-started': () => setStatus('live'),
      'question-started': (data) => {
        setQuestion(data);
        setDeadline(Date.parse(data.startedAt) + data.timeLimitSec * 1000);
        setAnsweredCount(0);
        setReveal(null);
        setStatus('live');
      },
      'answer-count-updated': (data) => setAnsweredCount(data.answeredCount),
      'question-ended': (data) => setReveal(data),
      'quiz-paused': () => setStatus('paused'),
      'quiz-resumed': () => setStatus('live'),
      'quiz-ended': (data) => {
        setLeaderboard(data.leaderboard);
        setStatus('ended');
      },
    });
    return unsubscribe;
  }, [quizCode, refreshParticipants]);

  // ── Countdown (host sees it too, for pacing) ────────────────────────
  useEffect(() => {
    if (status !== 'live' || !deadline) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [status, deadline]);

  async function runAction(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    if (!leaderboard) return;
    const header = 'Rank,Name,Score,Correct,Incorrect,Avg Response (ms)\n';
    const rows = leaderboard.map(r =>
      [r.rank, r.name, r.totalScore, r.correctAnswers, r.incorrectAnswers, r.avgResponseMs].join(',')
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${quizCode}-results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (status === 'loading') return <div className="oqh-wrap"><p>Loading…</p><HostStyles /></div>;

  return (
    <div className="oqh-wrap">
      <div className="oqh-header">
        <h1>{title}</h1>
        <div className="oqh-code">Code: <strong>{quizCode}</strong></div>
      </div>

      {error && <div className="oqh-error">{error}</div>}

      {status === 'lobby' && (
        <div className="oqh-panel">
          <p>Share this link or code with participants:</p>
          <div className="oqh-link">{joinUrl}</div>
          <h3>{participants.length} joined</h3>
          <ul className="oqh-participant-list">
            {participants.map(p => <li key={p.participantId}>{p.name}{p.age ? ` (${p.age})` : ''}</li>)}
          </ul>
          <button className="oqh-btn oqh-btn-primary" disabled={busy || !participants.length}
            onClick={() => runAction(() => quizApi.startQuiz(quizCode, hostEmail))}>
            {participants.length ? 'Start Quiz' : 'Waiting for participants…'}
          </button>
        </div>
      )}

      {(status === 'live' || status === 'paused') && question && (
        <div className="oqh-panel">
          <div className="oqh-live-stats">
            <div className="oqh-stat"><div className="oqh-stat-num">{question.qNum}</div><div>Question</div></div>
            <div className="oqh-stat"><div className="oqh-stat-num">{answeredCount}/{participants.length}</div><div>Answered</div></div>
            <div className="oqh-stat"><div className="oqh-stat-num">{secondsLeft}s</div><div>Time Left</div></div>
          </div>
          <div className="oqh-question-text">{question.questionText}</div>

          {reveal && (
            <div className="oqh-reveal">
              <p>Correct answer: <strong>{reveal.correctAnswer}</strong></p>
              <div className="oqh-answer-counts">
                {Object.entries(reveal.answerCounts).map(([letter, count]) => (
                  <span key={letter}>{letter}: {count}</span>
                ))}
              </div>
            </div>
          )}

          <div className="oqh-controls">
            {status === 'live' ? (
              <button className="oqh-btn" disabled={busy} onClick={() => runAction(() => quizApi.pauseQuiz(quizCode, hostEmail))}>Pause</button>
            ) : (
              <button className="oqh-btn" disabled={busy} onClick={() => runAction(() => quizApi.resumeQuiz(quizCode, hostEmail))}>Resume</button>
            )}
            {!reveal && (
              <button className="oqh-btn" disabled={busy} onClick={() => runAction(() => quizApi.revealAnswer(quizCode, hostEmail))}>Reveal Answer</button>
            )}
            <button className="oqh-btn oqh-btn-primary" disabled={busy} onClick={() => runAction(() => quizApi.nextQuestion(quizCode, hostEmail))}>Next Question</button>
            <button className="oqh-btn oqh-btn-danger" disabled={busy} onClick={() => runAction(() => quizApi.endQuiz(quizCode, hostEmail))}>End Quiz</button>
          </div>
        </div>
      )}

      {status === 'ended' && (
        <div className="oqh-panel">
          <h3>Final Results</h3>
          <table className="oqh-table">
            <thead><tr><th>Rank</th><th>Name</th><th>Score</th><th>Correct</th><th>Incorrect</th><th>Avg (ms)</th></tr></thead>
            <tbody>
              {(leaderboard || []).map(r => (
                <tr key={r.participantId}>
                  <td>{r.rank}</td><td>{r.name}</td><td>{r.totalScore}</td>
                  <td>{r.correctAnswers}</td><td>{r.incorrectAnswers}</td><td>{r.avgResponseMs}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="oqh-btn oqh-btn-primary" onClick={exportCsv}>Export CSV</button>
        </div>
      )}
      <HostStyles />
    </div>
  );
}

function HostStyles() {
  return (
    <style jsx global>{`
      .oqh-wrap { max-width: 720px; margin: 0 auto; padding: 24px; color: var(--text, #fff); }
      .oqh-header h1 { margin: 0 0 4px; }
      .oqh-code { color: var(--muted, #94a3b8); margin-bottom: 20px; }
      .oqh-panel { background: var(--surf, #1e293b); border: 1px solid var(--border, #334155); border-radius: var(--r, 16px); padding: 24px; }
      .oqh-error { background: #7f1d1d; color: #fecaca; padding: 10px 14px; border-radius: 8px; margin-bottom: 16px; }
      .oqh-link { font-family: monospace; background: var(--surf2, #0f172a); padding: 10px; border-radius: 8px; margin: 10px 0 20px; word-break: break-all; }
      .oqh-participant-list { list-style: none; padding: 0; max-height: 240px; overflow-y: auto; }
      .oqh-participant-list li { padding: 8px 12px; background: var(--surf2, #0f172a); border-radius: 6px; margin-bottom: 6px; }
      .oqh-btn { padding: 12px 20px; border-radius: 10px; border: 1px solid var(--border, #334155); background: var(--surf2, #0f172a); color: var(--text, #fff); font-weight: 600; cursor: pointer; margin: 4px; }
      .oqh-btn-primary { background: var(--accent, #14b8a6); border-color: var(--accent, #14b8a6); }
      .oqh-btn-danger { background: #b91c1c; border-color: #b91c1c; }
      .oqh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .oqh-live-stats { display: flex; gap: 20px; margin-bottom: 20px; }
      .oqh-stat { text-align: center; flex: 1; background: var(--surf2, #0f172a); border-radius: 10px; padding: 12px; }
      .oqh-stat-num { font-size: 24px; font-weight: 800; }
      .oqh-question-text { font-size: 18px; font-weight: 700; margin-bottom: 16px; }
      .oqh-reveal { background: var(--surf2, #0f172a); padding: 14px; border-radius: 10px; margin-bottom: 16px; }
      .oqh-answer-counts { display: flex; gap: 16px; margin-top: 8px; }
      .oqh-controls { display: flex; flex-wrap: wrap; gap: 8px; }
      .oqh-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
      .oqh-table th, .oqh-table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border, #334155); }
    `}</style>
  );
}
