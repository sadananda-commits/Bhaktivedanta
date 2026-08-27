// pages/api/parent/teammeet-sso.js
//
// Issues a short-lived signed token proving a parent/teacher's identity,
// then redirects the browser to the Team Meet portal, which verifies the
// token (see its src/lib/sso.ts) and signs them in automatically.
//
// GET /api/parent/teammeet-sso?id=PT001
//
// SECURITY NOTE: same trust model as pages/api/student/teammeet-sso.js —
// see the note there, and docs/SSO_BHAKTIVEDANTA.md.

import jwt from 'jsonwebtoken';

const SCRIPT_URL = process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

const TEAMMEET_URL    = process.env.TEAMMEET_URL || 'https://teammeet-ashy.vercel.app';
const TEAMMEET_SECRET = process.env.TEAMMEET_SSO_SECRET;

function errorRedirect(res, message) {
  res.writeHead(302, { Location: `/parent-portal?ssoError=${encodeURIComponent(message)}` });
  res.end();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const id = String(req.query.id || '').trim();
  if (!id) return errorRedirect(res, 'Missing id.');

  if (!TEAMMEET_SECRET) {
    console.error('[teammeet-sso/parent] TEAMMEET_SSO_SECRET is not set.');
    return errorRedirect(res, 'Weekly Scheduler is not configured yet.');
  }

  try {
    // Same accounts source auth.js already uses for ptAuth — see that
    // file's header comment for the ParentTeacher tab's column layout.
    const accountsRes = await fetch(`${SCRIPT_URL}?action=ptAuth`, {
      signal: AbortSignal.timeout(12000),
    });
    const accountsData = await accountsRes.json();
    const account = (accountsData.accounts || []).find(a =>
      String(a.ID || '').trim().toLowerCase() === id.toLowerCase()
    );

    if (!account) return errorRedirect(res, 'Account not found.');

    const email = String(account.Email || '').trim() ||
      `pt-${id.toLowerCase()}@bhaktivedanta.local`;
    const name = String(account.FullName || account.Username || '').trim() || id;
    const role = String(account.Role || '').trim().toLowerCase() === 'teacher' ? 'teacher' : 'parent';

    const token = jwt.sign(
      { email, name, role, sourceId: id },
      TEAMMEET_SECRET,
      { algorithm: 'HS256', expiresIn: '2m', issuer: 'bhaktivedanta-portal', audience: 'team-meet-portal' }
    );

    res.writeHead(302, { Location: `${TEAMMEET_URL}/api/sso/bhaktivedanta?token=${encodeURIComponent(token)}` });
    res.end();
  } catch (err) {
    console.error('[teammeet-sso/parent]', err.message);
    return errorRedirect(res, 'Could not connect to the account service.');
  }
}
