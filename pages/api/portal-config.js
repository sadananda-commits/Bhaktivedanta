// pages/api/portal-config.js
//
// ═══════════════════════════════════════════════════════════════════════════
//  CONFIGURATION-DRIVEN SHEET LOADER  —  v2 (Class-Aware)
//  ─────────────────────────────────────────────────────────────────────────
//  All subjects, chapters, and questions are loaded dynamically from Google
//  Sheets. No subject names, class levels, chapter names, or Module IDs are
//  ever hardcoded here.
//
//  WHAT CHANGED IN v3
//  ──────────────────
//  7. NEW "Class Levels" tab — Class | Label | Age | Aliases | Display Order
//     | Active. Class levels (previously hardcoded as Class 1–5 in this file
//     and in portal.js) are now fully sheet-driven. Default ships with 12
//     levels: Class 0–10 + Adult. Add, rename, reorder, or hide a class by
//     editing this one tab — no code changes needed.
//  8. API response now also returns `classLevels` so the client can render
//     class pills/dropdowns dynamically instead of hardcoding them.
//
//  WHAT CHANGED IN v2
//  ──────────────────
//  1. Master tab renamed: "Subject Sheet Map" → "Class Subject Map"
//     New columns: Class | Icon | Emoji | Color (Hex) | Tagline | Display Order
//     (replaces both old "Assignment Subjects" and "Subject Sheet Map" tabs)
//  2. Each subject sheet's "Learning Modules" tab now has a Class column.
//  3. Each subject sheet's "Learning Steps" tab now has a Class column
//     (denormalised — avoids a JS join on every render).
//  4. ?classLevel= query param: pass the student's class to get a
//     pre-filtered payload. Omit (or pass an unrecognised value) to receive
//     everything — used by admin views and the "set your class" onboarding.
//  5. Server-side response cache (60-second TTL per class level) — the old
//     code had NO caching and fired 2×n Sheet fetches on every page load.
//  6. Blank Class cell = "visible to all classes" (migration backcompat).
//     Rows tagged with a specific class are shown only to that class.
//
//  MASTER CONFIG SHEET — the only hardcoded ID in this file.
//  All Sheet IDs for individual subjects live in its "Class Subject Map" tab.
// ═══════════════════════════════════════════════════════════════════════════

const MASTER_SHEET_ID = '1GMW16KYN9IFHecNu06vnf5vrA8vqePJeff261bhmDrs';

// ── Response cache ────────────────────────────────────────────────────────────
// Key: canonical class string (or '' for unfiltered). Value: { data, expiresAt }.
// 60-second TTL — short enough for near-live sheet edits, long enough to
// eliminate redundant fetches on fast navigation.
const RESPONSE_CACHE = new Map();
const CACHE_TTL_MS   = 60_000;

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

// ── Class Levels (SHEET-DRIVEN — v3) ────────────────────────────────────────
// Previously KNOWN_CLASSES + the alias map were hardcoded here and in
// portal.js (CLASS_TO_AGE map). They now live in the "Class Levels" tab of
// the master config sheet, so an admin can add/rename/hide a class level
// without touching code or redeploying.
//
// Tab name: "Class Levels"  (in MASTER_SHEET_ID)
// Columns:
//   Class          — canonical identifier. MUST exactly match the "Class"
//                     column used in "Class Subject Map", "Learning Modules",
//                     and "Learning Steps" (e.g. "Class 0", "Class 1", … ,
//                     "Class 10", "Adult"). This is the value stored on a
//                     student's profile (profile.classLevel).
//   Label          — friendly display name shown in the UI. Defaults to
//                     Class if left blank (e.g. Class="Class 0",
//                     Label="Nursery / KG").
//   Age            — short age-group text shown next to the class badge
//                     (e.g. "8-9 yrs", "18+ yrs"). Optional.
//   Aliases        — comma-separated alternative strings that should resolve
//                     to this Class when passed via ?classLevel=, e.g.
//                     "kg, nursery, 0" all resolve to "Class 0".
//   Display Order  — numeric sort order for pills / dropdowns.
//   Active         — TRUE/FALSE. Uncheck to hide a class without deleting it.
//
// DEFAULT_CLASS_LEVELS below is ONLY a safety net used if the "Class Levels"
// tab is empty or missing (e.g. brand-new deployment before the admin has
// created the tab) — exactly the same graceful-degradation pattern already
// used for "Class Subject Map" above. Once the tab exists and has rows, the
// sheet always wins.
const DEFAULT_CLASS_LEVELS = [
  { Class: 'Class 0',  Label: 'Class 0 (Nursery/KG)', Age: '4-5 yrs',  Aliases: 'kg,nursery,0',  'Display Order': 1,  Active: true },
  { Class: 'Class 1',  Label: 'Class 1',  Age: '5-6 yrs',   Aliases: '1',  'Display Order': 2,  Active: true },
  { Class: 'Class 2',  Label: 'Class 2',  Age: '6-7 yrs',   Aliases: '2',  'Display Order': 3,  Active: true },
  { Class: 'Class 3',  Label: 'Class 3',  Age: '7-8 yrs',   Aliases: '3',  'Display Order': 4,  Active: true },
  { Class: 'Class 4',  Label: 'Class 4',  Age: '8-9 yrs',   Aliases: '4',  'Display Order': 5,  Active: true },
  { Class: 'Class 5',  Label: 'Class 5',  Age: '9-10 yrs',  Aliases: '5',  'Display Order': 6,  Active: true },
  { Class: 'Class 6',  Label: 'Class 6',  Age: '10-11 yrs', Aliases: '6',  'Display Order': 7,  Active: true },
  { Class: 'Class 7',  Label: 'Class 7',  Age: '11-12 yrs', Aliases: '7',  'Display Order': 8,  Active: true },
  { Class: 'Class 8',  Label: 'Class 8',  Age: '12-13 yrs', Aliases: '8',  'Display Order': 9,  Active: true },
  { Class: 'Class 9',  Label: 'Class 9',  Age: '13-14 yrs', Aliases: '9',  'Display Order': 10, Active: true },
  { Class: 'Class 10', Label: 'Class 10', Age: '14-15 yrs', Aliases: '10', 'Display Order': 11, Active: true },
  { Class: 'Adult',    Label: 'Adult',    Age: '18+ yrs',   Aliases: 'adults,adult', 'Display Order': 12, Active: true },
];

// ── buildClassLevels ─────────────────────────────────────────────────────────
// Fetches the "Class Levels" tab and normalises it. Falls back to
// DEFAULT_CLASS_LEVELS if the tab is missing/empty so the portal still works
// on day one, before the admin has created the tab.
async function buildClassLevels() {
  const rows = await fetchTab(MASTER_SHEET_ID, 'Class Levels');
  const active = rows
    .filter(r => r['Active'] !== false && (r['Class'] || '').trim())
    .map(r => ({
      Class:            r['Class'].trim(),
      Label:            (r['Label'] || '').trim() || r['Class'].trim(),
      Age:              (r['Age'] || '').trim(),
      Aliases:          (r['Aliases'] || '').trim(),
      'Display Order':  r['Display Order'] === '' || r['Display Order'] === undefined ? 999 : Number(r['Display Order']),
      Active:           true,
    }))
    .sort((a, b) => (a['Display Order'] || 999) - (b['Display Order'] || 999));

  if (active.length === 0) {
    console.warn('[portal-config] ⚠ "Class Levels" tab not found or empty — using built-in default of 12 classes (Class 0–10 + Adult).');
    console.warn('[portal-config]   To manage classes from the Sheet, add a "Class Levels" tab with columns: Class | Label | Age | Aliases | Display Order | Active');
    return DEFAULT_CLASS_LEVELS;
  }
  return active;
}

// ── normalizeClass ────────────────────────────────────────────────────────────
// Accepts any reasonable class string and returns the canonical Class value
// from classLevels. Examples: "class3", "3", "Class 3", "CLASS3" → "Class 3".
// "adult", "Adults" → "Adult". Returns null if unresolved (caller then treats
// the request as "show everything").
function normalizeClass(raw, classLevels) {
  if (!raw) return null;
  const s = String(raw).trim();
  const sLower = s.toLowerCase();

  // Already canonical, e.g. "Class 3" or "Adult"
  const exact = classLevels.find(c => c.Class.toLowerCase() === sLower);
  if (exact) return exact.Class;

  // Alias match, e.g. "kg", "adults", "10"
  const aliasMatch = classLevels.find(c =>
    (c.Aliases || '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean).includes(sLower)
  );
  if (aliasMatch) return aliasMatch.Class;

  // Trailing-digit match, e.g. "class10", "Class10" → "Class 10"
  const m = s.match(/(\d+)$/);
  if (m) {
    const candidate = classLevels.find(c => c.Class.toLowerCase() === `class ${m[1]}`);
    if (candidate) return candidate.Class;
  }

  return null; // unrecognised → caller treats as "show everything"
}

// ── classMatches ──────────────────────────────────────────────────────────────
// Returns true if a row's Class value is compatible with the requested class.
//   - Blank cell  → visible to ALL classes (migration backcompat).
//   - Exact match → visible to that class only.
function classMatches(rowClass, requestedClass) {
  const rc = (rowClass || '').trim();
  if (!rc) return true;                        // blank = all classes
  if (!requestedClass) return true;            // no filter requested = show everything
  return rc === requestedClass;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store'); // browser must not cache (we cache server-side)

  // Resolve the Class Levels list first (cheap, tiny tab) — needed both to
  // normalise the incoming ?classLevel= param AND to send back to the client
  // so the UI can render class pills/dropdowns without hardcoding them.
  const classLevels = await buildClassLevels();

  // Resolve and normalise the requested class level
  const rawClass      = req.query.classLevel || '';
  const requestedClass = normalizeClass(rawClass, classLevels); // null = no filter / unrecognised
  const cacheKey      = requestedClass || '__all__';

  // ── Serve from cache if still fresh ────────────────────────────────────────
  const cached = RESPONSE_CACHE.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    console.log(`[portal-config] ⚡ Cache hit — "${cacheKey}"`);
    return res.status(200).json(cached.data);
  }

  try {
    console.log('[portal-config] Loading master config from sheet:', MASTER_SHEET_ID);
    if (requestedClass) {
      console.log(`[portal-config] Filtering for class: "${requestedClass}"`);
    } else {
      console.log('[portal-config] No class filter — returning full dataset');
    }

    // ── Fetch the master config tabs (+ Config tab) in parallel ──────────────
    // v2: "Class Subject Map" is the primary tab (replaces both old tabs).
    // Fallback to legacy "Subject Sheet Map" + "Assignment Subjects" if the
    // new tab doesn't exist yet, so the migration is non-breaking.
    const [classSubjectMap, legacySubjectSheetMap, legacyAssignmentSubjects, configRows] = await Promise.all([
      fetchTab(MASTER_SHEET_ID, 'Class Subject Map'),
      fetchTab(MASTER_SHEET_ID, 'Subject Sheet Map'),
      fetchTab(MASTER_SHEET_ID, 'Assignment Subjects'),
      fetchTab(MASTER_SHEET_ID, 'Config'),
    ]);

    // ── Parse Config tab (Key / Value rows) into a plain object ──────────────
    // Each row: { Key: 'AnnouncementDocUrl', Value: 'https://...' }
    // Keys are trimmed; empty-key rows are skipped.
    const config = {};
    for (const row of configRows) {
      const key = (row['Key'] || row['key'] || '').trim();
      const val = (row['Value'] || row['value'] || '').trim();
      if (key) config[key] = val;
    }
    if (Object.keys(config).length) {
      console.log(`[portal-config] ✓ Config tab loaded — keys: ${Object.keys(config).join(', ')}`);
    } else {
      console.log('[portal-config] ℹ Config tab is empty or not yet present — skipping.');
    }

    const usingV2 = classSubjectMap.length > 0;

    if (!usingV2) {
      console.warn('[portal-config] ⚠ "Class Subject Map" tab not found — falling back to legacy "Subject Sheet Map" + "Assignment Subjects".');
      console.warn('[portal-config]   Migrate: rename "Subject Sheet Map" → "Class Subject Map" and add Class/Icon/Emoji/Color/Tagline columns.');
      console.warn('[portal-config]   Until then, class-filtering is NOT active (all subjects shown to all classes).');
    }

    // ── Build subject-card list (assignmentSubjects) ─────────────────────────
    // v2: derived from classSubjectMap rows filtered by class.
    // v1 fallback: use the old "Assignment Subjects" tab as-is (no class filter).
    let assignmentSubjects;
    let sheetIdBySubject = {};

    if (usingV2) {
      // Filter classSubjectMap by Active + classMatches
      const activeRows = classSubjectMap
        .filter(row => row['Active'] !== false && classMatches(row['Class'], requestedClass))
        .sort((a, b) => (Number(a['Display Order']) || 999) - (Number(b['Display Order']) || 999));

      // Warn about rows with no Class tag (migration hint)
      const untagged = classSubjectMap.filter(row => row['Active'] !== false && !(row['Class'] || '').trim());
      if (untagged.length) {
        console.warn(`[portal-config] ⚠ ${untagged.length} rows in "Class Subject Map" have a blank Class — they show to ALL classes. Tag them to enable proper filtering.`);
        untagged.slice(0, 5).forEach(r => console.warn(`[portal-config]   → Subject: "${r['Subject']}"`));
      }

      // Build sheetIdBySubject (deduplicated — multiple class rows pointing at
      // the same Sheet ID is normal; we only need to fetch each sheet once)
      activeRows.forEach(row => {
        const name = (row['Subject'] || '').trim();
        const id   = (row['Sheet ID'] || '').trim();
        if (name && id && !sheetIdBySubject[name]) sheetIdBySubject[name] = id;
      });

      // Build assignmentSubjects for the client (one card per unique subject
      // within the filtered set — pick the first matching row's display props)
      const seen = new Set();
      assignmentSubjects = [];
      activeRows.forEach(row => {
        const name = (row['Subject'] || '').trim();
        if (!name || seen.has(name)) return;
        seen.add(name);
        assignmentSubjects.push({
          Subject:                    name,
          Class:                      (row['Class']  || '').trim(),
          Tagline:                    row['Tagline']  || '',
          'Icon (FontAwesome solid)': row['Icon (FontAwesome solid)'] || 'fa-book',
          Emoji:                      row['Emoji']    || '',
          'Color (Hex)':              row['Color (Hex)'] || '#00c6a7',
          'Display Order':            row['Display Order'] || 99,
          Active:                     true,
        });
      });

    } else {
      // Legacy path: use old Assignment Subjects list (no class filter)
      assignmentSubjects = legacyAssignmentSubjects.filter(row => row['Active'] !== false);
      legacySubjectSheetMap
        .filter(row => row['Active'] !== false)
        .forEach(row => {
          const name = (row['Subject'] || '').trim();
          const id   = (row['Sheet ID'] || '').trim();
          if (name && id) sheetIdBySubject[name] = id;
        });
    }

    const subjects = Object.keys(sheetIdBySubject);
    console.log('[portal-config] Subjects to fetch:', subjects.join(', ') || '(none)');

    if (subjects.length === 0) {
      console.warn('[portal-config] ⚠ No subjects to load. Check that:');
      console.warn('[portal-config]   (1) The sheet is shared as "Anyone with the link → Viewer"');
      console.warn('[portal-config]   (2) The tab is named exactly "Class Subject Map"');
      console.warn('[portal-config]   (3) MASTER_SHEET_ID is correct:', MASTER_SHEET_ID);
    }

    // ── Fetch all subject sheets in parallel ─────────────────────────────────
    const results = await Promise.all(
      subjects.flatMap(name => [
        fetchTab(sheetIdBySubject[name], 'Learning Modules'),
        fetchTab(sheetIdBySubject[name], 'Learning Steps'),
      ])
    );

    let allModules = [];
    let allSteps   = [];
    subjects.forEach((_, i) => {
      allModules = allModules.concat(results[i * 2]);
      allSteps   = allSteps.concat(results[i * 2 + 1]);
    });

    // ── Class-filter modules and steps ───────────────────────────────────────
    // If a class was requested, keep only rows where Class matches or is blank.
    // This is the core fix: previously every student saw ALL modules regardless
    // of their class level.
    const learningModules = requestedClass
      ? allModules.filter(m => classMatches(m['Class'], requestedClass))
      : allModules;

    const learningSteps = requestedClass
      ? allSteps.filter(s => classMatches(s['Class'], requestedClass))
      : allSteps;

    // Warn about untagged modules (helps admins track migration progress)
    if (requestedClass) {
      const untaggedMods = allModules.filter(m => !(m['Class'] || '').trim());
      if (untaggedMods.length) {
        console.warn(`[portal-config] ⚠ ${untaggedMods.length} Learning Module rows have blank Class — visible to all classes. Tag them to restrict by class.`);
      }
    }

    console.log(`[portal-config] ✓ After class filter: ${learningModules.length} modules, ${learningSteps.length} steps (class: "${requestedClass || 'all'}")`);

    const payload = { assignmentSubjects, learningModules, learningSteps, classLevels, config };

    // ── Store in cache ────────────────────────────────────────────────────────
    RESPONSE_CACHE.set(cacheKey, { data: payload, expiresAt: Date.now() + CACHE_TTL_MS });

    res.status(200).json(payload);

  } catch (err) {
    console.error('[portal-config] ✗ Unexpected error:', err);
    res.status(200).json({ assignmentSubjects: [], learningModules: [], learningSteps: [], classLevels, config: {} });
  }
}
