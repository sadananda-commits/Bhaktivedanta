// pages/quiz-host/[code].js
//
// Host control panel. Restricted to the teacher/parent who owns the quiz —
// Code.gs enforces this server-side (Host Email must match), this page
// just needs to know who's asking.
//
// Preferred path: opened via "Open Host Panel" from inside Parent Portal's
// Online Quizzes panel — already logged in, no prompt at all.
//
// Fallback path (e.g. opened directly on a projector laptop with no active
// Parent Portal session): a real sign-in prompt pointing at Parent Portal,
// not a free-text box. A collapsed "advanced" manual-entry option is kept
// underneath for testing/edge cases, but it's no longer the primary flow.

import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Head from 'next/head';
import OnlineQuizHost from '../../components/OnlineQuizHost';
import { QuizFonts, QuizThemeStyles } from '../../lib/quizTheme';

export default function QuizHostPage() {
  const router = useRouter();
  const { code } = router.query;
  const [hostEmail, setHostEmail] = useState(null);
  const [checked, setChecked] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualEmail, setManualEmail] = useState('');

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('vedanta_profile') || 'null');
      if (saved?.email) setHostEmail(saved.email);
    } catch { /* ignore */ }
    setChecked(true);
  }, []);

  if (!code || !checked) return null;

  if (!hostEmail) {
    return (
      <div className="qx-root qx-wrap">
        <QuizFonts /><QuizThemeStyles />
        <div className="qx-card qx-center">
          <div className="qx-eyebrow">Host access needed</div>
          <h1 className="qx-title">Sign in to host</h1>
          <p className="qx-muted" style={{ margin: '0 0 22px' }}>
            This quiz link opened without an active session. Sign in through
            Parent Portal, then come back to <strong>Online Quizzes → Open Host Panel</strong> for
            quiz <strong>{code}</strong>.
          </p>
          <a href="/parent-portal" className="qx-btn qx-btn-primary" style={{ textDecoration: 'none' }}>
            <i className="fa-solid fa-right-to-bracket" /> Go to Parent Portal
          </a>

          <button
            className="qxlogin-advanced-toggle"
            onClick={() => setShowManual(v => !v)}
          >
            {showManual ? 'Hide advanced option' : 'Advanced: enter host identity manually'}
          </button>

          {showManual && (
            <div className="qxlogin-manual">
              <label className="qx-label">Host identity</label>
              <input
                className="qx-input"
                value={manualEmail}
                onChange={e => setManualEmail(e.target.value)}
                placeholder="Must match this quiz's Host Email exactly"
              />
              <button
                className="qx-btn"
                style={{ background: 'var(--qx-surface-2)', color: 'var(--qx-text)' }}
                disabled={!manualEmail.trim()}
                onClick={() => setHostEmail(manualEmail.trim())}
              >
                Continue
              </button>
            </div>
          )}
        </div>
        <style jsx global>{`
          .qxlogin-advanced-toggle {
            background: none; border: none; color: var(--qx-muted); font-size: 12px;
            margin-top: 18px; cursor: pointer; text-decoration: underline;
          }
          .qxlogin-manual { margin-top: 16px; text-align: left; }
        `}</style>
      </div>
    );
  }

  return (
    <>
      <Head><title>Host: Quiz {code}</title></Head>
      <OnlineQuizHost quizCode={String(code).toUpperCase()} hostEmail={hostEmail} />
    </>
  );
}
