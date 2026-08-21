// pages/quiz-host/[code].js
//
// Host control panel. Access is gated by a per-quiz Host Code — a short
// code the teacher/parent set themselves when creating the quiz in
// Online Quizzes → New Quiz — NOT by Parent Portal login/email. Code.gs
// re-validates the code server-side on every host action (see assertHost_
// in Code.gs); this page just needs to collect it once.
//
// Preferred path: opened via "Open Host Panel" from inside Parent Portal's
// Online Quizzes panel. That link includes the quiz's own host code as a
// ?hostCode= query param (the dashboard already knows it — it's the
// teacher's own quiz), so the panel verifies it automatically and opens
// with zero prompts, same as before.
//
// Fallback path (e.g. the host panel is opened directly on a projector
// laptop, bookmarked, or the link is shared without the query param): a
// short "Enter host code" form — no email, no active portal session
// required, just the code for this specific quiz.

import { useRouter } from 'next/router';
import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import OnlineQuizHost from '../../components/OnlineQuizHost';
import { quizApi } from '../../lib/quizApi';
import { QuizFonts, QuizThemeStyles } from '../../lib/quizTheme';

export default function QuizHostPage() {
  const router = useRouter();
  const { code, hostCode: hostCodeFromLink } = router.query;

  const [hostCode, setHostCode] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [entry, setEntry] = useState('');
  const autoTriedRef = useRef(false);

  function verify(candidate) {
    const value = String(candidate || '').trim();
    if (!value) return;
    setChecking(true);
    setError('');
    quizApi.verifyHostCode(String(code).toUpperCase(), value)
      .then(() => setHostCode(value))
      .catch(err => setError(err.message))
      .finally(() => setChecking(false));
  }

  // Preferred path: a hostCode arrived via the dashboard's own link, so
  // verify it silently — no form ever shows up for this case.
  useEffect(() => {
    if (!code || !hostCodeFromLink || autoTriedRef.current) return;
    autoTriedRef.current = true;
    verify(hostCodeFromLink);
  }, [code, hostCodeFromLink]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!code) return null;

  const autoChecking = checking && !hostCode && hostCodeFromLink && !error;

  if (!hostCode) {
    return (
      <div className="qx-root qx-wrap">
        <QuizFonts /><QuizThemeStyles />
        <div className="qx-card qx-center">
          {autoChecking ? (
            <>
              <div className="qx-eyebrow">Opening host panel</div>
              <p className="qx-muted"><i className="fa-solid fa-circle-notch fa-spin" /> Checking your host code…</p>
            </>
          ) : (
            <>
              <div className="qx-eyebrow">Host access needed</div>
              <h1 className="qx-title">Enter the host code</h1>
              <p className="qx-muted" style={{ margin: '0 0 22px' }}>
                Enter the host code you set when creating quiz <strong>{code}</strong>.
                You'll find it on that quiz's card in <strong>Online Quizzes</strong>.
              </p>
              <input
                className="qx-input"
                value={entry}
                onChange={e => setEntry(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') verify(entry); }}
                placeholder="Host code"
                autoFocus
              />
              <button
                className="qx-btn qx-btn-primary"
                disabled={checking || !entry.trim()}
                onClick={() => verify(entry)}
              >
                {checking
                  ? <><i className="fa-solid fa-circle-notch fa-spin" /> Checking…</>
                  : <><i className="fa-solid fa-unlock" /> Launch Host Panel</>}
              </button>
              {error && <div className="qx-error">⚠ {error}</div>}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <Head><title>Host: Quiz {code}</title></Head>
      <OnlineQuizHost quizCode={String(code).toUpperCase()} hostCode={hostCode} />
    </>
  );
}
