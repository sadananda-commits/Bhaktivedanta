// pages/api/debug-sheets.js
//
// TEMPORARY DEBUG ENDPOINT — visit /api/debug-sheets to diagnose question loading.
// Remove this file once everything is working correctly.
//
// Shows for every subject:
//   • Whether the tab is reachable
//   • Raw headers (spot typos / extra spaces)
//   • Row counts and Active flag breakdown
//   • Module ID cross-check (steps with no matching module)

// ── Read MASTER_SHEET_ID from portal-config ───────────────────────────────────
const MASTER_SHEET_ID = '19lL5AnvxYlIoZfgkUPMrtDLZkXiK_z9CfrSWmJlLYek';

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

async function fetchTabDebug(sheetId, tabName) {
  const url = csvUrl(sheetId, tabName);
  const result = {
    url, tabName, httpStatus: null, error: null,
    isHtmlResponse: false, headers: null,
    totalRows: 0, activeRows: 0, inactiveRows: 0,
    first2Rows: [], sampleActive: [],
  };
  try {
    const res = await fetch(url);
    result.httpStatus = res.status;
    if (!res.ok) {
      result.error = `HTTP ${res.status} — tab may not exist or sheet may not be shared`;
      return result;
    }
    const text = new TextDecoder('utf-8').decode(await res.arrayBuffer());
    result.rawPreview = text.slice(0, 300);
    if (text.trimStart().startsWith('<')) {
      result.isHtmlResponse = true;
      result.error = 'Google returned HTML — sheet not shared as "Anyone with link → Viewer", OR tab name does not exist';
      return result;
    }
    const rows   = parseCSV(text);
    result.headers = rows[0]?.map(h => `"${h}"`) || [];
    const objects  = rowsToObjects(rows);
    result.totalRows    = objects.length;
    result.activeRows   = objects.filter(o => o.Active === true).length;
    result.inactiveRows = objects.filter(o => o.Active === false).length;
    result.first2Rows   = objects.slice(0, 2);
    result.sampleActive = objects.slice(0, 5).map(o => ({
      'Module ID': o['Module ID'], 'Step Number': o['Step Number'],
      Active: o.Active, Q: (o.Question || '').slice(0, 50),
    }));
    result._objects = objects;
  } catch (err) {
    result.error = err.message;
  }
  return result;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');

  // Step 1: load master config
  const masterMods  = await fetchTabDebug(MASTER_SHEET_ID, 'Assignment Subjects');
  const masterMap   = await fetchTabDebug(MASTER_SHEET_ID, 'Subject Sheet Map');

  const sheetIdBySubject = {};
  (masterMap._objects || [])
    .filter(r => r['Active'] !== false)
    .forEach(r => {
      const name = (r['Subject'] || '').trim();
      const id   = (r['Sheet ID'] || '').trim();
      if (name && id) sheetIdBySubject[name] = id;
    });

  const report = {
    generatedAt: new Date().toISOString(),
    masterConfig: {
      sheetId: MASTER_SHEET_ID,
      assignmentSubjectsTab: { httpStatus: masterMods.httpStatus, error: masterMods.error, rows: masterMods.totalRows, headers: masterMods.headers },
      subjectSheetMapTab:    { httpStatus: masterMap.httpStatus,  error: masterMap.error,  rows: masterMap.totalRows,  headers: masterMap.headers },
      subjectsFound: Object.keys(sheetIdBySubject),
    },
    summary: {},
    subjects: {},
  };

  // Step 2: probe each subject sheet
  for (const [subject, sheetId] of Object.entries(sheetIdBySubject)) {
    const [modR, stepR] = await Promise.all([
      fetchTabDebug(sheetId, 'Learning Modules'),
      fetchTabDebug(sheetId, 'Learning Steps'),
    ]);

    const moduleIds  = new Set((modR._objects || []).map(m => m['Module ID']).filter(Boolean));
    const stepMids   = (stepR._objects || []).map(s => s['Module ID']).filter(Boolean);
    const orphanIds  = [...new Set(stepMids.filter(id => !moduleIds.has(id)))];

    const diag =
      modR.error  ? `❌ Modules tab: ${modR.error}` :
      stepR.error ? `❌ Steps tab: ${stepR.error}` :
      stepR.totalRows === 0 ? '⚠️  Steps tab is empty or unreachable' :
      stepR.activeRows === 0 ? '⚠️  All steps have Active=false — set Active column to TRUE' :
      orphanIds.length > 0 ? `⚠️  Module ID mismatch in steps: ${orphanIds.join(', ')}` :
      '✅  Looks good';

    report.summary[subject] = {
      modulesLoaded: modR.totalRows, stepsLoaded: stepR.totalRows,
      stepsActive: stepR.activeRows, orphanStepIds: orphanIds, diagnosis: diag,
    };
    report.subjects[subject] = {
      sheetId,
      modules: { httpStatus: modR.httpStatus, error: modR.error, headers: modR.headers, totalRows: modR.totalRows, activeRows: modR.activeRows, first2: modR.first2Rows },
      steps:   { httpStatus: stepR.httpStatus, error: stepR.error, headers: stepR.headers, totalRows: stepR.totalRows, activeRows: stepR.activeRows, inactiveRows: stepR.inactiveRows, sampleActive: stepR.sampleActive },
      crossCheck: { moduleIds: [...moduleIds], orphanStepModuleIds: orphanIds },
    };
  }

  res.status(200).json(report);
}
