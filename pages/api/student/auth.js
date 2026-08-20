// pages/api/student/auth.js

const SCRIPT_URL = process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

let _cache = null;
let _cacheAt = 0;
const TTL = 5 * 60 * 1000;

export function bustCache() {
  _cache = null;
  _cacheAt = 0;
}

async function getAccounts() {
  if (_cache && Date.now() - _cacheAt < TTL) return _cache;
  const res  = await fetch(`${SCRIPT_URL}?action=accounts`, { signal: AbortSignal.timeout(12000) });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  if (!Array.isArray(data.accounts)) throw new Error('No accounts array returned');
  _cache   = data.accounts;
  _cacheAt = Date.now();
  return _cache;
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
    accounts = await getAccounts();
  } catch (err) {
    console.error('[auth] getAccounts failed:', err.message);
    if (_cache) { accounts = _cache; }
    else return res.status(503).json({ authenticated: false, message: 'Auth service unavailable.' });
  }

  const input   = username.trim().toLowerCase();
  const account = accounts.find(r =>
    (r.Username  && r.Username.trim().toLowerCase()  === input) ||
    (r.StudentID && r.StudentID.trim().toLowerCase() === input)
  );

  if (!account)
    return res.status(401).json({ authenticated: false, message: 'Invalid username or password.' });

  const active = String(account.Active || '').trim().toLowerCase();
  if (['false', 'no', '0'].includes(active))
    return res.status(401).json({ authenticated: false, message: 'Account is inactive.' });

  if (!safeEqual(String(account.Password || ''), password.trim()))
    return res.status(401).json({ authenticated: false, message: 'Invalid username or password.' });

  // Log raw account columns — visible in Vercel function logs
  console.log('[auth] RAW ACCOUNT ROW for', input, ':', JSON.stringify({ ...account, Password: '***' }));

  const classLevel = account.ClassLevel || account['Class Level'] || account.Class || '';

  console.log('[auth] classLevel resolved to:', JSON.stringify(classLevel));

  return res.status(200).json({
    authenticated: true,
    studentId:  account.StudentID  || '',
    username:   account.Username   || username,
    fullName:   account.FullName   || account.DisplayName || account.StudentName || username,
    // Return exactly what the sheet has. Empty string = not set yet.
    // The portal detects blank and shows a "please set your class" prompt.
    // Never default to 'Class 3' here — that's what caused the bug all along.
    classLevel: classLevel,
  });
}
