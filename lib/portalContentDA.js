// lib/portalContentDA.js
//
// Danish mirror of the non-quiz FALLBACK config in pages/portal.js:
// settings (login screen text, sidebar labels, etc.), navigation tabs,
// dashboard stat cards, the demo "Academic Progress" subjects list, demo
// attendance figures, demo assignments, demo schedule, demo notifications,
// and profile field labels.
//
// Like landingContentDA.js and quizContentDA.js, this is shown when the
// site language is Danish — either because the live Sheet doesn't return
// these keys yet (today: settings/navigation/dashStats/etc. are NOT sourced
// from Sheets per pages/api/portal-config.js) or, for assignmentSubjects/
// learningModules/learningSteps specifically, because we deliberately keep
// Danish in control rather than letting an English-only Sheet overwrite it
// (see pages/portal.js).
//
// NOTE ON DEMO DATA: dashStats, the demo `subjects` progress list,
// `assignments`, `schedule`, and `notifications` are sample/placeholder
// content (a fictional student's data) shown until a real student's actual
// progress loads from /api/student/progress — translating the *words* here
// (labels, subject names, assignment titles) keeps the demo readable in
// Danish; the numbers themselves are arbitrary in both languages.

const PORTAL_SETTINGS_DA = {
  SiteName: 'Elevportal', AcademyName: 'Vedanta Academy',
  BackLinkLabel: 'Tilbage Til Akademiet', BackLinkURL: '/',
  LoginHeading: 'Elevportal', LoginSubheading: 'Log ind for at tilgå dit personlige dashboard',
  LoginButtonLabel: 'Tilgå Mit Dashboard', LoadingButtonText: 'Bekræfter…',
  SidebarSectionLabel: 'Mit Akademi', SignOutLabel: 'Log Ud',
  WelcomeGreeting: 'Goddag, {firstName}! 👋', EnrolmentStatus: 'Aktiv',
  DashboardSubtitle: 'Velkommen tilbage — her er dit faglige overblik.',
  DashboardNextClasses: '3',
  UploadZonePrimary: 'Klik for at vælge en fil, eller træk og slip',
  UploadZoneSub: 'Understøtter PDF, DOC, JPG, PNG',
  UploadSuccessTemplate: '"{filename}" blev afleveret!',
  UploadValidationError: 'Vælg en fil først.',
  AttHighColor: '#4ade80', AttMidColor: '#00c6a7', AttLowColor: '#f5a623',
  DefaultClassLevel: 'Class 3', AuthAPIEndpoint: '/api/student/auth',
  ConnectionErrorMsg: 'Forbindelsen mislykkedes. Kører serveren?',
};

const PORTAL_NAVIGATION_DA = [
  { ID:'dashboard',     Label:'Dashboard',          'Icon (FontAwesome solid)':'fa-chart-pie',      Active:true, Order:1 },
  { ID:'progress',      Label:'Faglige Fremskridt', 'Icon (FontAwesome solid)':'fa-chart-line',     Active:true, Order:2 },
  { ID:'leaderboard',   Label:'Rangliste',          'Icon (FontAwesome solid)':'fa-trophy',         Active:true, Order:3 },
  { ID:'attendance',    Label:'Fremmøde',           'Icon (FontAwesome solid)':'fa-calendar-check', Active:true, Order:4 },
  { ID:'assignments',   Label:'Opgaver',            'Icon (FontAwesome solid)':'fa-book-open',      Active:true, Order:5 },
  { ID:'schedule',      Label:'Kommende Timer',     'Icon (FontAwesome solid)':'fa-clock',          Active:true, Order:6 },
  { ID:'notifications', Label:'Notifikationer',     'Icon (FontAwesome solid)':'fa-bell',           Active:true, Order:7 },
  { ID:'profile',       Label:'Min Profil',         'Icon (FontAwesome solid)':'fa-user-circle',    Active:true, Order:8 },
];

const PORTAL_DASH_STATS_DA = [
  { 'Metric Key':'attendance_pct',   Label:'Fremmøde',                 Value:'85%','Sub-label':'Dette semester', 'Display Order':1, Active:true },
  { 'Metric Key':'submissions_pct',  Label:'Afleveringer',             Value:'88%','Sub-label':'Til tiden',      'Display Order':2, Active:true },
  { 'Metric Key':'avg_score',        Label:'Gnsn. Score',              Value:'65', 'Sub-label':'På tværs af fag','Display Order':3, Active:true },
  { 'Metric Key':'pending_tasks',    Label:'Afventende Opgaver',       Value:'5',  'Sub-label':'Opgaver',        'Display Order':4, Active:true },
  { 'Metric Key':'ratio_attendance', Label:'Fremmøde (Cirkeldiagram)', Value:'85', 'Sub-label':'',               'Display Order':5, Active:true },
  { 'Metric Key':'ratio_submissions',Label:'Afleveringer (Cirkeldiagram)',Value:'88','Sub-label':'',             'Display Order':6, Active:true },
  { 'Metric Key':'ratio_quiz_avg',   Label:'Gnsn. Quizscore (Cirkeldiagram)',Value:'78','Sub-label':'',          'Display Order':7, Active:true },
];

// Demo "Academic Progress" subjects list — placeholder values shown until
// real progress loads. Subject names here are independent of the quiz
// subject names (this is the older demo-data subjects list, separate from
// assignmentSubjects/learningModules).
const PORTAL_SUBJECTS_DEMO_DA = [
  { Subject:'Engelsk',   'Progress %':50,'Total Topics':12,'Topics Done':6, 'Color (Hex)':'#3b82f6','Display Order':1, Active:true },
  { Subject:'Matematik', 'Progress %':60,'Total Topics':15,'Topics Done':9, 'Color (Hex)':'#f97316','Display Order':2, Active:true },
  { Subject:'Naturfag',  'Progress %':82,'Total Topics':10,'Topics Done':8, 'Color (Hex)':'#22c55e','Display Order':3, Active:true },
  { Subject:'Geografi',  'Progress %':85,'Total Topics':8, 'Topics Done':4, 'Color (Hex)':'#eab308','Display Order':4, Active:true },
  { Subject:'Historie',  'Progress %':70,'Total Topics':10,'Topics Done':7, 'Color (Hex)':'#a855f7','Display Order':5, Active:true },
];

const PORTAL_ATT_STATS_DA = [
  { Metric:'classes_conducted', Value:'47', Label:'Afholdte Timer',  'Display Order':1 },
  { Metric:'classes_attended',  Value:'44', Label:'Mødte Timer',     'Display Order':2 },
  { Metric:'attendance_rate',   Value:'94%',Label:'Fremmødeprocent', 'Display Order':3 },
];

const PORTAL_ATT_MONTHLY_DA = [
  { Month:'Januar',  'Month Short':'Jan','Attendance %':96, 'Display Order':1 },
  { Month:'Februar', 'Month Short':'Feb','Attendance %':88, 'Display Order':2 },
  { Month:'Marts',   'Month Short':'Mar','Attendance %':100,'Display Order':3 },
  { Month:'April',   'Month Short':'Apr','Attendance %':92, 'Display Order':4 },
  { Month:'Maj',     'Month Short':'Maj','Attendance %':84, 'Display Order':5 },
  { Month:'Juni',    'Month Short':'Jun','Attendance %':96, 'Display Order':6 },
];

const PORTAL_ASSIGNMENTS_DEMO_DA = [
  { 'Assignment ID':'A001', Subject:'Matematik', Title:'Opgaveark 3 — Brøker',          'Due Date':'I dag',    Status:'pending',   Grade:'', 'Color (Hex)':'#f97316', Active:true },
  { 'Assignment ID':'A002', Subject:'Engelsk',   Title:'Stil: Min Yndlingsårstid',       'Due Date':'I morgen', Status:'pending',   Grade:'', 'Color (Hex)':'#3b82f6', Active:true },
  { 'Assignment ID':'A003', Subject:'Naturfag',  Title:'Tegn & Navngiv: Menneskekroppen','Due Date':'8. jun',   Status:'submitted', Grade:'', 'Color (Hex)':'#22c55e', Active:true },
  { 'Assignment ID':'A004', Subject:'Geografi',  Title:'Kortøvelse: Indiske Landformer', 'Due Date':'10. jun',  Status:'graded',    Grade:'A','Color (Hex)':'#eab308', Active:true },
  { 'Assignment ID':'A005', Subject:'Historie',  Title:'Tidslinje: Frihedsbevægelsen',   'Due Date':'12. jun',  Status:'pending',   Grade:'', 'Color (Hex)':'#a855f7', Active:true },
];

const PORTAL_SCHEDULE_DEMO_DA = [
  { 'Class ID':'S001', Subject:'Matematik', Teacher:'Fru Anjali Sharma', Date:'I dag',    Time:'16:00 – 17:30', Mode:'Physical', 'Color (Hex)':'#f97316', Active:true },
  { 'Class ID':'S002', Subject:'Naturfag',  Teacher:'Fru Anjali Sharma', Date:'I dag',    Time:'17:45 – 19:00', Mode:'Online',   'Color (Hex)':'#22c55e', Active:true },
  { 'Class ID':'S003', Subject:'Engelsk',   Teacher:'Hr. Pradeep Nair',  Date:'I morgen', Time:'16:00 – 17:30', Mode:'Physical', 'Color (Hex)':'#3b82f6', Active:true },
  { 'Class ID':'S004', Subject:'Historie',  Teacher:'Hr. Pradeep Nair',  Date:'7. jun',   Time:'10:00 – 11:30', Mode:'Online',   'Color (Hex)':'#a855f7', Active:true },
  { 'Class ID':'S005', Subject:'Geografi',  Teacher:'Fru Anjali Sharma', Date:'8. jun',   Time:'16:00 – 17:00', Mode:'Hybrid',   'Color (Hex)':'#eab308', Active:true },
];

const PORTAL_NOTIFICATIONS_DA = [
  { ID:'N001', Type:'assignment', Icon:'fa-book',    Title:'Ny Opgave Lagt Op',  Body:'Matematik Opgaveark 4 er nu tilgængeligt til download.',                Timestamp:'2 t siden',  Unread:true,  Active:true },
  { ID:'N002', Type:'schedule',   Icon:'fa-calendar',Title:'Skemaændring',       Body:'Fredagens naturfagstime er flyttet til kl. 17:00 grundet lærerens tilgængelighed.', Timestamp:'I går',      Unread:true,  Active:true },
  { ID:'N003', Type:'result',     Icon:'fa-star',    Title:'Opgave Bedømt',      Body:'Din geografi-kortøvelse er blevet bedømt — du fik A!',                  Timestamp:'2 dage siden',Unread:false, Active:true },
  { ID:'N004', Type:'reminder',   Icon:'fa-bell',    Title:'Eksamenspåmindelse', Body:'Engelsktest på fredag. Repetér venligst kapitel 4–6.',                  Timestamp:'3 dage siden',Unread:false, Active:true },
  { ID:'N005', Type:'message',    Icon:'fa-comment', Title:'Besked Fra Lærer',   Body:'Flot klaret med sidste uges naturfagstest! Bliv ved, Frederik!',        Timestamp:'4 dage siden',Unread:false, Active:true },
];

const PORTAL_PROFILE_FIELDS_DA = [
  { 'Field Key':'class_level',   Label:'Klassetrin', Value:'Class 3',          'Read-Only':'No',  Visible:true },
  { 'Field Key':'enrolled_date', Label:'Indskrevet',  Value:'Januar 2026',      'Read-Only':'Yes', Visible:true },
  { 'Field Key':'email',         Label:'E-mail',      Value:'foraelder@email.dk','Read-Only':'No', Visible:true },
  { 'Field Key':'phone',         Label:'Telefon',     Value:'+45 12 34 56 78', 'Read-Only':'No',  Visible:true },
];

export {
  PORTAL_SETTINGS_DA,
  PORTAL_NAVIGATION_DA,
  PORTAL_DASH_STATS_DA,
  PORTAL_SUBJECTS_DEMO_DA,
  PORTAL_ATT_STATS_DA,
  PORTAL_ATT_MONTHLY_DA,
  PORTAL_ASSIGNMENTS_DEMO_DA,
  PORTAL_SCHEDULE_DEMO_DA,
  PORTAL_NOTIFICATIONS_DA,
  PORTAL_PROFILE_FIELDS_DA,
};
