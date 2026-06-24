// pages/api/portal-config.js
//
// ═══════════════════════════════════════════════════════════════════════════
//  CONFIGURATION-DRIVEN SHEET LOADER
//  ─────────────────────────────────
//  All subjects, chapters and questions are loaded dynamically from Google
//  Sheets. No subject names, class levels, chapter names, or Module IDs are
//  ever hardcoded here.
//
//  To add a new subject:
//    1. Open the Master Config sheet (MASTER_SHEET_ID below).
//    2. Add a row to "Subject Sheet Map" with the subject name and its Sheet ID.
//    3. Add a row to "Assignment Subjects" with display details.
//    4. In the subject's own Google Sheet, add "Learning Modules" and
//       "Learning Steps" tabs with your content.
//    → No code changes needed.
//
//  MASTER CONFIG SHEET — only ID hardcoded in this file.
//  All Sheet IDs for individual subjects live in its "Subject Sheet Map" tab.
// ═══════════════════════════════════════════════════════════════════════════

const MASTER_SHEET_ID = '19lL5AnvxYlIoZfgkUPMrtDLZkXiK_z9CfrSWmJlLYek';

// ── Helpers ───────────────────────────────────────────────────────────────────
const csvUrl = (sheetId, tab) =>
  `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;

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
    headers.forEach((h, i) => {
      if (!h) return;
      let val = (cells[i] !== undefined ? cells[i] : '').trim();
      if      (h === 'Active')                                val = val.toUpperCase() === 'TRUE';
      else if (h === 'Display Order' || h === 'Step Number') val = val === '' ? '' : Number(val);
      obj[h] = val;
    });
    out.push(obj);
  }
  return out;
}

async function fetchTab(sheetId, tabName) {
  const url = csvUrl(sheetId, tabName);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[portal-config] ✗ HTTP ${res.status} — ${sheetId} / "${tabName}"`);
      return [];
    }
    const buf  = await res.arrayBuffer();
    const text = new TextDecoder('utf-8').decode(buf);
    if (text.trimStart().startsWith('<')) {
      console.warn(`[portal-config] ✗ HTML response (sheet not shared or tab missing) — "${tabName}" in ${sheetId}`);
      console.warn(`[portal-config]   Fix: share sheet as "Anyone with the link → Viewer"`);
      console.warn(`[portal-config]   URL: https://docs.google.com/spreadsheets/d/${sheetId}/edit`);
      return [];
    }
    const rows = rowsToObjects(parseCSV(text));
    console.log(`[portal-config] ✓ ${rows.length} rows — "${tabName}" from ${sheetId}`);
    return rows;
  } catch (err) {
    console.warn(`[portal-config] ✗ Fetch error — "${tabName}" in ${sheetId}:`, err.message);
    return [];
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    console.log('[portal-config] Loading master config from sheet:', MASTER_SHEET_ID);

    const [assignmentSubjects, subjectSheetMap] = await Promise.all([
      fetchTab(MASTER_SHEET_ID, 'Assignment Subjects'),
      fetchTab(MASTER_SHEET_ID, 'Subject Sheet Map'),
    ]);

    console.log(`[portal-config] Master config: ${assignmentSubjects.length} subjects, ${subjectSheetMap.length} sheet mappings`);

    if (subjectSheetMap.length === 0) {
      console.warn('[portal-config] ⚠ Subject Sheet Map is empty — questions will fall back to hardcoded data.');
      console.warn('[portal-config]   Check: (1) sheet is shared as "Anyone with the link → Viewer"');
      console.warn('[portal-config]   Check: (2) tab is named exactly "Subject Sheet Map"');
      console.warn('[portal-config]   Check: (3) MASTER_SHEET_ID is correct:', MASTER_SHEET_ID);
      console.warn('[portal-config]   Debug: visit /api/debug-sheets in your browser for full diagnosis');
    }

    // Build subject → sheet ID map
    const sheetIdBySubject = {};
    subjectSheetMap
      .filter(row => row['Active'] !== false)
      .forEach(row => {
        const name = (row['Subject'] || '').trim();
        const id   = (row['Sheet ID'] || '').trim();
        if (name && id) sheetIdBySubject[name] = id;
      });

    const subjects = Object.keys(sheetIdBySubject);
    console.log('[portal-config] Active subjects to load:', subjects.join(', ') || '(none)');

    // Fetch all subjects in parallel
    const results = await Promise.all(
      subjects.flatMap(name => [
        fetchTab(sheetIdBySubject[name], 'Learning Modules'),
        fetchTab(sheetIdBySubject[name], 'Learning Steps'),
      ])
    );

    let learningModules = [];
    let learningSteps   = [];
    subjects.forEach((_, i) => {
      learningModules = learningModules.concat(results[i * 2]);
      learningSteps   = learningSteps.concat(results[i * 2 + 1]);
    });

    console.log(`[portal-config] ✓ Total loaded: ${learningModules.length} modules, ${learningSteps.length} steps`);

    res.status(200).json({ assignmentSubjects, learningModules, learningSteps });

  } catch (err) {
    console.error('[portal-config] ✗ Unexpected error:', err);
    res.status(200).json({ assignmentSubjects: [], learningModules: [], learningSteps: [] });
  }
}
