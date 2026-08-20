// components/MatchTheFollowing.jsx
//
// "Match the Following" question type — 10 left-side items, 10 shuffled
// right-side items. Student drags each right-side box onto the left-side
// item it matches. Nothing is scored until Submit is pressed.
//
// Works with mouse AND touch (Pointer Events), which is what the existing
// Student Portal quiz screens need since most students are on phones.
//
// USAGE:
//   <MatchTheFollowing
//     pairs={[
//       { id: '1', left: 'Benevolent', right: 'Kind and generous' },
//       { id: '2', left: 'Candid',     right: 'Honest and direct' },
//       ... up to 10
//     ]}
//     onSubmit={(result) => {
//       // result = { score, total, correct: { [pairId]: boolean }, placements: {...} }
//     }}
//   />
//
// This is a self-contained, dependency-free component (no react-dnd /
// react-beautiful-dnd needed) so it drops straight into the existing
// pages/ Next.js setup without adding packages.

import { useEffect, useMemo, useRef, useState } from 'react';

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function MatchTheFollowing({ pairs, onSubmit, title }) {
  // pairs: [{ id, left, right }]
  const rightShuffled = useMemo(() => shuffle(pairs), [pairs]);

  // placements: { [leftId]: rightItemId }
  const [placements, setPlacements] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);

  // Track which bank item currently sits in which slot (or the bank itself)
  // location: { [itemId]: 'bank' | leftId }
  const [locations, setLocations] = useState(() => {
    const initial = {};
    pairs.forEach(p => { initial[p.id] = 'bank'; });
    return initial;
  });

  const containerRef = useRef(null);
  const dragState = useRef(null); // { itemId, el, offsetX, offsetY }

  const placedCount = Object.keys(placements).length;

  function handlePointerDown(e, itemId) {
    if (submitted) return;
    e.preventDefault();
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    dragState.current = {
      itemId,
      el,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      startRect: rect,
    };
    el.setPointerCapture(e.pointerId);
    el.style.position = 'fixed';
    el.style.zIndex = 1000;
    el.style.width = rect.width + 'px';
    el.style.left = rect.left + 'px';
    el.style.top = rect.top + 'px';
    el.style.boxShadow = '0 4px 14px rgba(0,0,0,0.18)';
    el.style.pointerEvents = 'none'; // so elementFromPoint sees what's underneath
  }

  function handlePointerMove(e) {
    const ds = dragState.current;
    if (!ds) return;
    ds.el.style.left = (e.clientX - ds.offsetX) + 'px';
    ds.el.style.top = (e.clientY - ds.offsetY) + 'px';
  }

  function handlePointerUp(e) {
    const ds = dragState.current;
    if (!ds) return;
    dragState.current = null;

    const el = ds.el;
    el.style.position = '';
    el.style.zIndex = '';
    el.style.left = '';
    el.style.top = '';
    el.style.boxShadow = '';
    el.style.pointerEvents = '';
    el.style.width = '';

    const target = document.elementFromPoint(e.clientX, e.clientY);
    const slotEl = target ? target.closest('[data-slot-id]') : null;
    const droppedOnBank = target ? target.closest('[data-bank-zone]') : null;

    setPlacements(prevPlacements => {
      const next = { ...prevPlacements };
      const leftId = slotEl ? slotEl.getAttribute('data-slot-id') : null;

      // Remove this item from wherever it currently sits
      Object.keys(next).forEach(k => { if (next[k] === ds.itemId) delete next[k]; });

      if (leftId) {
        // If another item already occupies this slot, send it back to bank
        // (it's simply "unplaced" — it'll reappear in the bank list on render)
        next[leftId] = ds.itemId;
      } else if (!droppedOnBank && !slotEl) {
        // Dropped in empty space outside both columns — treat as "return to bank"
      }
      return next;
    });

    setLocations(prevLoc => {
      const next = { ...prevLoc };
      const leftId = slotEl ? slotEl.getAttribute('data-slot-id') : null;
      next[ds.itemId] = leftId || 'bank';
      return next;
    });
  }

  useEffect(() => {
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [submitted]);

  function handleReset() {
    setPlacements({});
    setSubmitted(false);
    setResult(null);
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
          border: '1px solid #e2e2e0',
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
    <div ref={containerRef} style={{ maxWidth: 680 }}>
      {title && (
        <h3 style={{ fontSize: 16, fontWeight: 500, margin: '0 0 12px' }}>{title}</h3>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: '#666' }}>Drag each meaning on the right onto its matching word</span>
        <span style={{ fontSize: 12, color: '#999' }}>{placedCount} / {pairs.length} placed</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Left column: fixed items with drop slots */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pairs.map((p, idx) => {
            const filledId = placements[p.id];
            const filledItem = filledId ? pairs.find(x => x.id === filledId) : null;
            let borderColor = '#d5d5d2';
            let bg = 'transparent';
            if (submitted) {
              borderColor = result.correct[p.id] ? '#3b9e5a' : '#d64545';
              bg = result.correct[p.id] ? '#eaf6ee' : '#fbeaea';
            }
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 20, fontSize: 12, color: '#999' }}>{idx + 1}.</div>
                <div style={{ flex: 1, background: '#f4f4f2', borderRadius: 8, padding: '10px 12px', fontSize: 14 }}>
                  {p.left}
                </div>
                <div
                  data-slot-id={p.id}
                  style={{
                    width: 140,
                    minHeight: 40,
                    border: `1.5px ${filledItem ? 'solid' : 'dashed'} ${borderColor}`,
                    background: bg,
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
                        style={{ fontSize: 13, cursor: submitted ? 'default' : 'grab', textAlign: 'center', width: '100%' }}
                      >
                        {filledItem.right}
                      </div>
                    )
                    : <span style={{ fontSize: 11, color: '#bbb' }}>drop here</span>
                  }
                </div>
              </div>
            );
          })}
        </div>

        {/* Right column: shuffled bank of draggable answers */}
        <div data-bank-zone="true" style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 40 * pairs.length }}>
          {bankItems.map(renderBankItem)}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
        <button
          onClick={handleReset}
          style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d5d5d2', background: '#fff', fontSize: 14, cursor: 'pointer' }}
        >
          Reset
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitted || placedCount < pairs.length}
          style={{
            padding: '8px 20px',
            borderRadius: 8,
            border: 'none',
            background: (submitted || placedCount < pairs.length) ? '#ccc' : '#00c6a7',
            color: '#fff',
            fontSize: 14,
            fontWeight: 500,
            cursor: (submitted || placedCount < pairs.length) ? 'default' : 'pointer',
          }}
        >
          Submit
        </button>
      </div>

      {submitted && result && (
        <div style={{ marginTop: 16, fontSize: 15, fontWeight: 500, color: result.score === result.total ? '#3b9e5a' : '#333' }}>
          Score: {result.score} / {result.total} correct
        </div>
      )}
    </div>
  );
}
