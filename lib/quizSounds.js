// lib/quizSounds.js
//
// Oscillator-based sound effects (same Web Audio API approach as the
// WebRTC ringing tone) — no audio files to host or load. Respects a
// mute preference stored in localStorage under 'quiz_sound_muted'.
//
// Six distinct cues, each with its own timbre so they're recognisable by
// ear without looking at the screen:
//   join            — soft two-note chime, someone entered the lobby
//   questionStart   — bright triangle-wave swoosh, a new question is up
//   tick            — short square-wave blip, urgency countdown (<=5s)
//   timeUp          — a firmer double-buzz, the clock hit zero
//   correct/incorrect — reward/penalty stingers on personal feedback
//   standingsReveal — a marimba-like arpeggio, the round's rankings appear
//   quizEnd         — a longer 4-note fanfare, the whole quiz is over

let audioCtx = null;
function ctx() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

export function isMuted() {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('quiz_sound_muted') === '1';
}

export function setMuted(muted) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('quiz_sound_muted', muted ? '1' : '0');
}

function tone(freq, startTime, duration, type = 'sine', gainPeak = 0.15) {
  const c = ctx();
  if (!c || isMuted()) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

export const quizSounds = {
  join() {
    const c = ctx(); if (!c) return;
    const t = c.currentTime;
    tone(523.25, t, 0.12);
    tone(659.25, t + 0.09, 0.15);
  },
  questionStart() {
    const c = ctx(); if (!c) return;
    const t = c.currentTime;
    tone(392, t, 0.08, 'triangle', 0.1);
    tone(523.25, t + 0.07, 0.12, 'triangle', 0.12);
  },
  tick() {
    const c = ctx(); if (!c) return;
    tone(880, c.currentTime, 0.06, 'square', 0.06);
  },
  timeUp() {
    const c = ctx(); if (!c) return;
    const t = c.currentTime;
    tone(180, t, 0.16, 'square', 0.14);
    tone(150, t + 0.14, 0.22, 'square', 0.12);
  },
  correct() {
    const c = ctx(); if (!c) return;
    const t = c.currentTime;
    tone(523.25, t, 0.1, 'sine', 0.18);
    tone(659.25, t + 0.08, 0.1, 'sine', 0.18);
    tone(783.99, t + 0.16, 0.2, 'sine', 0.2);
  },
  incorrect() {
    const c = ctx(); if (!c) return;
    const t = c.currentTime;
    tone(220, t, 0.18, 'sawtooth', 0.12);
    tone(196, t + 0.1, 0.22, 'sawtooth', 0.12);
  },
  standingsReveal() {
    const c = ctx(); if (!c) return;
    const t = c.currentTime;
    [440, 554.37, 659.25, 880].forEach((f, i) => tone(f, t + i * 0.07, 0.18, 'triangle', 0.12));
  },
  quizEnd() {
    const c = ctx(); if (!c) return;
    const t = c.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, t + i * 0.12, 0.25, 'triangle', 0.16));
  },
};
