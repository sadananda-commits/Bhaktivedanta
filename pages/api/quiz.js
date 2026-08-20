// pages/api/quiz.js
//
// Server-side proxy to the Quiz Apps Script Web App. Keeps the exec URL out
// of client bundles and gives us one place to add rate-limiting / real
// session-based host auth later.
//
// Env var needed (server-only):
//   QUIZ_GAS_URL   — the Apps Script Web App /exec URL from Code.gs
//
// ⚠ TODO (security): hostEmail currently arrives in the request body from
// the client. Code.gs itself re-checks it against the quiz's "Host Email"
// column, so a student can't spoof a teacher who didn't create the quiz —
// but a student COULD spoof a specific teacher's email if they know it.
// Once we can see how the portal's session/auth actually works (cookie,
// JWT, NextAuth, etc.), replace the `hostEmail` passthrough below with the
// email pulled from the verified session, and drop it from the client
// payload entirely. Flagging clearly rather than guessing at your auth
// stack.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const gasUrl = process.env.QUIZ_GAS_URL;
  if (!gasUrl) {
    return res.status(500).json({ error: 'QUIZ_GAS_URL is not configured on the server.' });
  }

  try {
    const upstream = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
    });

    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.error('[api/quiz] Non-JSON response from Apps Script:', text.slice(0, 500));
      return res.status(502).json({ error: 'Quiz backend returned an unexpected response.' });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('[api/quiz] Upstream request failed:', err);
    return res.status(502).json({ error: 'Could not reach quiz backend.' });
  }
}
