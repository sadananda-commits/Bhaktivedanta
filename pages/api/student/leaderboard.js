// pages/leaderboard.js
// Standalone, public Community Leaderboard page.
//
// WHY A SEPARATE PAGE (vs. the embedded section on index.js):
// The home page's "Portal Dashboard" (#dashboard) section still shows the
// live stats + top performers summary — that stays as-is. This page is a
// dedicated, linkable, pinnable destination for the full leaderboard
// experience: filters, a podium, points/questions/participants, and a
// day-by-day view of recent activity.
//
// AUTH: intentionally no login/session check anywhere in this file — it
// calls the same two already-public endpoints the home page uses
// (/api/student/leaderboard and /api/portal-stats), neither of which
// require a session. Pin this URL (/leaderboard) as a Utilities row (see
// the FALLBACK.utilities entry added in index.js) and anyone can open it
// directly, logged in or not.
//
// FILTERS — how each one is powered without any backend changes:
//   - Time window (Today / 7d / 30d / 90d / All time) → the `days` query
//     param /api/student/leaderboard already accepts (ALLOWED_DAYS there
//     is {0,1,7,30,90}, matched exactly below).
//   - Subject → the same API response already returns a `bySubject` map
//     alongside `overall`; switching subject just swaps which array we
//     read from client-side, no extra request.
//   - Search → simple client-side name filter.
//   - Sort → by rank, points, questions answered, or accuracy.
//
// POINTS: the API's row shape is described in that file's header comment
// as points-based (pointsScored / maxPoints / accuracy). This page reads
// row.pointsScored defensively — if a given deployment's Apps Script
// hasn't started returning it yet, the Points column/card just hides
// itself instead of showing zeroes.
//
// "RESULTS BY DATE": built from /api/portal-stats's `recentActivity` feed,
// grouped by day. If an activity entry doesn't carry a recognizable date
// field (checked as date/timestamp/at/attemptedAt), it's bucketed under
// "Undated" rather than dropped, and a note is shown suggesting the
// activity log include a date field for a cleaner view.

import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';

const TIME_WINDOWS = [
  { label: 'Today', days: 1 },
  { label: '7 Days', days: 7 },
  { label: '30 Days', days: 30 },
  { label: '90 Days', days: 90 },
  { label: 'All Time', days: 0 },
];

const SORTS = [
  { key: 'rank', label: 'Rank', icon: 'fa-ranking-star' },
  { key: 'points', label: 'Points', icon: 'fa-star' },
  { key: 'attempted', label: 'Questions', icon: 'fa-list-check' },
  { key: 'accuracy', label: 'Accuracy', icon: 'fa-bullseye' },
];

const PAGE_SIZE = 15;
const locale = 'en-IN';
const fmt = (n) => (n ?? 0).toLocaleString(locale);

function relativeDay(dateKey) {
  if (dateKey === 'Undated') return 'Undated';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateKey + 'T00:00:00');
  const diffDays = Math.round((today - d) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}

export default function LeaderboardPage() {
  const [days, setDays]         = useState(0);
  const [subject, setSubject]   = useState('overall');
  const [sortKey, setSortKey]   = useState('rank');
  const [query, setQuery]       = useState('');
  const [page, setPage]         = useState(0);
  const [view, setView]         = useState('ranked'); // 'ranked' | 'byDate'

  const [data, setData]         = useState(null);   // raw /api/student/leaderboard payload
  const [dataErr, setDataErr]   = useState(false);
  const [activity, setActivity] = useState(null);   // portalStats.recentActivity
  const [actErr, setActErr]     = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null); setDataErr(false);
    fetch(`/api/student/leaderboard?days=${days}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setDataErr(true); });
    return () => { cancelled = true; };
  }, [days]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/portal-stats')
      .then(r => r.json())
      .then(d => { if (!cancelled) setActivity(d?.recentActivity || []); })
      .catch(() => { if (!cancelled) setActErr(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { setPage(0); }, [days, subject, sortKey, query, view]);

  const subjects = useMemo(() => data ? Object.keys(data.bySubject || {}) : [], [data]);

  const rawRows = useMemo(() => {
    if (!data) return [];
    return subject === 'overall' ? (data.overall || []) : (data.bySubject?.[subject] || []);
  }, [data, subject]);

  const rows = useMemo(() => {
    const withDerived = rawRows.map((row, i) => {
      const points     = typeof row.pointsScored === 'number' ? row.pointsScored : null;
      const maxPoints   = typeof row.maxPoints === 'number' ? row.maxPoints : null;
      const attempted   = typeof row.attempted === 'number'
        ? row.attempted
        : (row.accuracy ? Math.round((row.correct || 0) / (row.accuracy / 100)) : (row.correct || 0));
      return { ...row, points, maxPoints, attempted, rank: i + 1 };
    });
    const filtered = query.trim()
      ? withDerived.filter(r => (r.studentName || '').toLowerCase().includes(query.trim().toLowerCase()))
      : withDerived;
    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === 'points')    return (b.points ?? -1) - (a.points ?? -1);
      if (sortKey === 'attempted') return b.attempted - a.attempted;
      if (sortKey === 'accuracy')  return (b.accuracy || 0) - (a.accuracy || 0);
      return a.rank - b.rank;
    });
    return sorted;
  }, [rawRows, sortKey, query]);

  const hasPoints = rows.some(r => r.points !== null);

  const summary = useMemo(() => ({
    totalParticipants: rows.length,
    totalQuestions:    rows.reduce((s, r) => s + (r.attempted || 0), 0),
    totalPoints:       hasPoints ? rows.reduce((s, r) => s + (r.points || 0), 0) : null,
    avgAccuracy:       rows.length ? Math.round(rows.reduce((s, r) => s + (r.accuracy || 0), 0) / rows.length) : 0,
  }), [rows, hasPoints]);

  const podium = rows.slice(0, 3);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageClamped = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(pageClamped * PAGE_SIZE, pageClamped * PAGE_SIZE + PAGE_SIZE);

  const activityByDate = useMemo(() => {
    if (!activity) return [];
    const groups = {};
    activity
      .filter(a => subject === 'overall' || !a.subject || a.subject === subject)
      .forEach(a => {
        const raw = a.date || a.timestamp || a.at || a.attemptedAt || null;
        const d = raw ? new Date(raw) : null;
        const key = d && !isNaN(d) ? d.toISOString().slice(0, 10) : 'Undated';
        (groups[key] = groups[key] || []).push(a);
      });
    return Object.entries(groups).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 20);
  }, [activity, subject]);

  const noDatesAtAll = activityByDate.length > 0 && activityByDate.every(([k]) => k === 'Undated');

  return (
    <>
      <Head>
        <title>Community Leaderboard</title>
        <meta name="description" content="See where you rank — filter by subject and time window, track points, questions answered, and daily activity." />
        <meta name="robots" content="index, follow" />
        <style>{`
          *{box-sizing:border-box;margin:0;padding:0;}
          :root{
            --navy:#0a0f2c; --navy-mid:#121a3e; --accent:#f5a623; --accent-light:#ffd280;
            --teal:#00c6a7; --text:#1a1a2e; --muted:#64748b;
            --surface:#fff; --surface-alt:#f8f9fc; --border:#e2e8f0;
            --radius:16px; --shadow:0 4px 24px rgba(10,15,44,.10); --shadow-lg:0 8px 48px rgba(10,15,44,.18);
            --font-d:'Playfair Display',Georgia,serif; --font-b:'DM Sans',system-ui,sans-serif;
          }
          html{scroll-behavior:smooth;}
          body{font-family:var(--font-b);background:var(--navy);color:#fff;-webkit-font-smoothing:antialiased;}

          .lb-page{min-height:100vh;background:
            radial-gradient(circle at 8% 0%, rgba(0,198,167,.16), transparent 42%),
            radial-gradient(circle at 92% 18%, rgba(245,166,35,.14), transparent 40%),
            radial-gradient(circle at 50% 100%, rgba(99,102,241,.10), transparent 50%),
            var(--navy);
            padding-bottom:80px;}

          /* ── Top bar ── */
          .lb-topbar{display:flex;align-items:center;justify-content:space-between;padding:22px 28px;max-width:1180px;margin:0 auto;}
          .lb-back{display:inline-flex;align-items:center;gap:8px;color:rgba(255,255,255,.6);text-decoration:none;font-size:13px;font-weight:600;transition:color .2s;}
          .lb-back:hover{color:#fff;}
          .lb-live{display:inline-flex;align-items:center;gap:7px;font-size:11.5px;font-weight:700;color:var(--teal);text-transform:uppercase;letter-spacing:.08em;}
          .lb-live-dot{width:7px;height:7px;border-radius:50%;background:var(--teal);box-shadow:0 0 0 0 rgba(0,198,167,.6);animation:lbpulse 1.8s infinite;}
          @keyframes lbpulse{0%{box-shadow:0 0 0 0 rgba(0,198,167,.55);}70%{box-shadow:0 0 0 9px rgba(0,198,167,0);}100%{box-shadow:0 0 0 0 rgba(0,198,167,0);}}

          /* ── Hero ── */
          .lb-hero{max-width:1180px;margin:8px auto 36px;padding:0 28px;text-align:center;}
          .lb-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);padding:7px 16px;border-radius:100px;font-size:11.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--accent-light);margin-bottom:20px;}
          .lb-h1{font-family:var(--font-d);font-size:clamp(30px,5vw,48px);font-weight:900;line-height:1.08;margin-bottom:14px;background:linear-gradient(135deg,#fff,#cdd3f0 60%,var(--accent-light));-webkit-background-clip:text;background-clip:text;color:transparent;}
          .lb-sub{font-size:15.5px;color:rgba(255,255,255,.55);max-width:560px;margin:0 auto;line-height:1.7;}

          /* ── Filter bar ── */
          .lb-filters{max-width:1180px;margin:0 auto 30px;padding:0 28px;}
          .lb-filter-card{background:rgba(255,255,255,.045);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:18px 20px;display:flex;flex-wrap:wrap;gap:14px;align-items:center;}
          .lb-fgroup{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
          .lb-flabel{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,.35);margin-right:2px;}
          .lb-pill-row{display:flex;gap:6px;background:rgba(255,255,255,.04);padding:4px;border-radius:100px;flex-wrap:wrap;}
          .lb-pill{border:none;background:none;color:rgba(255,255,255,.55);font:inherit;font-size:12.5px;font-weight:700;padding:8px 15px;border-radius:100px;cursor:pointer;transition:all .2s;white-space:nowrap;}
          .lb-pill:hover{color:#fff;}
          .lb-pill.on{background:linear-gradient(135deg,var(--teal),#0aa3cc);color:#00251f;box-shadow:0 4px 14px rgba(0,198,167,.35);}
          .lb-select{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);color:#fff;font:inherit;font-size:12.5px;font-weight:600;padding:9px 14px;border-radius:11px;cursor:pointer;}
          .lb-select option{background:var(--navy-mid);color:#fff;}
          .lb-search{position:relative;flex:1;min-width:160px;}
          .lb-search input{width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);color:#fff;font:inherit;font-size:12.5px;padding:9px 14px 9px 34px;border-radius:11px;}
          .lb-search input::placeholder{color:rgba(255,255,255,.35);}
          .lb-search i{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:rgba(255,255,255,.35);font-size:12px;}
          .lb-view-toggle{display:flex;gap:6px;background:rgba(255,255,255,.04);padding:4px;border-radius:100px;margin-left:auto;}

          /* ── Stat cards ── */
          .lb-stats{max-width:1180px;margin:0 auto 34px;padding:0 28px;display:grid;grid-template-columns:repeat(4,1fr);gap:16px;}
          .lb-stat-c{position:relative;overflow:hidden;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:22px;transition:transform .25s, background .25s;}
          .lb-stat-c:hover{transform:translateY(-4px);background:rgba(255,255,255,.07);}
          .lb-stat-c::after{content:'';position:absolute;top:-30%;right:-20%;width:110px;height:110px;border-radius:50%;background:radial-gradient(circle,var(--sc,var(--teal)) 0%,transparent 70%);opacity:.18;}
          .lb-stat-ic{width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:15px;margin-bottom:14px;background:color-mix(in srgb, var(--sc,var(--teal)) 16%, transparent);color:var(--sc,var(--teal));}
          .lb-stat-v{font-family:var(--font-d);font-size:28px;font-weight:900;line-height:1;margin-bottom:5px;}
          .lb-stat-l{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:rgba(255,255,255,.45);}

          /* ── Podium ── */
          .lb-podium-wrap{max-width:1180px;margin:0 auto 40px;padding:0 28px;}
          .lb-podium{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;align-items:end;}
          .lb-pod-c{border-radius:20px;padding:22px 16px 20px;text-align:center;position:relative;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);}
          .lb-pod-c.first{background:linear-gradient(160deg,rgba(245,197,24,.16),rgba(245,166,35,.05));border-color:rgba(245,197,24,.4);order:2;padding-top:34px;transform:scale(1.04);}
          .lb-pod-c.second{order:1;}
          .lb-pod-c.third{order:3;}
          .lb-pod-crown{position:absolute;top:-16px;left:50%;transform:translateX(-50%);font-size:22px;color:#f5c518;filter:drop-shadow(0 2px 6px rgba(245,197,24,.5));}
          .lb-pod-medal{width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--font-d);font-weight:900;font-size:18px;margin:0 auto 12px;}
          .first .lb-pod-medal{background:linear-gradient(135deg,#f5c518,#e0a800);color:#2b2200;width:56px;height:56px;font-size:22px;}
          .second .lb-pod-medal{background:linear-gradient(135deg,#cfd8e3,#9aa7b5);color:#1a2330;}
          .third .lb-pod-medal{background:linear-gradient(135deg,#d99355,#b06a30);color:#2b1700;}
          .lb-pod-name{font-weight:800;font-size:14.5px;margin-bottom:4px;}
          .lb-pod-meta{font-size:11.5px;color:rgba(255,255,255,.5);}
          .lb-pod-pts{margin-top:10px;font-family:var(--font-d);font-weight:900;font-size:19px;color:var(--accent-light);}

          /* ── Table section ── */
          .lb-table-section{max-width:1180px;margin:0 auto;padding:0 28px;}
          .lb-panel{background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.09);border-radius:20px;overflow:hidden;}
          .lb-panel-hd{display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid rgba(255,255,255,.08);flex-wrap:wrap;gap:10px;}
          .lb-panel-title{font-size:13.5px;font-weight:800;display:flex;align-items:center;gap:9px;}
          .lb-panel-title i{color:var(--accent);}
          .lb-sort-row{display:flex;gap:6px;flex-wrap:wrap;}
          .lb-sort-chip{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);color:rgba(255,255,255,.55);font:inherit;font-size:11.5px;font-weight:700;padding:6px 12px;border-radius:100px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:all .2s;}
          .lb-sort-chip:hover{color:#fff;border-color:rgba(255,255,255,.3);}
          .lb-sort-chip.on{background:var(--accent);color:#2b2200;border-color:var(--accent);}

          .lb-table{width:100%;border-collapse:collapse;}
          .lb-table th{text-align:left;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:rgba(255,255,255,.4);padding:13px 22px;background:rgba(255,255,255,.02);}
          .lb-table td{padding:13px 22px;font-size:13.5px;color:rgba(255,255,255,.85);border-top:1px solid rgba(255,255,255,.06);}
          .lb-table tr{transition:background .15s;}
          .lb-table tbody tr:hover{background:rgba(255,255,255,.03);}
          .lb-rank-badge{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.08);font-weight:800;font-size:12px;}
          .lb-rank-badge.top1{background:linear-gradient(135deg,#f5c518,#e0a800);color:#2b2200;}
          .lb-rank-badge.top2{background:linear-gradient(135deg,#cfd8e3,#9aa7b5);color:#1a2330;}
          .lb-rank-badge.top3{background:linear-gradient(135deg,#d99355,#b06a30);color:#2b1700;}
          .lb-name{font-weight:700;color:#fff;}
          .lb-pts-pill{display:inline-flex;align-items:center;gap:5px;padding:4px 11px;border-radius:100px;background:rgba(245,166,35,.14);color:var(--accent-light);font-weight:800;font-size:12px;}
          .lb-acc-pill{display:inline-block;padding:4px 11px;border-radius:100px;background:rgba(0,198,167,.14);color:var(--teal);font-weight:700;font-size:12px;}

          .lb-cards{display:none;padding:14px;}
          .lb-card{display:flex;align-items:center;gap:13px;padding:14px 15px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:14px;margin-bottom:9px;}
          .lb-card-body{flex:1;min-width:0;}
          .lb-card-meta{font-size:11.5px;color:rgba(255,255,255,.5);margin-top:3px;display:flex;gap:8px;flex-wrap:wrap;}

          .lb-pagination{display:flex;align-items:center;justify-content:center;gap:16px;padding:18px;border-top:1px solid rgba(255,255,255,.06);}
          .lb-page-btn{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#fff;font:inherit;font-size:12.5px;font-weight:700;padding:9px 16px;border-radius:11px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;transition:all .2s;}
          .lb-page-btn:hover:not(:disabled){background:rgba(255,255,255,.12);}
          .lb-page-btn:disabled{opacity:.3;cursor:not-allowed;}
          .lb-page-lbl{font-size:12px;color:rgba(255,255,255,.45);font-weight:600;}

          /* ── By-date view ── */
          .lb-date-group{border-bottom:1px solid rgba(255,255,255,.07);}
          .lb-date-group:last-child{border-bottom:none;}
          .lb-date-hd{display:flex;align-items:center;gap:12px;padding:15px 22px;background:rgba(255,255,255,.02);}
          .lb-date-tag{font-family:var(--font-d);font-weight:800;font-size:14.5px;}
          .lb-date-count{font-size:11px;color:rgba(255,255,255,.4);font-weight:600;background:rgba(255,255,255,.06);padding:3px 10px;border-radius:100px;}
          .lb-date-items{padding:6px 22px 16px;display:flex;flex-direction:column;gap:2px;}
          .lb-date-row{display:flex;align-items:flex-start;gap:11px;padding:9px 4px;font-size:13px;color:rgba(255,255,255,.75);line-height:1.6;}
          .lb-date-dot{width:6px;height:6px;border-radius:50%;background:var(--teal);margin-top:7px;flex-shrink:0;}
          .lb-date-row strong{color:#fff;font-weight:700;}
          .lb-date-subj{color:rgba(255,255,255,.4);}

          .lb-empty,.lb-error{text-align:center;color:rgba(255,255,255,.4);font-size:13px;padding:44px 20px;}
          .lb-skel{display:inline-block;width:44px;height:22px;border-radius:6px;background:rgba(255,255,255,.08);animation:lbsk 1.4s ease-in-out infinite;}
          @keyframes lbsk{0%,100%{opacity:.35;}50%{opacity:.9;}}
          .lb-note{font-size:11.5px;color:rgba(255,255,255,.35);text-align:center;padding:12px 22px 18px;}

          @media(max-width:900px){
            .lb-stats{grid-template-columns:1fr 1fr;}
            .lb-table-section .lb-table{display:none;}
            .lb-cards{display:block;}
          }
          @media(max-width:640px){
            .lb-podium{grid-template-columns:1fr;}
            .lb-pod-c.first{order:1;transform:none;}
            .lb-pod-c.second{order:2;}
            .lb-pod-c.third{order:3;}
            .lb-view-toggle{margin-left:0;}
          }
        `}</style>
      </Head>

      <div className="lb-page">
        <div className="lb-topbar">
          <Link href="/" className="lb-back"><i className="fa-solid fa-arrow-left"></i> Back to Home</Link>
          <span className="lb-live"><span className="lb-live-dot"></span> Live</span>
        </div>

        <div className="lb-hero">
          <div className="lb-badge"><i className="fa-solid fa-trophy"></i> Community Leaderboard</div>
          <h1 className="lb-h1">See where everyone stands</h1>
          <p className="lb-sub">Filter by subject and time window, track points and questions answered, and browse daily activity — open to everyone, no login required.</p>
        </div>

        {/* ── Filters ── */}
        <div className="lb-filters">
          <div className="lb-filter-card">
            <div className="lb-fgroup">
              <span className="lb-flabel">Window</span>
              <div className="lb-pill-row">
                {TIME_WINDOWS.map(w => (
                  <button key={w.days} className={`lb-pill${days === w.days ? ' on' : ''}`} onClick={() => setDays(w.days)}>{w.label}</button>
                ))}
              </div>
            </div>

            <div className="lb-fgroup">
              <span className="lb-flabel">Subject</span>
              <select className="lb-select" value={subject} onChange={e => setSubject(e.target.value)}>
                <option value="overall">All Subjects</option>
                {subjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="lb-search">
              <i className="fa-solid fa-magnifying-glass"></i>
              <input type="text" placeholder="Search a name…" value={query} onChange={e => setQuery(e.target.value)} />
            </div>

            <div className="lb-view-toggle">
              <button className={`lb-pill${view === 'ranked' ? ' on' : ''}`} onClick={() => setView('ranked')}><i className="fa-solid fa-ranking-star"></i> Ranked</button>
              <button className={`lb-pill${view === 'byDate' ? ' on' : ''}`} onClick={() => setView('byDate')}><i className="fa-solid fa-calendar-days"></i> By Date</button>
            </div>
          </div>
        </div>

        {dataErr ? (
          <div className="lb-table-section"><div className="lb-error">Couldn't load the leaderboard right now — please try again shortly.</div></div>
        ) : (
          <>
            {/* ── Stat cards ── */}
            <div className="lb-stats">
              <div className="lb-stat-c" style={{'--sc': '#22c55e'}}>
                <div className="lb-stat-ic"><i className="fa-solid fa-users"></i></div>
                <div className="lb-stat-v">{data ? fmt(summary.totalParticipants) : <span className="lb-skel" />}</div>
                <div className="lb-stat-l">Participants</div>
              </div>
              <div className="lb-stat-c" style={{'--sc': '#60a5fa'}}>
                <div className="lb-stat-ic"><i className="fa-solid fa-list-check"></i></div>
                <div className="lb-stat-v">{data ? fmt(summary.totalQuestions) : <span className="lb-skel" />}</div>
                <div className="lb-stat-l">Questions Answered</div>
              </div>
              <div className="lb-stat-c" style={{'--sc': 'var(--accent)'}}>
                <div className="lb-stat-ic"><i className="fa-solid fa-star"></i></div>
                <div className="lb-stat-v">{data ? (hasPoints ? fmt(summary.totalPoints) : '—') : <span className="lb-skel" />}</div>
                <div className="lb-stat-l">Total Points</div>
              </div>
              <div className="lb-stat-c" style={{'--sc': 'var(--teal)'}}>
                <div className="lb-stat-ic"><i className="fa-solid fa-bullseye"></i></div>
                <div className="lb-stat-v">{data ? `${summary.avgAccuracy}%` : <span className="lb-skel" />}</div>
                <div className="lb-stat-l">Avg. Accuracy</div>
              </div>
            </div>

            {view === 'ranked' ? (
              <>
                {/* ── Podium ── */}
                {podium.length === 3 && sortKey === 'rank' && (
                  <div className="lb-podium-wrap">
                    <div className="lb-podium">
                      {['second', 'first', 'third'].map((slot, idx) => {
                        const p = slot === 'first' ? podium[0] : slot === 'second' ? podium[1] : podium[2];
                        return (
                          <div key={slot} className={`lb-pod-c ${slot}`}>
                            {slot === 'first' && <div className="lb-pod-crown"><i className="fa-solid fa-crown"></i></div>}
                            <div className="lb-pod-medal">{slot === 'first' ? 1 : slot === 'second' ? 2 : 3}</div>
                            <div className="lb-pod-name">{p.studentName}</div>
                            <div className="lb-pod-meta">{fmt(p.attempted)} answered · {p.accuracy}% accuracy</div>
                            {p.points !== null && <div className="lb-pod-pts">{fmt(p.points)} pts</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Ranked table ── */}
                <div className="lb-table-section">
                  <div className="lb-panel">
                    <div className="lb-panel-hd">
                      <div className="lb-panel-title"><i className="fa-solid fa-ranking-star"></i> Full Rankings</div>
                      <div className="lb-sort-row">
                        {SORTS.filter(s => s.key !== 'points' || hasPoints).map(s => (
                          <button key={s.key} className={`lb-sort-chip${sortKey === s.key ? ' on' : ''}`} onClick={() => setSortKey(s.key)}>
                            <i className={`fa-solid ${s.icon}`}></i> {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {!data ? (
                      <div className="lb-empty"><i className="fa-solid fa-circle-notch fa-spin"></i> Loading rankings…</div>
                    ) : rows.length === 0 ? (
                      <div className="lb-empty">No results for this filter combination yet.</div>
                    ) : (
                      <>
                        <table className="lb-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Student</th>
                              <th>Questions</th>
                              {hasPoints && <th>Points</th>}
                              <th>Accuracy</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pageRows.map((row, i) => {
                              const displayRank = pageClamped * PAGE_SIZE + i + 1;
                              return (
                                <tr key={row.studentId || displayRank}>
                                  <td><span className={`lb-rank-badge${displayRank <= 3 && sortKey === 'rank' ? ` top${displayRank}` : ''}`}>{displayRank}</span></td>
                                  <td className="lb-name">{row.studentName}</td>
                                  <td>{fmt(row.attempted)}</td>
                                  {hasPoints && <td>{row.points !== null ? <span className="lb-pts-pill"><i className="fa-solid fa-star"></i> {fmt(row.points)}</span> : '—'}</td>}
                                  <td><span className="lb-acc-pill">{row.accuracy}%</span></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        <div className="lb-cards">
                          {pageRows.map((row, i) => {
                            const displayRank = pageClamped * PAGE_SIZE + i + 1;
                            return (
                              <div key={row.studentId || displayRank} className="lb-card">
                                <span className={`lb-rank-badge${displayRank <= 3 && sortKey === 'rank' ? ` top${displayRank}` : ''}`}>{displayRank}</span>
                                <div className="lb-card-body">
                                  <div className="lb-name">{row.studentName}</div>
                                  <div className="lb-card-meta">
                                    <span>{fmt(row.attempted)} answered</span>
                                    {hasPoints && row.points !== null && <span>{fmt(row.points)} pts</span>}
                                    <span>{row.accuracy}% acc.</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {pageCount > 1 && (
                          <div className="lb-pagination">
                            <button className="lb-page-btn" disabled={pageClamped === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>
                              <i className="fa-solid fa-chevron-left"></i> Prev
                            </button>
                            <span className="lb-page-lbl">Page {pageClamped + 1} of {pageCount}</span>
                            <button className="lb-page-btn" disabled={pageClamped >= pageCount - 1} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}>
                              Next <i className="fa-solid fa-chevron-right"></i>
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </>
            ) : (
              /* ── By-date view ── */
              <div className="lb-table-section">
                <div className="lb-panel">
                  <div className="lb-panel-hd">
                    <div className="lb-panel-title"><i className="fa-solid fa-calendar-days"></i> Results By Date</div>
                  </div>

                  {actErr ? (
                    <div className="lb-empty">Couldn't load recent activity right now.</div>
                  ) : !activity ? (
                    <div className="lb-empty"><i className="fa-solid fa-circle-notch fa-spin"></i> Loading activity…</div>
                  ) : activityByDate.length === 0 ? (
                    <div className="lb-empty">No activity to show for this subject yet.</div>
                  ) : (
                    <>
                      {activityByDate.map(([dateKey, items]) => (
                        <div key={dateKey} className="lb-date-group">
                          <div className="lb-date-hd">
                            <span className="lb-date-tag">{relativeDay(dateKey)}</span>
                            <span className="lb-date-count">{items.length} attempt{items.length === 1 ? '' : 's'}</span>
                          </div>
                          <div className="lb-date-items">
                            {items.map((a, i) => (
                              <div key={i} className="lb-date-row">
                                <span className="lb-date-dot"></span>
                                <span>
                                  <strong>{a.studentName}</strong> worked on <strong>{a.topic || a.subject}</strong>
                                  {a.subject && a.topic ? <span className="lb-date-subj"> · {a.subject}</span> : null}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      {noDatesAtAll && (
                        <div className="lb-note">Activity entries here don't carry a date field yet — everything is grouped under "Undated" until the activity feed includes one (date / timestamp / at / attemptedAt).</div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
