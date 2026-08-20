// components/MatchTheFollowing.jsx
//
// "Match the following" question type — left-side words, each with a
// native <select> dropdown listing the (shuffled) right-side meanings.
// Student picks a meaning for each word from its dropdown, then presses
// Submit to lock and score.
//
// v7 — INTERACTION MODEL CHANGE (mobile landscape fix). v6 used tap-to-
// select-a-meaning / tap-to-place-on-a-word across two side-by-side
// columns. In mobile landscape the columns sit closer together and the
// viewport is short, and taps were landing on/selecting the wrong chip —
// a coordinate/hit-test mismatch that's inherent to any custom tap-target
// UI once things get cramped, no matter how carefully the handlers are
// written.
//
// This version removes custom tap-targets for placement entirely. Each
// word row now has one native <select> holding that word's meaning
// options. The device's own picker UI does the tap targeting, so there is
// no coordinate math left to get wrong — this is orientation-proof and
// behaves identically on desktop, phone portrait, and phone landscape.
// The two-column "tap meaning, then tap word" layout is gone in favor of
// a single-column list of word rows, which is also just simpler to use
// on a short/narrow screen.
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

  // locations[itemId] = the leftId it's currently placed under, or 'bank'.
  // Used purely to know which dropdown options are already taken by a
  // different row, so they can be disabled there.
  const [locations, setLocations] = useState(() => {
    const initial = {};
    pairs.forEach(p => {
      const placedAt = Object.keys(initialPlacements || {}).find(k => initialPlacements[k] === p.id);
      initial[p.id] = placedAt || 'bank';
    });
    return initial;
  });

  const placedCount = Object.keys(placements).length;
  const total = pairs.length;

  function englishFor(word) {
    return englishMeanings[word?.toLowerCase()] || null;
  }

  // Sets `leftId`'s dropdown to `itemId`. If that item was already placed
  // under a different word, that other row is cleared back to "no
  // selection" rather than silently keeping a stale duplicate.
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

  function clearSlot(leftId) {
    if (submitted) return;
    const itemId = placements[leftId];
    if (!itemId) return;
    const nextPlacements = { ...placements };
    delete nextPlacements[leftId];
    setPlacements(nextPlacements);
    setLocations(prev => ({ ...prev, [itemId]: 'bank' }));
  }

  // Handles the <select>'s onChange for a given word row.
  function handleSelectChange(leftId, value) {
    if (!value) {
      clearSlot(leftId);
    } else {
      placeMeaning(leftId, value);
    }
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

  // Progress ring math
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
            Pick a meaning for each word from its dropdown
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

      <div className="mtf-list">
        {pairs.map((p, idx) => {
          const filledId = placements[p.id];
          const filledItem = filledId ? pairs.find(x => x.id === filledId) : null;
          const isCorrect = submitted && result && result.correct[p.id];
          const isWrong = submitted && result && !result.correct[p.id];
          const wordEnglish = englishFor(p.left);
          const correctMeaningEnglish = englishFor(p.right);
          const filledMeaningEnglish = filledItem ? englishFor(filledItem.right) : null;

          let selectClass = 'mtf-select';
          if (filledItem) selectClass += ' mtf-select--filled';

          return (
            <div className="mtf-row" key={p.id} style={{ animationDelay: `${idx * 35}ms` }}>
              <span className="mtf-badge">{idx + 1}</span>

              <div className="mtf-word-chip">
                <span className="mtf-word-text">{p.left}</span>
                {submitted && wordEnglish && (
                  <span className="mtf-english-hint">({wordEnglish})</span>
                )}
              </div>

              <div className="mtf-select-wrap">
                {submitted ? (
                  <div className={`mtf-result ${isCorrect ? 'mtf-result--correct' : 'mtf-result--incorrect'}`}>
                    {isWrong ? (
                      <div className="mtf-result-content">
                        <span className="mtf-result-wrong-text">
                          {filledItem ? filledItem.right : 'No answer'}
                          {filledMeaningEnglish ? ` (${filledMeaningEnglish})` : ''}
                        </span>
                        <span className="mtf-result-correct-text">
                          {p.right}
                          {correctMeaningEnglish && (
                            <span className="mtf-result-correct-english"> ({correctMeaningEnglish})</span>
                          )}
                        </span>
                      </div>
                    ) : (
                      <span className="mtf-result-content">
                        {p.right}
                        {correctMeaningEnglish && (
                          <span className="mtf-result-correct-english"> ({correctMeaningEnglish})</span>
                        )}
                      </span>
                    )}
                  </div>
                ) : (
                  <select
                    className={selectClass}
                    value={filledId || ''}
                    onChange={(e) => handleSelectChange(p.id, e.target.value)}
                    aria-label={`Meaning for ${p.left}`}
                  >
                    <option value="">Select a meaning…</option>
                    {rightShuffled.map(opt => {
                      const usedElsewhere = locations[opt.id] !== 'bank' && locations[opt.id] !== p.id;
                      return (
                        <option key={opt.id} value={opt.id} disabled={usedElsewhere}>
                          {opt.right}{usedElsewhere ? ' (used)' : ''}
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>
            </div>
          );
        })}
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
          --chip-min-h: 56px;

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

        .mtf-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .mtf-row {
          display: flex;
          align-items: stretch;
          gap: 10px;
          flex-wrap: wrap;
          animation: mtf-row-in 0.3s ease both;
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
          flex: 1 1 180px;
          min-width: 0;
          min-height: var(--chip-min-h);
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          justify-content: center;
          background: linear-gradient(160deg, #FFFFFF 0%, var(--word-tint) 130%);
          border: 1px solid #E1E0F5;
          border-left: 5px solid var(--word-ink);
          border-radius: 12px;
          padding: 10px 14px;
          box-shadow: 0 1px 2px rgba(28,33,48,0.05);
          overflow: hidden;
        }
        .mtf-word-text {
          font-size: 15.5px;
          font-weight: 700;
          letter-spacing: -0.01em;
          line-height: 1.25;
          color: var(--ink);
        }
        .mtf-english-hint {
          font-size: 12px;
          font-weight: 600;
          color: var(--ink-muted);
          margin-top: 2px;
        }

        .mtf-select-wrap {
          flex: 1 1 220px;
          display: flex;
        }

        .mtf-select {
          width: 100%;
          min-height: var(--chip-min-h);
          box-sizing: border-box;
          border-radius: 12px;
          border: 1.5px dashed #C9C2B4;
          background: var(--rail);
          padding: 10px 14px;
          font-family: inherit;
          font-size: 15px;
          font-weight: 700;
          color: var(--ink);
          cursor: pointer;
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
          /* Native appearance is intentional — this is what makes tapping
             reliable in every orientation, so we don't override it with a
             custom arrow/box beyond basic theming. */
        }
        .mtf-select:focus-visible {
          outline: 2px solid var(--brand);
          outline-offset: 2px;
        }
        .mtf-select--filled {
          border-style: solid;
          border-color: var(--meaning-ink);
          background: linear-gradient(160deg, #FFFFFF 0%, var(--meaning-tint) 130%);
        }

        .mtf-result {
          width: 100%;
          min-height: var(--chip-min-h);
          box-sizing: border-box;
          border-radius: 12px;
          border: 1.5px solid var(--meaning-ink);
          background: linear-gradient(160deg, #FFFFFF 0%, var(--meaning-tint) 130%);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8px 12px;
          text-align: center;
        }
        .mtf-result--correct {
          border-color: var(--success);
          background: linear-gradient(160deg, #FFFFFF 0%, var(--success-tint) 130%);
        }
        .mtf-result--incorrect {
          border-width: 2px;
          border-color: var(--error);
          background: linear-gradient(160deg, #FFFFFF 0%, var(--error-tint) 130%);
        }
        .mtf-result-content {
          font-size: 15px;
          font-weight: 700;
          letter-spacing: -0.01em;
          line-height: 1.25;
          color: var(--ink);
        }
        .mtf-result-content--wrong,
        .mtf-result--incorrect .mtf-result-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
        }
        .mtf-result-wrong-text {
          font-size: 13.5px;
          font-weight: 600;
          color: var(--error);
          text-decoration: line-through;
          text-decoration-thickness: 2px;
          text-decoration-color: var(--error);
          opacity: 0.75;
        }
        .mtf-result-correct-text {
          font-size: 15px;
          font-weight: 800;
          color: var(--success);
        }
        .mtf-result-correct-english {
          font-size: 12px;
          font-weight: 600;
          color: var(--ink-muted);
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
          .mtf-card, .mtf-row, .mtf-score-banner { animation: none !important; }
          .mtf-btn, .mtf-select { transition: none !important; }
        }

        @media (max-width: 620px) {
          .mtf-card { padding: 18px 16px 20px; }
          .mtf-row { gap: 8px; }
          .mtf-word-chip, .mtf-select-wrap { flex-basis: 100%; }
        }

        /* Landscape phones: keep word + dropdown side by side rather than
           stacking, since there's width to spare but not much height —
           this is the exact case the old tap UI struggled with, and a
           native select has no trouble with it. */
        @media (max-width: 900px) and (max-height: 480px) and (orientation: landscape) {
          .mtf-card { padding: 14px 16px 16px; }
          .mtf-word-chip, .mtf-select-wrap { flex-basis: auto; }
          .mtf-select, .mtf-result { min-height: 44px; }
        }
      `}</style>
    </div>
  );
}
