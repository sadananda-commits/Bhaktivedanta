// pages/parent-portal.js
//
// Vedanta Academy — Parent & Teacher Portal
//
// A dedicated read-only portal that lets authorised parents and teachers
// monitor any linked student's learning journey. Built on the same
// LanguageProvider / i18n system as the student portal so the EN/DA toggle
// works here too.
//
// Data flow:
//   1. Login → POST /api/parent/auth   → { fullName, role, linkedStudentIDs }
//   2. Fetch  → POST /api/parent/students → { students: [{ studentId,
//              studentName, classLevel, progress: [...rows] }] }
//   3. All analytics (daily activity, accuracy, subject-wise insights) are
//      derived client-side from the raw progress rows — no extra API calls.
//
// Analytics derived from StudentProgress rows (one row per answered question):
//   Date, Subject, Topic, ModuleID, Status ("correct"/"incorrect"), etc.

import Head from 'next/head';
import Script from 'next/script';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { LanguageProvider, useLanguage, LanguageToggle } from '../lib/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// PURE ANALYTICS HELPERS
// All derived from the raw `progress` row array — no backend calls needed.
// ─────────────────────────────────────────────────────────────────────────────

// Normalise Status → boolean. The StudentProgress tab stores "correct" or
// "incorrect" (from portal.js progress.js handler), but also the older
// "Correct"/"Incorrect" capitalisation and even true/false booleans.
function isCorrect(row) {
  const s = String(row.Status || '').toLowerCase();
  return s === 'correct' || s === 'true' || s === '1';
}

// Group rows by ISO date string (YYYY-MM-DD)
function byDate(rows) {
  const map = {};
  rows.forEach(r => {
    const d = (r.Date || r.Timestamp || '').slice(0, 10);
    if (!d) return;
    if (!map[d]) map[d] = [];
    map[d].push(r);
  });
  return map;
}

// Overall summary numbers
function computeSummary(rows) {
  const attempted = rows.length;
  const correct   = rows.filter(isCorrect).length;
  const incorrect = attempted - correct;
  const accuracy  = attempted ? Math.round((correct / attempted) * 100) : 0;
  return { attempted, correct, incorrect, accuracy, error: 100 - accuracy };
}

// Daily activity for the last N days — returns array of { date, attempted, correct, accuracy }
function dailyActivity(rows, days = 30) {
  const grouped = byDate(rows);
  const result  = [];
  for (let i = days - 1; i >= 0; i--) {
    const d   = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const r   = grouped[key] || [];
    const att = r.length;
    const cor = r.filter(isCorrect).length;
    result.push({ date: key, attempted: att, correct: cor,
                  accuracy: att ? Math.round((cor / att) * 100) : 0 });
  }
  return result;
}

// Weekly summary — last N weeks
function weeklyActivity(rows, weeks = 8) {
  const result = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date();
    start.setDate(start.getDate() - (i + 1) * 7);
    const end   = new Date();
    end.setDate(end.getDate() - i * 7);
    const startStr = start.toISOString().slice(0, 10);
    const endStr   = end.toISOString().slice(0, 10);
    const r = rows.filter(row => {
      const d = (row.Date || row.Timestamp || '').slice(0, 10);
      return d >= startStr && d < endStr;
    });
    const att = r.length;
    const cor = r.filter(isCorrect).length;
    result.push({ label: `W${weeks - i}`, attempted: att, correct: cor,
                  accuracy: att ? Math.round((cor / att) * 100) : 0, startStr, endStr });
  }
  return result;
}

// Per-subject analytics
function subjectAnalytics(rows) {
  const map = {};
  rows.forEach(r => {
    const subj = r.Subject || 'Unknown';
    if (!map[subj]) map[subj] = { subject: subj, rows: [] };
    map[subj].rows.push(r);
  });
  return Object.values(map).map(s => {
    const summary = computeSummary(s.rows);
    // Per-topic breakdown within this subject
    const topicMap = {};
    s.rows.forEach(r => {
      const t = r.Topic || r.ModuleID || 'Unknown';
      if (!topicMap[t]) topicMap[t] = [];
      topicMap[t].push(r);
    });
    const topics = Object.entries(topicMap).map(([topic, tr]) => ({
      topic, ...computeSummary(tr),
      needsAttention: tr.length >= 3 && (computeSummary(tr).accuracy < 60),
    })).sort((a, b) => a.accuracy - b.accuracy); // weakest first
    const needsAttention = summary.attempted >= 5 && summary.accuracy < 65;
    return { ...s, ...summary, topics, needsAttention };
  }).sort((a, b) => a.accuracy - b.accuracy); // weakest subjects first
}

// Last activity date
function lastActivityDate(rows) {
  return rows.reduce((latest, r) => {
    const ts = r.Timestamp || r.Date || '';
    return ts > latest ? ts : latest;
  }, '');
}

// ─────────────────────────────────────────────────────────────────────────────
// CHART RENDERER — draws onto a <canvas> using chart.js loaded via CDN
// ─────────────────────────────────────────────────────────────────────────────

function useChart(canvasId, config, deps) {
  const chartRef = useRef(null);
  useEffect(() => {
    const el = document.getElementById(canvasId);
    if (!el || !window.Chart) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    chartRef.current = new window.Chart(el, config);
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

// ─────────────────────────────────────────────────────────────────────────────
// INNER COMPONENT — uses useLanguage so it's inside the LanguageProvider
// ─────────────────────────────────────────────────────────────────────────────

const COLORS = {
  teal:    '#00c6a7',
  accent:  '#f5a623',
  red:     '#ef4444',
  green:   '#22c55e',
  blue:    '#3b82f6',
  purple:  '#a855f7',
  muted:   'rgba(255,255,255,.4)',
  surface: 'rgba(255,255,255,.05)',
  border:  'rgba(255,255,255,.1)',
};

const SUBJECT_COLORS = {
  Science: '#22c55e', Mathematics: '#f97316', 'English Grammar': '#3b82f6',
  'Social Studies': '#eab308', 'General Knowledge': '#a855f7',
  Naturfag: '#22c55e', Matematik: '#f97316',
};
const subjectColor = s => SUBJECT_COLORS[s] || '#00c6a7';

function ParentPortalInner() {
  const { lang, t } = useLanguage();

  // ── Auth state ──────────────────────────────────────────────────────────
  const [authed,   setAuthed]   = useState(false);
  const [ptUser,   setPtUser]   = useState(null); // { fullName, role, linkedStudentIDs }
  const [loginErr, setLoginErr] = useState('');
  const [logging,  setLogging]  = useState(false);

  // ── Data state ───────────────────────────────────────────────────────────
  const [students,    setStudents]    = useState([]); // fetched from /api/parent/students
  const [dataLoading, setDataLoading] = useState(false);
  const [dataErr,     setDataErr]     = useState('');

  // ── UI state ─────────────────────────────────────────────────────────────
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [tab, setTab]     = useState('overview'); // overview | daily | weekly | subjects
  const [period, setPeriod] = useState('30');     // days for daily chart

  // ── Login handler ────────────────────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault();
    setLoginErr(''); setLogging(true);
    const fd = new FormData(e.target);
    try {
      const res  = await fetch('/api/parent/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: fd.get('username'), password: fd.get('password') }),
      });
      const data = await res.json();
      if (data.authenticated) {
        setPtUser(data);
        setAuthed(true);
      } else {
        setLoginErr(data.message || 'Invalid credentials.');
      }
    } catch { setLoginErr('Connection failed. Please try again.'); }
    finally  { setLogging(false); }
  }

  // ── Fetch student data once authenticated ────────────────────────────────
  useEffect(() => {
    if (!authed || !ptUser) return;
    setDataLoading(true); setDataErr('');
    fetch('/api/parent/students', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkedStudentIDs: ptUser.linkedStudentIDs }),
    })
      .then(r => r.json())
      .then(data => {
        setStudents(data.students || []);
        if ((data.students || []).length > 0)
          setSelectedStudentId(data.students[0].studentId);
      })
      .catch(() => setDataErr('Failed to load student data. Please refresh.'))
      .finally(() => setDataLoading(false));
  }, [authed, ptUser]);

  // ── Derived analytics for selected student ───────────────────────────────
  const selectedStudent = useMemo(
    () => students.find(s => s.studentId === selectedStudentId) || null,
    [students, selectedStudentId]
  );
  const rows      = useMemo(() => selectedStudent?.progress || [], [selectedStudent]);
  const summary   = useMemo(() => computeSummary(rows), [rows]);
  const daily     = useMemo(() => dailyActivity(rows, Number(period)), [rows, period]);
  const weekly    = useMemo(() => weeklyActivity(rows, 8), [rows]);
  const subjects  = useMemo(() => subjectAnalytics(rows), [rows]);
  const lastDate  = useMemo(() => lastActivityDate(rows), [rows]);

  // ── Charts ───────────────────────────────────────────────────────────────
  const chartLoaded = useRef(false);
  useEffect(() => { if (window.Chart) chartLoaded.current = true; }, []);

  useChart('pt-daily-chart', {
    type: 'bar',
    data: {
      labels: daily.map(d => d.date.slice(5)), // MM-DD
      datasets: [
        { label: 'Attempted', data: daily.map(d => d.attempted), backgroundColor: 'rgba(0,198,167,.5)', borderRadius: 4 },
        { label: 'Correct',   data: daily.map(d => d.correct),   backgroundColor: 'rgba(34,197,94,.7)', borderRadius: 4 },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#fff', font: { size: 11 } } } },
      scales: { x: { ticks: { color: COLORS.muted, font: { size: 9 } }, grid: { color: COLORS.border } },
                y: { ticks: { color: COLORS.muted },                     grid: { color: COLORS.border } } } },
  }, [daily, tab]);

  useChart('pt-accuracy-chart', {
    type: 'line',
    data: {
      labels: daily.map(d => d.date.slice(5)),
      datasets: [{ label: 'Accuracy %', data: daily.map(d => d.accuracy),
        borderColor: COLORS.teal, backgroundColor: 'rgba(0,198,167,.08)',
        fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: COLORS.teal }],
    },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#fff', font: { size: 11 } } } },
      scales: { x: { ticks: { color: COLORS.muted, font: { size: 9 } }, grid: { color: COLORS.border } },
                y: { min: 0, max: 100, ticks: { color: COLORS.muted, callback: v => v + '%' }, grid: { color: COLORS.border } } } },
  }, [daily, tab]);

  useChart('pt-weekly-chart', {
    type: 'bar',
    data: {
      labels: weekly.map(w => w.label),
      datasets: [
        { label: 'Attempted', data: weekly.map(w => w.attempted), backgroundColor: 'rgba(59,130,246,.6)', borderRadius: 4 },
        { label: 'Correct',   data: weekly.map(w => w.correct),   backgroundColor: 'rgba(34,197,94,.7)', borderRadius: 4 },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#fff', font: { size: 11 } } } },
      scales: { x: { ticks: { color: COLORS.muted }, grid: { color: COLORS.border } },
                y: { ticks: { color: COLORS.muted }, grid: { color: COLORS.border } } } },
  }, [weekly, tab]);

  useChart('pt-subject-chart', {
    type: 'bar',
    data: {
      labels: subjects.map(s => s.subject),
      datasets: [{ label: 'Accuracy %', data: subjects.map(s => s.accuracy),
        backgroundColor: subjects.map(s => subjectColor(s.subject) + 'cc'), borderRadius: 6 }],
    },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { min: 0, max: 100, ticks: { color: COLORS.muted, callback: v => v + '%' }, grid: { color: COLORS.border } },
                y: { ticks: { color: '#fff', font: { size: 11 } }, grid: { display: false } } } },
  }, [subjects, tab]);

  // ── Skeleton loader ──────────────────────────────────────────────────────
  const SK = ({ h = '18px', w = '100%' }) => (
    <div style={{ height: h, width: w, borderRadius: '8px',
      background: 'rgba(255,255,255,.07)', animation: 'ptpulse 1.4s ease-in-out infinite' }} />
  );

  // ── Stat card ────────────────────────────────────────────────────────────
  const StatCard = ({ icon, label, value, color }) => (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`,
      borderRadius: '14px', padding: '20px', textAlign: 'center' }}>
      <div style={{ fontSize: '22px', color: color || COLORS.teal, marginBottom: '8px' }}>
        <i className={`fa-solid ${icon}`} />
      </div>
      <div style={{ fontSize: '28px', fontWeight: 900, color: '#fff', fontFamily: 'var(--fd, serif)', marginBottom: '4px' }}>
        {value}
      </div>
      <div style={{ fontSize: '12px', color: COLORS.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>
        {label}
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <Head>
        <title>Parent & Teacher Portal | Vedanta Academy</title>
        <meta name="robots" content="noindex" />
        <style>{`
          @keyframes ptpulse{0%,100%{opacity:1}50%{opacity:.35}}
          *{box-sizing:border-box;margin:0;padding:0;}
          :root{
            --teal:#00c6a7;--accent:#f5a623;--navy:#0b1120;--surface:rgba(255,255,255,.05);
            --border:rgba(255,255,255,.1);--muted:rgba(255,255,255,.4);
            --fd:'Playfair Display',serif;--fb:'DM Sans',sans-serif;
          }
          body{background:var(--navy);color:#fff;font-family:var(--fb);min-height:100vh;}
          /* Login */
          .ptlw{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
            background:radial-gradient(ellipse 70% 60% at 50% 0%,rgba(0,198,167,.12) 0%,transparent 65%);}
          .ptlb{background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:20px;
            padding:40px;width:100%;max-width:400px;}
          .ptli{width:56px;height:56px;border-radius:16px;background:rgba(0,198,167,.15);
            display:flex;align-items:center;justify-content:center;font-size:24px;color:var(--teal);margin:0 auto 20px;}
          .ptlh{font-family:var(--fd);font-size:26px;font-weight:900;color:#fff;text-align:center;margin-bottom:6px;}
          .ptls{font-size:13px;color:var(--muted);text-align:center;margin-bottom:28px;}
          .ptlf{margin-bottom:16px;}
          .ptll{display:block;font-size:12px;font-weight:700;color:rgba(255,255,255,.6);margin-bottom:6px;letter-spacing:.04em;}
          .ptfw{position:relative;} .ptfi{position:absolute;left:13px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:13px;}
          .ptinp{width:100%;background:rgba(255,255,255,.06);border:1px solid var(--border);border-radius:10px;
            padding:11px 13px 11px 36px;color:#fff;font-family:var(--fb);font-size:13.5px;}
          .ptinp:focus{outline:none;border-color:var(--teal);}
          .ptbtn{width:100%;background:linear-gradient(135deg,var(--teal),#0099cc);border:none;border-radius:10px;
            padding:13px;color:#fff;font-family:var(--fb);font-size:14px;font-weight:700;cursor:pointer;margin-top:8px;
            display:flex;align-items:center;justify-content:center;gap:8px;}
          .pterr{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);border-radius:10px;
            padding:11px;font-size:13px;color:#f87171;margin-top:12px;text-align:center;}
          .ptbk{display:block;text-align:center;margin-top:18px;font-size:12.5px;color:var(--muted);text-decoration:none;}
          .ptbk:hover{color:var(--teal);}
          /* Portal layout */
          .ptlayout{display:flex;min-height:100vh;}
          /* Sidebar */
          .ptsb{width:260px;flex-shrink:0;background:rgba(255,255,255,.025);border-right:1px solid var(--border);
            display:flex;flex-direction:column;padding:24px 16px;}
          .ptsb-logo{display:flex;align-items:center;gap:10px;margin-bottom:28px;padding:0 4px;}
          .ptsb-logo-icon{width:38px;height:38px;border-radius:10px;background:rgba(0,198,167,.15);
            display:flex;align-items:center;justify-content:center;color:var(--teal);font-size:16px;}
          .ptsb-brand{font-family:var(--fd);font-size:16px;font-weight:900;color:#fff;line-height:1.2;}
          .ptsb-brand small{display:block;font-family:var(--fb);font-size:10px;font-weight:600;color:var(--teal);
            text-transform:uppercase;letter-spacing:.06em;}
          .ptsb-user{background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:12px;
            padding:14px;margin-bottom:24px;}
          .ptsb-name{font-weight:700;font-size:14px;color:#fff;margin-bottom:2px;}
          .ptsb-role{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
            color:var(--teal);margin-bottom:10px;}
          .ptsb-sec{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;
            color:var(--muted);margin-bottom:8px;padding:0 4px;}
          .ptsb-student{width:100%;display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:10px;
            border:none;background:transparent;color:rgba(255,255,255,.6);font-family:var(--fb);font-size:13px;
            font-weight:600;cursor:pointer;text-align:left;transition:all .2s;margin-bottom:2px;}
          .ptsb-student:hover{background:rgba(255,255,255,.06);color:#fff;}
          .ptsb-student.active{background:rgba(0,198,167,.12);color:var(--teal);}
          .ptsb-student-av{width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.08);
            display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0;}
          .ptsb-ft{margin-top:auto;padding-top:16px;border-top:1px solid var(--border);}
          .ptsb-logout{width:100%;background:transparent;border:none;color:var(--muted);font-family:var(--fb);
            font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:7px;padding:8px 4px;}
          .ptsb-logout:hover{color:#f87171;}
          /* Main content */
          .ptmain{flex:1;overflow-y:auto;padding:32px;}
          .pt-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:28px;flex-wrap:wrap;}
          .pt-ph{font-family:var(--fd);font-size:26px;font-weight:900;color:#fff;}
          .pt-ps{font-size:13px;color:var(--muted);margin-top:4px;}
          /* Tab nav */
          .pt-tabs{display:flex;gap:4px;background:rgba(255,255,255,.04);border:1px solid var(--border);
            border-radius:12px;padding:4px;margin-bottom:28px;flex-wrap:wrap;}
          .pt-tab{border:none;border-radius:9px;padding:8px 18px;font-family:var(--fb);font-size:13px;
            font-weight:700;cursor:pointer;transition:all .2s;background:transparent;color:var(--muted);}
          .pt-tab.active{background:var(--teal);color:#06231f;}
          /* Stat grid */
          .pt-stat-g{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:16px;margin-bottom:24px;}
          /* Card */
          .pt-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:22px;margin-bottom:20px;}
          .pt-card-t{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;
            color:var(--muted);margin-bottom:16px;display:flex;align-items:center;gap:7px;}
          .pt-cv{height:240px;position:relative;}
          /* Subject rows */
          .pt-subj-row{display:flex;align-items:center;gap:12px;padding:14px 0;
            border-bottom:1px solid rgba(255,255,255,.06);}
          .pt-subj-row:last-child{border-bottom:none;}
          .pt-subj-name{flex:0 0 140px;font-size:14px;font-weight:700;color:#fff;}
          .pt-subj-bar-wrap{flex:1;}
          .pt-subj-bar{height:8px;background:rgba(255,255,255,.07);border-radius:100px;overflow:hidden;}
          .pt-subj-fill{height:100%;border-radius:100px;transition:width .6s ease;}
          .pt-subj-meta{flex:0 0 100px;text-align:right;font-size:12px;color:var(--muted);}
          .pt-warn{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;
            padding:3px 9px;border-radius:100px;background:rgba(245,166,35,.14);color:var(--accent);}
          /* Topic table */
          .pt-topic-t{width:100%;border-collapse:collapse;font-size:13px;}
          .pt-topic-t th{text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;
            letter-spacing:.06em;color:var(--muted);padding:8px 12px;border-bottom:1px solid var(--border);}
          .pt-topic-t td{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.04);color:rgba(255,255,255,.8);}
          .pt-topic-t tr:last-child td{border-bottom:none;}
          .pt-acc-pill{display:inline-block;padding:2px 9px;border-radius:100px;font-weight:700;font-size:11px;}
          .pt-acc-high{background:rgba(34,197,94,.14);color:#4ade80;}
          .pt-acc-mid {background:rgba(245,166,35,.14);color:var(--accent);}
          .pt-acc-low {background:rgba(239,68,68,.14); color:#f87171;}
          /* Empty / loading */
          .pt-empty{text-align:center;color:var(--muted);padding:40px 0;font-size:14px;}
          /* Period selector */
          .pt-period-sel{background:rgba(255,255,255,.06);border:1px solid var(--border);border-radius:8px;
            padding:6px 10px;color:#fff;font-family:var(--fb);font-size:12px;cursor:pointer;}
          /* Mobile */
          .pt-mob-bar{display:none;align-items:center;gap:12px;padding:14px 18px;
            background:rgba(255,255,255,.03);border-bottom:1px solid var(--border);}
          .pt-mob-btn{width:40px;height:40px;border-radius:9px;border:1px solid var(--border);
            background:rgba(255,255,255,.04);color:#fff;font-size:15px;cursor:pointer;
            display:flex;align-items:center;justify-content:center;}
          .ptsb-backdrop{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:40;}
          @media(max-width:768px){
            .ptsb{position:fixed;left:-280px;top:0;bottom:0;z-index:50;transition:left .25s;overflow-y:auto;}
            .ptsb.open{left:0;}
            .ptsb-backdrop.open{display:block;}
            .pt-mob-bar{display:flex;}
            .ptmain{padding:20px 16px;}
            .pt-ph{font-size:20px;}
            .pt-tabs{gap:2px;}
            .pt-tab{padding:7px 12px;font-size:12px;}
          }
        `}</style>
      </Head>
      <Script src="https://cdn.jsdelivr.net/npm/chart.js" strategy="afterInteractive"
        onLoad={() => { chartLoaded.current = true; }} />

      {/* ── LOGIN SCREEN ──────────────────────────────────────────────── */}
      {!authed ? (
        <div className="ptlw">
          <div className="ptlb">
            <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'4px'}}>
              <LanguageToggle />
            </div>
            <div className="ptli"><i className="fa-solid fa-users-between-lines" /></div>
            <h1 className="ptlh">Parent &amp; Teacher Portal</h1>
            <p className="ptls">Sign in to monitor your student's learning journey</p>
            <form onSubmit={handleLogin}>
              <div className="ptlf">
                <label className="ptll">Username or Email</label>
                <div className="ptfw">
                  <i className="fa-solid fa-user ptfi" />
                  <input name="username" required className="ptinp" placeholder="e.g. priya.mehta" />
                </div>
              </div>
              <div className="ptlf">
                <label className="ptll">Password</label>
                <div className="ptfw">
                  <i className="fa-solid fa-lock ptfi" />
                  <input name="password" type="password" required className="ptinp" placeholder="••••••••" />
                </div>
              </div>
              <button type="submit" className="ptbtn" disabled={logging}>
                {logging ? <><i className="fa-solid fa-circle-notch fa-spin" /> Verifying…</>
                         : <><i className="fa-solid fa-right-to-bracket" /> Access Portal</>}
              </button>
              {loginErr && <div className="pterr">⚠ {loginErr}</div>}
            </form>
            <a href="/" className="ptbk"><i className="fa-solid fa-arrow-left" /> Back to Vedanta Academy</a>
          </div>
        </div>

      /* ── AUTHENTICATED PORTAL ────────────────────────────────────────── */
      ) : (
        <MobileSidebarWrapper>
          {({ sbOpen, setSbOpen }) => (
            <div className="ptlayout">
              {/* Backdrop */}
              <div className={`ptsb-backdrop${sbOpen?' open':''}`} onClick={()=>setSbOpen(false)} />

              {/* Sidebar */}
              <aside className={`ptsb${sbOpen?' open':''}`}>
                <div className="ptsb-logo">
                  <div className="ptsb-logo-icon"><i className="fa-solid fa-graduation-cap" /></div>
                  <div className="ptsb-brand">
                    Vedanta Academy
                    <small>{ptUser?.role === 'Teacher' ? 'Teacher Portal' : 'Parent Portal'}</small>
                  </div>
                </div>

                <div className="ptsb-user">
                  <div className="ptsb-name">{ptUser?.fullName}</div>
                  <div className="ptsb-role">{ptUser?.role}</div>
                  <LanguageToggle />
                </div>

                <p className="ptsb-sec">My Students</p>
                <nav>
                  {dataLoading ? (
                    <div style={{padding:'8px 4px'}}><SK h="36px" /></div>
                  ) : students.length === 0 ? (
                    <p style={{fontSize:'12px',color:'var(--muted)',padding:'0 4px'}}>No students linked.</p>
                  ) : students.map(s => (
                    <button key={s.studentId}
                      className={`ptsb-student${selectedStudentId===s.studentId?' active':''}`}
                      onClick={()=>{ setSelectedStudentId(s.studentId); setTab('overview'); setSbOpen(false); }}>
                      <div className="ptsb-student-av"><i className="fa-solid fa-user-graduate" /></div>
                      <div>
                        <div style={{fontWeight:700,color:'inherit'}}>{s.studentName}</div>
                        <div style={{fontSize:'11px',opacity:.6}}>{s.studentId}</div>
                      </div>
                    </button>
                  ))}
                </nav>

                <div className="ptsb-ft">
                  <button className="ptsb-logout" onClick={()=>{ setAuthed(false); setPtUser(null); setStudents([]); }}>
                    <i className="fa-solid fa-power-off" /> Sign Out
                  </button>
                </div>
              </aside>

              {/* Main */}
              <main className="ptmain">
                {/* Mobile top bar */}
                <div className="pt-mob-bar">
                  <button className="pt-mob-btn" onClick={()=>setSbOpen(true)}>
                    <i className="fa-solid fa-bars" />
                  </button>
                  <span style={{fontWeight:700,fontSize:'14px'}}>
                    {selectedStudent?.studentName || 'Select a student'}
                  </span>
                </div>

                {dataLoading && (
                  <div className="pt-empty"><i className="fa-solid fa-circle-notch fa-spin" style={{fontSize:'28px',color:'var(--teal)',marginBottom:'12px',display:'block'}} />Loading student data…</div>
                )}

                {dataErr && (
                  <div style={{background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.25)',borderRadius:'12px',padding:'16px',color:'#f87171',fontSize:'14px'}}>
                    ⚠ {dataErr}
                  </div>
                )}

                {!dataLoading && !dataErr && !selectedStudent && (
                  <div className="pt-empty">
                    <i className="fa-solid fa-users" style={{fontSize:'36px',color:'var(--muted)',display:'block',marginBottom:'12px'}} />
                    No students linked to your account yet.
                  </div>
                )}

                {!dataLoading && selectedStudent && (
                  <>
                    {/* Page header */}
                    <div className="pt-top">
                      <div>
                        <div className="pt-ph">{selectedStudent.studentName}</div>
                        <div className="pt-ps">
                          {selectedStudent.studentId} · {selectedStudent.classLevel || 'Student'}
                          {lastDate && <> · Last active: {new Date(lastDate).toLocaleDateString(lang==='da'?'da-DK':'en-IN',{day:'numeric',month:'short',year:'numeric'})}</>}
                        </div>
                      </div>
                    </div>

                    {/* Tab navigation */}
                    <div className="pt-tabs">
                      {[
                        { id:'overview',     icon:'fa-chart-pie',    label:'Overview'         },
                        { id:'daily',        icon:'fa-calendar-day', label:'Daily Activity'   },
                        { id:'weekly',       icon:'fa-calendar-week',label:'Weekly Trends'    },
                        { id:'subjects',     icon:'fa-book-open',    label:'Subject Insights' },
                        { id:'assignments',  icon:'fa-list-check',   label:'Assignments'      },
                      ].map(tb => (
                        <button key={tb.id} className={`pt-tab${tab===tb.id?' active':''}`} onClick={()=>setTab(tb.id)}>
                          <i className={`fa-solid ${tb.icon}`} style={{marginRight:'6px'}} />{tb.label}
                        </button>
                      ))}
                    </div>

                    {/* ── OVERVIEW TAB ────────────────────────────────── */}
                    {tab==='overview' && (
                      <>
                        {rows.length === 0 ? (
                          <div className="pt-empty">No activity recorded yet for this student.</div>
                        ) : (
                          <>
                            <div className="pt-stat-g">
                              <StatCard icon="fa-list-check"   label="Questions Attempted" value={summary.attempted}                  color={COLORS.teal}   />
                              <StatCard icon="fa-circle-check" label="Correct Answers"      value={summary.correct}                    color={COLORS.green}  />
                              <StatCard icon="fa-circle-xmark" label="Incorrect Answers"    value={summary.incorrect}                  color={COLORS.red}    />
                              <StatCard icon="fa-bullseye"     label="Accuracy"             value={`${summary.accuracy}%`}             color={COLORS.teal}   />
                              <StatCard icon="fa-triangle-exclamation" label="Error Rate"   value={`${summary.error}%`}               color={COLORS.accent} />
                              <StatCard icon="fa-book"         label="Subjects Covered"     value={subjects.length}                    color={COLORS.blue}   />
                            </div>

                            {/* Subject summary bar chart */}
                            <div className="pt-card">
                              <div className="pt-card-t"><i className="fa-solid fa-chart-bar" /> Performance by Subject</div>
                              <div className="pt-cv"><canvas id="pt-subject-chart" /></div>
                            </div>

                            {/* Subjects needing attention */}
                            {subjects.filter(s=>s.needsAttention).length > 0 && (
                              <div className="pt-card" style={{borderColor:'rgba(245,166,35,.3)'}}>
                                <div className="pt-card-t" style={{color:COLORS.accent}}>
                                  <i className="fa-solid fa-triangle-exclamation" /> Subjects Needing Extra Attention
                                </div>
                                {subjects.filter(s=>s.needsAttention).map(s=>(
                                  <div key={s.subject} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 0',borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                                    <div>
                                      <div style={{fontWeight:700,color:'#fff',marginBottom:'3px'}}>{s.subject}</div>
                                      <div style={{fontSize:'12px',color:COLORS.muted}}>{s.attempted} questions · {s.correct} correct</div>
                                    </div>
                                    <span className="pt-acc-pill pt-acc-low">{s.accuracy}%</span>
                                  </div>
                                ))}
                                <div style={{marginTop:'14px',padding:'12px',background:'rgba(245,166,35,.06)',borderRadius:'10px',fontSize:'13px',color:'rgba(255,255,255,.7)',lineHeight:1.7}}>
                                  <strong style={{color:COLORS.accent}}>💡 Recommendation:</strong> Focus extra practice sessions on the highlighted subjects. Review incorrect answers in detail and revisit the foundational topics before moving ahead.
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}

                    {/* ── DAILY ACTIVITY TAB ──────────────────────────── */}
                    {tab==='daily' && (
                      <>
                        <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'16px',gap:'8px',alignItems:'center'}}>
                          <span style={{fontSize:'12px',color:COLORS.muted}}>Show last:</span>
                          {['7','14','30','60'].map(d=>(
                            <button key={d} onClick={()=>setPeriod(d)}
                              style={{padding:'5px 12px',borderRadius:'8px',border:`1px solid ${period===d?COLORS.teal:COLORS.border}`,
                                background:period===d?'rgba(0,198,167,.15)':'transparent',
                                color:period===d?COLORS.teal:'rgba(255,255,255,.6)',fontSize:'12px',fontWeight:700,cursor:'pointer'}}>
                              {d}d
                            </button>
                          ))}
                        </div>

                        <div className="pt-card">
                          <div className="pt-card-t"><i className="fa-solid fa-chart-bar" /> Daily Questions (last {period} days)</div>
                          <div className="pt-cv"><canvas id="pt-daily-chart" /></div>
                        </div>

                        <div className="pt-card">
                          <div className="pt-card-t"><i className="fa-solid fa-chart-line" /> Daily Accuracy Trend</div>
                          <div className="pt-cv"><canvas id="pt-accuracy-chart" /></div>
                        </div>

                        {/* Daily summary table */}
                        <div className="pt-card">
                          <div className="pt-card-t"><i className="fa-solid fa-table" /> Day-by-Day Breakdown</div>
                          <div style={{overflowX:'auto'}}>
                            <table className="pt-topic-t">
                              <thead>
                                <tr>
                                  <th>Date</th><th>Attempted</th><th>Correct</th><th>Incorrect</th><th>Accuracy</th>
                                </tr>
                              </thead>
                              <tbody>
                                {daily.filter(d=>d.attempted>0).reverse().map(d=>(
                                  <tr key={d.date}>
                                    <td>{new Date(d.date).toLocaleDateString(lang==='da'?'da-DK':'en-IN',{day:'numeric',month:'short',year:'numeric'})}</td>
                                    <td>{d.attempted}</td>
                                    <td style={{color:'#4ade80'}}>{d.correct}</td>
                                    <td style={{color:'#f87171'}}>{d.attempted-d.correct}</td>
                                    <td><span className={`pt-acc-pill ${d.accuracy>=75?'pt-acc-high':d.accuracy>=50?'pt-acc-mid':'pt-acc-low'}`}>{d.accuracy}%</span></td>
                                  </tr>
                                ))}
                                {daily.filter(d=>d.attempted>0).length===0 && (
                                  <tr><td colSpan={5} style={{textAlign:'center',color:COLORS.muted,padding:'20px'}}>No activity in this period.</td></tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </>
                    )}

                    {/* ── WEEKLY TRENDS TAB ───────────────────────────── */}
                    {tab==='weekly' && (
                      <>
                        <div className="pt-card">
                          <div className="pt-card-t"><i className="fa-solid fa-chart-bar" /> Weekly Questions (last 8 weeks)</div>
                          <div className="pt-cv"><canvas id="pt-weekly-chart" /></div>
                        </div>

                        <div className="pt-card">
                          <div className="pt-card-t"><i className="fa-solid fa-table" /> Weekly Summary</div>
                          <div style={{overflowX:'auto'}}>
                            <table className="pt-topic-t">
                              <thead>
                                <tr>
                                  <th>Week</th><th>Period</th><th>Attempted</th><th>Correct</th><th>Accuracy</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[...weekly].reverse().map((w,i)=>(
                                  <tr key={i}>
                                    <td style={{fontWeight:700}}>{w.label}</td>
                                    <td style={{fontSize:'12px',color:COLORS.muted}}>{w.startStr} → {w.endStr}</td>
                                    <td>{w.attempted}</td>
                                    <td style={{color:'#4ade80'}}>{w.correct}</td>
                                    <td><span className={`pt-acc-pill ${w.accuracy>=75?'pt-acc-high':w.accuracy>=50?'pt-acc-mid':'pt-acc-low'}`}>{w.attempted?`${w.accuracy}%`:'—'}</span></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </>
                    )}

                    {/* ── SUBJECT INSIGHTS TAB ────────────────────────── */}
                    {tab==='subjects' && (
                      <>
                        {subjects.length === 0 ? (
                          <div className="pt-empty">No subject data available yet.</div>
                        ) : subjects.map(s=>(
                          <div key={s.subject} className="pt-card">
                            {/* Subject header */}
                            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px',flexWrap:'wrap',gap:'8px'}}>
                              <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
                                <div style={{width:'36px',height:'36px',borderRadius:'10px',
                                  background:`${subjectColor(s.subject)}22`,color:subjectColor(s.subject),
                                  display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px',flexShrink:0}}>
                                  <i className="fa-solid fa-book" />
                                </div>
                                <div>
                                  <div style={{fontWeight:800,fontSize:'16px',color:'#fff'}}>{s.subject}</div>
                                  <div style={{fontSize:'12px',color:COLORS.muted}}>{s.attempted} questions attempted</div>
                                </div>
                              </div>
                              <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                                {s.needsAttention && <span className="pt-warn"><i className="fa-solid fa-triangle-exclamation" /> Needs Focus</span>}
                                <span className={`pt-acc-pill ${s.accuracy>=75?'pt-acc-high':s.accuracy>=50?'pt-acc-mid':'pt-acc-low'}`} style={{fontSize:'14px',padding:'4px 12px'}}>{s.accuracy}%</span>
                              </div>
                            </div>

                            {/* Accuracy bar */}
                            <div className="pt-subj-bar" style={{marginBottom:'18px'}}>
                              <div className="pt-subj-fill" style={{width:`${s.accuracy}%`,
                                background:s.accuracy>=75?COLORS.green:s.accuracy>=50?COLORS.accent:COLORS.red}} />
                            </div>

                            {/* Per-stat row */}
                            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(100px,1fr))',gap:'10px',marginBottom:'20px'}}>
                              {[
                                {label:'Attempted',  value:s.attempted,            color:'#fff'        },
                                {label:'Correct',    value:s.correct,              color:'#4ade80'     },
                                {label:'Incorrect',  value:s.incorrect,            color:'#f87171'     },
                                {label:'Accuracy',   value:`${s.accuracy}%`,       color:COLORS.teal   },
                                {label:'Error Rate', value:`${s.error}%`,          color:COLORS.accent },
                              ].map((st,i)=>(
                                <div key={i} style={{textAlign:'center',background:'rgba(255,255,255,.04)',borderRadius:'10px',padding:'12px 8px'}}>
                                  <div style={{fontSize:'18px',fontWeight:800,color:st.color,marginBottom:'2px'}}>{st.value}</div>
                                  <div style={{fontSize:'11px',color:COLORS.muted,fontWeight:600}}>{st.label}</div>
                                </div>
                              ))}
                            </div>

                            {/* Topic breakdown */}
                            {s.topics.length > 0 && (
                              <>
                                <div className="pt-card-t" style={{marginBottom:'10px'}}>
                                  <i className="fa-solid fa-list" /> Topic Breakdown — weakest first
                                </div>
                                <div style={{overflowX:'auto'}}>
                                  <table className="pt-topic-t">
                                    <thead>
                                      <tr><th>Topic</th><th>Attempted</th><th>Correct</th><th>Accuracy</th><th>Status</th></tr>
                                    </thead>
                                    <tbody>
                                      {s.topics.map((tp,i)=>(
                                        <tr key={i}>
                                          <td style={{fontWeight:600,maxWidth:'200px'}}>{tp.topic}</td>
                                          <td>{tp.attempted}</td>
                                          <td style={{color:'#4ade80'}}>{tp.correct}</td>
                                          <td><span className={`pt-acc-pill ${tp.accuracy>=75?'pt-acc-high':tp.accuracy>=50?'pt-acc-mid':'pt-acc-low'}`}>{tp.accuracy}%</span></td>
                                          <td>{tp.needsAttention
                                            ? <span className="pt-warn"><i className="fa-solid fa-flag" /> Focus here</span>
                                            : <span style={{fontSize:'12px',color:'#4ade80'}}><i className="fa-solid fa-check" /> On track</span>}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>

                                {/* Recommendation for this subject */}
                                {s.needsAttention && (
                                  <div style={{marginTop:'16px',padding:'14px',background:'rgba(245,166,35,.06)',borderRadius:'10px',fontSize:'13px',color:'rgba(255,255,255,.75)',lineHeight:1.8}}>
                                    <strong style={{color:COLORS.accent}}>💡 Recommendation for {s.subject}:</strong> The student is scoring below 65% in this subject.
                                    {s.topics.filter(t=>t.needsAttention).length > 0 &&
                                      <> Particular attention is needed on: <strong style={{color:'#fff'}}>{s.topics.filter(t=>t.needsAttention).map(t=>t.topic).join(', ')}</strong>.</>}
                                    {' '}Consider scheduling extra revision sessions and reviewing the explanations for incorrectly-answered questions.
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        ))}
                      </>
                    )}

                    {/* ── ASSIGNMENTS TAB ─────────────────────────────── */}
                    {tab==='assignments' && (() => {
                      const asgns = selectedStudent?.assignments || [];
                      const todayStr = new Date().toISOString().slice(0,10);
                      const mapped = asgns.map(a => {
                        let status = a.Status || 'Not Started';
                        if (!['Completed','Graded','graded','submitted'].includes(status)) {
                          const dueIso = a.DueDate ? new Date(a.DueDate).toISOString().slice(0,10) : null;
                          if (dueIso && dueIso < todayStr) status = 'Overdue';
                        }
                        return { ...a, _status: status };
                      }).sort((a,b) => {
                        const p = {Overdue:0,'Not Started':1,'In Progress':2,Completed:3,graded:4,submitted:3};
                        return (p[a._status]??1) - (p[b._status]??1);
                      });
                      const total     = mapped.length;
                      const completed = mapped.filter(a=>['Completed','graded','submitted','Graded'].includes(a._status)).length;
                      const overdue   = mapped.filter(a=>a._status==='Overdue').length;
                      const pct       = total ? Math.round((completed/total)*100) : 0;
                      if (!total) return (
                        <div className="pt-empty">No assignments found for this student yet.</div>
                      );
                      return (
                        <>
                          <div className="pt-card" style={{marginBottom:'20px'}}>
                            <div className="pt-card-t"><i className="fa-solid fa-chart-pie" /> Assignment Summary</div>
                            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(100px,1fr))',gap:'12px',marginBottom:'16px'}}>
                              {[
                                {label:'Total',      val:total,     color:'#fff'      },
                                {label:'Completed',  val:completed, color:'#4ade80'   },
                                {label:'Overdue',    val:overdue,   color:'#f87171'   },
                                {label:'Completion', val:`${pct}%`, color:COLORS.teal },
                              ].map((s,i)=>(
                                <div key={i} style={{textAlign:'center',background:'rgba(255,255,255,.04)',borderRadius:'10px',padding:'12px 8px'}}>
                                  <div style={{fontSize:'20px',fontWeight:900,color:s.color,marginBottom:'2px'}}>{s.val}</div>
                                  <div style={{fontSize:'11px',color:COLORS.muted,fontWeight:600,textTransform:'uppercase',letterSpacing:'.05em'}}>{s.label}</div>
                                </div>
                              ))}
                            </div>
                            <div style={{background:'rgba(255,255,255,.06)',borderRadius:'8px',overflow:'hidden',height:'10px'}}>
                              <div style={{height:'100%',width:`${pct}%`,background:pct>=75?'#22c55e':pct>=50?'var(--accent)':'#ef4444',transition:'width .6s ease'}} />
                            </div>
                            <div style={{fontSize:'12px',color:COLORS.muted,marginTop:'6px'}}>{completed} of {total} assignments completed</div>
                          </div>
                          <div className="pt-card">
                            <div className="pt-card-t"><i className="fa-solid fa-list-check" /> All Assignments</div>
                            <div style={{overflowX:'auto'}}>
                              <table className="pt-topic-t">
                                <thead>
                                  <tr><th>Title</th><th>Subject</th><th>Due Date</th><th>Difficulty</th><th>Status</th><th>Grade</th></tr>
                                </thead>
                                <tbody>
                                  {mapped.map((a,i)=>{
                                    const sc = {Overdue:'#f87171','Not Started':'rgba(255,255,255,.5)','In Progress':'#60a5fa',Completed:'#4ade80',graded:'#4ade80',submitted:COLORS.teal}[a._status]||COLORS.muted;
                                    return (
                                      <tr key={i}>
                                        <td style={{fontWeight:600,maxWidth:'180px'}}>
                                          {a.Title}
                                          {a.TeacherNotes && <div style={{fontSize:'11px',color:'rgba(0,198,167,.7)',marginTop:'2px',fontStyle:'italic'}}>📝 {a.TeacherNotes}</div>}
                                        </td>
                                        <td>{a.Subject}</td>
                                        <td style={{color:a._status==='Overdue'?'#f87171':COLORS.muted,fontWeight:a._status==='Overdue'?700:400}}>{a.DueDate||'—'}</td>
                                        <td><span style={{fontSize:'11px',padding:'2px 8px',borderRadius:'100px',background:'rgba(255,255,255,.06)',color:COLORS.muted}}>{a.Difficulty||'—'}</span></td>
                                        <td><span style={{fontSize:'12px',fontWeight:700,color:sc}}>{a._status}</span></td>
                                        <td style={{color:'#4ade80',fontWeight:700}}>{a.Grade||'—'}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </>
                )}
              </main>
            </div>
          )}
        </MobileSidebarWrapper>
      )}
    </>
  );
}

// Small wrapper to provide mobile sidebar open/close state via render prop
function MobileSidebarWrapper({ children }) {
  const [sbOpen, setSbOpen] = useState(false);
  return children({ sbOpen, setSbOpen });
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE EXPORT — wrapped in LanguageProvider like the other pages
// ─────────────────────────────────────────────────────────────────────────────
export default function ParentPortal() {
  return (
    <LanguageProvider>
      <ParentPortalInner />
    </LanguageProvider>
  );
}
