// pages/api/enroll.js
// Writes new enrolment to Vedanta Academy Students sheet via Apps Script.

const SCRIPT_URL = process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

function generateStudentId() {
  return `APX${Math.floor(100000 + Math.random() * 900000)}`;
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
    studentName, dob, parentName, email, phone,
    emergencyContact, address, classLevel, teacherId,
    timeSlot, subjects, gender, schoolName, learningMode,
  } = req.body;

  if (!studentName || !parentName || !email || !phone || !classLevel)
    return res.status(400).json({ message: 'Missing required fields.' });

  const studentId    = generateStudentId();
  const username     = generateUsername(studentName);
  const tempPassword = generateTempPassword();
  const enrolledAt   = new Date().toISOString();

  const payload = {
    enrollment: {
      StudentID:        studentId,
      StudentName:      studentName,
      DOB:              dob          || '',
      Gender:           gender       || '',
      SchoolName:       schoolName   || '',
      ParentName:       parentName,
      Email:            email,
      Phone:            String(phone),
      EmergencyContact: emergencyContact || '',
      Address:          address      || '',
      ClassLevel:       classLevel,
      TeacherID:        teacherId    || '',
      TimeSlot:         timeSlot     || '',
      LearningMode:     learningMode || '',
      Subjects:         Array.isArray(subjects) ? subjects.join(', ') : (subjects || ''),
      EnrolledAt:       enrolledAt,
      Status:           'Pending',
    },
    account: {
      // These column names must EXACTLY match the Accounts sheet headers.
      StudentID:  studentId,
      Username:   username,
      Password:   tempPassword,
      // FullName — the column the auth API reads for the student's display name
      FullName:   studentName,
      // ClassLevel — the column the auth API reads to set the age group
      ClassLevel: classLevel,
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
    console.error('[enroll]', err.message);
    return res.status(500).json({ message: `Server error: ${err.message}` });
  }
}
