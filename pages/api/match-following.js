// pages/api/match-following.js
//
// Fetches "Match the Following" question sets from the "Match The Following"
// tab of the master config sheet (same MASTER_SHEET_ID used by
// portal-config.js), and returns them shaped for the MatchTheFollowing
// component.
//
// GET /api/match-following?moduleId=LM_MTF01
//   -> { set: { moduleId, title, instructions, pairs: [{id,left,right}, ...] } }
//
// GET /api/match-following?classLevel=Class 6&subject=English Grammar
//   -> { sets: [ {moduleId, title, ...}, ... ] }   (list, no pairs expanded,
//        for a chapter picker — call again with moduleId to get the pairs)
//
// SHEET TAB: "Match The Following"  (in MASTER_SHEET_ID)
// See MATCH_THE_FOLLOWING_SHEET_FORMAT.md for the full column spec.

const MASTER_SHEET_ID = '1GMW16KYN9IFHecNu06vnf5vrA8vqePJeff261bhmDrs';
const TAB_NAME = 'Match The Following';

const cache = {}; // keyed by '' (all rows) -> { rows, at }
const CACHE_TTL = 60 * 1000; // 60s, matches portal-config.js convention

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"')            inQuotes = false;
      else                            field += ch;
    } else {
      if      (ch === '"')  inQuotes = true;
      else if (ch === ',')  { row.push(field); field = ''; }
      else if (ch === '\r') { /* skip */ }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else                  field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map(h => h.trim());
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.every(c => (c || '').trim() === '')) continue;
    const obj = {};
    headers.forEach((h, i) => { if (h) obj[h] = (cells[i] !== undefined ? cells[i] : '').trim(); });
    out.push(obj);
  }
  return out;
}

async function fetchRows() {
  if (cache.data && Date.now() - cache.at < CACHE_TTL) return cache.data;

  const url = `https://docs.google.com/spreadsheets/d/${MASTER_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(TAB_NAME)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = await r.arrayBuffer();
  const text = new TextDecoder('utf-8').decode(buf);
  if (text.trimStart().startsWith('<')) {
    throw new Error('Sheet not shared, or "Match The Following" tab missing — share as "Anyone with the link -> Viewer"');
  }
  const rows = rowsToObjects(parseCSV(text));
  cache.data = rows;
  cache.at = Date.now();
  return rows;
}

// Turns one wide sheet row into { moduleId, title, instructions, class,
// subject, displayOrder, active, pairs: [{id,left,right}] } — reads
// "Left 1"/"Right 1" through "Left 10"/"Right 10", skipping any pair
// left fully blank (so sets with fewer than 10 pairs also work).
function rowToSet(row) {
  const pairs = [];
  for (let n = 1; n <= 10; n++) {
    const left = (row[`Left ${n}`] || '').trim();
    const right = (row[`Right ${n}`] || '').trim();
    if (!left && !right) continue;
    pairs.push({ id: String(n), left, right });
  }
  return {
    moduleId: row['Module ID'] || '',
    title: row['Set Title'] || '',
    instructions: row['Instructions'] || 'Drag each meaning on the right onto its matching word.',
    class: row['Class'] || '',
    subject: row['Subject'] || '',
    displayOrder: Number(row['Display Order'] || 0),
    active: row['Active'] !== 'FALSE',
    pairs,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { moduleId, classLevel, subject } = req.query;

  try {
    const rows = await fetchRows();
    const activeRows = rows.filter(r => r['Active'] !== 'FALSE');

    if (moduleId) {
      const row = activeRows.find(r => r['Module ID'] === moduleId);
      if (!row) return res.status(200).json({ set: null, _error: 'moduleId not found' });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ set: rowToSet(row) });
    }

    let filtered = activeRows;
    if (classLevel) filtered = filtered.filter(r => (r['Class'] || '') === classLevel || !r['Class']);
    if (subject)    filtered = filtered.filter(r => (r['Subject'] || '') === subject);

    const sets = filtered
      .sort((a, b) => (Number(a['Display Order']) || 999) - (Number(b['Display Order']) || 999))
      .map(rowToSet)
      .map(({ pairs, ...meta }) => meta); // list view: strip pairs, keep metadata only

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ sets });

  } catch (err) {
    console.error('[match-following]', err.message);
    return res.status(200).json({ set: null, sets: [], _error: err.message });
  }
}
