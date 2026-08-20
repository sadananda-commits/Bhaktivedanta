// pages/quiz-host/[code].js
//
// Host control panel. Restricted to the teacher/admin who owns the quiz —
// Code.gs enforces this server-side (Host Email must match), this page
// just needs to know who's asking.
//
// ⚠ TODO: this reads `vedanta_profile` from localStorage (the same key
// portal.js uses) and looks for an `.email` field, since that's the only
// session mechanism visible from portal.js/portal-config.js. If teacher/
// admin login actually lives in a different profile object, a different
// localStorage key, or a real server session/cookie, swap the `hostEmail`
// source below accordingly — everything downstream (OnlineQuizHost) just
// needs a verified email string, it doesn't care where it comes from.

import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Head from 'next/head';
import OnlineQuizHost from '../../components/OnlineQuizHost';

export default function QuizHostPage() {
  const router = useRouter();
  const { code } = router.query;
  const [hostEmail, setHostEmail] = useState(null);
  const [manualEmail, setManualEmail] = useState('');

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('vedanta_profile') || 'null');
      if (saved?.email) setHostEmail(saved.email);
    } catch { /* ignore */ }
  }, []);

  if (!code) return null;

  if (!hostEmail) {
    return (
      <div style={{ maxWidth: 420, margin: '80px auto', padding: 24, color: '#fff' }}>
        <h2>Host Login</h2>
        <p style={{ color: '#94a3b8' }}>
          No teacher/admin session was found automatically. Enter the email this quiz
          was created with (must match the &quot;Host Email&quot; in the Quiz Config sheet).
        </p>
        <input
          value={manualEmail}
          onChange={e => setManualEmail(e.target.value)}
          placeholder="teacher@example.com"
          style={{ width: '100%', padding: 12, borderRadius: 8, marginBottom: 12 }}
        />
        <button
          onClick={() => manualEmail.trim() && setHostEmail(manualEmail.trim())}
          style={{ padding: '10px 20px', borderRadius: 8, background: '#14b8a6', color: '#fff', border: 'none' }}
        >
          Continue
        </button>
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
