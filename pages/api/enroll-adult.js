// pages/api/enroll-adult.js
//
// Self-enrolment for Adults who want access to the Question Bank
// (Danish Tests, Driving Licence Theory Test, Citizenship Test, etc.).
//
// Uses the SAME payload shape as pages/api/enroll.js ({ enrollment, account }),
// so the existing Apps Script doPost needs NO code change — it already writes
// `enrollment` to the Students sheet and `account` to the Accounts sheet.
//
// The account is Active immediately (no admin approval step), because adults
// enrol themselves and only get access to the question bank.
//
// GDPRConsent / GDPRConsentAt: the Apps Script appendRow() auto-creates any
// missing column on the Enrollments tab, so nothing needs adding by hand.
//
// REQUIRED Apps Script change: sendEnrollmentEmail_ is worded for parents
// ("Dear Parent… your child's login") and fires for any enrollment+account
// payload, so it needs an Adult branch — see the patch in the chat reply.

const SCRIPT_URL = process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

const MIN_ADULT_AGE = 18;

function generateAdultId() {
  return `ADT${Math.floor(100000 + Math.random() * 900000)}`;
}

// first.last + 3 random digits. Adults are far more likely than a small class
// to share a name, and the sheet has no uniqueness check, so the suffix avoids
// two people ending up with the same login.
function generateUsername(name) {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '.');
  return `${base}${Math.floor(100 + Math.random() * 900)}`;
}

function generateTempPassword() {
  return `Vedanta@${new Date().getFullYear()}`;
}

function ageFromDob(dob) {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ message: 'Method not allowed' });

  const { fullName, dob, email, gender, phone, gdprConsent } = req.body || {};

  // ── Validation ─────────────────────────────────────────────────────────────
  if (!fullName || !dob || !email || !phone)
    return res.status(400).json({ message: 'Full name, date of birth, email and phone are required.' });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim()))
    return res.status(400).json({ message: 'Please enter a valid email address.' });

  const age = ageFromDob(dob);
  if (age === null)
    return res.status(400).json({ message: 'Please enter a valid date of birth.' });
  if (age < MIN_ADULT_AGE)
    return res.status(400).json({ message: `Adult enrolment is for ages ${MIN_ADULT_AGE}+. Please use the Student option.` });

  // Consent is enforced server-side too — never trust the checkbox alone.
  if (gdprConsent !== true && gdprConsent !== 'true')
    return res.status(400).json({ message: 'You must accept the GDPR consent to continue.' });

  const studentId    = generateAdultId();
  const username     = generateUsername(fullName);
  const tempPassword = generateTempPassword();
  const now          = new Date().toISOString();

  const payload = {
    enrollment: {
      StudentID:     studentId,
      StudentName:   fullName.trim(),
      DOB:           dob,
      Gender:        gender ? String(gender).trim() : '',
      Email:         String(email).trim().toLowerCase(),
      Phone:         String(phone).trim(),
      ClassLevel:    'Adult',          // fixed server-side — never taken from the client
      EnrolledAt:    now,
      Status:        'Active',
      GDPRConsent:   'Yes',
      GDPRConsentAt: now,
    },
    account: {
      // Must EXACTLY match the Accounts sheet headers (same as enroll.js).
      StudentID:  studentId,
      Username:   username,
      Password:   tempPassword,
      FullName:   fullName.trim(),
      ClassLevel: 'Adult',
      Active:     'TRUE',
    },
  };

  try {
    const r = await fetch(SCRIPT_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(15000),
    });

    const raw = await r.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = { raw }; }

    if (!r.ok || data.error)
      return res.status(500).json({ message: data.error || `Script error (${r.status})` });

    return res.status(200).json({ success: true, studentId, username, tempPassword });

  } catch (err) {
    console.error('[enroll-adult]', err.message);
    return res.status(500).json({ message: `Server error: ${err.message}` });
  }
}
