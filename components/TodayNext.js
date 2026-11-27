// components/TodayNext.js
//
// Shown on the self-paced completion screen. If the quiz just finished is one of
// TODAY's two quizzes (Word Quiz / Phrase Quiz):
//   • the other one is not finished yet  -> a coloured button to take it next
//   • both are finished                  -> a button to today's leaderboards,
//                                           shown side by side (laptop) / stacked (phone)
// For any other quiz (an older day, etc.) it renders nothing.

import { useEffect, useState } from 'react';
import TodayBoards from './TodayBoards';

export const TODAY_NAME_KEY = 'bq_today_name';

// One shared fetch: TodayNext (inside the card) and TodayBothBoards (wide section
// below it) both mount together, so concurrent callers reuse a single request.
let hubCache = { key: '', at: 0, promise: null };
export function useTodayHub(name, quizCode) {
  const [data, setData] = useState(null);
  useEffect(() => {
    const who = String(name || '').trim();
    if (!who || !quizCode) return undefined;
    try { window.localStorage.setItem(TODAY_NAME_KEY, who); } catch (e) { /* optional */ }
    const key = who.toLowerCase() + '|' + String(quizCode).toUpperCase();
    if (!hubCache.promise || hubCache.key !== key || Date.now() - hubCache.at > 5000) {
      hubCache = {
        key, at: Date.now(),
        promise: fetch('/api/quiz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'todayHub', name: who, quizCode }),
        }).then(r => r.json().then(j => { if (!r.ok) throw new Error(j.error || 'failed'); return j; })),
      };
    }
    let cancelled = false;
    hubCache.promise.then(j => { if (!cancelled) setData(j); }).catch(() => {}); // optional extra
    return () => { cancelled = true; };
  }, [name, quizCode]);
  return data;
}

// Wide section for the participant page: when BOTH of today's quizzes are
// finished, today's two leaderboards side by side (laptop) / stacked (phone).
// Render it as a sibling AFTER <SoloCompletion/> (outside the 440px card).
export function TodayBothBoards({ name, quizCode }) {
  const data = useTodayHub(name, quizCode);
  if (!data || !data.isTodays || !data.bothDone || !data.boards) return null;
  return (
    <section id="today-boards" style={{ width: '100%', maxWidth: 1040, margin: '18px auto 8px' }}>
      <h2 className="qx-title" style={{ textAlign: 'center' }}>Today's Leaderboards</h2>
      <TodayBoards data={data} />
    </section>
  );
}

export default function TodayNext({ name, quizCode }) {
  const data = useTodayHub(name, quizCode);

  if (!data || !data.isTodays) return null;

  const justDid = String(quizCode).toUpperCase() === String(data.word.code || '').toUpperCase() ? data.word : data.phrase;
  const other = justDid.key === 'word' ? data.phrase : data.word;

  return (
    <div className="tn-box">
      <style>{TN_CSS}</style>

      {data.bothDone ? (
        <>
          <div className="tn-head">🎉 You've completed both of today's quizzes!</div>
          <p className="tn-text">See how you rank in the Word Quiz and the Phrase Quiz — both leaderboards are just below.</p>
          <a className="tn-btn tn-btn-both" href="#today-boards">
            <i className="fa-solid fa-ranking-star" /> See today's leaderboards
          </a>
        </>
      ) : other.available ? (
        <>
          <div className="tn-head">Next up: today's {other.title}</div>
          <p className="tn-text">
            You've finished today's {justDid.title}. Take today's {other.title} ({other.label}) too — then you'll see both leaderboards side by side!
          </p>
          <a className={'tn-btn tn-btn-' + other.key} href={'/quiz/' + other.code}>
            <i className={other.key === 'word' ? 'fa-solid fa-book-open' : 'fa-solid fa-comment-dots'} /> Take today's {other.title}
          </a>
        </>
      ) : (
        <p className="tn-text" style={{ margin: 0 }}>
          Today's {other.title} ({other.label}) isn't published yet — check back soon!
        </p>
      )}
    </div>
  );
}

const TN_CSS = `
  .tn-box { margin-top: 12px; padding: 14px; border-radius: 14px; text-align: left;
    background: linear-gradient(135deg, rgba(255,159,28,0.16), rgba(52,231,180,0.14)); border: 1px solid rgba(255,209,102,0.35); }
  .tn-head { font-size: 16px; font-weight: 800; margin-bottom: 4px; }
  .tn-text { margin: 0 0 12px; font-size: 14px; line-height: 1.5; opacity: 0.9; }
  .tn-btn { display: block; text-align: center; text-decoration: none; padding: 14px 16px; border-radius: 12px;
    font-weight: 800; font-size: 16px; color: #1b1200; box-shadow: 0 6px 18px rgba(0,0,0,0.25); transition: transform .12s; }
  .tn-btn:hover, .tn-btn:focus-visible { transform: translateY(-1px); outline: none; }
  .tn-btn i { margin-right: 8px; }
  .tn-btn-word { background: linear-gradient(135deg, #FFD166, #FF9F1C); }
  .tn-btn-phrase { background: linear-gradient(135deg, #7AF5D2, #1FC8A0); }
  .tn-btn-both { background: linear-gradient(135deg, #FFD166 0%, #34E7B4 100%); }
`;
