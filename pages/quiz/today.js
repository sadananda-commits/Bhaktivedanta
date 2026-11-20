// pages/quiz/today.js
//
// The ONE permanent link to share: https://bhaktivedanta.vercel.app/quiz/today
//
// It asks the server which day's quiz is "today" (worked out in the app's
// configured timezone, see QUIZ_TIMEZONE in pages/api/quiz.js) and sends the
// visitor to that quiz — e.g. /quiz/DAY21. The shared link itself never
// changes. If that day's quiz hasn't been published, a friendly page offers the
// latest available quiz and the list of earlier days instead of an error.
//
// A static route, so it always wins over the dynamic /quiz/[code] page.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { QuizFonts, QuizThemeStyles } from '../../lib/quizTheme';
import { BhaktivedantaLogo, BrandStyles } from '../../components/QuizBrand';
import PreviousDays from '../../components/PreviousDays';

const dayLabel = (code) => {
  const m = /^DAY0*(\d+)$/i.exec(code || '');
  return m ? `Day ${m[1]}` : code;
};

export default function DailyQuizRedirect() {
  const router = useRouter();
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dailyQuiz' }),
    })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (cancelled) return;
        if (!ok) throw new Error(j.error || 'failed');
        if (j.available) router.replace('/quiz/' + j.code);
        else setState({ status: 'missing', code: j.code, latest: j.latestAvailable });
      })
      .catch(() => { if (!cancelled) setState({ status: 'error' }); });
    return () => { cancelled = true; };
  }, [router]);

  return (
    <div className="qx-root qx-wrap">
      <Head><title>Bhaktivedanta Quiz — Today's Quiz</title></Head>
      <QuizFonts /><QuizThemeStyles /><BrandStyles />
      <div className="qx-card qx-center">
        <BhaktivedantaLogo size={84} />

        {state.status === 'loading' && (
          <p className="qx-muted" style={{ marginTop: 18 }}>
            <i className="fa-solid fa-circle-notch fa-spin" /> Finding today's quiz…
          </p>
        )}

        {state.status === 'missing' && (
          <>
            <h1 className="qx-title" style={{ marginTop: 18 }}>Today's quiz isn't ready yet</h1>
            <p className="qx-muted">
              {dayLabel(state.code)} hasn't been published yet. Please check back soon — in the meantime you can try an earlier day.
            </p>
            {state.latest && (
              <a className="qx-btn qx-btn-primary" style={{ display: 'block', textDecoration: 'none' }} href={'/quiz/' + state.latest}>
                <i className="fa-solid fa-play" /> Take the latest quiz ({dayLabel(state.latest)})
              </a>
            )}
            <h3 className="qx-leaderboard-title" style={{ marginTop: 22 }}>Explore Previous Days' Quizzes</h3>
            <PreviousDays currentCode={state.code} />
          </>
        )}

        {state.status === 'error' && (
          <>
            <h1 className="qx-title" style={{ marginTop: 18 }}>We couldn't load today's quiz</h1>
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
