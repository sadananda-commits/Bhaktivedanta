// pages/quiz.js
//
// Public guest quiz page — no login required. This is what a shared link
// like https://bhaktivedanta.vercel.app/quiz?moduleId=CIT01&subject=Science
// &classLevel=Class%203 opens (see portal.js's copyPublicQuizLink for how
// that link is generated from inside the logged-in portal).
//
// Flow:
//   1. Fetch the one requested chapter via the existing public
//      /api/portal-config API (moduleId+subject+classLevel drill-down —
//      same call portal.js's fetchChapterSteps already makes; nothing new
//      needed server-side for this part).
//   2. Landing screen: chapter info + "Continue as Guest" vs "Sign in".
//        Sign in  → /portal?moduleId=... (portal.js's existing deep-link
//                    effect already resumes straight into this module once
//                    the visitor logs in — see the `deepLinkAppliedRef`
//                    effect in portal.js).
//        Guest    → ask for a name, then play.
//   3. The guest plays the FULL chapter using the exact same
//      LearningModulePlayer component the real student portal uses
//      (imported from components/QuizPlayer.js) — same questions, timer,
//      sounds, fireworks, streaks, review screen. A persistent banner
//      above it reminds them they're in guest mode.
//   4. On completion, we fire a single best-effort POST to
//      /api/guest-lead with {name, moduleId, subject, classLevel, score}
//      so the school can follow up — this never blocks or fails the
//      guest's experience (fire-and-forget, same pattern as portal.js's
//      other best-effort sync calls).
//
// Deliberately does NOT touch any real student's data: onAnswer is a no-op
// (guest answers never get written to the StudentProgress sheet), and
// progress is kept in local React state only, not localStorage.

import Head from 'next/head';
import Script from 'next/script';
import { useRouter } from 'next/router';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { LanguageProvider, useLanguage } from '../lib/i18n';
import { LearningModulePlayer } from '../components/QuizPlayer';
import { PORTAL_CSS } from '../lib/portalStyles';

async function fetchChapterSteps(classLevel, subject, moduleId) {
  const qs = new URLSearchParams({
    classLevel: classLevel || '',
    subject:    subject || '',
    moduleId:   moduleId || '',
  });
  const res = await fetch(`/api/portal-config?${qs.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`portal-config API returned ${res.status}`);
  return res.json();
}

function randomGuestId() {
  return 'guest-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Extra CSS just for this page's own screens (landing / name-entry / guest
// banner). PORTAL_CSS already supplies every ".lp-*" class the quiz player
// itself needs, plus the shared design tokens (--navy, --teal, --fd, --fb,
// etc.) this reuses.
const GUEST_CSS = `
  .gq-shell{min-height:100vh;background:var(--navy);color:var(--text);font-family:var(--fb);display:flex;flex-direction:column;}
  .gq-center{flex:1;display:flex;align-items:center;justify-content:center;padding:24px;}
  .gq-card{max-width:440px;width:100%;background:var(--surf);border:1px solid var(--border);border-radius:var(--r);padding:32px 28px;text-align:center;}
  .gq-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:100px;background:rgba(0,198,167,.12);color:var(--teal);font-size:12px;font-weight:700;letter-spacing:.3px;margin-bottom:14px;}
  .gq-title{font-family:var(--fd);font-size:22px;font-weight:800;margin-bottom:6px;}
  .gq-sub{color:var(--muted);font-size:14px;margin-bottom:24px;}
  .gq-meta{color:var(--muted);font-size:13px;margin-bottom:24px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;}
  .gq-meta span{background:rgba(255,255,255,.05);border:1px solid var(--border);border-radius:100px;padding:3px 10px;}
  .gq-btn{width:100%;padding:14px 20px;border-radius:12px;font-weight:800;font-size:14px;letter-spacing:.2px;cursor:pointer;border:none;margin-bottom:10px;display:flex;align-items:center;justify-content:center;gap:8px;font-family:var(--fb);}
  .gq-btn.primary{background:var(--teal);color:#04241d;}
  .gq-btn.primary:hover{filter:brightness(1.08);}
  .gq-btn.secondary{background:transparent;color:var(--text);border:1px solid var(--border);}
  .gq-btn.secondary:hover{background:rgba(255,255,255,.05);}
  .gq-input{width:100%;padding:13px 16px;border-radius:12px;border:1px solid var(--border);background:rgba(255,255,255,.04);color:var(--text);font-size:15px;margin-bottom:16px;font-family:var(--fb);}
  .gq-input:focus{outline:none;border-color:var(--teal);}
  .gq-err{color:#f87171;font-size:13px;margin-bottom:16px;}
  .gq-banner{position:sticky;top:0;z-index:400;background:linear-gradient(90deg,var(--teal),#00a88d);color:#04241d;padding:10px 18px;display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;font-size:13px;font-weight:700;text-align:center;}
  .gq-banner-cta{background:#04241d;color:#fff;border:none;border-radius:100px;padding:6px 16px;font-weight:800;font-size:12.5px;cursor:pointer;white-space:nowrap;}
  .gq-banner-cta:hover{filter:brightness(1.2);}
  .gq-loading{color:var(--muted);font-size:14px;}
`;

function GuestQuizInner() {
  const router = useRouter();
  const { t } = useLanguage();
  const { moduleId, subject, classLevel } = router.query;

  // stage: loading | notfound | landing | name | quiz
  const [stage, setStage]   = useState('loading');
  const [module, setModule] = useState(null);
  const [steps, setSteps]   = useState(null);

  const [guestName, setGuestName] = useState('');
  const [nameErr, setNameErr]     = useState('');
  const [guestId]                 = useState(randomGuestId);

  const [progress, setProgress] = useState({});
  const leadSentRef = useMemo(() => ({ current: false }), []);

  useEffect(() => {
    if (!router.isReady) return;
    if (!moduleId) { setStage('notfound'); return; }
    let cancelled = false;
    fetchChapterSteps(classLevel, subject, moduleId)
      .then(data => {
        if (cancelled) return;
        const mod = (data.learningModules || [])[0];
        const mySteps = data.learningSteps || [];
        if (!mod || !mySteps.length) { setStage('notfound'); return; }
        setModule(mod);
        setSteps(mySteps);
        setStage('landing');
      })
      .catch(() => { if (!cancelled) setStage('notfound'); });
    return () => { cancelled = true; };
  }, [router.isReady, moduleId, subject, classLevel]);

  // Mirrors portal.js's saveLearnProgress merge exactly (shallow patch merge)
  // — kept in memory only, never localStorage, since a guest has no account
  // to resume into later.
  const saveProgress = useCallback(patch => {
    setProgress(prev => ({ ...prev, ...patch }));
  }, []);

  // Fires once, the moment the guest finishes the chapter. Best-effort and
  // non-blocking — exactly like portal.js's other sync calls (.catch(()=>{})) —
  // a failed lead POST never interrupts or delays the guest's results screen.
  const sendGuestLead = useCallback((finalProgress) => {
    if (leadSentRef.current) return;
    leadSentRef.current = true;
    fetch('/api/guest-lead', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:         guestName,
        moduleId:     moduleId || '',
        chapterTitle: module?.Title || '',
        subject:      subject || '',
        classLevel:   classLevel || '',
        correct:      finalProgress.correct   ?? 0,
        attempted:    finalProgress.attempted ?? 0,
        total:        steps?.length || 0,
      }),
    }).catch(() => {});
  }, [leadSentRef, guestName, moduleId, module, subject, classLevel, steps]);

  useEffect(() => {
    if (progress.completedAt) sendGuestLead(progress);
  }, [progress.completedAt, sendGuestLead]);

  const goSignIn = useCallback(() => {
    const qs = new URLSearchParams({ moduleId: moduleId || '' });
    router.push(`/portal?${qs.toString()}`);
  }, [router, moduleId]);

  // Sends a brand-new visitor to the homepage's enrollment section
  // (index.js has no separate /enroll route — it's the #enroll anchor on
  // "/"). Passing ?resume=<moduleId> lets index.js skip the role picker
  // (guests here are always signing up as Students) and, once enrollment
  // succeeds, send them straight to /portal?moduleId=... instead of the
  // bare dashboard — see index.js's resumeModuleId handling.
  const goEnroll = useCallback(() => {
    const qs = new URLSearchParams({ resume: moduleId || '' });
    router.push(`/?${qs.toString()}#enroll`);
  }, [router, moduleId]);

  const startGuest = useCallback((e) => {
    e.preventDefault();
    const trimmed = guestName.trim();
    if (!trimmed) { setNameErr('Please enter your name to continue.'); return; }
    setNameErr('');
    setGuestName(trimmed);
    setStage('quiz');
  }, [guestName]);

  const scoreLabel = progress.completedAt
    ? `Scored ${progress.correct ?? 0}/${steps?.length ?? 0}`
    : null;

  return (
    <>
      <Head>
        <title>{module ? `${module.Title} — Free Practice Quiz` : 'Take a Free Quiz'}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Poppins:wght@600;700;800;900&display=swap" rel="stylesheet" />
        <style>{PORTAL_CSS}</style>
        <style>{GUEST_CSS}</style>
      </Head>
      <Script src="https://cdn.jsdelivr.net/npm/chart.js" strategy="afterInteractive" />

      <div className="gq-shell">
        {stage === 'loading' && (
          <div className="gq-center"><div className="gq-loading">Loading your quiz…</div></div>
        )}

        {stage === 'notfound' && (
          <div className="gq-center">
            <div className="gq-card">
              <div className="gq-title">Quiz not found</div>
              <div className="gq-sub">This link may be out of date, or the chapter isn't available. Ask whoever shared it for a fresh link, or sign in to browse the full question bank.</div>
              <button className="gq-btn primary" onClick={() => router.push('/portal')}>Go to Sign In</button>
            </div>
          </div>
        )}

        {stage === 'landing' && (
          <div className="gq-center">
            <div className="gq-card">
              <div className="gq-badge"><i className="fa-solid fa-bolt" /> Free Practice Quiz</div>
              <div className="gq-title">{module?.Title || 'Chapter Quiz'}</div>
              <div className="gq-sub">Someone shared this quiz with you — take the whole thing free, no account needed.</div>
              <div className="gq-meta">
                {subject && <span>{subject}</span>}
                {classLevel && <span>{classLevel}</span>}
                <span>{steps?.length || 0} questions</span>
              </div>
              <button className="gq-btn primary" onClick={() => setStage('name')}>
                <i className="fa-solid fa-user" /> Continue as Guest
              </button>
              <button className="gq-btn secondary" onClick={goEnroll}>
                <i className="fa-solid fa-user-plus" /> I'm New — Enroll Free
              </button>
              <button className="gq-btn secondary" onClick={goSignIn}>
                <i className="fa-solid fa-right-to-bracket" /> I Already Have an Account
              </button>
            </div>
          </div>
        )}

        {stage === 'name' && (
          <div className="gq-center">
            <div className="gq-card">
              <div className="gq-title">What's your name?</div>
              <div className="gq-sub">Just so we know who to congratulate.</div>
              <form onSubmit={startGuest}>
                <input
                  className="gq-input"
                  placeholder="Your name"
                  autoFocus
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                />
                {nameErr && <div className="gq-err">{nameErr}</div>}
                <button type="submit" className="gq-btn primary">
                  Start Quiz <i className="fa-solid fa-arrow-right" />
                </button>
              </form>
            </div>
          </div>
        )}

        {stage === 'quiz' && (
          <>
            <div className="gq-banner">
              <span>
                <i className="fa-solid fa-user-clock" /> Guest Mode{scoreLabel ? ` — ${scoreLabel}!` : ` — ${guestName}`}
              </span>
              <button className="gq-banner-cta" onClick={goEnroll}>
                {scoreLabel ? 'Create Free Account' : 'Sign Up For Unlimited Access'}
              </button>
            </div>
            <LearningModulePlayer
              key={moduleId}
              module={module}
              steps={steps}
              progress={progress}
              onSave={saveProgress}
              onAnswer={() => {}}
              onExit={() => router.push('/')}
              backLabel="Back"
              soundConfig={{}}
              timerConfig={{}}
              profile={{ id: guestId, name: guestName, classLevel: classLevel || '' }}
              t={t}
            />
          </>
        )}
      </div>
    </>
  );
}

export default function GuestQuiz() {
  return (
    <LanguageProvider>
      <GuestQuizInner />
    </LanguageProvider>
  );
}
