// components/MatchTheFollowing.jsx
//
// "Match the following" question type — left-side words, shuffled
// right-side meanings. Student taps a meaning to select it, then taps the
// word it matches to place it there, then presses Submit to lock and score.
//
// v6 — INTERACTION MODEL CHANGE. Earlier versions used pointer-drag on
// desktop and a separate touch-detected tap mode on phones. That dual-mode
// setup kept breaking in ways that were hard to pin down (drag was
// unreliable on real phones — the browser's own scroll kept winning — and
// even after adding a touch-only tap mode, some mobile browsers misreported
// touch capability on rotation, which sent landscape taps down the dead
// drag path and made them silently hit nothing/the wrong thing).
//
// Rather than keep patching device detection, this version drops drag
// entirely: tap-to-select / tap-to-place is now the ONE interaction path
// for every device, pointer type, and orientation — mouse, touch, trackpad,
// portrait, landscape. There is no branching on pointer/touch capability
// anywhere in this file, so there's no detection to get wrong. It's also
// keyboard-operable now (Tab + Enter/Space), which the drag-only version
// never was.
//
// Public prop contract (pairs / onSubmit / title / explanation /
// initialPlacements / initialLocked) is unchanged — nothing about how
// portal.js calls this component needs to change.
//
// USAGE:
//   <MatchTheFollowing
//     key={`${step['Module ID']}-${step['Step Number']}`}
//     pairs={pairsFromStep(step)}
//     explanation={step.Explanation}
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

// The English translations for this question type don't live on the pair
// objects themselves — they're embedded in one sentence of the explanation
// text, e.g.:
//   "...English meanings: ny = new; gammel = old | god = good; dårlig = bad"
// Pairs within a match are separated by "|", the two sides of a pair by
// ";" or the leading "English meanings:" marker, and each side is
// "word = translation". This pulls that apart into a { danishWord:
// englishWord } lookup, keyed lowercase so matching is case-insensitive.
function parseEnglishMeanings(explanationText) {
  const map = {};
  if (!explanationText) return map;
  const marker = explanationText.match(/english meanings:/i);
  if (!marker) return map;
  const tail = explanationText.slice(marker.index + marker[0].length);
  tail.split(/[|;]/).forEach(chunk => {
    const parts = chunk.split('=');
    if (parts.length < 2) return;
    const word = parts[0].trim();
    // Strip a trailing period/whitespace in case it's the last item in the sentence.
    const meaning = parts[1].trim().replace(/[.\s]+$/, '');
    if (word && meaning) map[word.toLowerCase()] = meaning;
  });
  return map;
}

export default function MatchTheFollowing({
  pairs,
  onSubmit,
  title,
  explanation,
  initialPlacements,
  initialLocked,
}) {
  const rightShuffled = useMemo(() => shuffle(pairs), []); // eslint-disable-line react-hooks/exhaustive-deps
  const englishMeanings = useMemo(() => parseEnglishMeanings(explanation), [explanation]);

  const [placements, setPlacements] = useState(initialPlacements || {});
  const [submitted, setSubmitted] = useState(!!initialLocked);
  const [selectedMeaningId, setSelectedMeaningId] = useState(null);

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

  // Places `itemId` into `leftId`'s slot. If that slot already held a
  // different item, that item is bumped back to the bank rather than lost.
  function placeMeaning(leftId, itemId) {
    if (submitted) return;
    const nextPlacements = { ...placements };
    Object.keys(nextPlacements).forEach(k => { if (nextPlacements[k] === itemId) delete nextPlacements[k]; });
    const bumpedItemId = nextPlacements[leftId];
    nextPlacements[leftId] = itemId;

    const nextLocations = { ...locations, [itemId]: leftId };
    if (bumpedItemId) nextLocations[bumpedItemId] = 'bank';

    setPlacements(nextPlacements);
    setLocations(nextLocations);
  }

  function returnToBank(itemId) {
    if (submitted) return;
    const nextPlacements = { ...placements };
    Object.keys(nextPlacements).forEach(k => { if (nextPlacements[k] === itemId) delete nextPlacements[k]; });
    setPlacements(nextPlacements);
    setLocations(prev => ({ ...prev, [itemId]: 'bank' }));
  }

  // Tapping a meaning selects it (tap again to deselect, tap a different
  // one to switch selection — nothing gets placed until you tap a word).
  function handleTapMeaning(itemId) {
    if (submitted) return;
    setSelectedMeaningId(prev => (prev === itemId ? null : itemId));
  }

  // Tapping a word's slot: if a meaning is selected, place it there
  // (swapping out whatever was already there, if anything). If nothing is
  // selected and the slot is filled, tapping it removes the answer back to
  // the bank — a plain "tap to clear" affordance.
  function handleTapSlot(leftId) {
    if (submitted) return;
    if (selectedMeaningId) {
      placeMeaning(leftId, selectedMeaningId);
      setSelectedMeaningId(null);
    } else if (placements[leftId]) {
      returnToBank(placements[leftId]);
    }
  }

  function handleKeyActivate(fn) {
    return (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        fn();
      }
    };
  }

  function handleReset() {
    setPlacements({});
    const initial = {};
    pairs.forEach(p => { initial[p.id] = 'bank'; });
    setLocations(initial);
    setSelectedMeaningId(null);
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
    setSelectedMeaningId(null);
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
          <div className="mtf-instructions">
            {selectedMeaningId ? 'Now tap the word it matches' : 'Tap a meaning, then tap the word it matches'}
          </div>
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
            if (selectedMeaningId && !submitted) slotClass += ' mtf-slot--targetable';
            return (
              <div className="mtf-word-row" key={p.id} style={{ animationDelay: `${idx * 35}ms` }}>
                <div className="mtf-row-main">
                  <span className="mtf-badge">{idx + 1}</span>
                  <span className="mtf-word-chip">{p.left}</span>
                  <div
                    className={slotClass}
                    data-slot-id={p.id}
                    onClick={() => handleTapSlot(p.id)}
                    onKeyDown={handleKeyActivate(() => handleTapSlot(p.id))}
                    role={!submitted ? 'button' : undefined}
                    tabIndex={!submitted ? 0 : undefined}
                    aria-label={!submitted ? `Slot for ${p.left}` : undefined}
                  >
                    {isWrong ? (
                      <div className="mtf-slot-content mtf-slot-content--wrong">
                        <span className="mtf-wrong-text">
                          {filledItem ? filledItem.right : 'No answer'}
                        </span>
                        <span className="mtf-correct-text">{p.right}</span>
                      </div>
                    ) : filledItem ? (
                      <div className="mtf-slot-content">
                        {filledItem.right}
                      </div>
                    ) : (
                      <span className="mtf-slot-placeholder">
                        {selectedMeaningId ? 'Tap to place here' : 'Tap a meaning first'}
                      </span>
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
            {submitted ? (
              // Once locked, show one row per word-column pair, in the exact
              // same order as the Words column (pairs), not the shuffled
              // bank order — so row N here always matches row N on the left,
              // regardless of where that meaning chip started out in the bank.
              pairs.map(p => (
                <div key={p.id} className="mtf-bank-item mtf-bank-item--placed" aria-hidden="true">
                  <span className="mtf-bank-solved">
                    <span className="mtf-bank-solved-pair">
                      <span className="mtf-bank-solved-term">{p.left}</span>
                      <span className="mtf-bank-solved-eq">=</span>
                      <span className="mtf-bank-solved-en">
                        {englishMeanings[p.left?.toLowerCase()] || '—'}
                      </span>
                    </span>
                    <span className="mtf-bank-solved-sep">;</span>
                    <span className="mtf-bank-solved-pair">
                      <span className="mtf-bank-solved-term">{p.right}</span>
                      <span className="mtf-bank-solved-eq">=</span>
                      <span className="mtf-bank-solved-en">
                        {englishMeanings[p.right?.toLowerCase()] || '—'}
                      </span>
                    </span>
                  </span>
                </div>
              ))
            ) : (
              rightShuffled.map(p => {
                const isPlaced = locations[p.id] !== 'bank';
                if (isPlaced) {
                  // Keeps this slot's height/position in the list instead of
                  // removing it — that's what keeps the two columns lined up
                  // row-for-row as answers get placed, rather than the right
                  // side reflowing upward and drifting out of sync.
                  return (
                    <div key={p.id} className="mtf-bank-item mtf-bank-item--placed" aria-hidden="true">
                      <i className="fa-solid fa-check" /> Matched
                    </div>
                  );
                }
                const isSelected = selectedMeaningId === p.id;
                return (
                  <div
                    key={p.id}
                    className={`mtf-bank-item${isSelected ? ' mtf-bank-item--selected' : ''}`}
                    onClick={() => handleTapMeaning(p.id)}
                    onKeyDown={handleKeyActivate(() => handleTapMeaning(p.id))}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                  >
                    <span className="mtf-tap-icon" aria-hidden="true">
                      <i className={`fa-solid ${isSelected ? 'fa-circle-check' : 'fa-hand-pointer'}`} />
                    </span>
                    {p.right}
                  </div>
                );
              })
            )}
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
          cursor: pointer;
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
        }
        .mtf-slot:focus-visible {
          outline: 2px solid var(--brand);
          outline-offset: 2px;
        }
        .mtf-slot--filled {
          border-style: solid;
          border-color: var(--meaning-ink);
          background: linear-gradient(160deg, #FFFFFF 0%, var(--meaning-tint) 130%);
        }
        .mtf-slot--correct {
          border-color: var(--success);
          background: linear-gradient(160deg, #FFFFFF 0%, var(--success-tint) 130%);
          cursor: default;
        }
        .mtf-slot--incorrect {
          border-width: 2px;
          border-color: var(--error);
          background: linear-gradient(160deg, #FFFFFF 0%, var(--error-tint) 130%);
          cursor: default;
        }
        .mtf-slot--targetable {
          border-style: solid;
          border-width: 2px;
          border-color: var(--brand);
          background: linear-gradient(160deg, #FFFFFF 0%, #E3FBF6 130%);
          box-shadow: 0 0 0 3px rgba(0,198,167,0.16);
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
          -webkit-user-select: none;
          -webkit-tap-highlight-color: transparent;
          cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .mtf-bank-item:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 14px rgba(194,118,12,0.18);
        }
        .mtf-bank-item:focus-visible {
          outline: 2px solid var(--brand);
          outline-offset: 2px;
        }
        .mtf-bank-item--selected {
          border-color: var(--brand);
          border-width: 2px;
          background: linear-gradient(160deg, #FFFFFF 0%, #E3FBF6 130%);
          box-shadow: 0 0 0 3px rgba(0,198,167,0.2), 0 6px 14px rgba(0,198,167,0.22);
        }
        .mtf-bank-item--selected .mtf-tap-icon {
          color: var(--brand);
          opacity: 1;
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
        .mtf-tap-icon {
          color: var(--meaning-ink);
          opacity: 0.55;
          font-size: 13px;
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
          .mtf-btn, .mtf-bank-item, .mtf-slot { transition: none !important; }
        }

        @media (max-width: 620px) {
          .mtf-card { padding: 18px 16px 20px; }
          .mtf-columns { grid-template-columns: 1fr; gap: 8px; }
          .mtf-col-label--meaning { text-align: left; margin-top: 22px; }
          .mtf-slot { width: 100%; margin-top: 8px; }
          .mtf-row-main { flex-wrap: wrap; }
          .mtf-bank-item { text-align: left; justify-content: flex-start; }
        }
      `}</style>
    </div>
  );
}
