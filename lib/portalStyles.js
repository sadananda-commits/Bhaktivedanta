// lib/portalStyles.js
//
// Extracted verbatim from the CSS template string inside pages/portal.js's
// PortalInner component. Moved here so the new public guest quiz page
// (pages/quiz.js) can render pixel-identical styling (including the
// '.lp-*' quiz-player classes QuizPlayer.js's JSX depends on) without
// duplicating ~600 lines of CSS. No styles were changed — pure move.
// ────────────────────────────────────────────────────────────────────────

export const PORTAL_CSS = `
    @keyframes skpulse{0%,100%{opacity:1}50%{opacity:.35}}
    *{box-sizing:border-box;margin:0;padding:0;}
    :root{--navy:#0a0f2c;--navy-mid:#121a3e;--surf:#161d3f;--surf2:#1e2850;--teal:#00c6a7;--accent:#f5a623;--text:#e2e8f0;--muted:#64748b;--border:rgba(255,255,255,.08);--r:14px;--fd:'Playfair Display',Georgia,serif;--fb:'DM Sans',system-ui,sans-serif;--fm:'Inter',system-ui,sans-serif;
      /* Issue 1 — clean, simple, highly-readable quiz typography (separate
         from the site's decorative --fd serif so question text never
         renders in a fallback serif font). --fq = quiz body copy,
         --fqh = quiz headings/labels. */
      --fq:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
      --fqh:'Poppins','Inter',-apple-system,sans-serif;
    }
    html,body{height:100%;font-family:var(--fb);background:var(--navy);color:var(--text);-webkit-font-smoothing:antialiased;}
    .lw{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--navy);position:relative;overflow:hidden;}
    .lbg{position:absolute;inset:0;background:radial-gradient(ellipse 55% 55% at 70% 30%,rgba(0,198,167,.12) 0%,transparent 60%),radial-gradient(ellipse 40% 40% at 20% 70%,rgba(245,166,35,.08) 0%,transparent 60%);}
    .lb{background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:24px;padding:48px 40px;width:100%;max-width:420px;position:relative;backdrop-filter:blur(12px);}
    .li{width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,var(--teal),#0099cc);display:flex;align-items:center;justify-content:center;font-size:22px;color:#fff;margin:0 auto 20px;}
    .lh{font-family:var(--fd);font-size:26px;font-weight:900;text-align:center;color:#fff;margin-bottom:6px;}
    .ls{font-size:13px;color:var(--muted);text-align:center;margin-bottom:32px;}
    .field{margin-bottom:16px;}
    .fl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.5);margin-bottom:6px;display:block;}
    .fw{position:relative;}
    .fi{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:13px;}
    .inp{width:100%;padding:12px 14px 12px 38px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#fff;font-size:14px;font-family:var(--fb);outline:none;transition:all .2s;}
    .inp::placeholder{color:rgba(255,255,255,.25);}
    .inp:focus{border-color:var(--teal);background:rgba(255,255,255,.09);box-shadow:0 0 0 3px rgba(0,198,167,.15);}
    .lbtn{width:100%;padding:14px;background:linear-gradient(135deg,var(--teal),#0099cc);border:none;border-radius:11px;color:#fff;font-family:var(--fb);font-size:15px;font-weight:700;cursor:pointer;transition:all .2s;margin-top:8px;}
    .lbtn:hover{opacity:.9;transform:translateY(-1px);}
    .lbtn:disabled{opacity:.6;cursor:not-allowed;transform:none;}
    .lerr{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.25);color:#f87171;border-radius:10px;padding:12px;font-size:13px;font-weight:600;text-align:center;margin-top:14px;}
    .bk{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:24px;font-size:13px;color:var(--muted);text-decoration:none;transition:color .2s;}
    .bk:hover{color:var(--teal);}
    .dash{display:flex;height:100vh;overflow:hidden;}
    .sb{width:240px;background:var(--navy-mid);border-right:1px solid var(--border);display:flex;flex-direction:column;flex-shrink:0;overflow-y:auto;}
    .sb-head{padding:18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;}
    .sb-av{width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,var(--teal),#0099cc);display:flex;align-items:center;justify-content:center;font-size:17px;color:#fff;flex-shrink:0;}
    .sb-name{font-size:14px;font-weight:700;color:#fff;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .sb-id{font-size:11px;color:var(--muted);}
    .sb-sec{padding:14px 12px 4px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.22);}
    .sb-nav{padding:0 10px 10px;}
    .nb{width:100%;display:flex;align-items:center;gap:9px;padding:9px 11px;border-radius:10px;border:none;background:transparent;color:rgba(255,255,255,.48);font-family:var(--fb);font-size:13px;font-weight:600;cursor:pointer;transition:all .2s;text-align:left;margin-bottom:2px;position:relative;}
    .nb:hover{background:rgba(255,255,255,.06);color:rgba(255,255,255,.85);}
    .nb.active{background:rgba(0,198,167,.12);color:var(--teal);border:1px solid rgba(0,198,167,.2);}
    .nb i{width:16px;text-align:center;font-size:13px;}
    .nb-badge{position:absolute;right:10px;top:50%;transform:translateY(-50%);background:#ef4444;color:#fff;font-size:9px;font-weight:800;min-width:18px;height:18px;border-radius:100px;display:flex;align-items:center;justify-content:center;padding:0 4px;}
    .sb-ft{padding:10px;border-top:1px solid var(--border);}
    .lo-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:transparent;color:rgba(255,255,255,.4);font-family:var(--fb);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;cursor:pointer;transition:all .2s;}
    .lo-btn:hover{background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.3);color:#f87171;}
    .main{flex:1;overflow-y:auto;background:var(--navy);}
    /* Mobile hamburger trigger — hidden on desktop, shown only under the 640px breakpoint below */
    .mnav-toggle{display:none;align-items:center;justify-content:center;width:44px;height:44px;flex-shrink:0;border-radius:10px;border:1px solid var(--border);background:rgba(255,255,255,.04);color:#fff;font-size:16px;cursor:pointer;}
    .mnav-toggle:hover{background:rgba(255,255,255,.08);}
    .mnav-bar{display:none;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--navy);z-index:50;}
    .mnav-bar-title{font-family:var(--fd);font-size:15px;font-weight:800;color:#fff;}
    .mnav-close{display:none;align-items:center;justify-content:center;width:44px;height:44px;flex-shrink:0;border-radius:8px;border:none;background:rgba(255,255,255,.06);color:rgba(255,255,255,.6);font-size:14px;cursor:pointer;}
    .mnav-close:hover{background:rgba(255,255,255,.12);color:#fff;}
    /* Tap-outside backdrop behind the drawer — only rendered/active on mobile while open */
    .mnav-backdrop{display:none;}
    .main-top{padding:28px 32px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;}
    .pg-h{font-family:var(--fd);font-size:24px;font-weight:900;color:#fff;}
    .pg-s{font-size:13px;color:var(--muted);margin-top:3px;}
    .content{padding:28px 32px;}
    .card{background:var(--surf);border:1px solid var(--border);border-radius:var(--r);padding:22px;}
    .card-t{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:18px;display:flex;align-items:center;gap:7px;}
    .sr{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:22px;}
    .sc{background:var(--surf);border:1px solid var(--border);border-radius:var(--r);padding:18px;}
    .sc-l{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:7px;}
    .sc-v{font-family:var(--fd);font-size:26px;font-weight:900;color:#fff;line-height:1;}
    .sc-s{font-size:11px;color:var(--muted);margin-top:5px;}
    .cr{display:grid;grid-template-columns:2fr 1fr;gap:14px;margin-bottom:22px;}
    .cv{height:200px;}
    .sp-item{margin-bottom:16px;}
    .sp-hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;}
    .sp-name{font-size:14px;font-weight:600;color:#fff;}
    .sp-meta{font-size:12px;color:var(--muted);}
    .sp-bar{height:8px;background:rgba(255,255,255,.06);border-radius:100px;overflow:hidden;}
    .sp-fill{height:100%;border-radius:100px;transition:width .8s ease;}
    .sp-detail-row{display:flex;flex-wrap:wrap;gap:14px;margin-top:9px;font-size:11.5px;color:var(--muted);}
    .sp-detail-row i{margin-right:4px;}
    .ana-stats-g{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:14px;}
    .ana-stat{text-align:center;padding:14px 8px;background:var(--surf2);border-radius:11px;}
    .ana-stat-v{font-family:var(--fd);font-size:22px;font-weight:900;color:#fff;line-height:1;margin-bottom:5px;}
    .ana-stat-l{font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.04em;}
    .badge-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px;}
    .badge-card{background:var(--surf2);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center;}
    .badge-icon{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:19px;margin:0 auto 10px;}
    .badge-label{font-size:13px;font-weight:700;color:#fff;margin-bottom:4px;}
    .badge-detail{font-size:11px;color:var(--muted);line-height:1.5;}
    /* ── Leaderboard ──────────────────────────────────────────────────── */
    .lb-list{display:flex;flex-direction:column;gap:8px;}
    .lb-row{display:flex;align-items:center;gap:14px;padding:11px 14px;border-radius:11px;background:var(--surf2);border:1px solid transparent;transition:all .15s;}
    .lb-row.me{border-color:rgba(0,198,167,.4);background:rgba(0,198,167,.08);}
    .lb-rank{width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:rgba(255,255,255,.6);flex-shrink:0;}
    .lb-rank.top1{background:rgba(245,166,35,.18);color:#f5a623;}
    .lb-rank.top2{background:rgba(203,213,225,.18);color:#cbd5e1;}
    .lb-rank.top3{background:rgba(217,119,6,.18);color:#d97706;}
    .lb-name{flex:1;font-size:13.5px;font-weight:700;color:#fff;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .lb-you{color:var(--teal);font-weight:800;}
    .lb-stats{display:flex;gap:14px;font-size:11.5px;color:var(--muted);flex-shrink:0;}
    .lb-correct{font-weight:700;color:rgba(255,255,255,.75);}
    .lb-acc{color:var(--teal);font-weight:700;}
    .lb-subj-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px;}
    .lb-subj-card{padding:20px;}
    .lb-champ-name{font-family:var(--fd);font-size:17px;font-weight:900;color:#fff;margin-top:4px;}
    .lb-champ-stats{font-size:12px;color:var(--muted);margin-top:3px;margin-bottom:12px;}
    .lb-runner-ups{border-top:1px solid var(--border);padding-top:10px;display:flex;flex-direction:column;gap:6px;}
    .lb-runner-row{display:flex;justify-content:space-between;font-size:11.5px;color:rgba(255,255,255,.6);}
    .att-g{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:22px;}
    .att-c{background:var(--surf);border:1px solid var(--border);border-radius:var(--r);padding:18px;text-align:center;}
    .att-n{font-family:var(--fd);font-size:28px;font-weight:900;line-height:1;margin-bottom:5px;}
    .att-l{font-size:12px;color:var(--muted);}
    .month-g{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-top:20px;}
    .m-bar-wrap{display:flex;flex-direction:column;align-items:center;gap:6px;}
    .m-bar-outer{width:100%;height:60px;background:rgba(255,255,255,.05);border-radius:6px;overflow:hidden;display:flex;align-items:flex-end;}
    .m-bar{width:100%;border-radius:6px;transition:height .6s ease;}
    .m-lbl{font-size:10px;color:var(--muted);font-weight:600;}
    .m-pct{font-size:10px;color:var(--teal);font-weight:700;}
    .asgn-item{background:var(--surf2);border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:12px;display:flex;align-items:center;gap:14px;}
    .asgn-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;}
    .asgn-body{flex:1;}
    .asgn-title{font-size:14px;font-weight:700;color:#fff;margin-bottom:3px;}
    .asgn-meta{font-size:12px;color:var(--muted);}
    .asgn-badge{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:4px 10px;border-radius:100px;white-space:nowrap;}
    .asgn-badge.pending{background:rgba(245,166,35,.12);color:var(--accent);border:1px solid rgba(245,166,35,.25);}
    .asgn-badge.submitted{background:rgba(0,198,167,.1);color:var(--teal);border:1px solid rgba(0,198,167,.2);}
    .asgn-badge.graded{background:rgba(34,197,94,.1);color:#4ade80;border:1px solid rgba(34,197,94,.2);}
    .asgn-badge.overdue{background:rgba(239,68,68,.12);color:#f87171;border:1px solid rgba(239,68,68,.25);}
    .asgn-badge.inprogress{background:rgba(59,130,246,.12);color:#60a5fa;border:1px solid rgba(59,130,246,.25);}
    /* Assignment summary strip */
    .asgn-summary-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;}
    .asgn-summary-cell{background:var(--surf2);border:1px solid var(--border);border-radius:12px;padding:14px;text-align:center;}
    .asgn-summary-val{font-family:var(--fd);font-size:24px;font-weight:900;margin-bottom:3px;}
    .asgn-summary-lbl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);}
    /* Enhanced assignment item */
    .asgn-item-v2{align-items:flex-start;flex-direction:column;gap:0;}
    .asgn-item-v2 .asgn-dot{flex-shrink:0;margin-top:4px;align-self:flex-start;}
    /* Age-group expandable subject cards */
    .age-subj-card{background:var(--surf);border:1px solid var(--border);border-radius:16px;margin-bottom:12px;overflow:hidden;transition:border-color .2s;}
    .age-subj-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px 0;cursor:pointer;user-select:none;}
    .age-subj-header:hover{background:rgba(255,255,255,.015);}
    .age-subj-icon{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;}
    .age-subj-name{font-family:var(--fd);font-size:17px;font-weight:900;color:#fff;}
    .age-coming-soon{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:2px 8px;border-radius:100px;background:rgba(99,102,241,.2);color:#818cf8;border:1px solid rgba(99,102,241,.3);}
    .age-subj-expanded{transition:all .2s;}
    @media(max-width:640px){
      .asgn-summary-strip{grid-template-columns:repeat(2,1fr);}
      .age-subj-header{flex-wrap:wrap;}
    }
    .upload-zone{border:2px dashed rgba(255,255,255,.12);border-radius:var(--r);padding:36px;text-align:center;transition:all .2s;cursor:pointer;display:block;}
    .upload-zone:hover{border-color:var(--teal);background:rgba(0,198,167,.04);}
    .sch-item{background:var(--surf2);border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:12px;display:flex;align-items:center;gap:16px;}
    .sch-color{width:4px;height:52px;border-radius:4px;flex-shrink:0;}
    .sch-body{flex:1;}
    .sch-subj{font-size:15px;font-weight:700;color:#fff;margin-bottom:2px;}
    .sch-meta{font-size:12px;color:var(--muted);}
    .sch-right{text-align:right;}
    .sch-time{font-size:13px;font-weight:700;color:#fff;margin-bottom:3px;}
    .sch-date{font-size:11px;color:var(--muted);}
    .notif-item{background:var(--surf2);border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:10px;display:flex;align-items:flex-start;gap:14px;position:relative;}
    .notif-item.unread{border-color:rgba(0,198,167,.25);}
    .notif-ic{width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;}
    .notif-title{font-size:14px;font-weight:700;color:#fff;margin-bottom:4px;}
    .notif-body{font-size:13px;color:var(--muted);line-height:1.6;}
    .notif-time{font-size:11px;color:rgba(255,255,255,.3);margin-top:6px;}
    .unread-dot{position:absolute;top:14px;right:14px;width:8px;height:8px;background:var(--teal);border-radius:50%;}
    .prof-g{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
    .prof-field{display:flex;flex-direction:column;gap:6px;}
    .prof-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.45);}
    .prof-val{font-size:14px;color:#fff;font-weight:500;}
    .prof-inp{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:9px;padding:10px 13px;color:#fff;font-size:14px;font-family:var(--fb);outline:none;width:100%;transition:all .2s;}
    .prof-inp:focus{border-color:var(--teal);box-shadow:0 0 0 3px rgba(0,198,167,.15);}
    .btn-t{background:linear-gradient(135deg,var(--teal),#0099cc);border:none;border-radius:10px;padding:11px 22px;color:#fff;font-family:var(--fb);font-size:13px;font-weight:700;cursor:pointer;transition:all .2s;display:inline-flex;align-items:center;gap:7px;}
    .btn-t:hover{opacity:.9;transform:translateY(-1px);}
    .btn-t-sm{padding:8px 16px;font-size:12px;flex-shrink:0;}
    .card-t-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px;flex-wrap:wrap;}
    .card-t-row .card-t{margin-bottom:0;}
    @media(max-width:640px){.card-t-row{flex-direction:column;align-items:stretch;}.card-t-row .btn-t-sm{width:100%;justify-content:center;}}
    .btn-outline{background:transparent;border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:11px 22px;color:rgba(255,255,255,.7);font-family:var(--fb);font-size:13px;font-weight:600;cursor:pointer;transition:all .2s;display:inline-flex;align-items:center;gap:7px;}
    .btn-outline:hover{border-color:var(--teal);color:var(--teal);}
    /* ANNOUNCEMENT STRIP */
    .ann-strip{background:linear-gradient(90deg,var(--teal) 0%,#0099cc 100%);color:#fff;font-size:12px;font-weight:600;overflow:hidden;white-space:nowrap;height:34px;display:flex;align-items:center;border-bottom:1px solid rgba(255,255,255,.1);}
    .ann-strip-inner{display:inline-flex;align-items:center;animation:ann-scroll 35s linear infinite;}
    .ann-strip-inner:hover{animation-play-state:paused;}
    .ann-strip-seg{padding:0 48px;display:inline-flex;align-items:center;gap:9px;white-space:nowrap;}
    .ann-strip-seg i{font-size:10px;opacity:.8;}
    @keyframes ann-scroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}

    .wbanner{background:linear-gradient(135deg,rgba(0,198,167,.15),rgba(0,153,204,.1));border:1px solid rgba(0,198,167,.2);border-radius:var(--r);padding:22px 26px;margin-bottom:22px;display:flex;align-items:center;justify-content:space-between;gap:16px;}
    .wbanner h2{font-family:var(--fd);font-size:20px;font-weight:900;color:#fff;margin-bottom:4px;}
    .wbanner p{font-size:13px;color:rgba(255,255,255,.6);}
    .av-big{width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,var(--teal),#0099cc);display:flex;align-items:center;justify-content:center;font-size:22px;color:#fff;flex-shrink:0;}
    @media(max-width:900px){.sr{grid-template-columns:repeat(2,1fr);}.cr{grid-template-columns:1fr;}.att-g{grid-template-columns:1fr 1fr;}.prof-g{grid-template-columns:1fr;}.ana-stats-g{grid-template-columns:repeat(3,1fr);}}
    @media(max-width:640px){
      /* Sidebar becomes a fixed off-canvas drawer instead of vanishing — width:0
         previously removed all navigation on mobile with no way to reopen it. */
      .sb{position:fixed;top:0;left:0;bottom:0;width:80vw;max-width:300px;z-index:300;
        transform:translateX(-100%);transition:transform .25s ease;box-shadow:0 0 40px rgba(0,0,0,.4);}
      .sb.open{transform:translateX(0);}
      .mnav-toggle{display:flex;}
      .mnav-bar{display:flex;}
      .mnav-close{display:flex;}
      .mnav-backdrop{display:block;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:290;opacity:0;pointer-events:none;transition:opacity .2s ease;}
      .mnav-backdrop.open{opacity:1;pointer-events:auto;}
      .main-top{padding:14px 16px;gap:12px;}
      .content{padding:16px;}
      .sr{grid-template-columns:1fr 1fr;}
      .ana-stats-g{grid-template-columns:repeat(2,1fr);}
      .badge-grid{grid-template-columns:1fr 1fr;}
      .lb-row{flex-wrap:wrap;}
      .lb-stats{width:100%;justify-content:flex-start;margin-left:44px;}
      .lb-subj-grid{grid-template-columns:1fr;}
      /* Touch-friendly tap targets (Req #9) — the sidebar nav items and quiz
         question dots were sized for a mouse cursor; bump both to the
         ~44px minimum recommended for touch on small screens. */
      .nb{padding:13px 11px;min-height:44px;}
      .lp-dot{width:16px;height:16px;}
      .lp-dot.current{width:18px;height:18px;}
    }
    /* ── Interactive Learning ─────────────────────────────────────────── */
    .sec-divider{display:flex;align-items:center;gap:9px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:30px 0 16px;}
    .sec-divider::after{content:'';flex:1;height:1px;background:var(--border);}
    .lm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px;margin-bottom:8px;}
    .lm-card{background:var(--surf);border:1px solid var(--border);border-radius:var(--r);padding:20px;cursor:pointer;transition:all .2s;text-align:left;display:flex;flex-direction:column;gap:12px;}
    .lm-card:hover{border-color:rgba(0,198,167,.35);box-shadow:0 14px 30px rgba(0,0,0,.32);transform:translateY(-2px);}
    .lm-card:focus-visible{outline:2px solid var(--teal);outline-offset:2px;}
    .lm-icon{width:52px;height:52px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0;}
    .lm-subj{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);}
    .lm-title{font-family:var(--fd);font-size:17px;font-weight:900;color:#fff;margin:2px 0 2px;}
    .lm-teaser{font-size:12px;color:rgba(255,255,255,.5);line-height:1.55;flex:1;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
    .lm-status{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:4px 10px;border-radius:100px;display:inline-flex;align-items:center;gap:5px;width:fit-content;}
    .lm-status.notstarted{background:rgba(255,255,255,.06);color:rgba(255,255,255,.45);border:1px solid var(--border);}
    .lm-status.inprogress{background:rgba(245,166,35,.12);color:var(--accent);border:1px solid rgba(245,166,35,.25);}
    .lm-status.completed{background:rgba(34,197,94,.1);color:#4ade80;border:1px solid rgba(34,197,94,.2);}
    /* ── Assignment drill-down: Subject grid + breadcrumb (Step 1) ───────── */
    .asgn-subj-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;margin-bottom:8px;}
    .asgn-subj-card{background:var(--surf);border:1px solid var(--border);border-radius:var(--r);padding:20px;cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:16px;}
    .asgn-subj-card:hover{border-color:rgba(0,198,167,.35);box-shadow:0 14px 30px rgba(0,0,0,.32);transform:translateY(-2px);}
    .asgn-subj-card:focus-visible{outline:2px solid var(--teal);outline-offset:2px;}
    .asgn-subj-icon{width:56px;height:56px;border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0;}
    .asgn-subj-name{font-family:var(--fd);font-size:16px;font-weight:900;color:#fff;margin-bottom:3px;}
    .asgn-subj-tag{font-size:12px;color:rgba(255,255,255,.5);line-height:1.5;}
    .asgn-subj-count{text-align:center;flex-shrink:0;}
    .asgn-subj-count .n{display:block;font-family:var(--fd);font-size:18px;font-weight:900;color:var(--teal);}
    .asgn-subj-count .l{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-top:2px;}
    .asgn-subj-soon{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:4px 10px;border-radius:100px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.4);border:1px solid var(--border);white-space:nowrap;}
    .asgn-breadcrumb{display:flex;align-items:center;gap:9px;font-size:12px;font-weight:700;margin-bottom:18px;flex-wrap:wrap;}
    .asgn-crumb{color:var(--muted);cursor:pointer;transition:color .2s;}
    .asgn-crumb:hover{color:var(--teal);}
    .asgn-crumb-sep{font-size:9px;color:var(--border);}
    .asgn-crumb-current{color:#fff;}
    .asgn-share-btn{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;color:var(--muted);background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:20px;cursor:pointer;padding:5px 12px;margin-left:auto;transition:color .2s,border-color .2s,background .2s;}
    .asgn-share-btn:hover{color:var(--teal);border-color:var(--teal);}
    .asgn-share-btn.copied{color:var(--teal);border-color:var(--teal);}
    .lp-try-card{background:rgba(0,198,167,.06);border:1px solid rgba(0,198,167,.2);border-radius:var(--r);padding:16px 18px;margin:18px 0;}
    .lp-try-lbl{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--teal);margin-bottom:8px;}
    .lp-try-card p{font-size:13px;color:rgba(255,255,255,.75);line-height:1.6;}
    .lp-back{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:700;color:var(--muted);background:none;border:none;cursor:pointer;margin-bottom:18px;transition:color .2s;padding:0;}
    .lp-back:hover{color:var(--teal);}
    .lp-hero{display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px;padding:36px 28px;}
    .lp-hero-icon{width:88px;height:88px;border-radius:24px;display:flex;align-items:center;justify-content:center;font-size:44px;}
    .lp-hero h2{font-family:var(--fd);font-size:24px;font-weight:900;color:#fff;}
    .lp-hero p{font-size:14px;color:rgba(255,255,255,.65);line-height:1.7;max-width:480px;}
    .lp-step-lbl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:10px;}
    .lp-qcounter-row{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:10px;flex-wrap:wrap;}
    .lp-qcounter{font-family:var(--fd);font-size:18px;font-weight:800;color:#fff;}
    .lp-qpct{font-size:12px;font-weight:700;color:var(--teal);}
    .lp-bar-outer{width:100%;height:8px;background:rgba(255,255,255,.07);border-radius:100px;overflow:hidden;margin-bottom:20px;}
    .lp-bar-fill{height:100%;border-radius:100px;background:var(--teal);transition:width .4s ease;}
    .lp-dots{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:22px;}
    .lp-dot{width:11px;height:11px;border-radius:50%;border:none;padding:0;cursor:pointer;background:rgba(255,255,255,.12);transition:all .15s;flex-shrink:0;}
    .lp-dot:hover{background:rgba(255,255,255,.25);}
    .lp-dot.current{width:13px;height:13px;background:var(--teal);box-shadow:0 0 0 3px rgba(0,198,167,.22);}
    .lp-dot.correct{background:#22c55e;}
    .lp-dot.incorrect{background:#ef4444;}
    .lp-jump-select{width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:10px 12px;color:#fff;font-family:var(--fb);font-size:13px;font-weight:600;margin-bottom:22px;cursor:pointer;}
    .lp-jump-select:focus{outline:none;border-color:var(--teal);}
    .lp-nav-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:8px;}
    .lp-teach{background:rgba(0,198,167,.07);border:1px solid rgba(0,198,167,.18);border-radius:12px;padding:16px 18px;margin-bottom:20px;display:flex;gap:12px;align-items:flex-start;}
    .lp-teach i{color:var(--teal);font-size:16px;margin-top:2px;}
    .lp-teach p{font-size:14px;color:#fff;line-height:1.65;}
    .lp-q{font-family:var(--fd);font-size:17px;font-weight:800;color:#fff;margin-bottom:16px;line-height:1.5;}
    .lp-opts{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;}
    .lp-opt{background:var(--surf2);border:1.5px solid var(--border);border-radius:11px;padding:13px 16px;text-align:left;font-family:var(--fb);font-size:13.5px;font-weight:600;color:rgba(255,255,255,.85);cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:10px;}
    .lp-opt:hover:not(:disabled){border-color:rgba(0,198,167,.4);background:rgba(255,255,255,.04);}
    .lp-opt:disabled{cursor:default;}
    .lp-opt .lp-letter{width:22px;height:22px;border-radius:7px;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0;}
    .lp-opt.correct{border-color:rgba(34,197,94,.5);background:rgba(34,197,94,.1);color:#4ade80;}
    .lp-opt.correct .lp-letter{background:#22c55e;color:#fff;}
    .lp-opt.incorrect{border-color:rgba(239,68,68,.5);background:rgba(239,68,68,.1);color:#f87171;}
    .lp-opt.incorrect .lp-letter{background:#ef4444;color:#fff;}
    .lp-feedback{border-radius:12px;padding:16px 18px;margin-bottom:18px;display:flex;gap:12px;align-items:flex-start;}
    .lp-feedback.good{background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.25);}
    .lp-feedback.bad{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);}
    .lp-feedback i{font-size:18px;margin-top:1px;}
    .lp-feedback.good i{color:#4ade80;}
    .lp-feedback.bad i{color:#f87171;}
    .lp-feedback p{font-size:13.5px;line-height:1.6;color:rgba(255,255,255,.85);}
    .lp-feedback strong{color:#fff;}
    .lp-learnmore{display:inline-flex;align-items:center;gap:7px;margin-top:10px;font-size:12px;font-weight:700;color:var(--teal);text-decoration:none;}
    .lp-learnmore:hover{text-decoration:underline;}
    .lp-learnmore i:last-child{font-size:9px;opacity:.7;}
    .lp-score-ring{width:120px;height:120px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-direction:column;margin:0 auto 18px;border:6px solid rgba(0,198,167,.18);}
    .lp-score-ring .n{font-family:var(--fd);font-size:30px;font-weight:900;color:#fff;line-height:1;}
    .lp-score-ring .l{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-top:3px;}
    .lp-encourage{text-align:center;font-size:15px;font-weight:700;color:#fff;}
    .lp-concept-item{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border);font-size:13px;color:rgba(255,255,255,.75);line-height:1.6;}
    .lp-concept-item:last-child{border-bottom:none;}
    .lp-concept-item i{color:var(--teal);margin-top:2px;flex-shrink:0;}
    .lp-concept-section-lbl{font-size:11px;font-weight:800;color:var(--teal);text-transform:uppercase;letter-spacing:.06em;margin:14px 0 2px;}
    .lp-mistake{background:var(--surf2);border:1px solid var(--border);border-radius:11px;padding:14px 16px;margin-bottom:10px;}
    .lp-mistake-q{font-size:13.5px;font-weight:700;color:#fff;margin-bottom:6px;}
    .lp-mistake-row{font-size:12.5px;color:rgba(255,255,255,.6);margin-bottom:3px;}
    .lp-actions{display:flex;gap:12px;justify-content:center;margin-top:24px;flex-wrap:wrap;}
    @media(max-width:640px){.lm-grid{grid-template-columns:1fr;}.asgn-subj-grid{grid-template-columns:1fr;}.lp-opts{grid-template-columns:1fr;}.lp-hero{padding:28px 18px;}.lp-nav-row{flex-wrap:wrap;}.lp-nav-row button{flex:1;justify-content:center;min-width:130px;}}
    /* ── Streak toast pop animation ── */
    @keyframes streakPop{from{opacity:0;transform:translateX(-50%) scale(.7) translateY(-12px)}to{opacity:1;transform:translateX(-50%) scale(1) translateY(0)}}
    /* ── Full-screen mobile-first question layout ── */
    /* FIX: this used to be a normal in-flow box (height:100vh) inside .main,
       which is itself scrollable. On mobile, .mnav-bar renders ABOVE it in
       that same scroll container, so mnav-bar-height + 100vh > the actual
       viewport height — pushing the bottom Previous/Next row below the
       fold and forcing a scroll to reach it. Making this a fixed, full-
       viewport overlay removes it from that flow entirely so it always
       fills the real screen and the nav row is always visible without
       scrolling, on any device. */
    .lp-fullscreen{position:fixed;inset:0;z-index:200;display:flex;flex-direction:column;height:100vh;height:100dvh;padding:0;background:var(--navy);overflow:hidden;}
    /* Header: back + title + counter + streak + timer */
    .lp-fs-header{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--navy);z-index:10;flex-shrink:0;}
    .lp-fs-back{width:36px;height:36px;border-radius:9px;border:1px solid var(--border);background:rgba(255,255,255,.04);color:rgba(255,255,255,.7);font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s;}
    .lp-fs-back:hover{background:rgba(255,255,255,.1);color:#fff;}
    .lp-fs-title{flex:1;font-family:var(--fqh);font-size:14px;font-weight:700;color:rgba(255,255,255,.82);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .lp-fs-qcount{flex-shrink:0;font-family:var(--fm);font-size:12px;font-weight:700;color:var(--muted);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:100px;padding:4px 11px;white-space:nowrap;}
    .lp-timer-badge{flex-shrink:0;display:inline-flex;align-items:center;gap:2px;font-family:var(--fm);font-size:12px;font-weight:800;color:#f97316;background:rgba(249,115,22,.1);border:1px solid rgba(249,115,22,.3);border-radius:100px;padding:4px 11px;white-space:nowrap;transition:color .3s,background .3s,border-color .3s;}
    .lp-timer-badge.paused{color:var(--muted);background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.1);}

    /* ── Slim progress bar flush under header ── */
    .lp-fs-progress-wrap{padding:0;flex-shrink:0;}
    .lp-fs-bar{margin:0;height:4px;border-radius:0;}
    .lp-fs-bar .lp-bar-outer{border-radius:0;height:4px;}
    .lp-fs-counter{display:none;}

    /* ════════════════════════════════════════════════════════════════════
       ISSUE 2 & 3 — Full-viewport, dynamically-scaling quiz body.
       ────────────────────────────────────────────────────────────────────
       .lp-fs-body is now a CSS Grid container that fills 100% of the
       remaining viewport height (flex:1 inside the fixed .lp-fullscreen
       column). Content no longer sits top-aligned with empty space below;
       instead the grid distributes rows so the question + options block
       expands to use the available height, while Learning Section /
       Teaching boxes get a fair, capped share rather than a fixed small
       max-height. All type uses clamp() so it scales fluidly between a
       sensible mobile minimum and a generous desktop maximum, instead of
       fixed small px values — this directly answers "make the fonts and
       boxes bigger and aligned to full screen use."

       Breakpoint strategy (Issue 4 — device coverage):
         < 480px   → phones (portrait)              1-col options, compact
         480-767px → large phones / small tablets    1-col options, roomier
         768-1023px→ tablets (portrait) / small laptop 2-col options
         1024-1439px→ laptops/desktops                2-col options, wide canvas
         ≥1440px   → large desktops                   2-col options, capped
                      max-width so lines don't sprawl edge-to-edge, centered
       ════════════════════════════════════════════════════════════════════ */
    .lp-fs-body{
      flex:1;
      overflow-y:auto;
      display:flex;
      flex-direction:column;
      padding-bottom:env(safe-area-inset-bottom,0px);
    }
    .lp-fs-body::-webkit-scrollbar{width:6px;}
    .lp-fs-body::-webkit-scrollbar-track{background:transparent;}
    .lp-fs-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:99px;}

    /* Inner content column — centers and caps width on very large screens
       so text never stretches into unreadable full-width lines, while still
       using the full available height. */
    .lp-fs-inner{
      width:100%;
      max-width:1180px;
      margin:0 auto;
      padding:clamp(10px,2vw,20px) clamp(16px,4vw,40px) clamp(16px,3vw,32px);
      box-sizing:border-box;
      flex:1;
      display:flex;
      flex-direction:column;
      gap:clamp(10px,1.6vh,18px);
    }

    /* Nav wrap (dots / dropdown) */
    .lp-fs-nav-wrap{padding:0;flex-shrink:0;}

    /* Learning Section + Teaching boxes — bigger, more generous, fluid type */
    .lp-fs-learn-sec,.lp-fs-teach{
      background:rgba(99,179,237,.07);
      border:1px solid rgba(99,179,237,.2);
      border-radius:14px;
      padding:clamp(14px,2vw,20px) clamp(16px,2.4vw,24px);
      margin:0;
      max-height:min(32vh,320px);
      overflow-y:auto;
      flex-shrink:0;
    }
    .lp-fs-teach{background:rgba(0,198,167,.07);border-color:rgba(0,198,167,.18);display:flex;gap:12px;align-items:flex-start;}
    .lp-fs-learn-sec::-webkit-scrollbar,.lp-fs-teach::-webkit-scrollbar{width:5px;}
    .lp-fs-learn-sec::-webkit-scrollbar-track,.lp-fs-teach::-webkit-scrollbar-track{background:transparent;}
    .lp-fs-learn-sec::-webkit-scrollbar-thumb{background:rgba(99,179,237,.3);border-radius:99px;}
    .lp-fs-teach::-webkit-scrollbar-thumb{background:rgba(0,198,167,.3);border-radius:99px;}
    .lp-fs-teach-icon{color:var(--teal);font-size:clamp(14px,1.6vw,18px);margin-top:3px;flex-shrink:0;}
    .lp-fs-teach p{font-family:var(--fq);font-size:clamp(13px,1.3vw,16px);color:rgba(255,255,255,.92);line-height:1.65;margin:0;}
    .lp-fs-learn-sec-hd{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
    .lp-fs-learn-sec-hd i{color:#63b3ed;font-size:clamp(13px,1.4vw,16px);flex-shrink:0;}
    .lp-fs-learn-sec-hd span{font-family:var(--fqh);font-size:clamp(10.5px,1vw,12px);font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:#63b3ed;}
    .lp-fs-learn-sec p{font-family:var(--fq);font-size:clamp(13px,1.3vw,16px);color:rgba(255,255,255,.92);line-height:1.65;margin:0;}

    /* Step image */
    .lp-fs-step-img{border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,.08);max-height:min(36vh,340px);display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.03);flex-shrink:0;}
    .lp-fs-step-img img{width:100%;max-height:min(36vh,340px);object-fit:contain;display:block;}

    /* ── Question block — this is the visual anchor of the screen, so it
       gets the largest, clearest, most generous type and grows to fill
       leftover vertical space via flex:1 on its wrapping row below. ── */
    .lp-fs-question-wrap{flex:1;display:flex;flex-direction:column;justify-content:center;min-height:0;gap:clamp(14px,2.2vh,28px);}
    .lp-fs-question{
      font-family:var(--fqh);
      font-size:clamp(19px,2.6vw,34px);
      font-weight:800;
      color:#fff;
      line-height:1.4;
      margin:0;
      box-sizing:border-box;
      width:100%;
      letter-spacing:-.01em;
    }

    /* ── Options — fluid grid: 1 col on phones, 2 cols from tablet up.
       Each option scales its padding/min-height/font with clamp() so
       larger screens get noticeably larger, easier-to-read tap targets
       instead of the same cramped 13px row regardless of screen size. ── */
    .lp-fs-opts{
      display:grid;
      grid-template-columns:1fr;
      gap:clamp(10px,1.4vw,16px);
      box-sizing:border-box;
    }
    .lp-fs-opt{
      background:var(--surf2);
      border:1.5px solid var(--border);
      border-radius:14px;
      padding:clamp(14px,1.6vw,20px) clamp(16px,1.8vw,22px);
      text-align:left;
      font-family:var(--fq);
      font-size:clamp(14.5px,1.5vw,18px);
      font-weight:600;
      color:rgba(255,255,255,.88);
      cursor:pointer;
      transition:all .15s;
      display:flex;
      align-items:flex-start;
      gap:clamp(10px,1.2vw,14px);
      min-height:clamp(54px,7vh,76px);
      box-sizing:border-box;
    }
    .lp-fs-opt:hover:not(:disabled){border-color:rgba(0,198,167,.45);background:rgba(0,198,167,.06);transform:translateY(-1px);}
    .lp-fs-opt:disabled{cursor:default;}
    .lp-fs-letter{width:clamp(26px,2.4vw,32px);height:clamp(26px,2.4vw,32px);border-radius:8px;background:rgba(255,255,255,.09);display:flex;align-items:center;justify-content:center;font-family:var(--fqh);font-size:clamp(12px,1.1vw,14px);font-weight:800;flex-shrink:0;margin-top:1px;}
    .lp-fs-opt-text{flex:1;line-height:1.5;font-size:clamp(14.5px,1.5vw,18px);}
    .lp-fs-opt.correct{border-color:rgba(34,197,94,.55);background:rgba(34,197,94,.1);color:#4ade80;}
    .lp-fs-opt.correct .lp-fs-letter{background:#22c55e;color:#fff;}
    .lp-fs-opt.incorrect{border-color:rgba(239,68,68,.55);background:rgba(239,68,68,.1);color:#f87171;}
    .lp-fs-opt.incorrect .lp-fs-letter{background:#ef4444;color:#fff;}

    /* Feedback panel */
    .lp-fs-feedback{
      border-radius:14px;
      padding:clamp(14px,1.6vw,20px);
      margin:0;
      display:flex;
      gap:12px;
      align-items:flex-start;
      font-family:var(--fq);
      font-size:clamp(13px,1.3vw,16px);
      line-height:1.65;
      color:rgba(255,255,255,.9);
      flex-shrink:0;
    }
    .lp-fs-feedback.good{background:rgba(34,197,94,.09);border:1px solid rgba(34,197,94,.28);}
    .lp-fs-feedback.bad{background:rgba(239,68,68,.09);border:1px solid rgba(239,68,68,.28);}
    .lp-fs-fb-icon{font-size:clamp(18px,2vw,24px);margin-top:2px;flex-shrink:0;}
    .lp-fs-feedback.good .lp-fs-fb-icon{color:#4ade80;}
    .lp-fs-feedback.bad  .lp-fs-fb-icon{color:#f87171;}

    /* Bottom nav row */
    .lp-fs-nav-row{padding:14px 16px calc(14px + env(safe-area-inset-bottom,0px));gap:12px;flex-shrink:0;}
    .lp-fs-nav-row button{flex:1;font-family:var(--fqh);font-size:clamp(13px,1.2vw,15px);min-height:clamp(46px,5.5vh,54px);}

    /* ════════════════════════════════════════════════════════════════════
       RESPONSIVE BREAKPOINTS — Issue 4: desktop / laptop / tablet / mobile
       ════════════════════════════════════════════════════════════════════ */

    /* Tablet portrait and up (≥600px): options move to 2 columns */
    @media(min-width:600px){
      .lp-fs-opts{grid-template-columns:1fr 1fr;}
    }

    /* Tablet landscape / small laptop (≥768px): roomier inner padding,
       Learning Section + Teaching sit side-by-side if both present to
       reclaim vertical space for the question. */
    @media(min-width:768px){
      .lp-fs-header{padding:12px 24px;}
      .lp-fs-nav-wrap{padding:0;}
    }

    /* Laptop / desktop (≥1024px): wider inner column, larger question type
       already handled by clamp() max end; add extra breathing room. */
    @media(min-width:1024px){
      .lp-fs-inner{padding-top:24px;padding-bottom:28px;}
      .lp-fs-question-wrap{gap:28px;}
    }

    /* Large desktop (≥1440px): cap inner width a bit wider, since there's
       more room, but still centered so lines stay readable. */
    @media(min-width:1440px){
      .lp-fs-inner{max-width:1320px;}
    }

    /* Phones (≤599px): single column options, tighter spacing, safe-area
       aware header/footer padding, slightly smaller (but still fluid) type
       floor so text never gets too small to read on a small screen. */
    @media(max-width:599px){
      .lp-fs-header{padding:calc(8px + env(safe-area-inset-top,0px)) 14px 8px;gap:8px;}
      .lp-fs-back{width:38px;height:38px;}
      .lp-fs-title{font-size:12.5px;}
      .lp-fs-qcount,.lp-timer-badge{font-size:11px;padding:3px 9px;}
      .lp-fs-inner{padding:10px 16px 18px;gap:12px;}
      .lp-fs-question{font-size:clamp(18px,5.2vw,22px);line-height:1.38;}
      .lp-fs-opt{min-height:52px;padding:13px 14px;}
      .lp-fs-opt-text{font-size:clamp(14px,3.8vw,15.5px);}
      .lp-fs-learn-sec,.lp-fs-teach{max-height:34vh;padding:13px 14px;}
      .lp-fs-nav-row{padding:10px 14px calc(12px + env(safe-area-inset-bottom,0px));gap:8px;}
      .lp-fs-nav-row button{min-height:48px;font-size:13px;}
    }

    /* Very short viewports (landscape phones, small laptops with browser
       chrome) — shrink the optional Learning Section/Teaching boxes
       further so the question + options remain visible without forcing a
       scroll past the fold. */
    @media(max-height:560px){
      .lp-fs-learn-sec,.lp-fs-teach{max-height:18vh;}
      .lp-fs-question-wrap{gap:10px;}
      .lp-fs-question{font-size:clamp(16px,3vw,20px);}
    }

    /* ── Completed Topics tab ── */
    .ct-group{margin-bottom:18px;}
    .ct-group:last-child{margin-bottom:0;}
    .ct-group-hd{display:flex;align-items:center;gap:12px;padding-bottom:12px;margin-bottom:6px;border-bottom:2px solid;}
    .ct-group-icon{width:36px;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px;}
    .ct-group-name{font-family:var(--fqh);font-size:15px;font-weight:800;color:#fff;}
    .ct-group-count{font-size:11.5px;color:var(--muted);margin-top:1px;}
    .ct-card{display:flex;align-items:flex-start;gap:14px;padding:14px 0;border-bottom:1px solid var(--border);}
    .ct-card:last-child{border-bottom:none;}
    .ct-icon{width:38px;height:38px;border-radius:10px;background:rgba(0,198,167,.1);border:1px solid rgba(0,198,167,.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--teal);font-size:15px;}
    .ct-body{flex:1;min-width:0;}
    .ct-title{font-family:var(--fqh);font-size:13.5px;font-weight:800;color:#fff;margin-bottom:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .ct-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}
    .ct-pill{display:inline-flex;align-items:center;gap:4px;border-radius:100px;padding:2px 9px;font-size:10.5px;font-weight:700;white-space:nowrap;}
    .ct-pill.time{color:#f97316;background:rgba(249,115,22,.08);border:1px solid rgba(249,115,22,.25);}
    .ct-pill.date{color:#60a5fa;background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.25);}
    .ct-pill.score{color:#4ade80;background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.25);}
    .ct-pill.newq{color:#a78bfa;background:rgba(167,139,250,.08);border:1px solid rgba(167,139,250,.3);animation:ct-pulse 2s ease-in-out infinite;}
    @keyframes ct-pulse{0%,100%{opacity:1;}50%{opacity:.65;}}
    .ct-retake-btn{flex-shrink:0;font-size:12px;padding:5px 12px;white-space:nowrap;}
    .ct-subj{font-size:11px;color:rgba(255,255,255,.4);font-weight:600;}
    .ct-empty{text-align:center;color:var(--muted);padding:48px 20px;}
    .ct-empty i{font-size:30px;margin-bottom:12px;display:block;opacity:.35;}
    /* ── Sidebar auto-collapse when question is open (issue 6) ── */
    .dash.quiz-mode .sb{width:0;min-width:0;overflow:hidden;border-right:none;transition:width .25s ease;}
    .dash.quiz-mode .main{flex:1;}
    /* Floating sidebar reveal button — only visible in quiz mode */
    .sb-float-btn{display:none;position:fixed;top:12px;left:12px;z-index:300;width:36px;height:36px;border-radius:9px;border:1px solid rgba(255,255,255,.15);background:rgba(15,20,40,.9);backdrop-filter:blur(8px);color:rgba(255,255,255,.7);font-size:14px;cursor:pointer;align-items:center;justify-content:center;transition:all .18s;}
    .sb-float-btn:hover{background:rgba(0,198,167,.2);color:var(--teal);border-color:rgba(0,198,167,.4);}
    .dash.quiz-mode .sb-float-btn{display:flex;}
    /* When sidebar is temporarily re-opened in quiz mode */
    .dash.quiz-mode .sb.quiz-peek{width:240px;box-shadow:4px 0 24px rgba(0,0,0,.5);position:fixed;left:0;top:0;height:100vh;z-index:295;}
    /* ── Daily board ── */
    .daily-row{display:flex;align-items:center;gap:14px;padding:10px 14px;border-radius:11px;background:var(--surf2);border:1px solid transparent;transition:all .15s;margin-bottom:8px;}
    .daily-row.me{border-color:rgba(245,166,35,.4);background:rgba(245,166,35,.07);}
    .daily-rank{width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:rgba(255,255,255,.55);flex-shrink:0;}
    .daily-rank.top1{background:rgba(245,166,35,.18);color:#f5a623;}
    .daily-rank.top2{background:rgba(203,213,225,.18);color:#cbd5e1;}
    .daily-rank.top3{background:rgba(217,119,6,.18);color:#d97706;}
    .daily-name{flex:1;font-size:13px;font-weight:700;color:#fff;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .daily-stats{display:flex;gap:12px;font-size:11.5px;color:var(--muted);flex-shrink:0;}
    /* ── Leaderboard time-filter pills ── */
    .lb-filter-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;}
    .lb-pill{padding:5px 14px;border-radius:100px;font-family:var(--fb);font-size:12px;font-weight:700;cursor:pointer;transition:all .15s;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:rgba(255,255,255,.55);}
    .lb-pill.active{background:var(--teal);color:#0a0f2c;border-color:var(--teal);}
    .lb-pill:hover:not(.active){background:rgba(255,255,255,.1);color:rgba(255,255,255,.85);}
`;
