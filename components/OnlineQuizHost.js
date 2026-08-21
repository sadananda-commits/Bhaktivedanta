// components/OnlineQuizHost.js
//
// Host control panel with three distinct question-cycle screens:
//   1. LIVE      — question + a large ticking countdown wheel, no manual
//                  action needed; this screen ends itself.
//   2. SUMMARY   — auto-shown the instant the timer hits zero OR every
//                  participant has answered (whichever comes first). Bar
//                  chart of how many picked each option (correct one
//                  highlighted), plus total correct/incorrect counts —
//                  no participant names, ever. Two options from here:
//                  "View Standings" or skip straight to "Next Question".
//   3. STANDINGS — the running leaderboard, stays on screen until the host
//                  explicitly continues.
// Plus lobby (QR code join) and final results (CSV export) — unchanged.
//
// hostCode MUST be the host code set for THIS quiz at creation time —
// Code.gs re-validates it against the quiz's "Host Code" column on every
// action, so a mismatch fails loudly rather than silently no-op. See
// pages/quiz-host/[code].js for how it's collected (no email/login involved).

import { useState, useEffect, useCallback, useRef } from 'react';
import { quizApi } from '../lib/quizApi';
import { subscribeToQuiz, onConnectionStateChange } from '../lib/quizPusher';
import { quizSounds } from '../lib/quizSounds';
import { QuizFonts, QuizThemeStyles, ShapeIcon, OPTION_LABELS, OPTION_COLORS } from '../lib/quizTheme';

export default function OnlineQuizHost({ quizCode, hostCode }) {
  const [status, setStatus] = useState('loading'); // loading | lobby | live | paused | ended
  const [title, setTitle] = useState('');
  const [participants, setParticipants] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [connectionLost, setConnectionLost] = useState(false);

  const [question, setQuestion] = useState(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [reveal, setReveal] = useState(null);
  // null while the question is actually live; 'summary' once auto-revealed;
  // 'standings' once the host chooses to look at the leaderboard.
  const [revealPhase, setRevealPhase] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(1);
  const [deadline, setDeadline] = useState(null);

  const [leaderboard, setLeaderboard] = useState(null);

  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/quiz/${quizCode}` : '';
  const qrUrl = joinUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=340x340&margin=8&color=245-246-255&bgcolor=29-31-66&data=${encodeURIComponent(joinUrl)}` : '';

  const statusRef = useRef(status);
  statusRef.current = status;
  const wasDisconnectedRef = useRef(false);
  const autoRevealedRef = useRef(false); // guards against firing revealAnswer more than once per question
  const lastTickPlayedRef = useRef(null);

  const refreshParticipants = useCallback(() => {
    quizApi.getParticipants(quizCode, hostCode)
      .then(res => setParticipants(res.participants))
      .catch(err => setError(err.message));
  }, [quizCode, hostCode]);

  const refreshFullState = useCallback(() => {
    quizApi.getQuizState(quizCode)
      .then(state => {
        setTitle(state.title || quizCode);
        setStatus(state.status === 'lobby' ? 'lobby' : state.status);
        if (state.currentQuestion) {
          setQuestion(state.currentQuestion);
          const dl = Date.parse(state.currentQuestion.startedAt) + state.currentQuestion.timeLimitSec * 1000;
          setDeadline(dl);
          setTotalSeconds(state.currentQuestion.timeLimitSec);
          // Same fix as question-started below: seed secondsLeft right away
          // (from actual remaining time, since some may have already
          // elapsed) instead of leaving it at its stale initial 0, which the
          // auto-reveal effect would otherwise misread as "time's up".
          setSecondsLeft(Math.max(0, Math.ceil((dl - Date.now()) / 1000)));
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
        // Seed this synchronously (not just via the tick effect) — otherwise
        // secondsLeft sits at its stale initial value of 0 for one render,
        // which the auto-reveal effect below misreads as "time's up" and
        // reveals the very first question almost instantly. Every question
        // after the first is unaffected because secondsLeft already holds a
        // real leftover number by then.
        setSecondsLeft(data.timeLimitSec);
        setAnsweredCount(0);
        setReveal(null);
        setRevealPhase(null);
        autoRevealedRef.current = false;
        lastTickPlayedRef.current = null;
        setStatus('live');
        quizSounds.questionStart();
      },
      'answer-count-updated': (data) => setAnsweredCount(data.answeredCount),
      'question-ended': (data) => {
        setReveal(data);
        setRevealPhase('summary'); // always lands on the bar-chart summary first
        quizSounds.standingsReveal();
      },
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

  // ── Countdown — ticks every second the whole way through (the "giant
  // wheel" is the host/projector's clock, so a continuous tick makes sense
  // here even though individual student phones only tick in the last 5s) ──
  useEffect(() => {
    if (status !== 'live' || !deadline || revealPhase) return;
    const tick = () => {
      const s = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(s);
      if (s > 0 && lastTickPlayedRef.current !== s) {
        lastTickPlayedRef.current = s;
        quizSounds.tick();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [status, deadline, revealPhase]);

  // ── Auto-reveal: the summary screen appears on its own, no button needed
  // — the instant the timer hits zero, or every joined participant has
  // answered, whichever happens first. Only the host's browser triggers
  // this (not each of N student devices), so there's exactly one caller. ──
  useEffect(() => {
    if (status !== 'live' || revealPhase || autoRevealedRef.current) return;
    const allAnswered = participants.length > 0 && answeredCount >= participants.length;
    const timeUp = secondsLeft === 0;
    if (allAnswered || timeUp) {
      autoRevealedRef.current = true;
      quizApi.revealAnswer(quizCode, hostCode).catch(err => setError(err.message));
    }
  }, [status, revealPhase, secondsLeft, answeredCount, participants.length, quizCode, hostCode]);

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
              onClick={() => runAction(() => quizApi.startQuiz(quizCode, hostCode))}>
              <i className="fa-solid fa-play" /> {participants.length ? 'Start Quiz' : 'Waiting for players…'}
            </button>
          </div>
        </div>
      )}

      {/* ── 1. LIVE: question + giant countdown wheel, no reveal yet ── */}
      {(status === 'live' || status === 'paused') && question && !revealPhase && (
        <div className="qx-card qxh-live-card">
          <div className="qxh-live-top">
            <span className="qx-eyebrow">Question {question.qNum}</span>
            <span className="qxh-answered-chip">{answeredCount}/{participants.length} answered</span>
          </div>
          <div className="qxh-question-text qxh-question-text-big">{question.questionText}</div>

          {/* Big, projector-readable "how many have answered so far" summary —
              the small chip above is easy to miss from across a classroom. */}
          <div className="qxh-answered-big">
            <span className="qxh-answered-big-num">{answeredCount}</span>
            <span className="qxh-answered-big-of"> / {participants.length} answered</span>
            <div className="qxh-answered-bar">
              <div
                className="qxh-answered-bar-fill"
                style={{ width: `${participants.length ? Math.min(100, Math.round((answeredCount / participants.length) * 100)) : 0}%` }}
              />
            </div>
          </div>

          <div className="qxh-giant-wheel">
            <svg width="240" height="240" viewBox="0 0 240 240">
              <circle cx="120" cy="120" r="104" fill="none" stroke="var(--qx-surface-2)" strokeWidth="14" />
              <circle cx="120" cy="120" r="104" fill="none"
                stroke={secondsLeft <= 5 ? 'var(--qx-danger)' : 'var(--qx-accent)'}
                strokeWidth="14" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 104}
                strokeDashoffset={2 * Math.PI * 104 * (1 - (totalSeconds > 0 ? secondsLeft / totalSeconds : 0))}
                transform="rotate(-90 120 120)"
                style={{ transition: 'stroke-dashoffset 0.25s linear' }} />
            </svg>
            <span className={'qxh-giant-num' + (secondsLeft <= 5 ? ' qxh-giant-num-urgent' : '')}>{secondsLeft}</span>
          </div>

          {status === 'paused' && <div className="qx-banner" style={{ maxWidth: 300, margin: '0 auto' }}>Paused</div>}

          <div className="qxh-live-bottom-controls">
            {status === 'live'
              ? <button className="qxh-btn" disabled={busy} onClick={() => runAction(() => quizApi.pauseQuiz(quizCode, hostCode))}><i className="fa-solid fa-pause" /> Pause</button>
              : <button className="qxh-btn" disabled={busy} onClick={() => runAction(() => quizApi.resumeQuiz(quizCode, hostCode))}><i className="fa-solid fa-play" /> Resume</button>}
            {/* Manual override for the auto-reveal (timer hits zero, or every
                joined participant has answered) — lets the host move on early,
                e.g. once everyone who's actually still playing has answered
                but a dropped/away device keeps the count from ever completing. */}
            <button className="qxh-btn" disabled={busy || answeredCount === 0} onClick={() => {
              autoRevealedRef.current = true;
              runAction(() => quizApi.revealAnswer(quizCode, hostCode));
            }}>
              <i className="fa-solid fa-chart-column" /> Reveal Answers Now
            </button>
            <button className="qxh-btn qxh-btn-danger" disabled={busy} onClick={() => runAction(() => quizApi.endQuiz(quizCode, hostCode))}><i className="fa-solid fa-flag-checkered" /> End Quiz</button>
          </div>
        </div>
      )}

      {/* ── 2. SUMMARY: auto-shown bar chart, correct answer highlighted, no names ── */}
      {revealPhase === 'summary' && reveal && question && (
        <div className="qx-card qxh-summary-card">
          <span className="qx-eyebrow">Question {reveal.qNum} results</span>
          <div className="qxh-tally-row">
            <span className="qxh-tally qxh-tally-correct"><i className="fa-solid fa-check" /> {reveal.correctCount ?? 0} correct</span>
            <span className="qxh-tally qxh-tally-incorrect"><i className="fa-solid fa-xmark" /> {reveal.incorrectCount ?? 0} incorrect</span>
          </div>

          <BarChart question={question} reveal={reveal} />

          <div className="qxh-controls">
            <button className="qxh-btn" disabled={busy} onClick={() => setRevealPhase('standings')}>
              <i className="fa-solid fa-ranking-star" /> View Standings
            </button>
            <button className="qxh-btn qx-btn-primary" style={{ marginTop: 0 }} disabled={busy}
              onClick={() => runAction(() => quizApi.nextQuestion(quizCode, hostCode))}>
              <i className="fa-solid fa-forward" /> Next Question
            </button>
            <button className="qxh-btn qxh-btn-danger" disabled={busy} onClick={() => runAction(() => quizApi.endQuiz(quizCode, hostCode))}><i className="fa-solid fa-flag-checkered" /> End Quiz</button>
          </div>
        </div>
      )}

      {/* ── 3. STANDINGS: stays until the host explicitly continues ── */}
      {revealPhase === 'standings' && reveal && (
        <div className="qx-card qxh-standings-card">
          <span className="qx-eyebrow">Standings so far</span>
          <h2 className="qx-title" style={{ marginTop: 4 }}>Current Rankings</h2>
          <ol className="qx-leaderboard">
            {(reveal.standings || []).map(r => (
              <li key={r.participantId}><span className="qx-lb-rank">#{r.rank}</span><span className="qx-lb-name">{r.name}</span><span className="qx-lb-score">{r.totalScore}</span></li>
            ))}
            {(!reveal.standings || reveal.standings.length === 0) && <li className="qx-muted">No scores yet.</li>}
          </ol>
          <div className="qxh-controls">
            <button className="qxh-btn" disabled={busy} onClick={() => setRevealPhase('summary')}>
              <i className="fa-solid fa-chart-column" /> Back to Results
            </button>
            <button className="qxh-btn qx-btn-primary" style={{ marginTop: 0 }} disabled={busy}
              onClick={() => runAction(() => quizApi.nextQuestion(quizCode, hostCode))}>
              <i className="fa-solid fa-forward" /> Next Question
            </button>
            <button className="qxh-btn qxh-btn-danger" disabled={busy} onClick={() => runAction(() => quizApi.endQuiz(quizCode, hostCode))}><i className="fa-solid fa-flag-checkered" /> End Quiz</button>
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

// Per-option bar chart: bar length reflects how many picked that option,
// the correct option (or options, for multi-select) gets a highlighted
// border + check mark. No names anywhere — counts only.
function BarChart({ question, reveal }) {
  const counts = reveal.answerCounts || {};
  const maxCount = Math.max(1, ...OPTION_LABELS.map(l => counts[l] || 0));
  const correctSet = String(reveal.correctAnswer || '').split(',').map(s => s.trim().toUpperCase());

  return (
    <div className="qxh-barchart">
      {OPTION_LABELS.filter(l => question.options[l]).map(letter => {
        const count = counts[letter] || 0;
        const pct = Math.round((count / maxCount) * 100);
        const isCorrect = correctSet.includes(letter);
        return (
          <div key={letter} className={'qxh-bar-row' + (isCorrect ? ' qxh-bar-row-correct' : '')}>
            <span className="qxh-bar-shape" style={{ background: OPTION_COLORS[letter] }}><ShapeIcon letter={letter} size={16} /></span>
            <span className="qxh-bar-label">{question.options[letter]}</span>
            <div className="qxh-bar-track">
              <div className="qxh-bar-fill" style={{ width: `${pct}%`, background: OPTION_COLORS[letter] }} />
            </div>
            <span className="qxh-bar-count">{count}</span>
            {isCorrect && <i className="fa-solid fa-circle-check qxh-bar-check" />}
          </div>
        );
      })}
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

      /* ── Live screen: giant wheel ── */
      .qxh-live-card { max-width: 100%; text-align: center; }
      .qxh-live-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
      .qxh-answered-chip { font-family: var(--qx-font-mono); font-size: 12px; color: var(--qx-muted); background: var(--qx-surface-2); padding: 5px 12px; border-radius: 999px; }
      .qxh-question-text-big { font-size: 24px; margin-bottom: 10px; }

      /* Big projector-visible "answered so far" summary, sits above the wheel */
      .qxh-answered-big { margin-bottom: 22px; }
      .qxh-answered-big-num { font-family: var(--qx-font-display); font-size: 40px; font-weight: 600; color: var(--qx-accent); }
      .qxh-answered-big-of { font-family: var(--qx-font-mono); font-size: 15px; color: var(--qx-muted); }
      .qxh-answered-bar { height: 12px; border-radius: 999px; background: var(--qx-surface-2); overflow: hidden; margin-top: 8px; max-width: 420px; margin-left: auto; margin-right: auto; }
      .qxh-answered-bar-fill { height: 100%; border-radius: 999px; background: var(--qx-accent); transition: width 0.4s ease-out; min-width: 4px; }
      .qxh-giant-wheel { position: relative; width: 240px; height: 240px; margin: 0 auto 26px; }
      .qxh-giant-num {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        font-family: var(--qx-font-mono); font-size: 76px; font-weight: 700;
      }
      .qxh-giant-num-urgent { color: var(--qx-danger); animation: qxh-giant-pulse 1s ease-in-out infinite; }
      @keyframes qxh-giant-pulse { 0%,100% { transform: scale(1);} 50% { transform: scale(1.08);} }
      .qxh-live-bottom-controls { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; }

      /* ── Summary (bar chart) screen ── */
      .qxh-summary-card { max-width: 100%; }
      .qxh-tally-row { display: flex; gap: 12px; margin: 10px 0 22px; }
      .qxh-tally { font-family: var(--qx-font-display); font-size: 18px; font-weight: 600; padding: 10px 18px; border-radius: var(--qx-radius-sm); display: inline-flex; align-items: center; gap: 8px; }
      .qxh-tally-correct { background: rgba(52,231,180,0.14); color: var(--qx-success); }
      .qxh-tally-incorrect { background: var(--qx-danger-dim); color: var(--qx-danger); }
      .qxh-barchart { display: flex; flex-direction: column; gap: 12px; margin-bottom: 22px; }
      .qxh-bar-row { display: grid; grid-template-columns: 28px auto 1fr 32px 20px; align-items: center; gap: 10px; padding: 4px 0; }
      .qxh-bar-row-correct { background: rgba(52,231,180,0.06); border-radius: 10px; }
      .qxh-bar-shape { width: 26px; height: 26px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #0e0f24; flex-shrink: 0; }
      .qxh-bar-label { font-size: 13px; font-weight: 600; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .qxh-bar-track { height: 20px; background: var(--qx-surface-2); border-radius: 6px; overflow: hidden; }
      .qxh-bar-fill { height: 100%; border-radius: 6px; transition: width 0.5s ease-out; min-width: 4px; }
      .qxh-bar-count { font-family: var(--qx-font-mono); font-weight: 700; text-align: right; }
      .qxh-bar-check { color: var(--qx-success); }

      .qxh-standings-card { max-width: 100%; }

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
        .qxh-giant-wheel { width: 180px; height: 180px; }
        .qxh-giant-wheel svg { width: 180px; height: 180px; }
        .qxh-giant-num { font-size: 56px; }
        .qxh-bar-row { grid-template-columns: 22px auto 1fr 28px 16px; }
        .qxh-bar-label { max-width: 90px; }
        .qxh-controls { flex-direction: column; }
        .qxh-controls .qxh-btn, .qxh-controls .qx-btn-primary { width: 100%; }
      }
    `}</style>
  );
}
