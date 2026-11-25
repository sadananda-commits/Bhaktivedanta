// components/UntriedDays.js
//
// "Days you haven't tried yet": a drop-down of every available quiz day this
// person (matched by name) has never joined, newest first, with a friendly nudge
// to try them. Choosing a day opens that day's quiz. A day drops off the list
// automatically the moment it is attempted, because the list is rebuilt from the
// server each time this screen is shown.

import { useEffect, useState } from 'react';

export default function UntriedDays({ name, series = 'day' }) {
  const [state, setState] = useState({ status: 'loading', days: [] });

  useEffect(() => {
    const who = String(name || '').trim();
    if (!who) { setState({ status: 'hidden', days: [] }); return undefined; }
    let cancelled = false;
    fetch('/api/quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getUnattemptedDays', name: who, series }),
    })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (cancelled) return;
        if (!ok) throw new Error(j.error || 'failed');
        setState({ status: 'ready', days: j.days || [], total: j.totalDays || 0 });
      })
      .catch(() => { if (!cancelled) setState({ status: 'hidden', days: [] }); }); // optional extra — never get in the way
    return () => { cancelled = true; };
  }, [name, series]);

  if (state.status === 'hidden') return null;

  return (
    <div className="bq-untried">
      <style>{UNTRIED_CSS}</style>
      {state.status === 'loading' && (
        <p className="bq-untried-note"><i className="fa-solid fa-circle-notch fa-spin" /> Checking which days you haven't tried…</p>
      )}

      {state.status === 'ready' && state.days.length === 0 && (
        <p className="bq-untried-note bq-untried-done">🌟 You've tried every available quiz — wonderful dedication!</p>
      )}

      {state.status === 'ready' && state.days.length > 0 && (
        <>
          <div className="bq-untried-head">
            <span className="bq-untried-count">{state.days.length}</span>
            <div>
              <strong>{state.days.length === 1 ? '1 quiz' : `${state.days.length} quizzes`} you haven't tried yet</strong>
              <p>Give {state.days.length === 1 ? 'it' : 'one'} a try — every quiz adds to your learning!</p>
            </div>
          </div>
          <select
            className="bq-untried-select"
            defaultValue=""
            aria-label="Choose a quiz day you haven't tried yet"
            onChange={e => { if (e.target.value) window.location.href = '/quiz/' + e.target.value; }}
          >
            <option value="" disabled>Choose a day to try…</option>
            {state.days.map(d => (
              <option key={d.code} value={d.code}>{d.label || `Day ${d.day}`}</option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}

const UNTRIED_CSS = `
  .bq-untried {
    margin-top: 12px; padding: 12px 14px; border-radius: 12px; text-align: left;
    background: linear-gradient(135deg, rgba(122,162,255,0.14), rgba(255,159,28,0.12));
    border: 1px solid rgba(255,209,102,0.35);
  }
  .bq-untried-note { margin: 0; font-size: 13.5px; text-align: center; color: var(--qx-muted, rgba(255,255,255,0.75)); }
  .bq-untried-done { color: var(--qx-text, #fff); font-weight: 700; }
  .bq-untried-head { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
  .bq-untried-head strong { font-size: 14.5px; }
  .bq-untried-head p { margin: 2px 0 0; font-size: 13px; opacity: 0.8; }
  .bq-untried-count {
    flex: none; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center;
    font-weight: 800; font-size: 17px; background: #FF9F1C; color: #2a1600;
  }
  .bq-untried-select {
    width: 100%; padding: 12px 14px; border-radius: 10px; font: inherit; font-weight: 700; cursor: pointer;
    color: var(--qx-text, #fff); background: var(--qx-surface-2, #1f2547); border: 1px solid rgba(255,255,255,0.2);
  }
  .bq-untried-select:focus-visible { outline: 2px solid #FF9F1C; outline-offset: 2px; }
`;
