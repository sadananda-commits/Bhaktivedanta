// lib/quizTheme.js
//
// Design tokens for the quiz experience — a "live classroom scoreboard"
// identity, deliberately distinct from generic dark-mode SaaS chrome:
//
//   Base:    deep indigo-violet (#12132B), not neutral near-black
//   Accent:  mint (#22D3B0) for action/timer, marigold (#FFB020) for
//            celebration — two accents with different jobs, not one
//   Display: Fredoka — rounded, energetic, legible at a distance on a
//            projector; used sparingly for headlines/scores/timer digits
//   Body:    Manrope — clean, quiet, does the actual reading work
//   Mono:    Space Mono — tabular figures for the quiz code, countdown,
//            and leaderboard scores, giving them a "scoreboard" precision
//
// Signature element: shape-coded answer tiles (circle/triangle/square/
// diamond, not just color) — colorblind-safe and visually distinct from
// Kahoot's pure-color-quadrant identity.
//
// All tokens are scoped under `.qx-root` (not `:root`) so they never leak
// into portal.js / parent-portal.js's own CSS variables.

import Head from 'next/head';

export function QuizFonts() {
  return (
    <Head>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
      <link
        href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap"
        rel="stylesheet"
      />
    </Head>
  );
}

export function QuizThemeStyles() {
  return (
    <style jsx global>{`
      .qx-root {
        --qx-bg: #12132b;
        --qx-bg-2: #181a3a;
        --qx-surface: #1d1f42;
        --qx-surface-2: #262a52;
        --qx-border: #383c6e;
        --qx-accent: #22d3b0;
        --qx-accent-dim: rgba(34, 211, 176, 0.16);
        --qx-accent-2: #ffb020;
        --qx-accent-2-dim: rgba(255, 176, 32, 0.16);
        --qx-danger: #ff5c7a;
        --qx-danger-dim: rgba(255, 92, 122, 0.16);
        --qx-success: #34e7b4;
        --qx-text: #f5f6ff;
        --qx-muted: #9296c4;
        --qx-radius-sm: 10px;
        --qx-radius: 20px;
        --qx-radius-lg: 28px;
        --qx-font-display: 'Fredoka', ui-rounded, sans-serif;
        --qx-font-body: 'Manrope', -apple-system, sans-serif;
        --qx-font-mono: 'Space Mono', ui-monospace, monospace;

        background: radial-gradient(120% 100% at 50% -10%, var(--qx-bg-2) 0%, var(--qx-bg) 55%);
        color: var(--qx-text);
        font-family: var(--qx-font-body);
      }
      .qx-root * { box-sizing: border-box; }
      .qx-root button, .qx-root input { font-family: inherit; }
      .qx-root :focus-visible { outline: 2px solid var(--qx-accent); outline-offset: 2px; }
      @media (prefers-reduced-motion: reduce) {
        .qx-root *, .qx-root *::before, .qx-root *::after {
          animation-duration: 0.001ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.001ms !important;
        }
      }

      /* ── Shared layout & components ─────────────────────────────── */
      .qx-wrap {
        min-height: 100vh; min-height: 100dvh;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        padding: 20px;
        padding-bottom: max(20px, env(safe-area-inset-bottom));
        padding-top: max(20px, env(safe-area-inset-top));
        position: relative;
      }
      .qx-card {
        background: var(--qx-surface);
        border: 1px solid var(--qx-border);
        border-radius: var(--qx-radius);
        padding: 32px 26px;
        max-width: 440px;
        width: 100%;
        box-shadow: 0 20px 60px -20px rgba(0,0,0,0.5);
      }
      .qx-center { text-align: center; }
      .qx-eyebrow {
        font-family: var(--qx-font-mono);
        font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
        color: var(--qx-accent); margin-bottom: 6px; font-weight: 700;
      }
      .qx-title { font-family: var(--qx-font-display); font-size: 26px; font-weight: 600; margin: 0 0 12px; line-height: 1.15; }
      .qx-label { display: block; font-size: 13px; color: var(--qx-muted); margin: 16px 0 6px; font-weight: 600; }
      .qx-input {
        width: 100%; padding: 15px 16px; border-radius: var(--qx-radius-sm);
        border: 1.5px solid var(--qx-border); background: var(--qx-surface-2);
        color: var(--qx-text); font-size: 16px; box-sizing: border-box;
        transition: border-color 0.15s;
      }
      .qx-input:focus { border-color: var(--qx-accent); outline: none; }
      .qx-btn {
        width: 100%; padding: 16px; border-radius: var(--qx-radius-sm); border: none;
        font-size: 16px; font-weight: 700; cursor: pointer; margin-top: 20px;
        font-family: var(--qx-font-body); -webkit-tap-highlight-color: transparent;
        display: flex; align-items: center; justify-content: center; gap: 8px;
        transition: transform 0.1s, opacity 0.15s;
      }
      .qx-btn:active:not(:disabled) { transform: scale(0.98); }
      .qx-btn-primary { background: var(--qx-accent); color: #072922; }
      .qx-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .qx-error { color: var(--qx-danger); font-size: 13px; margin-top: 8px; }
      .qx-muted { color: var(--qx-muted); font-size: 14px; }
      .qx-mute-btn {
        position: fixed; top: max(14px, env(safe-area-inset-top)); right: 14px;
        width: 42px; height: 42px; border-radius: 50%; border: 1px solid var(--qx-border);
        background: var(--qx-surface); color: var(--qx-text); font-size: 15px; cursor: pointer;
        display: flex; align-items: center; justify-content: center; z-index: 20;
      }
      .qx-live .qx-mute-btn { position: static; margin-left: 8px; }
      .qx-connbanner {
        position: fixed; top: 0; left: 0; right: 0; z-index: 30; text-align: center;
        padding: 9px; background: var(--qx-accent-2); color: #241a00; font-weight: 700; font-size: 13px;
      }
      .qx-banner {
        width: 100%; max-width: 620px; text-align: center; padding: 10px; margin-bottom: 12px;
        border-radius: var(--qx-radius-sm); background: var(--qx-accent-2); color: #241a00; font-weight: 700;
      }
      .qx-leaderboard-title { margin: 22px 0 10px; font-size: 15px; font-weight: 700; }
      .qx-leaderboard { list-style: none; padding: 0; margin: 0; text-align: left; }
      .qx-leaderboard li {
        display: flex; align-items: center; gap: 10px; padding: 11px 14px;
        border-radius: var(--qx-radius-sm); margin-bottom: 6px; background: var(--qx-surface-2);
      }
      .qx-leaderboard li.qx-me { border: 2px solid var(--qx-accent); }
      .qx-lb-rank { width: 30px; font-family: var(--qx-font-mono); font-weight: 700; color: var(--qx-muted); }
      .qx-lb-name { flex: 1; font-weight: 600; }
      .qx-lb-score { font-family: var(--qx-font-mono); font-weight: 700; color: var(--qx-accent); }
    `}</style>
  );
}

// Shape-coded option icon — the identity's signature element. Circle,
// triangle, square, diamond map to A/B/C/D so option identity survives
// for colorblind students, black-and-white printouts, or a washed-out
// projector — not just relying on the fill color.
export function ShapeIcon({ letter, size = 22 }) {
  const s = size;
  const common = { width: s, height: s, viewBox: '0 0 24 24', fill: 'currentColor' };
  switch (letter) {
    case 'A': return <svg {...common}><circle cx="12" cy="12" r="9" /></svg>;
    case 'B': return <svg {...common}><polygon points="12,3 21,20 3,20" /></svg>;
    case 'C': return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="3" /></svg>;
    case 'D': return <svg {...common}><polygon points="12,2 22,12 12,22 2,12" /></svg>;
    default: return null;
  }
}

export const OPTION_LABELS = ['A', 'B', 'C', 'D'];
export const OPTION_COLORS = {
  A: '#ff5c7a', // coral
  B: '#22d3b0', // mint
  C: '#ffb020', // marigold
  D: '#6c7bff', // periwinkle — fourth hue, keeps all four tiles distinguishable at a glance
};
