// components/OnlineQuizParticipant.js
//
// Handles the full student-side flow for one quiz: join → lobby → live
// question → between-question reveal → final leaderboard. Rendered by
// pages/quiz/[code].js. Real-time updates come from Pusher; getQuizState
// is only called once, on join/reload, as a snapshot fallback.

import { useState, useEffect, useRef, useCallback } from 'react';
import { quizApi } from '../lib/quizApi';
import { subscribeToQuiz } from '../lib/quizPusher';

const OPTION_LABELS = ['A', 'B', 'C', 'D'];
const OPTION_COLORS = { A: '#e21b3c', B: '#1368ce', C: '#d89e00', D: '#26890c' };

export default function OnlineQuizParticipant({ quizCode }) {
  const [phase, setPhase] = useState('join'); // join | lobby | live | between | ended | error
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);

  const [participantId, setParticipantId] = useState(null);
  const [quizTitle, setQuizTitle] = useState('');
  const [participantCount, setParticipantCount] = useState(0);

  const [question, setQuestion] = useState(null); // { qNum, questionText, options, mediaUrl, timeLimitSec, startedAt }
  const [deadline, setDeadline] = useState(null); // epoch ms
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [selected, setSelected] = useState(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [answerFeedback, setAnswerFeedback] = useState(null); // { isCorrect, pointsEarned }
  const [reveal, setReveal] = useState(null); // { correctAnswer, answerCounts }

  const [leaderboard, setLeaderboard] = useState(null);
  const [paused, setPaused] = useState(false);

  const storageKey = 'quiz_participant_' + quizCode;

  // ── Restore identity on reload ──────────────────────────────────────
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      if (saved && saved.participantId) {
        setParticipantId(saved.participantId);
        setName(saved.name || '');
        setPhase('lobby');
        quizApi.getQuizState(quizCode).then(applyState).catch(() => {});
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizCode]);

  const applyState = useCallback((state) => {
    setQuizTitle(state.title || '');
    setParticipantCount(state.participantCount || 0);
    if (state.status === 'ended') {
      setPhase('ended');
      quizApi.getResults(quizCode).then(r => setLeaderboard(r.leaderboard)).catch(() => {});
    } else if (state.status === 'live' && state.currentQuestion) {
      setQuestion(state.currentQuestion);
      setDeadline(Date.parse(state.currentQuestion.startedAt || Date.now()) + state.currentQuestion.timeLimitSec * 1000);
      setPhase('live');
    } else {
      setPhase('lobby');
    }
  }, [quizCode]);

  // ── Join ─────────────────────────────────────────────────────────────
  async function handleJoin(e) {
    e.preventDefault();
    setJoinError('');
    if (!name.trim()) { setJoinError('Enter your name.'); return; }
    setJoining(true);
    try {
      const res = await quizApi.joinQuiz(quizCode, name.trim(), age ? Number(age) : '');
      setParticipantId(res.participantId);
      sessionStorage.setItem(storageKey, JSON.stringify({ participantId: res.participantId, name: name.trim() }));
      setPhase('lobby');
      const state = await quizApi.getQuizState(quizCode);
      applyState(state);
    } catch (err) {
      setJoinError(err.message || 'Could not join this quiz.');
    } finally {
      setJoining(false);
    }
  }

  // ── Pusher subscription (once we have a participantId) ────────────────
  useEffect(() => {
    if (!participantId) return;
    const unsubscribe = subscribeToQuiz(quizCode, {
      'participant-joined': (data) => setParticipantCount(data.participantCount),
      'quiz-started': () => setPhase(p => (p === 'lobby' ? 'live' : p)),
      'question-started': (data) => {
        setQuestion(data);
        setDeadline(Date.parse(data.startedAt) + data.timeLimitSec * 1000);
        setSelected(null);
        setHasAnswered(false);
        setAnswerFeedback(null);
        setReveal(null);
        setPhase('live');
      },
      'question-ended': (data) => {
        setReveal(data);
        setPhase('between');
      },
      'quiz-paused': () => setPaused(true),
      'quiz-resumed': () => setPaused(false),
      'quiz-ended': (data) => {
        setLeaderboard(data.leaderboard);
        setPhase('ended');
      },
    });
    return unsubscribe;
  }, [participantId, quizCode]);

  // ── Countdown ────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'live' || !deadline) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [phase, deadline]);

  // ── Answer ───────────────────────────────────────────────────────────
  async function handleAnswer(letter) {
    if (hasAnswered || secondsLeft <= 0 || !question) return;
    setSelected(letter);
    setHasAnswered(true); // optimistic lock — prevents double-submit even on slow network
    try {
      const res = await quizApi.submitAnswer(quizCode, participantId, question.qNum, letter);
      setAnswerFeedback({ isCorrect: res.isCorrect, pointsEarned: res.pointsEarned });
    } catch (err) {
      setAnswerFeedback({ error: err.message });
    }
  }

  // ── Render ───────────────────────────────────────────────────────────

  if (phase === 'join') {
    return (
      <div className="oq-wrap">
        <div className="oq-card">
          <h1 className="oq-title">Join Quiz</h1>
          <div className="oq-code">{quizCode}</div>
          <form onSubmit={handleJoin}>
            <label className="oq-label">Your name</label>
            <input className="oq-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Priya" autoFocus />
            <label className="oq-label">Your age</label>
            <input className="oq-input" type="number" min="1" max="120" value={age} onChange={e => setAge(e.target.value)} placeholder="e.g. 10" />
            {joinError && <div className="oq-error">{joinError}</div>}
            <button className="oq-btn oq-btn-primary" type="submit" disabled={joining}>
              {joining ? 'Joining…' : 'Join Quiz'}
            </button>
          </form>
        </div>
        <QuizStyles />
      </div>
    );
  }

  if (phase === 'lobby') {
    return (
      <div className="oq-wrap">
        <div className="oq-card oq-center">
          <h1 className="oq-title">{quizTitle || quizCode}</h1>
          <p className="oq-muted">You're in! Waiting for the host to start…</p>
          <div className="oq-pulse-dot" />
          <div className="oq-participant-count">{participantCount} joined</div>
          <div className="oq-name-chip">Playing as <strong>{name}</strong></div>
        </div>
        <QuizStyles />
      </div>
    );
  }

  if (phase === 'live' && question) {
    return (
      <div className="oq-wrap">
        <div className="oq-live-header">
          <div className="oq-qnum">Question {question.qNum}</div>
          <div className={'oq-timer' + (secondsLeft <= 5 ? ' oq-timer-urgent' : '')}>{secondsLeft}</div>
        </div>
        {paused && <div className="oq-banner">Quiz paused by host</div>}
        {question.mediaUrl && <img src={question.mediaUrl} alt="" className="oq-media" />}
        <div className="oq-question-text">{question.questionText}</div>

        {!hasAnswered ? (
          <div className="oq-options">
            {OPTION_LABELS.filter(l => question.options[l]).map(letter => (
              <button
                key={letter}
                className="oq-option"
                style={{ background: OPTION_COLORS[letter] }}
                onClick={() => handleAnswer(letter)}
                disabled={secondsLeft <= 0}
              >
                <span className="oq-option-letter">{letter}</span>
                <span>{question.options[letter]}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="oq-card oq-center">
            {answerFeedback?.error ? (
              <p className="oq-error">{answerFeedback.error}</p>
            ) : answerFeedback ? (
              <>
                <div className={'oq-feedback ' + (answerFeedback.isCorrect ? 'oq-correct' : 'oq-incorrect')}>
                  {answerFeedback.isCorrect ? '✓ Correct!' : '✗ Not quite'}
                </div>
                <div className="oq-points">+{answerFeedback.pointsEarned} pts</div>
              </>
            ) : (
              <p className="oq-muted">Answer submitted — waiting for scoring…</p>
            )}
            <p className="oq-muted">Waiting for other players…</p>
          </div>
        )}
        <QuizStyles />
      </div>
    );
  }

  if (phase === 'between' && reveal) {
    return (
      <div className="oq-wrap">
        <div className="oq-card oq-center">
          <h2 className="oq-title">Correct answer: {reveal.correctAnswer}</h2>
          <div className="oq-answer-bars">
            {OPTION_LABELS.map(letter => (
              reveal.answerCounts[letter] !== undefined && (
                <div key={letter} className="oq-answer-bar-row">
                  <span className="oq-option-letter" style={{ background: OPTION_COLORS[letter] }}>{letter}</span>
                  <span>{reveal.answerCounts[letter]}</span>
                </div>
              )
            ))}
          </div>
          <p className="oq-muted">Get ready for the next question…</p>
        </div>
        <QuizStyles />
      </div>
    );
  }

  if (phase === 'ended') {
    const mine = leaderboard?.find(r => r.participantId === participantId);
    return (
      <div className="oq-wrap">
        <div className="oq-card oq-center">
          <h1 className="oq-title">🏁 Quiz Complete!</h1>
          {mine && (
            <div className="oq-my-result">
              <div className="oq-my-rank">Rank #{mine.rank}</div>
              <div className="oq-my-score">{mine.totalScore} points</div>
              <div className="oq-muted">{mine.correctAnswers} correct · {mine.incorrectAnswers} incorrect</div>
            </div>
          )}
          <h3 className="oq-leaderboard-title">Leaderboard</h3>
          <ol className="oq-leaderboard">
            {(leaderboard || []).slice(0, 10).map(r => (
              <li key={r.participantId} className={r.participantId === participantId ? 'oq-me' : ''}>
                <span className="oq-lb-rank">#{r.rank}</span>
                <span className="oq-lb-name">{r.name}</span>
                <span className="oq-lb-score">{r.totalScore}</span>
              </li>
            ))}
          </ol>
        </div>
        <QuizStyles />
      </div>
    );
  }

  return (
    <div className="oq-wrap">
      <div className="oq-card oq-center"><p className="oq-muted">Loading…</p></div>
      <QuizStyles />
    </div>
  );
}

function QuizStyles() {
  return (
    <style jsx global>{`
      .oq-wrap {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: var(--navy, #0f172a);
        color: var(--text, #fff);
      }
      .oq-card {
        background: var(--surf, #1e293b);
        border: 1px solid var(--border, #334155);
        border-radius: var(--r, 16px);
        padding: 32px 24px;
        max-width: 420px;
        width: 100%;
      }
      .oq-center { text-align: center; }
      .oq-title { font-size: 22px; font-weight: 700; margin: 0 0 12px; }
      .oq-code { font-size: 32px; font-weight: 800; letter-spacing: 4px; color: var(--accent, #14b8a6); text-align: center; margin-bottom: 20px; }
      .oq-label { display: block; font-size: 13px; color: var(--muted, #94a3b8); margin: 14px 0 6px; }
      .oq-input {
        width: 100%; padding: 12px 14px; border-radius: 10px;
        border: 1px solid var(--border, #334155); background: var(--surf2, #0f172a);
        color: var(--text, #fff); font-size: 16px; box-sizing: border-box;
      }
      .oq-btn { width: 100%; padding: 14px; border-radius: 10px; border: none; font-size: 16px; font-weight: 700; cursor: pointer; margin-top: 20px; }
      .oq-btn-primary { background: var(--accent, #14b8a6); color: #fff; }
      .oq-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      .oq-error { color: #f87171; font-size: 13px; margin-top: 8px; }
      .oq-muted { color: var(--muted, #94a3b8); font-size: 14px; }
      .oq-pulse-dot { width: 14px; height: 14px; border-radius: 50%; background: var(--accent, #14b8a6); margin: 20px auto; animation: oq-pulse 1.4s ease-in-out infinite; }
      @keyframes oq-pulse { 0%,100% { opacity: 0.3; transform: scale(0.8);} 50% { opacity: 1; transform: scale(1.2);} }
      .oq-participant-count { font-size: 28px; font-weight: 800; margin: 8px 0; }
      .oq-name-chip { display: inline-block; margin-top: 12px; padding: 6px 14px; border-radius: 999px; background: var(--surf2, #0f172a); font-size: 13px; }

      .oq-live-header { display: flex; justify-content: space-between; align-items: center; width: 100%; max-width: 600px; margin-bottom: 16px; }
      .oq-qnum { font-size: 15px; color: var(--muted, #94a3b8); }
      .oq-timer { font-size: 28px; font-weight: 800; width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--surf2, #0f172a); }
      .oq-timer-urgent { color: #f87171; }
      .oq-banner { width: 100%; max-width: 600px; text-align: center; padding: 8px; margin-bottom: 12px; border-radius: 8px; background: #d89e00; color: #000; font-weight: 700; }
      .oq-media { max-width: 600px; width: 100%; border-radius: 12px; margin-bottom: 16px; }
      .oq-question-text { font-size: 22px; font-weight: 700; text-align: center; max-width: 600px; margin-bottom: 24px; }
      .oq-options { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; width: 100%; max-width: 600px; }
      @media (max-width: 480px) { .oq-options { grid-template-columns: 1fr; } }
      .oq-option { display: flex; align-items: center; gap: 12px; padding: 20px; border: none; border-radius: 12px; color: #fff; font-size: 17px; font-weight: 600; cursor: pointer; text-align: left; }
      .oq-option:disabled { opacity: 0.5; cursor: not-allowed; }
      .oq-option-letter { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,0.25); font-weight: 800; flex-shrink: 0; }
      .oq-feedback { font-size: 24px; font-weight: 800; margin-bottom: 8px; }
      .oq-correct { color: #4ade80; }
      .oq-incorrect { color: #f87171; }
      .oq-points { font-size: 18px; font-weight: 700; color: var(--accent, #14b8a6); margin-bottom: 16px; }
      .oq-answer-bars { display: flex; flex-direction: column; gap: 8px; margin: 20px 0; }
      .oq-answer-bar-row { display: flex; align-items: center; gap: 12px; }
      .oq-my-result { margin: 16px 0 24px; }
      .oq-my-rank { font-size: 28px; font-weight: 800; color: var(--accent, #14b8a6); }
      .oq-my-score { font-size: 20px; font-weight: 700; margin: 4px 0; }
      .oq-leaderboard-title { margin: 20px 0 10px; font-size: 16px; }
      .oq-leaderboard { list-style: none; padding: 0; margin: 0; text-align: left; }
      .oq-leaderboard li { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; margin-bottom: 6px; background: var(--surf2, #0f172a); }
      .oq-leaderboard li.oq-me { border: 2px solid var(--accent, #14b8a6); }
      .oq-lb-rank { width: 32px; font-weight: 700; color: var(--muted, #94a3b8); }
      .oq-lb-name { flex: 1; }
      .oq-lb-score { font-weight: 700; }
    `}</style>
  );
}
