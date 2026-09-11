// lib/firebaseAdmin.js
//
// Server-side only — the Firebase Admin SDK, which bypasses every Firestore
// security rule. That's intentional: pages/api/quiz.js is the only thing
// allowed to write anything, and pages/api/quiz-leaderboard.js reads through
// here so it isn't subject to the public client-SDK rules either. The
// browser only ever gets the read-only client SDK (lib/firebaseClient.js).
//
// Uses the modular firebase-admin API (firebase-admin/app,
// firebase-admin/firestore) rather than `import admin from 'firebase-admin'`.
// The old namespace-style default import doesn't always survive Next.js's
// bundling of this CommonJS package — admin.apps can come back undefined
// even though the package is installed and working. The modular imports
// below sidestep that interop issue entirely, and also match the style
// already used in lib/firebaseClient.js.
//
// ── Setting the credentials — three supported paths, checked in order ─────
// 1. FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 (recommended) — the whole service
//    account JSON, base64-encoded, so quotes/colons/"\n" sequences inside
//    private_key never get mangled by an editor or shell.
//      macOS/Linux:   base64 -i serviceAccountKey.json | tr -d '\n'
//      PowerShell:    $json = Get-Content -Raw .\serviceAccountKey.json
//                     [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($json))
// 2. FIREBASE_SERVICE_ACCOUNT_KEY — the raw JSON pasted as-is. Works on
//    hosts where the dashboard field handles multi-line values cleanly, but
//    prefer option 1 if you hit a JSON.parse error here.
// 3. FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY —
//    the three fields pulled out individually, for setups where the three
//    separate env vars are already configured. FIREBASE_PRIVATE_KEY must
//    have its literal "\n" sequences converted back to real newlines below,
//    since most dashboards (including Vercel) store multi-line values with
//    "\n" as two literal characters rather than an actual line break.
//
// Get the source JSON from: Firebase Console -> Project Settings (gear icon)
// -> Service Accounts -> Generate new private key. Don't commit that file.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue as AdminFieldValue } from 'firebase-admin/firestore';

function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64) {
    const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString('utf8');
    try {
      return JSON.parse(json);
    } catch (err) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 didn\'t decode to valid JSON — re-generate it from the original downloaded file (see lib/firebaseAdmin.js for the exact command).');
    }
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    } catch (err) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON — this usually means quotes or "\\n" sequences got mangled when it was pasted in. Switch to FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 instead (see lib/firebaseAdmin.js for the exact command) — it avoids this entirely.');
    }
  }

  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    return {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Vercel stores \n as literal characters — convert them back to real newlines.
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
  }

  throw new Error('Missing Firebase service account credentials — set FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 (recommended), FIREBASE_SERVICE_ACCOUNT_KEY, or all three of FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY. See lib/firebaseAdmin.js for setup.');
}

if (!getApps().length) {
  const serviceAccount = loadServiceAccount();
  initializeApp({
    credential: cert(serviceAccount),
  });
}

export const db = getFirestore();
export const FieldValue = AdminFieldValue;
