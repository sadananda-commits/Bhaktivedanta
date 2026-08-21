// components/OnlineQuizHost.js
//
// Host control panel: lobby (QR code + scoreboard-style joining list +
// Start), live view (question, radial timer, answered-count, controls),
// and final leaderboard with CSV export.
//
// hostEmail MUST be the actual logged-in teacher/parent's identity —
// Code.gs re-validates it against the quiz's "Host Email" column on every
// action, so a mismatch fails loudly rather than silently no-op.

import { useState, useEffect, useCallback, useRef } from 'react';
import { quizApi } from '../lib/quizApi';
import { subscribeToQuiz, onConnectionStateChange } from '../lib/quizPusher';
import { quizSounds } from '../lib/quizSounds';
import { QuizFonts, QuizThemeStyles, ShapeIcon, OPTION_LABELS, OPTION_COLORS } from '../lib/quizTheme';

export default function OnlineQuizHost({ quizCode, hostEmail }) {
  const [status, setStatus] = useState('loading');
  const [title, setTitle] = useState('');
  const [participants, setParticipants] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [connectionLost, setConnectionLost] = useState(false);

  const [question, setQuestion] = useState(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [reveal, setReveal] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(1);
  const [deadline, setDeadline] = useState(null);

  const [leaderboard, setLeaderboard] = useState(null);

  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/quiz/${quizCode}` : '';
  const qrUrl = joinUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=340x340&margin=8&color=245-246-255&bgcolor=29-31-66&data=${encodeURIComponent(joinUrl)}` : '';

  const statusRef = useRef(status);
  statusRef.current = status;
  const wasDisconnectedRef = useRef(false);

  const refreshParticipants = useCallback(() => {
    quizApi.getParticipants(quizCode, hostEmail)
      .then(res => setParticipants(res.participants))
      .catch(err => setError(err.message));
  }, [quizCode, hostEmail]);

  const refreshFullState = useCallback(() => {
    quizApi.getQuizState(quizCode)
      .then(state => {
        setTitle(state.title || quizCode);
        setStatus(state.status === 'lobby' ? 'lobby' : state.status);
        if (state.currentQuestion) {
          setQuestion(state.currentQuestion);
          setDeadline(Date.parse(state.currentQuestion.startedAt) + state.currentQuestion.timeLimitSec * 1000);
          setTotalSeconds(state.currentQuestion.timeLimitSec);
          setAnsweredCount(state.answeredCount || 0);
        }
      })
      .catch(err => setError(err.message));
    refreshParticipants();
  }, [quizCode, refreshParticipants]);

  useEffect(() => { refreshFullState(); }, [refreshFullState]);

  useEffect(() => {
    const unsubscribe = subscribeToQuiz(quizCode, {
      'participant-joined': () => {
        refreshParticipants();
        if (statusRef.current === 'lobby') quizSounds.join();
      },
      'quiz-started': () => setStatus('live'),
      'question-started': (data) => {
        setQuestion(data);
        setDeadline(Date.parse(data.startedAt) + data.timeLimitSec * 1000);
        setTotalSeconds(data.timeLimitSec);
        setAnsweredCount(0);
        setReveal(null);
        setStatus('live');
        quizSounds.questionStart();
      },
      'answer-count-updated': (data) => setAnsweredCount(data.answeredCount),
      'question-ended': (data) => { setReveal(data); quizSounds.standingsReveal(); },
      'quiz-paused': () => setStatus('paused'),
      'quiz-resumed': (data) => {
        setStatus('live');
        if (data?.startedAt && data?.timeLimitSec) {
          setDeadline(Date.parse(data.startedAt) + data.timeLimitSec * 1000);
          setTotalSeconds(data.timeLimitSec);
        }
      },
      'quiz-ended': (data) => {
        setLeaderboard(data.leaderboard);
        setStatus('ended');
        quizSounds.quizEnd();
      },
    });
    return unsubscribe;
  }, [quizCode, refreshParticipants]);

  useEffect(() => {
    const unsubscribe = onConnectionStateChange((state) => {
      if (state === 'connected') {
        setConnectionLost(false);
        if (wasDisconnectedRef.current) refreshFullState();
        wasDisconnectedRef.current = false;
      } else if (state === 'unavailable' || state === 'failed' || state === 'disconnected') {
        wasDisconnectedRef.current = true;
        setConnectionLost(true);
      }
    });
    return unsubscribe;
  }, [refreshFullState]);

  useEffect(() => {
    if (status !== 'live' || !deadline) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [status, deadline]);

  async function runAction(fn) {
    setBusy(true); setError('');
    try { await fn(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  function exportCsv() {
    if (!leaderboard) return;
    const header = 'Rank,Name,Score,Correct,Incorrect,Avg Response (ms)\n';
    const rows = leaderboard.map(r => [r.rank, r.name, r.totalScore, r.correctAnswers, r.incorrectAnswers, r.avgResponseMs].join(',')).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${quizCode}-results.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const answeredPct = participants.length ? Math.min(100, Math.round((answeredCount / participants.length) * 100)) : 0;
  const ConnectionBanner = () => connectionLost ? <div className="qx-connbanner"><i className="fa-solid fa-triangle-exclamation" /> Reconnecting…</div> : null;

  if (status === 'loading') {
    return <div className="qx-root qxh-wrap"><QuizFonts /><QuizThemeStyles /><HostStyles /><p className="qx-muted">Loading…</p></div>;
  }

  return (
    <div className="qx-root qxh-wrap">
      <QuizFonts /><QuizThemeStyles /><HostStyles />
      <ConnectionBanner />
      <div className="qxh-header">
        <div className="qx-eyebrow">Hosting</div>
        <h1 className="qx-title">{title}</h1>
      </div>

      {error && <div className="qxh-error">⚠ {error}</div>}

      {status === 'lobby' && (
        <div className="qxh-grid">
          <div className="qx-card qxh-qr-card">
            <img src={qrUrl} alt="QR code to join the quiz" className="qxh-qr-img" />
            <div className="qxh-code-big">{quizCode}</div>
            <div className="qxh-link">{joinUrl}</div>
            <p className="qx-muted">Scan to join — no typing needed</p>
          </div>
          <div className="qx-card">
            <div className="qxh-count-row">
              <span className="qxh-count-num">{participants.length}</span>
              <span className="qx-muted">joined</span>
            </div>
            <ul className="qxh-participant-list">
              {participants.map(p => (
                <li key={p.participantId} className="qxh-participant-row">
                  <span className="qxh-avatar">{p.name?.[0]?.toUpperCase() || '?'}</span>
                  {p.name}{p.age ? <span className="qx-muted"> ({p.age})</span> : ''}
                </li>
              ))}
              {participants.length === 0 && <li className="qx-muted" style={{ padding: '10px 0' }}>Waiting for players to scan or type the code…</li>}
            </ul>
            <button className="qx-btn qx-btn-primary" disabled={busy || !participants.length}
              onClick={() => runAction(() => quizApi.startQuiz(quizCode, hostEmail))}>
              <i className="fa-solid fa-play" /> {participants.length ? 'Start Quiz' : 'Waiting for players…'}
            </button>
          </div>
        </div>
      )}

      {(status === 'live' || status === 'paused') && question && (
        <div className="qx-card qxh-live-card">
          <div className="qxh-live-stats">
            <Stat label="Question" value={question.qNum} />
            <Stat label="Answered" value={`${answeredCount}/${participants.length}`} />
            <RingStat secondsLeft={secondsLeft} totalSeconds={totalSeconds} />
          </div>
          <div className="qxh-progress-track"><div className="qxh-progress-fill" style={{ width: `${answeredPct}%` }} /></div>
          <div className="qxh-question-text">{question.questionText}</div>

          {reveal && (
            <div className="qxh-reveal">
              <div className="qxh-reveal-top">
                <span className="qx-muted">Correct answer</span>
                <strong>{reveal.correctAnswer}</strong>
              </div>
              <div className="qxh-answer-counts">
                {OPTION_LABELS.map(letter => reveal.answerCounts[letter] !== undefined && (
                  <span key={letter} className="qxh-count-chip">
                    <span className="qxh-mini-shape" style={{ background: OPTION_COLORS[letter] }}><ShapeIcon letter={letter} size={12} /></span>
                    {reveal.answerCounts[letter]}
                  </span>
                ))}
              </div>
              {reveal.standings?.length > 0 && (
                <div className="qxh-standings">
                  <div className="qx-eyebrow" style={{ marginTop: 14 }}>Standings so far</div>
                  <ol className="qx-leaderboard">
                    {reveal.standings.slice(0, 5).map(r => (
                      <li key={r.participantId}><span className="qx-lb-rank">#{r.rank}</span><span className="qx-lb-name">{r.name}</span><span className="qx-lb-score">{r.totalScore}</span></li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}

          <div className="qxh-controls">
            {status === 'live'
              ? <button className="qxh-btn" disabled={busy} onClick={() => runAction(() => quizApi.pauseQuiz(quizCode, hostEmail))}><i className="fa-solid fa-pause" /> Pause</button>
              : <button className="qxh-btn" disabled={busy} onClick={() => runAction(() => quizApi.resumeQuiz(quizCode, hostEmail))}><i className="fa-solid fa-play" /> Resume</button>}

            {!reveal ? (
              <button className="qxh-btn qx-btn-primary" style={{ marginTop: 0 }} disabled={busy}
                onClick={() => runAction(() => quizApi.revealAnswer(quizCode, hostEmail))}>
                <i className="fa-solid fa-eye" /> Show Results
              </button>
            ) : (
              <button className="qxh-btn qx-btn-primary" style={{ marginTop: 0 }} disabled={busy}
                onClick={() => runAction(() => quizApi.nextQuestion(quizCode, hostEmail))}>
                <i className="fa-solid fa-forward" /> Next Question
              </button>
            )}
            <button className="qxh-btn qxh-btn-danger" disabled={busy} onClick={() => runAction(() => quizApi.endQuiz(quizCode, hostEmail))}><i className="fa-solid fa-flag-checkered" /> End Quiz</button>
          </div>
        </div>
      )}

      {status === 'ended' && (
        <div className="qx-card qxh-results-card">
          <h3 className="qx-leaderboard-title" style={{ marginTop: 0 }}>Final Results</h3>
          <div className="qxh-table-scroll">
            <table className="qxh-table">
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
          </div>
          <button className="qx-btn qx-btn-primary" style={{ maxWidth: 240 }} onClick={exportCsv}><i className="fa-solid fa-download" /> Export CSV</button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="qxh-stat">
      <div className="qxh-stat-num">{value}</div>
      <div className="qx-muted">{label}</div>
    </div>
  );
}

function RingStat({ secondsLeft, totalSeconds }) {
  const pct = totalSeconds > 0 ? secondsLeft / totalSeconds : 0;
  const circumference = 2 * Math.PI * 22;
  return (
    <div className="qxh-stat">
      <div className="qxh-ring-wrap">
        <svg width="52" height="52" viewBox="0 0 52 52">
          <circle cx="26" cy="26" r="22" fill="none" stroke="var(--qx-surface-2)" strokeWidth="4" />
          <circle cx="26" cy="26" r="22" fill="none"
            stroke={secondsLeft <= 5 ? 'var(--qx-danger)' : 'var(--qx-accent)'}
            strokeWidth="4" strokeLinecap="round" strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - pct)} transform="rotate(-90 26 26)"
            style={{ transition: 'stroke-dashoffset 0.25s linear' }} />
        </svg>
        <span className="qxh-ring-num">{secondsLeft}</span>
      </div>
      <div className="qx-muted">Time Left</div>
    </div>
  );
}

function HostStyles() {
  return (
    <style jsx global>{`
      .qxh-wrap { max-width: 900px; margin: 0 auto; padding: 28px 20px; align-items: stretch; min-height: auto; }
      .qxh-header { margin-bottom: 20px; }
      .qxh-error { background: var(--qx-danger-dim); border: 1px solid rgba(255,92,122,.3); color: var(--qx-danger); padding: 12px 16px; border-radius: var(--qx-radius-sm); margin-bottom: 16px; font-weight: 600; }

      .qxh-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
      @media (max-width: 720px) { .qxh-grid { grid-template-columns: 1fr; } }

      .qxh-qr-card { text-align: center; }
      .qxh-qr-img { width: 100%; max-width: 280px; border-radius: var(--qx-radius-sm); margin-bottom: 14px; }
      .qxh-code-big { font-family: var(--qx-font-mono); font-size: 28px; font-weight: 700; letter-spacing: 5px; color: var(--qx-accent); }
      .qxh-link { font-family: var(--qx-font-mono); font-size: 12px; color: var(--qx-muted); word-break: break-all; margin: 6px 0 10px; }

      .qxh-count-row { display: flex; align-items: baseline; gap: 8px; margin-bottom: 14px; }
      .qxh-count-num { font-family: var(--qx-font-display); font-size: 34px; font-weight: 600; }
      .qxh-participant-list { list-style: none; padding: 0; max-height: 260px; overflow-y: auto; margin-bottom: 16px; }
      .qxh-participant-row {
        display: flex; align-items: center; gap: 10px; padding: 9px 10px; background: var(--qx-surface-2);
        border-radius: var(--qx-radius-sm); margin-bottom: 6px; font-weight: 600;
        animation: qxh-slide-in 0.25s ease-out;
      }
      @keyframes qxh-slide-in { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
      .qxh-avatar { width: 26px; height: 26px; border-radius: 50%; background: var(--qx-accent); color: #072922; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; flex-shrink: 0; }

      .qxh-live-card { max-width: 100%; }
      .qxh-live-stats { display: flex; gap: 16px; margin-bottom: 16px; }
      .qxh-stat { flex: 1; text-align: center; background: var(--qx-surface-2); border-radius: var(--qx-radius-sm); padding: 14px; display: flex; flex-direction: column; align-items: center; gap: 4px; }
      .qxh-stat-num { font-family: var(--qx-font-display); font-size: 26px; font-weight: 600; }
      .qxh-ring-wrap { position: relative; width: 52px; height: 52px; }
      .qxh-ring-num { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-family: var(--qx-font-mono); font-size: 17px; font-weight: 700; }

      .qxh-progress-track { width: 100%; height: 8px; border-radius: 4px; background: var(--qx-surface-2); overflow: hidden; margin-bottom: 20px; }
      .qxh-progress-fill { height: 100%; background: var(--qx-accent); transition: width 0.3s ease-out; }
      .qxh-question-text { font-family: var(--qx-font-display); font-size: 20px; font-weight: 500; margin-bottom: 18px; }

      .qxh-reveal { background: var(--qx-surface-2); padding: 16px; border-radius: var(--qx-radius-sm); margin-bottom: 18px; }
      .qxh-reveal-top { display: flex; justify-content: space-between; align-items: center; font-size: 15px; }
      .qxh-answer-counts { display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
      .qxh-count-chip { display: inline-flex; align-items: center; gap: 6px; background: var(--qx-surface); padding: 5px 10px; border-radius: 999px; font-family: var(--qx-font-mono); font-size: 13px; font-weight: 700; }
      .qxh-mini-shape { width: 18px; height: 18px; border-radius: 5px; display: flex; align-items: center; justify-content: center; color: #0e0f24; }
      .qxh-standings { margin-top: 4px; }

      .qxh-controls { display: flex; flex-wrap: wrap; gap: 10px; }
      .qxh-btn {
        padding: 13px 20px; border-radius: var(--qx-radius-sm); border: 1px solid var(--qx-border);
        background: var(--qx-surface-2); color: var(--qx-text); font-weight: 700; cursor: pointer;
        display: flex; align-items: center; gap: 8px; -webkit-tap-highlight-color: transparent;
        font-family: var(--qx-font-body);
      }
      .qxh-btn-danger { background: var(--qx-danger-dim); border-color: rgba(255,92,122,.4); color: var(--qx-danger); }
      .qxh-btn:disabled { opacity: 0.45; cursor: not-allowed; }

      .qxh-results-card { max-width: 100%; }
      .qxh-table-scroll { overflow-x: auto; }
      .qxh-table { width: 100%; border-collapse: collapse; margin: 12px 0 20px; min-width: 480px; }
      .qxh-table th, .qxh-table td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--qx-border); }
      .qxh-table th { font-family: var(--qx-font-mono); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--qx-muted); }

      @media (max-width: 520px) {
        .qxh-wrap { padding: 16px 12px; }
        .qxh-live-stats { flex-direction: column; }
        .qxh-controls { flex-direction: column; }
        .qxh-controls .qxh-btn, .qxh-controls .qx-btn-primary { width: 100%; }
      }
    `}</style>
  );
}
