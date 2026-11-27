// pages/quiz/today-results.js
//
// /quiz/today-results?name=Anna — today's Word Quiz and Phrase Quiz leaderboards,
// side by side on a laptop/desktop, one below the other on a phone. If the person
// hasn't finished both yet, it offers the quiz that is still missing instead.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { QuizFonts, QuizThemeStyles } from '../../lib/quizTheme';
import { BhaktivedantaLogo, BrandStyles } from '../../components/QuizBrand';
import TodayBoards from '../../components/TodayBoards';

export default function TodayResults() {
  const router = useRouter();
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    if (!router.isReady) return undefined;
    const name = String(router.query.name || '').trim();
    if (!name) { setState({ status: 'noname' }); return undefined; }
    let cancelled = false;
    fetch('/api/quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'todayHub', name }),
    })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (cancelled) return;
        if (!ok) throw new Error(j.error || 'failed');
        setState({ status: 'ready', data: j, name });
      })
      .catch(() => { if (!cancelled) setState({ status: 'error' }); });
    return () => { cancelled = true; };
  }, [router.isReady, router.query.name]);

  const d = state.data;
  const missing = d && [d.word, d.phrase].filter(x => !x.done);

  return (
    <div className="qx-root" style={{ minHeight: '100vh' }}>
      <Head><title>Bhaktivedanta Quiz — Today's Leaderboards</title></Head>
      <QuizFonts /><QuizThemeStyles /><BrandStyles />
      <style>{`.tr-page { width: min(1040px, 100%); margin: 0 auto; padding: 20px 14px 40px; text-align: center; }
        .tr-btn { display: inline-block; margin: 6px; padding: 14px 22px; border-radius: 12px; text-decoration: none; font-weight: 800; color: #1b1200; }
        .tr-word { background: linear-gradient(135deg, #FFD166, #FF9F1C); } .tr-phrase { background: linear-gradient(135deg, #7AF5D2, #1FC8A0); }`}</style>
      <div className="tr-page">
        <BhaktivedantaLogo size={64} />
        <h1 className="qx-title" style={{ margin: '12px 0 4px' }}>Today's Leaderboards</h1>

        {state.status === 'loading' && <p className="qx-muted">Loading…</p>}
        {state.status === 'error' && <p className="qx-muted">We couldn't load the leaderboards. Please try again in a moment.</p>}
        {state.status === 'noname' && (
          <>
            <p className="qx-muted">Take today's quizzes to see the leaderboards.</p>
            <a className="tr-btn tr-word" href="/quiz/today">Go to Today's Quiz</a>
          </>
        )}

        {state.status === 'ready' && d.bothDone && (
          <>
            <p className="qx-muted" style={{ marginBottom: 18 }}>Well done, {state.name}! Here's how everyone did today.</p>
            <TodayBoards data={d} />
          </>
        )}

        {state.status === 'ready' && !d.bothDone && (
          <>
            <p className="qx-muted">Finish both of today's quizzes to unlock the leaderboards side by side.</p>
            {missing.map(m => m.available
              ? <a key={m.key} className={'tr-btn tr-' + m.key} href={'/quiz/' + m.code}>Take today's {m.title}</a>
              : <p key={m.key} className="qx-muted">Today's {m.title} isn't published yet.</p>)}
          </>
        )}
      </div>
    </div>
  );
}
