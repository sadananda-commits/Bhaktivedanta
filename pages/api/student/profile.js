// pages/api/student/profile.js
// Updates student account fields (ClassLevel, FullName, Email, Phone, Address)
// and handles password changes. Both go to the Apps Script updateAccount action.

const SCRIPT_URL = process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    studentId, classLevel, fullName, email, phone, address,
    // Password change fields
    currentPassword, newPassword,
  } = req.body || {};

  if (!studentId)
    return res.status(400).json({ success: false, message: 'studentId is required.' });

  // ── Password change ───────────────────────────────────────────────────────
  // If newPassword is sent, we first verify the current password by calling
  // the accounts endpoint, then update the Password field.
  if (newPassword) {
    if (!currentPassword)
      return res.status(400).json({ success: false, message: 'Current password is required.' });
    if (newPassword.length < 6)
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });

    try {
      // Fetch current accounts to verify the current password
      const accountsRes = await fetch(`${SCRIPT_URL}?action=accounts`, {
        signal: AbortSignal.timeout(12000),
      });
      const accountsData = await accountsRes.json();
      const account = (accountsData.accounts || []).find(a =>
        String(a.StudentID || '').trim().toLowerCase() === String(studentId).trim().toLowerCase()
      );
      if (!account)
        return res.status(404).json({ success: false, message: 'Account not found.' });
      if (String(account.Password || '').trim() !== String(currentPassword).trim())
        return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    } catch (err) {
      return res.status(503).json({ success: false, message: 'Could not verify password: ' + err.message });
    }
  }

  // ── Build update params ───────────────────────────────────────────────────
  const params = new URLSearchParams({ action: 'updateAccount', studentId });
  if (classLevel     !== undefined) params.set('ClassLevel', classLevel);
  if (fullName       !== undefined) params.set('FullName',   fullName);
  if (email          !== undefined) params.set('Email',      email);
  if (phone          !== undefined) params.set('Phone',      phone);
  if (address        !== undefined) params.set('Address',    address);
  if (newPassword    !== undefined) params.set('Password',   newPassword);

  try {
    const r = await fetch(`${SCRIPT_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`Script HTTP ${r.status}`);
    const data = await r.json();
    if (data.error)
      return res.status(500).json({ success: false, message: data.error });

    // Bust the auth cache so the next login reads fresh values from the sheet.
    try {
      const authModule = await import('./auth.js');
      authModule.bustCache();
    } catch { /* safe to ignore */ }

    return res.status(200).json({ success: true, updated: data.updated || [] });
  } catch (err) {
    console.error('[profile]', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}
