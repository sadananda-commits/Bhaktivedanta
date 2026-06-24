#!/usr/bin/env node
// sync-sheet.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Run this whenever you update the Google Sheet.
// It reads every tab and updates the LIVE_DATA block in portal-config.js.
//
// Usage:
//   node sync-sheet.mjs
// ─────────────────────────────────────────────────────────────────────────────

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SHEET_ID = '1Br7F9U8MxS67oggsvzZd9duselGt26Eo';
const OUT_FILE = path.join(__dirname, 'pages', 'api', 'portal-config.js');

// Tab names must match exactly what's in your Google Sheet
const TABS = [
  'Settings',
  'Navigation',
  'Dashboard_Stats',
  'Subject_Progress',
  'Attendance_Stats',
  'Attendance_Monthly',
  'Assignments',
  'Schedule',
  'Notifications',
  'Student_Profile',
];

// ── Fetch one tab as CSV ───────────────────────────────────────────────────────
// Uses the gviz endpoint which works with published sheets
async function fetchTab(tabName) {
  // Primary: gviz endpoint (works when sheet is published as CSV)
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' }, // needed for some Google endpoints
  });
  if (res.ok) return res.text();

  // Fallback: pub export endpoint
  const url2 = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/pub?output=csv&gid=0&single=false&sheet=${encodeURIComponent(tabName)}`;
  const res2 = await fetch(url2, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (res2.ok) return res2.text();

  throw new Error(`HTTP ${res.status} for tab "${tabName}". Is the sheet published? (File → Share → Publish to web)`);
}

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  const t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < t.length; i++) {
    const c = t[i], n = t[i + 1];
    if (inQ) {
      if (c === '"' && n === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field.trim()); field = ''; }
      else if (c === '\n') {
        row.push(field.trim());
        if (row.some(f => f !== '')) rows.push(row);
        row = []; field = '';
      } else field += c;
    }
  }
  if (field || row.length) {
    row.push(field.trim());
    if (row.some(f => f !== '')) rows.push(row);
  }
  return rows;
}

// ── Convert rows to objects ───────────────────────────────────────────────────
function rowsToObjects(rows, isKV = false) {
  if (rows.length < 2) return isKV ? {} : [];

  if (isKV) {
    // Settings tab: Row 0 = section banner, Row 1 = column headers, Row 2+ = data
    const obj = {};
    for (let i = 2; i < rows.length; i++) {
      if (rows[i][0]) obj[rows[i][0]] = rows[i][1] ?? '';
    }
    return obj;
  }

  // All other tabs: Row 0 = section banner, Row 1 = headers, Row 2+ = data
  const headers = rows[1];
  return rows.slice(2).filter(r => r[0]).map(r => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
    return obj;
  });
}

// ── Normalise field types ─────────────────────────────────────────────────────
function normalise(row) {
  const r = { ...row };
  const bool = v => ['yes', 'true'].includes(String(v).toLowerCase());
  const num  = v => isNaN(Number(v)) ? 0 : Number(v);
  if ('Active'         in r) r.Active         = bool(r.Active);
  if ('Unread'         in r) r.Unread         = bool(r.Unread);
  if ('Visible'        in r) r.Visible        = bool(r.Visible);
  if ('Order'          in r) r.Order          = num(r.Order);
  if ('Display Order'  in r) r['Display Order']= num(r['Display Order']);
  if ('Progress %'     in r) r['Progress %']  = num(r['Progress %']);
  if ('Attendance %'   in r) r['Attendance %']= num(r['Attendance %']);
  if ('Total Topics'   in r) r['Total Topics']= num(r['Total Topics']);
  if ('Topics Done'    in r) r['Topics Done'] = num(r['Topics Done']);
  return r;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🔄  Syncing Google Sheet → portal-config.js\n');

  // 1. Fetch all tabs
  const csvTexts = await Promise.all(
    TABS.map(async tab => {
      process.stdout.write(`   Fetching: ${tab.padEnd(22)}`);
      try {
        const text = await fetchTab(tab);
        const lineCount = text.split('\n').length;
        console.log(`✓  (${lineCount} rows)`);
        return text;
      } catch (err) {
        console.log(`✗  ${err.message}`);
        throw err;
      }
    })
  );

  // 2. Parse all tabs
  const parsed = csvTexts.map(parseCSV);
  const [sCSV, nCSV, dCSV, sjCSV, asCSV, amCSV, asgCSV, schCSV, ntCSV, prCSV] = parsed;

  const data = {
    settings:      rowsToObjects(sCSV, true),
    navigation:    rowsToObjects(nCSV).map(normalise).filter(r => r.Active).sort((a, b) => a.Order - b.Order),
    dashStats:     rowsToObjects(dCSV).map(normalise).filter(r => r.Active).sort((a, b) => a['Display Order'] - b['Display Order']),
    subjects:      rowsToObjects(sjCSV).map(normalise).filter(r => r.Active).sort((a, b) => a['Display Order'] - b['Display Order']),
    attStats:      rowsToObjects(asCSV).map(normalise).sort((a, b) => a['Display Order'] - b['Display Order']),
    attMonthly:    rowsToObjects(amCSV).map(normalise).sort((a, b) => a['Display Order'] - b['Display Order']),
    assignments:   rowsToObjects(asgCSV).map(normalise).filter(r => r.Active),
    schedule:      rowsToObjects(schCSV).map(normalise).filter(r => r.Active),
    notifications: rowsToObjects(ntCSV).map(normalise).filter(r => r.Active),
    profileFields: rowsToObjects(prCSV).map(normalise).filter(r => r.Visible),
  };

  // 3. Validate we got real data
  const settingCount = Object.keys(data.settings).length;
  if (settingCount < 5) {
    console.error('\n❌  Settings tab returned too few rows — the sheet may not be fully published yet.');
    console.error('    Wait 30 seconds and try again.\n');
    process.exit(1);
  }

  // 4. Update portal-config.js
  if (!fs.existsSync(OUT_FILE)) {
    console.error(`\n❌  Could not find: ${OUT_FILE}`);
    console.error('    Make sure portal-config.js is at pages/api/portal-config.js\n');
    process.exit(1);
  }

  let source = fs.readFileSync(OUT_FILE, 'utf8');

  const START_MARKER = '// @@LIVE_DATA_START@@';
  const END_MARKER   = '// @@LIVE_DATA_END@@';

  if (!source.includes(START_MARKER)) {
    console.error('\n❌  Markers not found in portal-config.js');
    console.error('    Make sure you are using the latest version of portal-config.js\n');
    process.exit(1);
  }

  const timestamp = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
  const newBlock =
    `${START_MARKER}\n` +
    `// Last synced: ${timestamp}\n` +
    `const LIVE_DATA = ${JSON.stringify(data, null, 2)};\n` +
    `${END_MARKER}`;

  source = source.replace(
    new RegExp(`${START_MARKER}[\\s\\S]*?${END_MARKER}`),
    newBlock
  );

  fs.writeFileSync(OUT_FILE, source, 'utf8');

  // 5. Summary
  console.log('\n✅  Sync complete!\n');
  console.log(`   Settings       : ${settingCount} keys`);
  console.log(`   Nav tabs       : ${data.navigation.length}`);
  console.log(`   Stat cards     : ${data.dashStats.length}`);
  console.log(`   Subjects       : ${data.subjects.length}`);
  console.log(`   Attendance     : ${data.attStats.length} stats, ${data.attMonthly.length} months`);
  console.log(`   Assignments    : ${data.assignments.length}`);
  console.log(`   Schedule       : ${data.schedule.length} classes`);
  console.log(`   Notifications  : ${data.notifications.length}`);
  console.log(`   Profile fields : ${data.profileFields.length}`);
  console.log('\n   Restart your dev server to see the changes.\n');
}

main().catch(err => {
  console.error('\n❌  Sync failed:', err.message);
  process.exit(1);
});
