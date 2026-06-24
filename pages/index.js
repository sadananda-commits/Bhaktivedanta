import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { LanguageProvider, useLanguage, LanguageToggle } from '../lib/i18n';
import LANDING_FALLBACK_DA from '../lib/landingContentDA';

/* ─────────────────────────────────────────────────────────────────────────────
   FALLBACK DATA
   Shown instantly on first render and used if the sheet is unreachable.
   These are your original hardcoded values — the site never breaks.
───────────────────────────────────────────────────────────────────────────── */
const FALLBACK = {
  classes: [
    { Id: 'KG', Label: 'Kindergarten', Age: '4–5 yrs',  Description: 'Foundational literacy, numeracy, and sensory learning through play-based activities.',       Color: '#f97316' },
    { Id: 'C1', Label: 'Class 1',      Age: '5–6 yrs',  Description: 'Introduction to reading, basic arithmetic, and exploring the natural world.',                 Color: '#eab308' },
    { Id: 'C2', Label: 'Class 2',      Age: '6–7 yrs',  Description: 'Expanding vocabulary, two-digit arithmetic, and basic scientific concepts.',                   Color: '#22c55e' },
    { Id: 'C3', Label: 'Class 3',      Age: '7–8 yrs',  Description: 'Comprehension, multiplication, introduction to geography and Indian history.',                  Color: '#00c6a7' },
    { Id: 'C4', Label: 'Class 4',      Age: '8–9 yrs',  Description: 'Essay writing, fractions, forces & matter, world geography, freedom movement.',                 Color: '#3b82f6' },
    { Id: 'C5', Label: 'Class 5',      Age: '9–10 yrs', Description: 'Advanced comprehension, geometry, ecosystems, map reading, and ancient civilizations.',         Color: '#a855f7' },
  ],
  subjects: [
    { Name: 'English',     Icon: 'fa-book',           Color: '#3b82f6', Topics: 'Phonics · Grammar · Reading Comprehension · Creative Writing',      Goal: 'Confident communication and expressive writing',  Method: 'Story-based learning, role-play, reading circles' },
    { Name: 'Mathematics', Icon: 'fa-calculator',     Color: '#f97316', Topics: 'Arithmetic · Fractions · Geometry · Word Problems',                  Goal: 'Analytical thinking and problem solving',         Method: 'Visual aids, manipulatives, structured worksheets' },
    { Name: 'Science',     Icon: 'fa-flask',          Color: '#22c55e', Topics: 'Plant Life · Human Body · Force & Matter · Simple Machines',         Goal: 'Curiosity-driven empirical understanding',        Method: 'Experiments, observations, model building' },
    { Name: 'Geography',   Icon: 'fa-earth-americas', Color: '#eab308', Topics: 'Maps · Climate Zones · Landforms · Natural Resources',               Goal: 'Spatial awareness and global knowledge',          Method: 'Map exercises, documentary clips, field discussions' },
    { Name: 'History',     Icon: 'fa-landmark',       Color: '#a855f7', Topics: 'Early Civilizations · Indian History · National Movements · Culture', Goal: 'Cultural identity and chronological awareness',   Method: 'Timelines, storytelling, primary source discussion' },
  ],
  schedules: [
    { Batch: 'Morning Batch',   Days: 'Mon – Fri', Time: '7:00 AM – 8:30 AM',  Mode: 'Physical', Seats: '3', Color: '#f97316' },
    { Batch: 'Afternoon Batch', Days: 'Mon – Fri', Time: '3:30 PM – 5:00 PM',  Mode: 'Physical', Seats: '1', Color: '#eab308' },
    { Batch: 'Evening Batch',   Days: 'Mon – Fri', Time: '6:00 PM – 7:30 PM',  Mode: 'Online',   Seats: '4', Color: '#22c55e' },
    { Batch: 'Weekend Morning', Days: 'Sat – Sun', Time: '9:00 AM – 11:00 AM', Mode: 'Hybrid',   Seats: '5', Color: '#3b82f6' },
    { Batch: 'Weekend Evening', Days: 'Sat – Sun', Time: '4:00 PM – 6:00 PM',  Mode: 'Online',   Seats: '2', Color: '#a855f7' },
  ],
  fees: [
    { Tier: 'Single Subject', Price: '₹1,500', Period: '/month', Perks: '1 Subject|Weekly Tests|Homework Support|Progress Reports',                                     Highlight: 'FALSE' },
    { Tier: 'Core Pack',      Price: '₹3,500', Period: '/month', Perks: '3 Subjects|Weekly Tests|Homework Support|Progress Reports|Parent Meetings',                    Highlight: 'TRUE'  },
    { Tier: 'Full Academy',   Price: '₹5,500', Period: '/month', Perks: 'All 5 Subjects|Daily Tests|Homework Support|Progress Reports|Parent Meetings|Exam Prep',        Highlight: 'FALSE' },
  ],
  testimonials: [
    { Name: 'Priya Mehta',   Role: 'Parent, Class 3',     Text: 'My son went from struggling with fractions to topping his school test in just two months. The teachers here genuinely care.' },
    { Name: 'Rajiv Sinha',   Role: 'Parent, Class 5',     Text: "The real-time dashboard helps me track my daughter's progress without having to call the teacher every week. Brilliant system." },
    { Name: 'Anjali Kapoor', Role: 'Parent, KG & Class 2', Text: 'Both my kids attend and the micro-batch approach means neither of them ever feels lost or ignored.' },
  ],
  teachers: [
    { Id: 'T01', Name: 'Mrs. Anjali Sharma', Qualification: 'M.Sc. Mathematics · B.Ed',      Experience: '5 Years', Subjects: 'Mathematics & Science', Bio: 'Renowned for making complex concepts feel intuitive. Her students consistently rank in the top 10% of their school exams.' },
    { Id: 'T02', Name: 'Mr. Pradeep Nair',   Qualification: 'M.A. English Literature · B.Ed', Experience: '7 Years', Subjects: 'English & History',     Bio: 'Award-winning educator whose storytelling approach brings history and language to life in every session.' },
  ],
  faqs: [
    { Question: 'What age groups do you teach?',           Answer: 'We cover Kindergarten (age 4–5) through Class 5 (age 9–10), following the CBSE curriculum framework.' },
    { Question: 'How many students are in each batch?',    Answer: 'We strictly limit batches to a maximum of 5 students to guarantee individual attention and a personalised learning experience.' },
    { Question: 'Do you offer online classes?',            Answer: 'Yes. We offer Physical, Online (via Google Meet / Zoom), and Hybrid formats. You choose your preferred mode during enrollment.' },
    { Question: 'What happens after I submit the form?',   Answer: 'Your Student ID, username, and temporary password are generated instantly. You can log in to the Student Portal immediately.' },
    { Question: 'Can I change my schedule after joining?', Answer: 'Yes, schedule changes can be requested through the portal or by contacting the registrar, subject to seat availability.' },
    { Question: 'Are study materials provided?',           Answer: 'Yes. Worksheets, practice papers, and reading materials are uploaded directly to your student dashboard.' },
  ],
  about: [
    { Icon: 'fa-users-between-lines', IconBg: 'rgba(0,198,167,.1)',   IconColor: 'var(--teal)',  Heading: 'Micro-Batch Teaching',           Body: 'Strictly limited to 5 students per batch — every child receives undivided attention and a truly personalised learning path.' },
    { Icon: 'fa-chart-line',          IconBg: 'rgba(245,166,35,.1)',  IconColor: 'var(--accent)', Heading: 'Live Progress Dashboards',        Body: 'Parents and students access real-time academic logs — homework completion, attendance, quiz scores, and growth metrics updated daily.' },
    { Icon: 'fa-map-pin',             IconBg: 'rgba(99,102,241,.1)',  IconColor: '#818cf8',      Heading: 'CBSE Blueprint Mapping',          Body: 'Every lesson plan is meticulously mapped to current CBSE standards, ensuring students are always ahead of classroom expectations.' },
    { Icon: 'fa-laptop-code',         IconBg: 'rgba(239,68,68,.1)',   IconColor: '#f87171',      Heading: 'Physical, Online & Hybrid',       Body: 'Choose the format that works best for your family. Switch modes anytime through the student portal — no questions asked.' },
    { Icon: 'fa-medal',               IconBg: 'rgba(168,85,247,.1)',  IconColor: '#a855f7',      Heading: 'Proven Results',                  Body: 'Our students consistently rank in the top 15% of their school exams within three months of joining — measurable, visible improvement.' },
    { Icon: 'fa-shield-halved',       IconBg: 'rgba(34,197,94,.1)',   IconColor: '#22c55e',      Heading: 'Background-Verified Teachers',    Body: 'All teachers are degree-qualified, B.Ed certified, DBS checked, and trained in child-centred primary developmental learning.' },
  ],
  contact: {
    whatsappNumber: '919999999999',
    phone:          '+91 99999 99999',
    email:          'support@vedantaacademy.com',
    address:        'Sector 15, Block C, New Delhi',
  },
  hero: {
    badge:      'CBSE Certified · KG to Class 5',
    headline:   "Where every child's potential is unlocked",
    headlineLine1: "Where every child's",
    headlineLine2: 'potential is unlocked',
    subheadline:'Premium, personalised CBSE home tuition with expert mentors, micro-batches of 5, and a real-time student portal to track every step of your child\'s growth.',
    btn1Text:   'Enroll Now — Free',
    btn1Link:   '#enroll',
    btn2Text:   'Student Login',
    btn2Link:   '/portal',
    stat1Num:   '5',   stat1Label: 'Students Max Per Batch',
    stat2Num:   '98%', stat2Label: 'Parent Satisfaction',
    stat3Num:   '6',   stat3Label: 'Class Levels KG – Class 5',
    stat4Num:   '5',   stat4Label: 'Core Subjects',
    feat1: 'Live attendance & homework tracking',
    feat2: 'Personalised progress dashboards',
    feat3: 'Physical, Online & Hybrid options',
    feat4: 'CBSE blueprint-aligned content',
  },
};

function HomeInner() {
  const { lang, t } = useLanguage();
  // Canonical English subject names (as recorded by the backend/leaderboard,
  // see pages/portal.js's onAnswer call) mapped to their Danish display
  // names, for showing translated subject names next to backend-supplied
  // data on the public stats section. Falls back to the raw English name
  // for any subject without a Danish mapping yet.
  const SUBJECT_DISPLAY_DA = {
    'Science': 'Naturfag', 'Mathematics': 'Matematik', 'English Grammar': 'English Grammar',
    'Social Studies': 'Samfundsfag', 'General Knowledge': 'Almen Viden',
  };
  const subjectDisplay = (name) => lang === 'da' ? (SUBJECT_DISPLAY_DA[name] || name) : name;
  // The live Google Sheet behind /api/content is English-only content
  // (teachers edit it in English) — it has no Danish column today. So:
  //  - English: fetch and prefer live Sheet data, same as before.
  //  - Danish: use the hand-translated LANDING_FALLBACK_DA dataset and
  //    skip the Sheet fetch overwrite entirely, so Danish text is never
  //    silently replaced by English Sheet content.
  // See the README note added during this Danish-language rollout for how
  // to extend the Sheet itself with Danish columns later if desired.
  const baseFallback = lang === 'da' ? LANDING_FALLBACK_DA : FALLBACK;
  const [cms, setCms] = useState(baseFallback);
  // Public-site mobile nav: the hamburger button existed in markup already
  // but had no handler and no menu to open — .nav-links simply vanishes
  // below 900px with no way to reach Classes/Subjects/Schedule/etc. on a
  // phone. Same off-canvas-drawer fix as the Student Portal's sidebar.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Whenever the language changes, immediately reset cms to that language's
  // fallback so the UI never shows a mix of English Sheet data and Danish
  // static text (or vice versa) while a fetch is in flight.
  useEffect(() => {
    setCms(lang === 'da' ? LANDING_FALLBACK_DA : FALLBACK);
  }, [lang]);

  // ── Fetch live data from Google Sheet via /api/content ──────────────────
  // Only fetched/applied in English — see note above.
  useEffect(() => {
    if (lang !== 'en') return;
    let cancelled = false;
    fetch('/api/content')
      .then(r => r.json())
      .then(data => {
        // Guard against a race: if the user switched language away and back
        // while this fetch was in flight, a stale response must never
        // overwrite cms after a newer effect run already took over.
        if (cancelled) return;
        // Accept data from sheet OR stale cache — only skip if explicit fallback with no real data
        if (data.source === 'fallback' && !data.hero && !data.classes) {
          console.warn('[cms] Using hardcoded fallback — sheet unavailable:', data.error);
          return;
        }
        setCms({
          hero:         Object.keys(data.hero    || {}).length ? data.hero         : FALLBACK.hero,
          about:        data.about?.length                     ? data.about        : FALLBACK.about,
          classes:      data.classes?.length                   ? data.classes      : FALLBACK.classes,
          subjects:     data.subjects?.length                  ? data.subjects     : FALLBACK.subjects,
          schedules:    data.schedules?.length                 ? data.schedules    : FALLBACK.schedules,
          fees:         data.fees?.length                      ? data.fees         : FALLBACK.fees,
          testimonials: data.testimonials?.length              ? data.testimonials : FALLBACK.testimonials,
          teachers:     data.teachers?.length                  ? data.teachers     : FALLBACK.teachers,
          faqs:         data.faqs?.length                      ? data.faqs         : FALLBACK.faqs,
          contact:      Object.keys(data.contact || {}).length ? data.contact      : FALLBACK.contact,
        });
      })
      .catch(err => { if (!cancelled) console.warn('[cms] Fetch error, using fallback:', err.message); });
    return () => { cancelled = true; };
  }, [lang]);

  // ── Portal Dashboard (Req #8): live aggregate stats from /api/portal-stats,
  // a separate public endpoint backed by the same Apps Script as the student
  // portal's progress/leaderboard data. Starts null so the section can render
  // a loading skeleton instead of flashing zeroes before the real numbers
  // arrive — these are real counts, not content a hardcoded fallback can
  // meaningfully approximate.
  const [portalStats, setPortalStats] = useState(null);
  useEffect(() => {
    fetch('/api/portal-stats')
      .then(r => r.json())
      .then(data => setPortalStats(data))
      .catch(err => { console.warn('[portal-stats] Fetch error:', err.message); setPortalStats(false); });
  }, []);

  // ── Top Students leaderboard table (Req #7): sortable + paginated client-side
  // from the ranked list /api/portal-stats already returns (already sorted by
  // rank/correct server-side, so 'rank' sort is just the original order).
  const [lbSort, setLbSort] = useState('rank'); // 'rank' | 'attempted' | 'accuracy'
  const [lbPage, setLbPage] = useState(0);
  const LB_PAGE_SIZE = 10;

  const [formStatus, setFormStatus] = useState({ state: 'idle', studentId: '', username: '', tempPassword: '', note: '' });
  const [openFaq, setOpenFaq]       = useState(null);
  // Role selector: null = not yet chosen, 'Student'/'Parent'/'Teacher' = chosen
  const [enrollRole, setEnrollRole] = useState(null);
  const [step, setStep]             = useState(1);
  const [formData, setFormData]     = useState({
    studentName: '', dob: '', gender: '', schoolName: '', classLevel: '',
    parentName: '', email: '', phone: '', emergencyContact: '', address: '',
    teacherId: '', timeSlot: '', learningMode: '', subjects: [],
  });
  // Parent / Teacher form data (separate — never mixes with student fields)
  const [ptFormData, setPtFormData] = useState({
    fullName: '', email: '', phone: '', address: '',
    linkedStudentId: '', subject: '', qualification: '',
  });

  const saveStepAndAdvance = (e, nextStep) => {
    const fd = new FormData(e.currentTarget.closest('form'));
    const updates = {};
    if (nextStep > 1) {
      updates.studentName = fd.get('studentName') || formData.studentName;
      updates.dob         = fd.get('dob')         || formData.dob;
      updates.gender      = fd.get('gender')      || formData.gender;
      updates.schoolName  = fd.get('schoolName')  || formData.schoolName;
      updates.classLevel  = fd.get('classLevel')  || formData.classLevel;
    }
    if (nextStep > 2) {
      updates.parentName       = fd.get('parentName')       || formData.parentName;
      updates.email            = fd.get('email')            || formData.email;
      updates.phone            = fd.get('phone')            || formData.phone;
      updates.emergencyContact = fd.get('emergencyContact') || formData.emergencyContact;
      updates.address          = fd.get('address')          || formData.address;
    }
    if (nextStep > 3) {
      updates.teacherId    = fd.get('teacherId')    || formData.teacherId;
      updates.timeSlot     = fd.get('timeSlot')     || formData.timeSlot;
      updates.learningMode = fd.get('learningMode') || formData.learningMode;
      const subs = fd.getAll('subjects');
      updates.subjects = subs.length > 0 ? subs : formData.subjects;
    }
    setFormData(prev => ({ ...prev, ...updates }));
    setStep(nextStep);
  };

  const handleEnroll = async (e) => {
    e.preventDefault();
    setFormStatus({ state: 'loading', studentId: '', username: '', tempPassword: '' });
    const payload = { ...formData };
    try {
      const res  = await fetch('/api/enroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (res.ok && data.success) {
        setFormStatus({ state: 'success', studentId: data.studentId, username: data.username, tempPassword: data.tempPassword, note: '' });
        setFormData({ studentName:'', dob:'', gender:'', schoolName:'', classLevel:'', parentName:'', email:'', phone:'', emergencyContact:'', address:'', teacherId:'', timeSlot:'', learningMode:'', subjects:[] });
        setStep(1);
      } else {
        setFormStatus({ state: 'error', message: data.message || t('f_generic_error'), studentId: '', username: '', tempPassword: '' });
      }
    } catch {
      setFormStatus({ state: 'error', message: t('f_connection_failed'), studentId: '', username: '', tempPassword: '' });
    }
  };

  // ── PT form: save details and advance to confirm step ───────────────────
  const saveStepAndAdvancePT = (e, nextStep) => {
    const fd = new FormData(e.currentTarget.closest('form'));
    setPtFormData(prev => ({
      ...prev,
      fullName:        fd.get('fullName')        || prev.fullName,
      email:           fd.get('email')           || prev.email,
      phone:           fd.get('phone')           || prev.phone,
      address:         fd.get('address')         || prev.address,
      linkedStudentId: fd.get('linkedStudentId') || prev.linkedStudentId,
      subject:         fd.get('subject')         || prev.subject,
      qualification:   fd.get('qualification')   || prev.qualification,
    }));
    setStep(nextStep);
  };

  // ── Parent / Teacher registration submit ────────────────────────────────
  const handleEnrollPT = async (e) => {
    e.preventDefault();
    setFormStatus({ state: 'loading', studentId: '', username: '', tempPassword: '' });
    try {
      const res  = await fetch('/api/enroll-pt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: enrollRole, ...ptFormData }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFormStatus({ state: 'success', studentId: data.id, username: data.username, tempPassword: data.tempPassword, note: data.note || '' });
        setPtFormData({ fullName:'', email:'', phone:'', address:'', linkedStudentId:'', subject:'', qualification:'' });
        setStep(1);
      } else {
        setFormStatus({ state: 'error', message: data.message || t('f_generic_error'), studentId: '', username: '', tempPassword: '' });
      }
    } catch {
      setFormStatus({ state: 'error', message: t('f_connection_failed'), studentId: '', username: '', tempPassword: '' });
    }
  };

  // ── Convenience shorthands ──────────────────────────────────────────────
  const h = cms.hero;
  const c = cms.contact;

  // Derive the table's row data once per render from the raw ranked list.
  // `attempted` isn't guaranteed present on every backend row (see the
  // comment on /api/portal-stats) — prefer it when present, otherwise
  // derive an approximate count from correct/accuracy so the column never
  // shows blank, just possibly-rounded.
  const lbRawRows = portalStats?.leaderboardOverall || [];
  const lbRows = lbRawRows.map((row, i) => {
    const attempted = typeof row.attempted === 'number'
      ? row.attempted
      : (row.accuracy ? Math.round((row.correct || 0) / (row.accuracy / 100)) : (row.correct || 0));
    return { ...row, attempted, rank: i + 1 };
  });
  const lbSorted = [...lbRows].sort((a, b) => {
    if (lbSort === 'attempted') return b.attempted - a.attempted;
    if (lbSort === 'accuracy') return (b.accuracy || 0) - (a.accuracy || 0);
    return a.rank - b.rank;
  });
  const lbPageCount = Math.max(1, Math.ceil(lbSorted.length / LB_PAGE_SIZE));
  const lbPageClamped = Math.min(lbPage, lbPageCount - 1);
  const lbPageRows = lbSorted.slice(lbPageClamped * LB_PAGE_SIZE, lbPageClamped * LB_PAGE_SIZE + LB_PAGE_SIZE);

  return (
    <>
      <Head>
        <title>{t('page_title')}</title>
        <meta name="description" content={t('page_meta_description')} />
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
          body{font-family:var(--font-b);color:var(--text);background:var(--surface-alt);-webkit-font-smoothing:antialiased;}

          /* NAV */
          .nav{position:sticky;top:0;z-index:200;background:rgba(10,15,44,.97);backdrop-filter:blur(14px);border-bottom:1px solid rgba(255,255,255,.07);}
          .nav-i{max-width:1200px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;height:66px;}
          .logo{display:flex;align-items:center;gap:10px;text-decoration:none;}
          .logo-box{width:36px;height:36px;background:var(--accent);border-radius:9px;display:flex;align-items:center;justify-content:center;color:var(--navy);font-size:17px;}
          .logo-txt{font-family:var(--font-d);font-size:19px;font-weight:900;color:#fff;}
          .nav-links{display:flex;align-items:center;gap:4px;}
          .nl{color:rgba(255,255,255,.65);text-decoration:none;font-size:13px;font-weight:500;padding:7px 12px;border-radius:8px;transition:all .2s;}
          .nl:hover{color:#fff;background:rgba(255,255,255,.08);}
          .n-portal{border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.8);padding:8px 16px;border-radius:9px;font-size:13px;text-decoration:none;font-weight:500;transition:all .2s;}
          .n-portal:hover{border-color:var(--teal);color:var(--teal);}
          .n-cta{background:var(--accent);color:var(--navy);font-weight:700;padding:8px 18px;border-radius:9px;font-size:13px;text-decoration:none;transition:all .2s;}
          .n-cta:hover{background:var(--accent-light);transform:translateY(-1px);}
          .hm{display:none;background:none;border:none;color:#fff;font-size:20px;cursor:pointer;padding:12px;width:44px;height:44px;align-items:center;justify-content:center;}
          @media(max-width:900px){.nav-links{display:none;}.hm{display:flex;}}
          .mnav-backdrop{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:290;opacity:0;pointer-events:none;transition:opacity .2s ease;}
          .mnav-drawer{display:none;position:fixed;top:0;right:0;bottom:0;width:80vw;max-width:320px;background:var(--navy);z-index:300;
            transform:translateX(100%);transition:transform .25s ease;box-shadow:0 0 40px rgba(0,0,0,.4);flex-direction:column;overflow-y:auto;}
          .mnav-drawer.open{transform:translateX(0);}
          .mnav-drawer-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid rgba(255,255,255,.08);}
          .mnav-drawer-close{background:rgba(255,255,255,.06);border:none;color:rgba(255,255,255,.7);width:32px;height:32px;border-radius:9px;cursor:pointer;font-size:14px;}
          .mnav-drawer-close:hover{background:rgba(255,255,255,.12);color:#fff;}
          .mnav-drawer-links{display:flex;flex-direction:column;gap:4px;padding:16px 20px;}
          .mnav-drawer-links .nl{padding:12px 14px;font-size:14px;}
          @media(max-width:900px){
            .mnav-drawer{display:flex;}
            .mnav-backdrop{display:block;}
            .mnav-backdrop.open{opacity:1;pointer-events:auto;}
          }

          /* HERO */
          .hero{background:var(--navy);min-height:90vh;display:flex;align-items:center;position:relative;overflow:hidden;}
          .hero::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse 60% 60% at 70% 40%,rgba(0,198,167,.13) 0%,transparent 60%),radial-gradient(ellipse 40% 40% at 20% 70%,rgba(245,166,35,.10) 0%,transparent 60%);}
          .hgrid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:60px 60px;}
          .hero-in{max-width:1200px;margin:0 auto;padding:100px 24px 80px;display:grid;grid-template-columns:1fr 400px;gap:60px;align-items:center;position:relative;z-index:1;}
          .badge{display:inline-flex;align-items:center;gap:7px;background:rgba(0,198,167,.12);border:1px solid rgba(0,198,167,.3);color:var(--teal);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:5px 13px;border-radius:100px;margin-bottom:22px;}
          .h1{font-family:var(--font-d);font-size:clamp(34px,4vw,56px);font-weight:900;line-height:1.12;color:#fff;margin-bottom:18px;}
          .h1 span{color:var(--accent);}
          .hero-p{font-size:16px;color:rgba(255,255,255,.65);line-height:1.75;margin-bottom:34px;max-width:480px;}
          .hero-btns{display:flex;gap:12px;flex-wrap:wrap;}
          .btn{display:inline-flex;align-items:center;gap:8px;font-weight:700;font-size:14px;padding:13px 24px;border-radius:11px;text-decoration:none;transition:all .25s;border:none;cursor:pointer;font-family:var(--font-b);}
          .btn-accent{background:var(--accent);color:var(--navy);}
          .btn-accent:hover{background:var(--accent-light);transform:translateY(-2px);box-shadow:0 8px 28px rgba(245,166,35,.35);}
          .btn-ghost{background:rgba(255,255,255,.07);color:rgba(255,255,255,.85);border:1px solid rgba(255,255,255,.12);}
          .btn-ghost:hover{background:rgba(255,255,255,.12);color:#fff;}
          .hero-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:22px;padding:28px;backdrop-filter:blur(8px);}
          .sgrid{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
          .sc{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:13px;padding:18px;text-align:center;}
          .sc-n{font-family:var(--font-d);font-size:30px;font-weight:900;color:var(--accent);line-height:1;margin-bottom:5px;}
          .sc-l{font-size:11px;color:rgba(255,255,255,.45);font-weight:500;}
          .hdiv{border:none;border-top:1px solid rgba(255,255,255,.1);margin:20px 0;}
          .hfeats{display:flex;flex-direction:column;gap:10px;}
          .hfeat{display:flex;align-items:center;gap:9px;color:rgba(255,255,255,.65);font-size:13px;font-weight:500;}
          .hfeat i{color:var(--teal);font-size:12px;width:16px;}
          @media(max-width:860px){.hero-in{grid-template-columns:1fr;}.hero-card{display:none;}}

          /* SECTION WRAPPER */
          .sec{padding:88px 24px;}
          .sec-in{max-width:1200px;margin:0 auto;}
          .sec-lbl{font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--teal);margin-bottom:10px;}
          .sec-h{font-family:var(--font-d);font-size:clamp(26px,3.5vw,42px);font-weight:900;color:var(--navy);line-height:1.15;margin-bottom:14px;}
          .sec-sub{font-size:15px;color:var(--muted);line-height:1.75;max-width:540px;}
          .sec-dark{background:var(--navy);}
          .sec-dark .sec-lbl{color:var(--accent);}
          .sec-dark .sec-h{color:#fff;}
          .sec-dark .sec-sub{color:rgba(255,255,255,.5);}
          .sec-alt{background:var(--surface-alt);}

          /* ABOUT / WHY */
          .why-g{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:52px;}
          .why-c{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:28px;transition:all .3s;}
          .why-c:hover{transform:translateY(-4px);box-shadow:var(--shadow-lg);border-color:var(--teal);}
          .why-ic{width:48px;height:48px;border-radius:13px;display:flex;align-items:center;justify-content:center;font-size:19px;margin-bottom:18px;}
          .why-c h3{font-size:17px;font-weight:700;margin-bottom:9px;color:var(--navy);}
          .why-c p{font-size:13px;color:var(--muted);line-height:1.7;}
          @media(max-width:720px){.why-g{grid-template-columns:1fr;}}

          /* PORTAL DASHBOARD */
          .pd-stats-g{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:52px;}
          .pd-stat-c{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:var(--radius);padding:24px;text-align:center;transition:all .3s;}
          .pd-stat-c:hover{transform:translateY(-3px);background:rgba(255,255,255,.07);}
          .pd-stat-ic{width:42px;height:42px;border-radius:12px;background:rgba(0,198,167,.12);color:var(--teal);display:flex;align-items:center;justify-content:center;font-size:17px;margin:0 auto 14px;}
          .pd-stat-v{font-family:var(--font-d);font-size:30px;font-weight:900;color:#fff;line-height:1;margin-bottom:6px;}
          .pd-stat-l{font-size:11px;color:rgba(255,255,255,.45);font-weight:600;text-transform:uppercase;letter-spacing:.06em;}
          .pd-skel{display:inline-block;width:50px;height:24px;border-radius:6px;background:rgba(255,255,255,.08);animation:pdpulse 1.4s ease-in-out infinite;}
          @keyframes pdpulse{0%,100%{opacity:1}50%{opacity:.35}}
          .pd-row{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:40px;}
          .pd-sub-h{font-size:13px;font-weight:700;color:#fff;margin-bottom:16px;display:flex;align-items:center;gap:8px;}
          .pd-sub-h i{color:var(--accent);}
          .pd-champ-list,.pd-activity-list{display:flex;flex-direction:column;gap:10px;}
          .pd-champ-c{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:16px 18px;display:flex;align-items:center;gap:14px;}
          .pd-champ-overall{border-color:rgba(245,166,35,.35);background:rgba(245,166,35,.06);}
          .pd-champ-ic{width:40px;height:40px;border-radius:11px;background:rgba(245,166,35,.15);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;}
          .pd-champ-tag{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:rgba(255,255,255,.4);margin-bottom:3px;}
          .pd-champ-name{font-size:14px;font-weight:800;color:#fff;}
          .pd-champ-meta{font-size:11.5px;color:rgba(255,255,255,.5);margin-top:2px;}
          .pd-activity-row{display:flex;align-items:flex-start;gap:11px;padding:11px 4px;border-bottom:1px solid rgba(255,255,255,.06);}
          .pd-activity-row:last-child{border-bottom:none;}
          .pd-activity-dot{width:7px;height:7px;border-radius:50%;background:var(--teal);margin-top:6px;flex-shrink:0;}
          .pd-activity-text{font-size:13px;color:rgba(255,255,255,.7);line-height:1.6;}
          .pd-activity-text strong{color:#fff;font-weight:700;}
          .pd-activity-subj{color:rgba(255,255,255,.4);}
          .pd-empty,.pd-error{text-align:center;color:rgba(255,255,255,.4);font-size:13px;padding:20px;background:rgba(255,255,255,.03);border-radius:12px;margin-top:30px;}

          /* Top Students leaderboard table (Req #7) */
          .pd-lb-section{margin-top:48px;}
          .pd-lb-table-wrap{margin-top:18px;}
          .pd-lb-table{width:100%;border-collapse:collapse;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:14px;overflow:hidden;}
          .pd-lb-table thead{background:rgba(255,255,255,.04);}
          .pd-lb-table th{text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:rgba(255,255,255,.45);padding:13px 16px;}
          .pd-lb-table td{padding:13px 16px;font-size:13.5px;color:rgba(255,255,255,.85);border-top:1px solid rgba(255,255,255,.06);}
          .pd-lb-sort-btn{background:none;border:none;color:inherit;font:inherit;text-transform:inherit;letter-spacing:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:5px;padding:0;}
          .pd-lb-sort-btn:hover{color:var(--teal);}
          .pd-lb-rank{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,.08);font-weight:800;font-size:12px;color:rgba(255,255,255,.7);}
          .pd-lb-rank.top1{background:linear-gradient(135deg,#f5c518,#e0a800);color:#2b2200;}
          .pd-lb-rank.top2{background:linear-gradient(135deg,#cfd8e3,#9aa7b5);color:#1a2330;}
          .pd-lb-rank.top3{background:linear-gradient(135deg,#d99355,#b06a30);color:#2b1700;}
          .pd-lb-name{font-weight:700;color:#fff;}
          .pd-lb-acc-pill{display:inline-block;padding:3px 10px;border-radius:100px;background:rgba(0,198,167,.14);color:var(--teal);font-weight:700;font-size:12px;}
          .pd-lb-cards{display:none;}
          .pd-lb-card{display:flex;align-items:center;gap:13px;padding:13px 14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;margin-bottom:9px;}
          .pd-lb-card-body{flex:1;min-width:0;}
          .pd-lb-card-meta{font-size:12px;color:rgba(255,255,255,.5);margin-top:2px;}
          .pd-lb-pagination{display:flex;align-items:center;justify-content:center;gap:16px;margin-top:18px;}
          .pd-lb-page-btn{padding:9px 16px;font-size:12.5px;}
          .pd-lb-page-btn:disabled{opacity:.35;cursor:not-allowed;}
          .pd-lb-page-lbl{font-size:12.5px;color:rgba(255,255,255,.5);font-weight:600;}
          @media(max-width:640px){
            .pd-lb-table-wrap .pd-lb-table{display:none;}
            .pd-lb-cards{display:block;}
          }

          .pd-cta{margin-top:44px;padding-top:36px;border-top:1px solid rgba(255,255,255,.08);text-align:center;}
          .pd-cta p{font-size:14px;color:rgba(255,255,255,.6);margin-bottom:16px;}
          @media(max-width:900px){.pd-stats-g{grid-template-columns:1fr 1fr;}.pd-row{grid-template-columns:1fr;}}
          @media(max-width:480px){.pd-stats-g{grid-template-columns:1fr;}}

          /* CLASSES */
          .cls-g{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:52px;}
          .cls-c{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:var(--radius);padding:26px;transition:all .3s;}
          .cls-c:hover{transform:translateY(-3px);background:rgba(255,255,255,.07);}
          .cls-chip{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:4px 10px;border-radius:100px;margin-bottom:14px;}
          .cls-label{font-family:var(--font-d);font-size:22px;font-weight:900;color:#fff;margin-bottom:4px;}
          .cls-age{font-size:12px;color:rgba(255,255,255,.45);margin-bottom:12px;}
          .cls-desc{font-size:13px;color:rgba(255,255,255,.65);line-height:1.7;}
          @media(max-width:720px){.cls-g{grid-template-columns:1fr 1fr;}}
          @media(max-width:480px){.cls-g{grid-template-columns:1fr;}}

          /* SUBJECTS */
          .subj-g{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:52px;}
          .subj-c{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:28px;transition:all .3s;}
          .subj-c:hover{box-shadow:var(--shadow-lg);transform:translateY(-3px);}
          .subj-hd{display:flex;align-items:center;gap:14px;margin-bottom:18px;}
          .subj-ic{width:46px;height:46px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;}
          .subj-nm{font-size:19px;font-weight:800;color:var(--navy);}
          .subj-row{display:flex;flex-direction:column;gap:10px;}
          .subj-item label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);display:block;margin-bottom:3px;}
          .subj-item p{font-size:13px;color:var(--text);line-height:1.6;}
          @media(max-width:720px){.subj-g{grid-template-columns:1fr;}}

          /* SCHEDULE */
          .sched-g{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:52px;}
          .sched-c{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:var(--radius);padding:24px;transition:all .3s;}
          .sched-c:hover{background:rgba(255,255,255,.07);}
          .sched-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}
          .sched-batch{font-size:15px;font-weight:800;color:#fff;}
          .mode-tag{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:4px 10px;border-radius:100px;}
          .sched-rows{display:flex;flex-direction:column;gap:8px;}
          .sched-row{display:flex;align-items:center;gap:10px;font-size:13px;color:rgba(255,255,255,.65);}
          .sched-row i{color:var(--teal);font-size:12px;width:14px;}
          .seats{display:flex;align-items:center;gap:6px;margin-top:16px;font-size:12px;font-weight:700;}
          .seat-dot{width:8px;height:8px;border-radius:50%;background:var(--teal);}
          .seat-dot.few{background:#f97316;}
          .seat-dot.last{background:#ef4444;}
          @media(max-width:900px){.sched-g{grid-template-columns:1fr 1fr;}}
          @media(max-width:560px){.sched-g{grid-template-columns:1fr;}}

          /* FEES */
          .fees-g{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:52px;}
          .fee-c{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:32px;position:relative;transition:all .3s;}
          .fee-c:hover{box-shadow:var(--shadow-lg);}
          .fee-c.hi{border-color:var(--teal);box-shadow:0 0 0 1px var(--teal);}
          .fee-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:var(--teal);color:#fff;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;padding:4px 14px;border-radius:100px;white-space:nowrap;}
          .fee-tier{font-size:13px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;}
          .fee-price{font-family:var(--font-d);font-size:38px;font-weight:900;color:var(--navy);line-height:1;}
          .fee-period{font-size:13px;color:var(--muted);margin-bottom:24px;}
          .fee-perks{display:flex;flex-direction:column;gap:10px;margin-bottom:28px;}
          .fee-perk{display:flex;align-items:center;gap:9px;font-size:13px;color:var(--text);}
          .fee-perk i{color:var(--teal);font-size:12px;}
          @media(max-width:720px){.fees-g{grid-template-columns:1fr;}}

          /* TESTIMONIALS */
          .test-g{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:52px;}
          .test-c{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:var(--radius);padding:26px;}
          .test-q{font-size:32px;color:var(--teal);line-height:1;margin-bottom:12px;}
          .test-txt{font-size:14px;color:rgba(255,255,255,.7);line-height:1.75;margin-bottom:20px;}
          .test-auth{display:flex;align-items:center;gap:12px;}
          .test-av{width:40px;height:40px;border-radius:12px;background:rgba(0,198,167,.15);display:flex;align-items:center;justify-content:center;color:var(--teal);font-size:16px;}
          .test-name{font-size:14px;font-weight:700;color:#fff;}
          .test-role{font-size:12px;color:rgba(255,255,255,.4);}
          @media(max-width:720px){.test-g{grid-template-columns:1fr;}}

          /* TEACHERS */
          .teach-g{display:grid;grid-template-columns:repeat(2,1fr);gap:24px;margin-top:52px;}
          .teach-c{background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:28px;display:flex;gap:20px;align-items:flex-start;transition:all .3s;}
          .teach-c:hover{box-shadow:var(--shadow-lg);transform:translateY(-3px);}
          .teach-av{width:64px;height:64px;border-radius:16px;background:linear-gradient(135deg,var(--navy),#2a3a7c);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:24px;color:rgba(255,255,255,.4);}
          .teach-id{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--teal);background:rgba(0,198,167,.08);border:1px solid rgba(0,198,167,.2);padding:3px 10px;border-radius:100px;display:inline-block;margin-bottom:7px;}
          .teach-name{font-size:18px;font-weight:700;color:var(--navy);margin-bottom:3px;}
          .teach-qual{font-size:12px;color:var(--muted);margin-bottom:10px;}
          .teach-tag{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--navy);background:#f1f5f9;border-radius:8px;padding:4px 10px;margin-bottom:12px;}
          .teach-bio{font-size:13px;color:var(--muted);line-height:1.7;}
          @media(max-width:720px){.teach-g{grid-template-columns:1fr;}.teach-c{flex-direction:column;}}

          /* FAQ */
          .faq-list{display:flex;flex-direction:column;gap:12px;margin-top:52px;max-width:800px;}
          .faq-item{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:var(--radius);overflow:hidden;}
          .faq-q{width:100%;display:flex;align-items:center;justify-content:space-between;padding:18px 22px;background:none;border:none;color:#fff;font-family:var(--font-b);font-size:15px;font-weight:600;cursor:pointer;text-align:left;gap:16px;}
          .faq-q i{color:var(--teal);font-size:13px;transition:transform .3s;flex-shrink:0;}
          .faq-q.open i{transform:rotate(45deg);}
          .faq-a{padding:0 22px 18px;font-size:14px;color:rgba(255,255,255,.6);line-height:1.75;}

          /* ENROLL FORM */
          .form-wrap{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:24px;padding:44px;margin-top:44px;}
          /* Role selector — Step 0 */
          .role-selector-g{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:8px;}
          .role-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:24px 20px;cursor:pointer;text-align:center;transition:all .2s;display:flex;flex-direction:column;align-items:center;gap:12px;}
          .role-card:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.2);transform:translateY(-2px);}
          .role-card-icon{width:52px;height:52px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px;}
          .role-card-label{font-family:var(--font-d);font-size:16px;font-weight:900;color:#fff;}
          .role-card-desc{font-size:12px;color:rgba(255,255,255,.5);line-height:1.5;}
          .role-card-arrow{font-size:12px;color:rgba(255,255,255,.3);margin-top:4px;}
          @media(max-width:640px){.role-selector-g{grid-template-columns:1fr;}}
          .steps{display:flex;gap:0;margin-bottom:36px;}
          .step-item{flex:1;display:flex;flex-direction:column;align-items:center;position:relative;}
          .step-item:not(:last-child)::after{content:'';position:absolute;top:18px;left:50%;width:100%;height:2px;background:rgba(255,255,255,.1);}
          .step-item.done::after,.step-item.active::after{background:var(--teal);}
          .step-circle{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;border:2px solid rgba(255,255,255,.15);color:rgba(255,255,255,.4);background:transparent;z-index:1;position:relative;}
          .step-item.done .step-circle{background:var(--teal);border-color:var(--teal);color:#fff;}
          .step-item.active .step-circle{border-color:var(--teal);color:var(--teal);}
          .step-lbl{font-size:11px;font-weight:600;color:rgba(255,255,255,.4);margin-top:7px;text-align:center;}
          .step-item.active .step-lbl,.step-item.done .step-lbl{color:rgba(255,255,255,.8);}
          .fg{display:flex;flex-direction:column;gap:6px;margin-bottom:18px;}
          .fg-2{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
          .fl{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.55);}
          .fi{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:12px 14px;color:#fff;font-size:14px;font-family:var(--font-b);transition:all .2s;outline:none;width:100%;}
          .fi:focus{border-color:var(--teal);background:rgba(255,255,255,.09);box-shadow:0 0 0 3px rgba(0,198,167,.15);}
          .fi option{background:var(--navy);}
          .fi::placeholder{color:rgba(255,255,255,.3);}
          .cb-g{display:flex;flex-wrap:wrap;gap:10px;}
          .cb-l{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;color:rgba(255,255,255,.7);font-weight:500;transition:all .2s;}
          .cb-l:hover{border-color:var(--teal);color:#fff;}
          .step-nav{display:flex;justify-content:space-between;margin-top:28px;gap:12px;}
          .btn-back{background:rgba(255,255,255,.07);color:rgba(255,255,255,.7);border:1px solid rgba(255,255,255,.12);padding:12px 24px;border-radius:10px;font-family:var(--font-b);font-size:14px;font-weight:600;cursor:pointer;transition:all .2s;}
          .btn-back:hover{background:rgba(255,255,255,.12);}
          .btn-next{background:var(--teal);color:#fff;border:none;padding:12px 28px;border-radius:10px;font-family:var(--font-b);font-size:14px;font-weight:700;cursor:pointer;transition:all .2s;}
          .btn-next:hover{opacity:.9;transform:translateY(-1px);}
          .btn-submit{background:var(--accent);color:var(--navy);border:none;padding:14px 32px;border-radius:11px;font-family:var(--font-b);font-size:15px;font-weight:700;cursor:pointer;transition:all .2s;width:100%;margin-top:8px;}
          .btn-submit:hover{background:var(--accent-light);transform:translateY(-1px);}
          .status-err{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.25);color:#f87171;border-radius:10px;padding:13px;font-size:13px;font-weight:600;text-align:center;margin-top:16px;}
          @media(max-width:640px){.fg-2{grid-template-columns:1fr;}.form-wrap{padding:24px 18px;}}

          /* SUCCESS CARD */
          .success-card{background:rgba(0,198,167,.08);border:1px solid rgba(0,198,167,.25);border-radius:16px;padding:32px;margin-top:24px;}
          .cred-g{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0;}
          .review-g{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;font-size:13px;color:rgba(255,255,255,.7);}
          @media(max-width:480px){.review-g{grid-template-columns:1fr;}}
          .cred-box{background:rgba(255,255,255,.05);border-radius:10px;padding:14px;}
          .cred-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,.4);margin-bottom:6px;}
          .cred-val{font-size:15px;font-weight:800;font-family:monospace;}
          @media(max-width:520px){.cred-g{grid-template-columns:1fr;}}

          /* PORTAL BANNER */
          .pb{background:linear-gradient(135deg,var(--teal),#0099cc);}
          .pb-in{max-width:1200px;margin:0 auto;padding:48px 24px;display:flex;align-items:center;justify-content:space-between;gap:24px;}
          .pb h2{font-family:var(--font-d);font-size:26px;font-weight:900;color:#fff;}
          .pb p{font-size:14px;color:rgba(255,255,255,.8);margin-top:5px;}
          .btn-white{display:inline-flex;align-items:center;gap:8px;background:#fff;color:var(--navy);font-weight:700;font-size:14px;padding:12px 22px;border-radius:11px;text-decoration:none;transition:all .2s;white-space:nowrap;}
          .btn-white:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.2);}
          @media(max-width:600px){.pb-in{flex-direction:column;align-items:flex-start;}}

          /* FOOTER */
          .footer{background:#050913;color:rgba(255,255,255,.4);padding:60px 24px 28px;border-top:1px solid rgba(255,255,255,.06);}
          .footer-in{max-width:1200px;margin:0 auto;display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:40px;margin-bottom:44px;}
          .contact-g{display:grid;grid-template-columns:repeat(2,1fr);gap:20px;margin-top:48px;}
          @media(max-width:640px){.contact-g{grid-template-columns:1fr;}}
          .f-brand{font-family:var(--font-d);font-size:20px;font-weight:900;color:#fff;margin-bottom:10px;}
          .f-p{font-size:13px;line-height:1.8;}
          .f-h{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#fff;margin-bottom:14px;}
          .f-lnk{display:flex;align-items:center;gap:7px;font-size:13px;margin-bottom:9px;text-decoration:none;color:rgba(255,255,255,.4);transition:color .2s;}
          .f-lnk:hover{color:var(--teal);}
          .footer-bot{max-width:1200px;margin:0 auto;border-top:1px solid rgba(255,255,255,.06);padding-top:22px;text-align:center;font-size:12px;}
          @media(max-width:900px){.footer-in{grid-template-columns:1fr 1fr;gap:28px;}}
          @media(max-width:560px){.footer-in{grid-template-columns:1fr;}}
        `}</style>
      </Head>

      {/* ── NAV ── */}
      <nav className="nav">
        <div className="nav-i">
          <a href="#home" className="logo">
            <div className="logo-box"><i className="fa-solid fa-graduation-cap"></i></div>
            <span className="logo-txt">Vedanta Academy</span>
          </a>
          <div className="nav-links">
            <a href="#dashboard" className="nl">{t('nav_dashboard')}</a>
            <a href="#about"    className="nl">{t('nav_about')}</a>
            <a href="#classes"  className="nl">{t('nav_classes')}</a>
            <a href="#subjects" className="nl">{t('nav_subjects')}</a>
            <a href="#schedule" className="nl">{t('nav_schedule')}</a>
            <a href="#fees"     className="nl">{t('nav_fees')}</a>
            <a href="#contact"  className="nl">{t('nav_contact')}</a>
            <a href="/portal"        className="n-portal"><i className="fa-solid fa-lock-open" style={{fontSize:'11px'}}></i> {t('nav_student_login')}</a>
            <a href="/parent-portal" className="n-portal" style={{background:'rgba(168,85,247,.15)',borderColor:'rgba(168,85,247,.3)',color:'#c084fc'}}><i className="fa-solid fa-users-between-lines" style={{fontSize:'11px'}}></i> {t('nav_parent_login')}</a>
            <a href="#enroll"   className="n-cta">{t('nav_enroll_now')}</a>
            <LanguageToggle style={{marginLeft:'4px'}} />
          </div>
          <button className="hm" onClick={()=>setMobileNavOpen(true)} aria-label={t('nav_open_menu')}><i className="fa-solid fa-bars"></i></button>
        </div>
      </nav>

      {/* Mobile nav drawer — only relevant/visible under the 900px breakpoint (see CSS) */}
      <div className={`mnav-backdrop${mobileNavOpen?' open':''}`} onClick={()=>setMobileNavOpen(false)} />
      <div className={`mnav-drawer${mobileNavOpen?' open':''}`}>
        <div className="mnav-drawer-head">
          <span className="logo-txt" style={{color:'#fff'}}>{t('nav_menu')}</span>
          <button className="mnav-drawer-close" onClick={()=>setMobileNavOpen(false)} aria-label={t('nav_close_menu')}><i className="fa-solid fa-xmark"></i></button>
        </div>
        <div className="mnav-drawer-links">
          <div style={{padding:'0 0 12px'}}><LanguageToggle /></div>
          <a href="#dashboard" className="nl" onClick={()=>setMobileNavOpen(false)}>{t('nav_dashboard')}</a>
          <a href="#about"    className="nl" onClick={()=>setMobileNavOpen(false)}>{t('nav_about')}</a>
          <a href="#classes"  className="nl" onClick={()=>setMobileNavOpen(false)}>{t('nav_classes')}</a>
          <a href="#subjects" className="nl" onClick={()=>setMobileNavOpen(false)}>{t('nav_subjects')}</a>
          <a href="#schedule" className="nl" onClick={()=>setMobileNavOpen(false)}>{t('nav_schedule')}</a>
          <a href="#fees"     className="nl" onClick={()=>setMobileNavOpen(false)}>{t('nav_fees')}</a>
          <a href="#contact"  className="nl" onClick={()=>setMobileNavOpen(false)}>{t('nav_contact')}</a>
          <a href="/portal"        className="n-portal" style={{marginTop:'10px',textAlign:'center'}}><i className="fa-solid fa-lock-open" style={{fontSize:'11px'}}></i> {t('nav_student_login')}</a>
          <a href="/parent-portal" className="n-portal" style={{textAlign:'center',marginTop:'8px',background:'rgba(168,85,247,.15)',borderColor:'rgba(168,85,247,.3)',color:'#c084fc'}}><i className="fa-solid fa-users-between-lines" style={{fontSize:'11px'}}></i> {t('nav_parent_login')}</a>
          <a href="#enroll"   className="n-cta" style={{textAlign:'center',marginTop:'8px'}} onClick={()=>setMobileNavOpen(false)}>{t('nav_enroll_now')}</a>
        </div>
      </div>

      {/* ── HERO ── */}
      <section id="home" className="hero">
        <div className="hgrid"></div>
        <div className="hero-in">
          <div>
            <div className="badge"><i className="fa-solid fa-circle-check" style={{fontSize:'10px'}}></i> {h.badge}</div>
            <h1 className="h1">{h.headlineLine1 || h.headline}<br /><span>{h.headlineLine2 || ''}</span></h1>
            <p className="hero-p">{h.subheadline}</p>
            <div className="hero-btns">
              <a href={h.btn1Link} className="btn btn-accent"><i className="fa-solid fa-user-plus"></i> {h.btn1Text}</a>
              <a href={h.btn2Link} className="btn btn-ghost"><i className="fa-solid fa-right-to-bracket"></i> {h.btn2Text}</a>
            </div>
          </div>
          <div className="hero-card">
            <div className="sgrid">
              <div className="sc"><div className="sc-n">{h.stat1Num}</div><div className="sc-l">{h.stat1Label}</div></div>
              <div className="sc"><div className="sc-n">{h.stat2Num}</div><div className="sc-l">{h.stat2Label}</div></div>
              <div className="sc"><div className="sc-n">{h.stat3Num}</div><div className="sc-l">{h.stat3Label}</div></div>
              <div className="sc"><div className="sc-n">{h.stat4Num}</div><div className="sc-l">{h.stat4Label}</div></div>
            </div>
            <hr className="hdiv" />
            <div className="hfeats">
              {[h.feat1, h.feat2, h.feat3, h.feat4].filter(Boolean).map((f, i) => (
                <div key={i} className="hfeat"><i className="fa-solid fa-check-circle"></i> {f}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── PORTAL DASHBOARD (live stats from the Student Portal) ── */}
      <section id="dashboard" className="sec sec-dark">
        <div className="sec-in">
          <p className="sec-lbl">{t('pd_live_label')}</p>
          <h2 className="sec-h">{t('pd_heading_1')}<br/>{t('pd_heading_2')}</h2>
          <p className="sec-sub">{t('pd_sub')}</p>

          {portalStats === false ? (
            <div className="pd-error">{t('pd_error')}</div>
          ) : (
            <>
              <div className="pd-stats-g">
                {[
                  { icon:'fa-user-graduate', label:t('pd_stat_total_students'),        val: portalStats?.totalStudents },
                  { icon:'fa-book',          label:t('pd_stat_total_subjects'),        val: portalStats?.totalSubjectsAvailable },
                  { icon:'fa-layer-group',   label:t('pd_stat_total_topics'),          val: portalStats?.totalTopicsAvailable },
                  { icon:'fa-list-check',    label:t('pd_stat_questions_available'),   val: portalStats?.totalQuestionsAvailable },
                  { icon:'fa-pen',           label:t('pd_stat_questions_attempted'),   val: portalStats?.totalQuestionsAttempted },
                  { icon:'fa-circle-check',  label:t('pd_stat_correct_answers'),       val: portalStats?.totalCorrectAnswers },
                ].map((s,i) => (
                  <div key={i} className="pd-stat-c">
                    <div className="pd-stat-ic"><i className={`fa-solid ${s.icon}`}></i></div>
                    <div className="pd-stat-v">{portalStats ? (s.val ?? 0).toLocaleString(lang==='da'?'da-DK':'en-IN') : <span className="pd-skel" />}</div>
                    <div className="pd-stat-l">{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="pd-row">
                <div className="pd-col">
                  <p className="pd-sub-h"><i className="fa-solid fa-trophy"></i> {t('pd_top_performers')}</p>
                  {!portalStats ? (
                    <div className="pd-champ-c"><div className="pd-skel" style={{height:'60px'}} /></div>
                  ) : !portalStats.topPerformers?.overall && !Object.keys(portalStats.topPerformers?.bySubject||{}).length ? (
                    <div className="pd-empty">{t('pd_no_champions')}</div>
                  ) : (
                    <div className="pd-champ-list">
                      {portalStats.topPerformers.overall && (
                        <div className="pd-champ-c pd-champ-overall">
                          <div className="pd-champ-ic"><i className="fa-solid fa-crown"></i></div>
                          <div>
                            <div className="pd-champ-tag">{t('pd_overall_champion')}</div>
                            <div className="pd-champ-name">{portalStats.topPerformers.overall.studentName}</div>
                            <div className="pd-champ-meta">{portalStats.topPerformers.overall.correct} {t('pd_correct_accuracy', {pct: portalStats.topPerformers.overall.accuracy})}</div>
                          </div>
                        </div>
                      )}
                      {Object.entries(portalStats.topPerformers.bySubject||{}).slice(0,4).map(([subject, champ]) => champ && (
                        <div key={subject} className="pd-champ-c">
                          <div className="pd-champ-ic" style={{background:'rgba(245,166,35,.12)',color:'var(--accent)'}}><i className="fa-solid fa-medal"></i></div>
                          <div>
                            <div className="pd-champ-tag">{subjectDisplay(subject)} {t('pd_subject_champion')}</div>
                            <div className="pd-champ-name">{champ.studentName}</div>
                            <div className="pd-champ-meta">{champ.correct} {t('pd_correct_accuracy', {pct: champ.accuracy})}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pd-col">
                  <p className="pd-sub-h"><i className="fa-solid fa-bolt"></i> {t('pd_recent_activity')}</p>
                  {!portalStats ? (
                    <div className="pd-champ-c"><div className="pd-skel" style={{height:'60px'}} /></div>
                  ) : !portalStats.recentActivity?.length ? (
                    <div className="pd-empty">{t('pd_no_recent_activity')}</div>
                  ) : (
                    <div className="pd-activity-list">
                      {portalStats.recentActivity.map((a,i) => (
                        <div key={i} className="pd-activity-row">
                          <div className="pd-activity-dot"></div>
                          <div className="pd-activity-text">
                            <strong>{a.studentName}</strong> {t('pd_worked_on')} <strong>{a.topic || a.subject}</strong>
                            {a.subject && a.topic ? <span className="pd-activity-subj"> · {a.subject}</span> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Top Students leaderboard table (Req #7) — separate from the
              "Top Performers" summary above (which only shows the #1
              student overall + per-subject); this is the full ranked list
              with sorting and pagination. */}
          {portalStats && lbRows.length > 0 && (
            <div className="pd-lb-section">
              <p className="pd-sub-h"><i className="fa-solid fa-ranking-star"></i> {t('pd_leaderboard_title')}</p>

              {/* Desktop/tablet: real table. Mobile: stacked cards (CSS swaps
                  display at the same breakpoint used elsewhere on this page). */}
              <div className="pd-lb-table-wrap">
                <table className="pd-lb-table">
                  <thead>
                    <tr>
                      <th>{t('pd_lb_rank')}</th>
                      <th>{t('pd_lb_student')}</th>
                      <th>
                        <button className="pd-lb-sort-btn" onClick={()=>{setLbSort('attempted');setLbPage(0);}} aria-label={t('pd_lb_sort_attempted')}>
                          {t('pd_lb_attempted')} {lbSort==='attempted' && <i className="fa-solid fa-sort-down"></i>}
                        </button>
                      </th>
                      <th>
                        <button className="pd-lb-sort-btn" onClick={()=>{setLbSort('accuracy');setLbPage(0);}} aria-label={t('pd_lb_sort_accuracy')}>
                          {t('pd_lb_accuracy')} {lbSort==='accuracy' && <i className="fa-solid fa-sort-down"></i>}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lbPageRows.map(row => (
                      <tr key={row.studentId || row.rank}>
                        <td><span className={`pd-lb-rank${row.rank<=3?` top${row.rank}`:''}`}>{row.rank}</span></td>
                        <td className="pd-lb-name">{row.studentName}</td>
                        <td>{row.attempted.toLocaleString(lang==='da'?'da-DK':'en-IN')}</td>
                        <td><span className="pd-lb-acc-pill">{row.accuracy}%</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Mobile card fallback — same data, touch-friendly layout */}
                <div className="pd-lb-cards">
                  {lbPageRows.map(row => (
                    <div key={row.studentId || row.rank} className="pd-lb-card">
                      <span className={`pd-lb-rank${row.rank<=3?` top${row.rank}`:''}`}>{row.rank}</span>
                      <div className="pd-lb-card-body">
                        <div className="pd-lb-name">{row.studentName}</div>
                        <div className="pd-lb-card-meta">{row.attempted.toLocaleString(lang==='da'?'da-DK':'en-IN')} {t('pd_lb_attempted').toLowerCase()} · {row.accuracy}% {t('pd_lb_accuracy').toLowerCase()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {lbPageCount > 1 && (
                <div className="pd-lb-pagination">
                  <button className="btn btn-ghost pd-lb-page-btn" disabled={lbPageClamped===0} onClick={()=>setLbPage(p=>Math.max(0,p-1))}>
                    <i className="fa-solid fa-chevron-left"></i> {t('pd_lb_prev')}
                  </button>
                  <span className="pd-lb-page-lbl">{t('pd_lb_page_of', { n: lbPageClamped+1, total: lbPageCount })}</span>
                  <button className="btn btn-ghost pd-lb-page-btn" disabled={lbPageClamped>=lbPageCount-1} onClick={()=>setLbPage(p=>Math.min(lbPageCount-1,p+1))}>
                    {t('pd_lb_next')} <i className="fa-solid fa-chevron-right"></i>
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="pd-cta">
            <p>{t('pd_cta_text')}</p>
            <a href="/portal" className="btn btn-accent"><i className="fa-solid fa-right-to-bracket"></i> {t('pd_cta_btn')}</a>
          </div>
        </div>
      </section>


      {/* ── ABOUT ── */}
      <section id="about" className="sec sec-alt">
        <div className="sec-in">
          <p className="sec-lbl">{t('about_lbl')}</p>
          <h2 className="sec-h">{t('about_h_1')}<br/>{t('about_h_2')}</h2>
          <p className="sec-sub">{t('about_sub')}</p>
          <div className="why-g">
            {cms.about.map((item, i) => (
              <div key={i} className="why-c">
                <div className="why-ic" style={{background: item.IconBg, color: item.IconColor}}>
                  <i className={`fa-solid ${item.Icon}`}></i>
                </div>
                <h3>{item.Heading}</h3>
                <p>{item.Body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CLASSES ── */}
      <section id="classes" className="sec sec-dark">
        <div className="sec-in">
          <p className="sec-lbl">{t('classes_lbl')}</p>
          <h2 className="sec-h">{t('classes_h')}</h2>
          <p className="sec-sub">{t('classes_sub')}</p>
          <div className="cls-g">
            {cms.classes.map(cls => (
              <div key={cls.Id} className="cls-c">
                <div className="cls-chip" style={{background:`${cls.Color}22`, color: cls.Color, border:`1px solid ${cls.Color}44`}}>{cls.Id}</div>
                <div className="cls-label">{cls.Label}</div>
                <div className="cls-age">{t('classes_age')} {cls.Age}</div>
                <div className="cls-desc">{cls.Description}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SUBJECTS ── */}
      <section id="subjects" className="sec sec-alt">
        <div className="sec-in">
          <p className="sec-lbl">{t('subjects_lbl')}</p>
          <h2 className="sec-h">{t('subjects_h_1')}<br/>{t('subjects_h_2')}</h2>
          <p className="sec-sub">{t('subjects_sub')}</p>
          <div className="subj-g">
            {cms.subjects.map(s => (
              <div key={s.Name} className="subj-c">
                <div className="subj-hd">
                  <div className="subj-ic" style={{background:`${s.Color}18`, color: s.Color}}><i className={`fa-solid ${s.Icon}`}></i></div>
                  <span className="subj-nm">{s.Name}</span>
                </div>
                <div className="subj-row">
                  <div className="subj-item"><label>{t('subjects_topics_covered')}</label><p>{s.Topics}</p></div>
                  <div className="subj-item"><label>{t('subjects_learning_goal')}</label><p>{s.Goal}</p></div>
                  <div className="subj-item"><label>{t('subjects_teaching_method')}</label><p>{s.Method}</p></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SCHEDULE ── */}
      <section id="schedule" className="sec sec-dark">
        <div className="sec-in">
          <p className="sec-lbl">{t('sched_lbl')}</p>
          <h2 className="sec-h">{t('sched_h')}</h2>
          <p className="sec-sub">{t('sched_sub')}</p>
          <div className="sched-g">
            {cms.schedules.map((s, i) => {
              const seats = Number(s.Seats);
              const dotCls = seats >= 4 ? 'seat-dot' : seats >= 2 ? 'seat-dot few' : 'seat-dot last';
              const modeColor = s.Mode==='Physical'?'rgba(34,197,94,.15)':s.Mode==='Online'?'rgba(59,130,246,.15)':'rgba(168,85,247,.15)';
              const modeText  = s.Mode==='Physical'?'#4ade80':s.Mode==='Online'?'#60a5fa':'#c084fc';
              return (
                <div key={i} className="sched-c">
                  <div className="sched-top">
                    <span className="sched-batch">{s.Batch}</span>
                    <span className="mode-tag" style={{background:modeColor, color:modeText}}>{t(`sched_mode_${s.Mode.toLowerCase()}`)}</span>
                  </div>
                  <div className="sched-rows">
                    <div className="sched-row"><i className="fa-solid fa-calendar"></i>{s.Days}</div>
                    <div className="sched-row"><i className="fa-solid fa-clock"></i>{s.Time}</div>
                  </div>
                  <div className="seats" style={{color: seats>=4?'#4ade80':seats>=2?'#f97316':'#ef4444'}}>
                    <span className={dotCls}></span>{seats} {seats===1?t('sched_seats_available_one'):t('sched_seats_available_many')}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── FEES ── */}
      <section id="fees" className="sec sec-alt">
        <div className="sec-in">
          <p className="sec-lbl">{t('fees_lbl')}</p>
          <h2 className="sec-h">{t('fees_h')}</h2>
          <p className="sec-sub">{t('fees_sub')}</p>
          <div className="fees-g">
            {cms.fees.map((f, i) => {
              const isHighlight = String(f.Highlight).toUpperCase() === 'TRUE';
              const perks = typeof f.Perks === 'string' ? f.Perks.split('|') : (f.Perks || []);
              return (
                <div key={i} className={`fee-c${isHighlight ? ' hi' : ''}`}>
                  {isHighlight && <span className="fee-badge">{t('fees_most_popular')}</span>}
                  <div className="fee-tier">{f.Tier}</div>
                  <div className="fee-price">{f.Price}</div>
                  <div className="fee-period">{f.Period} · {t('fees_per_student')}</div>
                  <div className="fee-perks">
                    {perks.map((p, j) => <div key={j} className="fee-perk"><i className="fa-solid fa-check-circle"></i>{p.trim()}</div>)}
                  </div>
                  <a href="#enroll" className="btn btn-accent" style={{width:'100%',justifyContent:'center'}}><i className="fa-solid fa-user-plus"></i> {t('fees_enroll_now')}</a>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="sec sec-dark">
        <div className="sec-in">
          <p className="sec-lbl">{t('test_lbl')}</p>
          <h2 className="sec-h">{t('test_h')}</h2>
          <p className="sec-sub">{t('test_sub')}</p>
          <div className="test-g">
            {cms.testimonials.map((item, i) => (
              <div key={i} className="test-c">
                <div className="test-q">"</div>
                <p className="test-txt">{item.Text}</p>
                <div className="test-auth">
                  <div className="test-av"><i className="fa-solid fa-user"></i></div>
                  <div><div className="test-name">{item.Name}</div><div className="test-role">{item.Role}</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TEACHERS ── */}
      <section id="teachers" className="sec sec-alt">
        <div className="sec-in">
          <p className="sec-lbl">{t('teach_lbl')}</p>
          <h2 className="sec-h">{t('teach_h')}</h2>
          <p className="sec-sub">{t('teach_sub')}</p>
          <div className="teach-g">
            {cms.teachers.map(teacher => (
              <div key={teacher.Id} className="teach-c">
                {teacher.ImageUrl
                  ? <img src={teacher.ImageUrl} alt={teacher.Name} style={{width:'64px',height:'64px',borderRadius:'16px',objectFit:'cover',flexShrink:0}} />
                  : <div className="teach-av"><i className="fa-solid fa-user-tie"></i></div>
                }
                <div>
                  <div className="teach-id">{teacher.Id}</div>
                  <div className="teach-name">{teacher.Name}</div>
                  <div className="teach-qual">{teacher.Qualification} · {teacher.Experience} {t('teach_experience')}</div>
                  <div className="teach-tag"><i className="fa-solid fa-chalkboard-user" style={{fontSize:'11px'}}></i>{teacher.Subjects}</div>
                  <div className="teach-bio">{teacher.Bio}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="sec sec-dark">
        <div className="sec-in">
          <p className="sec-lbl">{t('faq_lbl')}</p>
          <h2 className="sec-h">{t('faq_h')}</h2>
          <p className="sec-sub">{t('faq_sub')}</p>
          <div className="faq-list">
            {cms.faqs.map((f, i) => (
              <div key={i} className="faq-item">
                <button className={`faq-q${openFaq===i?' open':''}`} onClick={()=>setOpenFaq(openFaq===i?null:i)}>
                  {f.Question}<i className="fa-solid fa-plus"></i>
                </button>
                {openFaq===i && <div className="faq-a">{f.Answer}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PORTAL BANNER ── */}
      <div className="pb">
        <div className="pb-in">
          <div>
            <h2>{t('pb_h')}</h2>
            <p>{t('pb_p')}</p>
          </div>
          <a href="/portal" className="btn-white"><i className="fa-solid fa-arrow-right-to-bracket"></i> {t('pb_btn')}</a>
        </div>
      </div>

      {/* ── ENROLL FORM ── */}
      <section id="enroll" className="sec sec-dark">
        <div className="sec-in">
          <p className="sec-lbl">{t('enroll_lbl')}</p>
          <h2 className="sec-h">{t('enroll_h')}</h2>
          <p className="sec-sub">{t('enroll_sub')}</p>

          {formStatus.state === 'success' ? (
            /* ── SUCCESS CARD — adapts to role ── */
            <div className="success-card">
              <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'20px'}}>
                <div style={{width:'44px',height:'44px',borderRadius:'12px',background:'var(--teal)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'20px',color:'#fff',flexShrink:0}}>
                  <i className="fa-solid fa-circle-check"></i>
                </div>
                <div>
                  <div style={{fontWeight:800,fontSize:'17px',color:'#fff'}}>
                    {enrollRole === 'Student' ? t('f_success_title') : t('f_pt_success_title')}
                  </div>
                  <div style={{fontSize:'12px',color:'rgba(255,255,255,.5)'}}>
                    {enrollRole === 'Student' ? t('f_success_sub') : t('f_pt_success_sub')}
                  </div>
                </div>
              </div>
              <div className="cred-g">
                <div className="cred-box">
                  <div className="cred-lbl">{enrollRole === 'Student' ? t('f_cred_student_id') : t('f_pt_cred_id')}</div>
                  <div className="cred-val" style={{color:'var(--teal)'}}>{formStatus.studentId}</div>
                </div>
                <div className="cred-box">
                  <div className="cred-lbl">{t('f_cred_username')}</div>
                  <div className="cred-val" style={{color:'#fff'}}>{formStatus.username}</div>
                </div>
                <div className="cred-box">
                  <div className="cred-lbl">{t('f_cred_temp_password')}</div>
                  <div className="cred-val" style={{color:'var(--accent)'}}>{formStatus.tempPassword}</div>
                </div>
              </div>
              {enrollRole !== 'Student' && formStatus.note && (
                <div style={{background:'rgba(0,198,167,.08)',border:'1px solid rgba(0,198,167,.2)',borderRadius:'10px',padding:'12px 14px',fontSize:'13px',color:'rgba(255,255,255,.7)',marginBottom:'16px',lineHeight:1.7}}>
                  ℹ️ {formStatus.note}
                </div>
              )}
              <p style={{fontSize:'12px',color:'rgba(255,255,255,.45)',marginBottom:'20px',lineHeight:1.7}}>{t('f_cred_warning')}</p>
              {enrollRole === 'Student'
                ? <a href="/portal"        className="btn btn-accent"><i className="fa-solid fa-arrow-right-to-bracket"></i> {t('f_go_to_portal')}</a>
                : <a href="/parent-portal" className="btn btn-accent"><i className="fa-solid fa-arrow-right-to-bracket"></i> {t('f_pt_go_to_portal')}</a>
              }
              <button
                onClick={()=>{ setFormStatus({state:'idle',studentId:'',username:'',tempPassword:'',note:''}); setEnrollRole(null); setStep(1); }}
                style={{display:'block',marginTop:'14px',background:'none',border:'none',color:'rgba(255,255,255,.4)',fontSize:'12px',cursor:'pointer',textDecoration:'underline'}}>
                Register someone else
              </button>
            </div>

          ) : !enrollRole ? (
            /* ── STEP 0: ROLE SELECTOR ── */
            <div className="form-wrap">
              <div style={{textAlign:'center',marginBottom:'28px'}}>
                <div style={{fontSize:'22px',fontWeight:800,color:'#fff',marginBottom:'8px'}}>{t('enroll_role_heading')}</div>
                <div style={{fontSize:'14px',color:'rgba(255,255,255,.55)'}}>{t('enroll_role_sub')}</div>
              </div>
              <div className="role-selector-g">
                {[
                  { role:'Student', icon:'fa-user-graduate', label:t('enroll_role_student'), desc:t('enroll_role_student_d'), color:'var(--teal)' },
                  { role:'Parent',  icon:'fa-heart',         label:t('enroll_role_parent'),  desc:t('enroll_role_parent_d'),  color:'#a855f7'    },
                  { role:'Teacher', icon:'fa-chalkboard-user',label:t('enroll_role_teacher'),desc:t('enroll_role_teacher_d'), color:'var(--accent)'},
                ].map(r => (
                  <button
                    key={r.role}
                    type="button"
                    className="role-card"
                    onClick={() => { setEnrollRole(r.role); setStep(1); setFormStatus({state:'idle',studentId:'',username:'',tempPassword:'',note:''}); }}
                  >
                    <div className="role-card-icon" style={{background:`${r.color}18`,color:r.color}}>
                      <i className={`fa-solid ${r.icon}`}></i>
                    </div>
                    <div className="role-card-label">{r.label}</div>
                    <div className="role-card-desc">{r.desc}</div>
                    <div className="role-card-arrow"><i className="fa-solid fa-arrow-right"></i></div>
                  </button>
                ))}
              </div>
            </div>

          ) : enrollRole === 'Student' ? (
            /* ── STUDENT: existing 4-step flow ── */
            <form onSubmit={handleEnroll}>
              <div className="form-wrap">
                <button type="button" onClick={()=>{setEnrollRole(null);setStep(1);}} style={{background:'none',border:'none',color:'rgba(255,255,255,.45)',fontSize:'12px',cursor:'pointer',marginBottom:'16px',display:'flex',alignItems:'center',gap:'6px'}}>
                  <i className="fa-solid fa-arrow-left"></i> {t('enroll_role_heading')}
                </button>
                <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'20px',padding:'10px 14px',background:'rgba(0,198,167,.08)',borderRadius:'10px',border:'1px solid rgba(0,198,167,.15)'}}>
                  <i className="fa-solid fa-user-graduate" style={{color:'var(--teal)'}}></i>
                  <span style={{fontSize:'13px',fontWeight:700,color:'var(--teal)'}}>{t('enroll_role_student')} — {t('enroll_role_student_d')}</span>
                </div>
                {/* STEP INDICATOR */}
                <div className="steps">
                  {[t('enroll_step_student'),t('enroll_step_parent'),t('enroll_step_course'),t('enroll_step_confirm')].map((s,i)=>(
                    <div key={i} className={`step-item${step>i+1?' done':step===i+1?' active':''}`}>
                      <div className="step-circle">{step>i+1?<i className="fa-solid fa-check"></i>:i+1}</div>
                      <span className="step-lbl">{s}</span>
                    </div>
                  ))}
                </div>

                {step===1 && (
                  <div>
                    <div className="fg-2">
                      <div className="fg"><label className="fl">{t('f_student_name')}</label><input name="studentName" required className="fi" placeholder={t('f_student_name_ph')} defaultValue={formData.studentName} /></div>
                      <div className="fg"><label className="fl">{t('f_dob')}</label><input name="dob" type="date" required className="fi" defaultValue={formData.dob} /></div>
                    </div>
                    <div className="fg-2">
                      <div className="fg"><label className="fl">{t('f_gender')}</label>
                        <select name="gender" className="fi" defaultValue={formData.gender}><option value="">{t('f_gender_select')}</option><option>{t('f_gender_male')}</option><option>{t('f_gender_female')}</option><option>{t('f_gender_na')}</option></select>
                      </div>
                      <div className="fg"><label className="fl">{t('f_school_name')}</label><input name="schoolName" className="fi" placeholder={t('f_school_name_ph')} defaultValue={formData.schoolName} /></div>
                    </div>
                    <div className="fg"><label className="fl">{t('f_class_level')}</label>
                      <select name="classLevel" required className="fi" defaultValue={formData.classLevel}>
                        <option value="">{t('f_class_select')}</option>
                        {cms.classes.map(cls => <option key={cls.Id} value={cls.Id}>{cls.Label}</option>)}
                      </select>
                    </div>
                    <div className="step-nav"><span></span><button type="button" className="btn-next" onClick={(e)=>saveStepAndAdvance(e,2)}>{t('f_next_parent')} <i className="fa-solid fa-arrow-right"></i></button></div>
                  </div>
                )}

                {step===2 && (
                  <div>
                    <div className="fg-2">
                      <div className="fg"><label className="fl">{t('f_parent_name')}</label><input name="parentName" required className="fi" placeholder={t('f_parent_name_ph')} defaultValue={formData.parentName} /></div>
                      <div className="fg"><label className="fl">{t('f_email')}</label><input name="email" type="email" required className="fi" placeholder="parent@email.com" defaultValue={formData.email} /></div>
                    </div>
                    <div className="fg-2">
                      <div className="fg"><label className="fl">{t('f_phone')}</label><input name="phone" type="tel" required className="fi" placeholder={t('f_phone_ph')} defaultValue={formData.phone} /></div>
                      <div className="fg"><label className="fl">{t('f_emergency')}</label><input name="emergencyContact" type="tel" className="fi" placeholder={t('f_emergency_ph')} defaultValue={formData.emergencyContact} /></div>
                    </div>
                    <div className="fg"><label className="fl">{t('f_address')}</label><input name="address" className="fi" placeholder={t('f_address_ph')} defaultValue={formData.address} /></div>
                    <div className="step-nav">
                      <button type="button" className="btn-back" onClick={()=>setStep(1)}><i className="fa-solid fa-arrow-left"></i> {t('f_back')}</button>
                      <button type="button" className="btn-next" onClick={(e)=>saveStepAndAdvance(e,3)}>{t('f_next_course')} <i className="fa-solid fa-arrow-right"></i></button>
                    </div>
                  </div>
                )}

                {step===3 && (
                  <div>
                    <div className="fg-2">
                      <div className="fg"><label className="fl">{t('f_preferred_teacher')}</label>
                        <select name="teacherId" className="fi" defaultValue={formData.teacherId}>
                          <option value="">{t('f_no_preference')}</option>
                          {cms.teachers.map(teacher => <option key={teacher.Id} value={teacher.Id}>{teacher.Name} ({teacher.Id})</option>)}
                        </select>
                      </div>
                      <div className="fg"><label className="fl">{t('f_preferred_batch')}</label>
                        <select name="timeSlot" className="fi" defaultValue={formData.timeSlot}>
                          <option value="">{t('f_select_batch')}</option>
                          {cms.schedules.map((s, i) => <option key={i} value={s.Batch}>{s.Batch} — {s.Time}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="fg"><label className="fl">{t('f_learning_mode')}</label>
                      <select name="learningMode" className="fi" defaultValue={formData.learningMode}>
                        <option value="">{t('f_select_mode')}</option>
                        <option value="Physical">{t('f_mode_physical')}</option>
                        <option value="Online">{t('f_mode_online')}</option>
                        <option value="Hybrid">{t('f_mode_hybrid')}</option>
                      </select>
                    </div>
                    <div className="fg"><label className="fl">{t('f_subjects_required')}</label>
                      <div className="cb-g">
                        {cms.subjects.map(s => (
                          <label key={s.Name} className="cb-l">
                            <input type="checkbox" name="subjects" value={s.Name} defaultChecked={formData.subjects.includes(s.Name)} style={{accentColor:'var(--teal)'}} />
                            <span>{s.Name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="step-nav">
                      <button type="button" className="btn-back" onClick={()=>setStep(2)}><i className="fa-solid fa-arrow-left"></i> {t('f_back')}</button>
                      <button type="button" className="btn-next" onClick={(e)=>saveStepAndAdvance(e,4)}>{t('f_review_confirm')} <i className="fa-solid fa-arrow-right"></i></button>
                    </div>
                  </div>
                )}

                {step===4 && (
                  <div>
                    <div style={{background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.09)',borderRadius:'12px',padding:'20px',marginBottom:'20px'}}>
                      <p style={{fontSize:'12px',fontWeight:700,color:'var(--teal)',marginBottom:'14px',letterSpacing:'0.5px',textTransform:'uppercase'}}>{t('f_review_title')}</p>
                      <div className="review-g">
                        <div><span style={{color:'rgba(255,255,255,.4)'}}>{t('f_review_student')} </span>{formData.studentName || '—'}</div>
                        <div><span style={{color:'rgba(255,255,255,.4)'}}>{t('f_review_dob')} </span>{formData.dob || '—'}</div>
                        <div><span style={{color:'rgba(255,255,255,.4)'}}>{t('f_review_class')} </span>{formData.classLevel || '—'}</div>
                        <div><span style={{color:'rgba(255,255,255,.4)'}}>{t('f_review_school')} </span>{formData.schoolName || '—'}</div>
                        <div><span style={{color:'rgba(255,255,255,.4)'}}>{t('f_review_parent')} </span>{formData.parentName || '—'}</div>
                        <div><span style={{color:'rgba(255,255,255,.4)'}}>{t('f_review_email')} </span>{formData.email || '—'}</div>
                        <div><span style={{color:'rgba(255,255,255,.4)'}}>{t('f_review_phone')} </span>{formData.phone || '—'}</div>
                        <div><span style={{color:'rgba(255,255,255,.4)'}}>{t('f_review_mode')} </span>{formData.learningMode ? t(`f_review_mode_${formData.learningMode.toLowerCase()}`) : '—'}</div>
                        <div style={{gridColumn:'1/-1'}}><span style={{color:'rgba(255,255,255,.4)'}}>{t('f_review_subjects')} </span>{formData.subjects.length > 0 ? formData.subjects.join(', ') : '—'}</div>
                      </div>
                    </div>
                    <div style={{background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.07)',borderRadius:'10px',padding:'14px 18px',marginBottom:'16px'}}>
                      <p style={{fontSize:'12px',color:'rgba(255,255,255,.4)',lineHeight:1.8}}>{t('f_review_disclaimer')}</p>
                    </div>
                    {formStatus.state==='error' && <div className="status-err">⚠ {formStatus.message}</div>}
                    <button type="submit" className="btn-submit" disabled={formStatus.state==='loading'}>
                      {formStatus.state==='loading' ? <><i className="fa-solid fa-circle-notch fa-spin"></i> {t('f_creating_account')}</> : <><i className="fa-solid fa-paper-plane"></i> {t('f_submit')}</>}
                    </button>
                    <div className="step-nav" style={{marginTop:'12px'}}>
                      <button type="button" className="btn-back" onClick={()=>setStep(3)}><i className="fa-solid fa-arrow-left"></i> {t('f_back')}</button>
                      <span></span>
                    </div>
                  </div>
                )}
              </div>
            </form>

          ) : (
            /* ── PARENT / TEACHER: 2-step flow ── */
            <form onSubmit={handleEnrollPT}>
              <div className="form-wrap">
                <button type="button" onClick={()=>{setEnrollRole(null);setStep(1);}} style={{background:'none',border:'none',color:'rgba(255,255,255,.45)',fontSize:'12px',cursor:'pointer',marginBottom:'16px',display:'flex',alignItems:'center',gap:'6px'}}>
                  <i className="fa-solid fa-arrow-left"></i> {t('enroll_role_heading')}
                </button>
                {/* Role badge */}
                <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'20px',padding:'10px 14px',
                  background: enrollRole==='Teacher' ? 'rgba(245,166,35,.08)' : 'rgba(168,85,247,.08)',
                  borderRadius:'10px',
                  border: enrollRole==='Teacher' ? '1px solid rgba(245,166,35,.2)' : '1px solid rgba(168,85,247,.2)'}}>
                  <i className={`fa-solid ${enrollRole==='Teacher'?'fa-chalkboard-user':'fa-heart'}`}
                    style={{color: enrollRole==='Teacher' ? 'var(--accent)' : '#a855f7'}}></i>
                  <span style={{fontSize:'13px',fontWeight:700,color: enrollRole==='Teacher' ? 'var(--accent)' : '#a855f7'}}>
                    {enrollRole==='Teacher' ? t('enroll_role_teacher') : t('enroll_role_parent')} — {enrollRole==='Teacher' ? t('enroll_role_teacher_d') : t('enroll_role_parent_d')}
                  </span>
                </div>

                {/* Step indicator — 2 steps only */}
                <div className="steps">
                  {['Your Details', 'Review & Confirm'].map((s,i)=>(
                    <div key={i} className={`step-item${step>i+1?' done':step===i+1?' active':''}`}>
                      <div className="step-circle">{step>i+1?<i className="fa-solid fa-check"></i>:i+1}</div>
                      <span className="step-lbl">{s}</span>
                    </div>
                  ))}
                </div>

                {/* STEP 1 — Personal details */}
                {step===1 && (
                  <div>
                    <div className="fg-2">
                      <div className="fg"><label className="fl">{t('f_pt_full_name')}</label><input name="fullName" required className="fi" placeholder={t('f_pt_full_name_ph')} defaultValue={ptFormData.fullName} /></div>
                      <div className="fg"><label className="fl">{t('f_pt_email')}</label><input name="email" type="email" required className="fi" placeholder="name@email.com" defaultValue={ptFormData.email} /></div>
                    </div>
                    <div className="fg-2">
                      <div className="fg"><label className="fl">{t('f_pt_phone')}</label><input name="phone" type="tel" required className="fi" placeholder={t('f_pt_phone_ph')} defaultValue={ptFormData.phone} /></div>
                      <div className="fg"><label className="fl">{t('f_pt_address')}</label><input name="address" className="fi" placeholder={t('f_pt_address_ph')} defaultValue={ptFormData.address} /></div>
                    </div>

                    {/* Parent-only: child's student ID */}
                    {enrollRole === 'Parent' && (
                      <div className="fg">
                        <label className="fl">{t('f_pt_child_id')}</label>
                        <input name="linkedStudentId" className="fi" placeholder={t('f_pt_child_id_ph')} defaultValue={ptFormData.linkedStudentId} />
                        <p style={{fontSize:'12px',color:'rgba(255,255,255,.35)',marginTop:'6px',lineHeight:1.7}}>{t('f_pt_child_id_help')}</p>
                      </div>
                    )}

                    {/* Teacher-only: subject + qualification */}
                    {enrollRole === 'Teacher' && (
                      <div className="fg-2">
                        <div className="fg"><label className="fl">{t('f_pt_subject')}</label><input name="subject" className="fi" placeholder={t('f_pt_subject_ph')} defaultValue={ptFormData.subject} /></div>
                        <div className="fg"><label className="fl">{t('f_pt_qualification')}</label><input name="qualification" className="fi" placeholder={t('f_pt_qualification_ph')} defaultValue={ptFormData.qualification} /></div>
                      </div>
                    )}

                    <div className="step-nav">
                      <span></span>
                      <button type="button" className="btn-next" onClick={(e)=>saveStepAndAdvancePT(e,2)}>
                        {t('f_review_confirm')} <i className="fa-solid fa-arrow-right"></i>
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 2 — Review & confirm */}
                {step===2 && (
                  <div>
                    <div style={{background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.09)',borderRadius:'12px',padding:'20px',marginBottom:'20px'}}>
                      <p style={{fontSize:'12px',fontWeight:700,color:'var(--teal)',marginBottom:'14px',letterSpacing:'0.5px',textTransform:'uppercase'}}>{t('f_review_title')}</p>
                      <div className="review-g">
                        <div><span style={{color:'rgba(255,255,255,.4)'}}>{t('f_pt_review_role')}</span>{enrollRole}</div>
                        <div><span style={{color:'rgba(255,255,255,.4)'}}>{t('f_pt_review_name')}</span>{ptFormData.fullName || '—'}</div>
                        <div><span style={{color:'rgba(255,255,255,.4)'}}>{t('f_pt_review_email')}</span>{ptFormData.email || '—'}</div>
                        <div><span style={{color:'rgba(255,255,255,.4)'}}>{t('f_pt_review_phone')}</span>{ptFormData.phone || '—'}</div>
                        {enrollRole==='Parent' && ptFormData.linkedStudentId && (
                          <div><span style={{color:'rgba(255,255,255,.4)'}}>Child ID: </span>{ptFormData.linkedStudentId}</div>
                        )}
                        {enrollRole==='Teacher' && ptFormData.subject && (
                          <div><span style={{color:'rgba(255,255,255,.4)'}}>{t('f_pt_subject')}: </span>{ptFormData.subject}</div>
                        )}
                        {enrollRole==='Teacher' && ptFormData.qualification && (
                          <div><span style={{color:'rgba(255,255,255,.4)'}}>{t('f_pt_qualification')}: </span>{ptFormData.qualification}</div>
                        )}
                      </div>
                    </div>
                    <div style={{background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.07)',borderRadius:'10px',padding:'14px 18px',marginBottom:'16px'}}>
                      <p style={{fontSize:'12px',color:'rgba(255,255,255,.4)',lineHeight:1.8}}>
                        {enrollRole==='Parent'
                          ? 'Your account will be created instantly. Log in to the Parent & Teacher Portal with the credentials shown on the next screen. Your child\'s profile will be linked within 24 hours if you didn\'t provide their Student ID.'
                          : 'Your teacher account will be created instantly. The academy will configure your student access. Log in to the Parent & Teacher Portal with the credentials shown on the next screen.'}
                      </p>
                    </div>
                    {formStatus.state==='error' && <div className="status-err">⚠ {formStatus.message}</div>}
                    <button type="submit" className="btn-submit" disabled={formStatus.state==='loading'}>
                      {formStatus.state==='loading'
                        ? <><i className="fa-solid fa-circle-notch fa-spin"></i> {t('f_creating_account')}</>
                        : <><i className="fa-solid fa-paper-plane"></i> Create My Account</>}
                    </button>
                    <div className="step-nav" style={{marginTop:'12px'}}>
                      <button type="button" className="btn-back" onClick={()=>setStep(1)}><i className="fa-solid fa-arrow-left"></i> {t('f_back')}</button>
                      <span></span>
                    </div>
                  </div>
                )}
              </div>
            </form>
          )}
        </div>
      </section>

      {/* ── CONTACT ── */}
      <section id="contact" className="sec sec-alt">
        <div className="sec-in">
          <p className="sec-lbl">{t('contact_lbl')}</p>
          <h2 className="sec-h">{t('contact_h')}</h2>
          <p className="sec-sub">{t('contact_sub')}</p>
          <div className="contact-g">
            {[
              { ic:'fa-brands fa-whatsapp', cl:'#4ade80',      label:t('contact_whatsapp'), val:t('contact_chat_now'),          href:`https://wa.me/${c.whatsappNumber}` },
              { ic:'fa-solid fa-phone',     cl:'#60a5fa',      label:t('contact_phone'),    val: c.phone,            href:`tel:${c.phone}` },
              { ic:'fa-solid fa-envelope',  cl:'var(--accent)', label:t('contact_email'),   val: c.email,            href:`mailto:${c.email}` },
              { ic:'fa-solid fa-location-dot', cl:'#f87171',   label:t('contact_location'), val: c.address,         href:'#' },
            ].map((item, i) => (
              <a key={i} href={item.href} target={item.href.startsWith('http')?'_blank':'_self'} rel="noopener noreferrer"
                style={{display:'flex',alignItems:'center',gap:'16px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'14px',padding:'22px',textDecoration:'none',transition:'all .2s'}}
                onMouseEnter={e=>e.currentTarget.style.boxShadow='var(--shadow-lg)'}
                onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}>
                <div style={{width:'44px',height:'44px',borderRadius:'12px',background:`${item.cl}18`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'18px',color:item.cl,flexShrink:0}}><i className={item.ic}></i></div>
                <div><div style={{fontSize:'11px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em',color:'var(--muted)',marginBottom:'3px'}}>{item.label}</div><div style={{fontSize:'15px',fontWeight:700,color:'var(--navy)'}}>{item.val}</div></div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="footer">
        <div className="footer-in">
          <div>
            <div className="f-brand">Vedanta Academy</div>
            <p className="f-p">{t('footer_brand_desc')}</p>
          </div>
          <div>
            <p className="f-h">{t('footer_academy')}</p>
            <a href="#about"    className="f-lnk">{t('footer_about_us')}</a>
            <a href="#classes"  className="f-lnk">{t('footer_classes')}</a>
            <a href="#subjects" className="f-lnk">{t('footer_subjects')}</a>
            <a href="#teachers" className="f-lnk">{t('footer_teachers')}</a>
          </div>
          <div>
            <p className="f-h">{t('footer_admission')}</p>
            <a href="#schedule" className="f-lnk">{t('footer_schedules')}</a>
            <a href="#fees"     className="f-lnk">{t('footer_fee_structure')}</a>
            <a href="#enroll"   className="f-lnk">{t('footer_enroll_now')}</a>
            <a href="/portal"        className="f-lnk">{t('footer_student_portal')}</a>
            <a href="/parent-portal" className="f-lnk">{t('footer_parent_portal')}</a>
          </div>
          <div>
            <p className="f-h">{t('footer_contact')}</p>
            <a href={`https://wa.me/${c.whatsappNumber}`} target="_blank" rel="noopener noreferrer" className="f-lnk" style={{color:'#4ade80'}}><i className="fa-brands fa-whatsapp"></i> {t('contact_whatsapp')}</a>
            <a href={`tel:${c.phone}`} className="f-lnk"><i className="fa-solid fa-phone"></i> {c.phone}</a>
            <span className="f-lnk"><i className="fa-solid fa-envelope"></i> {c.email}</span>
            <span className="f-lnk"><i className="fa-solid fa-location-dot"></i> {c.address}</span>
          </div>
        </div>
        <div className="footer-bot">{t('footer_rights')}</div>
      </footer>
    </>
  );
}

export default function Home() {
  return (
    <LanguageProvider>
      <HomeInner />
    </LanguageProvider>
  );
}

