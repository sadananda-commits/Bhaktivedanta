// pages/quiz/phrase.js
//
// The permanent link for the PHRASE quizzes: https://bhaktivedanta.vercel.app/quiz/phrase
//
// Same idea as /quiz/today: the day of the month (in the app's configured
// timezone, QUIZ_TIMEZONE in pages/api/quiz.js) picks the quiz — the 25th opens
// "Phrase 25" — and the visitor is sent straight to it. The shared link never
// changes. If that day's phrase quiz doesn't exist yet, a friendly page offers
// the latest phrase quiz and the earlier ones instead of an error.
//
// A static route, so it always wins over the dynamic /quiz/[code] page.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { QuizFonts, QuizThemeStyles } from '../../lib/quizTheme';
import { BhaktivedantaLogo, BrandStyles } from '../../components/QuizBrand';
import PreviousDays from '../../components/PreviousDays';

export default function DailyPhraseRedirect() {
  const router = useRouter();
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dailyPhrase' }),
    })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (cancelled) return;
        if (!ok) throw new Error(j.error || 'failed');
        if (j.available) router.replace('/quiz/' + j.code);
        else setState({ status: 'missing', label: j.label, latest: j.latestAvailable, latestLabel: j.latestLabel });
      })
      .catch(() => { if (!cancelled) setState({ status: 'error' }); });
    return () => { cancelled = true; };
  }, [router]);

  return (
    <div className="qx-root qx-wrap">
      <Head><title>Bhaktivedanta Quiz — Today's Phrase Quiz</title></Head>
      <QuizFonts /><QuizThemeStyles /><BrandStyles />
      <div className="qx-card qx-center">
        <BhaktivedantaLogo size={84} />

        {state.status === 'loading' && (
          <p className="qx-muted" style={{ marginTop: 18 }}>
            <i className="fa-solid fa-circle-notch fa-spin" /> Finding today's phrase quiz…
          </p>
        )}

        {state.status === 'missing' && (
          <>
            <h1 className="qx-title" style={{ marginTop: 18 }}>Today's phrase quiz isn't ready yet</h1>
            <p className="qx-muted">
              {state.label} hasn't been published yet. Please check back soon — in the meantime you can try an earlier phrase quiz.
            </p>
            {state.latest && (
              <a className="qx-btn qx-btn-primary" style={{ display: 'block', textDecoration: 'none' }} href={'/quiz/' + state.latest}>
                <i className="fa-solid fa-play" /> Take the latest quiz ({state.latestLabel})
              </a>
            )}
            <h3 className="qx-leaderboard-title" style={{ marginTop: 22 }}>Explore Previous Phrase Quizzes</h3>
            <PreviousDays series="phrase" />
          </>
        )}

        {state.status === 'error' && (
          <>
            <h1 className="qx-title" style={{ marginTop: 18 }}>We couldn't load today's phrase quiz</h1>
            <p className="qx-muted">Something went wrong while contacting the server. Please check your connection and try again.</p>
            <button className="qx-btn qx-btn-primary" onClick={() => window.location.reload()}>
              <i className="fa-solid fa-rotate-right" /> Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
