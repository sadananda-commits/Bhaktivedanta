// components/MatchTheFollowing.jsx
//
// "Match the Following" question type — 10 (or fewer) left-side items,
// shuffled right-side items. Student drags each right-side box onto the
// left-side item it matches, then presses Submit to lock and score it.
//
// v5 — VISUAL REDESIGN ONLY. The drag/pointer logic, state shape, and the
// public prop contract (pairs / onSubmit / title / initialPlacements /
// initialLocked) are byte-for-byte the same as v4 — nothing about how
// portal.js calls this component needs to change. What changed:
//   - Real color system: white cards with a colored ACCENT BAR (not colored
//     text) marking each column — indigo for Words, amber for Meanings —
//     so it stays highly legible instead of relying on tinted text.
//   - Manrope for words/labels (bold, geometric, reads well at a distance),
//     JetBrains Mono for the counters/score (monospace numerals scan faster
//     at a glance than proportional ones).
//   - A small SVG progress ring in the header: fills with your brand teal
//     as pairs are placed, then turns green (perfect) or amber (partial)
//     once submitted.
//   - Responsive: two columns side by side above ~620px, stacks to one
//     column (word + its drop target, then the answer bank below) on
//     phones, via a styled-jsx media query — Next.js's built-in scoped CSS,
//     no extra dependency.
//   - prefers-reduced-motion is respected; all buttons have visible focus
//     rings.
//
// Known limitation carried over from v4 (not introduced here): matching is
// pointer/touch only, there's no keyboard-operable drag path yet. Flag it
// if that needs solving.
//
// USAGE — unchanged from v4:
//   <MatchTheFollowing
//     key={`${step['Module ID']}-${step['Step Number']}`}
//     pairs={pairsFromStep(step)}
//     onSubmit={(result) => submitMatchTheFollowing(result)}
//     initialPlacements={currentAnswer?.placements}   // only when revisiting
//     initialLocked={locked}                           // only when revisiting
//   />

import { useMemo, useState } from 'react';

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function MatchTheFollowing({
  pairs,
  onSubmit,
  title,
  initialPlacements,
  initialLocked,
}) {
  const rightShuffled = useMemo(() => shuffle(pairs), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [placements, setPlacements] = useState(initialPlacements || {});
  const [submitted, setSubmitted] = useState(!!initialLocked);

  const [result, setResult] = useState(() => {
    if (!initialLocked) return null;
    let score = 0;
    const correct = {};
    pairs.forEach(p => {
      const isCorrect = (initialPlacements || {})[p.id] === p.id;
      correct[p.id] = isCorrect;
      if (isCorrect) score++;
    });
    return { score, total: pairs.length, correct, placements: initialPlacements || {} };
  });

  const [locations, setLocations] = useState(() => {
    const initial = {};
    pairs.forEach(p => {
      const placedAt = Object.keys(initialPlacements || {}).find(k => initialPlacements[k] === p.id);
      initial[p.id] = placedAt || 'bank';
    });
    return initial;
  });

  const placedCount = Object.keys(placements).length;

  function handlePointerDown(e, itemId) {
    if (submitted) return;
    e.preventDefault();
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    el.setPointerCapture(e.pointerId);
    // Kill the element's own transition (defined on .mtf-bank-item as
    // "transition: transform 0.15s ease, box-shadow 0.15s ease") before
    // switching to fixed positioning. Without this, the browser tweens from
    // whatever transform happened to be live at pointerdown (e.g. the
    // :hover translateY(-1px)) to the new scale(1.03) over 150ms, which
    // reads as the box drifting/sliding before it locks onto the pointer.
    el.style.transition = 'none';
    el.style.position = 'fixed';
    el.style.zIndex = 1000;
    el.style.width = rect.width + 'px';
    el.style.left = rect.left + 'px';
    el.style.top = rect.top + 'px';
    el.style.boxShadow = '0 10px 24px rgba(28,33,48,0.22)';
    el.style.transform = 'scale(1.03)';
    el.style.pointerEvents = 'none';

    function onMove(ev) {
      el.style.left = (ev.clientX - offsetX) + 'px';
      el.style.top = (ev.clientY - offsetY) + 'px';
    }
    function onUp(ev) {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.style.position = '';
      el.style.zIndex = '';
      el.style.left = '';
      el.style.top = '';
      el.style.boxShadow = '';
      el.style.transform = '';
      el.style.pointerEvents = '';
      el.style.width = '';
      el.style.transition = '';

      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      const slotEl = target ? target.closest('[data-slot-id]') : null;
      const leftId = slotEl ? slotEl.getAttribute('data-slot-id') : null;

      setPlacements(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => { if (next[k] === itemId) delete next[k]; });
        if (leftId) next[leftId] = itemId;
        return next;
      });
      setLocations(prev => ({ ...prev, [itemId]: leftId || 'bank' }));
    }
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  }

  function handleReset() {
    setPlacements({});
    const initial = {};
    pairs.forEach(p => { initial[p.id] = 'bank'; });
    setLocations(initial);
  }

  function handleSubmit() {
    let score = 0;
    const correct = {};
    pairs.forEach(p => {
      const isCorrect = placements[p.id] === p.id;
      correct[p.id] = isCorrect;
      if (isCorrect) score++;
    });
    const payload = { score, total: pairs.length, correct, placements };
    setResult(payload);
    setSubmitted(true);
    if (onSubmit) onSubmit(payload);
  }

  // Rendering iterates `rightShuffled` directly in its fixed original order
  // (see the Meanings column below) rather than filtering — that fixed
  // order is what keeps every row's position stable as answers get placed.

  // Progress ring math
  const total = pairs.length;
  const frac = submitted && result ? (result.score / result.total) : (placedCount / total);
  const RING_R = 16;
  const CIRC = 2 * Math.PI * RING_R;
  const ringColor = submitted && result
    ? (result.score === result.total ? '#15803D' : '#C2760C')
    : '#00C6A7';

  return (
    <div className="mtf-card">
      <div className="mtf-header">
        <div>
          <div className="mtf-eyebrow">Match the following</div>
          {title && <h3 className="mtf-title">{title}</h3>}
          <div className="mtf-instructions">Drag each meaning onto the word it matches</div>
        </div>
        <div className="mtf-ring-wrap" aria-hidden="true">
          <svg width="44" height="44" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r={RING_R} fill="none" stroke="#EDEAE3" strokeWidth="4" />
            <circle
              cx="22" cy="22" r={RING_R} fill="none"
              stroke={ringColor} strokeWidth="4" strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - frac)}
              transform="rotate(-90 22 22)"
              style={{ transition: 'stroke-dashoffset 0.35s ease, stroke 0.35s ease' }}
            />
          </svg>
          <span className="mtf-ring-label">
            {submitted && result ? `${result.score}/${result.total}` : `${placedCount}/${total}`}
          </span>
        </div>
      </div>

      <div className="mtf-columns">
        <div className="mtf-col">
          <div className="mtf-col-label mtf-col-label--word">Words</div>
          {pairs.map((p, idx) => {
            const filledId = placements[p.id];
            const filledItem = filledId ? pairs.find(x => x.id === filledId) : null;
            const isCorrect = submitted && result && result.correct[p.id];
            const isWrong = submitted && result && !result.correct[p.id];
            let slotClass = 'mtf-slot';
            if (filledItem) slotClass += ' mtf-slot--filled';
            if (isCorrect) slotClass += ' mtf-slot--correct';
            if (isWrong) slotClass += ' mtf-slot--incorrect';
            return (
              <div className="mtf-word-row" key={p.id} style={{ animationDelay: `${idx * 35}ms` }}>
                <div className="mtf-row-main">
                  <span className="mtf-badge">{idx + 1}</span>
                  <span className="mtf-word-chip">{p.left}</span>
                  <div className={slotClass} data-slot-id={p.id}>
                    {isWrong ? (
                      <div className="mtf-slot-content mtf-slot-content--wrong">
                        <span className="mtf-wrong-text">
                          {filledItem ? filledItem.right : 'No answer'}
                        </span>
                        <span className="mtf-correct-text">{p.right}</span>
                      </div>
                    ) : filledItem ? (
                      <div
                        className="mtf-slot-content"
                        onPointerDown={(e) => handlePointerDown(e, filledItem.id)}
                        style={{ cursor: submitted ? 'default' : 'grab' }}
                      >
                        {filledItem.right}
                      </div>
                    ) : (
                      <span className="mtf-slot-placeholder">Drop match here</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mtf-col">
          <div className="mtf-col-label mtf-col-label--meaning">Meanings</div>
          <div className="mtf-bank" data-bank-zone="true">
            {rightShuffled.map(p => {
              const isPlaced = locations[p.id] !== 'bank';
              if (isPlaced) {
                // Keeps this slot's height/position in the list instead of
                // removing it — that's what keeps the two columns lined up
                // row-for-row as answers get dragged out, rather than the
                // right side reflowing upward and drifting out of sync.
                return (
                  <div key={p.id} className="mtf-bank-item mtf-bank-item--placed" aria-hidden="true">
                    {submitted ? (
                      <span className="mtf-bank-solved">
                        <span className="mtf-bank-solved-pair">
                          <span className="mtf-bank-solved-term">{p.left}</span>
                          <span className="mtf-bank-solved-eq">=</span>
                          <span className="mtf-bank-solved-en">{p.leftEnglish}</span>
                        </span>
                        <span className="mtf-bank-solved-sep">;</span>
                        <span className="mtf-bank-solved-pair">
                          <span className="mtf-bank-solved-term">{p.right}</span>
                          <span className="mtf-bank-solved-eq">=</span>
                          <span className="mtf-bank-solved-en">{p.rightEnglish}</span>
                        </span>
                      </span>
                    ) : (
                      <>
                        <i className="fa-solid fa-check" /> Matched
                      </>
                    )}
                  </div>
                );
              }
              return (
                <div
                  key={p.id}
                  className="mtf-bank-item"
                  onPointerDown={(e) => handlePointerDown(e, p.id)}
                  style={{ cursor: submitted ? 'default' : 'grab' }}
                >
                  <span className="mtf-drag-handle" aria-hidden="true">
                    <i className="fa-solid fa-grip-vertical" />
                  </span>
                  {p.right}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {!submitted ? (
        <div className="mtf-footer">
          <button className="mtf-btn mtf-btn--ghost" onClick={handleReset}>
            <i className="fa-solid fa-rotate-left" /> Reset
          </button>
          <button
            className="mtf-btn mtf-btn--solid"
            disabled={placedCount < total}
            onClick={handleSubmit}
          >
            <i className="fa-solid fa-check" /> Submit
          </button>
        </div>
      ) : (
        <div className={`mtf-score-banner ${result.score === result.total ? 'is-perfect' : 'is-partial'}`}>
          <i className={`fa-solid ${result.score === result.total ? 'fa-trophy' : 'fa-star-half-stroke'}`} />
          <span>
            {result.score === result.total
              ? `Perfect! ${result.score}/${result.total} correct`
              : `${result.score}/${result.total} correct — check the highlights above`}
          </span>
        </div>
      )}

      <style jsx>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=JetBrains+Mono:wght@600;700&display=swap');

        .mtf-card {
          --ink: #1B2130;
          --ink-muted: #6B7280;
          --paper: #FDFBF8;
          --paper-border: #E7E2D9;
          --rail: #F4F1EB;
          --word-ink: #4338CA;
          --word-tint: #EEF0FE;
          --meaning-ink: #C2760C;
          --meaning-tint: #FFF4E5;
          --brand: #00C6A7;
          --success: #15803D;
          --success-tint: #EAF7EE;
          --error: #B91C1C;
          --error-tint: #FDEDED;
          --chip-min-h: 64px;

          font-family: 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif;
          max-width: 720px;
          background: var(--paper);
          border: 1px solid var(--paper-border);
          border-radius: 16px;
          padding: 22px 24px 24px;
          box-shadow: 0 1px 3px rgba(28,33,48,0.04), 0 10px 28px rgba(28,33,48,0.06);
          animation: mtf-card-in 0.3s ease both;
        }

        .mtf-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 18px;
        }
        .mtf-eyebrow {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          color: var(--brand);
          margin-bottom: 4px;
        }
        .mtf-title {
          font-size: 17px;
          font-weight: 800;
          color: var(--ink);
          margin: 0 0 4px;
        }
        .mtf-instructions {
          font-size: 13px;
          color: var(--ink-muted);
          font-weight: 500;
        }

        .mtf-ring-wrap {
          position: relative;
          width: 44px;
          height: 44px;
          flex-shrink: 0;
        }
        .mtf-ring-label {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          font-weight: 700;
          color: var(--ink);
        }

        .mtf-columns {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 28px;
        }
        .mtf-col-label {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 10px;
          padding-bottom: 8px;
          border-bottom: 2px solid var(--paper-border);
        }
        .mtf-col-label--word { color: var(--word-ink); }
        .mtf-col-label--meaning { color: var(--meaning-ink); text-align: right; }

        .mtf-word-row {
          margin-bottom: 12px;
          animation: mtf-row-in 0.3s ease both;
        }
        .mtf-row-main {
          display: flex;
          align-items: stretch;
          gap: 10px;
        }
        .mtf-badge {
          align-self: center;
          flex-shrink: 0;
          width: 26px;
          height: 26px;
          border-radius: 999px;
          background: var(--word-ink);
          color: #fff;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 6px rgba(67,56,202,0.35);
        }
        .mtf-word-chip {
          flex: 1;
          min-width: 0;
          height: var(--chip-min-h);
          box-sizing: border-box;
          display: flex;
          align-items: center;
          background: linear-gradient(160deg, #FFFFFF 0%, var(--word-tint) 130%);
          border: 1px solid #E1E0F5;
          border-left: 5px solid var(--word-ink);
          border-radius: 12px;
          padding: 10px 14px;
          font-size: 15.5px;
          font-weight: 700;
          letter-spacing: -0.01em;
          line-height: 1.25;
          color: var(--ink);
          box-shadow: 0 1px 2px rgba(28,33,48,0.05);
          overflow: hidden;
        }

        .mtf-slot {
          width: 42%;
          min-width: 130px;
          min-height: var(--chip-min-h);
          box-sizing: border-box;
          border-radius: 12px;
          border: 1.5px dashed #C9C2B4;
          background: var(--rail);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8px 12px;
          transition: border-color 0.2s, background 0.2s;
        }
        .mtf-slot--filled {
          border-style: solid;
          border-color: var(--meaning-ink);
          background: linear-gradient(160deg, #FFFFFF 0%, var(--meaning-tint) 130%);
        }
        .mtf-slot--correct {
          border-color: var(--success);
          background: linear-gradient(160deg, #FFFFFF 0%, var(--success-tint) 130%);
        }
        .mtf-slot--incorrect {
          border-width: 2px;
          border-color: var(--error);
          background: linear-gradient(160deg, #FFFFFF 0%, var(--error-tint) 130%);
        }
        .mtf-slot-content {
          font-size: 15px;
          font-weight: 700;
          letter-spacing: -0.01em;
          line-height: 1.25;
          color: var(--ink);
          text-align: center;
          overflow: hidden;
          max-height: 100%;
        }
        .mtf-slot-content--wrong {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          width: 100%;
          overflow: visible;
          max-height: none;
        }
        .mtf-wrong-text {
          font-size: 13.5px;
          font-weight: 600;
          color: var(--error);
          text-decoration: line-through;
          text-decoration-thickness: 2px;
          text-decoration-color: var(--error);
          opacity: 0.75;
        }
        .mtf-correct-text {
          font-size: 15px;
          font-weight: 800;
          color: var(--success);
        }
        .mtf-slot-placeholder {
          font-size: 12.5px;
          font-weight: 600;
          color: var(--ink-muted);
        }

        .mtf-bank {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 12px;
          min-height: var(--chip-min-h);
        }
        .mtf-bank-item {
          width: 100%;
          height: var(--chip-min-h);
          box-sizing: border-box;
          background: linear-gradient(160deg, #FFFFFF 0%, var(--meaning-tint) 130%);
          border: 1px solid #F2DFC0;
          border-left: 5px solid var(--meaning-ink);
          border-radius: 12px;
          padding: 10px 14px;
          font-size: 15.5px;
          font-weight: 700;
          letter-spacing: -0.01em;
          line-height: 1.25;
          color: var(--ink);
          text-align: right;
          box-shadow: 0 1px 2px rgba(28,33,48,0.05);
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          overflow: hidden;
          user-select: none;
          touch-action: none;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .mtf-bank-item:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 14px rgba(194,118,12,0.18);
        }
        .mtf-bank-item--placed {
          background: var(--rail);
          border: 1.5px dashed #D8D3C6;
          border-left: 1.5px dashed #D8D3C6;
          color: var(--ink-muted);
          font-weight: 600;
          font-size: 13px;
          box-shadow: none;
          cursor: default;
          justify-content: flex-start;
          text-align: left;
          min-height: var(--chip-min-h);
          height: auto;
          overflow: visible;
        }
        .mtf-bank-item--placed:hover {
          transform: none;
          box-shadow: none;
        }
        .mtf-bank-solved {
          display: flex;
          align-items: baseline;
          gap: 8px;
          flex-wrap: wrap;
        }
        .mtf-bank-solved-pair {
          display: flex;
          align-items: baseline;
          gap: 5px;
          flex-wrap: wrap;
        }
        .mtf-bank-solved-term {
          font-weight: 800;
          color: var(--ink);
          font-size: 13px;
        }
        .mtf-bank-solved-eq {
          color: var(--ink-muted);
          font-weight: 600;
        }
        .mtf-bank-solved-en {
          font-weight: 700;
          color: var(--meaning-ink);
          font-size: 13px;
        }
        .mtf-bank-solved-sep {
          color: var(--ink-muted);
          font-weight: 600;
        }
        .mtf-drag-handle {
          color: var(--meaning-ink);
          opacity: 0.55;
          font-size: 12px;
        }
        .mtf-bank-empty {
          font-size: 12.5px;
          color: var(--ink-muted);
          font-weight: 600;
          font-style: italic;
        }

        .mtf-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 22px;
          gap: 12px;
        }
        .mtf-btn {
          font-family: inherit;
          font-size: 14px;
          font-weight: 700;
          border-radius: 10px;
          padding: 10px 20px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: none;
          transition: transform 0.12s ease, box-shadow 0.12s ease, opacity 0.12s ease;
        }
        .mtf-btn:active { transform: scale(0.97); }
        .mtf-btn:focus-visible {
          outline: 2px solid var(--brand);
          outline-offset: 2px;
        }
        .mtf-btn--ghost {
          background: #fff;
          border: 1.5px solid var(--paper-border);
          color: var(--ink-muted);
        }
        .mtf-btn--ghost:hover { border-color: #C9C2B4; color: var(--ink); }
        .mtf-btn--solid {
          background: var(--brand);
          color: #fff;
          box-shadow: 0 2px 8px rgba(0,198,167,0.35);
        }
        .mtf-btn--solid:disabled {
          background: #D7D3C9;
          box-shadow: none;
          cursor: default;
          opacity: 0.8;
        }
        .mtf-btn--solid:not(:disabled):hover { box-shadow: 0 4px 14px rgba(0,198,167,0.45); }

        .mtf-score-banner {
          margin-top: 22px;
          border-radius: 10px;
          padding: 14px 16px;
          font-size: 15px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 10px;
          animation: mtf-banner-in 0.35s ease both;
        }
        .mtf-score-banner.is-perfect { background: var(--success-tint); color: var(--success); }
        .mtf-score-banner.is-partial { background: var(--meaning-tint); color: var(--meaning-ink); }

        @keyframes mtf-card-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes mtf-row-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes mtf-banner-in {
          from { opacity: 0; transform: scale(0.97); }
          to   { opacity: 1; transform: scale(1); }
        }

        @media (prefers-reduced-motion: reduce) {
          .mtf-card, .mtf-word-row, .mtf-score-banner { animation: none !important; }
          .mtf-btn, .mtf-bank-item { transition: none !important; }
        }

        @media (max-width: 620px) {
          .mtf-card { padding: 18px 16px 20px; }
          .mtf-columns { grid-template-columns: 1fr; gap: 8px; }
          .mtf-col-label--meaning { text-align: left; margin-top: 4px; }
          .mtf-slot { width: 100%; margin-top: 8px; }
          .mtf-row-main { flex-wrap: wrap; }
          .mtf-bank-item { text-align: left; justify-content: flex-start; }
        }
      `}</style>
    </div>
  );
}
