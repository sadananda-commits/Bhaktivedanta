// pages/api/student/teammeet-sso.js
//
// Issues a short-lived signed token proving a student's identity, then
// redirects the browser to the Team Meet portal, which verifies the token
// (see its src/lib/sso.ts) and signs the student in automatically — no
// second login screen.
//
// GET /api/student/teammeet-sso?studentId=APX262834
//
// SECURITY NOTE: like the existing updateAccount path in profile.js, this
// trusts whatever studentId the browser sends — it does not re-check a
// password. That matches this app's existing trust model (the browser is
// trusted once React state says `authed === true`), but it does mean this
// URL should never be exposed as a bare, guessable link outside the
// authenticated sidebar button — see docs/SSO_BHAKTIVEDANTA.md for more.

import jwt from 'jsonwebtoken';

const SCRIPT_URL = process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

const TEAMMEET_URL    = process.env.TEAMMEET_URL || 'https://teammeet-ashy.vercel.app';
const TEAMMEET_SECRET = process.env.TEAMMEET_SSO_SECRET;

function errorRedirect(res, message) {
  // Sent back into the student's own portal tab with a query param the UI
  // can surface as an alert, instead of stranding them on a bare API error.
  res.writeHead(302, { Location: `/portal?ssoError=${encodeURIComponent(message)}` });
  res.end();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const studentId = String(req.query.studentId || '').trim();
  if (!studentId) return errorRedirect(res, 'Missing studentId.');

  if (!TEAMMEET_SECRET) {
    console.error('[teammeet-sso/student] TEAMMEET_SSO_SECRET is not set.');
    return errorRedirect(res, 'Weekly Scheduler is not configured yet.');
  }

  try {
    const accountsRes = await fetch(`${SCRIPT_URL}?action=accounts`, {
      signal: AbortSignal.timeout(12000),
    });
    const accountsData = await accountsRes.json();
    const account = (accountsData.accounts || []).find(a =>
      String(a.StudentID || '').trim().toLowerCase() === studentId.toLowerCase()
    );

    if (!account) return errorRedirect(res, 'Account not found.');

    // Prefer a real email if the student has one on file; otherwise use a
    // stable placeholder tied to their StudentID. This is never emailed
    // anywhere — Team Meet only uses it as an internal account identifier,
    // so a student without an email on file still gets a working, stable
    // Team Meet account rather than being blocked.
    const email = String(account.Email || '').trim() ||
      `student-${studentId.toLowerCase()}@bhaktivedanta.local`;
    const name = String(account.FullName || '').trim() || studentId;

    const token = jwt.sign(
      { email, name, role: 'student', sourceId: studentId },
      TEAMMEET_SECRET,
      { algorithm: 'HS256', expiresIn: '2m', issuer: 'bhaktivedanta-portal', audience: 'team-meet-portal' }
    );

    res.writeHead(302, { Location: `${TEAMMEET_URL}/api/sso/bhaktivedanta?token=${encodeURIComponent(token)}` });
    res.end();
  } catch (err) {
    console.error('[teammeet-sso/student]', err.message);
    return errorRedirect(res, 'Could not connect to the account service.');
  }
}
