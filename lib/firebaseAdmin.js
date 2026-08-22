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
// ── Setting the credentials (do this, not raw JSON in .env.local) ─────────
// Pasting the raw service-account JSON directly into a .env file is fragile
// — quotes, colons, and the "\n" sequences inside private_key all get
// mangled differently depending on the editor/shell (this bit a lot of
// people on Windows specifically). Base64-encoding the whole file sidesteps
// that completely, since a base64 string has no special characters at all.
//
// 1. Download the service account JSON: Firebase Console -> Project
//    Settings (gear icon) -> Service Accounts -> Generate new private key.
// 2. Base64-encode it.
//      PowerShell:
//        $json = Get-Content -Raw .\serviceAccountKey.json
//        [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($json))
//      macOS/Linux:
//        base64 -i serviceAccountKey.json | tr -d '\n'
// 3. Put the output (one long line, no quotes needed) in .env.local:
//      FIREBASE_SERVICE_ACCOUNT_KEY_BASE64=eyJ0eXBlIjoic2VydmljZV9hY2NvdW50Iiwi...
//    (Vercel/other hosts: paste the same base64 string into their env var
//    settings — don't commit the JSON file itself to your repo.)
//
// Raw JSON in FIREBASE_SERVICE_ACCOUNT_KEY still works as a fallback below
// (e.g. hosts where you paste multi-line values into a dashboard field
// without shell/file quoting getting involved at all), but base64 is the
// recommended path — use it if you hit any JSON.parse error here.

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
      throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON — this usually means quotes or "\\n" sequences got mangled when it was pasted into .env.local. Switch to FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 instead (see lib/firebaseAdmin.js for the exact command) — it avoids this entirely.');
    }
  }
  throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 (or FIREBASE_SERVICE_ACCOUNT_KEY) env var — see lib/firebaseAdmin.js for setup.');
}

if (!getApps().length) {
  const serviceAccount = loadServiceAccount();
  initializeApp({
    credential: cert(serviceAccount),
  });
}

export const db = getFirestore();
export const FieldValue = AdminFieldValue;
