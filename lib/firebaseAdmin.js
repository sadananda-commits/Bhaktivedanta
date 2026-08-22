// lib/firebaseAdmin.js
//
// Server-side only — the Firebase Admin SDK, which bypasses every Firestore
// security rule. That's intentional: pages/api/quiz.js is now the ONLY thing
// allowed to write anything, the same authority Code.gs used to have over
// the Quiz System sheet. The browser only ever gets the read-only client SDK
// (lib/firebaseClient.js).
//
// Uses the modular firebase-admin API (firebase-admin/app,
// firebase-admin/firestore) rather than `import admin from 'firebase-admin'`.
// The old namespace-style default import doesn't always survive Next.js's
// bundling of this CommonJS package — admin.apps can come back undefined
// even though the package is installed and working. The modular imports
// below sidestep that interop issue entirely, and also match the style
// already used in lib/firebaseClient.js.
//
// Needs one env var: FIREBASE_SERVICE_ACCOUNT_KEY — the full service account
// JSON, as a single-line string. To get it: Firebase Console -> Project
// Settings (gear icon) -> Service Accounts -> Generate new private key. Take
// the downloaded file's content and set it as this env var, e.g. in
// .env.local:
//   FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...","private_key":"...","client_email":"...", ...}
// (Vercel/other hosts: paste the same single-line JSON into their env var
// settings — don't commit the JSON file itself to your repo.)
//
// One common gotcha: if the JSON was hand-edited or copy-pasted through
// something that touched newlines, the private_key field's escaped "\n"
// sequences can get corrupted. If you see a "Failed to parse private key"
// error instead of the "apps.length" one, that's almost always this —
// re-copy the private_key value straight from the downloaded file.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue as AdminFieldValue } from 'firebase-admin/firestore';

if (!getApps().length) {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_KEY env var — see lib/firebaseAdmin.js for setup.');
  }
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  initializeApp({
    credential: cert(serviceAccount),
  });
}

export const db = getFirestore();
export const FieldValue = AdminFieldValue;
