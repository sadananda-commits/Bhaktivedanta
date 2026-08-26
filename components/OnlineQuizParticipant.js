// components/OnlineQuizParticipant.js
//
// Handles the full student-side flow for one quiz: join → lobby → live
// question → between-question reveal+standings → final leaderboard.
// Rendered by pages/quiz/[code].js.
//
// Answering flow: tap to build a selection (single-select behaves like a
// radio, multi-select toggles independently), then press Submit. If the
// timer hits zero first, whatever is currently selected is auto-submitted
// as-is — nothing is lost, it's just locked in.

import { useState, useEffect, useRef, useCallback } from 'react';
import { quizApi } from '../lib/quizApi';
import { subscribeToQuiz, onConnectionStateChange } from '../lib/quizFirestore';
import { quizSounds, isMuted, setMuted } from '../lib/quizSounds';
import { QuizFonts, QuizThemeStyles, ShapeIcon, OPTION_LABELS, OPTION_COLORS } from '../lib/quizTheme';

// ── Brand ──────────────────────────────────────────────────────────────
// The participant-facing entry point is the only screen most players ever
// see, so it carries the portal's name — everything else (host panel,
// question screens) stays on the existing "live classroom scoreboard"
// identity from quizTheme.js untouched.
const PORTAL_NAME = 'Bhakti Vedanta Quiz Portal';

// Simple abstract lotus-flame emblem — deliberately generic/non-iconographic
// artwork (not a reproduction of any organization's actual logo), built
// from the same mint/marigold accent pair as the rest of the theme so it
// reads as part of the same design system rather than a bolted-on badge.
function BrandMark({ size = 64 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="qx-brandmark" aria-hidden="true">
      <defs>
        <linearGradient id="qxBrandGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--qx-accent-2)" />
          <stop offset="100%" stopColor="var(--qx-accent)" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="var(--qx-surface-2)" stroke="url(#qxBrandGrad)" strokeWidth="2" />
      {/* four lotus-like petals fanning from the center, echoing the shape-coded
          option tiles (circle/triangle/square/diamond) used elsewhere */}
      {[0, 90, 180, 270].map(deg => (
        <path key={deg} d="M32 32 C 26 22, 26 12, 32 8 C 38 12, 38 22, 32 32 Z"
          fill="url(#qxBrandGrad)" opacity="0.9" transform={`rotate(${deg} 32 32)`} />
      ))}
      <circle cx="32" cy="32" r="7" fill="var(--qx-bg)" stroke="url(#qxBrandGrad)" strokeWidth="2" />
    </svg>
  );
}

function BrandHeader() {
  return (
    <div className="qx-brand">
      <BrandMark />
      <div className="qx-eyebrow">Welcome to the</div>
      <h1 className="qx-title qx-brand-title">{PORTAL_NAME}</h1>
    </div>
  );
}

// Waiting-room graphic for the lobby screen: a center emblem with a slowly
// rotating ring of the four shape icons already used for answer options
// elsewhere in the product, so "waiting" visually rhymes with "playing"
// instead of being a generic unrelated spinner.
function OrbitWaiting() {
  return (
    <div className="qx-orbit-wrap" aria-hidden="true">
      <div className="qx-orbit-glow" />
      <div className="qx-orbit-ring">
        {OPTION_LABELS.map((letter, i) => (
          <div key={letter} className="qx-orbit-item" style={{ '--i': i, color: OPTION_COLORS[letter] }}>
            <ShapeIcon letter={letter} size={20} />
          </div>
        ))}
      </div>
      <div className="qx-orbit-center"><BrandMark size={40} /></div>
    </div>
  );
}

export default function OnlineQuizParticipant({ quizCode }) {
  const [phase, setPhase] = useState('join');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);

  const [participantId, setParticipantId] = useState(null);
  const [quizTitle, setQuizTitle] = useState('');
  const [participantCount, setParticipantCount] = useState(0);

  // ── Self-paced ("take it later") mode ──────────────────────────────
  // takeMode is only meaningful once the person has actually committed —
  // 'live' joins the shared in-progress question, 'solo' starts their own
  // independent run through the quiz from Question 1. prejoinStatus is a
  // lightweight peek at the quiz (no join yet) purely to decide whether the
  // join screen needs to offer that choice at all.
  const [prejoinStatus, setPrejoinStatus] = useState(null); // null while loading
  const [takeMode, setTakeMode] = useState(null); // null | 'live' | 'solo'
  const [soloSummary, setSoloSummary] = useState(null); // personal score once done
  const [soloLeaderboard, setSoloLeaderboard] = useState(null); // fresh self-paced standings as of finishing

  const [question, setQuestion] = useState(null);
  const [deadline, setDeadline] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(1);
  const [selectedLetters, setSelectedLetters] = useState([]);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [answerFeedback, setAnswerFeedback] = useState(null);
  const [pointsDisplay, setPointsDisplay] = useState(0);
  const [reveal, setReveal] = useState(null); // { correctAnswer, answerCounts, standings }

  const [leaderboard, setLeaderboard] = useState(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [connectionLost, setConnectionLost] = useState(false);

  const storageKey = 'quiz_participant_' + quizCode;
  const soloStorageKey = 'quiz_solo_participant_' + quizCode;
  const wasDisconnectedRef = useRef(false);
  const lastTickPlayedRef = useRef(null);
  const submittedRef = useRef(false); // guards against manual + auto-submit racing
  const timeUpPlayedRef = useRef(false);

  useEffect(() => { setMutedState(isMuted()); }, []);
  function toggleMute() { const next = !muted; setMuted(next); setMutedState(next); }

  // Seeds a fetched/advanced solo question into the same state the live
  // question screen reads from, so both phases can share one render block.
  const applySoloQuestion = useCallback((q, title) => {
    if (title !== undefined) setQuizTitle(title || '');
    setQuestion(q);
    setDeadline(Date.parse(q.startedAt || Date.now()) + q.timeLimitSec * 1000);
    setTotalSeconds(q.timeLimitSec);
    setSelectedLetters([]);
    setHasAnswered(false);
    setAnswerFeedback(null);
    setPointsDisplay(0);
    submittedRef.current = false;
    timeUpPlayedRef.current = false;
    setPhase('solo');
  }, []);

  // ── Peek at the quiz's status before joining ─────────────────────────
  // Purely informational — doesn't create a participant row. Lets the join
  // screen offer "take it at your own pace" only when it's actually
  // relevant (the live session is already underway or already over), and
  // skip straight to a normal join while the quiz is still in its lobby.
  useEffect(() => {
    quizApi.getQuizState(quizCode)
      .then(state => { setQuizTitle(state.title || ''); setPrejoinStatus(state.status); })
      .catch(() => setPrejoinStatus('lobby')); // fail open to the normal join form
  }, [quizCode]);

  // ── Restore identity on reload ──────────────────────────────────────
  useEffect(() => {
    try {
      const soloSaved = JSON.parse(sessionStorage.getItem(soloStorageKey) || 'null');
      if (soloSaved && soloSaved.participantId) {
        setParticipantId(soloSaved.participantId);
        setName(soloSaved.name || '');
        setTakeMode('solo');
        quizApi.getSoloState(quizCode, soloSaved.participantId).then(res => {
          if (res.completed) { setSoloSummary(res.summary); setSoloLeaderboard(res.leaderboard || null); setPhase('solo-done'); }
          else applySoloQuestion(res.question, res.title);
        }).catch(() => {});
        return;
      }
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
    } else if ((state.status === 'live' || state.status === 'paused') && state.currentQuestion) {
      setQuestion(prev => {
        if (prev && prev.qNum === state.currentQuestion.qNum) return prev;
        setHasAnswered(false);
        setAnswerFeedback(null);
        setSelectedLetters([]);
        submittedRef.current = false;
        timeUpPlayedRef.current = false;
        return state.currentQuestion;
      });
      setDeadline(Date.parse(state.currentQuestion.startedAt || Date.now()) + state.currentQuestion.timeLimitSec * 1000);
      setTotalSeconds(state.currentQuestion.timeLimitSec);
      setPaused(state.status === 'paused');
      setPhase(p => (p === 'between' ? p : 'live'));
    } else {
      setPhase(p => (p === 'join' ? p : 'lobby'));
    }
  }, [quizCode]);

  // ── Join ─────────────────────────────────────────────────────────────
  async function handleJoin(e) {
    e.preventDefault();
    setJoinError('');
    if (!name.trim()) { setJoinError('Enter your name to continue.'); return; }
    setJoining(true);
    try {
      if (takeMode === 'solo') {
        const res = await quizApi.joinSoloQuiz(quizCode, name.trim(), age ? Number(age) : '');
        setParticipantId(res.participantId);
        sessionStorage.setItem(soloStorageKey, JSON.stringify({ participantId: res.participantId, name: name.trim() }));
        quizSounds.join();
        applySoloQuestion(res.question, res.title);
      } else {
        const res = await quizApi.joinQuiz(quizCode, name.trim(), age ? Number(age) : '');
        setParticipantId(res.participantId);
        sessionStorage.setItem(storageKey, JSON.stringify({ participantId: res.participantId, name: name.trim() }));
        setPhase('lobby');
        quizSounds.join();
        const state = await quizApi.getQuizState(quizCode);
        applyState(state);
      }
    } catch (err) {
      setJoinError(err.message || 'Could not join this quiz.');
    } finally {
      setJoining(false);
    }
  }

  // ── Solo: click "Next"/"Finish" ────────────────────────────────────
  const [soloAdvancing, setSoloAdvancing] = useState(false);
  async function handleSoloNext() {
    setSoloAdvancing(true);
    try {
      const res = await quizApi.soloNextQuestion(quizCode, participantId);
      if (res.completed) {
        setSoloSummary(res.summary);
        setSoloLeaderboard(res.leaderboard || null);
        setPhase('solo-done');
        sessionStorage.removeItem(soloStorageKey);
      } else {
        applySoloQuestion(res.question);
        quizSounds.questionStart();
      }
    } catch (err) {
      setJoinError(err.message); // reused as a generic inline error surface
    } finally {
      setSoloAdvancing(false);
    }
  }

  // ── Pusher subscription ────────────────────────────────────────────
  useEffect(() => {
    if (!participantId || takeMode === 'solo') return; // solo mode is plain request/response — no realtime channel needed
    const unsubscribe = subscribeToQuiz(quizCode, {
      'participant-joined': (data) => setParticipantCount(data.participantCount),
      'quiz-started': () => setPhase(p => (p === 'lobby' ? 'live' : p)),
      'question-started': (data) => {
        setQuestion(data);
        setDeadline(Date.parse(data.startedAt) + data.timeLimitSec * 1000);
        setTotalSeconds(data.timeLimitSec);
        setSelectedLetters([]);
        setHasAnswered(false);
        setAnswerFeedback(null);
        setPointsDisplay(0);
        setReveal(null);
        submittedRef.current = false;
        timeUpPlayedRef.current = false;
        setPhase('live');
        quizSounds.questionStart();
      },
      'question-ended': (data) => {
        setReveal(data);
        setPhase('between');
        quizSounds.standingsReveal();
      },
      'quiz-paused': () => setPaused(true),
      'quiz-resumed': (data) => {
        setPaused(false);
        // Recompute against the server's shifted deadline (pause duration
        // excluded) rather than trusting whatever this device's local timer
        // was doing — every participant ends up counting down to the exact
        // same moment.
        if (data?.startedAt && data?.timeLimitSec) {
          setDeadline(Date.parse(data.startedAt) + data.timeLimitSec * 1000);
          setTotalSeconds(data.timeLimitSec);
        }
      },
      'quiz-ended': (data) => {
        // The realtime event's own payload only carries the live cohort
        // (that's all endQuiz freezes — see quiz.js), so a fuller
        // getResults() call layers in the current self-paced standings too.
        // Set the live-only data immediately so the screen doesn't sit
        // blank while that fetch is in flight.
        setLeaderboard(data.leaderboard);
        setPhase('ended');
        quizSounds.quizEnd();
        quizApi.getResults(quizCode).then(r => setLeaderboard(r.leaderboard)).catch(() => {});
      },
      'quiz-reset': () => {
        setQuestion(null);
        setDeadline(null);
        setSecondsLeft(0);
        setTotalSeconds(1);
        setSelectedLetters([]);
        setHasAnswered(false);
        setAnswerFeedback(null);
        setPointsDisplay(0);
        setReveal(null);
        setLeaderboard(null);
        setPaused(false);
        submittedRef.current = false;
        timeUpPlayedRef.current = false;
        setPhase('lobby'); // still joined — no need to re-enter the code, just waiting again
      },
      'removed': () => setPhase('removed'),
    }, { participantId });
    return unsubscribe;
  }, [participantId, quizCode]);

  // ── Connection-drop recovery ─────────────────────────────────────────
  useEffect(() => {
    if (!participantId || takeMode === 'solo') return;
    const unsubscribe = onConnectionStateChange((state) => {
      if (state === 'connected') {
        setConnectionLost(false);
        if (wasDisconnectedRef.current) quizApi.getQuizState(quizCode).then(applyState).catch(() => {});
        wasDisconnectedRef.current = false;
      } else if (state === 'unavailable' || state === 'failed' || state === 'disconnected') {
        wasDisconnectedRef.current = true;
        setConnectionLost(true);
      }
    });
    return unsubscribe;
  }, [participantId, quizCode, applyState]);

  // ── Submit (manual or auto-on-timeout) ────────────────────────────────
  const doSubmit = useCallback(async (letters) => {
    if (submittedRef.current || !question) return;
    submittedRef.current = true;
    setHasAnswered(true);
    try {
      const res = takeMode === 'solo'
        ? await quizApi.submitSoloAnswer(quizCode, participantId, question.qNum, letters.join(','))
        : await quizApi.submitAnswer(quizCode, participantId, question.qNum, letters.join(','));
      setAnswerFeedback({ isCorrect: res.isCorrect, pointsEarned: res.pointsEarned });
      if (res.isCorrect) quizSounds.correct(); else quizSounds.incorrect();
    } catch (err) {
      setAnswerFeedback({ error: err.message });
    }
  }, [question, quizCode, participantId, takeMode]);

  function toggleOption(letter) {
    if (hasAnswered || secondsLeft <= 0) return;
    setSelectedLetters(prev => {
      if (question?.multiSelect) {
        return prev.includes(letter) ? prev.filter(l => l !== letter) : [...prev, letter];
      }
      return prev.includes(letter) ? [] : [letter];
    });
  }

  function handleManualSubmit() {
    if (selectedLetters.length === 0) return;
    doSubmit(selectedLetters);
  }

  // ── Countdown + tick + time's-up + auto-submit ────────────────────────
  useEffect(() => {
    if ((phase !== 'live' && phase !== 'solo') || !deadline || paused) return; // frozen while paused — no interval runs at all (solo never pauses)
    const tick = () => {
      const s = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(s);
      if (!hasAnswered && s <= 5 && s > 0 && lastTickPlayedRef.current !== s) {
        lastTickPlayedRef.current = s;
        quizSounds.tick();
      }
      if (s === 0) {
        if (!timeUpPlayedRef.current) { timeUpPlayedRef.current = true; quizSounds.timeUp(); }
        if (!submittedRef.current) doSubmit(selectedLetters);
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, deadline, hasAnswered, selectedLetters, doSubmit, paused]);

  // ── Score count-up animation ──────────────────────────────────────────
  useEffect(() => {
    if (!answerFeedback || answerFeedback.error || typeof answerFeedback.pointsEarned !== 'number') return;
    const target = answerFeedback.pointsEarned;
    if (target === 0) { setPointsDisplay(0); return; }
    const start = performance.now();
    const durationMs = 500;
    let raf;
    const step = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      setPointsDisplay(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [answerFeedback]);

  const MuteToggle = () => (
    <button className="qx-mute-btn" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
      <i className={`fa-solid ${muted ? 'fa-volume-xmark' : 'fa-volume-high'}`} />
    </button>
  );
  const ConnectionBanner = () => connectionLost ? (
    <div className="qx-connbanner"><i className="fa-solid fa-triangle-exclamation" /> Reconnecting…</div>
  ) : null;

  // ── Render ───────────────────────────────────────────────────────────

  if (phase === 'join') {
    // "In progress" offers a choice between the live session and self-paced.
    // "Ended" no longer blocks joining at all — self-paced stays open
    // forever, specifically so someone who missed the live session can
    // still take it whenever they get to this link, even weeks later. Only
    // the "join the live session" option goes away once it's actually over,
    // since there's no live round left to jump into.
    const inProgress = prejoinStatus === 'live' || prejoinStatus === 'paused';
    const ended = prejoinStatus === 'ended';
    const needsModeChoice = (inProgress || ended) && takeMode === null;

    return (
      <div className="qx-root qx-wrap">
        <QuizFonts /><QuizThemeStyles /><ParticipantStyles />
        <MuteToggle />
        <BrandHeader />
        <div className="qx-card">
          <div className="qx-eyebrow">Quiz code</div>
          <div className="qx-code">{quizCode}</div>

          {prejoinStatus === null ? (
            <p className="qx-muted" style={{ textAlign: 'center' }}><i className="fa-solid fa-circle-notch fa-spin" /> Checking quiz status…</p>
          ) : needsModeChoice ? (
            <>
              <p className="qx-muted" style={{ textAlign: 'center', marginBottom: 18 }}>
                {ended
                  ? "This quiz's live session has already wrapped up, but it's still open — take it any time, at your own pace, from Question 1."
                  : 'This quiz is already in progress. You can jump into the live session, or take it on your own from Question 1 whenever you like.'}
              </p>
              {inProgress && (
                <button className="qx-btn qx-btn-primary" onClick={() => setTakeMode('live')}>
                  <i className="fa-solid fa-bolt" /> Join the Live Quiz
                </button>
              )}
              <button className={'qx-btn' + (inProgress ? '' : ' qx-btn-primary')}
                style={inProgress ? { background: 'var(--qx-surface-2)', color: 'var(--qx-text)' } : undefined}
                onClick={() => setTakeMode('solo')}>
                <i className="fa-solid fa-person-walking-arrow-right" /> Take It at My Own Pace
              </button>
              {ended && (
                <button type="button" className="qx-btn" style={{ background: 'transparent', color: 'var(--qx-muted)', marginTop: 4 }} onClick={() => {
                  quizApi.getResults(quizCode).then(r => { setLeaderboard(r.leaderboard); setPhase('ended'); }).catch(err => setJoinError(err.message));
                }}>
                  <i className="fa-solid fa-ranking-star" /> Just Show Me the Leaderboard
                </button>
              )}
            </>
          ) : (
            <form onSubmit={handleJoin}>
              {(inProgress || ended) && (
                <div className="qx-mode-chip">
                  {takeMode === 'solo'
                    ? <><i className="fa-solid fa-person-walking-arrow-right" /> Self-paced — starts at Question 1</>
                    : <><i className="fa-solid fa-bolt" /> Joining the live session</>}
                  <button type="button" className="qx-mode-change" onClick={() => setTakeMode(null)}>Change</button>
                </div>
              )}
              <label className="qx-label">Your name</label>
              <input className="qx-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Priya" autoFocus />
              <label className="qx-label">Your age</label>
              <input className="qx-input" type="number" min="1" max="120" value={age} onChange={e => setAge(e.target.value)} placeholder="e.g. 10" />
              {joinError && <div className="qx-error">{joinError}</div>}
              <button className="qx-btn qx-btn-primary" type="submit" disabled={joining}>
                {joining ? 'Joining…' : takeMode === 'solo' ? 'Start My Own Quiz' : 'Join Quiz'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'removed') {
    return (
      <div className="qx-root qx-wrap">
        <QuizFonts /><QuizThemeStyles /><ParticipantStyles />
        <MuteToggle />
        <div className="qx-card qx-center">
          <div className="qx-eyebrow" style={{ color: 'var(--qx-danger)' }}>Removed</div>
          <h1 className="qx-title">You've been removed from this quiz</h1>
          <p className="qx-muted">The host removed you from {quizTitle || quizCode}. If this was a mistake, you can rejoin with the same join code.</p>
          <button
            className="qx-btn qx-btn-primary"
            onClick={() => {
              sessionStorage.removeItem(storageKey);
              setParticipantId(null);
              setPhase('join');
            }}
          >
            <i className="fa-solid fa-arrow-rotate-right" /> Rejoin
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'lobby') {
    return (
      <div className="qx-root qx-wrap">
        <QuizFonts /><QuizThemeStyles /><ParticipantStyles />
        <MuteToggle />
        <ConnectionBanner />
        <div className="qx-card qx-center">
          <div className="qx-eyebrow">{PORTAL_NAME}</div>
          <h1 className="qx-title">{quizTitle || quizCode}</h1>
          <OrbitWaiting />
          <p className="qx-muted" style={{ marginTop: 4 }}>You're in! Waiting for the host to start…</p>
          <div className="qx-participant-count">{participantCount}</div>
          <div className="qx-muted" style={{ marginTop: -8 }}>players joined</div>
          <div className="qx-name-chip">Playing as <strong>{name}</strong></div>
        </div>
      </div>
    );
  }

  if (phase === 'live' && question) {
    const pct = totalSeconds > 0 ? secondsLeft / totalSeconds : 0;
    const circumference = 2 * Math.PI * 26;
    return (
      <div className="qx-root qx-wrap qx-live">
        <QuizFonts /><QuizThemeStyles /><ParticipantStyles />
        <ConnectionBanner />
        <div className="qx-live-header">
          <div className="qx-qnum">Question {question.qNum}{question.multiSelect && <span className="qx-multi-tag">select all that apply</span>}</div>
          <div className={'qx-ring-wrap' + (secondsLeft <= 5 ? ' qx-ring-urgent' : '')}>
            <svg width="60" height="60" viewBox="0 0 60 60">
              <circle cx="30" cy="30" r="26" fill="none" stroke="var(--qx-surface-2)" strokeWidth="5" />
              <circle
                cx="30" cy="30" r="26" fill="none"
                stroke={secondsLeft <= 5 ? 'var(--qx-danger)' : 'var(--qx-accent)'}
                strokeWidth="5" strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - pct)}
                transform="rotate(-90 30 30)"
                style={{ transition: 'stroke-dashoffset 0.25s linear' }}
              />
            </svg>
            <span className="qx-ring-num">{secondsLeft}</span>
          </div>
          <MuteToggle />
        </div>
        {paused && <div className="qx-banner">Quiz paused by host</div>}
        {question.mediaUrl && <img src={question.mediaUrl} alt="" className="qx-media" />}
        <div className="qx-question-text">{question.questionText}</div>

        {!hasAnswered ? (
          <>
            <div className="qx-options">
              {OPTION_LABELS.filter(l => question.options[l]).map(letter => {
                const active = selectedLetters.includes(letter);
                return (
                  <button
                    key={letter}
                    className={'qx-option' + (active ? ' qx-option-active' : '')}
                    style={{ '--tile-color': OPTION_COLORS[letter] }}
                    onClick={() => toggleOption(letter)}
                    disabled={secondsLeft <= 0}
                  >
                    <span className="qx-option-shape"><ShapeIcon letter={letter} /></span>
                    <span>{question.options[letter]}</span>
                  </button>
                );
              })}
            </div>
            <button
              className="qx-btn qx-btn-primary qx-submit-btn"
              disabled={selectedLetters.length === 0}
              onClick={handleManualSubmit}
            >
              <i className="fa-solid fa-paper-plane" /> Submit Answer
            </button>
          </>
        ) : (
          <div className="qx-card qx-center">
            {answerFeedback?.error ? (
              <p className="qx-error">{answerFeedback.error}</p>
            ) : answerFeedback ? (
              <>
                <div className={'qx-feedback ' + (answerFeedback.isCorrect ? 'qx-correct qx-bounce-in' : 'qx-incorrect qx-shake')}>
                  {answerFeedback.isCorrect ? '✓ Correct!' : '✗ Not quite'}
                </div>
                <div className="qx-points">+{pointsDisplay} pts</div>
              </>
            ) : (
              <p className="qx-muted">Answer locked in — scoring…</p>
            )}
            <p className="qx-muted">Waiting for other players…</p>
          </div>
        )}
      </div>
    );
  }

  if (phase === 'solo' && question) {
    const pct = totalSeconds > 0 ? secondsLeft / totalSeconds : 0;
    const circumference = 2 * Math.PI * 26;
    const isLastQuestion = question.qNum >= question.totalQuestions;
    return (
      <div className="qx-root qx-wrap qx-live">
        <QuizFonts /><QuizThemeStyles /><ParticipantStyles />
        <div className="qx-live-header">
          <div className="qx-qnum">
            Question {question.qNum} of {question.totalQuestions}
            {question.multiSelect && <span className="qx-multi-tag">select all that apply</span>}
          </div>
          <div className={'qx-ring-wrap' + (secondsLeft <= 5 ? ' qx-ring-urgent' : '')}>
            <svg width="60" height="60" viewBox="0 0 60 60">
              <circle cx="30" cy="30" r="26" fill="none" stroke="var(--qx-surface-2)" strokeWidth="5" />
              <circle
                cx="30" cy="30" r="26" fill="none"
                stroke={secondsLeft <= 5 ? 'var(--qx-danger)' : 'var(--qx-accent)'}
                strokeWidth="5" strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - pct)}
                transform="rotate(-90 30 30)"
                style={{ transition: 'stroke-dashoffset 0.25s linear' }}
              />
            </svg>
            <span className="qx-ring-num">{secondsLeft}</span>
          </div>
          <MuteToggle />
        </div>
        {question.mediaUrl && <img src={question.mediaUrl} alt="" className="qx-media" />}
        <div className="qx-question-text">{question.questionText}</div>

        {!hasAnswered ? (
          <>
            <div className="qx-options">
              {OPTION_LABELS.filter(l => question.options[l]).map(letter => {
                const active = selectedLetters.includes(letter);
                return (
                  <button
                    key={letter}
                    className={'qx-option' + (active ? ' qx-option-active' : '')}
                    style={{ '--tile-color': OPTION_COLORS[letter] }}
                    onClick={() => toggleOption(letter)}
                    disabled={secondsLeft <= 0}
                  >
                    <span className="qx-option-shape"><ShapeIcon letter={letter} /></span>
                    <span>{question.options[letter]}</span>
                  </button>
                );
              })}
            </div>
            <button
              className="qx-btn qx-btn-primary qx-submit-btn"
              disabled={selectedLetters.length === 0}
              onClick={handleManualSubmit}
            >
              <i className="fa-solid fa-paper-plane" /> Submit Answer
            </button>
          </>
        ) : (
          <div className="qx-card qx-center">
            {answerFeedback?.error ? (
              <p className="qx-error">{answerFeedback.error}</p>
            ) : answerFeedback ? (
              <>
                <div className={'qx-feedback ' + (answerFeedback.isCorrect ? 'qx-correct qx-bounce-in' : 'qx-incorrect qx-shake')}>
                  {answerFeedback.isCorrect ? '✓ Correct!' : '✗ Not quite'}
                </div>
                <div className="qx-points">+{pointsDisplay} pts</div>
              </>
            ) : (
              <p className="qx-muted">Answer locked in — scoring…</p>
            )}
            {/* No "waiting for other players" here — self-paced moves on
                whenever THIS person is ready, not on the host's clock. */}
            <button className="qx-btn qx-btn-primary" disabled={soloAdvancing} onClick={handleSoloNext}>
              {soloAdvancing
                ? <><i className="fa-solid fa-circle-notch fa-spin" /> Loading…</>
                : isLastQuestion
                  ? <><i className="fa-solid fa-flag-checkered" /> Finish</>
                  : <><i className="fa-solid fa-forward" /> Next Question</>}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (phase === 'solo-done' && soloSummary) {
    const mine = (soloLeaderboard || []).find(r => r.participantId === participantId);
    return (
      <div className="qx-root qx-wrap">
        <QuizFonts /><QuizThemeStyles /><ParticipantStyles />
        <MuteToggle />
        <div className="qx-card qx-center">
          <h1 className="qx-title">🏁 Quiz Complete!</h1>
          <p className="qx-muted">Nice work, {soloSummary.name} — here's how you did.</p>
          <div className="qx-my-result">
            {mine && <div className="qx-my-rank">Rank #{mine.rank} <span className="qx-muted" style={{ fontWeight: 400 }}>self-paced</span></div>}
            <div className="qx-my-score" style={{ fontSize: 28 }}>{soloSummary.totalScore} points</div>
            <div className="qx-muted">{soloSummary.correctAnswers} correct · {soloSummary.incorrectAnswers} incorrect</div>
          </div>

          {/* This is recomputed fresh every time someone finishes — it's
              never a stale snapshot. Anyone who takes the quiz later, even
              much later, bumps this list and can see exactly where they
              landed among everyone who's completed it so far. */}
          <h3 className="qx-leaderboard-title">Self-Paced Leaderboard</h3>
          <ol className="qx-leaderboard">
            {(soloLeaderboard || []).slice(0, 10).map(r => (
              <li key={r.participantId} className={r.participantId === participantId ? 'qx-me' : ''}>
                <span className="qx-lb-rank">#{r.rank}</span>
                <span className="qx-lb-name">{r.name}</span>
                <span className="qx-lb-score">{r.totalScore}</span>
              </li>
            ))}
          </ol>
          <button className="qx-btn" style={{ background: 'var(--qx-surface-2)', color: 'var(--qx-text)' }} onClick={() => {
            quizApi.getResults(quizCode).then(r => setSoloLeaderboard(r.leaderboard.filter(x => x.mode === 'solo'))).catch(() => {});
          }}>
            <i className="fa-solid fa-rotate" /> Refresh Rankings
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'between' && reveal) {
    const mine = reveal.standings?.find(s => s.participantId === participantId);
    return (
      <div className="qx-root qx-wrap">
        <QuizFonts /><QuizThemeStyles /><ParticipantStyles />
        <MuteToggle />
        <div className="qx-card qx-center">
          <div className="qx-eyebrow">Correct answer</div>
          <h2 className="qx-title">{reveal.correctAnswer}</h2>
          {(reveal.correctCount !== undefined) && (
            <div className="qx-tally-row">
              <span className="qx-tally qx-tally-correct"><i className="fa-solid fa-check" /> {reveal.correctCount} correct</span>
              <span className="qx-tally qx-tally-incorrect"><i className="fa-solid fa-xmark" /> {reveal.incorrectCount} incorrect</span>
            </div>
          )}
          <div className="qx-answer-bars">
            {OPTION_LABELS.map(letter => (
              reveal.answerCounts[letter] !== undefined && (
                <div key={letter} className="qx-answer-bar-row">
                  <span className="qx-option-shape qx-shape-sm" style={{ background: OPTION_COLORS[letter] }}><ShapeIcon letter={letter} size={14} /></span>
                  <span>{reveal.answerCounts[letter]}</span>
                </div>
              )
            ))}
          </div>

          {answerFeedback && !answerFeedback.error && (
            <div className={'qx-round-result ' + (answerFeedback.isCorrect ? 'qx-correct' : 'qx-incorrect')}>
              {answerFeedback.isCorrect ? '✓' : '✗'} This round: +{answerFeedback.pointsEarned} pts
            </div>
          )}

          {reveal.standings?.length > 0 && (
            <>
              <h3 className="qx-leaderboard-title">Standings so far</h3>
              <ol className="qx-leaderboard">
                {reveal.standings.map(r => (
                  <li key={r.participantId} className={r.participantId === participantId ? 'qx-me' : ''}>
                    <span className="qx-lb-rank">#{r.rank}</span>
                    <span className="qx-lb-name">{r.name}</span>
                    <span className="qx-lb-score">{r.totalScore}</span>
                  </li>
                ))}
              </ol>
              {mine && !reveal.standings.find(s => s.participantId === participantId) && (
                <p className="qx-muted">You're currently outside the top 8.</p>
              )}
            </>
          )}
          <p className="qx-muted" style={{ marginTop: 12 }}>Get ready for the next question…</p>
        </div>
      </div>
    );
  }

  if (phase === 'ended') {
    // Split by mode, same reason as before — each group's ranks restart at
    // 1 (see quiz.js's endQuiz/computeSoloLeaderboard), so mixing them would
    // show two different people both labeled "#1". Self-paced is now shown
    // too (not just live) since it's the section that keeps growing after
    // this screen first loads — see the "Refresh" button below.
    const liveLeaderboard = (leaderboard || []).filter(r => r.mode !== 'solo');
    const soloLb = (leaderboard || []).filter(r => r.mode === 'solo');
    const mine = liveLeaderboard.find(r => r.participantId === participantId);
    const isTopThree = mine && mine.rank <= 3;
    return (
      <div className="qx-root qx-wrap">
        <QuizFonts /><QuizThemeStyles /><ParticipantStyles />
        <MuteToggle />
        {isTopThree && <Confetti />}
        <div className="qx-card qx-center">
          <h1 className="qx-title">🏁 Quiz Complete!</h1>
          {mine && (
            <div className="qx-my-result">
              <div className={'qx-my-rank' + (isTopThree ? ' qx-rank-glow' : '')}>
                {mine.rank === 1 ? '🥇' : mine.rank === 2 ? '🥈' : mine.rank === 3 ? '🥉' : ''} Rank #{mine.rank}
              </div>
              <div className="qx-my-score">{mine.totalScore} points</div>
              <div className="qx-muted">{mine.correctAnswers} correct · {mine.incorrectAnswers} incorrect</div>
            </div>
          )}
          <h3 className="qx-leaderboard-title">Live Leaderboard</h3>
          <ol className="qx-leaderboard">
            {liveLeaderboard.length
              ? liveLeaderboard.slice(0, 10).map(r => (
                <li key={r.participantId} className={r.participantId === participantId ? 'qx-me' : ''}>
                  <span className="qx-lb-rank">#{r.rank}</span>
                  <span className="qx-lb-name">{r.name}</span>
                  <span className="qx-lb-score">{r.totalScore}</span>
                </li>
              ))
              : <li><span className="qx-muted">No one played live.</span></li>}
          </ol>

          {/* Keeps growing after this screen first loads, since self-paced
              never closes — this section is worth re-checking later. */}
          <h3 className="qx-leaderboard-title">Self-Paced Leaderboard</h3>
          <ol className="qx-leaderboard">
            {soloLb.length
              ? soloLb.slice(0, 10).map(r => (
                <li key={r.participantId}>
                  <span className="qx-lb-rank">#{r.rank}</span>
                  <span className="qx-lb-name">{r.name}</span>
                  <span className="qx-lb-score">{r.totalScore}</span>
                </li>
              ))
              : <li><span className="qx-muted">No one has taken this quiz self-paced yet.</span></li>}
          </ol>
          <button className="qx-btn" style={{ background: 'var(--qx-surface-2)', color: 'var(--qx-text)' }} onClick={() => {
            quizApi.getResults(quizCode).then(r => setLeaderboard(r.leaderboard)).catch(() => {});
          }}>
            <i className="fa-solid fa-rotate" /> Refresh Rankings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="qx-root qx-wrap">
      <QuizFonts /><QuizThemeStyles /><ParticipantStyles />
      <div className="qx-card qx-center"><p className="qx-muted">Loading…</p></div>
    </div>
  );
}

function Confetti() {
  const pieces = Array.from({ length: 40 }, (_, i) => ({
    id: i, left: Math.random() * 100, delay: Math.random() * 0.6,
    duration: 2.2 + Math.random() * 1.2,
    color: ['#ff5c7a', '#22d3b0', '#ffb020', '#6c7bff', '#34e7b4'][i % 5],
    rotate: Math.random() * 360,
  }));
  return (
    <div className="qx-confetti-wrap" aria-hidden="true">
      {pieces.map(p => (
        <span key={p.id} className="qx-confetti-piece" style={{
          left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`,
          animationDuration: `${p.duration}s`, transform: `rotate(${p.rotate}deg)`,
        }} />
      ))}
    </div>
  );
}

function ParticipantStyles() {
  return (
    <style jsx global>{`
      .qx-brand { text-align: center; margin-bottom: 22px; }
      .qx-brandmark { display: block; margin: 0 auto 10px; filter: drop-shadow(0 6px 18px rgba(34,211,176,0.25)); }
      .qx-brand-title { font-size: 25px; max-width: 320px; margin: 0 auto; }

      .qx-orbit-wrap { position: relative; width: 148px; height: 148px; margin: 18px auto 6px; }
      .qx-orbit-glow {
        position: absolute; inset: 10px; border-radius: 50%;
        background: radial-gradient(circle, var(--qx-accent-dim) 0%, transparent 70%);
        animation: qx-orbit-glow-pulse 2.4s ease-in-out infinite;
      }
      @keyframes qx-orbit-glow-pulse { 0%,100% { opacity: 0.6; transform: scale(0.92); } 50% { opacity: 1; transform: scale(1.06); } }
      .qx-orbit-center {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      }
      .qx-orbit-ring { position: absolute; inset: 0; animation: qx-orbit-spin 8s linear infinite; }
      @keyframes qx-orbit-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      .qx-orbit-item {
        position: absolute; top: 50%; left: 50%; width: 34px; height: 34px;
        margin: -17px 0 0 -17px; display: flex; align-items: center; justify-content: center;
        background: var(--qx-surface); border-radius: 10px; box-shadow: 0 4px 14px rgba(0,0,0,0.35);
        transform: rotate(calc(var(--i) * 90deg)) translate(64px) rotate(calc(var(--i) * -90deg));
        animation: qx-orbit-counter-spin 8s linear infinite;
      }
      /* counter-rotate each icon so the shapes themselves stay upright while
         still visibly traveling around the ring */
      @keyframes qx-orbit-counter-spin { from { transform: rotate(calc(var(--i) * 90deg)) translate(64px) rotate(calc(var(--i) * -90deg)) rotate(0deg); } to { transform: rotate(calc(var(--i) * 90deg)) translate(64px) rotate(calc(var(--i) * -90deg)) rotate(-360deg); } }
      @media (prefers-reduced-motion: reduce) { .qx-orbit-ring, .qx-orbit-item, .qx-orbit-glow { animation: none; } }

      .qx-live { justify-content: flex-start; padding-top: max(12px, env(safe-area-inset-top)); }
      .qx-code {
        font-family: var(--qx-font-mono); font-size: 34px; font-weight: 700; letter-spacing: 6px;
        color: var(--qx-accent); text-align: center; margin-bottom: 22px;
      }
      .qx-pulse-dot {
        width: 14px; height: 14px; border-radius: 50%; background: var(--qx-accent);
        margin: 22px auto 10px; animation: qx-pulse 1.4s ease-in-out infinite;
      }
      @keyframes qx-pulse { 0%,100% { opacity: 0.3; transform: scale(0.8);} 50% { opacity: 1; transform: scale(1.2);} }
      .qx-participant-count { font-family: var(--qx-font-display); font-size: 44px; font-weight: 600; margin: 4px 0 0; }
      .qx-name-chip { display: inline-block; margin-top: 16px; padding: 7px 16px; border-radius: 999px; background: var(--qx-surface-2); font-size: 13px; }
      .qx-mode-chip {
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
        background: var(--qx-accent-dim); color: var(--qx-accent); font-weight: 700; font-size: 12px;
        padding: 8px 12px; border-radius: 999px; margin-bottom: 18px;
      }
      .qx-mode-change {
        background: none; border: none; color: inherit; text-decoration: underline; font-size: 12px;
        font-weight: 700; cursor: pointer; padding: 0; font-family: inherit;
      }

      .qx-live-header { display: flex; justify-content: space-between; align-items: center; width: 100%; max-width: 620px; margin-bottom: 18px; gap: 10px; }
      .qx-qnum { font-size: 14px; color: var(--qx-muted); font-weight: 600; display: flex; flex-direction: column; gap: 2px; }
      .qx-multi-tag {
        font-family: var(--qx-font-mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em;
        color: var(--qx-accent-2); font-weight: 700;
      }
      .qx-ring-wrap { position: relative; width: 60px; height: 60px; flex-shrink: 0; }
      .qx-ring-num {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        font-family: var(--qx-font-mono); font-size: 20px; font-weight: 700;
      }
      .qx-ring-urgent .qx-ring-num { color: var(--qx-danger); animation: qx-ring-pulse 1s ease-in-out infinite; }
      @keyframes qx-ring-pulse { 0%,100% { transform: scale(1);} 50% { transform: scale(1.15);} }

      .qx-media { max-width: 620px; width: 100%; border-radius: var(--qx-radius); margin-bottom: 16px; }
      .qx-question-text {
        font-family: var(--qx-font-display); font-weight: 500; font-size: 24px; text-align: center;
        max-width: 620px; margin: 0 auto 26px; padding: 0 8px; line-height: 1.3;
      }
      .qx-options { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; width: 100%; max-width: 620px; margin: 0 auto; padding: 0 4px; box-sizing: border-box; }
      @media (max-width: 480px) { .qx-options { grid-template-columns: 1fr; } .qx-question-text { font-size: 20px; } }
      .qx-option {
        position: relative; display: flex; align-items: center; gap: 12px; padding: 20px;
        min-height: 68px; border: 2px solid transparent; border-radius: var(--qx-radius);
        background: var(--qx-surface); color: var(--qx-text); font-size: 16px; font-weight: 600;
        cursor: pointer; text-align: left; -webkit-tap-highlight-color: transparent;
        transition: transform 0.08s, border-color 0.15s, background 0.15s;
      }
      .qx-option:active:not(:disabled) { transform: scale(0.97); }
      .qx-option:disabled { opacity: 0.5; cursor: not-allowed; }
      .qx-option-active {
        border-color: var(--tile-color);
        background: var(--tile-color);
        color: #0e0f24;
      }
      .qx-option-active .qx-option-shape { background: rgba(14,15,36,0.18); color: #0e0f24; }
      .qx-option-shape {
        display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px;
        border-radius: 9px; background: var(--tile-color); color: #0e0f24; flex-shrink: 0;
      }
      .qx-submit-btn { max-width: 620px; margin-left: auto; margin-right: auto; margin-top: 18px; }

      .qx-feedback { font-family: var(--qx-font-display); font-size: 26px; font-weight: 600; margin-bottom: 8px; }
      .qx-correct { color: var(--qx-success); }
      .qx-incorrect { color: var(--qx-danger); }
      .qx-bounce-in { animation: qx-bounce-in 0.4s ease-out; }
      @keyframes qx-bounce-in { 0% { transform: scale(0.5); opacity: 0; } 60% { transform: scale(1.15); opacity: 1; } 100% { transform: scale(1); } }
      .qx-shake { animation: qx-shake 0.4s ease-in-out; }
      @keyframes qx-shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-8px); } 75% { transform: translateX(8px); } }
      .qx-points { font-family: var(--qx-font-mono); font-size: 20px; font-weight: 700; color: var(--qx-accent); margin-bottom: 16px; }

      .qx-answer-bars { display: flex; flex-direction: column; gap: 10px; margin: 20px 0; }
      .qx-tally-row { display: flex; gap: 8px; justify-content: center; margin: 10px 0 4px; flex-wrap: wrap; }
      .qx-tally { font-family: var(--qx-font-mono); font-size: 12px; font-weight: 700; padding: 6px 12px; border-radius: 999px; display: inline-flex; align-items: center; gap: 6px; }
      .qx-tally-correct { background: rgba(52,231,180,0.14); color: var(--qx-success); }
      .qx-tally-incorrect { background: var(--qx-danger-dim); color: var(--qx-danger); }
      .qx-answer-bar-row { display: flex; align-items: center; gap: 12px; }
      .qx-shape-sm { width: 26px; height: 26px; border-radius: 7px; display: flex; align-items: center; justify-content: center; color: #0e0f24; }
      .qx-round-result {
        font-weight: 700; padding: 10px 16px; border-radius: var(--qx-radius-sm);
        background: var(--qx-surface-2); display: inline-block; margin: 6px 0 4px;
      }

      .qx-my-result { margin: 16px 0 24px; }
      .qx-my-rank { font-family: var(--qx-font-display); font-size: 28px; font-weight: 600; color: var(--qx-accent); }
      .qx-rank-glow { text-shadow: 0 0 24px rgba(255, 176, 32, 0.55); }
      .qx-my-score { font-family: var(--qx-font-mono); font-size: 20px; font-weight: 700; margin: 4px 0; }

      .qx-confetti-wrap { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 40; }
      .qx-confetti-piece { position: absolute; top: -20px; width: 8px; height: 14px; animation-name: qx-confetti-fall; animation-timing-function: ease-in; animation-fill-mode: forwards; }
      @keyframes qx-confetti-fall { 0% { top: -20px; opacity: 1; } 100% { top: 110vh; opacity: 0.7; } }
    `}</style>
  );
}
