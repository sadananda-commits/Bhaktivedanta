// components/QuizPlayer.js
//
// Extracted verbatim from pages/portal.js so the exact same battle-tested
// quiz-taking engine (timer, sounds, fireworks, streaks, Match-the-Following,
// MCQ single/multi-select, per-question timing) can be reused by BOTH the
// logged-in student portal AND the new public guest quiz page (pages/quiz.js)
// — without maintaining two copies of this logic.
//
// portal.js now imports LearningModulePlayer from here instead of defining
// it locally. Nothing about its behavior has changed — this is a pure
// cut-and-paste move, no logic was touched.
// ────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react';
import MatchTheFollowing from './MatchTheFollowing';

function isRowActive(v) {
  if (v === undefined || v === null || v === '') return true;
  if (v === false || v === 0) return false;
  const s = String(v).trim().toLowerCase();
  return !(s === 'false' || s === 'no' || s === 'n' || s === '0' || s === 'inactive');
}

// Folds raw StudentProgress rows (one row per answered question, as written
// by recordAnswer()/api/student/progress) back into the same per-module
// summary shape (`{attempted, correct, incorrect, completionPct, startedAt,
// completedAt, answers}`) that LearningModulePlayer and the dashboard already
// expect from localStorage. Used to rebuild a student's progress on a device
// that doesn't have it cached locally. Keeps only the latest row per
// (module, question) in case a question was somehow synced more than once.
//
// `stepsFor(moduleId)` returns that module's actual steps array (not just a
// count) — needed for two things:
//   1. completionPct/completedAt, same as before.
//   2. Translating each row's QuestionNumber (the sheet's 'Step Number') into
//      that question's array index. LearningModulePlayer keys its live
//      `answers` object by array index rather than Step Number (Step Number
//      is content-managed data and isn't guaranteed unique — see the
//      `currentAnswer` comment in LearningModulePlayer), so a rebuild that
//      kept using Step Number as the key would silently stop lining up with
//      live answers, making resumed/reviewed questions look wrong or
//      unanswered even though the sheet has the record. A row whose
//      QuestionNumber no longer matches any current step (chapter content
//      changed since it was answered) is skipped rather than guessed at.

function useSoundEngine() {
  const acRef = useRef(null);
  const getAC = () => {
    if (typeof window === 'undefined') return null;
    if (!acRef.current) {
      try { acRef.current = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
    }
    // Chrome suspends AudioContext until a user gesture — resume silently.
    if (acRef.current.state === 'suspended') acRef.current.resume().catch(() => {});
    return acRef.current;
  };

  // Tiny tone helper: freq(Hz), duration(s), type, gainPeak
  const tone = (ac, freq, start, dur, type='sine', peak=0.35) => {
    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain); gain.connect(ac.destination);
    osc.type = type; osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.start(start); osc.stop(start + dur + 0.01);
  };

  const playCorrect = useCallback(() => {
    const ac = getAC(); if (!ac) return;
    const t0 = ac.currentTime;
    // Rising two-note chime: C5 → E5
    tone(ac, 523, t0,       0.18, 'sine', 0.30);
    tone(ac, 659, t0 + 0.14, 0.22, 'sine', 0.28);
  }, []);

  const playWrong = useCallback(() => {
    const ac = getAC(); if (!ac) return;
    const t0 = ac.currentTime;
    // Descending buzz: A3 → F3, sawtooth for a "bzzzt" texture
    tone(ac, 220, t0,       0.14, 'sawtooth', 0.20);
    tone(ac, 175, t0 + 0.12, 0.18, 'sawtooth', 0.15);
  }, []);

  // streak: 5 | 8 | 12 | 10(fireworks) — 10 uses a fanfare
  const playStreak = useCallback((streak) => {
    const ac = getAC(); if (!ac) return;
    const t0 = ac.currentTime;
    if (streak >= 10) {
      // 10-in-a-row fanfare: C5 E5 G5 C6 ascending triplet
      [[523,0],[659,.12],[784,.24],[1047,.38]].forEach(([f,dt]) => tone(ac, f, t0+dt, 0.22, 'sine', 0.32));
    } else if (streak >= 8) {
      // 3-note rising arpeggio
      [[523,0],[659,.12],[784,.24]].forEach(([f,dt]) => tone(ac, f, t0+dt, 0.20, 'sine', 0.30));
    } else {
      // 5-in-a-row: two-tone chime, slightly brighter than a normal correct
      tone(ac, 659, t0,       0.18, 'sine', 0.32);
      tone(ac, 880, t0 + 0.14, 0.20, 'sine', 0.28);
    }
  }, []);

  return { playCorrect, playWrong, playStreak };
}

// ─────────────────────────────────────────────────────────────────────────────
// FIREWORKS CANVAS — rendered as a fixed overlay, auto-dismisses after 2.6 s.
// Triggered when streak hits 10 (and multiples thereof).
// Pure canvas, no libs. Particle physics: initial velocity + gravity + fade.
// ─────────────────────────────────────────────────────────────────────────────
function FireworksOverlay({ active, onDone }) {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    // 6 burst origins spread across top-third of the screen
    const COLORS = ['#f5a623','#00c6a7','#f87171','#c084fc','#60a5fa','#4ade80','#fbbf24','#e879f9'];
    const particles = [];
    const makeBurst = (x, y) => {
      for (let i = 0; i < 55; i++) {
        const angle = (Math.PI * 2 * i) / 55;
        const speed = 3 + Math.random() * 5;
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          alpha: 1,
          radius: 3 + Math.random() * 3,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          decay: 0.012 + Math.random() * 0.01,
          gravity: 0.12,
        });
      }
    };

    // Stagger 6 bursts over 600 ms for a multi-burst feel
    const burstPositions = [
      [canvas.width*0.2, canvas.height*0.3],
      [canvas.width*0.5, canvas.height*0.15],
      [canvas.width*0.8, canvas.height*0.28],
      [canvas.width*0.35,canvas.height*0.22],
      [canvas.width*0.65,canvas.height*0.35],
      [canvas.width*0.5, canvas.height*0.42],
    ];
    burstPositions.forEach(([x,y],i) => setTimeout(() => makeBurst(x,y), i*110));

    let start = null;
    const DURATION = 2600;
    const loop = (ts) => {
      if (!start) start = ts;
      const elapsed = ts - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.vy += p.gravity;
        p.x  += p.vx;
        p.y  += p.vy;
        p.alpha -= p.decay;
        if (p.alpha <= 0) return;
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle   = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
      if (elapsed < DURATION) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        onDone?.();
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [active]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      style={{
        position:'fixed', inset:0, zIndex:9999,
        pointerEvents:'none', // clicks pass through
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STREAK TOAST — shown as a non-blocking banner when streak milestones are hit.
// ─────────────────────────────────────────────────────────────────────────────
const STREAK_MILESTONES = [
  { at:5,  emoji:'🔥',  label:'5 in a Row!',   sub:'You\'re on fire! Keep it up!',        color:'#f97316' },
  { at:8,  emoji:'⚡',  label:'8 Correct!',    sub:'Incredible focus — amazing streak!',   color:'#a855f7' },
  { at:10, emoji:'🎆',  label:'10 in a Row!',  sub:'FIREWORKS! You\'re unstoppable!',      color:'#f5a623' },
  { at:12, emoji:'👑',  label:'12 Correct!',   sub:'CROWN LEVEL! You\'re a genius!',       color:'#00c6a7' },
];

function StreakToast({ streak, onDone }) {
  const ms = STREAK_MILESTONES.slice().reverse().find(m => streak >= m.at && streak % m.at === 0 ) ||
             STREAK_MILESTONES.slice().reverse().find(m => streak === m.at);
  const [visible, setVisible] = useState(true);
  useEffect(() => { const t = setTimeout(() => { setVisible(false); onDone?.(); }, 2400); return () => clearTimeout(t); }, [streak]);
  if (!ms || !visible) return null;
  return (
    <div style={{
      position:'fixed', top:'18px', left:'50%', transform:'translateX(-50%)',
      zIndex:10000, pointerEvents:'none',
      background:`linear-gradient(135deg,${ms.color}22,${ms.color}44)`,
      border:`1.5px solid ${ms.color}66`,
      borderRadius:'18px', padding:'14px 28px', textAlign:'center',
      backdropFilter:'blur(12px)',
      animation:'streakPop .35s cubic-bezier(.34,1.56,.64,1) both',
      boxShadow:`0 8px 32px ${ms.color}44`,
    }}>
      <div style={{fontSize:'36px',lineHeight:1,marginBottom:'4px'}}>{ms.emoji}</div>
      <div style={{fontFamily:'var(--fd)',fontSize:'20px',fontWeight:900,color:'#fff'}}>{ms.label}</div>
      <div style={{fontSize:'12px',color:'rgba(255,255,255,.7)',marginTop:'3px'}}>{ms.sub}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// useTestTimer — high-precision count-up timer for the quiz player.
//
// • Uses performance.now() so accuracy is maintained even if the tab is hidden.
// • Pauses automatically after INACTIVITY_PAUSE_MS (5 min) of no mouse/touch/
//   keyboard activity, and resumes the instant the student interacts again.
// • On finish() it stops, calculates total elapsed seconds, and POSTs to
//   /api/student/test-time (best-effort — localStorage is the primary store).
// • Persists startTime + elapsed seconds in localStorage so a page refresh
//   mid-test does not zero the clock.
//
// Config sheet keys (add to the "Config" tab in the Master Sheet):
//   EnableTestTimer   TRUE / FALSE   — FALSE disables timer entirely (no UI, no log). Default TRUE.
//   ShowTestTimer     TRUE / FALSE   — FALSE hides the clock but still logs. Default TRUE.
// ─────────────────────────────────────────────────────────────────────────────
const INACTIVITY_PAUSE_MS = 5 * 60 * 1000; // 5 minutes

function useTestTimer({ moduleId, profile, subject, topic, enabled = true }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isPaused,       setIsPaused]       = useState(false);

  const baseElapsed  = useRef(0);   // seconds already banked before this browser session
  const sessionStart = useRef(null);// performance.now() of when this session began
  const stopped      = useRef(false);
  const lastActivity = useRef(Date.now());
  const pausedAt     = useRef(null);// performance.now() when inactivity pause began
  const pausedMs     = useRef(0);   // total ms paused this session
  const rafId        = useRef(null);
  const logged       = useRef(false);


  // Restore any previously banked elapsed time (survives page refresh)
  useEffect(() => {
    if (!enabled || !moduleId || !profile?.id) return;
    try {
      const raw = localStorage.getItem(`testTimer:${profile.id}:${moduleId}`);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.elapsed) baseElapsed.current = Number(saved.elapsed) || 0;
      }
    } catch {}
  }, [enabled, moduleId, profile?.id]);

  // Activity listeners — any interaction resets the inactivity clock
  useEffect(() => {
    if (!enabled) return;
    const touch = () => { lastActivity.current = Date.now(); };
    window.addEventListener('mousemove',  touch, { passive: true });
    window.addEventListener('mousedown',  touch, { passive: true });
    window.addEventListener('keydown',    touch, { passive: true });
    window.addEventListener('touchstart', touch, { passive: true });
    return () => {
      window.removeEventListener('mousemove',  touch);
      window.removeEventListener('mousedown',  touch);
      window.removeEventListener('keydown',    touch);
      window.removeEventListener('touchstart', touch);
    };
  }, [enabled]);

  // RAF loop — ticks every animation frame, updates UI once per second
  useEffect(() => {
    if (!enabled || !moduleId) return;
    sessionStart.current = performance.now();
    stopped.current      = false;
    logged.current       = false;
    pausedAt.current     = null;
    pausedMs.current     = 0;
    let lastTick = -1;

    const tick = () => {
      if (stopped.current) return;
      const now            = performance.now();
      const sinceActivity  = Date.now() - lastActivity.current;

      // Inactivity pause logic
      if (sinceActivity >= INACTIVITY_PAUSE_MS && !pausedAt.current) {
        pausedAt.current = now;
        setIsPaused(true);
      } else if (sinceActivity < INACTIVITY_PAUSE_MS && pausedAt.current) {
        pausedMs.current += now - pausedAt.current;
        pausedAt.current  = null;
        setIsPaused(false);
      }

      // Net elapsed: session duration minus all paused ms
      const activePausedMs = pausedAt.current ? (now - pausedAt.current) : 0;
      const sessionMs      = now - sessionStart.current - pausedMs.current - activePausedMs;
      const totalSecs      = Math.floor(baseElapsed.current + sessionMs / 1000);

      if (totalSecs !== lastTick) {
        lastTick = totalSecs;
        setElapsedSeconds(totalSecs);
        // Persist every tick so a refresh resumes from here
        try {
          localStorage.setItem(
            `testTimer:${profile.id}:${moduleId}`,
            JSON.stringify({ elapsed: totalSecs, ts: Date.now() })
          );
        } catch {}
      }

      rafId.current = requestAnimationFrame(tick);
    };

    rafId.current = requestAnimationFrame(tick);
    return () => { if (rafId.current) cancelAnimationFrame(rafId.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, moduleId, profile?.id]);

  // stop() — call when the student finishes the last question
  const stop = useCallback((finalSecs) => {
    if (!enabled || logged.current) return;
    logged.current  = true;
    stopped.current = true;
    if (rafId.current) cancelAnimationFrame(rafId.current);

    const totalSeconds = typeof finalSecs === 'number' ? finalSecs : elapsedSeconds;

    // Clear the in-progress localStorage key
    try { localStorage.removeItem(`testTimer:${profile.id}:${moduleId}`); } catch {}

    // Stash timeTakenSeconds into learnProgress so Completed Topics tab can
    // display it immediately without a sheet round-trip.
    try {
      const lpKey = `learnProgress:${profile.id}`;
      const lp    = JSON.parse(localStorage.getItem(lpKey) || '{}');
      if (!lp[moduleId]) lp[moduleId] = {};
      lp[moduleId].timeTakenSeconds = totalSeconds;
      localStorage.setItem(lpKey, JSON.stringify(lp));
    } catch {}

    // POST to the logging API — best-effort
    fetch('/api/student/test-time', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId:   profile.id,
        studentName: profile.name       || '',
        classLevel:  profile.classLevel || '',
        subject:     subject  || '',
        topic:       topic    || '',
        moduleId,
        totalSeconds,
        completedAt: new Date().toISOString(),
      }),
    }).catch(() => {});
  }, [enabled, elapsedSeconds, moduleId, profile, subject, topic]);

  // Build display string: MM:SS when < 1 hour, HH:MM:SS otherwise
  const h = Math.floor(elapsedSeconds / 3600);
  const m = Math.floor((elapsedSeconds % 3600) / 60);
  const s = elapsedSeconds % 60;
  const displayStr = h > 0
    ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

  return { elapsedSeconds, displayStr, isPaused, stop };
}


function LearningModulePlayer({ module, steps: allSteps, progress, onSave, onAnswer, onExit, backLabel, soundConfig, t, rangeFrom, rangeTo, onRangeComplete, profile, timerConfig }) {
  // ── Parent/teacher-assigned question range (Assignments for you) ────────
  // When a student opens a chapter from the "Assignments for you" tab
  // instead of the open Question Bank, rangeFrom/rangeTo restrict play to
  // just the assigned question numbers (1-indexed, inclusive — matches the
  // "From Question" / "To Question" columns the parent set in the Parent
  // Portal builder table). Original 'Step Number' values are preserved so
  // explanations/keys/review screens still reference the real chapter
  // question numbers, not 1..N of the restricted slice.
  const steps = (rangeFrom && rangeTo) ? allSteps.slice(rangeFrom - 1, rangeTo) : allSteps;
  // ── Sound control from Config sheet ──────────────────────────────────────
  // Keys in the Config tab (case-sensitive):
  //   SoundOnCorrect        TRUE / FALSE   (default: TRUE)
  //   SoundOnWrong          TRUE / FALSE   (default: TRUE)
  //   SoundOnStreak         TRUE / FALSE   (default: TRUE)
  //   StreakThreshold       number         (default: 5 — first milestone)
  //   ShowQuestionDropdown  TRUE / FALSE   (default: FALSE — dropdown hidden)
  // An absent key or any value other than the string 'FALSE' keeps sound ON.
  const sc = soundConfig || {};
  const soundOnCorrect       = (sc['SoundOnCorrect']       || 'TRUE').toString().toUpperCase() !== 'FALSE';
  const soundOnWrong         = (sc['SoundOnWrong']         || 'TRUE').toString().toUpperCase() !== 'FALSE';
  const soundOnStreak        = (sc['SoundOnStreak']        || 'TRUE').toString().toUpperCase() !== 'FALSE';
  const streakThreshold      = Math.max(2, parseInt(sc['StreakThreshold'] || '5', 10) || 5);
  const showQuestionDropdown = (sc['ShowQuestionDropdown'] || 'FALSE').toString().toUpperCase() === 'TRUE';

  // ── Timer config (Config sheet keys) ─────────────────────────────────────
  // EnableTestTimer  TRUE/FALSE  — set FALSE to disable entirely (default TRUE)
  // ShowTestTimer    TRUE/FALSE  — set FALSE to hide clock but still log (default TRUE)
  const tc          = timerConfig || {};
  const enableTimer = (tc['EnableTestTimer'] || 'TRUE').toString().toUpperCase() !== 'FALSE';
  const showTimerUI = (tc['ShowTestTimer']   || 'TRUE').toString().toUpperCase() !== 'FALSE';

  const timer = useTestTimer({
    moduleId: module?.['Module ID'],
    profile:  profile || { id: 'anon', name: '', classLevel: '' },
    subject:  module?.SubjectEN || module?.Subject || '',
    topic:    module?.Title || '',
    enabled:  enableTimer,
  });

  const total = steps.length;
  const attemptedCount = progress?.answers ? Object.keys(progress.answers).length : 0;
  const isComplete = !!progress?.completedAt;

  const [view,          setView]          = useState('intro'); // intro | lesson | complete
  const [idx,           setIdx]           = useState(0);
  const [answers,       setAnswers]       = useState(progress?.answers || {});
  // streak: consecutive correct answers in this session (reset on wrong answer or retake)
  const [streak,        setStreak]        = useState(0);
  // toastStreak: the streak value that triggered the current toast (so re-renders don't re-show it)
  const [toastStreak,   setToastStreak]   = useState(0);
  const [showFireworks, setShowFireworks] = useState(false);

  const { playCorrect, playWrong, playStreak } = useSoundEngine();

  // selected/locked are derived from answers+idx rather than tracked as their
  // own state — this is what makes Previous/Next safe: jumping to any step
  // (forward or backward) automatically shows that step's saved answer
  // (locked, colored correct/incorrect) if one exists, or a fresh unanswered
  // question if it doesn't, with no extra bookkeeping to keep in sync.
  //
  // IMPORTANT: keyed by `idx` (this question's position in `steps`), NOT by
  // the sheet's 'Step Number' field. Step Number is content-managed data —
  // duplicate rows, a re-ordered Learning Steps tab, or two sections that
  // both start at 1 are all real possibilities — and if two different
  // questions in the same module ever share a Step Number, keying answers by
  // that value makes them collide: answering one instantly makes the other
  // look "already answered" (with the wrong question's data), and it also
  // undercounts Object.keys(answers).length, which is what "Continue"
  // (see begin(attemptedCount) below) uses to resume — so a collision also
  // makes the app resume several questions earlier than the student actually
  // reached, on top of showing incorrect/locked data. `idx` is always unique
  // by construction, so this class of bug can't happen regardless of what's
  // in the sheet. Step Number itself is still recorded inside each saved
  // answer/payload for display and sheet logging — nothing about what's
  // shown to the student or written to the StudentProgress sheet changes.
  const currentAnswer = answers[idx];
  const selected = currentAnswer?.selected ?? null;
  const locked   = !!currentAnswer;

  const resolvedBackLabel = backLabel || t('p_back_to_topics');

  // Whether the last answered question was a new answer (not a revisit)
  // — used to decide whether to update the streak on this render.
  const lastAnsweredStep = useRef(null);

  // ── Issue 1: per-question time tracking ───────────────────────────────────
  // questionStartRef marks the moment THIS question first became visible
  // (performance.now(), so it's immune to clock changes). It resets every
  // time idx changes to an unanswered question — including on Previous/Next
  // navigation — so re-visiting an already-answered question never
  // overwrites its original timeTakenSeconds. submitMcqAnswer() reads this
  // ref to compute how long the student spent on the question before
  // answering.
  const questionStartRef = useRef(performance.now());
  useEffect(() => {
    // Only (re)start the per-question clock if this question hasn't been
    // answered yet — an already-locked question shouldn't keep ticking.
    if (!answers[idx]) {
      questionStartRef.current = performance.now();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  // ── MCQ in-progress picks (used for every MCQ, single- or multi-answer) ──
  // pendingSelected holds the letters the student has checked for the
  // CURRENT question, before they hit Submit. The question never locks on
  // the first click — clicking only toggles a pick, exactly like before, and
  // grading/locking happens once Submit is pressed. This is deliberately the
  // same flow whether the question has one correct answer or several, so the
  // student can't tell which type they're facing from the UI alone. Reset
  // whenever idx changes: if the question was already answered, pre-fill
  // from the saved answer so navigating back to it shows exactly what was
  // submitted; otherwise start empty.
  const [pendingSelected, setPendingSelected] = useState([]);
  useEffect(() => {
    const saved = answers[idx]?.selected;
    setPendingSelected(Array.isArray(saved) ? saved : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  if (!module || !total) {
    return (
      <div className="content">
        <button className="lp-back" onClick={onExit}><i className="fa-solid fa-arrow-left" /> {resolvedBackLabel}</button>
        <div className="card" style={{textAlign:'center',color:'var(--muted)'}}>{t('p_no_steps_yet')}</div>
      </div>
    );
  }

  const step = steps[idx];

  const begin = fromIdx => {
    setIdx(fromIdx);
    if (!progress?.startedAt) onSave({ startedAt:new Date().toISOString(), attempted:0, correct:0, incorrect:0, completionPct:0, answers:{} });
    setView('lesson');
  };

  const retake = () => {
    setAnswers({});
    setStreak(0); setToastStreak(0); setShowFireworks(false); setPendingSelected([]);
    onSave({ startedAt:new Date().toISOString(), completedAt:null, attempted:0, correct:0, incorrect:0, completionPct:0, answers:{} });
    begin(0);
  };

  // Reads Left 1..Left 10 / Right 1..Right 10 off a Learning Steps row into
  // the { id, left, right } shape MatchTheFollowing expects. Skips any pair
  // where both cells are blank, so 5/6/8/10-pair rows all work.
  const pairsFromStep = (s) => {
    const pairs = [];
    for (let n = 1; n <= 10; n++) {
      const left = (s[`Left ${n}`] || '').trim();
      const right = (s[`Right ${n}`] || '').trim();
      if (!left && !right) continue;
      pairs.push({ id: String(n), left, right });
    }
    return pairs;
  };

  const isMatchStep = (s) => (s['Question Type'] || '').trim().toLowerCase() === 'matchthefollowing';

  // 'Correct Option' can hold a single letter ("A") or a comma-separated
  // list ("A,C") for a question with more than one correct answer — set by
  // the Subject Content Manager or entered directly in the sheet. Every MCQ
  // uses the exact same select-then-submit flow regardless of how many
  // letters are here, so the student never sees which kind a question is.
  const correctLettersOf = (s) => (s['Correct Option'] || '').toString().split(',').map(x => x.trim().toUpperCase()).filter(Boolean);

  // Resolves a saved answer's `selected`/`correctOpt` value into display
  // text for the mistakes-review list. Handles every shape that value can
  // take: an array of letters (normal live-session MCQ answer, single or
  // multi), or raw display text (a rebuilt-from-history row, where the
  // sheet only ever stored the text itself, never a letter).
  const mcqAnswerText = (m, val) => {
    if (val == null) return '';
    const parts = Array.isArray(val) ? val : [val];
    if (m.options) {
      const texts = parts.map(l => m.options[l]).filter(Boolean);
      if (texts.length) return texts.join(', ');
    }
    return parts.join(', ');
  };

  const submitMatchTheFollowing = (result) => {
    if (locked) return; // guards a stray double-call on an already-answered question
    const questionTimeSecs = Math.max(0, Math.round((performance.now() - questionStartRef.current) / 1000));
    const isCorrect = result.score === result.total;
    const nextAnswers = { ...answers, [idx]: {
      type: 'matchTheFollowing',
      isCorrect,
      question: step.Question,
      placements: result.placements,
      score: result.score,
      total: result.total,
      explanation: step.Explanation,
      stepNumber: step['Step Number'],
      timeTakenSeconds: questionTimeSecs,
    }};
    setAnswers(nextAnswers);
    const attempted = Object.keys(nextAnswers).length;
    const correct   = Object.values(nextAnswers).filter(a => a.isCorrect).length;
    onSave({ attempted, correct, incorrect: attempted - correct, completionPct: Math.round((attempted / total) * 100), answers: nextAnswers });
    onAnswer?.({
      moduleId: module['Module ID'], subject: module.SubjectEN || module.Subject, topic: module.Title,
      questionNumber: step['Step Number'], answerGiven: `${result.score}/${result.total} matched`,
      correctAnswer: `${result.total}/${result.total} matched`, isCorrect,
      timeTakenSeconds: questionTimeSecs,
    });

    // Same sound/streak treatment as submitMcqAnswer() — full marks counts as a streak
    // hit, a partial match breaks it.
    if (isCorrect) {
      if (soundOnCorrect) playCorrect();
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      const isMilestone = nextStreak >= streakThreshold && nextStreak % streakThreshold === 0;
      if (isMilestone) {
        if (soundOnStreak) playStreak(nextStreak);
        setToastStreak(nextStreak);
        if (nextStreak % (streakThreshold * 2) === 0) setShowFireworks(true);
      }
    } else {
      if (soundOnWrong) playWrong();
      setStreak(0);
    }
  };

  // Toggle one option's checked state for the CURRENT MCQ question. Used for
  // every MCQ regardless of how many correct answers it has — the student
  // isn't shown whether a question is single- or multi-answer, so the
  // interaction has to be identical either way. No-op once locked.
  const toggleOption = letter => {
    if (locked) return;
    setPendingSelected(prev => prev.includes(letter) ? prev.filter(l => l !== letter) : [...prev, letter]);
  };

  // Grades and locks an MCQ once the student submits. All-or-nothing: the
  // picked set must exactly match the step's correct-letter set (order
  // doesn't matter). For a normal single-answer question this is just
  // "picked the one right letter", so the same function and the same UI
  // flow now cover both cases without the student ever seeing a difference.
  const submitMcqAnswer = () => {
    if (locked || pendingSelected.length === 0) return;
    const correctLetters = correctLettersOf(step);
    const selectedSorted = [...pendingSelected].sort();
    const correctSorted  = [...correctLetters].sort();
    const isCorrect = selectedSorted.length === correctSorted.length
      && selectedSorted.every((l, i) => l === correctSorted[i]);

    const questionTimeSecs = Math.max(0, Math.round((performance.now() - questionStartRef.current) / 1000));
    const selectedTexts = pendingSelected.map(l => step[`Option ${l}`]).filter(Boolean);
    const correctTexts  = correctLetters.map(l => step[`Option ${l}`]).filter(Boolean);

    const nextAnswers = { ...answers, [idx]: {
      selected: [...pendingSelected], // always an array of letters, e.g. ['B'] or ['A','C']
      correctOpt: correctLetters,     // always an array of letters
      isCorrect, question: step.Question, explanation: step.Explanation,
      options: { A:step['Option A'], B:step['Option B'], C:step['Option C'], D:step['Option D'] },
      stepNumber: step['Step Number'],
      timeTakenSeconds: questionTimeSecs,
    }};
    setAnswers(nextAnswers);
    const attempted = Object.keys(nextAnswers).length;
    const correct   = Object.values(nextAnswers).filter(a=>a.isCorrect).length;
    onSave({ attempted, correct, incorrect: attempted-correct, completionPct: Math.round((attempted/total)*100), answers: nextAnswers });
    onAnswer?.({
      moduleId: module['Module ID'], subject: module.SubjectEN || module.Subject, topic: module.Title,
      questionNumber: step['Step Number'],
      answerGiven: selectedTexts.join(' | ') || pendingSelected.join(','),
      correctAnswer: correctTexts.join(' | ') || correctLetters.join(','),
      isCorrect,
      timeTakenSeconds: questionTimeSecs,
    });

    // ── Sound + streak ──
    if (isCorrect) {
      if (soundOnCorrect) playCorrect();
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      // Milestone fires at every multiple of streakThreshold (configurable via
      // Config sheet key "StreakThreshold", default 5). e.g. threshold=3 → 3,6,9,12…
      const isMilestone = nextStreak >= streakThreshold && nextStreak % streakThreshold === 0;
      if (isMilestone) {
        if (soundOnStreak) playStreak(nextStreak);
        setToastStreak(nextStreak);
        if (nextStreak % (streakThreshold * 2) === 0) setShowFireworks(true);
      }
    } else {
      if (soundOnWrong) playWrong();
      setStreak(0); // break the streak
    }
  };

  const goNext = () => { if (idx + 1 < total) setIdx(idx+1); else finish(); };
  const goPrev = () => { if (idx > 0) setIdx(idx-1); };
  const finish = () => {
    const completedAt    = new Date().toISOString();
    const timeTakenSecs  = timer.elapsedSeconds;
    // Stop the timer and send to the Google Sheet
    timer.stop(timeTakenSecs);
    onSave({ completedAt, completionPct: 100, timeTakenSeconds: timeTakenSecs });
    if (rangeFrom && rangeTo) onRangeComplete?.();
    setView('complete');
  };

  // ── INTRO ──
  if (view === 'intro') {
    return (
      <div className="content">
        <button className="lp-back" onClick={onExit}><i className="fa-solid fa-arrow-left" /> {resolvedBackLabel}</button>
        <div className="card lp-hero">
          <div className="lp-hero-icon" style={{background:`${module['Color (Hex)']}22`,color:module['Color (Hex)']}}>
            {module.Emoji || <i className={`fa-solid ${module['Icon (FontAwesome solid)']||'fa-book'}`} />}
          </div>
          <h2>{module.Title}</h2>
          <p>{module.Introduction}</p>
          <div className="lp-actions">
            {isComplete ? (
              <>
                <button className="btn-t" onClick={retake}><i className="fa-solid fa-rotate-right" /> {t('p_retake_topic')}</button>
                <button className="btn-outline" onClick={() => { setAnswers(progress.answers||{}); setView('complete'); }}><i className="fa-solid fa-list-check" /> {t('p_review_my_answers')}</button>
              </>
            ) : attemptedCount > 0 ? (
              <button className="btn-t" onClick={() => begin(attemptedCount)}><i className="fa-solid fa-play" /> {t('p_continue_step', {n: attemptedCount+1, total})}</button>
            ) : (
              <button className="btn-t" onClick={() => begin(0)}><i className="fa-solid fa-play" /> {t('p_start_learning')}</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── COMPLETE ──
  if (view === 'complete') {
    const finalAnswers = Object.keys(answers).length ? answers : (progress?.answers || {});
    const correctCount = Object.values(finalAnswers).filter(a=>a.isCorrect).length;
    const pct = total ? Math.round((correctCount/total)*100) : 0;
    const mistakes = Object.values(finalAnswers).filter(a=>!a.isCorrect);
    const encourage = pct>=90 ? t('p_excellent_star', {subject: module.Subject})
      : pct>=70 ? t('p_great_job')
      : pct>=50 ? t('p_nice_effort')
      : t('p_good_try');
    const conceptGroups = [];
    steps.forEach(s => {
      const label = s['Learning Section'] || null;
      const last = conceptGroups[conceptGroups.length-1];
      if (last && last.label === label) last.items.push(s);
      else conceptGroups.push({ label, items: [s] });
    });
    return (
      <div className="content">
        <button className="lp-back" onClick={onExit}><i className="fa-solid fa-arrow-left" /> {resolvedBackLabel}</button>
        <div className="card">
          <div className="lp-score-ring"><span className="n">{correctCount}/{total}</span><span className="l">{pct}% {t('p_pct_correct')}</span></div>
          <p className="lp-encourage">{encourage}</p>
          {/* Session streak summary */}
          {streak >= 5 && (
            <div style={{
              textAlign:'center',padding:'10px 0 4px',
              fontSize:'13px',color:'var(--teal)',fontWeight:700,
            }}>
              🔥 Best streak this session: {streak} correct in a row!
            </div>
          )}
          <div className="sec-divider">{t('p_concepts_learned')}</div>
          {conceptGroups.map((g,gi) => (
            <div key={gi} style={g.label?{marginBottom:'14px'}:undefined}>
              {g.label && <div className="lp-concept-section-lbl">{g.label}</div>}
              {g.items.map(s => <div key={s['Step Number']} className="lp-concept-item"><i className="fa-solid fa-circle-check" /> {s.Teaching}</div>)}
            </div>
          ))}
          {mistakes.length > 0 ? (
            <>
              <div className="sec-divider">{t('p_review_mistakes')}</div>
              {mistakes.map((m,i) => (
                <div key={i} className="lp-mistake">
                  <div className="lp-mistake-q">{m.question}</div>
                  {m.type === 'matchTheFollowing' ? (
                    <div className="lp-mistake-row">Matched {m.score} of {m.total} correctly</div>
                  ) : (
                    <>
                      <div className="lp-mistake-row">{t('p_your_answer')} <span style={{color:'#f87171',fontWeight:700}}>{mcqAnswerText(m, m.selected)}</span></div>
                      <div className="lp-mistake-row">{t('p_correct_answer')} <span style={{color:'#4ade80',fontWeight:700}}>{mcqAnswerText(m, m.correctOpt) || m.correctText}</span></div>
                    </>
                  )}
                  <div className="lp-mistake-row">{m.explanation}</div>
                </div>
              ))}
            </>
          ) : <div className="sec-divider">{t('p_perfect_score')}</div>}
          {module['Now You Try'] && (
            <div className="lp-try-card">
              <div className="lp-try-lbl"><i className="fa-solid fa-pen-fancy" /> {t('p_now_you_try')}</div>
              <p>{module['Now You Try']}</p>
            </div>
          )}
          <div className="lp-actions">
            <button className="btn-t" onClick={retake}><i className="fa-solid fa-rotate-right" /> {t('p_retake_topic')}</button>
            <button className="btn-outline" onClick={onExit}><i className="fa-solid fa-arrow-left" /> {resolvedBackLabel}</button>
          </div>
        </div>
      </div>
    );
  }

  // ── LESSON (teach a fact, then ask about it) ──
  const opts = ['A','B','C','D'];
  const answeredCount = Object.keys(answers).length;
  const progressPct = total ? Math.round((answeredCount/total)*100) : 0;
  const useDotNav = total <= 20;

  // Streak indicator pill shown inside the lesson card header
  const streakPill = streak >= 3 ? (
    <div style={{
      display:'inline-flex',alignItems:'center',gap:'5px',
      padding:'3px 11px',borderRadius:'100px',
      background: streak>=10?'rgba(245,166,35,.18)': streak>=8?'rgba(168,85,247,.18)':'rgba(249,115,22,.18)',
      border: `1px solid ${streak>=10?'rgba(245,166,35,.4)':streak>=8?'rgba(168,85,247,.4)':'rgba(249,115,22,.35)'}`,
      color: streak>=10?'#f5a623':streak>=8?'#c084fc':'#f97316',
      fontSize:'12px',fontWeight:800,
    }}>
      🔥 {streak} in a row
    </div>
  ) : null;

  return (
    <>
      {/* Fireworks overlay — fixed, pointer-events:none so it never blocks interaction */}
      <FireworksOverlay active={showFireworks} onDone={()=>setShowFireworks(false)} />

      {/* Streak toast — non-blocking, auto-dismisses */}
      {toastStreak > 0 && (
        <StreakToast streak={toastStreak} onDone={()=>setToastStreak(0)} />
      )}

      {/* ── Full-screen mobile-first question card ── */}
      <div className="lp-fullscreen">
        {/* ── Header bar: back + module title + compact counter + streak pill ── */}
        <div className="lp-fs-header">
          <button className="lp-fs-back" onClick={onExit} aria-label={resolvedBackLabel}>
            <i className="fa-solid fa-arrow-left" />
          </button>
          <div className="lp-fs-title">{step['Learning Section'] || module.Title}</div>
          {/* Issue 1: "2 of 50" counter badge in header, small and unobtrusive */}
          <span className="lp-fs-qcount">{idx+1} / {total}</span>
          {streakPill}
          {/* ── Test timer badge — visible only when enabled + showTimerUI ── */}
          {enableTimer && showTimerUI && (
            <span
              className={`lp-timer-badge${timer.isPaused ? ' paused' : ''}`}
              title={timer.isPaused ? 'Timer paused — no activity for 5 min' : 'Time elapsed on this topic'}
            >
              <i className={`fa-solid ${timer.isPaused ? 'fa-pause' : 'fa-stopwatch'}`}
                 style={{ fontSize: '9px', marginRight: '3px' }} />
              {timer.displayStr}
              {timer.isPaused && (
                <span style={{ marginLeft: '3px', fontSize: '9px', opacity: .65 }}>paused</span>
              )}
            </span>
          )}
        </div>

        {/* ── Slim progress bar flush under header ── */}
        <div className="lp-fs-progress-wrap">
          <div className="lp-bar-outer lp-fs-bar">
            <div className="lp-bar-fill" style={{width:`${progressPct}%`}} />
          </div>
        </div>

        {/* ── Scrollable body: everything between bar and bottom nav ──
            Issue 2/3/4: .lp-fs-inner centers + caps content width on large
            screens and uses the full available height; .lp-fs-question-wrap
            groups the question+options so they can flex to fill any
            leftover vertical space instead of leaving the bottom of the
            screen empty. ── */}
        <div className="lp-fs-body">
        <div className="lp-fs-inner">

        {/* ── Dot nav (always shown; dropdown only when ShowQuestionDropdown=TRUE) ── */}
        <div className="lp-fs-nav-wrap">
          {showQuestionDropdown ? (
            <select className="lp-jump-select" value={idx} onChange={e=>setIdx(Number(e.target.value))}>
              {steps.map((s,i) => {
                const a = answers[i];
                const status = a ? (a.isCorrect ? '✓' : '✗') : '○';
                return <option key={i} value={i}>{status} {t('p_question_of', {n: i+1, total})}</option>;
              })}
            </select>
          ) : useDotNav ? (
            <div className="lp-dots">
              {steps.map((s,i) => {
                const a = answers[i];
                let cls = 'lp-dot';
                if (i === idx) cls += ' current';
                else if (a) cls += a.isCorrect ? ' correct' : ' incorrect';
                return <button key={i} className={cls} onClick={()=>setIdx(i)} aria-label={`Q${i+1}`} />;
              })}
            </div>
          ) : null}
        </div>

        {/* ── Learning Section content box ── */}
        {step['Learning Section Body'] && (
          <div className="lp-fs-learn-sec">
            <div className="lp-fs-learn-sec-hd">
              <i className="fa-solid fa-book-open" />
              <span>Learning Section</span>
            </div>
            <p>{step['Learning Section Body']}</p>
          </div>
        )}

        {/* ── Teaching fact ── */}
        <div className="lp-fs-teach">
          <i className="fa-solid fa-lightbulb lp-fs-teach-icon" />
          <p>{step.Teaching}</p>
        </div>

        {/* ── Step image — optional, shown between Teaching and the question ── */}
        {step['Step Image URL'] && (
          <div className="lp-fs-step-img">
            <img
              src={step['Step Image URL']}
              alt="Question illustration"
              onError={e => { e.currentTarget.parentElement.style.display='none'; }}
            />
          </div>
        )}

        {/* ── Question + Options — wrapped together so this block can grow
            (flex:1) and absorb any leftover vertical space, keeping the
            whole screen filled rather than leaving the bottom blank. ── */}
        <div className="lp-fs-question-wrap">
          <div className="lp-fs-question">{step.Question}</div>

          {isMatchStep(step) ? (
            <>
              {currentAnswer?.rebuiltFromHistory ? (
                // This question was answered in a previous session and its
                // summary was rebuilt from the sheet, not from localStorage —
                // the sheet only ever logs a score for matchTheFollowing
                // (e.g. "4/5 matched"), never the actual word→meaning
                // placements. Rendering the interactive component with an
                // empty placements object would make every pair look wrong;
                // showing the honest score instead avoids that false "series
                // of errors" appearance.
                <div className="lp-fs-history-note" style={{
                  padding:'14px 16px', borderRadius:'10px', border:'1.5px solid var(--border)',
                  background:'rgba(255,255,255,.03)', display:'flex', alignItems:'center', gap:'10px',
                }}>
                  <i className="fa-solid fa-clock-rotate-left" />
                  <span>Already answered previously — {currentAnswer.score}/{currentAnswer.total} matched correctly. (Answered elsewhere, so the exact matches aren't shown here.)</span>
                </div>
              ) : (
                <MatchTheFollowing
                  key={`${step['Module ID']}-${idx}-${step['Step Number']}`}
                  pairs={pairsFromStep(step)}
                  explanation={step.Explanation}
                  onSubmit={submitMatchTheFollowing}
                  initialPlacements={currentAnswer?.placements}
                  initialLocked={locked}
                />
              )}
              {locked && (
                <div className={`lp-fs-feedback ${currentAnswer.isCorrect ? 'good' : 'bad'}`}>
                  <i className={`fa-solid ${currentAnswer.isCorrect ? 'fa-circle-check' : 'fa-circle-xmark'} lp-fs-fb-icon`} />
                  <div>
                    <strong>{currentAnswer.isCorrect ? t('p_correct_excl') : t('p_not_quite')}</strong>
                    <span> {step.Explanation}</span>
                    {step['Learn More URL'] && (
                      <div style={{marginTop:'8px'}}>
                        <a className="lp-learnmore" href={step['Learn More URL']} target="_blank" rel="noopener noreferrer">
                          <i className="fa-solid fa-book-open" /> {step['Learn More Label'] || t('p_learn_more')} <i className="fa-solid fa-arrow-up-right-from-square" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* ── MCQ: same select-then-submit flow for every question,
                  whether it has one correct answer or several. Clicking an
                  option toggles it (doesn't lock), and a Submit button
                  appears once at least one option is picked — identical to
                  before except the click no longer locks instantly. Grading
                  is all-or-nothing via correctLettersOf/submitMcqAnswer. ── */}
              {(() => {
                const correctLetters = correctLettersOf(step);
                const isAnswerCorrect = currentAnswer ? (currentAnswer.isCorrect ?? false) : false;
                // A rebuilt-from-history row (synced from another device)
                // only ever has the display TEXT of what was picked, not the
                // letters — so `selected` won't be an array there. Fall back
                // to no highlighting rather than guessing.
                const displaySelected = locked
                  ? (Array.isArray(currentAnswer?.selected) ? currentAnswer.selected : [])
                  : pendingSelected;
                return (
                  <>
                    <div className="lp-fs-opts">
                      {opts.map(letter => {
                        const text = step[`Option ${letter}`];
                        if (!text) return null;
                        const isChecked = displaySelected.includes(letter);
                        let cls = 'lp-fs-opt';
                        if (locked && correctLetters.includes(letter)) cls += ' correct';
                        else if (locked && isChecked && !correctLetters.includes(letter)) cls += ' incorrect';
                        return (
                          <button
                            key={letter}
                            className={cls}
                            disabled={locked}
                            onClick={() => toggleOption(letter)}
                            aria-pressed={isChecked}
                            style={!locked && isChecked ? { borderColor:'var(--accent, #00c6a7)', background:'rgba(0,198,167,0.08)' } : undefined}
                          >
                            <span className="lp-fs-letter">{letter}</span>
                            <span className="lp-fs-opt-text">{text}</span>
                          </button>
                        );
                      })}
                    </div>

                    {!locked && (
                      <div
                        className="lp-fs-submit"
                        style={{
                          marginTop: '14px',
                          transition: 'opacity .2s',
                          opacity: pendingSelected.length === 0 ? 0.4 : 1,
                        }}
                      >
                        <button
                          className="btn-t"
                          onClick={submitMcqAnswer}
                          disabled={pendingSelected.length === 0}
                          style={{
                            width: '100%',
                            justifyContent: 'center',
                            padding: '13px 22px',
                            fontSize: '14px',
                            letterSpacing: '.3px',
                            cursor: pendingSelected.length === 0 ? 'not-allowed' : 'pointer',
                          }}
                        >
                          Submit Answer <i className="fa-solid fa-arrow-right" />
                        </button>
                      </div>
                    )}

                    {/* ── Feedback panel (shown after answering) ── */}
                    {locked && (
                      <div className={`lp-fs-feedback ${isAnswerCorrect?'good':'bad'}`}>
                        <i className={`fa-solid ${isAnswerCorrect?'fa-circle-check':'fa-circle-xmark'} lp-fs-fb-icon`} />
                        <div>
                          <strong>{isAnswerCorrect?t('p_correct_excl'):t('p_not_quite')}</strong>
                          <span> {step.Explanation}</span>
                          {step['Learn More URL'] && (
                            <div style={{marginTop:'8px'}}>
                              <a className="lp-learnmore" href={step['Learn More URL']} target="_blank" rel="noopener noreferrer">
                                <i className="fa-solid fa-book-open" /> {step['Learn More Label'] || t('p_learn_more')} <i className="fa-solid fa-arrow-up-right-from-square" />
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </div>

        {/* ── end lp-fs-inner / lp-fs-body ── */}
        </div>
        </div>

        {/* ── Nav row: Previous | Next / Finish — sticky at bottom, outside scroll ── */}
        <div className="lp-nav-row lp-fs-nav-row" style={{flexShrink:0,borderTop:'1px solid var(--border)',background:'var(--navy)'}}>
          <button className="btn-outline" onClick={goPrev} disabled={idx===0} style={idx===0?{opacity:.35,cursor:'not-allowed'}:{}}>
            <i className="fa-solid fa-arrow-left" /> {t('p_previous')}
          </button>
          {answeredCount >= total ? (
            <button className="btn-t" onClick={finish}>
              {t('p_finish_topic')} <i className="fa-solid fa-flag-checkered" />
            </button>
          ) : (
            <button className="btn-t" onClick={goNext} disabled={!locked} style={!locked?{opacity:.35,cursor:'not-allowed'}:{}}>
              {idx+1<total
                ? <>{t('p_next_question')} <i className="fa-solid fa-arrow-right" /></>
                : <>{t('p_answer_to_continue')} <i className="fa-solid fa-arrow-right" /></>}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export { isRowActive, useSoundEngine, FireworksOverlay, StreakToast, useTestTimer, LearningModulePlayer };
