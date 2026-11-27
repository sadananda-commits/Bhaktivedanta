// pages/quiz/today.js
//
// The single permanent link: https://bhaktivedanta.vercel.app/quiz/today
//
// Shows two big coloured buttons — "Word Quiz" and "Phrase Quiz". Choosing one
// opens today's quiz of that kind (the day of the month in QUIZ_TIMEZONE picks it:
// the 27th -> DAY27 / Phrase 27). Everything is decided on the server.
//
// Static route: wins over /quiz/[code]. /quiz/phrase keeps working as a direct link.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { QuizFonts, QuizThemeStyles } from '../../lib/quizTheme';
import { BhaktivedantaLogo, BrandStyles } from '../../components/QuizBrand';
import { TODAY_NAME_KEY } from '../../components/TodayNext';

async function call(body) {
  const r = await fetch('/api/quiz', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'failed');
  return j;
}

export default function TodayQuizHub() {
  const router = useRouter();
  const [hub, setHub] = useState(null);       // todayHub response
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');       // 'word' | 'phrase'

  useEffect(() => {
    let cancelled = false;
    let name = '';
    try { name = window.localStorage.getItem(TODAY_NAME_KEY) || ''; } catch (e) { /* ignore */ }
    call({ action: 'todayHub', name })
      .then(j => { if (!cancelled) setHub({ ...j, name }); })
      .catch(() => { if (!cancelled) setError("We couldn't load today's quizzes. Please check your connection and try again."); });
    return () => { cancelled = true; };
  }, []);

  async function open(kind) {
    setBusy(kind); setError('');
    try {
      // Ask again at click time so the date is always the server's current one.
      const j = await call({ action: kind === 'word' ? 'dailyQuiz' : 'dailyPhrase' });
      if (j.available) { router.push('/quiz/' + j.code); return; }
      setError(`Today's ${kind === 'word' ? 'Word' : 'Phrase'} Quiz hasn't been published yet. Please check back soon.`);
    } catch (e) {
      setError("Something went wrong. Please try again.");
    }
    setBusy('');
  }

  const items = [
    { key: 'word', title: 'Word Quiz', icon: 'fa-book-open', info: hub && hub.word },
    { key: 'phrase', title: 'Phrase Quiz', icon: 'fa-comment-dots', info: hub && hub.phrase },
  ];

  return (
    <div className="qx-root qx-wrap">
      <Head><title>Bhaktivedanta Quiz — Today's Quiz</title></Head>
      <QuizFonts /><QuizThemeStyles /><BrandStyles />
      <style>{HUB_CSS}</style>
      <div className="qx-card qx-center">
        <BhaktivedantaLogo size={84} />
        <h1 className="qx-title" style={{ marginTop: 18 }}>Today's Quiz</h1>
        <p className="qx-muted">Choose which quiz you'd like to take today.</p>

        <div className="th-buttons">
          {items.map(it => (
            <button
              key={it.key}
              className={'th-btn th-btn-' + it.key}
              onClick={() => open(it.key)}
              disabled={!!busy || (it.info && !it.info.available)}
            >
              <i className={'fa-solid ' + (busy === it.key ? 'fa-circle-notch fa-spin' : it.icon)} />
              <span className="th-btn-title">{it.title}</span>
              <span className="th-btn-sub">
                {!it.info ? 'Loading…' : !it.info.available ? 'Not published yet' : it.info.done ? `${it.info.label} · ✓ completed` : it.info.label}
              </span>
            </button>
          ))}
        </div>

        {error && <div className="qx-error" style={{ marginTop: 12 }}>{error}</div>}

        {hub && hub.bothDone && (
          <a className="th-results" href={'/quiz/today-results?name=' + encodeURIComponent(hub.name)}>
            <i className="fa-solid fa-ranking-star" /> You've done both — see today's leaderboards
          </a>
        )}
      </div>
    </div>
  );
}

const HUB_CSS = `
  .th-buttons { display: flex; flex-direction: column; gap: 14px; margin-top: 18px; }
  .th-btn { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 100%; padding: 20px 16px; border: 0; border-radius: 16px;
    font: inherit; cursor: pointer; color: #1b1200; box-shadow: 0 8px 22px rgba(0,0,0,0.3); transition: transform .12s, filter .12s; }
  .th-btn:hover:not(:disabled), .th-btn:focus-visible { transform: translateY(-2px); outline: 3px solid rgba(255,255,255,0.6); outline-offset: 2px; }
  .th-btn:disabled { opacity: 0.55; cursor: not-allowed; }
  .th-btn i { font-size: 26px; }
  .th-btn-title { font-size: 22px; font-weight: 800; }
  .th-btn-sub { font-size: 13px; font-weight: 700; opacity: 0.75; }
  .th-btn-word { background: linear-gradient(135deg, #FFD166, #FF9F1C); }
  .th-btn-phrase { background: linear-gradient(135deg, #7AF5D2, #1FC8A0); }
  .th-results { display: block; margin-top: 16px; padding: 12px; border-radius: 12px; text-decoration: none; font-weight: 800;
    color: var(--qx-text, #fff); background: rgba(255,255,255,0.08); border: 1px solid rgba(255,209,102,0.5); }
  .th-results i { margin-right: 6px; }
`;
