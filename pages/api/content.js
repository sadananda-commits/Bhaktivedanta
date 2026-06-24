// pages/api/content.js
// Fetches landing page CMS from Script 2 (School Project sheet)

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzeEdY7SPqM5y7wLapl34XUWQ5jUbcjaqbrBtZh_QKLbUvwRX8WtBHZjO16kZ9LLyi1/exec';

let cache   = null;
let cacheAt = 0;
const TTL   = 15 * 1000; // 15s — fast enough to feel live

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  if (cache && Date.now() - cacheAt < TTL) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cache);
  }

  try {
    const r = await fetch(SCRIPT_URL, { signal: AbortSignal.timeout(12000) });

    if (r.status === 403) {
      // Script 2 deployed with "Only myself" — must redeploy with "Anyone"
      console.error('[content] 403 — Redeploy Script 2: Deploy → Manage deployments → pencil → Who has access: Anyone → New version → Deploy');
      if (cache) { res.setHeader('X-Cache', 'STALE'); return res.status(200).json(cache); }
      // Return source:'sheets' with empty arrays so index.js still renders fallback gracefully
      return res.status(200).json({ source: 'sheets', _error: '403_redeploy_needed',
        hero:{}, about:[], classes:[], subjects:[], schedules:[], fees:[],
        testimonials:[], teachers:[], faqs:[], contact:{} });
    }

    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (data.error) throw new Error(data.error);

    // Ensure source flag is set so index.js accepts the data
    data.source = 'sheets';

    cache   = data;
    cacheAt = Date.now();
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(cache);

  } catch (err) {
    console.error('[content]', err.message);
    if (cache) { res.setHeader('X-Cache', 'STALE'); return res.status(200).json(cache); }
    return res.status(200).json({ source: 'fallback', error: err.message });
  }
}
