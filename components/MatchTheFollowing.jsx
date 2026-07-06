// components/MatchTheFollowing.jsx
//
// "Match the Following" question type — 10 (or fewer) left-side items,
// shuffled right-side items. Student drags each right-side box onto the
// left-side item it matches, then presses Submit to lock and score it.
//
// v3 — FIX: every text element now has an EXPLICIT color, and the whole
// widget sits inside its own light card. v2 relied on inherited text color
// for a few elements (the bank items, the left-side prompt boxes, the
// Reset button) — fine on a page with dark text by default, but on
// portal.js's dark theme (white body text) those elements had a light box
// background AND inherited white text, so the text was invisible: white on
// white/light-gray. Wrapping everything in one explicit light card, with
// every piece of text given its own color, means this never depends on
// whatever theme the page around it happens to use.
//
// USAGE (fresh question):
//   <MatchTheFollowing
//     key={`${step['Module ID']}-${step['Step Number']}`}   // IMPORTANT — see note below
//     pairs={pairsFromStep(step)}
//     onSubmit={(result) => submitMatchTheFollowing(result)}
//   />
//
// USAGE (revisiting an already-answered question):
//   <MatchTheFollowing
//     key={`${step['Module ID']}-${step['Step Number']}`}
//     pairs={pairsFromStep(step)}
//     onSubmit={submitMatchTheFollowing}
//     initialPlacements={currentAnswer.placements}   // { [leftId]: rightItemId }
//     initialLocked={true}
//   />
//
// WHY THE `key` MATTERS: React reuses component instances across renders
// unless the key changes. This component only shuffles its right-hand
// column ONCE on mount (see useMemo below) — so if you render it without a
// key that changes per question, moving to the next question in the same
// parent tree will keep showing the PREVIOUS question's shuffle order
// frozen. Always key it by something unique to the step (Module ID + Step
// Number), the same way `steps[idx]['Step Number']` already keys `answers`
// in portal.js. Keying it also means it fully remounts on question change,
// which is what makes initialPlacements/initialLocked "just work" without
// any manual reset logic.

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
  // Shuffled ONCE per mounted instance (i.e. once per question, given the
  // key= usage above) — not re-shuffled on every drag/re-render.
  const rightShuffled = useMemo(() => shuffle(pairs), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [placements, setPlacements] = useState(initialPlacements || {});
  const [submitted, setSubmitted] = useState(!!initialLocked);

  // If we're mounting into an already-answered question, compute the
  // result immediately from the saved placements — WITHOUT calling
  // onSubmit again (that would double-count it in progress tracking).
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
    el.style.position = 'fixed';
    el.style.zIndex = 1000;
    el.style.width = rect.width + 'px';
    el.style.left = rect.left + 'px';
    el.style.top = rect.top + 'px';
    el.style.boxShadow = '0 4px 14px rgba(0,0,0,0.18)';
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
      el.style.pointerEvents = '';
      el.style.width = '';

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

  const bankItems = rightShuffled.filter(p => locations[p.id] === 'bank');

  function renderBankItem(p) {
    return (
      <div
        key={p.id}
        onPointerDown={(e) => handlePointerDown(e, p.id)}
        style={{
          background: '#ffffff',
          color: '#1a1a1a',
          border: '1px solid #d5d5d2',
          borderRadius: 8,
          padding: '10px 12px',
          fontSize: 14,
          cursor: submitted ? 'default' : 'grab',
          userSelect: 'none',
          touchAction: 'none',
        }}
      >
        {p.right}
      </div>
    );
  }

  return (
    // Self-contained light card — deliberately does NOT rely on any color
    // inherited from the surrounding page, since portal.js's quiz screens
    // use a dark theme (white body text) that would otherwise make text
    // invisible against this widget's light boxes.
    <div style={{
      maxWidth: 680,
      background: '#f7f7f5',
      borderRadius: 14,
      padding: '18px 20px',
      border: '1px solid #e2e2e0',
    }}>
      {title && (
        <h3 style={{ fontSize: 16, fontWeight: 500, margin: '0 0 12px', color: '#1a1a1a' }}>{title}</h3>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: '#555' }}>Drag each meaning on the right onto its matching word</span>
        {!submitted && <span style={{ fontSize: 12, color: '#888' }}>{placedCount} / {pairs.length} placed</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pairs.map((p, idx) => {
            const filledId = placements[p.id];
            const filledItem = filledId ? pairs.find(x => x.id === filledId) : null;
            let borderColor = '#d5d5d2';
            let bg = '#ffffff';
            let slotTextColor = '#1a1a1a';
            if (submitted && result) {
              borderColor = result.correct[p.id] ? '#3b9e5a' : '#d64545';
              bg = result.correct[p.id] ? '#eaf6ee' : '#fbeaea';
              slotTextColor = result.correct[p.id] ? '#1e6b3d' : '#a12a2a';
            }
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 20, fontSize: 12, color: '#888' }}>{idx + 1}.</div>
                <div style={{ flex: 1, background: '#ffffff', color: '#1a1a1a', border: '1px solid #e2e2e0', borderRadius: 8, padding: '10px 12px', fontSize: 14 }}>
                  {p.left}
                </div>
                <div
                  data-slot-id={p.id}
                  style={{
                    width: 140,
                    minHeight: 40,
                    border: `1.5px ${filledItem ? 'solid' : 'dashed'} ${borderColor}`,
                    background: filledItem ? bg : '#f0f0ee',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '6px 8px',
                  }}
                >
                  {filledItem
                    ? (
                      <div
                        onPointerDown={(e) => handlePointerDown(e, filledItem.id)}
                        style={{ fontSize: 13, color: slotTextColor, cursor: submitted ? 'default' : 'grab', textAlign: 'center', width: '100%' }}
                      >
                        {filledItem.right}
                      </div>
                    )
                    : <span style={{ fontSize: 11, color: '#999' }}>drop here</span>
                  }
                </div>
              </div>
            );
          })}
        </div>

        <div data-bank-zone="true" style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 40 * pairs.length }}>
          {bankItems.map(renderBankItem)}
        </div>
      </div>

      {!submitted && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
          <button
            onClick={handleReset}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d5d5d2', background: '#ffffff', color: '#333333', fontSize: 14, cursor: 'pointer' }}
          >
            Reset
          </button>
          <button
            onClick={handleSubmit}
            disabled={placedCount < pairs.length}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              background: placedCount < pairs.length ? '#cccccc' : '#00c6a7',
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 500,
              cursor: placedCount < pairs.length ? 'default' : 'pointer',
            }}
          >
            Submit
          </button>
        </div>
      )}

      {submitted && result && (
        <div style={{ marginTop: 16, fontSize: 15, fontWeight: 500, color: result.score === result.total ? '#1e6b3d' : '#333333' }}>
          Score: {result.score} / {result.total} correct
        </div>
      )}
    </div>
  );
}
