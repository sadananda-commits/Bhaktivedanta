// pages/api/parent/auth.js
//
// Authenticates a parent or teacher against the ParentTeacher tab in the
// same Google Sheet used by the student portal. Same Apps Script URL,
// different action param: `?action=ptAuth`.
//
// The Apps Script handler for ptAuth should:
//   1. Read the ParentTeacher tab (columns below).
//   2. Find the row where Username or Email matches the submitted identifier.
//   3. Return { authenticated: true, id, fullName, role, linkedStudentIDs }
//      on password match, or { authenticated: false, message } otherwise.
//
// Expected ParentTeacher tab column layout (tell the sheet owner to use
// exactly these headers — case-sensitive):
//
//   ID | FullName | Email | Username | Password | Role | LinkedStudentIDs | Active
//
//   ID              – unique identifier, e.g. PT001, PT002
//   FullName        – display name shown in the portal header
//   Email           – for contact / future notifications
//   Username        – login identifier (e.g. priya.mehta)
//   Password        – plain text for now (same pattern as student portal)
//   Role            – exactly "Parent" or "Teacher"
//   LinkedStudentIDs– comma-separated student IDs this person may view,
//                     e.g.  APX262834,APX310021
//                     Teachers who should see ALL students: use the
//                     special value  *  (asterisk) — the API will handle it.
//   Active          – TRUE/FALSE; omit or leave blank to default to active.

const SCRIPT_URL = process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

// Cache parent/teacher accounts for 5 minutes — same TTL as student auth.
let ptCache   = null;
let ptCacheAt = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getPTAccounts() {
  if (ptCache && Date.now() - ptCacheAt < CACHE_TTL) return ptCache;
  const url = `${SCRIPT_URL}?action=ptAuth`;
  const res  = await fetch(url, { signal: AbortSignal.timeout(12000) });
  const raw  = await res.text();
  const data = JSON.parse(raw);
  if (data.error) throw new Error(data.error);
  if (!Array.isArray(data.accounts))
    throw new Error(`ptAuth: no accounts array. Keys: ${Object.keys(data).join(', ')}`);
  ptCache   = data.accounts;
  ptCacheAt = Date.now();
  return ptCache;
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { username = '', password = '' } = req.body || {};
  if (!username.trim() || !password.trim())
    return res.status(400).json({ authenticated: false, message: 'Username and password are required.' });

  let accounts;
  try {
    accounts = await getPTAccounts();
  } catch (err) {
    console.error('[parent/auth]', err.message);
    if (ptCache) { accounts = ptCache; }
    else return res.status(503).json({
      authenticated: false,
      message: 'Auth service unavailable. Please try again shortly.',
    });
  }

  const input = username.trim().toLowerCase();
  const account = accounts.find(r =>
    (r.Username && r.Username.trim().toLowerCase() === input) ||
    (r.Email    && r.Email.trim().toLowerCase()    === input)
  );

  if (!account)
    return res.status(401).json({ authenticated: false, message: 'Invalid credentials.' });

  const activeVal = String(account.Active || '').trim().toLowerCase();
  if (['false', 'no', '0'].includes(activeVal))
    return res.status(401).json({ authenticated: false, message: 'Account inactive. Contact the academy.' });

  if (!safeEqual(String(account.Password || ''), password.trim()))
    return res.status(401).json({ authenticated: false, message: 'Invalid credentials.' });

  // Parse LinkedStudentIDs — "*" means the teacher can see all students.
  const raw = String(account.LinkedStudentIDs || '').trim();
  const linkedStudentIDs = raw === '*' ? ['*'] :
    raw.split(',').map(s => s.trim()).filter(Boolean);

  return res.status(200).json({
    authenticated:   true,
    id:              account.ID       || '',
    fullName:        account.FullName || account.Username || username,
    role:            account.Role     || 'Parent',
    linkedStudentIDs,
  });
}
