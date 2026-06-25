// pages/api/portal-config.js
//
// ═══════════════════════════════════════════════════════════════════════════
//  CONFIGURATION-DRIVEN SHEET LOADER  —  v2 (Class-Aware)
//  ─────────────────────────────────────────────────────────────────────────
//  All subjects, chapters, and questions are loaded dynamically from Google
//  Sheets. No subject names, class levels, chapter names, or Module IDs are
//  ever hardcoded here.
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

// ── normalizeClass ────────────────────────────────────────────────────────────
// Accepts any reasonable class string and returns a canonical "Class N" form.
// Examples: "class3", "3", "Class 3", "CLASS3" → "Class 3"
// Returns null if the input cannot be resolved to a known class.
const KNOWN_CLASSES = ['Class 1','Class 2','Class 3','Class 4','Class 5'];

function normalizeClass(raw) {
  if (!raw) return null;
  const s = String(raw).trim();

  // Already canonical: "Class 1" … "Class 5"
  if (KNOWN_CLASSES.includes(s)) return s;

  // Extract trailing digit(s): "class3", "Class3", "3", "KG" → null
  const m = s.match(/(\d+)$/);
  if (m) {
    const candidate = `Class ${m[1]}`;
    if (KNOWN_CLASSES.includes(candidate)) return candidate;
  }

  // Edge-cases seen in the wild (CLASS_TO_AGE map in portal.js)
  const aliases = {
    'class1':'Class 1','class2':'Class 2','class3':'Class 3',
    'class4':'Class 4','class5':'Class 5',
    'kg':'Class 1', // KG treated as Class 1 — adjust if your school differs
  };
  const candidate = aliases[s.toLowerCase()];
  if (candidate) return candidate;

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

  // Resolve and normalise the requested class level
  const rawClass      = req.query.classLevel || '';
  const requestedClass = normalizeClass(rawClass); // null = no filter / unrecognised
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

    // ── Fetch the two master config tabs in parallel ─────────────────────────
    // v2: "Class Subject Map" is the primary tab (replaces both old tabs).
    // Fallback to legacy "Subject Sheet Map" + "Assignment Subjects" if the
    // new tab doesn't exist yet, so the migration is non-breaking.
    const [classSubjectMap, legacySubjectSheetMap, legacyAssignmentSubjects] = await Promise.all([
      fetchTab(MASTER_SHEET_ID, 'Class Subject Map'),
      fetchTab(MASTER_SHEET_ID, 'Subject Sheet Map'),
      fetchTab(MASTER_SHEET_ID, 'Assignment Subjects'),
    ]);

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

    const payload = { assignmentSubjects, learningModules, learningSteps };

    // ── Store in cache ────────────────────────────────────────────────────────
    RESPONSE_CACHE.set(cacheKey, { data: payload, expiresAt: Date.now() + CACHE_TTL_MS });

    res.status(200).json(payload);

  } catch (err) {
    console.error('[portal-config] ✗ Unexpected error:', err);
    res.status(200).json({ assignmentSubjects: [], learningModules: [], learningSteps: [] });
  }
}
