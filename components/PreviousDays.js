// components/PreviousDays.js
//
// "Explore Previous Days' Quizzes": a tidy grid of Day chips, newest first,
// built from the quizzes that actually exist (never future or missing days).
// Picking a chip opens that day's own quiz link (/quiz/DAYnn).

import { useEffect, useState } from 'react';

export default function PreviousDays({ currentCode }) {
  const [state, setState] = useState({ status: 'loading', days: [], today: '' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'listQuizDays' }),
    })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (cancelled) return;
        if (!ok) throw new Error(j.error || 'failed');
        setState({ status: 'ready', days: j.days || [], today: j.today || '' });
      })
      .catch(() => { if (!cancelled) setState({ status: 'error', days: [], today: '' }); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="bq-days">
      <style>{DAYS_CSS}</style>
      {state.status === 'loading' && <p className="bq-days-note">Loading quizzes…</p>}
      {state.status === 'error' && (
        <p className="bq-days-note">We couldn't load the list of quizzes just now. Please try again in a moment.</p>
      )}
      {state.status === 'ready' && state.days.length === 0 && (
        <p className="bq-days-note">No earlier quizzes are available yet.</p>
      )}
      {state.status === 'ready' && state.days.length > 0 && (
        <div className="bq-days-grid">
          {state.days.map(d => {
            const isCurrent = d.code === String(currentCode || '').toUpperCase();
            return (
              <a
                key={d.code}
                href={'/quiz/' + d.code}
                className={'bq-day' + (isCurrent ? ' bq-day-current' : '')}
                aria-current={isCurrent ? 'true' : undefined}
              >
                <span className="bq-day-name">Day {d.day}</span>
                {d.code === state.today && <span className="bq-day-tag">Today</span>}
                {isCurrent && d.code !== state.today && <span className="bq-day-tag">Just played</span>}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

const DAYS_CSS = `
  .bq-days { text-align: left; }
  .bq-days-note { margin: 4px 0; font-size: 13.5px; color: var(--qx-muted, rgba(255,255,255,0.7)); text-align: center; }
  .bq-days-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
  .bq-day {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
    min-height: 54px; padding: 8px 6px; border-radius: 12px; text-decoration: none;
    color: var(--qx-text, #fff); font-weight: 700; font-size: 14px;
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14);
    transition: transform .12s, background .12s, border-color .12s;
  }
  .bq-day:hover, .bq-day:focus-visible { background: rgba(255,159,28,0.16); border-color: #FF9F1C; transform: translateY(-1px); outline: none; }
  .bq-day-current { border-color: rgba(52,231,180,0.55); }
  .bq-day-tag {
    font-size: 10.5px; font-weight: 800; letter-spacing: 0.03em; text-transform: uppercase;
    padding: 1px 8px; border-radius: 99px; background: #FF9F1C; color: #2a1600;
  }
`;
