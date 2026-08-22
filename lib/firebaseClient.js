// lib/firebaseClient.js
//
// Browser-side Firestore connection — read-only in practice, since
// firestore.rules denies every client write (all mutations go through
// pages/api/quiz.js instead, using firebase-admin — see lib/firebaseAdmin.js).
// This is what gives the host panel and participant screen realtime updates
// without Pusher: lib/quizFirestore.js wraps onSnapshot listeners against
// this client in the exact subscribeToQuiz()/onConnectionStateChange() shape
// the components already used.
//
// Needs six NEXT_PUBLIC_ env vars — Firebase Console -> Project Settings ->
// General -> "Your apps" -> Web app -> SDK setup and configuration. These
// values are safe to expose in the browser bundle; they only identify the
// project, they don't grant access on their own — firestore.rules is what
// actually controls who can read/write what.
//   NEXT_PUBLIC_FIREBASE_API_KEY
//   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
//   NEXT_PUBLIC_FIREBASE_PROJECT_ID
//   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
//   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
//   NEXT_PUBLIC_FIREBASE_APP_ID
//
// This is a SEPARATE set of env vars from FIREBASE_SERVICE_ACCOUNT_KEY_BASE64
// (used only by lib/firebaseAdmin.js, server-side). It's easy to set up the
// admin side and forget this one — the app will still look "half-working":
// every button click and API call succeeds (those go through the admin-SDK
// API route regardless), but nothing ever updates live on screen, because
// the browser's own Firestore connection was never configured. Also: Next.js
// bakes NEXT_PUBLIC_ values into the browser bundle at build time, so after
// adding/changing them in .env.local you need to fully stop and restart
// `npm run dev` — a hot-reload alone won't pick them up.
//
// The check below fails loudly (in the browser console) instead of silently
// connecting to a blank/broken project if any of the six are missing.

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

if (typeof window !== 'undefined') {
  const missing = Object.entries(firebaseConfig).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    // eslint-disable-next-line no-console
    console.error(
      '[firebaseClient] Missing NEXT_PUBLIC_FIREBASE_* env var(s): ' + missing.join(', ') +
      '. Realtime updates (host/participant screens not updating without a ' +
      'refresh) will look broken until these are set in .env.local AND the ' +
      'dev server is fully restarted (not just hot-reloaded).'
    );
  }
}

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const db = getFirestore(app);
