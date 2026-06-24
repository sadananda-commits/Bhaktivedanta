// pages/api/enroll-pt.js
//
// Self-registration for Parents and Teachers. Called when someone selects
// "Parent" or "Teacher" on the enrollment form's role picker (Step 0) and
// completes the simplified registration flow.
//
// Writes one row to the ParentTeacher tab in the Vedanta Academy Students
// sheet via the existing Apps Script doPost endpoint. The Apps Script's
// doPost already handles any payload key — we just need to pass the right
// object. Since the ParentTeacher tab needs its own handler, we use a new
// payload key `parentTeacher` that we add to doPost in the Apps Script.
//
// Apps Script doPost update required (add inside doPost):
//   if (payload.parentTeacher) {
//     var ptSheet = ss.getSheetByName('ParentTeacher');
//     if (!ptSheet) return jsonOut({ error: 'ParentTeacher tab not found.' });
//     appendRow(ptSheet, payload.parentTeacher);
//   }
//
// Generated credentials:
//   ID       — PT + 6 random digits  (e.g. PT826341)
//   Username — first.last            (e.g. priya.mehta)
//   Password — Vedanta@YYYY          (year-based temp password)
//
// The account is created with Active: TRUE immediately — no admin approval
// step. The LinkedStudentIDs field is set to blank initially; the admin
// can update the ParentTeacher sheet to link students after reviewing.
// Teachers who need to see all students should have their LinkedStudentIDs
// updated to * by the admin.

const SCRIPT_URL = process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

function generatePTId() {
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `PT${rand}`;
}

function generateUsername(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '.');
}

function generateTempPassword() {
  return `Vedanta@${new Date().getFullYear()}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ message: 'Method not allowed' });

  const {
    role,         // 'Parent' or 'Teacher'
    fullName,     // required
    email,        // required
    phone,        // required
    linkedStudentId, // optional — parent can provide their child's Student ID
    subject,      // optional — teacher's primary subject
    qualification,// optional — teacher's qualification
    address,      // optional
  } = req.body;

  // Validation
  if (!role || !['Parent', 'Teacher'].includes(role))
    return res.status(400).json({ message: 'Role must be Parent or Teacher.' });
  if (!fullName || !email || !phone)
    return res.status(400).json({ message: 'Full name, email and phone are required.' });

  const id           = generatePTId();
  const username     = generateUsername(fullName);
  const tempPassword = generateTempPassword();
  const registeredAt = new Date().toISOString();

  // LinkedStudentIDs: if a parent provides their child's ID, pre-populate it.
  // For teachers, leave blank so the admin assigns via the sheet.
  const linkedStudentIDs = role === 'Parent' && linkedStudentId
    ? String(linkedStudentId).trim()
    : '';

  const ptRow = {
    ID:               id,
    FullName:         fullName.trim(),
    Email:            email.trim().toLowerCase(),
    Username:         username,
    Password:         tempPassword,
    Role:             role,
    LinkedStudentIDs: linkedStudentIDs,
    Active:           'TRUE',
    Phone:            String(phone).trim(),
    Subject:          subject   || '',   // teacher's primary subject (informational)
    Qualification:    qualification || '',
    Address:          address   || '',
    RegisteredAt:     registeredAt,
    // Status flag so admin knows this was self-registered, not manually added
    Source:           'Self-Registered',
  };

  const payload = { parentTeacher: ptRow };

  try {
    console.log('[enroll-pt] Posting to Apps Script, id:', id, 'role:', role);
    const r = await fetch(SCRIPT_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(15000),
    });

    const raw = await r.text();
    console.log('[enroll-pt] Response:', r.status, raw.slice(0, 300));

    let data;
    try { data = JSON.parse(raw); } catch { data = { raw }; }

    if (!r.ok || data.error)
      return res.status(500).json({ message: data.error || `Script error (${r.status})` });

    return res.status(200).json({
      success:  true,
      id,
      username,
      tempPassword,
      role,
      // Note for the client: parent accounts start with no linked students
      // if the child's ID wasn't provided — admin will link them shortly.
      linkedStudentIDs,
      note: role === 'Parent' && !linkedStudentIDs
        ? 'Your account has been created. The academy will link your child\'s profile within 24 hours.'
        : role === 'Teacher'
        ? 'Your account has been created. The academy will configure your student access shortly.'
        : '',
    });

  } catch (err) {
    console.error('[enroll-pt]', err.message);
    return res.status(500).json({ message: `Server error: ${err.message}` });
  }
}
