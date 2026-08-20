// pages/api/proxy-doc.js
// ─────────────────────────────────────────────────────────────────────────────
// Server-side proxy that fetches the plain-text export of a public Google Doc.
//
// Why a proxy?  The Google Doc export URL (…/export?format=txt) does not set
// CORS headers, so a browser fetch would be blocked. By routing through this
// Next.js API route the request is made server-to-server — no CORS issue.
//
// Usage:
//   GET /api/proxy-doc?url=<encoded-google-doc-export-url>
//
// The caller (index.js / portal.js) converts the edit URL to the export URL
// before calling this endpoint:
//   docUrl.replace(/\/edit.*$/, '/export?format=txt')
//
// Security:
//   • Only requests whose URL starts with https://docs.google.com/ are allowed.
//   • The response is streamed as plain text — no HTML is ever returned to
//     the client from this endpoint.
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  let decoded;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    return res.status(400).json({ error: 'Invalid url encoding' });
  }

  // Security: only allow Google Docs export URLs
  if (!decoded.startsWith('https://docs.google.com/')) {
    return res.status(403).json({ error: 'Only Google Docs URLs are permitted' });
  }

  try {
    const upstream = await fetch(decoded, {
      headers: {
        // Identify as a server-side request — some Google endpoints vary
        // their response based on the user-agent.
        'User-Agent': 'VedantaAcademy-AnnouncementFetcher/1.0',
      },
      // Follow redirects (Google may redirect the export URL once)
      redirect: 'follow',
    });

    if (!upstream.ok) {
      console.warn(`[proxy-doc] Upstream returned ${upstream.status} for ${decoded}`);
      return res.status(upstream.status).json({ error: `Upstream error: ${upstream.status}` });
    }

    const text = await upstream.text();

    // Cache for 5 minutes — announcements don't change by the second, and
    // this avoids hammering Google on every page load.
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(text);
  } catch (err) {
    console.error('[proxy-doc] Fetch failed:', err.message);
    return res.status(500).json({ error: 'Failed to fetch document' });
  }
}
