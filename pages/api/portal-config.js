// pages/api/portal-config.js
//
// ═══════════════════════════════════════════════════════════════════════════
//  CONFIGURATION-DRIVEN SHEET LOADER  —  v2 (Class-Aware)
//  ─────────────────────────────────────────────────────────────────────────
//  All subjects, chapters, and questions are loaded dynamically from Google
//  Sheets. No subject names, class levels, chapter names, or Module IDs are
//  ever hardcoded here.
//
//  WHAT CHANGED IN v4
//  ──────────────────
//  9. Removed the double class-validation. Previously a sheet was mapped to
//     a Class here in "Class Subject Map" AND every row inside that sheet's
//     "Learning Modules"/"Learning Steps" tabs needed its own matching Class
//     cell. Now the mapping row is the single source of truth: every row
//     fetched from a mapped sheet is stamped with that mapping's Class,
//     full stop. Admins no longer need (or should bother with) a Class
//     column inside individual subject sheets at all — just write the
//     questions and map the sheet to a Class + Subject here.
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

// Alternate export URL keyed by gid (tab's internal numeric ID) instead of
// tab name. Used for the "Config" tab: the gviz/tq?sheet=Config endpoint was
// intermittently mangling that tab's export (rows fusing together), while
// this export?format=csv&gid= endpoint reads it cleanly.
const csvUrlByGid = (sheetId, gid) =>
  `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

// gid of the "Config" tab in MASTER_SHEET_ID (find via the tab's URL:
// .../edit#gid=XXXXXXXXX — update this if the tab is ever deleted/recreated,
// since recreating a tab assigns it a new gid).
const CONFIG_TAB_GID = '1195062296';

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

async function fetchTab(sheetId, tabName, overrideUrl) {
  const url = overrideUrl || csvUrl(sheetId, tabName);
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
      fetchTab(MASTER_SHEET_ID, 'Config', csvUrlByGid(MASTER_SHEET_ID, CONFIG_TAB_GID)),
    ]);

    // ── Parse Config tab (Key / Value rows) into a plain object ──────────────
    // Each row: { Key: 'AnnouncementDocUrl', Value: 'https://...' }
    // Keys are trimmed; empty-key rows are skipped.
    //
    // BUGFIX: fetchTab was successfully pulling rows from the "Config" tab
    // (logs showed "✓ 3 rows"), but the extraction below only recognised
    // headers named exactly "Key"/"key" and "Value"/"value". If the sheet's
    // actual header row uses any other spelling/casing (e.g. "Setting",
    // "Name", "Config Key", trailing space, etc.), row['Key'] is always
    // undefined, config ends up with 0 keys, and we log the misleading
    // "empty or not yet present" message even though the tab has real data.
    //
    // Fix: try a wider set of common aliases (case-insensitively), and if
    // none of those match, fall back to treating the first two columns —
    // whatever they're named — as key/value by position. Also log the
    // actual header names whenever this fallback path is needed, so a
    // future mismatch is diagnosable from the logs instead of silent.
    const CONFIG_KEY_ALIASES   = ['key', 'name', 'setting', 'config key', 'configkey', 'parameter', 'field'];
    const CONFIG_VALUE_ALIASES = ['value', 'val', 'config value', 'configvalue', 'setting value'];

    function findAliasedField(row, aliases) {
      const lowerMap = {};
      Object.keys(row).forEach(h => { lowerMap[h.trim().toLowerCase()] = h; });
      for (const alias of aliases) {
        if (lowerMap[alias] !== undefined) return row[lowerMap[alias]];
      }
      return undefined;
    }

    const config = {};
    let usedPositionalFallback = false;
    for (const row of configRows) {
      let keyRaw = findAliasedField(row, CONFIG_KEY_ALIASES);
      let valRaw = findAliasedField(row, CONFIG_VALUE_ALIASES);

      if (keyRaw === undefined) {
        // No recognised header name — fall back to first two columns by
        // position (object key order mirrors the sheet's column order).
        const cols = Object.values(row);
        if (cols.length >= 1) { keyRaw = cols[0]; usedPositionalFallback = true; }
        if (cols.length >= 2 && valRaw === undefined) valRaw = cols[1];
      }

      const key = (keyRaw ?? '').toString().trim();
      const val = (valRaw ?? '').toString().trim();
      if (key) config[key] = val;
    }

    if (Object.keys(config).length) {
      console.log(`[portal-config] ✓ Config tab loaded — keys: ${Object.keys(config).join(', ')}`);
      if (usedPositionalFallback) {
        console.warn(`[portal-config] ⚠ "Config" tab headers weren't named Key/Value — matched by column position instead. Actual headers: ${configRows.length ? Object.keys(configRows[0]).join(', ') : '(none)'}. Rename the columns to "Key" and "Value" to avoid relying on position.`);
      }
    } else if (configRows.length) {
      console.warn(`[portal-config] ⚠ "Config" tab has ${configRows.length} row(s) but none produced a usable key. Actual headers found: ${Object.keys(configRows[0]).join(', ') || '(none)'}. Expected a "Key" column (or one of: ${CONFIG_KEY_ALIASES.join(', ')}) with a non-empty value.`);
    } else {
      console.log('[portal-config] ℹ Config tab is empty or not yet present — skipping.');
    }

    const usingV2 = classSubjectMap.length > 0;

    if (!usingV2) {
      console.warn('[portal-config] ⚠ "Class Subject Map" tab not found — falling back to legacy "Subject Sheet Map" + "Assignment Subjects".');
      console.warn('[portal-config]   Migrate: rename "Subject Sheet Map" → "Class Subject Map" and add Class/Icon/Emoji/Color/Tagline columns.');
      console.warn('[portal-config]   Until then, class-filtering is NOT active (all subjects shown to all classes).');
    }

    // ── Build subject-card list (assignmentSubjects) AND the list of sheets ──
    // to fetch (sheetEntries). v2: derived from classSubjectMap rows filtered
    // by class. v1 fallback: use the old "Assignment Subjects" tab as-is (no
    // class filter).
    //
    // v4 — SINGLE SOURCE OF TRUTH FOR CLASS (no more double validation):
    // Previously a module/step row also needed its OWN "Class" cell (inside
    // the individual subject sheet's "Learning Modules"/"Learning Steps"
    // tabs) to match the requested class — i.e. a sheet had to be mapped to
    // a class here AND every row inside it had to repeat that same class.
    // Since each sheet is already mapped to exactly one Class + Subject in
    // "Class Subject Map" (one sheet per class's subject folder), that
    // second check was redundant. Now every row fetched from a mapped sheet
    // is simply STAMPED with the Class from this mapping row, replacing
    // whatever (if anything) is in the sheet's own Class column. An admin
    // now only has to: (1) write questions in a sheet, (2) map that sheet to
    // a Class + Subject here — nothing inside the sheet needs a Class column
    // at all, and nothing there is re-validated.
    let assignmentSubjects;
    let sheetEntries = []; // { subject, class, sheetId } — one per mapped sheet

    if (usingV2) {
      // Filter classSubjectMap by Active + classMatches
      const activeRows = classSubjectMap
        .filter(row => row['Active'] !== false && classMatches(row['Class'], requestedClass))
        .sort((a, b) => (Number(a['Display Order']) || 999) - (Number(b['Display Order']) || 999));

      // Build sheetEntries — one entry per mapping row (not deduped by
      // subject name alone, since the same subject name can map to a
      // different Sheet ID per class).
      activeRows.forEach(row => {
        const name  = (row['Subject']  || '').trim();
        const id    = (row['Sheet ID'] || '').trim();
        const klass = (row['Class']    || '').trim(); // '' = visible to all classes
        if (name && id) sheetEntries.push({ subject: name, class: klass, sheetId: id });
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
      // Legacy path: use old Assignment Subjects list (no class filter, no
      // per-class sheet — every mapped sheet is treated as visible to all).
      assignmentSubjects = legacyAssignmentSubjects.filter(row => row['Active'] !== false);
      legacySubjectSheetMap
        .filter(row => row['Active'] !== false)
        .forEach(row => {
          const name = (row['Subject'] || '').trim();
          const id   = (row['Sheet ID'] || '').trim();
          if (name && id) sheetEntries.push({ subject: name, class: '', sheetId: id });
        });
    }

    console.log('[portal-config] Sheets to fetch:', sheetEntries.map(e => `${e.subject}${e.class ? ` (${e.class})` : ''}`).join(', ') || '(none)');

    if (sheetEntries.length === 0) {
      console.warn('[portal-config] ⚠ No subjects to load. Check that:');
      console.warn('[portal-config]   (1) The sheet is shared as "Anyone with the link → Viewer"');
      console.warn('[portal-config]   (2) The tab is named exactly "Class Subject Map"');
      console.warn('[portal-config]   (3) MASTER_SHEET_ID is correct:', MASTER_SHEET_ID);
    }

    // ── Fetch every mapped sheet in parallel ─────────────────────────────────
    // Memoised by sheetId+tab so two mapping rows that happen to point at the
    // exact same Sheet ID (e.g. one sheet intentionally shared across two
    // classes) only hit the network once.
    const tabFetchCache = new Map();
    const fetchTabCached = (sheetId, tabName) => {
      const key = `${sheetId}::${tabName}`;
      if (!tabFetchCache.has(key)) tabFetchCache.set(key, fetchTab(sheetId, tabName));
      return tabFetchCache.get(key);
    };

    const results = await Promise.all(
      sheetEntries.flatMap(entry => [
        fetchTabCached(entry.sheetId, 'Learning Modules'),
        fetchTabCached(entry.sheetId, 'Learning Steps'),
      ])
    );

    // ── Stamp every row with its mapping's Class — the mapping is the ONLY
    // place class membership is decided; nothing inside the sheet is
    // re-checked or required to agree with it.
    let learningModules = [];
    let learningSteps   = [];
    sheetEntries.forEach((entry, i) => {
      results[i * 2].forEach(m     => learningModules.push({ ...m, Class: entry.class }));
      results[i * 2 + 1].forEach(s => learningSteps.push({ ...s, Class: entry.class }));
    });

    console.log(`[portal-config] ✓ ${learningModules.length} modules, ${learningSteps.length} steps loaded across ${sheetEntries.length} mapped sheet(s) (class: "${requestedClass || 'all'}")`);

    const payload = { assignmentSubjects, learningModules, learningSteps, classLevels, config };

    // ── Store in cache ────────────────────────────────────────────────────────
    RESPONSE_CACHE.set(cacheKey, { data: payload, expiresAt: Date.now() + CACHE_TTL_MS });

    res.status(200).json(payload);

  } catch (err) {
    console.error('[portal-config] ✗ Unexpected error:', err);
    res.status(200).json({ assignmentSubjects: [], learningModules: [], learningSteps: [], classLevels, config: {} });
  }
}
