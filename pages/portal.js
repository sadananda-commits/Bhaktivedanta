import Head from 'next/head';
import Script from 'next/script';
import Link from 'next/link';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { LanguageProvider, useLanguage, LanguageToggle } from '../lib/i18n';
import MatchTheFollowing from '../components/MatchTheFollowing';
import GroupChat from '../components/GroupChat';
import ChatNotifications from '../components/ChatNotifications';
import AssignmentNotifications from '../components/AssignmentNotifications';
import { QUIZ_LEARNING_MODULES_DA, QUIZ_LEARNING_STEPS_DA, QUIZ_ASSIGNMENT_SUBJECTS_DA } from '../lib/quizContentDA';
import {
  PORTAL_SETTINGS_DA, PORTAL_NAVIGATION_DA, PORTAL_DASH_STATS_DA, PORTAL_SUBJECTS_DEMO_DA,
  PORTAL_ATT_STATS_DA, PORTAL_ATT_MONTHLY_DA, PORTAL_ASSIGNMENTS_DEMO_DA, PORTAL_SCHEDULE_DEMO_DA,
  PORTAL_NOTIFICATIONS_DA, PORTAL_PROFILE_FIELDS_DA,
} from '../lib/portalContentDA';


// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE SHEETS LIVE FETCH (via server-side API route — no CORS issues)
// Edit the sheet → refresh the page → changes appear instantly.
// ─────────────────────────────────────────────────────────────────────────────
// Pass the student's classLevel so the server can pre-filter modules/subjects.
// Omit classLevel (or pass '') to receive the full unfiltered dataset — used
// during the "set your class" onboarding flow, before a class is known.
async function fetchAllSheetData(classLevel) {
  const params = classLevel ? `?classLevel=${encodeURIComponent(classLevel)}` : '';
  const res = await fetch(`/api/portal-config${params}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`portal-config API returned ${res.status}`);
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// FALLBACK DATA (shown if Google Sheets is unreachable)
// ─────────────────────────────────────────────────────────────────────────────
const FALLBACK = {
  settings: {
    SiteName:'Student Portal', AcademyName:'Vedanta Academy',
    BackLinkLabel:'Back to Academy', BackLinkURL:'/',
    LoginHeading:'Student Portal', LoginSubheading:'Sign in to access your personal dashboard',
    LoginButtonLabel:'Access My Dashboard', LoadingButtonText:'Verifying…',
    SidebarSectionLabel:'My Academy', SignOutLabel:'Sign Out',
    WelcomeGreeting:'Good day, {firstName}! 👋', EnrolmentStatus:'Active',
    DashboardSubtitle:"Welcome back — here's your academic snapshot.",
    DashboardNextClasses:'3',
    UploadZonePrimary:'Click to select a file, or drag and drop',
    UploadZoneSub:'Supports PDF, DOC, JPG, PNG',
    UploadSuccessTemplate:'"{filename}" submitted successfully!',
    UploadValidationError:'Select a file first.',
    AttHighColor:'#4ade80', AttMidColor:'#00c6a7', AttLowColor:'#f5a623',
    DefaultClassLevel:'Class 3', AuthAPIEndpoint:'/api/student/auth',
    ConnectionErrorMsg:'Connection failed. Is the server running?',
  },
  // ── NAV REWORK (per academy request) ────────────────────────────────────
  // 'progress' (Academic Progress), 'attendance', and 'schedule' (Upcoming
  // Classes) are retired — removed from the menu entirely. Their render
  // blocks further down are now unreachable dead code (tab can never equal
  // those IDs again) and safe to delete in a future cleanup pass; left in
  // place here only to avoid touching unrelated code in this change.
  // 'assignments' keeps its original ID (so none of the existing quiz-bank
  // logic below has to change) but is now labelled "Question Bank" in the
  // sidebar. The new 'myassignments' tab ("Assignments for you") is the
  // chapter-specific homework a parent/teacher assigns from the Parent
  // Portal — see the ASSIGNMENTS-FOR-YOU section further down.
  navigation:[
    {ID:'dashboard',     Label:'Dashboard',          'Icon (FontAwesome solid)':'fa-chart-pie',      Active:true,Order:1},
    {ID:'leaderboard',   Label:'Leaderboard',        'Icon (FontAwesome solid)':'fa-trophy',         Active:true,Order:2},
    {ID:'assignments',   Label:'Question Bank',      'Icon (FontAwesome solid)':'fa-book-open',      Active:true,Order:3},
    {ID:'myassignments', Label:'Assignments for you','Icon (FontAwesome solid)':'fa-clipboard-list',Active:true,Order:4},
{ID:'chat', Label:'Group Chat', 'Icon (FontAwesome solid)':'fa-comments', Active:true, Order:4.5},
    {ID:'completedtopics',Label:'Completed Topics',  'Icon (FontAwesome solid)':'fa-circle-check',  Active:true,Order:5},
    {ID:'notifications', Label:'Notifications',      'Icon (FontAwesome solid)':'fa-bell',           Active:true,Order:5},
    {ID:'profile',       Label:'My Profile',         'Icon (FontAwesome solid)':'fa-user-circle',    Active:true,Order:6},
  ],
  dashStats:[
    {'Metric Key':'attendance_pct',   Label:'Attendance',               Value:'85%','Sub-label':'This term',      'Display Order':1,Active:true},
    {'Metric Key':'submissions_pct',  Label:'Submissions',              Value:'88%','Sub-label':'On time',        'Display Order':2,Active:true},
    {'Metric Key':'avg_score',        Label:'Avg Score',                Value:'65', 'Sub-label':'Across subjects','Display Order':3,Active:true},
    {'Metric Key':'pending_tasks',    Label:'Pending Tasks',            Value:'5',  'Sub-label':'Assignments',    'Display Order':4,Active:true},
    {'Metric Key':'ratio_attendance', Label:'Attendance (Ratio Chart)', Value:'85', 'Sub-label':'',               'Display Order':5,Active:true},
    {'Metric Key':'ratio_submissions',Label:'Submissions (Ratio Chart)',Value:'88', 'Sub-label':'',               'Display Order':6,Active:true},
    {'Metric Key':'ratio_quiz_avg',   Label:'Quiz Avg (Ratio Chart)',   Value:'78', 'Sub-label':'',               'Display Order':7,Active:true},
  ],
  subjects:[
    {Subject:'English',     'Progress %':50,'Total Topics':12,'Topics Done':6, 'Color (Hex)':'#3b82f6','Display Order':1,Active:true},
    {Subject:'Mathematics', 'Progress %':60,'Total Topics':15,'Topics Done':9, 'Color (Hex)':'#f97316','Display Order':2,Active:true},
    {Subject:'Science',     'Progress %':82,'Total Topics':10,'Topics Done':8, 'Color (Hex)':'#22c55e','Display Order':3,Active:true},
    {Subject:'Geography',   'Progress %':85,'Total Topics':8, 'Topics Done':4, 'Color (Hex)':'#eab308','Display Order':4,Active:true},
    {Subject:'History',     'Progress %':70,'Total Topics':10,'Topics Done':7, 'Color (Hex)':'#a855f7','Display Order':5,Active:true},
  ],
  attStats:[
    {Metric:'classes_conducted',Value:'47', Label:'Classes Conducted','Display Order':1},
    {Metric:'classes_attended', Value:'44', Label:'Classes Attended', 'Display Order':2},
    {Metric:'attendance_rate',  Value:'94%',Label:'Attendance Rate',  'Display Order':3},
  ],
  attMonthly:[
    {Month:'January', 'Month Short':'Jan','Attendance %':96, 'Display Order':1},
    {Month:'February','Month Short':'Feb','Attendance %':88, 'Display Order':2},
    {Month:'March',   'Month Short':'Mar','Attendance %':100,'Display Order':3},
    {Month:'April',   'Month Short':'Apr','Attendance %':92, 'Display Order':4},
    {Month:'May',     'Month Short':'May','Attendance %':84, 'Display Order':5},
    {Month:'June',    'Month Short':'Jun','Attendance %':96, 'Display Order':6},
  ],
  assignments:[
    {'Assignment ID':'A001',Subject:'Mathematics',Title:'Worksheet 3 — Fractions',      'Due Date':'Today',   Status:'pending',  Grade:'','Color (Hex)':'#f97316',Active:true},
    {'Assignment ID':'A002',Subject:'English',    Title:'Essay: My Favourite Season',    'Due Date':'Tomorrow',Status:'pending',  Grade:'','Color (Hex)':'#3b82f6',Active:true},
    {'Assignment ID':'A003',Subject:'Science',    Title:'Draw & Label: Human Body',      'Due Date':'Jun 8',   Status:'submitted',Grade:'','Color (Hex)':'#22c55e',Active:true},
    {'Assignment ID':'A004',Subject:'Geography',  Title:'Map Activity: Indian Landforms','Due Date':'Jun 10',  Status:'graded',   Grade:'A','Color (Hex)':'#eab308',Active:true},
    {'Assignment ID':'A005',Subject:'History',    Title:'Timeline: Freedom Movement',    'Due Date':'Jun 12',  Status:'pending',  Grade:'','Color (Hex)':'#a855f7',Active:true},
  ],
  schedule:[
    {'Class ID':'S001',Subject:'Mathematics',Teacher:'Mrs. Anjali Sharma',Date:'Today',   Time:'4:00 PM – 5:30 PM', Mode:'Physical','Color (Hex)':'#f97316',Active:true},
    {'Class ID':'S002',Subject:'Science',    Teacher:'Mrs. Anjali Sharma',Date:'Today',   Time:'5:45 PM – 7:00 PM', Mode:'Online',  'Color (Hex)':'#22c55e',Active:true},
    {'Class ID':'S003',Subject:'English',    Teacher:'Mr. Pradeep Nair',  Date:'Tomorrow',Time:'4:00 PM – 5:30 PM', Mode:'Physical','Color (Hex)':'#3b82f6',Active:true},
    {'Class ID':'S004',Subject:'History',    Teacher:'Mr. Pradeep Nair',  Date:'Jun 7',   Time:'10:00 AM – 11:30 AM',Mode:'Online', 'Color (Hex)':'#a855f7',Active:true},
    {'Class ID':'S005',Subject:'Geography',  Teacher:'Mrs. Anjali Sharma',Date:'Jun 8',   Time:'4:00 PM – 5:00 PM', Mode:'Hybrid', 'Color (Hex)':'#eab308',Active:true},
  ],
  notifications:[
    {ID:'N001',Type:'assignment',Icon:'fa-book',    Title:'New Assignment Posted', Body:'Mathematics Worksheet 4 is now available for download.',             Timestamp:'2 hrs ago', Unread:true, Active:true},
    {ID:'N002',Type:'schedule',  Icon:'fa-calendar',Title:'Schedule Change',       Body:"Friday's Science class moved to 5:00 PM due to teacher availability.",Timestamp:'Yesterday', Unread:true, Active:true},
    {ID:'N003',Type:'result',    Icon:'fa-star',    Title:'Assignment Graded',     Body:'Your Geography Map Activity has been graded — you scored A!',        Timestamp:'2 days ago',Unread:false,Active:true},
    {ID:'N004',Type:'reminder',  Icon:'fa-bell',    Title:'Exam Reminder',         Body:'Unit Test in English this Friday. Please revise Chapters 4–6.',      Timestamp:'3 days ago',Unread:false,Active:true},
    {ID:'N005',Type:'message',   Icon:'fa-comment', Title:'Teacher Message',       Body:"Well done on last week's Science test! Keep it up, Rohan!",          Timestamp:'4 days ago',Unread:false,Active:true},
  ],
  profileFields:[
    {'Field Key':'class_level',  Label:'Class',   Value:'Class 3',         'Read-Only':'No', Visible:true},
    {'Field Key':'enrolled_date',Label:'Enrolled',Value:'January 2026',    'Read-Only':'Yes',Visible:true},
    {'Field Key':'email',        Label:'Email',   Value:'parent@email.com','Read-Only':'No', Visible:true},
    {'Field Key':'phone',        Label:'Phone',   Value:'+91 98765 43210', 'Read-Only':'No', Visible:true},
  ],
  // ── CLASS LEVELS ──────────────────────────────────────────────────────────
  // Sheet-driven (see "Class Levels" tab in pages/api/portal-config.js docs).
  // This array is ONLY the offline/unreachable-API fallback — kept in sync
  // with DEFAULT_CLASS_LEVELS in portal-config.js. The live Sheet always
  // wins once it's reachable; edit the Sheet, not this array, to manage
  // classes day-to-day.
  classLevels:[
    {Class:'Class 0', Label:'Class 0 (Nursery/KG)', Age:'4-5 yrs',   'Display Order':1,  Active:true},
    {Class:'Class 1', Label:'Class 1', Age:'5-6 yrs',   'Display Order':2,  Active:true},
    {Class:'Class 2', Label:'Class 2', Age:'6-7 yrs',   'Display Order':3,  Active:true},
    {Class:'Class 3', Label:'Class 3', Age:'7-8 yrs',   'Display Order':4,  Active:true},
    {Class:'Class 4', Label:'Class 4', Age:'8-9 yrs',   'Display Order':5,  Active:true},
    {Class:'Class 5', Label:'Class 5', Age:'9-10 yrs',  'Display Order':6,  Active:true},
    {Class:'Class 6', Label:'Class 6', Age:'10-11 yrs', 'Display Order':7,  Active:true},
    {Class:'Class 7', Label:'Class 7', Age:'11-12 yrs', 'Display Order':8,  Active:true},
    {Class:'Class 8', Label:'Class 8', Age:'12-13 yrs', 'Display Order':9,  Active:true},
    {Class:'Class 9', Label:'Class 9', Age:'13-14 yrs', 'Display Order':10, Active:true},
    {Class:'Class 10',Label:'Class 10',Age:'14-15 yrs', 'Display Order':11, Active:true},
    {Class:'Adult',   Label:'Adult',   Age:'18+ yrs',   'Display Order':12, Active:true},
  ],
  // ── ASSIGNMENT SUBJECTS (Step 1 of the drill-down) ───────────────────────────
  // One row per subject shown on the Assignment section's subject-picker screen.
  // The topic *list* under each subject is never hardcoded — it's always derived
  // live from learningModules below (filtered by this exact Subject string), so
  // adding a brand-new subject is just: 1 row here + topic rows in learningModules
  // + step rows in learningSteps. No app code changes needed, ever.
  assignmentSubjects:[
    {Subject:'English Grammar',  Tagline:'Grammar, vocabulary & writing skills',     'Icon (FontAwesome solid)':'fa-spell-check',  Emoji:'📚', 'Color (Hex)':'#3b82f6', 'Display Order':1, Active:true},
    {Subject:'Mathematics',      Tagline:'Numbers, shapes & problem solving',         'Icon (FontAwesome solid)':'fa-calculator',   Emoji:'➗', 'Color (Hex)':'#f97316', 'Display Order':2, Active:true},
    {Subject:'Science',          Tagline:'Plants, the body & how the world works',    'Icon (FontAwesome solid)':'fa-flask',        Emoji:'🔬', 'Color (Hex)':'#22c55e', 'Display Order':3, Active:true},
    {Subject:'Social Studies',   Tagline:'History, geography & the world around us',  'Icon (FontAwesome solid)':'fa-earth-asia',   Emoji:'🌍', 'Color (Hex)':'#eab308', 'Display Order':4, Active:true},
    {Subject:'General Knowledge',Tagline:'Fun facts & general awareness',             'Icon (FontAwesome solid)':'fa-lightbulb',    Emoji:'💡', 'Color (Hex)':'#a855f7', 'Display Order':5, Active:true},
  ],
  // ── INTERACTIVE LEARNING ──────────────────────────────────────────────────
  // One row per topic. Teachers add a new daily topic by adding a new row here
  // (in the live sheet this is its own "Learning Modules" tab).
  learningModules:[
    {'Module ID':'LM01',Title:'Plant Life Cycle', Subject:'Science',     Class:'Class 5', 'Icon (FontAwesome solid)':'fa-seedling', Emoji:'🌱', 'Color (Hex)':'#22c55e', Introduction:"Plants begin as tiny seeds. With water, sunlight, and good soil, a seed grows into a seedling, then a tall mature plant. Mature plants grow flowers that make new seeds — and the whole cycle starts again!", 'Intro Image URL':'', 'Display Order':1, Active:true},
    {'Module ID':'LM02',Title:'Solar System',     Subject:'Science',     Class:'Class 5', 'Icon (FontAwesome solid)':'fa-globe',    Emoji:'🪐', 'Color (Hex)':'#22c55e', Introduction:"Our Solar System is the Sun and everything that travels around it — eight planets, their moons, and lots of smaller rocky and icy objects, all held in place by the Sun's gravity.", 'Intro Image URL':'', 'Display Order':2, Active:true},
    {'Module ID':'LM03',Title:'Water Cycle',      Subject:'Science',     Class:'Class 5', 'Icon (FontAwesome solid)':'fa-droplet',  Emoji:'💧', 'Color (Hex)':'#22c55e', Introduction:"Water is always on the move! It rises from oceans and rivers as vapor, cools into clouds, falls back down as rain, and flows back to the sea to begin the journey all over again.", 'Intro Image URL':'', 'Display Order':3, Active:true},
    {'Module ID':'LM04',Title:'Human Body',       Subject:'Science',     Class:'Class 5', 'Icon (FontAwesome solid)':'fa-person',   Emoji:'🫀', 'Color (Hex)':'#22c55e', Introduction:"Your body is a team of amazing parts working together — bones that hold you up, muscles that help you move, a heart that pumps blood, and lungs that bring in the air you breathe.", 'Intro Image URL':'', 'Display Order':4, Active:true},
    {'Module ID':'LM05',Title:'Fractions',        Subject:'Mathematics', Class:'Class 6', 'Icon (FontAwesome solid)':'fa-divide',   Emoji:'➗', 'Color (Hex)':'#f97316', Introduction:"A fraction shows part of a whole — like one slice of a pizza that's been cut into equal pieces. The bottom number counts all the slices; the top number counts the slices you have.", 'Intro Image URL':'', 'Display Order':5, Active:true},
    // ── Mathematics (Class 5) — All 9 CBSE Chapters ────────────────────────
    {'Module ID':'LM_M01', Title:'The Fish Tale',             Subject:'Mathematics', Class:'Class 5', 'Icon (FontAwesome solid)':'fa-fish',          Emoji:'🐟', 'Color (Hex)':'#f97316', Introduction:"Numbers are all around us — even in a fish market! In this chapter we explore very large numbers through real-life stories, learn how to read and write them, and practise rounding, estimation, and place value to make sense of big quantities.", 'Intro Image URL':'', 'Display Order':26, Active:true},
    {'Module ID':'LM_M02', Title:'Shapes and Angles',         Subject:'Mathematics', Class:'Class 5', 'Icon (FontAwesome solid)':'fa-shapes',        Emoji:'📐', 'Color (Hex)':'#f97316', Introduction:"Angles are everywhere — in the corners of a book, the hands of a clock, and the legs of a chair. This chapter teaches us to identify, name, measure, and draw angles, and to explore how different shapes are built from straight lines meeting at different angles.", 'Intro Image URL':'', 'Display Order':27, Active:true},
    {'Module ID':'LM_M03', Title:'Parts and Wholes',          Subject:'Mathematics', Class:'Class 5', 'Icon (FontAwesome solid)':'fa-chart-pie',     Emoji:'🍕', 'Color (Hex)':'#f97316', Introduction:"When we split something into equal pieces, each piece is a fraction of the whole. In this chapter we learn to read, write, compare, and add fractions through fun activities like colouring grids, sharing food, and reading maps.", 'Intro Image URL':'', 'Display Order':28, Active:true},
    {'Module ID':'LM_M04', Title:'Factors and Multiples',     Subject:'Mathematics', Class:'Class 5', 'Icon (FontAwesome solid)':'fa-hashtag',       Emoji:'🔢', 'Color (Hex)':'#f97316', Introduction:"Some numbers hide inside others! A factor divides a number exactly, and a multiple is what you get when you multiply. This chapter helps us find factors, spot multiples, work with prime numbers, and use the LCM and HCF to solve real problems.", 'Intro Image URL':'', 'Display Order':29, Active:true},
    {'Module ID':'LM_M05', Title:'Decimals',                  Subject:'Mathematics', Class:'Class 5', 'Icon (FontAwesome solid)':'fa-circle-dot',   Emoji:'🔟', 'Color (Hex)':'#f97316', Introduction:"A decimal point unlocks the world between whole numbers. In this chapter we meet tenths, hundredths, and thousandths — and practise reading prices, measuring lengths, and adding or subtracting decimal numbers with confidence.", 'Intro Image URL':'', 'Display Order':30, Active:true},
    {'Module ID':'LM_M06', Title:'Area and Perimeter',        Subject:'Mathematics', Class:'Class 5', 'Icon (FontAwesome solid)':'fa-vector-square', Emoji:'📏', 'Color (Hex)':'#f97316', Introduction:"How much fencing do you need around a garden? How many tiles cover a floor? Perimeter measures the distance around a shape, and area measures the space inside it. This chapter builds both skills using rectangles, squares, and irregular shapes.", 'Intro Image URL':'', 'Display Order':31, Active:true},
    {'Module ID':'LM_M07', Title:'Charts and Graphs',         Subject:'Mathematics', Class:'Class 5', 'Icon (FontAwesome solid)':'fa-chart-bar',     Emoji:'📊', 'Color (Hex)':'#f97316', Introduction:"Numbers tell better stories with pictures! In this chapter we collect data, draw tally charts, pictographs, and bar graphs, read information from them, and answer questions about real-life situations using data we have organised.", 'Intro Image URL':'', 'Display Order':32, Active:true},
    {'Module ID':'LM_M08', Title:'Multiplication and Division', Subject:'Mathematics', Class:'Class 5', 'Icon (FontAwesome solid)':'fa-calculator',  Emoji:'✖️', 'Color (Hex)':'#f97316', Introduction:"Multiplication and division are everywhere in daily life — from sharing sweets equally among friends to finding how many items fit in boxes. In this chapter you will multiply and divide confidently, solve real-life word problems, and discover how these two operations are always connected.", 'Intro Image URL':'', 'Display Order':33, Active:true},
    {'Module ID':'LM_M09', Title:'Measurement',               Subject:'Mathematics', Class:'Class 5', 'Icon (FontAwesome solid)':'fa-ruler',         Emoji:'📐', 'Color (Hex)':'#f97316', Introduction:"How heavy is your school bag? How far is the next town? How much water fills a bucket? This chapter covers the units and tools we use to measure length, weight, and volume — and practises converting between units to solve everyday problems.", 'Intro Image URL':'', 'Display Order':34, Active:true},
    // ── English Grammar (Class 5) — 20 topics ──────────────────────────────
    // Source: Class 5 English Grammar Mastery Workbook. Topic 1 (Nouns) below
    // has its full 50-question progressive lesson built in learningSteps.
    // The remaining 19 are scaffolded with real intros so the full Topic list
    // is browsable today; their step content lands in upcoming stages — until
    // then, opening one shows the existing "no steps yet" message gracefully.
    {'Module ID':'LM06',Title:'Nouns',                       Subject:'English Grammar', Class:'Class 5', 'Icon (FontAwesome solid)':'fa-tag',                Emoji:'🏷️', 'Color (Hex)':'#3b82f6', Introduction:"A noun is the name of a person, place, animal, thing, or idea. We use nouns every day when we talk about people, places, and objects around us.", 'Now You Try':"Write one sentence that uses a common noun, a proper noun, and an abstract noun together.", 'Intro Image URL':'', 'Display Order':6, Active:true},
    {'Module ID':'LM07',Title:'Pronouns',                    Subject:'English Grammar', Class:'Class 5', 'Icon (FontAwesome solid)':'fa-user',               Emoji:'👤', 'Color (Hex)':'#3b82f6', Introduction:"A pronoun is a word that takes the place of a noun, like he, she, it, or they. Instead of repeating a name again and again, pronouns help our sentences flow more smoothly.", 'Intro Image URL':'', 'Display Order':7, Active:true},
    {'Module ID':'LM08',Title:'Verbs',                       Subject:'English Grammar', Class:'Class 5', 'Icon (FontAwesome solid)':'fa-person-running',     Emoji:'🏃', 'Color (Hex)':'#3b82f6', Introduction:"A verb is an action word — it tells us what someone or something is doing, like run, jump, or sing. Every sentence needs a verb to come alive!", 'Intro Image URL':'', 'Display Order':8, Active:true},
    {'Module ID':'LM09',Title:'Adjectives',                  Subject:'English Grammar', Class:'Class 5', 'Icon (FontAwesome solid)':'fa-palette',            Emoji:'🎨', 'Color (Hex)':'#3b82f6', Introduction:"An adjective is a word that describes a noun — it tells us what something looks, feels, or seems like, like tall, red, or happy. Adjectives add colour and detail to our sentences.", 'Intro Image URL':'', 'Display Order':9, Active:true},
    {'Module ID':'LM10',Title:'Adverbs',                     Subject:'English Grammar', Class:'Class 5', 'Icon (FontAwesome solid)':'fa-bolt',                Emoji:'⚡', 'Color (Hex)':'#3b82f6', Introduction:"An adverb describes how, when, or where an action happens, like quickly, yesterday, or outside. Adverbs often answer the question \"how?\" about a verb.", 'Intro Image URL':'', 'Display Order':10, Active:true},
    {'Module ID':'LM11',Title:'Articles',                    Subject:'English Grammar', Class:'Class 5', 'Icon (FontAwesome solid)':'fa-bookmark',           Emoji:'🔖', 'Color (Hex)':'#3b82f6', Introduction:"Articles are the small words a, an, and the that come before nouns. They help us know whether we're talking about any one thing in general, or one special, specific thing.", 'Intro Image URL':'', 'Display Order':11, Active:true},
    {'Module ID':'LM12',Title:'Prepositions',                Subject:'English Grammar', Class:'Class 5', 'Icon (FontAwesome solid)':'fa-location-dot',       Emoji:'📍', 'Color (Hex)':'#3b82f6', Introduction:"A preposition is a word that shows where something is or how it relates to something else, like in, on, under, or behind. Prepositions help us describe positions and places.", 'Intro Image URL':'', 'Display Order':12, Active:true},
    {'Module ID':'LM13',Title:'Conjunctions',                Subject:'English Grammar', Class:'Class 5', 'Icon (FontAwesome solid)':'fa-link',                Emoji:'🔗', 'Color (Hex)':'#3b82f6', Introduction:"A conjunction is a joining word, like and, but, or because. Conjunctions connect words, phrases, or whole sentences together so our ideas flow smoothly.", 'Intro Image URL':'', 'Display Order':13, Active:true},
    {'Module ID':'LM14',Title:'Subject and Predicate',       Subject:'English Grammar', Class:'Class 5', 'Icon (FontAwesome solid)':'fa-scale-balanced',     Emoji:'⚖️', 'Color (Hex)':'#3b82f6', Introduction:"Every sentence has two main parts: the subject, which tells us who or what the sentence is about, and the predicate, which tells us what the subject does or is.", 'Intro Image URL':'', 'Display Order':14, Active:true},
    {'Module ID':'LM15',Title:'Types of Sentences',          Subject:'English Grammar', Class:'Class 5', 'Icon (FontAwesome solid)':'fa-comment',            Emoji:'💭', 'Color (Hex)':'#3b82f6', Introduction:"Sentences come in different types depending on their job — telling, asking, exclaiming, or commanding. Knowing the type helps us choose the right punctuation too!", 'Intro Image URL':'', 'Display Order':15, Active:true},
    {'Module ID':'LM16',Title:'Punctuation',                 Subject:'English Grammar', Class:'Class 5', 'Icon (FontAwesome solid)':'fa-pen',                 Emoji:'✏️', 'Color (Hex)':'#3b82f6', Introduction:"Punctuation marks — like full stops, question marks, commas, and exclamation marks — are the little signals that help readers know how to read a sentence.", 'Intro Image URL':'', 'Display Order':16, Active:true},
    {'Module ID':'LM17',Title:'Direct and Indirect Speech',  Subject:'English Grammar', Class:'Class 5', 'Icon (FontAwesome solid)':'fa-comments',           Emoji:'💬', 'Color (Hex)':'#3b82f6', Introduction:"Direct speech repeats someone's exact words inside quotation marks. Indirect speech reports what someone said, without quoting them word for word. Both ways let us share what people say!", 'Intro Image URL':'', 'Display Order':17, Active:true},
    {'Module ID':'LM18',Title:'Synonyms',                    Subject:'English Grammar', Class:'Class 5', 'Icon (FontAwesome solid)':'fa-arrows-rotate',      Emoji:'🔄', 'Color (Hex)':'#3b82f6', Introduction:"Synonyms are words that mean almost the same thing, like happy and glad. Knowing synonyms helps us choose just the right word and avoid repeating ourselves.", 'Intro Image URL':'', 'Display Order':18, Active:true},
    {'Module ID':'LM19',Title:'Antonyms',                    Subject:'English Grammar', Class:'Class 5', 'Icon (FontAwesome solid)':'fa-arrows-left-right',  Emoji:'↔️', 'Color (Hex)':'#3b82f6', Introduction:"Antonyms are words with opposite meanings, like hot and cold, or big and small. Spotting antonyms helps us understand and describe differences clearly.", 'Intro Image URL':'', 'Display Order':19, Active:true},
    {'Module ID':'LM20',Title:'Homophones',                  Subject:'English Grammar', Class:'Class 5', 'Icon (FontAwesome solid)':'fa-ear-listen',         Emoji:'👂', 'Color (Hex)':'#3b82f6', Introduction:"Homophones are words that sound exactly the same but have different spellings and meanings, like their and there. Learning them helps us write the correct word every time.", 'Intro Image URL':'', 'Display Order':20, Active:true},
    {'Module ID':'LM21',Title:'Vocabulary Building',         Subject:'English Grammar', Class:'Class 5', 'Icon (FontAwesome solid)':'fa-book',                Emoji:'📖', 'Color (Hex)':'#3b82f6', Introduction:"Vocabulary building means learning new words and understanding what they mean, so we can read, write, and speak with more confidence and variety.", 'Intro Image URL':'', 'Display Order':21, Active:true},
    {'Module ID':'LM22',Title:'Sentence Formation',          Subject:'English Grammar', Class:'Class 5', 'Icon (FontAwesome solid)':'fa-puzzle-piece',       Emoji:'🧩', 'Color (Hex)':'#3b82f6', Introduction:"Sentence formation is about putting words together in the right order, so our sentences make complete sense and clearly share our ideas.", 'Intro Image URL':'', 'Display Order':22, Active:true},
    {'Module ID':'LM23',Title:'Letter Writing',              Subject:'English Grammar', Class:'Class 5', 'Icon (FontAwesome solid)':'fa-envelope',           Emoji:'✉️', 'Color (Hex)':'#3b82f6', Introduction:"Letter writing teaches us how to write a friendly, well-organised letter — with a greeting, a clear message, and a warm closing — to share news with someone we care about.", 'Intro Image URL':'', 'Display Order':23, Active:true},
    {'Module ID':'LM24',Title:'Reading Comprehension',       Subject:'English Grammar', Class:'Class 5', 'Icon (FontAwesome solid)':'fa-book-open-reader',   Emoji:'📚', 'Color (Hex)':'#3b82f6', Introduction:"Reading comprehension is the skill of understanding what we read — finding facts, figuring out meanings, and following a story from beginning to end.", 'Intro Image URL':'', 'Display Order':24, Active:true},
    {'Module ID':'LM25',Title:'Creative Writing',            Subject:'English Grammar', Class:'Class 5', 'Icon (FontAwesome solid)':'fa-feather',            Emoji:'✍️', 'Color (Hex)':'#3b82f6', Introduction:"Creative writing lets our imagination shine! It's about telling our own stories, describing scenes vividly, and putting our ideas into well-organised paragraphs.", 'Intro Image URL':'', 'Display Order':25, Active:true},
  ],
  // One row per learning step, linked to a Module ID, in the order they should be taught
  // (in the live sheet this is its own "Learning Steps" tab).
  learningSteps:[
    // Plant Life Cycle
    // Plant Life Cycle — 8 Learning Sections × 3 progressive steps = 24 questions.
    // Optional columns demoed here: 'Learning Section' (groups steps under a sub-topic
    // heading), 'Learn More URL' / 'Learn More Label' (Step 5 — further reading link).
    // Section 1: What is a plant?
    {'Module ID':'LM01','Step Number':1,'Learning Section':'What is a plant?',Teaching:"Plants are living things that make their own food using sunlight, water, and air — they don't eat other living things the way animals do.",'Step Image URL':'',Question:"Which of these is true about plants?",'Option A':'They eat other living things','Option B':'They make their own food using sunlight','Option C':'They can walk to find food','Option D':'They are not living things','Correct Option':'B',Explanation:"Correct! Plants make their own food through a process called photosynthesis, using sunlight, water, and air.",'Learn More URL':'https://www.ncert.nic.in/textbook/pdf/eeap105.pdf','Learn More Label':'Read the NCERT chapter: Seeds and Seeds',Active:true},
    {'Module ID':'LM01','Step Number':2,'Learning Section':'What is a plant?',Teaching:"Plants are found almost everywhere on Earth — in gardens, forests, deserts, and ponds — because different plants have adapted to survive in different places.",'Step Image URL':'',Question:"Where can plants be found?",'Option A':'Only in gardens','Option B':'Only in forests','Option C':'Almost everywhere, including deserts and ponds','Option D':'Only where it rains a lot','Correct Option':'C',Explanation:"Right! Plants have adapted to live in many environments, from dry deserts to wet ponds.",'Learn More URL':'https://www.ncert.nic.in/textbook/pdf/eeap105.pdf','Learn More Label':'Read the NCERT chapter: Seeds and Seeds',Active:true},
    {'Module ID':'LM01','Step Number':3,'Learning Section':'What is a plant?',Teaching:"Like all living things, a plant is born, grows, reproduces, and eventually dies — this whole journey is called its life cycle.",'Step Image URL':'',Question:"What do we call the journey a plant takes from being born to producing new plants?",'Option A':'Plant life cycle','Option B':'Plant family','Option C':'Plant kingdom','Option D':'Plant habitat','Correct Option':'A',Explanation:"Yes! Every plant goes through stages, from seed to making new seeds — and that whole journey is its life cycle.",'Learn More URL':'https://www.ncert.nic.in/textbook/pdf/eeap105.pdf','Learn More Label':'Read the NCERT chapter: Seeds and Seeds',Active:true},
    // Section 2: What is a seed?
    {'Module ID':'LM01','Step Number':4,'Learning Section':'What is a seed?',Teaching:"A seed is a tiny package made by a plant that holds a baby plant inside, along with some stored food to help it start growing.",'Step Image URL':'',Question:"What does a seed contain inside it?",'Option A':'A baby plant and stored food','Option B':'Only water','Option C':'Only soil','Option D':'A fully grown plant','Correct Option':'A',Explanation:"Correct! Inside every seed is a tiny baby plant (the embryo) plus a small store of food for its first days of growth.",'Learn More URL':'https://www.ncert.nic.in/textbook/pdf/eeap105.pdf','Learn More Label':'Read the NCERT chapter: Seeds and Seeds',Active:true},
    {'Module ID':'LM01','Step Number':5,'Learning Section':'What is a seed?',Teaching:"Seeds come in many shapes, sizes, and colours — from a tiny mustard seed to a large coconut seed.",'Step Image URL':'',Question:"Which statement about seeds is correct?",'Option A':'All seeds look exactly the same','Option B':'Seeds can be many different shapes, sizes and colours','Option C':'Seeds are always green','Option D':'Seeds are always round','Correct Option':'B',Explanation:"Right! Just compare a tiny mustard seed to a giant coconut seed — seeds vary hugely.",'Learn More URL':'https://www.ncert.nic.in/textbook/pdf/eeap105.pdf','Learn More Label':'Read the NCERT chapter: Seeds and Seeds',Active:true},
    {'Module ID':'LM01','Step Number':6,'Learning Section':'What is a seed?',Teaching:"Most seeds have a tough outer covering called a seed coat, which protects the baby plant inside until conditions are right for it to grow.",'Step Image URL':'',Question:"What protects the baby plant inside a seed?",'Option A':'The leaf','Option B':'The seed coat','Option C':'The flower','Option D':'The root','Correct Option':'B',Explanation:"Yes! The tough seed coat shields the delicate embryo until it's time to sprout.",'Learn More URL':'https://www.ncert.nic.in/textbook/pdf/eeap105.pdf','Learn More Label':'Read the NCERT chapter: Seeds and Seeds',Active:true},
    // Section 3: How does germination occur?
    {'Module ID':'LM01','Step Number':7,'Learning Section':'How does germination occur?',Teaching:"Germination is the process where a seed wakes up and begins to sprout, starting its journey into a young plant.",'Step Image URL':'',Question:"What is germination?",'Option A':'A seed turning into a flower instantly','Option B':'A seed beginning to sprout and grow','Option C':'A plant losing its leaves','Option D':'A seed being eaten','Correct Option':'B',Explanation:"Correct! Germination is simply the first stage of growth, when the tiny plant inside the seed starts to grow.",'Learn More URL':'https://www.ncert.nic.in/textbook/pdf/eeap105.pdf','Learn More Label':'Read the NCERT chapter: Seeds and Seeds',Active:true},
    {'Module ID':'LM01','Step Number':8,'Learning Section':'How does germination occur?',Teaching:"During germination, the seed coat splits open as a small root grows downward and a shoot grows upward.",'Step Image URL':'',Question:"What happens first as a seed germinates?",'Option A':'The seed coat splits and a root and shoot begin to grow','Option B':'The plant grows flowers immediately','Option C':'The seed turns to stone','Option D':'The seed flies away','Correct Option':'A',Explanation:"Right! The root grows down to anchor the plant and absorb water, while the shoot grows up toward the light.",'Learn More URL':'https://www.ncert.nic.in/textbook/pdf/eeap105.pdf','Learn More Label':'Read the NCERT chapter: Seeds and Seeds',Active:true},
    {'Module ID':'LM01','Step Number':9,'Learning Section':'How does germination occur?',Teaching:"Not all seeds germinate at the same speed — some sprout in days, while others can take weeks, depending on the seed and the conditions around it.",'Step Image URL':'',Question:"Do all seeds take the same amount of time to germinate?",'Option A':'Yes, always exactly 7 days','Option B':'No, it varies by seed type and conditions','Option C':'No seed ever germinates','Option D':'Yes, all seeds take a year','Correct Option':'B',Explanation:"Correct! Germination time depends on the kind of seed and on conditions like temperature and moisture.",'Learn More URL':'https://www.ncert.nic.in/textbook/pdf/eeap105.pdf','Learn More Label':'Read the NCERT chapter: Seeds and Seeds',Active:true},
    // Section 4: What does a seed need to grow?
    {'Module ID':'LM01','Step Number':10,'Learning Section':'What does a seed need to grow?',Teaching:"A seed needs water, air, and the right temperature to germinate and start growing.",'Step Image URL':'',Question:"Which of these does a seed need to germinate?",'Option A':'Water, air and the right temperature','Option B':'Only darkness','Option C':'Only sand','Option D':'Loud noise','Correct Option':'A',Explanation:"Yes! Water softens the seed coat and activates growth, air provides oxygen, and warmth helps the process along.",'Learn More URL':'https://www.ncert.nic.in/textbook/pdf/eeap105.pdf','Learn More Label':'Read the NCERT chapter: Seeds and Seeds',Active:true},
    {'Module ID':'LM01','Step Number':11,'Learning Section':'What does a seed need to grow?',Teaching:"Once a seedling has sprouted, it also needs sunlight to keep growing strong and healthy.",'Step Image URL':'',Question:"Why does a growing seedling need sunlight?",'Option A':'To make its own food through photosynthesis','Option B':'To make noise','Option C':'To change colour only','Option D':'Sunlight is not needed','Correct Option':'A',Explanation:"Correct! Once it has leaves, the young plant uses sunlight to make its own food and keep growing.",'Learn More URL':'https://www.ncert.nic.in/textbook/pdf/eeap105.pdf','Learn More Label':'Read the NCERT chapter: Seeds and Seeds',Active:true},
    {'Module ID':'LM01','Step Number':12,'Learning Section':'What does a seed need to grow?',Teaching:"Good soil gives a growing plant nutrients to absorb and a stable place for its roots to anchor and spread.",'Step Image URL':'',Question:"What does soil provide to a growing plant?",'Option A':'Nutrients and a place for roots to anchor','Option B':'Only colour','Option C':'Only weight','Option D':'Nothing important','Correct Option':'A',Explanation:"Right! Soil holds the nutrients roots absorb and gives the plant a stable place to grow.",'Learn More URL':'https://www.ncert.nic.in/textbook/pdf/eeap105.pdf','Learn More Label':'Read the NCERT chapter: Seeds and Seeds',Active:true},
    // Section 5: What is a seedling?
    {'Module ID':'LM01','Step Number':13,'Learning Section':'What is a seedling?',Teaching:"A seedling is a young plant that has just sprouted from a seed, usually with its very first tiny leaves.",'Step Image URL':'',Question:"What do we call a young plant that has just sprouted?",'Option A':'A seedling','Option B':'A flower','Option C':'A fruit','Option D':'A root','Correct Option':'A',Explanation:"Correct! A seedling is the very first plant stage after germination, often just a thin stem with one or two small leaves.",'Learn More URL':'https://www.ncert.nic.in/textbook/pdf/eeap105.pdf','Learn More Label':'Read the NCERT chapter: Seeds and Seeds',Active:true},
    {'Module ID':'LM01','Step Number':14,'Learning Section':'What is a seedling?',Teaching:"A seedling's first leaves help it start making its own food through photosynthesis as soon as possible.",'Step Image URL':'',Question:"What is the job of a seedling's first leaves?",'Option A':"To help it start making food via photosynthesis",'Option B':'To attract animals','Option C':'To make seeds immediately','Option D':'To protect the roots','Correct Option':'A',Explanation:"Yes! Those first small leaves are crucial — they let the seedling begin capturing sunlight to fuel its growth.",'Learn More URL':'https://www.ncert.nic.in/textbook/pdf/eeap105.pdf','Learn More Label':'Read the NCERT chapter: Seeds and Seeds',Active:true},
    {'Module ID':'LM01','Step Number':15,'Learning Section':'What is a seedling?',Teaching:"Seedlings are delicate and can be easily damaged, so gardeners and farmers often protect them from harsh weather and hungry animals.",'Step Image URL':'',Question:"Why are seedlings considered delicate?",'Option A':'They are easily damaged by weather or animals','Option B':'They are made of stone','Option C':'They cannot be eaten by anything','Option D':'They are heavier than mature plants','Correct Option':'A',Explanation:"Correct! Young seedlings haven't yet developed the toughness of a mature plant.",'Learn More URL':'https://www.ncert.nic.in/textbook/pdf/eeap105.pdf','Learn More Label':'Read the NCERT chapter: Seeds and Seeds',Active:true},
    // Section 6: How does a mature plant form?
    {'Module ID':'LM01','Step Number':16,'Learning Section':'How does a mature plant form?',Teaching:"As a seedling keeps absorbing sunlight, water, and nutrients, it grows taller and develops a stronger stem, more leaves, and roots — becoming a mature plant.",'Step Image URL':'',Question:"What helps a seedling grow into a mature plant?",'Option A':'Continued sunlight, water and nutrients','Option B':'Staying in the dark','Option C':'Removing its roots','Option D':'Avoiding water','Correct Option':'A',Explanation:"Right! Steady access to sunlight, water, and nutrients lets the plant keep building new cells and growing larger.",'Learn More URL':'https://www.ncert.nic.in/textbook/pdf/eeap105.pdf','Learn More Label':'Read the NCERT chapter: Seeds and Seeds',Active:true},
    {'Module ID':'LM01','Step Number':17,'Learning Section':'How does a mature plant form?',Teaching:"A mature plant has a fully developed root system, stem, and leaves, and is ready to reproduce by making flowers.",'Step Image URL':'',Question:"What makes a plant 'mature'?",'Option A':'It has fully developed roots, stem, leaves and can reproduce','Option B':'It has turned brown','Option C':'It has stopped growing forever','Option D':'It has lost all its leaves','Correct Option':'A',Explanation:"Correct! Maturity means the plant has everything it needs to support itself and start the next stage — making flowers and seeds.",'Learn More URL':'https://www.ncert.nic.in/textbook/pdf/eeap105.pdf','Learn More Label':'Read the NCERT chapter: Seeds and Seeds',Active:true},
    {'Module ID':'LM01','Step Number':18,'Learning Section':'How does a mature plant form?',Teaching:"Different plants take very different amounts of time to mature — some herbs mature in weeks, while some trees take years.",'Step Image URL':'',Question:"Do all plants take the same time to become mature?",'Option A':'Yes, exactly one month for every plant','Option B':'No, it varies — some take weeks, others take years','Option C':'All plants mature in one day','Option D':'Plants never mature','Correct Option':'B',Explanation:"Yes! A tomato plant might mature in weeks, while an oak tree can take many years.",'Learn More URL':'https://www.ncert.nic.in/textbook/pdf/eeap105.pdf','Learn More Label':'Read the NCERT chapter: Seeds and Seeds',Active:true},
    // Section 7: How are flowers involved?
    {'Module ID':'LM01','Step Number':19,'Learning Section':'How are flowers involved?',Teaching:"Many mature plants grow flowers, which contain the parts needed to produce new seeds.",'Step Image URL':'',Question:"What is the main job of a flower in a plant's life cycle?",'Option A':'To help produce new seeds','Option B':'To make the plant taller','Option C':'To absorb water','Option D':"To protect the roots",'Correct Option':'A',Explanation:"Correct! Flowers contain the reproductive parts of a plant and are essential for making the next generation of seeds.",'Learn More URL':'https://www.ncert.nic.in/textbook/pdf/eeap105.pdf','Learn More Label':'Read the NCERT chapter: Seeds and Seeds',Active:true},
    {'Module ID':'LM01','Step Number':20,'Learning Section':'How are flowers involved?',Teaching:"Pollination happens when pollen moves from one flower to another, often carried by insects like bees, or by the wind.",'Step Image URL':'',Question:"What is pollination?",'Option A':'Pollen moving from one flower to another','Option B':'A seed sprouting','Option C':'A leaf falling off','Option D':'Water entering the soil','Correct Option':'A',Explanation:"Right! Bees, butterflies, and wind are common carriers that move pollen between flowers, allowing seeds to form.",'Learn More URL':'https://www.ncert.nic.in/textbook/pdf/eeap105.pdf','Learn More Label':'Read the NCERT chapter: Seeds and Seeds',Active:true},
    {'Module ID':'LM01','Step Number':21,'Learning Section':'How are flowers involved?',Teaching:"After successful pollination, a flower can develop into a fruit that holds the new seeds safely inside.",'Step Image URL':'',Question:"What can a pollinated flower develop into?",'Option A':'A fruit containing seeds','Option B':'A rock','Option C':'A root','Option D':'Soil','Correct Option':'A',Explanation:"Correct! Many fruits — like apples, tomatoes, and beans — are simply the part of the plant that grew to protect and carry seeds.",'Learn More URL':'https://www.ncert.nic.in/textbook/pdf/eeap105.pdf','Learn More Label':'Read the NCERT chapter: Seeds and Seeds',Active:true},
    // Section 8: How are new seeds produced?
    {'Module ID':'LM01','Step Number':22,'Learning Section':'How are new seeds produced?',Teaching:"Once pollination is complete, part of the flower develops into a fruit, and seeds form safely inside it, ready to start the cycle again.",'Step Image URL':'',Question:"Where do new seeds form after pollination?",'Option A':'Inside the developing fruit','Option B':'In the soil directly','Option C':'On the petals','Option D':'In the air','Correct Option':'A',Explanation:"Yes! The fertilised part of the flower swells into a fruit, and the seeds develop safely inside it.",'Learn More URL':'https://www.ncert.nic.in/textbook/pdf/eeap105.pdf','Learn More Label':'Read the NCERT chapter: Seeds and Seeds',Active:true},
    {'Module ID':'LM01','Step Number':23,'Learning Section':'How are new seeds produced?',Teaching:"When the seeds are ready, they can spread to new places — carried by wind, water, animals, or simply falling to the ground nearby.",'Step Image URL':'',Question:"How can new seeds spread to grow elsewhere?",'Option A':'By wind, water, or animals carrying them','Option B':'They can only stay exactly where they formed','Option C':'They dissolve in rain','Option D':'They turn into rocks','Correct Option':'A',Explanation:"Correct! Seeds have clever ways of travelling — fluffy seeds float on wind, sticky seeds cling to animal fur, and some float on water.",'Learn More URL':'https://www.ncert.nic.in/textbook/pdf/eeap105.pdf','Learn More Label':'Read the NCERT chapter: Seeds and Seeds',Active:true},
    {'Module ID':'LM01','Step Number':24,'Learning Section':'How are new seeds produced?',Teaching:"When a spread seed lands somewhere with the right water, air, and warmth, it can germinate — and the whole plant life cycle begins again.",'Step Image URL':'',Question:"What happens when a new seed lands in a good spot?",'Option A':'It can germinate and start the life cycle again','Option B':'It disappears forever','Option C':'It becomes a flower immediately without growing','Option D':'Nothing happens','Correct Option':'A',Explanation:"That's the beautiful part of the life cycle — every new seed has the potential to grow into a brand-new plant, starting the whole journey over again.",'Learn More URL':'https://www.ncert.nic.in/textbook/pdf/eeap105.pdf','Learn More Label':'Read the NCERT chapter: Seeds and Seeds',Active:true},
    // ── Mathematics: Ch 1 — The Fish Tale ─────────────────────────────────
    {'Module ID':'LM_M01','Step Number':1,'Learning Section':'Large Numbers','Icon (FontAwesome solid)':'fa-fish',Teaching:"Numbers can be very large — like the number of fish sold at a market in a year! We use place value to read and write large numbers. In 1,23,456 the digit 1 is in the lakhs place, 2 is in the ten-thousands place, and so on.",'Step Image URL':'',Question:"What is the place value of the digit 5 in the number 3,58,204?",'Option A':'Ones','Option B':'Hundreds','Option C':'Thousands','Option D':'Ten-thousands','Correct Option':'C',Explanation:"Correct! In 3,58,204 the digit 5 is in the ten-thousands place, and the digit 8 is in the thousands place — wait, let's re-read: 3|5|8|2|0|4. The 5 is ten-thousands and the 8 is thousands. But the question asks about 5 — it is in the ten-thousands place. Actually, counting right-to-left: 4(ones), 0(tens), 2(hundreds), 8(thousands), 5(ten-thousands), 3(lakhs). So 5 is in the ten-thousands place. Great work!",Active:true},
    {'Module ID':'LM_M01','Step Number':2,'Learning Section':'Large Numbers',Teaching:"Estimation means finding an approximate answer by rounding. We round to the nearest 10, 100, or 1000 depending on how precise we need to be.",'Step Image URL':'',Question:"A fisherman caught 4,738 fish in a month. Rounded to the nearest thousand, how many fish did he catch?",'Option A':'4,000','Option B':'5,000','Option C':'4,700','Option D':'4,800','Correct Option':'B',Explanation:"Right! 4,738 is closer to 5,000 than to 4,000 — the digit in the hundreds place (7) is 5 or more, so we round up.",Active:true},
    {'Module ID':'LM_M01','Step Number':3,'Learning Section':'Comparing Large Numbers',Teaching:"To compare large numbers, first compare the number of digits. If they have the same number of digits, compare from the leftmost digit.",'Step Image URL':'',Question:"Which number is greater: 2,04,567 or 2,40,567?",'Option A':'2,04,567','Option B':'2,40,567','Option C':'They are equal','Option D':'Cannot be compared','Correct Option':'B',Explanation:"Correct! Both numbers have 6 digits. Comparing from the left: 2=2, then 0 vs 4 — since 4 > 0, the number 2,40,567 is greater.",Active:true},
    // ── Mathematics: Ch 2 — Shapes and Angles ────────────────────────────
    {'Module ID':'LM_M02','Step Number':1,'Learning Section':'What is an Angle?',Teaching:"An angle is formed when two rays meet at a common point called the vertex. The amount of turn between the two rays is the measure of the angle.",'Step Image URL':'',Question:"What do we call the point where the two rays of an angle meet?",'Option A':'Midpoint','Option B':'Vertex','Option C':'Edge','Option D':'Corner only','Correct Option':'B',Explanation:"Correct! The meeting point of the two rays is called the vertex of the angle.",Active:true},
    {'Module ID':'LM_M02','Step Number':2,'Learning Section':'Types of Angles',Teaching:"A right angle measures exactly 90°. An acute angle is less than 90°. An obtuse angle is more than 90° but less than 180°. A straight angle is exactly 180°.",'Step Image URL':'',Question:"An angle that measures 65° is called a/an _____ angle.",'Option A':'Right','Option B':'Obtuse','Option C':'Acute','Option D':'Straight','Correct Option':'C',Explanation:"Well done! 65° is less than 90°, so it is an acute angle.",Active:true},
    {'Module ID':'LM_M02','Step Number':3,'Learning Section':'Angles Around Us',Teaching:"The hands of a clock form different angles at different times. At 3 o'clock the hands form a right angle (90°). At 6 o'clock they form a straight angle (180°).",'Step Image URL':'',Question:"What angle do the hands of a clock make at 3 o'clock?",'Option A':'45°','Option B':'90°','Option C':'180°','Option D':'270°','Correct Option':'B',Explanation:"Correct! At 3 o'clock the minute hand points to 12 and the hour hand points to 3 — forming a right angle of 90°.",Active:true},
    // ── Mathematics: Ch 3 — Parts and Wholes ─────────────────────────────
    {'Module ID':'LM_M03','Step Number':1,'Learning Section':'Understanding Fractions',Teaching:"A fraction represents a part of a whole. When we divide a whole into equal parts and take some of them, we write it as a fraction. The bottom number (denominator) tells how many equal parts the whole is divided into; the top number (numerator) tells how many parts we have.",'Step Image URL':'',Question:"A chocolate bar is divided into 8 equal pieces. Riya eats 3 pieces. What fraction did she eat?",'Option A':'8/3','Option B':'5/8','Option C':'3/8','Option D':'3/5','Correct Option':'C',Explanation:"Correct! 3 pieces out of 8 equal pieces = 3/8.",Active:true},
    {'Module ID':'LM_M03','Step Number':2,'Learning Section':'Comparing Fractions',Teaching:"When fractions have the same denominator (bottom number), the one with the larger numerator (top number) is bigger.",'Step Image URL':'',Question:"Which fraction is larger: 5/9 or 7/9?",'Option A':'5/9','Option B':'7/9','Option C':'They are equal','Option D':'Cannot be compared','Correct Option':'B',Explanation:"Well done! Both fractions have the same denominator 9, so we compare the numerators: 7 > 5, so 7/9 is larger.",Active:true},
    {'Module ID':'LM_M03','Step Number':3,'Learning Section':'Adding Fractions',Teaching:"To add fractions with the same denominator, simply add the numerators and keep the denominator the same.",'Step Image URL':'',Question:"What is 2/7 + 3/7?",'Option A':'5/14','Option B':'6/7','Option C':'5/7','Option D':'2/14','Correct Option':'C',Explanation:"Correct! Add the numerators: 2 + 3 = 5. Keep the denominator: 7. Answer = 5/7.",Active:true},
    // ── Mathematics: Ch 4 — Factors and Multiples ────────────────────────
    {'Module ID':'LM_M04','Step Number':1,'Learning Section':'Factors',Teaching:"A factor of a number divides it exactly with no remainder. For example, the factors of 12 are 1, 2, 3, 4, 6, and 12 — each one divides 12 exactly.",'Step Image URL':'',Question:"Which of these is NOT a factor of 24?",'Option A':'4','Option B':'6','Option C':'7','Option D':'8','Correct Option':'C',Explanation:"Correct! 24 ÷ 7 = 3 remainder 3, so 7 is not a factor of 24.",Active:true},
    {'Module ID':'LM_M04','Step Number':2,'Learning Section':'Multiples',Teaching:"A multiple of a number is what you get when you multiply it by 1, 2, 3, 4, and so on. The first five multiples of 4 are 4, 8, 12, 16, and 20.",'Step Image URL':'',Question:"Which of these is a multiple of 7?",'Option A':'25','Option B':'36','Option C':'49','Option D':'50','Correct Option':'C',Explanation:"Well done! 7 × 7 = 49, so 49 is a multiple of 7.",Active:true},
    {'Module ID':'LM_M04','Step Number':3,'Learning Section':'Prime Numbers',Teaching:"A prime number has exactly two factors — 1 and itself. For example, 7 is prime because only 1 × 7 = 7. A composite number has more than two factors.",'Step Image URL':'',Question:"Which of the following is a prime number?",'Option A':'9','Option B':'15','Option C':'11','Option D':'21','Correct Option':'C',Explanation:"Correct! 11 has only two factors — 1 and 11 — so it is a prime number. 9 = 3×3, 15 = 3×5, 21 = 3×7, so those are composite.",Active:true},
    // ── Mathematics: Ch 5 — Decimals ─────────────────────────────────────
    {'Module ID':'LM_M05','Step Number':1,'Learning Section':'Understanding Decimals',Teaching:"A decimal point separates the whole number part from the fractional part. In 3.7, the 3 is the whole number and 7 is 7 tenths — meaning seven out of ten equal parts.",'Step Image URL':'',Question:"In the decimal number 5.3, what does the digit 3 represent?",'Option A':'3 ones','Option B':'3 tenths','Option C':'3 hundredths','Option D':'3 tens','Correct Option':'B',Explanation:"Correct! The digit after the decimal point is in the tenths place. So the 3 in 5.3 represents 3 tenths.",Active:true},
    {'Module ID':'LM_M05','Step Number':2,'Learning Section':'Comparing Decimals',Teaching:"To compare decimals, first compare the whole number parts. If they are equal, compare the tenths digits, then the hundredths digits, and so on.",'Step Image URL':'',Question:"Which decimal is greater: 4.7 or 4.3?",'Option A':'4.3','Option B':'4.7','Option C':'They are equal','Option D':'Cannot be compared','Correct Option':'B',Explanation:"Well done! The whole number parts are both 4, so compare the tenths: 7 > 3, so 4.7 > 4.3.",Active:true},
    {'Module ID':'LM_M05','Step Number':3,'Learning Section':'Adding Decimals',Teaching:"To add decimals, align the decimal points and then add just like whole numbers. The decimal point in the answer goes directly below the decimal points in the numbers you added.",'Step Image URL':'',Question:"What is 2.5 + 1.3?",'Option A':'3.8','Option B':'38','Option C':'3.08','Option D':'4.8','Correct Option':'A',Explanation:"Correct! 2.5 + 1.3: add the tenths (5+3=8) and the ones (2+1=3). Answer = 3.8.",Active:true},
    // ── Mathematics: Ch 6 — Area and Perimeter ───────────────────────────
    {'Module ID':'LM_M06','Step Number':1,'Learning Section':'Perimeter',Teaching:"Perimeter is the total distance around the outside of a shape. For a rectangle, Perimeter = 2 × (Length + Width). For a square, Perimeter = 4 × Side.",'Step Image URL':'',Question:"What is the perimeter of a rectangle that is 8 cm long and 5 cm wide?",'Option A':'40 cm','Option B':'26 cm','Option C':'13 cm','Option D':'16 cm','Correct Option':'B',Explanation:"Correct! Perimeter = 2 × (8 + 5) = 2 × 13 = 26 cm.",Active:true},
    {'Module ID':'LM_M06','Step Number':2,'Learning Section':'Area',Teaching:"Area is the amount of surface a shape covers. For a rectangle, Area = Length × Width. For a square, Area = Side × Side.",'Step Image URL':'',Question:"What is the area of a rectangle that is 9 cm long and 4 cm wide?",'Option A':'26 sq cm','Option B':'13 sq cm','Option C':'36 sq cm','Option D':'32 sq cm','Correct Option':'C',Explanation:"Well done! Area = 9 × 4 = 36 square centimetres.",Active:true},
    {'Module ID':'LM_M06','Step Number':3,'Learning Section':'Area vs Perimeter',Teaching:"Perimeter and area are different measurements. Perimeter measures the boundary (distance around), while area measures the surface covered (space inside).",'Step Image URL':'',Question:"A square garden has a side of 7 m. What is its area?",'Option A':'28 sq m','Option B':'14 sq m','Option C':'49 sq m','Option D':'21 sq m','Correct Option':'C',Explanation:"Correct! Area of a square = Side × Side = 7 × 7 = 49 square metres.",Active:true},
    // ── Mathematics: Ch 7 — Charts and Graphs ────────────────────────────
    {'Module ID':'LM_M07','Step Number':1,'Learning Section':'Tally Marks',Teaching:"Tally marks are a quick way to count. We draw four vertical lines and then a diagonal fifth line across them to make a group of 5. This makes it easy to count large amounts quickly.",'Step Image URL':'',Question:"How many does a tally group of four vertical lines and one diagonal line across them represent?",'Option A':'4','Option B':'5','Option C':'6','Option D':'10','Correct Option':'B',Explanation:"Correct! A group of 4 lines crossed by 1 diagonal = 5. This is the standard tally mark for 5.",Active:true},
    {'Module ID':'LM_M07','Step Number':2,'Learning Section':'Pictographs',Teaching:"A pictograph uses pictures or symbols to show data. Each symbol represents a fixed number of things. A key tells us what each symbol stands for.",'Step Image URL':'',Question:"In a pictograph, one apple symbol = 4 apples. If a row shows 3 apple symbols, how many apples does that represent?",'Option A':'3','Option B':'7','Option C':'12','Option D':'34','Correct Option':'C',Explanation:"Well done! 3 symbols × 4 apples each = 12 apples.",Active:true},
    {'Module ID':'LM_M07','Step Number':3,'Learning Section':'Bar Graphs',Teaching:"A bar graph uses rectangular bars to show data. The height (or length) of each bar represents the value for that category. We read the value by looking at where the bar ends on the scale.",'Step Image URL':'',Question:"In a bar graph, the bar for 'Monday' reaches the value 15. The bar for 'Tuesday' reaches 25. On which day were more items recorded?",'Option A':'Monday','Option B':'Tuesday','Option C':'Both the same','Option D':'Cannot tell','Correct Option':'B',Explanation:"Correct! The taller bar (25) belongs to Tuesday, so more items were recorded on Tuesday.",Active:true},
    // ── Mathematics: Ch 8 — Multiplication and Division ──────────────────
    {'Module ID':'LM_M08','Step Number':1,'Learning Section':'Multiplication as Repeated Addition',Teaching:"Multiplication is a quick way of doing repeated addition. Instead of adding the same number many times, we multiply. For example, 4+4+4 is the same as 3×4=12.",'Step Image URL':'',Question:"There are 6 boxes. Each box has 8 pencils. How many pencils are there altogether?",'Option A':'14','Option B':'36','Option C':'48','Option D':'56','Correct Option':'C',Explanation:"Correct! 6 boxes × 8 pencils each = 6 × 8 = 48 pencils.",Active:true},
    {'Module ID':'LM_M08','Step Number':2,'Learning Section':'Division as Equal Sharing',Teaching:"Division means splitting a number into equal groups. If you have 36 sweets and want to share them equally among 4 friends, each friend gets 36 ÷ 4 = 9 sweets.",'Step Image URL':'',Question:"72 books are arranged equally on 9 shelves. How many books are on each shelf?",'Option A':'7','Option B':'8','Option C':'9','Option D':'63','Correct Option':'B',Explanation:"Well done! 72 ÷ 9 = 8 books on each shelf.",Active:true},
    {'Module ID':'LM_M08','Step Number':3,'Learning Section':'Relationship Between Multiplication and Division',Teaching:"Multiplication and division are inverse operations — they undo each other. If 7 × 8 = 56, then 56 ÷ 7 = 8 and 56 ÷ 8 = 7. These are called a fact family.",'Step Image URL':'',Question:"If 9 × 6 = 54, which of the following is correct?",'Option A':'54 ÷ 9 = 7','Option B':'54 ÷ 6 = 9','Option C':'54 ÷ 6 = 7','Option D':'54 ÷ 9 = 5','Correct Option':'B',Explanation:"Correct! Since 9 × 6 = 54, dividing 54 by 6 gives 9. They are a multiplication-division fact family.",Active:true},
    // ── Mathematics: Ch 9 — Measurement ──────────────────────────────────
    {'Module ID':'LM_M09','Step Number':1,'Learning Section':'Units of Length',Teaching:"We measure length using units like millimetres (mm), centimetres (cm), metres (m), and kilometres (km). The conversions are: 10 mm = 1 cm, 100 cm = 1 m, and 1000 m = 1 km.",'Step Image URL':'',Question:"How many centimetres are in 3 metres?",'Option A':'30 cm','Option B':'300 cm','Option C':'3000 cm','Option D':'3 cm','Correct Option':'B',Explanation:"Correct! 1 metre = 100 centimetres, so 3 metres = 3 × 100 = 300 centimetres.",Active:true},
    {'Module ID':'LM_M09','Step Number':2,'Learning Section':'Units of Weight',Teaching:"We measure weight using milligrams (mg), grams (g), and kilograms (kg). The conversions are: 1000 mg = 1 g and 1000 g = 1 kg.",'Step Image URL':'',Question:"A bag of rice weighs 2 kg 500 g. What is its total weight in grams?",'Option A':'2500 g','Option B':'250 g','Option C':'25000 g','Option D':'2050 g','Correct Option':'A',Explanation:"Well done! 2 kg = 2000 g. 2000 g + 500 g = 2500 g.",Active:true},
    {'Module ID':'LM_M09','Step Number':3,'Learning Section':'Units of Volume',Teaching:"We measure the volume of liquids using millilitres (ml) and litres (l). The conversion is: 1000 ml = 1 litre.",'Step Image URL':'',Question:"A bottle holds 2 litres of water. How many millilitres is that?",'Option A':'200 ml','Option B':'20 ml','Option C':'2000 ml','Option D':'20000 ml','Correct Option':'C',Explanation:"Correct! 1 litre = 1000 millilitres, so 2 litres = 2 × 1000 = 2000 ml.",Active:true},
    // Solar System
    {'Module ID':'LM02','Step Number':1,Teaching:"The Sun is a giant, glowing star at the center of our Solar System.",'Step Image URL':'',Question:"What is at the center of the Solar System?",'Option A':'Earth','Option B':'The Moon','Option C':'The Sun','Option D':'Mars','Correct Option':'C',Explanation:"Exactly! The Sun sits at the center, and everything else travels around it.",Active:true},
    {'Module ID':'LM02','Step Number':2,Teaching:"Planets travel around the Sun along a path called an orbit.",'Step Image URL':'',Question:"What do we call the path a planet takes around the Sun?",'Option A':'An orbit','Option B':'A tunnel','Option C':'A bridge','Option D':'A spiral','Correct Option':'A',Explanation:"Right! Every planet follows its own orbit around the Sun.",Active:true},
    {'Module ID':'LM02','Step Number':3,Teaching:"Earth is the third planet from the Sun — just the right distance for liquid water.",'Step Image URL':'',Question:"Which planet is third in line from the Sun?",'Option A':'Venus','Option B':'Earth','Option C':'Jupiter','Option D':'Mercury','Correct Option':'B',Explanation:"Correct! Earth is the third planet — close enough to the Sun to support life.",Active:true},
    // Water Cycle
    {'Module ID':'LM03','Step Number':1,Teaching:"The Sun heats water in oceans and lakes, turning it into invisible vapor — this is evaporation.",'Step Image URL':'',Question:"What happens when the Sun heats water in a lake?",'Option A':'It freezes','Option B':'It evaporates','Option C':'It disappears forever','Option D':'It turns into rock','Correct Option':'B',Explanation:"Yes! Heat from the Sun turns liquid water into vapor — that's evaporation.",Active:true},
    {'Module ID':'LM03','Step Number':2,Teaching:"Water vapor rises and cools high in the sky, clumping together to form clouds — this is condensation.",'Step Image URL':'',Question:"What forms when water vapor cools high in the sky?",'Option A':'Clouds','Option B':'Sand','Option C':'Ice cubes','Option D':'Rainbows','Correct Option':'A',Explanation:"Correct! Cooled water vapor clumps together to form clouds.",Active:true},
    {'Module ID':'LM03','Step Number':3,Teaching:"When clouds get too heavy with water, it falls back to Earth as rain — this is precipitation.",'Step Image URL':'',Question:"What do we call water falling from clouds as rain?",'Option A':'Evaporation','Option B':'Condensation','Option C':'Precipitation','Option D':'Pollution','Correct Option':'C',Explanation:"That's it! Precipitation is water falling back to Earth as rain, snow, or hail.",Active:true},
    // Human Body
    {'Module ID':'LM04','Step Number':1,Teaching:"Your bones form a frame called the skeleton, which supports and protects your body.",'Step Image URL':'',Question:"What do we call the frame of bones that supports your body?",'Option A':'Skeleton','Option B':'Muscle','Option C':'Skin','Option D':'Brain','Correct Option':'A',Explanation:"Right! Your skeleton holds your body up and protects organs like your heart.",Active:true},
    {'Module ID':'LM04','Step Number':2,Teaching:"Your heart pumps blood to every part of your body, carrying oxygen and nutrients.",'Step Image URL':'',Question:"What is the main job of the heart?",'Option A':'To help you think','Option B':'To pump blood','Option C':'To digest food','Option D':'To help you hear','Correct Option':'B',Explanation:"Correct! The heart pumps blood that carries oxygen all over your body.",Active:true},
    {'Module ID':'LM04','Step Number':3,Teaching:"Your lungs take in air so your blood can collect the oxygen inside it.",'Step Image URL':'',Question:"Which body part helps you breathe in air?",'Option A':'Lungs','Option B':'Liver','Option C':'Stomach','Option D':'Ears','Correct Option':'A',Explanation:"Yes! Your lungs bring oxygen from the air you breathe into your blood.",Active:true},
    // Fractions — 7 Learning Sections × 3 progressive steps = 21 questions.
    // Section 1: What is a fraction?
    {'Module ID':'LM05','Step Number':1,'Learning Section':'What is a fraction?',Teaching:"A fraction is a way to show a part of a whole — like one slice of a pizza that's been cut into equal pieces.",'Step Image URL':'',Question:"What does a fraction represent?",'Option A':'A whole number','Option B':'A part of a whole','Option C':'A type of shape','Option D':'A unit of weight','Correct Option':'B',Explanation:"Correct! A fraction always describes part of something that has been divided into equal pieces.",'Learn More URL':'https://ncert.nic.in/textbook/pdf/fegp107.pdf','Learn More Label':'Read the NCERT Maths chapter: Fractions',Active:true},
    {'Module ID':'LM05','Step Number':2,'Learning Section':'What is a fraction?',Teaching:"For a fraction to make sense, the whole must be divided into equal-sized parts — not parts of different sizes.",'Step Image URL':'',Question:"Why must the parts of a whole be equal when we talk about fractions?",'Option A':'So each part represents the same amount','Option B':'Because equal parts look nicer','Option C':'Equal parts are always bigger','Option D':"It doesn't matter if parts are equal",'Correct Option':'A',Explanation:"Right! If the parts weren't equal, the fraction wouldn't describe a fair, consistent amount.",'Learn More URL':'https://ncert.nic.in/textbook/pdf/fegp107.pdf','Learn More Label':'Read the NCERT Maths chapter: Fractions',Active:true},
    {'Module ID':'LM05','Step Number':3,'Learning Section':'What is a fraction?',Teaching:"We write a fraction using two numbers separated by a line, like 3/4 — this means 3 parts out of 4 equal parts.",'Step Image URL':'',Question:"How is a fraction written?",'Option A':'Two numbers separated by a line, like 3/4','Option B':'A single number like 34','Option C':'A percentage sign','Option D':'A decimal point only','Correct Option':'A',Explanation:"Yes! The line in 3/4 separates the two numbers that together describe the fraction.",'Learn More URL':'https://ncert.nic.in/textbook/pdf/fegp107.pdf','Learn More Label':'Read the NCERT Maths chapter: Fractions',Active:true},
    // Section 2: Numerator and denominator
    {'Module ID':'LM05','Step Number':4,'Learning Section':'Numerator and denominator',Teaching:"The bottom number of a fraction is called the denominator — it tells us how many equal parts the whole has been divided into.",'Step Image URL':'',Question:"What is the denominator?",'Option A':'The bottom number, showing total equal parts','Option B':'The top number','Option C':'The line in the middle','Option D':'The whole number itself','Correct Option':'A',Explanation:"Correct! The denominator sits on the bottom and shows the total number of equal parts.",'Learn More URL':'https://ncert.nic.in/textbook/pdf/fegp107.pdf','Learn More Label':'Read the NCERT Maths chapter: Fractions',Active:true},
    {'Module ID':'LM05','Step Number':5,'Learning Section':'Numerator and denominator',Teaching:"The top number of a fraction is called the numerator — it tells us how many of those equal parts we're talking about.",'Step Image URL':'',Question:"What is the numerator?",'Option A':'The bottom number','Option B':'The top number, showing how many parts we have','Option C':'The whole','Option D':'A symbol','Correct Option':'B',Explanation:"Right! The numerator sits on top and counts how many of the equal parts we mean.",'Learn More URL':'https://ncert.nic.in/textbook/pdf/fegp107.pdf','Learn More Label':'Read the NCERT Maths chapter: Fractions',Active:true},
    {'Module ID':'LM05','Step Number':6,'Learning Section':'Numerator and denominator',Teaching:"In the fraction 5/8, the numerator is 5 and the denominator is 8 — meaning 5 out of 8 equal parts.",'Step Image URL':'',Question:"In the fraction 5/8, what does the 8 represent?",'Option A':'The numerator','Option B':'The denominator, total equal parts','Option C':'The answer','Option D':'A remainder','Correct Option':'B',Explanation:"Correct! The 8 is the denominator — the total number of equal parts the whole was divided into.",'Learn More URL':'https://ncert.nic.in/textbook/pdf/fegp107.pdf','Learn More Label':'Read the NCERT Maths chapter: Fractions',Active:true},
    // Section 3: Equivalent fractions
    {'Module ID':'LM05','Step Number':7,'Learning Section':'Equivalent fractions',Teaching:"Equivalent fractions are different fractions that represent the same amount, like 1/2 and 2/4.",'Step Image URL':'',Question:"What are equivalent fractions?",'Option A':'Fractions that look the same but mean different things','Option B':'Different fractions that represent the same amount','Option C':'Fractions that can never be compared','Option D':'Only fractions with the same denominator','Correct Option':'B',Explanation:"Right! 1/2 and 2/4 look different but represent exactly the same amount of a whole.",'Learn More URL':'https://ncert.nic.in/textbook/pdf/fegp107.pdf','Learn More Label':'Read the NCERT Maths chapter: Fractions',Active:true},
    {'Module ID':'LM05','Step Number':8,'Learning Section':'Equivalent fractions',Teaching:"You can find an equivalent fraction by multiplying or dividing both the numerator and denominator by the same number.",'Step Image URL':'',Question:"How can you find a fraction equivalent to 2/3?",'Option A':'Multiply only the numerator','Option B':'Multiply both the numerator and denominator by the same number','Option C':'Add 1 to the denominator only','Option D':'Subtract from the numerator','Correct Option':'B',Explanation:"Exactly! Multiplying 2/3 by 2/2 gives 4/6, which is equivalent.",'Learn More URL':'https://ncert.nic.in/textbook/pdf/fegp107.pdf','Learn More Label':'Read the NCERT Maths chapter: Fractions',Active:true},
    {'Module ID':'LM05','Step Number':9,'Learning Section':'Equivalent fractions',Teaching:"Equivalent fractions are useful when we want to compare or add fractions that don't have the same denominator.",'Step Image URL':'',Question:"Why are equivalent fractions useful?",'Option A':'They help us compare or add fractions with different denominators','Option B':'They make fractions disappear','Option C':"They're only used in art class",'Option D':'They have no real use','Correct Option':'A',Explanation:"Yes! Rewriting fractions as equivalents with the same denominator makes comparing and adding much easier.",'Learn More URL':'https://ncert.nic.in/textbook/pdf/fegp107.pdf','Learn More Label':'Read the NCERT Maths chapter: Fractions',Active:true},
    // Section 4: Comparing fractions
    {'Module ID':'LM05','Step Number':10,'Learning Section':'Comparing fractions',Teaching:"When two fractions have the same denominator, the one with the bigger numerator is the larger fraction.",'Step Image URL':'',Question:"Which is bigger, 3/7 or 5/7?",'Option A':'3/7','Option B':'5/7','Option C':'They are equal','Option D':'Cannot be compared','Correct Option':'B',Explanation:"Right! Since both share the denominator 7, the fraction with the larger numerator, 5/7, is bigger.",'Learn More URL':'https://ncert.nic.in/textbook/pdf/fegp107.pdf','Learn More Label':'Read the NCERT Maths chapter: Fractions',Active:true},
    {'Module ID':'LM05','Step Number':11,'Learning Section':'Comparing fractions',Teaching:"When fractions have different denominators, it helps to rewrite them with a common denominator before comparing.",'Step Image URL':'',Question:"What helps when comparing fractions with different denominators?",'Option A':'Ignoring the denominators','Option B':'Rewriting them with a common denominator','Option C':'Always picking the smaller numerator','Option D':'Adding the numerators together','Correct Option':'B',Explanation:"Yes! A common denominator lets you compare the numerators directly and fairly.",'Learn More URL':'https://ncert.nic.in/textbook/pdf/fegp107.pdf','Learn More Label':'Read the NCERT Maths chapter: Fractions',Active:true},
    {'Module ID':'LM05','Step Number':12,'Learning Section':'Comparing fractions',Teaching:"A fraction close to 1, like 7/8, represents almost a whole, while a fraction close to 0, like 1/8, represents a very small part.",'Step Image URL':'',Question:"Which fraction represents almost a whole?",'Option A':'1/8','Option B':'7/8','Option C':'0/8','Option D':'1/2','Correct Option':'B',Explanation:"Correct! 7/8 means 7 out of 8 parts — very close to the complete whole.",'Learn More URL':'https://ncert.nic.in/textbook/pdf/fegp107.pdf','Learn More Label':'Read the NCERT Maths chapter: Fractions',Active:true},
    // Section 5: Adding fractions with the same denominator
    {'Module ID':'LM05','Step Number':13,'Learning Section':'Adding fractions with the same denominator',Teaching:"To add fractions with the same denominator, simply add the numerators and keep the denominator the same.",'Step Image URL':'',Question:"How do you add 1/5 and 2/5?",'Option A':'Add the numerators: 3/5','Option B':'Add the denominators: 1/10','Option C':'Multiply them: 2/25','Option D':'Subtract them: 1/5','Correct Option':'A',Explanation:"Right! Since the denominators match, you just add 1 + 2 to get 3/5.",'Learn More URL':'https://ncert.nic.in/textbook/pdf/fegp107.pdf','Learn More Label':'Read the NCERT Maths chapter: Fractions',Active:true},
    {'Module ID':'LM05','Step Number':14,'Learning Section':'Adding fractions with the same denominator',Teaching:"If adding the numerators gives a number equal to or bigger than the denominator, the answer becomes a whole or a mixed number.",'Step Image URL':'',Question:"What is 3/4 + 2/4?",'Option A':'5/4, which is 1 and 1/4','Option B':'5/8','Option C':'1/4','Option D':'6/4 simplified to 6','Correct Option':'A',Explanation:"Yes! 3 + 2 = 5, so 5/4 — more than a whole — equals 1 whole and 1/4 left over.",'Learn More URL':'https://ncert.nic.in/textbook/pdf/fegp107.pdf','Learn More Label':'Read the NCERT Maths chapter: Fractions',Active:true},
    {'Module ID':'LM05','Step Number':15,'Learning Section':'Adding fractions with the same denominator',Teaching:"Adding fractions with the same denominator works the same way no matter how many fractions you're adding together.",'Step Image URL':'',Question:"What is 1/6 + 2/6 + 1/6?",'Option A':'4/6','Option B':'4/18','Option C':'3/6','Option D':'1/6','Correct Option':'A',Explanation:"Correct! Add all the numerators — 1 + 2 + 1 = 4 — to get 4/6.",'Learn More URL':'https://ncert.nic.in/textbook/pdf/fegp107.pdf','Learn More Label':'Read the NCERT Maths chapter: Fractions',Active:true},
    // Section 6: Subtracting fractions with the same denominator
    {'Module ID':'LM05','Step Number':16,'Learning Section':'Subtracting fractions with the same denominator',Teaching:"To subtract fractions with the same denominator, subtract the numerators and keep the denominator the same.",'Step Image URL':'',Question:"What is 4/9 minus 1/9?",'Option A':'3/9','Option B':'5/9','Option C':'4/0','Option D':'3/18','Correct Option':'A',Explanation:"Right! Subtract the numerators, 4 − 1 = 3, keeping the denominator 9.",'Learn More URL':'https://ncert.nic.in/textbook/pdf/fegp107.pdf','Learn More Label':'Read the NCERT Maths chapter: Fractions',Active:true},
    {'Module ID':'LM05','Step Number':17,'Learning Section':'Subtracting fractions with the same denominator',Teaching:"Just like with addition, the denominators must already match before you can subtract two fractions this way.",'Step Image URL':'',Question:"Can you directly subtract 1/3 from 1/2 the same way?",'Option A':'No — the denominators are different, so they must be made equal first','Option B':'Yes, always subtract numerators directly','Option C':'No, fractions can never be subtracted','Option D':'Yes, just subtract the denominators','Correct Option':'A',Explanation:"Correct! With different denominators, you first need a common denominator before subtracting.",'Learn More URL':'https://ncert.nic.in/textbook/pdf/fegp107.pdf','Learn More Label':'Read the NCERT Maths chapter: Fractions',Active:true},
    {'Module ID':'LM05','Step Number':18,'Learning Section':'Subtracting fractions with the same denominator',Teaching:"Subtracting a fraction from a whole, like 1 minus 3/8, means thinking of the whole as 8/8 first.",'Step Image URL':'',Question:"What is 1 minus 3/8?",'Option A':'5/8','Option B':'3/8','Option C':'1/8','Option D':'4/8','Correct Option':'A',Explanation:"Yes! Thinking of 1 as 8/8, subtracting 3/8 leaves 5/8.",'Learn More URL':'https://ncert.nic.in/textbook/pdf/fegp107.pdf','Learn More Label':'Read the NCERT Maths chapter: Fractions',Active:true},
    // Section 7: Fractions in everyday life
    {'Module ID':'LM05','Step Number':19,'Learning Section':'Fractions in everyday life',Teaching:"Fractions show up everywhere in daily life — sharing food, reading recipe measurements, or telling time, like a half hour.",'Step Image URL':'',Question:"Which of these is an everyday example of a fraction?",'Option A':'Sharing half a chocolate bar with a friend','Option B':'Counting whole apples only','Option C':'Naming the colour of a fruit','Option D':'Measuring temperature in degrees','Correct Option':'A',Explanation:"Right! Splitting something into equal shares, like half a chocolate bar, is a fraction in action.",'Learn More URL':'https://ncert.nic.in/textbook/pdf/fegp107.pdf','Learn More Label':'Read the NCERT Maths chapter: Fractions',Active:true},
    {'Module ID':'LM05','Step Number':20,'Learning Section':'Fractions in everyday life',Teaching:"A clock uses fractions too — a quarter past the hour means 1/4 of the way around the clock face.",'Step Image URL':'',Question:"What does 'a quarter past' mean on a clock?",'Option A':'1/4 of the way around the clock face','Option B':'The whole hour has passed','Option C':'Half the day is over','Option D':'3/4 of the hour remains','Correct Option':'A',Explanation:"Correct! A quarter past means 15 minutes, which is 1/4 of a 60-minute hour.",'Learn More URL':'https://ncert.nic.in/textbook/pdf/fegp107.pdf','Learn More Label':'Read the NCERT Maths chapter: Fractions',Active:true},
    {'Module ID':'LM05','Step Number':21,'Learning Section':'Fractions in everyday life',Teaching:"Recipes often use fractions for ingredients, like 3/4 cup of flour, helping cooks measure exactly the right amount.",'Step Image URL':'',Question:"Why do recipes often use fractions?",'Option A':'To measure ingredients precisely','Option B':'To make cooking harder','Option C':'Fractions are never used in recipes','Option D':'To avoid using cups','Correct Option':'A',Explanation:"Yes! Fractions let a recipe describe a precise amount, like 3/4 cup, instead of guessing.",'Learn More URL':'https://ncert.nic.in/textbook/pdf/fegp107.pdf','Learn More Label':'Read the NCERT Maths chapter: Fractions',Active:true},
    // ── English Grammar: Topic 1 — Nouns (50 questions, 5 sections) ───────
    {'Module ID':'LM06','Step Number':1,'Learning Section':'Common Nouns',Teaching:"Common nouns name people, places, animals, or things in a general way — not one special, particular one. School, boy, and dog are all common nouns.",'Step Image URL':'',Question:"Which word is a common noun?",'Option A':"Quickly",'Option B':"Pretty",'Option C':"School",'Option D':"Run",'Correct Option':'C',Explanation:"Correct! School names a place in general — that's exactly what a common noun does.",Active:true},
    {'Module ID':'LM06','Step Number':2,'Learning Section':'Common Nouns',Teaching:"Common nouns can name everyday objects too, like a ball, a book, or a pencil.",'Step Image URL':'',Question:"Which word is a common noun?",'Option A':"Ball",'Option B':"Played",'Option C':"Loudly",'Option D':"Tall",'Correct Option':'A',Explanation:"Right! Ball names a thing — a common noun for any ball, not one special ball.",Active:true},
    {'Module ID':'LM06','Step Number':3,'Learning Section':'Common Nouns',Teaching:"When you spot a common noun inside a sentence, look for the word that names a person, place, or thing — even with lots of other words around it.",'Step Image URL':'',Question:"Find the common noun: \"The boy kicked the ball happily.\"",'Option A':"kicked",'Option B':"happily",'Option C':"ball",'Option D':"quickly",'Correct Option':'C',Explanation:"Correct! Ball is the thing being named in the sentence — the common noun.",Active:true},
    {'Module ID':'LM06','Step Number':4,'Learning Section':'Common Nouns',Teaching:"Things you can see and touch around your home — like a chair, a table, or a lamp — are common nouns too.",'Step Image URL':'',Question:"Which word is a common noun?",'Option A':"Quickly",'Option B':"Soft",'Option C':"Sing",'Option D':"Chair",'Correct Option':'D',Explanation:"Yes! Chair names a thing — a common noun.",Active:true},
    {'Module ID':'LM06','Step Number':5,'Learning Section':'Common Nouns',Teaching:"Jobs people do, like doctor, teacher, or farmer, are common nouns because they describe any person who does that job, not one specific person.",'Step Image URL':'',Question:"Which word is a common noun?",'Option A':"Doctor",'Option B':"Quickly",'Option C':"Happy",'Option D':"Jump",'Correct Option':'A',Explanation:"Right! Doctor names a job that many different people can do — it's a common noun, not the name of one specific person.",Active:true},
    {'Module ID':'LM06','Step Number':6,'Learning Section':'Common Nouns',Teaching:"You can often complete a sentence with a common noun by thinking of a general thing that fits — like an animal, object, or place.",'Step Image URL':'',Question:"Complete with a common noun: \"I saw a ____ near the pond.\"",'Option A':"Quickly",'Option B':"Duck",'Option C':"Blue",'Option D':"Swimming",'Correct Option':'B',Explanation:"Correct! Duck names an animal — a common noun that fits perfectly near a pond.",Active:true},
    {'Module ID':'LM06','Step Number':7,'Learning Section':'Common Nouns',Teaching:"Even in a sentence full of action words, there's often a common noun hiding — usually the person, animal, or thing doing the action.",'Step Image URL':'',Question:"Which sentence has a common noun?",'Option A':"She sang sweetly.",'Option B':"He ran fast.",'Option C':"The bird flew away.",'Option D':"They laughed loudly.",'Correct Option':'C',Explanation:"Right! Bird is a common noun — it names an animal in general.",Active:true},
    {'Module ID':'LM06','Step Number':8,'Learning Section':'Common Nouns',Teaching:"Some words name a place in general — like market, village, or river — while others name one special place. General place names are common nouns.",'Step Image URL':'',Question:"Which word names a place in general (a common noun)?",'Option A':"Delhi",'Option B':"Monday",'Option C':"Quickly",'Option D':"Market",'Correct Option':'D',Explanation:"Yes! Market is a general place name, so it's a common noun — unlike Delhi, which names one particular city.",Active:true},
    {'Module ID':'LM06','Step Number':9,'Learning Section':'Common Nouns',Teaching:"Everyday school supplies — like a pencil, eraser, or bag — are common nouns because they name things in general.",'Step Image URL':'',Question:"Which of these is a common noun?",'Option A':"Pencil",'Option B':"Carefully",'Option C':"Bright",'Option D':"Jumped",'Correct Option':'A',Explanation:"Correct! Pencil names a thing — a common noun.",Active:true},
    {'Module ID':'LM06','Step Number':10,'Learning Section':'Common Nouns',Teaching:"A word like teacher names any person who does that job — it's a common noun. A word like Raju names one particular person — that's a proper noun, coming up next.",'Step Image URL':'',Question:"Which word names any person doing a job (a common noun)?",'Option A':"Raju",'Option B':"Teacher",'Option C':"Monday",'Option D':"Delhi",'Correct Option':'B',Explanation:"Right! Teacher names any person doing that job — a common noun.",Active:true},
    {'Module ID':'LM06','Step Number':11,'Learning Section':'Proper Nouns',Teaching:"Proper nouns name one specific person, place, or thing — and they always start with a capital letter. Ganga is the name of one particular river.",'Step Image URL':'',Question:"Which word is a proper noun?",'Option A':"mountain",'Option B':"river",'Option C':"city",'Option D':"Ganga",'Correct Option':'D',Explanation:"Correct! Ganga names one particular river — a proper noun.",Active:true},
    {'Module ID':'LM06','Step Number':12,'Learning Section':'Proper Nouns',Teaching:"What makes a word a proper noun isn't just its capital letter — it's that the word names one particular, special thing instead of a general category.",'Step Image URL':'',Question:"Why is \"Delhi\" a proper noun?",'Option A':"It names one particular city.",'Option B':"It is a place.",'Option C':"It starts with a capital by chance.",'Option D':"It is a long word.",'Correct Option':'A',Explanation:"Right! Delhi is a proper noun because it names one particular city, not cities in general.",Active:true},
    {'Module ID':'LM06','Step Number':13,'Learning Section':'Proper Nouns',Teaching:"Every common noun can be matched with an example that's a proper noun — like boy (common) and Ramesh (proper), one specific boy.",'Step Image URL':'',Question:"Which pair matches a common noun with its proper noun?",'Option A':"school – Monday",'Option B':"river – fast",'Option C':"boy – Ramesh",'Option D':"dog – bark",'Correct Option':'C',Explanation:"Yes! Ramesh is the specific name for a boy — pairing a common noun with its proper noun.",Active:true},
    {'Module ID':'LM06','Step Number':14,'Learning Section':'Proper Nouns',Teaching:"Festivals like Diwali, Holi, and Eid are proper nouns because each one names one particular, special celebration.",'Step Image URL':'',Question:"Choose the proper noun: \"We celebrate Diwali every year.\"",'Option A':"celebrate",'Option B':"every",'Option C':"year",'Option D':"Diwali",'Correct Option':'D',Explanation:"Correct! Diwali names a specific festival — a proper noun.",Active:true},
    {'Module ID':'LM06','Step Number':15,'Learning Section':'Proper Nouns',Teaching:"Country names, like India, are always proper nouns because each one names a single, specific country.",'Step Image URL':'',Question:"Which word must start with a capital letter as a proper noun?",'Option A':"teacher",'Option B':"festival",'Option C':"India",'Option D':"country",'Correct Option':'C',Explanation:"Right! India is a specific country, so it's a proper noun and must be capitalised.",Active:true},
    {'Module ID':'LM06','Step Number':16,'Learning Section':'Proper Nouns',Teaching:"Because proper nouns name something specific, they must always start with a capital letter — even in the middle of a sentence.",'Step Image URL':'',Question:"Which sentence uses a proper noun correctly?",'Option A':"We live in mumbai.",'Option B':"We live in a city.",'Option C':"We live in a Mumbai.",'Option D':"We live in Mumbai.",'Correct Option':'D',Explanation:"Yes! Mumbai is a specific city, so it needs a capital letter — that's the only option that gets it right.",Active:true},
    {'Module ID':'LM06','Step Number':17,'Learning Section':'Proper Nouns',Teaching:"When a sentence mentions someone's name — like Meena, Ravi, or Asha — that name is a proper noun, even surrounded by ordinary words.",'Step Image URL':'',Question:"Spot the proper noun: \"My friend Meena loves to read story books.\"",'Option A':"Meena",'Option B':"friend",'Option C':"loves",'Option D':"books",'Correct Option':'A',Explanation:"Correct! Meena is the friend's specific name — a proper noun.",Active:true},
    {'Module ID':'LM06','Step Number':18,'Learning Section':'Proper Nouns',Teaching:"Days of the week, like Monday, are proper nouns because each one names one specific day — but words for general time periods, like holiday, are common nouns.",'Step Image URL':'',Question:"Which of these is NOT a proper noun?",'Option A':"Monday",'Option B':"holiday",'Option C':"December",'Option D':"Asia",'Correct Option':'B',Explanation:"Right! Holiday is general — it doesn't name one specific day — so it's the one that is NOT a proper noun here.",Active:true},
    {'Module ID':'LM06','Step Number':19,'Learning Section':'Proper Nouns',Teaching:"A single sentence can contain more than one proper noun — count carefully for the names of specific people and places.",'Step Image URL':'',Question:"\"Ravi visited the Taj Mahal last summer.\" How many proper nouns?",'Option A':"1",'Option B':"2",'Option C':"3",'Option D':"4",'Correct Option':'B',Explanation:"Correct! Ravi and Taj Mahal are both proper nouns — that's two.",Active:true},
    {'Module ID':'LM06','Step Number':20,'Learning Section':'Proper Nouns',Teaching:"The capital letter on a proper noun is a signal to the reader: this word names something specific and special, not just any example of its kind.",'Step Image URL':'',Question:"Why do proper nouns always start with a capital letter?",'Option A':"They are long words.",'Option B':"They are hard to spell.",'Option C':"They name something specific and special.",'Option D':"They start sentences.",'Correct Option':'C',Explanation:"Yes! Proper nouns name something specific and special — that capital letter is a clue.",Active:true},
    {'Module ID':'LM06','Step Number':21,'Learning Section':'Collective Nouns',Teaching:"Collective nouns name a whole group of people or animals as one unit. Different animals get their own special group names — a flock for sheep, a herd for cows.",'Step Image URL':'',Question:"Correct collective noun for a group of sheep?",'Option A':"Herd",'Option B':"Flock",'Option C':"Swarm",'Option D':"Pack",'Correct Option':'B',Explanation:"Right! A group of sheep is a flock.",Active:true},
    {'Module ID':'LM06','Step Number':22,'Learning Section':'Collective Nouns',Teaching:"Groups of people working or playing together also get their own collective noun, like a team of players or a class of students.",'Step Image URL':'',Question:"Correct collective noun for a group of players?",'Option A':"Family",'Option B':"Library",'Option C':"Team",'Option D':"Class",'Correct Option':'C',Explanation:"Correct! A group of players is a team.",Active:true},
    {'Module ID':'LM06','Step Number':23,'Learning Section':'Collective Nouns',Teaching:"A swarm is the special collective noun used for a buzzing group of insects, like bees.",'Step Image URL':'',Question:"\"A ____ of bees flew over the garden.\"",'Option A':"herd",'Option B':"swarm",'Option C':"flock",'Option D':"team",'Correct Option':'B',Explanation:"Yes! A group of bees is a swarm.",Active:true},
    {'Module ID':'LM06','Step Number':24,'Learning Section':'Collective Nouns',Teaching:"Soldiers marching together as a group are called an army — that's their collective noun.",'Step Image URL':'',Question:"Correct collective noun for a group of soldiers?",'Option A':"Army",'Option B':"Class",'Option C':"Bunch",'Option D':"Fleet",'Correct Option':'A',Explanation:"Correct! A group of soldiers is an army.",Active:true},
    {'Module ID':'LM06','Step Number':25,'Learning Section':'Collective Nouns',Teaching:"A group of students sitting together to learn is simply called a class.",'Step Image URL':'',Question:"\"A ____ of students stood up to sing.\"",'Option A':"herd",'Option B':"swarm",'Option C':"class",'Option D':"pack",'Correct Option':'C',Explanation:"Right! A group of students is a class.",Active:true},
    {'Module ID':'LM06','Step Number':26,'Learning Section':'Collective Nouns',Teaching:"Matching the right collective noun to the right animal matters — cows are described as a herd, not a flock or a swarm.",'Step Image URL':'',Question:"Which sentence uses a collective noun correctly?",'Option A':"A flock of cows grazed.",'Option B':"A swarm of cows grazed.",'Option C':"A team of cows grazed.",'Option D':"A herd of cows grazed.",'Correct Option':'D',Explanation:"Correct! Cows are described as a herd.",Active:true},
    {'Module ID':'LM06','Step Number':27,'Learning Section':'Collective Nouns',Teaching:"Ships travelling together are called a fleet — a collective noun just for vehicles like ships and boats.",'Step Image URL':'',Question:"Correct collective noun for a group of ships?",'Option A':"Army",'Option B':"Pack",'Option C':"Fleet",'Option D':"Bunch",'Correct Option':'C',Explanation:"Right! A group of ships is a fleet.",Active:true},
    {'Module ID':'LM06','Step Number':28,'Learning Section':'Collective Nouns',Teaching:"Not every collective noun is for living things — small objects that are grouped together can have one too, like a bunch of keys.",'Step Image URL':'',Question:"Collective noun for \"a group of keys\"?",'Option A':"Bunch",'Option B':"Herd",'Option C':"Flock",'Option D':"Team",'Correct Option':'A',Explanation:"Yes! A group of keys is a bunch.",Active:true},
    {'Module ID':'LM06','Step Number':29,'Learning Section':'Collective Nouns',Teaching:"A collection is the word used when many similar objects, like books, are gathered together.",'Step Image URL':'',Question:"The librarian arranged the new ____ of books.",'Option A':"herd",'Option B':"flock",'Option C':"swarm",'Option D':"collection",'Correct Option':'D',Explanation:"Correct! Books grouped together are called a collection.",Active:true},
    {'Module ID':'LM06','Step Number':30,'Learning Section':'Collective Nouns',Teaching:"Birds flying together as a group are called a flock — just like sheep.",'Step Image URL':'',Question:"Which sentence correctly uses a collective noun?",'Option A':"A swarm of birds flew south.",'Option B':"A flock of birds flew south.",'Option C':"A herd of birds flew south.",'Option D':"A team of birds flew south.",'Correct Option':'B',Explanation:"Right! Birds are described as a flock.",Active:true},
    {'Module ID':'LM06','Step Number':31,'Learning Section':'Abstract Nouns',Teaching:"Abstract nouns name feelings, ideas, or qualities — things you can't see or touch, but can definitely feel. Happiness is a feeling, so it's an abstract noun.",'Step Image URL':'',Question:"Which word is an abstract noun?",'Option A':"Table",'Option B':"Flower",'Option C':"Garden",'Option D':"Happiness",'Correct Option':'D',Explanation:"Correct! Happiness is a feeling — an abstract noun.",Active:true},
    {'Module ID':'LM06','Step Number':32,'Learning Section':'Abstract Nouns',Teaching:"A quality like honesty can't be picked up or touched — it's something you notice in how a person acts, which makes it an abstract noun.",'Step Image URL':'',Question:"Which names a quality you cannot touch (abstract)?",'Option A':"Honesty",'Option B':"Book",'Option C':"Pencil",'Option D':"Chair",'Correct Option':'A',Explanation:"Right! Honesty is a quality, untouchable — an abstract noun.",Active:true},
    {'Module ID':'LM06','Step Number':33,'Learning Section':'Abstract Nouns',Teaching:"When a sentence describes a quality someone shows — like kindness — that quality word is the abstract noun in the sentence.",'Step Image URL':'',Question:"\"Her kindness made everyone smile.\" Which word is the abstract noun?",'Option A':"smile",'Option B':"everyone",'Option C':"kindness",'Option D':"made",'Correct Option':'C',Explanation:"Correct! Kindness is the quality being described.",Active:true},
    {'Module ID':'LM06','Step Number':34,'Learning Section':'Abstract Nouns',Teaching:"Concrete nouns name things you can touch, like a table. Abstract nouns name things you can't touch, like courage. Spotting the difference helps you sort nouns quickly.",'Step Image URL':'',Question:"Which pair has one concrete and one abstract noun?",'Option A':"table – courage",'Option B':"dog – cat",'Option C':"ball – chair",'Option D':"river – mountain",'Correct Option':'A',Explanation:"Yes! Table is concrete, while courage is abstract — that's the matching pair.",Active:true},
    {'Module ID':'LM06','Step Number':35,'Learning Section':'Abstract Nouns',Teaching:"Friendship is a feeling shared between people — you can't hold it in your hand, which is exactly what makes it an abstract noun.",'Step Image URL':'',Question:"Which word is an abstract noun?",'Option A':"Mango",'Option B':"Window",'Option C':"Friendship",'Option D':"School",'Correct Option':'C',Explanation:"Correct! Friendship is a feeling, or idea — an abstract noun.",Active:true},
    {'Module ID':'LM06','Step Number':36,'Learning Section':'Abstract Nouns',Teaching:"Strong feelings like anger are abstract nouns because they describe something you experience inside, not something you can hold.",'Step Image URL':'',Question:"Which of these words is an abstract noun?",'Option A':"Garden",'Option B':"Anger",'Option C':"River",'Option D':"Mango",'Correct Option':'B',Explanation:"Right! Anger is a feeling — an abstract noun.",Active:true},
    {'Module ID':'LM06','Step Number':37,'Learning Section':'Abstract Nouns',Teaching:"Look for the word that names a quality someone shows, rather than a person, animal, or object — that word is the abstract noun in the sentence.",'Step Image URL':'',Question:"Which sentence has an abstract noun?",'Option A':"The cat sat on the mat.",'Option B':"Her honesty surprised the teacher.",'Option C':"He bought a new bicycle.",'Option D':"The flowers bloomed.",'Correct Option':'B',Explanation:"Correct! Honesty is the quality named in this sentence.",Active:true},
    {'Module ID':'LM06','Step Number':38,'Learning Section':'Abstract Nouns',Teaching:"Joy, like happiness and anger, is something you feel deep inside — not something you can pick up, which makes it abstract.",'Step Image URL':'',Question:"Which names something you feel but can't touch?",'Option A':"Table",'Option B':"Pencil",'Option C':"Joy",'Option D':"Chair",'Correct Option':'C',Explanation:"Yes! Joy is felt, not touched — an abstract noun.",Active:true},
    {'Module ID':'LM06','Step Number':39,'Learning Section':'Abstract Nouns',Teaching:"When soldiers are described as brave, the quality they show — courage — is the abstract noun in that sentence.",'Step Image URL':'',Question:"\"The soldiers showed great courage in battle.\" Which word is the abstract noun?",'Option A':"soldiers",'Option B':"battle",'Option C':"showed",'Option D':"courage",'Correct Option':'D',Explanation:"Correct! Courage is the quality named in the sentence.",Active:true},
    {'Module ID':'LM06','Step Number':40,'Learning Section':'Abstract Nouns',Teaching:"Peace is an idea or feeling of calm — you can't touch it, but you can definitely sense it, which makes it an abstract noun.",'Step Image URL':'',Question:"Which word is an abstract noun?",'Option A':"Apple",'Option B':"Mountain",'Option C':"Bicycle",'Option D':"Peace",'Correct Option':'D',Explanation:"Right! Peace is an idea or feeling — an abstract noun.",Active:true},
    {'Module ID':'LM06','Step Number':41,'Learning Section':'Mixed Practice',Teaching:"Now let's mix all four types together! In a sentence with several nouns, look closely at each one — is it general, specific, a group, or a feeling?",'Step Image URL':'',Question:"\"Rahul joined a team of young scientists.\" Which word is a proper noun?",'Option A':"team",'Option B':"scientists",'Option C':"Rahul",'Option D':"young",'Correct Option':'C',Explanation:"Correct! Rahul is a specific person's name — a proper noun.",Active:true},
    {'Module ID':'LM06','Step Number':42,'Learning Section':'Mixed Practice',Teaching:"Remember: a collective noun names a whole group acting as one unit — like a committee making a decision together.",'Step Image URL':'',Question:"\"The committee discussed the project's success.\" Which word is a collective noun?",'Option A':"committee",'Option B':"project",'Option C':"success",'Option D':"discussed",'Correct Option':'A',Explanation:"Right! Committee names a group.",Active:true},
    {'Module ID':'LM06','Step Number':43,'Learning Section':'Mixed Practice',Teaching:"Even in a sentence about a whole village, the abstract noun is still the feeling or quality being described — not the people or place.",'Step Image URL':'',Question:"\"Her courage helped the whole village.\" Which word is an abstract noun?",'Option A':"village",'Option B':"helped",'Option C':"whole",'Option D':"courage",'Correct Option':'D',Explanation:"Correct! Courage is the quality named.",Active:true},
    {'Module ID':'LM06','Step Number':44,'Learning Section':'Mixed Practice',Teaching:"To sort a common noun from the rest, ask: does this word name something general, rather than one specific thing, group, or feeling?",'Step Image URL':'',Question:"Which word in this list is a common noun?",'Option A':"Friendship",'Option B':"Asia",'Option C':"river",'Option D':"Monday",'Correct Option':'C',Explanation:"Yes! River is a general name — a common noun.",Active:true},
    {'Module ID':'LM06','Step Number':45,'Learning Section':'Mixed Practice',Teaching:"A sentence can hold more than one type of noun at once. Identify each noun's job separately — which one is the group, and which one is the specific name?",'Step Image URL':'',Question:"\"The class cheered when Priya scored a goal.\" Identify the collective noun and proper noun.",'Option A':"cheered (collective), goal (proper)",'Option B':"class (collective), Priya (proper)",'Option C':"goal (collective), class (proper)",'Option D':"Priya (collective), class (proper)",'Correct Option':'B',Explanation:"Correct! Class is the group (collective noun), and Priya is the specific name (proper noun).",Active:true},
    {'Module ID':'LM06','Step Number':46,'Learning Section':'Mixed Practice',Teaching:"Scan each sentence for a word that names a feeling or quality, rather than a person, place, group, or object.",'Step Image URL':'',Question:"Which sentence contains an abstract noun?",'Option A':"The army marched into the town.",'Option B':"Honesty is the best policy.",'Option C':"The herd crossed the river.",'Option D':"Meena bought a new bicycle.",'Correct Option':'B',Explanation:"Right! Honesty is the abstract noun here.",Active:true},
    {'Module ID':'LM06','Step Number':47,'Learning Section':'Mixed Practice',Teaching:"Don't let a proper noun like a place name distract you from spotting the collective noun in the same sentence.",'Step Image URL':'',Question:"\"A swarm of bees frightened Rohan near Juhu beach.\" Which word is a collective noun?",'Option A':"swarm",'Option B':"Rohan",'Option C':"Juhu",'Option D':"bees",'Correct Option':'A',Explanation:"Correct! Swarm names the group of bees.",Active:true},
    {'Module ID':'LM06','Step Number':48,'Learning Section':'Mixed Practice',Teaching:"When sorting a list of nouns by type, look for the one word that's capitalised because it names something one-of-a-kind.",'Step Image URL':'',Question:"Sort by type: kindness, Mumbai, herd, pencil. Which is a proper noun?",'Option A':"kindness",'Option B':"herd",'Option C':"Mumbai",'Option D':"pencil",'Correct Option':'C',Explanation:"Yes! Mumbai is one particular city — a proper noun.",Active:true},
    {'Module ID':'LM06','Step Number':49,'Learning Section':'Mixed Practice',Teaching:"A sentence celebrating a group's win often contains both a collective noun for the group and an abstract noun for how everyone feels.",'Step Image URL':'',Question:"\"The team's victory filled the players with joy.\" Which word is a collective noun?",'Option A':"team",'Option B':"players",'Option C':"victory",'Option D':"joy",'Correct Option':'A',Explanation:"Correct! Team names the group of players.",Active:true},
    {'Module ID':'LM06','Step Number':50,'Learning Section':'Mixed Practice',Teaching:"For the final challenge, sort every noun type in one sentence at once: who is named specifically, what feeling is described, and what group is mentioned?",'Step Image URL':'',Question:"\"Anjali's kindness inspired the whole class in Pune.\" Which option correctly labels the nouns?",'Option A':"Anjali (common), kindness (proper), class (abstract), Pune (collective)",'Option B':"Anjali (collective), kindness (common), class (proper), Pune (abstract)",'Option C':"Anjali (abstract), kindness (proper), class (common), Pune (collective)",'Option D':"Anjali (proper), kindness (abstract), class (collective), Pune (proper)",'Correct Option':'D',Explanation:"Excellent! Anjali and Pune are proper nouns (specific names), kindness is abstract (a quality), and class is collective (a group) — you've mastered all four noun types!",Active:true},
  ],
};

// Recognizes every common way a Sheets cell can spell "inactive": boolean false,
// numeric 0, or the text 'No'/'FALSE'/'Inactive' in any capitalization. A blank or
// missing cell (e.g. a tab that doesn't have this column at all) defaults to
// active, so it never silently hides rows that simply haven't set this field.
function isRowActive(v) {
  if (v === undefined || v === null || v === '') return true;
  if (v === false || v === 0) return false;
  const s = String(v).trim().toLowerCase();
  return !(s === 'false' || s === 'no' || s === 'n' || s === '0' || s === 'inactive');
}

// Folds raw StudentProgress rows (one row per answered question, as written
// by recordAnswer()/api/student/progress) back into the same per-module
// summary shape (`{attempted, correct, incorrect, completionPct, startedAt,
// completedAt, answers}`) that LearningModulePlayer and the dashboard already
// expect from localStorage. Used to rebuild a student's progress on a device
// that doesn't have it cached locally. Keeps only the latest row per
// (module, question) in case a question was somehow synced more than once.
//
// `stepsFor(moduleId)` returns that module's actual steps array (not just a
// count) — needed for two things:
//   1. completionPct/completedAt, same as before.
//   2. Translating each row's QuestionNumber (the sheet's 'Step Number') into
//      that question's array index. LearningModulePlayer keys its live
//      `answers` object by array index rather than Step Number (Step Number
//      is content-managed data and isn't guaranteed unique — see the
//      `currentAnswer` comment in LearningModulePlayer), so a rebuild that
//      kept using Step Number as the key would silently stop lining up with
//      live answers, making resumed/reviewed questions look wrong or
//      unanswered even though the sheet has the record. A row whose
//      QuestionNumber no longer matches any current step (chapter content
//      changed since it was answered) is skipped rather than guessed at.
function rebuildLearnProgressFromRows(rows, stepsFor) {
  const latestByModuleQuestion = {}; // "moduleId|questionNumber" -> row
  rows.forEach(r => {
    const key = `${r.ModuleID}|${r.QuestionNumber}`;
    const existing = latestByModuleQuestion[key];
    if (!existing || String(r.Timestamp||'') > String(existing.Timestamp||'')) {
      latestByModuleQuestion[key] = r;
    }
  });

  // Matches the "X/Y matched" summary recordAnswer() writes for
  // matchTheFollowing questions (see submitMatchTheFollowing) — that's ALL
  // the sheet ever stores for this question type; the actual word→meaning
  // placements a student chose are never sent. So a rebuilt matchTheFollowing
  // answer can carry the score honestly, but must never claim to know full
  // placements — see the `rebuiltFromHistory` flag below.
  const MATCH_SUMMARY_RE = /^(\d+)\/(\d+)\s+matched$/i;

  const byModule = {};
  Object.values(latestByModuleQuestion).forEach(r => {
    const moduleId = r.ModuleID;
    if (!moduleId) return;
    const moduleSteps = (stepsFor ? stepsFor(moduleId) : []) || [];
    const idx = moduleSteps.findIndex(s => String(s['Step Number']) === String(r.QuestionNumber));
    if (idx === -1) return; // question no longer exists in this module — skip rather than mis-key it

    if (!byModule[moduleId]) byModule[moduleId] = { answers:{}, timestamps:[], stepCount: moduleSteps.length };
    const isCorrect = String(r.Status||'').trim().toLowerCase() === 'correct';
    // Issue 1: carry the per-question time (if the sheet has it) back into
    // the rebuilt answer record, so a fresh device's review screen and the
    // total-time rollup below both have it, not just the device that
    // originally answered the question.
    const qSecs = Number(r.TimeTakenSeconds) || 0;

    const matchSummary = MATCH_SUMMARY_RE.exec(String(r.AnswerGiven||''));
    byModule[moduleId].answers[idx] = matchSummary
      ? {
          type: 'matchTheFollowing',
          isCorrect,
          score: Number(matchSummary[1]),
          total: Number(matchSummary[2]),
          stepNumber: r.QuestionNumber,
          timeTakenSeconds: qSecs,
          // No placements available from the sheet — rebuiltFromHistory
          // tells LearningModulePlayer to show a lightweight "already
          // completed" summary instead of feeding an empty placements
          // object into MatchTheFollowing, which would otherwise grade
          // every pair as wrong.
          rebuiltFromHistory: true,
        }
      : {
          isCorrect,
          selected: r.AnswerGiven,
          correctText: r.CorrectAnswer,
          stepNumber: r.QuestionNumber,
          timeTakenSeconds: qSecs,
          // `selected` here is the option's display text (that's what the
          // sheet stores), not the A/B/C/D letter the live UI uses — so the
          // review screen can't reliably re-highlight the exact button.
          // This flag lets it fall back to showing the text plainly instead
          // of guessing a letter.
          rebuiltFromHistory: true,
        };
    if (r.Timestamp) byModule[moduleId].timestamps.push(r.Timestamp);
  });

  const result = {};
  Object.keys(byModule).forEach(moduleId => {
    const { answers, timestamps, stepCount } = byModule[moduleId];
    const attempted = Object.keys(answers).length;
    const correct   = Object.values(answers).filter(a=>a.isCorrect).length;
    // Issue 2: total time taken to finish the topic — summed from each
    // question's individual time, so it's accurate even when rebuilt from
    // sheet history on a brand-new device that never ran the live timer.
    const summedSeconds = Object.values(answers).reduce((sum, a) => sum + (a.timeTakenSeconds || 0), 0);
    timestamps.sort();
    const total = stepCount || 0;
    const isComplete = total > 0 && attempted >= total;
    result[moduleId] = {
      startedAt: timestamps[0] || null,
      completedAt: isComplete ? (timestamps[timestamps.length-1] || null) : null,
      attempted, correct, incorrect: attempted - correct,
      completionPct: total > 0 ? Math.round((attempted/total)*100) : 0,
      timeTakenSeconds: summedSeconds,
      answers,
    };
  });
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACHIEVEMENTS — computed live from real progress data (SUBJ + learnProgress),
// never hardcoded per student. The requirements doc names specific examples
// (Maths Explorer, Grammar Champion, Science Star) tied to fixed subjects —
// generalized here into a per-subject "Explorer" badge so it automatically
// covers whatever subjects a teacher has configured in the sheet (including
// ones that don't exist yet, like a future Class 6 subject), rather than
// hardcoding five subject names that would silently stop working the moment
// the subject list changes.
function computeAchievements(SUBJ, learnProgress, t) {
  const badges = [];
  const allProgress = Object.values(learnProgress);
  const totalAttempted = allProgress.reduce((s,p)=>s+(p?.attempted||0),0);
  const totalCorrect   = allProgress.reduce((s,p)=>s+(p?.correct||0),0);
  const completedCount = allProgress.filter(p=>p?.completedAt).length;

  // Last Activity Date — the most recent startedAt/completedAt timestamp
  // across every module the student has touched, used by the Learning
  // Analytics card. null if the student hasn't started anything yet.
  const lastActivityAt = allProgress.reduce((latest, p) => {
    const ts = p?.completedAt || p?.startedAt;
    return ts && (!latest || ts > latest) ? ts : latest;
  }, null);

  // One "Explorer" badge per subject the student has made real headway in.
  // Badge text is built via t() so it's fully translated — these are NOT
  // hardcoded English strings (a Subject value like "Naturfag" is already
  // in the right language by the time it gets here, since SUBJ is built
  // from the language-appropriate assignmentSubjects/learningModules).
  SUBJ.forEach(s => {
    if (s['Progress %'] >= 50) {
      badges.push({
        id: `explorer-${s.Subject}`,
        label: t('p_badge_explorer', { subject: s.Subject }),
        icon: 'fa-compass',
        color: s['Color (Hex)'],
        detail: t('p_badge_explorer_detail', { done: s['Topics Done'], total: s['Total Topics'], subject: s.Subject }),
      });
    }
    if (s['Total Topics'] > 0 && s['Topics Done'] === s['Total Topics']) {
      badges.push({
        id: `champion-${s.Subject}`,
        label: t('p_badge_champion', { subject: s.Subject }),
        icon: 'fa-crown',
        color: s['Color (Hex)'],
        detail: t('p_badge_champion_detail', { subject: s.Subject }),
      });
    }
  });

  // Fast Learner — finished at least one topic in under 10 minutes start-to-finish.
  const fastCompletion = allProgress.find(p => {
    if (!p?.startedAt || !p?.completedAt) return false;
    const mins = (new Date(p.completedAt) - new Date(p.startedAt)) / 60000;
    return mins > 0 && mins < 10;
  });
  if (fastCompletion) {
    badges.push({ id:'fast-learner', label:t('p_badge_fast_learner'), icon:'fa-bolt', color:'#f5a623', detail:t('p_badge_fast_learner_detail') });
  }

  // Consistent Performer — active across multiple subjects, not just one burst.
  const subjectsWithActivity = SUBJ.filter(s => s['Topics Done'] > 0).length;
  if (subjectsWithActivity >= 3 || completedCount >= 5) {
    badges.push({
      id:'consistent', label:t('p_badge_consistent'), icon:'fa-medal', color:'#00c6a7',
      detail: subjectsWithActivity>=3 ? t('p_badge_consistent_subjects', {n: subjectsWithActivity}) : t('p_badge_consistent_topics', {n: completedCount}),
    });
  }

  // Perfectionist — at least one topic completed with a perfect score.
  const perfectTopic = allProgress.find(p => p?.completedAt && p.attempted>0 && p.correct===p.attempted);
  if (perfectTopic) {
    badges.push({ id:'perfectionist', label:t('p_badge_perfectionist'), icon:'fa-star', color:'#a855f7', detail:t('p_badge_perfectionist_detail') });
  }

  return {
    badges, totalAttempted, totalCorrect, completedCount, lastActivityAt,
    accuracy: totalAttempted ? Math.round((totalCorrect/totalAttempted)*100) : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERACTIVE LEARNING — topic grid, intro, step-by-step lesson, completion
// ─────────────────────────────────────────────────────────────────────────────
function ModuleStatusBadge({ progress, total, t }) {
  if (!progress || !progress.startedAt) {
    return <span className="lm-status notstarted"><i className="fa-solid fa-circle-play" /> {t('p_not_started')}</span>;
  }
  if (progress.completedAt) {
    return <span className="lm-status completed"><i className="fa-solid fa-circle-check" /> {t('p_completed')} · {progress.correct}/{total}</span>;
  }
  return <span className="lm-status inprogress"><i className="fa-solid fa-hourglass-half" /> {progress.completionPct||0}% {t('p_in_progress')}</span>;
}

function AssignmentSubjectsGrid({ subjects, statsFor, onOpen, t }) {
  if (!subjects.length) {
    return <div className="card" style={{textAlign:'center',color:'var(--muted)',fontSize:'13px'}}>{t('p_no_subjects_configured')}</div>;
  }
  return (
    <div className="asgn-subj-grid">
      {subjects.map(s => {
        const { total, completed } = statsFor(s.Subject);
        return (
          <div key={s.Subject} className="asgn-subj-card" role="button" tabIndex={0}
            onClick={() => onOpen(s.Subject)}
            onKeyDown={e => { if (e.key==='Enter' || e.key===' ') { e.preventDefault(); onOpen(s.Subject); } }}>
            <div className="asgn-subj-icon" style={{background:`${s['Color (Hex)']}22`,color:s['Color (Hex)']}}>
              {s.Emoji || <i className={`fa-solid ${s['Icon (FontAwesome solid)']||'fa-book'}`} />}
            </div>
            <div style={{flex:1}}>
              <div className="asgn-subj-name">{s.Subject}</div>
              <p className="asgn-subj-tag">{s.Tagline}</p>
            </div>
            <div className="asgn-subj-count">
              {total>0 ? <><span className="n">{completed}/{total}</span><span className="l">{t('p_topics_suffix')}</span></> : <span className="asgn-subj-soon">{t('p_coming_soon')}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LearningModulesGrid({ modules, stepsFor, progressMap, onOpen, t }) {
  if (!modules.length) {
    return <div className="card" style={{textAlign:'center',color:'var(--muted)',fontSize:'13px'}}>{t('p_no_topics_yet')}</div>;
  }
  return (
    <div className="lm-grid">
      {modules.map(m => {
        const id = m['Module ID'];
        const total = stepsFor(id).length;
        const progress = progressMap[id];
        return (
          <div key={id} className="lm-card" role="button" tabIndex={0}
            onClick={() => onOpen(id)}
            onKeyDown={e => { if (e.key==='Enter' || e.key===' ') { e.preventDefault(); onOpen(id); } }}>
            <div className="lm-icon" style={{background:`${m['Color (Hex)']}22`,color:m['Color (Hex)']}}>
              {m.Emoji || <i className={`fa-solid ${m['Icon (FontAwesome solid)']||'fa-book'}`} />}
            </div>
            <div>
              <div className="lm-subj">{m.Subject}</div>
              <div className="lm-title">{m.Title}</div>
              <p className="lm-teaser">{m.Introduction}</p>
            </div>
            <ModuleStatusBadge progress={progress} total={total} t={t} />
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SOUND ENGINE — Web Audio API, zero external deps.
// All sounds are synthesised in-browser so they work offline and load instantly.
// useSoundEngine() returns { playCorrect, playWrong, playStreak } which the
// lesson view calls on every answer. Sounds are opt-in: the first user gesture
// (answering a question) creates the AudioContext, so there are no autoplay
// policy violations. If the browser has no Web Audio support the functions
// are no-ops — nothing breaks.
// ─────────────────────────────────────────────────────────────────────────────
function useSoundEngine() {
  const acRef = useRef(null);
  const getAC = () => {
    if (typeof window === 'undefined') return null;
    if (!acRef.current) {
      try { acRef.current = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
    }
    // Chrome suspends AudioContext until a user gesture — resume silently.
    if (acRef.current.state === 'suspended') acRef.current.resume().catch(() => {});
    return acRef.current;
  };

  // Tiny tone helper: freq(Hz), duration(s), type, gainPeak
  const tone = (ac, freq, start, dur, type='sine', peak=0.35) => {
    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain); gain.connect(ac.destination);
    osc.type = type; osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.start(start); osc.stop(start + dur + 0.01);
  };

  const playCorrect = useCallback(() => {
    const ac = getAC(); if (!ac) return;
    const t0 = ac.currentTime;
    // Rising two-note chime: C5 → E5
    tone(ac, 523, t0,       0.18, 'sine', 0.30);
    tone(ac, 659, t0 + 0.14, 0.22, 'sine', 0.28);
  }, []);

  const playWrong = useCallback(() => {
    const ac = getAC(); if (!ac) return;
    const t0 = ac.currentTime;
    // Descending buzz: A3 → F3, sawtooth for a "bzzzt" texture
    tone(ac, 220, t0,       0.14, 'sawtooth', 0.20);
    tone(ac, 175, t0 + 0.12, 0.18, 'sawtooth', 0.15);
  }, []);

  // streak: 5 | 8 | 12 | 10(fireworks) — 10 uses a fanfare
  const playStreak = useCallback((streak) => {
    const ac = getAC(); if (!ac) return;
    const t0 = ac.currentTime;
    if (streak >= 10) {
      // 10-in-a-row fanfare: C5 E5 G5 C6 ascending triplet
      [[523,0],[659,.12],[784,.24],[1047,.38]].forEach(([f,dt]) => tone(ac, f, t0+dt, 0.22, 'sine', 0.32));
    } else if (streak >= 8) {
      // 3-note rising arpeggio
      [[523,0],[659,.12],[784,.24]].forEach(([f,dt]) => tone(ac, f, t0+dt, 0.20, 'sine', 0.30));
    } else {
      // 5-in-a-row: two-tone chime, slightly brighter than a normal correct
      tone(ac, 659, t0,       0.18, 'sine', 0.32);
      tone(ac, 880, t0 + 0.14, 0.20, 'sine', 0.28);
    }
  }, []);

  return { playCorrect, playWrong, playStreak };
}

// ─────────────────────────────────────────────────────────────────────────────
// FIREWORKS CANVAS — rendered as a fixed overlay, auto-dismisses after 2.6 s.
// Triggered when streak hits 10 (and multiples thereof).
// Pure canvas, no libs. Particle physics: initial velocity + gravity + fade.
// ─────────────────────────────────────────────────────────────────────────────
function FireworksOverlay({ active, onDone }) {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    // 6 burst origins spread across top-third of the screen
    const COLORS = ['#f5a623','#00c6a7','#f87171','#c084fc','#60a5fa','#4ade80','#fbbf24','#e879f9'];
    const particles = [];
    const makeBurst = (x, y) => {
      for (let i = 0; i < 55; i++) {
        const angle = (Math.PI * 2 * i) / 55;
        const speed = 3 + Math.random() * 5;
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          alpha: 1,
          radius: 3 + Math.random() * 3,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          decay: 0.012 + Math.random() * 0.01,
          gravity: 0.12,
        });
      }
    };

    // Stagger 6 bursts over 600 ms for a multi-burst feel
    const burstPositions = [
      [canvas.width*0.2, canvas.height*0.3],
      [canvas.width*0.5, canvas.height*0.15],
      [canvas.width*0.8, canvas.height*0.28],
      [canvas.width*0.35,canvas.height*0.22],
      [canvas.width*0.65,canvas.height*0.35],
      [canvas.width*0.5, canvas.height*0.42],
    ];
    burstPositions.forEach(([x,y],i) => setTimeout(() => makeBurst(x,y), i*110));

    let start = null;
    const DURATION = 2600;
    const loop = (ts) => {
      if (!start) start = ts;
      const elapsed = ts - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.vy += p.gravity;
        p.x  += p.vx;
        p.y  += p.vy;
        p.alpha -= p.decay;
        if (p.alpha <= 0) return;
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle   = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
      if (elapsed < DURATION) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        onDone?.();
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [active]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      style={{
        position:'fixed', inset:0, zIndex:9999,
        pointerEvents:'none', // clicks pass through
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STREAK TOAST — shown as a non-blocking banner when streak milestones are hit.
// ─────────────────────────────────────────────────────────────────────────────
const STREAK_MILESTONES = [
  { at:5,  emoji:'🔥',  label:'5 in a Row!',   sub:'You\'re on fire! Keep it up!',        color:'#f97316' },
  { at:8,  emoji:'⚡',  label:'8 Correct!',    sub:'Incredible focus — amazing streak!',   color:'#a855f7' },
  { at:10, emoji:'🎆',  label:'10 in a Row!',  sub:'FIREWORKS! You\'re unstoppable!',      color:'#f5a623' },
  { at:12, emoji:'👑',  label:'12 Correct!',   sub:'CROWN LEVEL! You\'re a genius!',       color:'#00c6a7' },
];

function StreakToast({ streak, onDone }) {
  const ms = STREAK_MILESTONES.slice().reverse().find(m => streak >= m.at && streak % m.at === 0 ) ||
             STREAK_MILESTONES.slice().reverse().find(m => streak === m.at);
  const [visible, setVisible] = useState(true);
  useEffect(() => { const t = setTimeout(() => { setVisible(false); onDone?.(); }, 2400); return () => clearTimeout(t); }, [streak]);
  if (!ms || !visible) return null;
  return (
    <div style={{
      position:'fixed', top:'18px', left:'50%', transform:'translateX(-50%)',
      zIndex:10000, pointerEvents:'none',
      background:`linear-gradient(135deg,${ms.color}22,${ms.color}44)`,
      border:`1.5px solid ${ms.color}66`,
      borderRadius:'18px', padding:'14px 28px', textAlign:'center',
      backdropFilter:'blur(12px)',
      animation:'streakPop .35s cubic-bezier(.34,1.56,.64,1) both',
      boxShadow:`0 8px 32px ${ms.color}44`,
    }}>
      <div style={{fontSize:'36px',lineHeight:1,marginBottom:'4px'}}>{ms.emoji}</div>
      <div style={{fontFamily:'var(--fd)',fontSize:'20px',fontWeight:900,color:'#fff'}}>{ms.label}</div>
      <div style={{fontSize:'12px',color:'rgba(255,255,255,.7)',marginTop:'3px'}}>{ms.sub}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// useTestTimer — high-precision count-up timer for the quiz player.
//
// • Uses performance.now() so accuracy is maintained even if the tab is hidden.
// • Pauses automatically after INACTIVITY_PAUSE_MS (5 min) of no mouse/touch/
//   keyboard activity, and resumes the instant the student interacts again.
// • On finish() it stops, calculates total elapsed seconds, and POSTs to
//   /api/student/test-time (best-effort — localStorage is the primary store).
// • Persists startTime + elapsed seconds in localStorage so a page refresh
//   mid-test does not zero the clock.
//
// Config sheet keys (add to the "Config" tab in the Master Sheet):
//   EnableTestTimer   TRUE / FALSE   — FALSE disables timer entirely (no UI, no log). Default TRUE.
//   ShowTestTimer     TRUE / FALSE   — FALSE hides the clock but still logs. Default TRUE.
// ─────────────────────────────────────────────────────────────────────────────
const INACTIVITY_PAUSE_MS = 5 * 60 * 1000; // 5 minutes

function useTestTimer({ moduleId, profile, subject, topic, enabled = true }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isPaused,       setIsPaused]       = useState(false);

  const baseElapsed  = useRef(0);   // seconds already banked before this browser session
  const sessionStart = useRef(null);// performance.now() of when this session began
  const stopped      = useRef(false);
  const lastActivity = useRef(Date.now());
  const pausedAt     = useRef(null);// performance.now() when inactivity pause began
  const pausedMs     = useRef(0);   // total ms paused this session
  const rafId        = useRef(null);
  const logged       = useRef(false);


  // Restore any previously banked elapsed time (survives page refresh)
  useEffect(() => {
    if (!enabled || !moduleId || !profile?.id) return;
    try {
      const raw = localStorage.getItem(`testTimer:${profile.id}:${moduleId}`);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.elapsed) baseElapsed.current = Number(saved.elapsed) || 0;
      }
    } catch {}
  }, [enabled, moduleId, profile?.id]);

  // Activity listeners — any interaction resets the inactivity clock
  useEffect(() => {
    if (!enabled) return;
    const touch = () => { lastActivity.current = Date.now(); };
    window.addEventListener('mousemove',  touch, { passive: true });
    window.addEventListener('mousedown',  touch, { passive: true });
    window.addEventListener('keydown',    touch, { passive: true });
    window.addEventListener('touchstart', touch, { passive: true });
    return () => {
      window.removeEventListener('mousemove',  touch);
      window.removeEventListener('mousedown',  touch);
      window.removeEventListener('keydown',    touch);
      window.removeEventListener('touchstart', touch);
    };
  }, [enabled]);

  // RAF loop — ticks every animation frame, updates UI once per second
  useEffect(() => {
    if (!enabled || !moduleId) return;
    sessionStart.current = performance.now();
    stopped.current      = false;
    logged.current       = false;
    pausedAt.current     = null;
    pausedMs.current     = 0;
    let lastTick = -1;

    const tick = () => {
      if (stopped.current) return;
      const now            = performance.now();
      const sinceActivity  = Date.now() - lastActivity.current;

      // Inactivity pause logic
      if (sinceActivity >= INACTIVITY_PAUSE_MS && !pausedAt.current) {
        pausedAt.current = now;
        setIsPaused(true);
      } else if (sinceActivity < INACTIVITY_PAUSE_MS && pausedAt.current) {
        pausedMs.current += now - pausedAt.current;
        pausedAt.current  = null;
        setIsPaused(false);
      }

      // Net elapsed: session duration minus all paused ms
      const activePausedMs = pausedAt.current ? (now - pausedAt.current) : 0;
      const sessionMs      = now - sessionStart.current - pausedMs.current - activePausedMs;
      const totalSecs      = Math.floor(baseElapsed.current + sessionMs / 1000);

      if (totalSecs !== lastTick) {
        lastTick = totalSecs;
        setElapsedSeconds(totalSecs);
        // Persist every tick so a refresh resumes from here
        try {
          localStorage.setItem(
            `testTimer:${profile.id}:${moduleId}`,
            JSON.stringify({ elapsed: totalSecs, ts: Date.now() })
          );
        } catch {}
      }

      rafId.current = requestAnimationFrame(tick);
    };

    rafId.current = requestAnimationFrame(tick);
    return () => { if (rafId.current) cancelAnimationFrame(rafId.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, moduleId, profile?.id]);

  // stop() — call when the student finishes the last question
  const stop = useCallback((finalSecs) => {
    if (!enabled || logged.current) return;
    logged.current  = true;
    stopped.current = true;
    if (rafId.current) cancelAnimationFrame(rafId.current);

    const totalSeconds = typeof finalSecs === 'number' ? finalSecs : elapsedSeconds;

    // Clear the in-progress localStorage key
    try { localStorage.removeItem(`testTimer:${profile.id}:${moduleId}`); } catch {}

    // Stash timeTakenSeconds into learnProgress so Completed Topics tab can
    // display it immediately without a sheet round-trip.
    try {
      const lpKey = `learnProgress:${profile.id}`;
      const lp    = JSON.parse(localStorage.getItem(lpKey) || '{}');
      if (!lp[moduleId]) lp[moduleId] = {};
      lp[moduleId].timeTakenSeconds = totalSeconds;
      localStorage.setItem(lpKey, JSON.stringify(lp));
    } catch {}

    // POST to the logging API — best-effort
    fetch('/api/student/test-time', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId:   profile.id,
        studentName: profile.name       || '',
        classLevel:  profile.classLevel || '',
        subject:     subject  || '',
        topic:       topic    || '',
        moduleId,
        totalSeconds,
        completedAt: new Date().toISOString(),
      }),
    }).catch(() => {});
  }, [enabled, elapsedSeconds, moduleId, profile, subject, topic]);

  // Build display string: MM:SS when < 1 hour, HH:MM:SS otherwise
  const h = Math.floor(elapsedSeconds / 3600);
  const m = Math.floor((elapsedSeconds % 3600) / 60);
  const s = elapsedSeconds % 60;
  const displayStr = h > 0
    ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

  return { elapsedSeconds, displayStr, isPaused, stop };
}

function LearningModulePlayer({ module, steps: allSteps, progress, onSave, onAnswer, onExit, backLabel, soundConfig, t, rangeFrom, rangeTo, onRangeComplete, profile, timerConfig }) {
  // ── Parent/teacher-assigned question range (Assignments for you) ────────
  // When a student opens a chapter from the "Assignments for you" tab
  // instead of the open Question Bank, rangeFrom/rangeTo restrict play to
  // just the assigned question numbers (1-indexed, inclusive — matches the
  // "From Question" / "To Question" columns the parent set in the Parent
  // Portal builder table). Original 'Step Number' values are preserved so
  // explanations/keys/review screens still reference the real chapter
  // question numbers, not 1..N of the restricted slice.
  const steps = (rangeFrom && rangeTo) ? allSteps.slice(rangeFrom - 1, rangeTo) : allSteps;
  // ── Sound control from Config sheet ──────────────────────────────────────
  // Keys in the Config tab (case-sensitive):
  //   SoundOnCorrect        TRUE / FALSE   (default: TRUE)
  //   SoundOnWrong          TRUE / FALSE   (default: TRUE)
  //   SoundOnStreak         TRUE / FALSE   (default: TRUE)
  //   StreakThreshold       number         (default: 5 — first milestone)
  //   ShowQuestionDropdown  TRUE / FALSE   (default: FALSE — dropdown hidden)
  // An absent key or any value other than the string 'FALSE' keeps sound ON.
  const sc = soundConfig || {};
  const soundOnCorrect       = (sc['SoundOnCorrect']       || 'TRUE').toString().toUpperCase() !== 'FALSE';
  const soundOnWrong         = (sc['SoundOnWrong']         || 'TRUE').toString().toUpperCase() !== 'FALSE';
  const soundOnStreak        = (sc['SoundOnStreak']        || 'TRUE').toString().toUpperCase() !== 'FALSE';
  const streakThreshold      = Math.max(2, parseInt(sc['StreakThreshold'] || '5', 10) || 5);
  const showQuestionDropdown = (sc['ShowQuestionDropdown'] || 'FALSE').toString().toUpperCase() === 'TRUE';

  // ── Timer config (Config sheet keys) ─────────────────────────────────────
  // EnableTestTimer  TRUE/FALSE  — set FALSE to disable entirely (default TRUE)
  // ShowTestTimer    TRUE/FALSE  — set FALSE to hide clock but still log (default TRUE)
  const tc          = timerConfig || {};
  const enableTimer = (tc['EnableTestTimer'] || 'TRUE').toString().toUpperCase() !== 'FALSE';
  const showTimerUI = (tc['ShowTestTimer']   || 'TRUE').toString().toUpperCase() !== 'FALSE';

  const timer = useTestTimer({
    moduleId: module?.['Module ID'],
    profile:  profile || { id: 'anon', name: '', classLevel: '' },
    subject:  module?.SubjectEN || module?.Subject || '',
    topic:    module?.Title || '',
    enabled:  enableTimer,
  });

  const total = steps.length;
  const attemptedCount = progress?.answers ? Object.keys(progress.answers).length : 0;
  const isComplete = !!progress?.completedAt;

  const [view,          setView]          = useState('intro'); // intro | lesson | complete
  const [idx,           setIdx]           = useState(0);
  const [answers,       setAnswers]       = useState(progress?.answers || {});
  // streak: consecutive correct answers in this session (reset on wrong answer or retake)
  const [streak,        setStreak]        = useState(0);
  // toastStreak: the streak value that triggered the current toast (so re-renders don't re-show it)
  const [toastStreak,   setToastStreak]   = useState(0);
  const [showFireworks, setShowFireworks] = useState(false);

  const { playCorrect, playWrong, playStreak } = useSoundEngine();

  // selected/locked are derived from answers+idx rather than tracked as their
  // own state — this is what makes Previous/Next safe: jumping to any step
  // (forward or backward) automatically shows that step's saved answer
  // (locked, colored correct/incorrect) if one exists, or a fresh unanswered
  // question if it doesn't, with no extra bookkeeping to keep in sync.
  //
  // IMPORTANT: keyed by `idx` (this question's position in `steps`), NOT by
  // the sheet's 'Step Number' field. Step Number is content-managed data —
  // duplicate rows, a re-ordered Learning Steps tab, or two sections that
  // both start at 1 are all real possibilities — and if two different
  // questions in the same module ever share a Step Number, keying answers by
  // that value makes them collide: answering one instantly makes the other
  // look "already answered" (with the wrong question's data), and it also
  // undercounts Object.keys(answers).length, which is what "Continue"
  // (see begin(attemptedCount) below) uses to resume — so a collision also
  // makes the app resume several questions earlier than the student actually
  // reached, on top of showing incorrect/locked data. `idx` is always unique
  // by construction, so this class of bug can't happen regardless of what's
  // in the sheet. Step Number itself is still recorded inside each saved
  // answer/payload for display and sheet logging — nothing about what's
  // shown to the student or written to the StudentProgress sheet changes.
  const currentAnswer = answers[idx];
  const selected = currentAnswer?.selected ?? null;
  const locked   = !!currentAnswer;

  const resolvedBackLabel = backLabel || t('p_back_to_topics');

  // Whether the last answered question was a new answer (not a revisit)
  // — used to decide whether to update the streak on this render.
  const lastAnsweredStep = useRef(null);

  // ── Issue 1: per-question time tracking ───────────────────────────────────
  // questionStartRef marks the moment THIS question first became visible
  // (performance.now(), so it's immune to clock changes). It resets every
  // time idx changes to an unanswered question — including on Previous/Next
  // navigation — so re-visiting an already-answered question never
  // overwrites its original timeTakenSeconds. choose() reads this ref to
  // compute how long the student spent on the question before answering.
  const questionStartRef = useRef(performance.now());
  useEffect(() => {
    // Only (re)start the per-question clock if this question hasn't been
    // answered yet — an already-locked question shouldn't keep ticking.
    if (!answers[idx]) {
      questionStartRef.current = performance.now();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  if (!module || !total) {
    return (
      <div className="content">
        <button className="lp-back" onClick={onExit}><i className="fa-solid fa-arrow-left" /> {resolvedBackLabel}</button>
        <div className="card" style={{textAlign:'center',color:'var(--muted)'}}>{t('p_no_steps_yet')}</div>
      </div>
    );
  }

  const step = steps[idx];

  const begin = fromIdx => {
    setIdx(fromIdx);
    if (!progress?.startedAt) onSave({ startedAt:new Date().toISOString(), attempted:0, correct:0, incorrect:0, completionPct:0, answers:{} });
    setView('lesson');
  };

  const retake = () => {
    setAnswers({});
    setStreak(0); setToastStreak(0); setShowFireworks(false);
    onSave({ startedAt:new Date().toISOString(), completedAt:null, attempted:0, correct:0, incorrect:0, completionPct:0, answers:{} });
    begin(0);
  };

  // Reads Left 1..Left 10 / Right 1..Right 10 off a Learning Steps row into
  // the { id, left, right } shape MatchTheFollowing expects. Skips any pair
  // where both cells are blank, so 5/6/8/10-pair rows all work.
  const pairsFromStep = (s) => {
    const pairs = [];
    for (let n = 1; n <= 10; n++) {
      const left = (s[`Left ${n}`] || '').trim();
      const right = (s[`Right ${n}`] || '').trim();
      if (!left && !right) continue;
      pairs.push({ id: String(n), left, right });
    }
    return pairs;
  };

  const isMatchStep = (s) => (s['Question Type'] || '').trim().toLowerCase() === 'matchthefollowing';

  const submitMatchTheFollowing = (result) => {
    if (locked) return; // guards a stray double-call on an already-answered question
    const questionTimeSecs = Math.max(0, Math.round((performance.now() - questionStartRef.current) / 1000));
    const isCorrect = result.score === result.total;
    const nextAnswers = { ...answers, [idx]: {
      type: 'matchTheFollowing',
      isCorrect,
      question: step.Question,
      placements: result.placements,
      score: result.score,
      total: result.total,
      explanation: step.Explanation,
      stepNumber: step['Step Number'],
      timeTakenSeconds: questionTimeSecs,
    }};
    setAnswers(nextAnswers);
    const attempted = Object.keys(nextAnswers).length;
    const correct   = Object.values(nextAnswers).filter(a => a.isCorrect).length;
    onSave({ attempted, correct, incorrect: attempted - correct, completionPct: Math.round((attempted / total) * 100), answers: nextAnswers });
    onAnswer?.({
      moduleId: module['Module ID'], subject: module.SubjectEN || module.Subject, topic: module.Title,
      questionNumber: step['Step Number'], answerGiven: `${result.score}/${result.total} matched`,
      correctAnswer: `${result.total}/${result.total} matched`, isCorrect,
      timeTakenSeconds: questionTimeSecs,
    });

    // Same sound/streak treatment as choose() — full marks counts as a streak
    // hit, a partial match breaks it.
    if (isCorrect) {
      if (soundOnCorrect) playCorrect();
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      const isMilestone = nextStreak >= streakThreshold && nextStreak % streakThreshold === 0;
      if (isMilestone) {
        if (soundOnStreak) playStreak(nextStreak);
        setToastStreak(nextStreak);
        if (nextStreak % (streakThreshold * 2) === 0) setShowFireworks(true);
      }
    } else {
      if (soundOnWrong) playWrong();
      setStreak(0);
    }
  };

  const choose = letter => {
    if (locked) return;
    const isCorrect = letter === step['Correct Option'];
    // Issue 1: capture time spent on THIS question (seconds, rounded to the
    // nearest whole second — sub-second precision isn't useful for review
    // screens / sheet logging and keeps the stored numbers tidy).
    const questionTimeSecs = Math.max(0, Math.round((performance.now() - questionStartRef.current) / 1000));
    const nextAnswers = { ...answers, [idx]: {
      selected: letter, isCorrect, question: step.Question, correctOpt: step['Correct Option'], explanation: step.Explanation,
      options: { A:step['Option A'], B:step['Option B'], C:step['Option C'], D:step['Option D'] },
      stepNumber: step['Step Number'],
      timeTakenSeconds: questionTimeSecs,
    }};
    setAnswers(nextAnswers);
    const attempted = Object.keys(nextAnswers).length;
    const correct   = Object.values(nextAnswers).filter(a=>a.isCorrect).length;
    onSave({ attempted, correct, incorrect: attempted-correct, completionPct: Math.round((attempted/total)*100), answers: nextAnswers });
    onAnswer?.({
      moduleId: module['Module ID'], subject: module.SubjectEN || module.Subject, topic: module.Title,
      questionNumber: step['Step Number'], answerGiven: step[`Option ${letter}`] || letter,
      correctAnswer: step[`Option ${step['Correct Option']}`] || step['Correct Option'], isCorrect,
      timeTakenSeconds: questionTimeSecs,
    });

    // ── Sound + streak ──
    if (isCorrect) {
      if (soundOnCorrect) playCorrect();
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      // Milestone fires at every multiple of streakThreshold (configurable via
      // Config sheet key "StreakThreshold", default 5). e.g. threshold=3 → 3,6,9,12…
      const isMilestone = nextStreak >= streakThreshold && nextStreak % streakThreshold === 0;
      if (isMilestone) {
        if (soundOnStreak) playStreak(nextStreak);
        setToastStreak(nextStreak);
        if (nextStreak % (streakThreshold * 2) === 0) setShowFireworks(true);
      }
    } else {
      if (soundOnWrong) playWrong();
      setStreak(0); // break the streak
    }
  };

  const goNext = () => { if (idx + 1 < total) setIdx(idx+1); else finish(); };
  const goPrev = () => { if (idx > 0) setIdx(idx-1); };
  const finish = () => {
    const completedAt    = new Date().toISOString();
    const timeTakenSecs  = timer.elapsedSeconds;
    // Stop the timer and send to the Google Sheet
    timer.stop(timeTakenSecs);
    onSave({ completedAt, completionPct: 100, timeTakenSeconds: timeTakenSecs });
    if (rangeFrom && rangeTo) onRangeComplete?.();
    setView('complete');
  };

  // ── INTRO ──
  if (view === 'intro') {
    return (
      <div className="content">
        <button className="lp-back" onClick={onExit}><i className="fa-solid fa-arrow-left" /> {resolvedBackLabel}</button>
        <div className="card lp-hero">
          <div className="lp-hero-icon" style={{background:`${module['Color (Hex)']}22`,color:module['Color (Hex)']}}>
            {module.Emoji || <i className={`fa-solid ${module['Icon (FontAwesome solid)']||'fa-book'}`} />}
          </div>
          <h2>{module.Title}</h2>
          <p>{module.Introduction}</p>
          <div className="lp-actions">
            {isComplete ? (
              <>
                <button className="btn-t" onClick={retake}><i className="fa-solid fa-rotate-right" /> {t('p_retake_topic')}</button>
                <button className="btn-outline" onClick={() => { setAnswers(progress.answers||{}); setView('complete'); }}><i className="fa-solid fa-list-check" /> {t('p_review_my_answers')}</button>
              </>
            ) : attemptedCount > 0 ? (
              <button className="btn-t" onClick={() => begin(attemptedCount)}><i className="fa-solid fa-play" /> {t('p_continue_step', {n: attemptedCount+1, total})}</button>
            ) : (
              <button className="btn-t" onClick={() => begin(0)}><i className="fa-solid fa-play" /> {t('p_start_learning')}</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── COMPLETE ──
  if (view === 'complete') {
    const finalAnswers = Object.keys(answers).length ? answers : (progress?.answers || {});
    const correctCount = Object.values(finalAnswers).filter(a=>a.isCorrect).length;
    const pct = total ? Math.round((correctCount/total)*100) : 0;
    const mistakes = Object.values(finalAnswers).filter(a=>!a.isCorrect);
    const encourage = pct>=90 ? t('p_excellent_star', {subject: module.Subject})
      : pct>=70 ? t('p_great_job')
      : pct>=50 ? t('p_nice_effort')
      : t('p_good_try');
    const conceptGroups = [];
    steps.forEach(s => {
      const label = s['Learning Section'] || null;
      const last = conceptGroups[conceptGroups.length-1];
      if (last && last.label === label) last.items.push(s);
      else conceptGroups.push({ label, items: [s] });
    });
    return (
      <div className="content">
        <button className="lp-back" onClick={onExit}><i className="fa-solid fa-arrow-left" /> {resolvedBackLabel}</button>
        <div className="card">
          <div className="lp-score-ring"><span className="n">{correctCount}/{total}</span><span className="l">{pct}% {t('p_pct_correct')}</span></div>
          <p className="lp-encourage">{encourage}</p>
          {/* Session streak summary */}
          {streak >= 5 && (
            <div style={{
              textAlign:'center',padding:'10px 0 4px',
              fontSize:'13px',color:'var(--teal)',fontWeight:700,
            }}>
              🔥 Best streak this session: {streak} correct in a row!
            </div>
          )}
          <div className="sec-divider">{t('p_concepts_learned')}</div>
          {conceptGroups.map((g,gi) => (
            <div key={gi} style={g.label?{marginBottom:'14px'}:undefined}>
              {g.label && <div className="lp-concept-section-lbl">{g.label}</div>}
              {g.items.map(s => <div key={s['Step Number']} className="lp-concept-item"><i className="fa-solid fa-circle-check" /> {s.Teaching}</div>)}
            </div>
          ))}
          {mistakes.length > 0 ? (
            <>
              <div className="sec-divider">{t('p_review_mistakes')}</div>
              {mistakes.map((m,i) => (
                <div key={i} className="lp-mistake">
                  <div className="lp-mistake-q">{m.question}</div>
                  {m.type === 'matchTheFollowing' ? (
                    <div className="lp-mistake-row">Matched {m.score} of {m.total} correctly</div>
                  ) : (
                    <>
                      <div className="lp-mistake-row">{t('p_your_answer')} <span style={{color:'#f87171',fontWeight:700}}>{m.options[m.selected]}</span></div>
                      <div className="lp-mistake-row">{t('p_correct_answer')} <span style={{color:'#4ade80',fontWeight:700}}>{m.options[m.correctOpt]}</span></div>
                    </>
                  )}
                  <div className="lp-mistake-row">{m.explanation}</div>
                </div>
              ))}
            </>
          ) : <div className="sec-divider">{t('p_perfect_score')}</div>}
          {module['Now You Try'] && (
            <div className="lp-try-card">
              <div className="lp-try-lbl"><i className="fa-solid fa-pen-fancy" /> {t('p_now_you_try')}</div>
              <p>{module['Now You Try']}</p>
            </div>
          )}
          <div className="lp-actions">
            <button className="btn-t" onClick={retake}><i className="fa-solid fa-rotate-right" /> {t('p_retake_topic')}</button>
            <button className="btn-outline" onClick={onExit}><i className="fa-solid fa-arrow-left" /> {resolvedBackLabel}</button>
          </div>
        </div>
      </div>
    );
  }

  // ── LESSON (teach a fact, then ask about it) ──
  const opts = ['A','B','C','D'];
  const answeredCount = Object.keys(answers).length;
  const progressPct = total ? Math.round((answeredCount/total)*100) : 0;
  const useDotNav = total <= 20;

  // Streak indicator pill shown inside the lesson card header
  const streakPill = streak >= 3 ? (
    <div style={{
      display:'inline-flex',alignItems:'center',gap:'5px',
      padding:'3px 11px',borderRadius:'100px',
      background: streak>=10?'rgba(245,166,35,.18)': streak>=8?'rgba(168,85,247,.18)':'rgba(249,115,22,.18)',
      border: `1px solid ${streak>=10?'rgba(245,166,35,.4)':streak>=8?'rgba(168,85,247,.4)':'rgba(249,115,22,.35)'}`,
      color: streak>=10?'#f5a623':streak>=8?'#c084fc':'#f97316',
      fontSize:'12px',fontWeight:800,
    }}>
      🔥 {streak} in a row
    </div>
  ) : null;

  return (
    <>
      {/* Fireworks overlay — fixed, pointer-events:none so it never blocks interaction */}
      <FireworksOverlay active={showFireworks} onDone={()=>setShowFireworks(false)} />

      {/* Streak toast — non-blocking, auto-dismisses */}
      {toastStreak > 0 && (
        <StreakToast streak={toastStreak} onDone={()=>setToastStreak(0)} />
      )}

      {/* ── Full-screen mobile-first question card ── */}
      <div className="lp-fullscreen">
        {/* ── Header bar: back + module title + compact counter + streak pill ── */}
        <div className="lp-fs-header">
          <button className="lp-fs-back" onClick={onExit} aria-label={resolvedBackLabel}>
            <i className="fa-solid fa-arrow-left" />
          </button>
          <div className="lp-fs-title">{step['Learning Section'] || module.Title}</div>
          {/* Issue 1: "2 of 50" counter badge in header, small and unobtrusive */}
          <span className="lp-fs-qcount">{idx+1} / {total}</span>
          {streakPill}
          {/* ── Test timer badge — visible only when enabled + showTimerUI ── */}
          {enableTimer && showTimerUI && (
            <span
              className={`lp-timer-badge${timer.isPaused ? ' paused' : ''}`}
              title={timer.isPaused ? 'Timer paused — no activity for 5 min' : 'Time elapsed on this topic'}
            >
              <i className={`fa-solid ${timer.isPaused ? 'fa-pause' : 'fa-stopwatch'}`}
                 style={{ fontSize: '9px', marginRight: '3px' }} />
              {timer.displayStr}
              {timer.isPaused && (
                <span style={{ marginLeft: '3px', fontSize: '9px', opacity: .65 }}>paused</span>
              )}
            </span>
          )}
        </div>

        {/* ── Slim progress bar flush under header ── */}
        <div className="lp-fs-progress-wrap">
          <div className="lp-bar-outer lp-fs-bar">
            <div className="lp-bar-fill" style={{width:`${progressPct}%`}} />
          </div>
        </div>

        {/* ── Scrollable body: everything between bar and bottom nav ──
            Issue 2/3/4: .lp-fs-inner centers + caps content width on large
            screens and uses the full available height; .lp-fs-question-wrap
            groups the question+options so they can flex to fill any
            leftover vertical space instead of leaving the bottom of the
            screen empty. ── */}
        <div className="lp-fs-body">
        <div className="lp-fs-inner">

        {/* ── Dot nav (always shown; dropdown only when ShowQuestionDropdown=TRUE) ── */}
        <div className="lp-fs-nav-wrap">
          {showQuestionDropdown ? (
            <select className="lp-jump-select" value={idx} onChange={e=>setIdx(Number(e.target.value))}>
              {steps.map((s,i) => {
                const a = answers[i];
                const status = a ? (a.isCorrect ? '✓' : '✗') : '○';
                return <option key={i} value={i}>{status} {t('p_question_of', {n: i+1, total})}</option>;
              })}
            </select>
          ) : useDotNav ? (
            <div className="lp-dots">
              {steps.map((s,i) => {
                const a = answers[i];
                let cls = 'lp-dot';
                if (i === idx) cls += ' current';
                else if (a) cls += a.isCorrect ? ' correct' : ' incorrect';
                return <button key={i} className={cls} onClick={()=>setIdx(i)} aria-label={`Q${i+1}`} />;
              })}
            </div>
          ) : null}
        </div>

        {/* ── Learning Section content box ── */}
        {step['Learning Section Body'] && (
          <div className="lp-fs-learn-sec">
            <div className="lp-fs-learn-sec-hd">
              <i className="fa-solid fa-book-open" />
              <span>Learning Section</span>
            </div>
            <p>{step['Learning Section Body']}</p>
          </div>
        )}

        {/* ── Teaching fact ── */}
        <div className="lp-fs-teach">
          <i className="fa-solid fa-lightbulb lp-fs-teach-icon" />
          <p>{step.Teaching}</p>
        </div>

        {/* ── Step image — optional, shown between Teaching and the question ── */}
        {step['Step Image URL'] && (
          <div className="lp-fs-step-img">
            <img
              src={step['Step Image URL']}
              alt="Question illustration"
              onError={e => { e.currentTarget.parentElement.style.display='none'; }}
            />
          </div>
        )}

        {/* ── Question + Options — wrapped together so this block can grow
            (flex:1) and absorb any leftover vertical space, keeping the
            whole screen filled rather than leaving the bottom blank. ── */}
        <div className="lp-fs-question-wrap">
          <div className="lp-fs-question">{step.Question}</div>

          {isMatchStep(step) ? (
            <>
              {currentAnswer?.rebuiltFromHistory ? (
                // This question was answered in a previous session and its
                // summary was rebuilt from the sheet, not from localStorage —
                // the sheet only ever logs a score for matchTheFollowing
                // (e.g. "4/5 matched"), never the actual word→meaning
                // placements. Rendering the interactive component with an
                // empty placements object would make every pair look wrong;
                // showing the honest score instead avoids that false "series
                // of errors" appearance.
                <div className="lp-fs-history-note" style={{
                  padding:'14px 16px', borderRadius:'10px', border:'1.5px solid var(--border)',
                  background:'rgba(255,255,255,.03)', display:'flex', alignItems:'center', gap:'10px',
                }}>
                  <i className="fa-solid fa-clock-rotate-left" />
                  <span>Already answered previously — {currentAnswer.score}/{currentAnswer.total} matched correctly. (Answered elsewhere, so the exact matches aren't shown here.)</span>
                </div>
              ) : (
                <MatchTheFollowing
                  key={`${step['Module ID']}-${idx}-${step['Step Number']}`}
                  pairs={pairsFromStep(step)}
                  explanation={step.Explanation}
                  onSubmit={submitMatchTheFollowing}
                  initialPlacements={currentAnswer?.placements}
                  initialLocked={locked}
                />
              )}
              {locked && (
                <div className={`lp-fs-feedback ${currentAnswer.isCorrect ? 'good' : 'bad'}`}>
                  <i className={`fa-solid ${currentAnswer.isCorrect ? 'fa-circle-check' : 'fa-circle-xmark'} lp-fs-fb-icon`} />
                  <div>
                    <strong>{currentAnswer.isCorrect ? t('p_correct_excl') : t('p_not_quite')}</strong>
                    <span> {step.Explanation}</span>
                    {step['Learn More URL'] && (
                      <div style={{marginTop:'8px'}}>
                        <a className="lp-learnmore" href={step['Learn More URL']} target="_blank" rel="noopener noreferrer">
                          <i className="fa-solid fa-book-open" /> {step['Learn More Label'] || t('p_learn_more')} <i className="fa-solid fa-arrow-up-right-from-square" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* isAnswerCorrect prefers the stored isCorrect flag (always
                  reliable — it's set from step['Correct Option'] at answer
                  time for a live session, or from the sheet's Status column
                  for a rebuilt one) over comparing `selected` to the correct
                  letter. That letter-comparison used to be the only check,
                  which silently broke for rebuilt history rows: the sheet
                  only stores the option's display TEXT ("The Sun"), never
                  the A/B/C/D letter, so `selected === step['Correct Option']`
                  was always false there — showing "Not quite" on questions
                  the student actually got right. */}
              {(() => {
                const isAnswerCorrect = currentAnswer ? (currentAnswer.isCorrect ?? (selected === step['Correct Option'])) : false;
                return (
                  <>
                    <div className="lp-fs-opts">
                      {opts.map(letter => {
                        const text = step[`Option ${letter}`];
                        if (!text) return null;
                        let cls = 'lp-fs-opt';
                        if (locked && letter === step['Correct Option']) cls += ' correct';
                        else if (locked && !isAnswerCorrect && (letter === selected || text === selected)) cls += ' incorrect';
                        return (
                          <button key={letter} className={cls} disabled={locked} onClick={()=>choose(letter)}>
                            <span className="lp-fs-letter">{letter}</span>
                            <span className="lp-fs-opt-text">{text}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* ── Feedback panel (shown after answering) ── */}
                    {locked && (
                      <div className={`lp-fs-feedback ${isAnswerCorrect?'good':'bad'}`}>
                        <i className={`fa-solid ${isAnswerCorrect?'fa-circle-check':'fa-circle-xmark'} lp-fs-fb-icon`} />
                        <div>
                          <strong>{isAnswerCorrect?t('p_correct_excl'):t('p_not_quite')}</strong>
                          <span> {step.Explanation}</span>
                          {step['Learn More URL'] && (
                            <div style={{marginTop:'8px'}}>
                              <a className="lp-learnmore" href={step['Learn More URL']} target="_blank" rel="noopener noreferrer">
                                <i className="fa-solid fa-book-open" /> {step['Learn More Label'] || t('p_learn_more')} <i className="fa-solid fa-arrow-up-right-from-square" />
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </div>

        {/* ── end lp-fs-inner / lp-fs-body ── */}
        </div>
        </div>

        {/* ── Nav row: Previous | Next / Finish — sticky at bottom, outside scroll ── */}
        <div className="lp-nav-row lp-fs-nav-row" style={{flexShrink:0,borderTop:'1px solid var(--border)',background:'var(--navy)'}}>
          <button className="btn-outline" onClick={goPrev} disabled={idx===0} style={idx===0?{opacity:.35,cursor:'not-allowed'}:{}}>
            <i className="fa-solid fa-arrow-left" /> {t('p_previous')}
          </button>
          {answeredCount >= total ? (
            <button className="btn-t" onClick={finish}>
              {t('p_finish_topic')} <i className="fa-solid fa-flag-checkered" />
            </button>
          ) : (
            <button className="btn-t" onClick={goNext} disabled={!locked} style={!locked?{opacity:.35,cursor:'not-allowed'}:{}}>
              {idx+1<total
                ? <>{t('p_next_question')} <i className="fa-solid fa-arrow-right" /></>
                : <>{t('p_answer_to_continue')} <i className="fa-solid fa-arrow-right" /></>}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CompletedTopicsTab — lists every module the student has finished, showing
// the date completed, time taken (from timeTakenSeconds in learnProgress), and
// their correct/attempted score. Sorted most-recently-completed first.
// ─────────────────────────────────────────────────────────────────────────────
// CompletedTopicsTab
//
// Shows every module the student has fully completed. Each card shows:
//   • Date completed  • Time taken  • Score
//   • "New questions added" badge when the sheet has grown since completion
//   • Retake button — resets progress, moves topic back to Question Bank,
//     and jumps straight into it
//
// Topic lifecycle:
//   finish quiz  → completedAt set  → disappears from Question Bank
//                                   → appears here
//   Retake click → completedAt cleared → reappears in Question Bank
//                                      → disappears from here
//   Teacher adds new steps → topic reappears in Question Bank automatically
//                          → "new questions" badge shown here until retaken
// ─────────────────────────────────────────────────────────────────────────────
// CompletedTopicsTab
//
// Shows every module the student has fully completed, ORGANIZED BY SUBJECT
// (Issue 3 — "Sorted by Subject and the Topics should be underneath the
// respective subject"). Each subject becomes a collapsible group header
// (reusing the same color/icon/emoji styling as the Question Bank's subject
// cards), with its completed topics listed underneath, most-recently
// completed first. Each topic card shows:
//   • Date completed  • Total time taken to finish the topic (Issue 2)
//   • Score  • "New questions added" badge when the sheet has grown since
//     completion  • Retake button — resets progress, moves the topic back
//     to the Question Bank, and jumps straight into it
//
// Topic lifecycle:
//   finish quiz  → completedAt set  → disappears from Question Bank
//                                   → appears here, under its subject
//   Retake click → completedAt cleared → reappears in Question Bank
//                                      → disappears from here
//   Teacher adds new steps → topic reappears in Question Bank automatically
//                          → "new questions" badge shown here until retaken
// ─────────────────────────────────────────────────────────────────────────────
function CompletedTopicsTab({ learnProgress, learningModules, subjects, stepsFor, saveLearnProgress, onRetake }) {
  const rows = useMemo(() => {
    return learningModules
      .filter(m => !!learnProgress[m['Module ID']]?.completedAt)
      .map(m => {
        const id        = m['Module ID'];
        const p         = learnProgress[id];
        const secs      = Number(p.timeTakenSeconds) || 0;
        const correct   = p.correct   || 0;
        const attempted = p.attempted || 0;
        const h   = Math.floor(secs / 3600);
        const min = Math.floor((secs % 3600) / 60);
        const sec = secs % 60;
        const timeStr = secs === 0
          ? '—'
          : h > 0
            ? `${h}h ${String(min).padStart(2,'0')}m ${String(sec).padStart(2,'0')}s`
            : `${String(min).padStart(2,'0')}m ${String(sec).padStart(2,'0')}s`;
        const totalSteps    = stepsFor ? stepsFor(id).length : 0;
        const answeredSteps = Object.keys(p.answers || {}).length;
        const hasNewQ       = totalSteps > answeredSteps;
        return {
          moduleId:    id,
          title:       m.Title || id,
          subject:     m.Subject || m.SubjectEN || 'Other',
          completedAt: p.completedAt,
          dateStr:     new Date(p.completedAt).toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' }),
          timeStr,
          scoreStr:    attempted > 0 ? `${correct}/${attempted}` : null,
          hasNewQ,
          newQCount:   hasNewQ ? totalSteps - answeredSteps : 0,
        };
      })
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  }, [learnProgress, learningModules, stepsFor]);

  // ── Group rows by Subject (Issue 3) ───────────────────────────────────────
  // Groups are ordered to match the subject order from the Question Bank
  // (the `subjects` list, when supplied) so the two tabs feel consistent;
  // any subject present in rows but missing from `subjects` (edge case —
  // e.g. a subject later renamed/removed from the sheet) is appended at the
  // end rather than silently dropped.
  const groups = useMemo(() => {
    const bySubject = {};
    rows.forEach(row => {
      if (!bySubject[row.subject]) bySubject[row.subject] = [];
      bySubject[row.subject].push(row);
    });

    const orderedNames = [];
    (subjects || []).forEach(s => { if (bySubject[s.Subject]) orderedNames.push(s.Subject); });
    Object.keys(bySubject).forEach(name => { if (!orderedNames.includes(name)) orderedNames.push(name); });

    return orderedNames.map(name => {
      const meta = (subjects || []).find(s => s.Subject === name) || {};
      return {
        subject: name,
        color:   meta['Color (Hex)'] || '#00c6a7',
        icon:    meta['Icon (FontAwesome solid)'] || 'fa-book',
        emoji:   meta.Emoji || '',
        topics:  bySubject[name],
      };
    });
  }, [rows, subjects]);

  const handleRetake = (row) => {
    // Clear completedAt so the topic leaves Completed Topics and re-enters
    // the Question Bank, then navigate straight into the quiz.
    saveLearnProgress(row.moduleId, {
      startedAt:        new Date().toISOString(),
      completedAt:      null,
      attempted:        0,
      correct:          0,
      incorrect:        0,
      completionPct:    0,
      timeTakenSeconds: 0,
      answers:          {},
    });
    onRetake(row.moduleId, row.subject);
  };

  if (rows.length === 0) {
    return (
      <div className="content">
        <div className="card ct-empty">
          <i className="fa-solid fa-circle-check" />
          <div style={{ fontFamily:'var(--fqh)', fontWeight:800, fontSize:'15px', marginBottom:'6px', color:'rgba(255,255,255,.6)' }}>
            No completed topics yet
          </div>
          <div style={{ fontSize:'12.5px' }}>
            Topics you finish will appear here, grouped by subject, with the date and total time taken.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      {groups.map(group => (
        <div key={group.subject} className="card ct-group">
          {/* ── Subject group header — same visual language as the Question
              Bank's subject cards (icon/emoji + color) so students recognise
              it as the same subject. ── */}
          <div className="ct-group-hd" style={{ borderColor: group.color+'44' }}>
            <div className="ct-group-icon" style={{ background:`${group.color}18`, color:group.color }}>
              {group.emoji || <i className={`fa-solid ${group.icon}`} />}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div className="ct-group-name">{group.subject}</div>
              <div className="ct-group-count">{group.topics.length} topic{group.topics.length !== 1 ? 's' : ''} completed</div>
            </div>
          </div>

          {group.topics.map(row => (
            <div key={row.moduleId} className="ct-card">
              <div className="ct-icon"><i className="fa-solid fa-book-open-reader" /></div>
              <div className="ct-body">
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'10px', flexWrap:'wrap' }}>
                  <div style={{ minWidth:0, flex:1 }}>
                    <div className="ct-title">{row.title}</div>
                    <div className="ct-meta">
                      <span className="ct-pill date">
                        <i className="fa-solid fa-calendar-check" style={{ fontSize:'9px' }} />
                        {row.dateStr}
                      </span>
                      <span className="ct-pill time">
                        <i className="fa-solid fa-stopwatch" style={{ fontSize:'9px' }} />
                        {row.timeStr}
                      </span>
                      {row.scoreStr && (
                        <span className="ct-pill score">
                          <i className="fa-solid fa-star" style={{ fontSize:'9px' }} />
                          {row.scoreStr} correct
                        </span>
                      )}
                      {row.hasNewQ && (
                        <span className="ct-pill newq">
                          <i className="fa-solid fa-bolt" style={{ fontSize:'9px' }} />
                          {row.newQCount} new question{row.newQCount !== 1 ? 's' : ''} added
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    className="btn-outline ct-retake-btn"
                    onClick={() => handleRetake(row)}
                    title="Reset your progress and retake this topic from the beginning"
                  >
                    <i className="fa-solid fa-rotate-right" /> Retake
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
function PortalInner() {
  const { lang, t } = useLanguage();
  // The live Google Sheets behind /api/portal-config (Mathematics, Science,
  // English Grammar, Social Studies, General Knowledge, AI question banks)
  // are English-only content maintained by teachers — there is no Danish
  // column in those sheets today. So, mirroring the landing page's approach:
  //  - English: fetch and prefer live Sheet data, exactly as before.
  //  - Danish: use the hand-translated QUIZ_LEARNING_MODULES_DA /
  //    QUIZ_LEARNING_STEPS_DA dataset (see lib/quizContentDA.js) for
  //    learningModules/learningSteps, and skip the Sheet fetch override for
  //    those two keys so Danish text is never silently replaced by English
  //    Sheet content. Everything else fetched from the Sheet (assignment
  //    subjects list, dashboard stats, attendance, etc.) still uses
  //    FALLBACK / live data in English, since translating those config rows
  //    is a separate, smaller task (mostly subject names) — see
  //    translateSubjectName() below, used wherever a bare subject name is
  //    rendered in the UI.
  //
  // Note: 'English Grammar' subject's modules/steps are intentionally NOT
  // translated even within QUIZ_LEARNING_MODULES_DA/STEPS_DA — see the
  // comment at the top of lib/quizContentDA.js for why.
  const danishFallback = {
    ...FALLBACK,
    settings: { ...FALLBACK.settings, ...PORTAL_SETTINGS_DA },
    navigation: PORTAL_NAVIGATION_DA,
    dashStats: PORTAL_DASH_STATS_DA,
    subjects: PORTAL_SUBJECTS_DEMO_DA,
    attStats: PORTAL_ATT_STATS_DA,
    attMonthly: PORTAL_ATT_MONTHLY_DA,
    assignments: PORTAL_ASSIGNMENTS_DEMO_DA,
    schedule: PORTAL_SCHEDULE_DEMO_DA,
    notifications: PORTAL_NOTIFICATIONS_DA,
    profileFields: PORTAL_PROFILE_FIELDS_DA,
    learningModules: QUIZ_LEARNING_MODULES_DA,
    learningSteps: QUIZ_LEARNING_STEPS_DA,
    assignmentSubjects: QUIZ_ASSIGNMENT_SUBJECTS_DA,
  };
  const baseFallback = lang === 'da' ? danishFallback : FALLBACK;
  const [cfg,         setCfg]         = useState(baseFallback);
  const [cfgReady,    setCfgReady]    = useState(false);
  const [authed,      setAuthed]      = useState(false);
  const [tab,         setTab]         = useState('dashboard');
  // Profile starts empty — filled from localStorage in the useEffect below
  // (can't read localStorage in useState initialiser because Next.js runs it
  // server-side where window doesn't exist, so the read is always skipped).
  const [profile, setProfile] = useState({ name: '', id: '', classLevel: 'Class 3' });
  const chatRef = useRef(null);
  const [chatUnread, setChatUnread] = useState(0);
  const [loginErr,    setLoginErr]    = useState('');
  const [loading,     setLoading]     = useState(false);
  const [uploadName,  setUploadName]  = useState('');
  const [uploadDone,  setUploadDone]  = useState(false);
  const [profileEdit, setProfileEdit] = useState(false);
  const [saving,      setSaving]      = useState(null); // 'profile' | 'password' | null
  const [mobileNavOpen,  setMobileNavOpen]  = useState(false);
  // ── Quiz mode sidebar: collapses when a question is active; float button
  // re-opens it temporarily. sidebarPeeking controls the peek-open state.
  const [sidebarPeeking, setSidebarPeeking] = useState(false);
  // ── Announcement strip: fetched from a Google Doc URL stored in the
  // master sheet under key "AnnouncementDocUrl" (Settings tab).
  // Non-critical — if unavailable the strip simply stays hidden.
  const [announcementText, setAnnouncementText] = useState('');
  const [notifs,      setNotifs]      = useState(FALLBACK.notifications.filter(n=>isRowActive(n.Active)));
  const [activeModuleId, setActiveModuleId] = useState(null);
  const [activeAssignmentSubject, setActiveAssignmentSubject] = useState(null);
  const [shareCopied, setShareCopied] = useState(false); // "Copied!" flash on the quiz share button
  // ── ASSIGNMENTS FOR YOU — chapter-specific homework a parent/teacher
  // assigned from the Parent Portal builder table. Kept entirely separate
  // from activeModuleId/activeAssignmentSubject (the open Question Bank
  // flow above) so switching tabs never clobbers either flow's state.
  const [myAssignments,        setMyAssignments]        = useState([]);
  const [myAssignmentsLoading, setMyAssignmentsLoading]  = useState(false);
  const [activeMyAssignmentId, setActiveMyAssignmentId]  = useState(null); // AssignmentID being attempted
  // Count of chapters assigned to this student that aren't marked Completed
  // yet — drives the red "Assignments for you" nav badge, same pattern as
  // the chat unread badge.
  const pendingMyAssignments = useMemo(
    () => myAssignments.filter(a => a.Status !== 'Completed').length,
    [myAssignments]
  );
  const [expandedSubject, setExpandedSubject] = useState(null); // age-group expandable card
  // classFilter: null = "my class only"; 'all' = every class; Set of class strings = selected classes
  // Initialised to null so the dashboard always opens showing only the student's own class.
  const [classFilter, setClassFilter] = useState(null); // null | 'all' | Set<string>
  const [learnProgress,  setLearnProgress]  = useState({});
  const [leaderboard,    setLeaderboard]    = useState({ overall:[], bySubject:{} });
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  // Weighted leaderboard — same shape as `leaderboard`, but scoped to only
  // the questions a student was assigned via "Assignments for you", ranked
  // by accuracy % instead of raw attempted count. See
  // /api/student/weighted-leaderboard for the full rules.
  const [weightedLeaderboard,        setWeightedLeaderboard]        = useState({ overall:[], bySubject:{} });
  const [weightedLeaderboardLoading, setWeightedLeaderboardLoading] = useState(false);
  // Time-window filter for the leaderboard: 0 = all time, 7 = last 7 days, etc.
  const [lbDays, setLbDays] = useState(30); // default: last 30 days
  // Daily questions-attempted board — derived locally from learnProgress
  // (no extra API call needed: every module's attempted count + startedAt is
  // already in localStorage and synced from the Sheet on login).
  // Populated once per session from /api/student/leaderboard which already
  // returns per-student data; we also build a local "today" count from
  // learnProgress for the current student so it's always up-to-date.
  // Real per-student data fetched post-login. null = loading/not-yet-fetched.
  // Falls back to cfg FALLBACK gracefully if the API is unreachable.
  const [realSubjects,    setRealSubjects]    = useState(null);
  const [realAssignments, setRealAssignments] = useState(null);
  const [realAttendance,  setRealAttendance]  = useState(null);
  // ── Cross-class preview data ────────────────────────────────────────────
  // The Assignments tab's "select another class" pills need access to
  // OTHER classes' subjects/topics, but `cfg` only ever holds the student's
  // OWN class (portal-config.js pre-filters server-side by profile.classLevel
  // for performance). When a pill is selected we lazily fetch the full,
  // unfiltered dataset (classLevel omitted = every class) ONCE and cache it
  // here — the server itself caches that same unfiltered response for 60s,
  // so this is cheap even across many students previewing other classes.
  const [crossClassCfg,     setCrossClassCfg]     = useState(null);
  const [crossClassLoading, setCrossClassLoading] = useState(false);

  const subjectRef = useRef(null);
  const attendRef  = useRef(null);
  const ratioRef   = useRef(null);

  // Whenever the language changes, immediately reset cfg to that language's
  // base fallback so the UI never shows a mix of English Sheet quiz content
  // and Danish static text (or vice versa) while a fetch is in flight, and
  // re-run the fetch below so non-quiz config (subjects list, schedule,
  // etc.) still gets refreshed from the Sheet.
  useEffect(() => {
    setCfg(lang === 'da' ? danishFallback : FALLBACK);
  }, [lang]);

  // ── Announcement strip: fetch directly on mount from the known doc URL so
  // the ticker is always visible, even when the portal-config fetch is slow
  // or the Config tab isn't populated yet. The main config useEffect below
  // may also update announcementText if it resolves a URL from the sheet —
  // last write wins, which is intentional (sheet URL takes priority).
  useEffect(() => {
    let cancelled = false;
    const ANNOUNCEMENT_DOC_URL = 'https://docs.google.com/document/d/1HI17xm-7X43RoLC0rigDhUZKu1zwzhQF98wolnxcclU/edit?tab=t.0';
    const exportUrl = ANNOUNCEMENT_DOC_URL.replace(/\/edit.*$/, '/export?format=txt');
    fetch(`/api/proxy-doc?url=${encodeURIComponent(exportUrl)}`)
      .then(r => r.text())
      .then(txt => {
        if (cancelled) return;
        const text = txt.split('\n').map(l => l.trim()).filter(Boolean).join('  ·  ');
        if (text) setAnnouncementText(text);
      })
      .catch(() => {/* non-critical */});
    return () => { cancelled = true; };
  }, []); // only on mount — URL is fixed in the master config

  // ── Fetch from Google Sheets on mount / language change / classLevel change ──
  useEffect(() => {
    const requestLang = lang; // capture the language this fetch was started for
    let cancelled = false;
    // Pass the student's classLevel so the API pre-filters content.
    // profile.classLevel is '' until login (or localStorage restore), which
    // causes the API to return everything — that's fine because the onboarding
    // gate below already blocks the Assignments tab until a class is set.
    fetchAllSheetData(profile.classLevel)
      .then(data => {
        // Guard against a race: if the user switched language again while
        // this fetch was in flight, a stale response for the OLD language
        // must never overwrite the cfg that's already correct for the
        // CURRENT language. The effect's own cleanup (below) sets
        // `cancelled` for exactly this case.
        if (cancelled) return;
        // Validate that the response is at least a plain object before applying it.
        // NOTE: portal-config.js currently only returns assignment-related keys
        // (assignmentSubjects / learningModules / learningSteps) — it does NOT
        // return settings/navigation/etc. yet, so we must NOT require `.settings`
        // here. Each key below already falls back to FALLBACK individually if
        // missing, so a partial payload is expected and fine.
        if (!data || typeof data !== 'object') {
          console.warn('[portal] Unexpected data shape from portal-config, using fallback');
          setCfgReady(true);
          return;
        }
        // Merge with the language-appropriate fallback so any missing keys
        // are still populated. learningModules/learningSteps are sourced
        // from the live (English-only) Sheet ONLY in English — in Danish we
        // always keep the hand-translated QUIZ_LEARNING_MODULES_DA/STEPS_DA,
        // never overwritten by the Sheet fetch.
        const base = requestLang === 'da' ? danishFallback : FALLBACK;
        const merged = {
          settings:      { ...base.settings,      ...(data.settings      || {}) },
          navigation:    data.navigation?.length      ? data.navigation      : base.navigation,
          dashStats:     data.dashStats?.length       ? data.dashStats       : base.dashStats,
          subjects:      data.subjects?.length        ? data.subjects        : base.subjects,
          attStats:      data.attStats?.length        ? data.attStats        : base.attStats,
          attMonthly:    data.attMonthly?.length      ? data.attMonthly      : base.attMonthly,
          assignments:   data.assignments?.length     ? data.assignments     : base.assignments,
          schedule:      data.schedule?.length        ? data.schedule        : base.schedule,
          notifications: data.notifications?.length   ? data.notifications   : base.notifications,
          profileFields: data.profileFields?.length   ? data.profileFields   : base.profileFields,
          classLevels:   data.classLevels?.length     ? data.classLevels     : base.classLevels,
          assignmentSubjects: requestLang === 'da'
            ? danishFallback.assignmentSubjects
            : (data.assignmentSubjects?.length ? data.assignmentSubjects : base.assignmentSubjects),
          learningModules: requestLang === 'da'
            ? danishFallback.learningModules
            : (data.learningModules?.length ? data.learningModules : base.learningModules),
          learningSteps: requestLang === 'da'
            ? danishFallback.learningSteps
            : (data.learningSteps?.length   ? data.learningSteps   : base.learningSteps),
          // Config tab key-value object — passed straight through; no fallback
          // needed (missing keys just return undefined, callers guard with ||'')
          config: data.config || {},
        };
        setCfg(merged);
        setNotifs(merged.notifications.filter(n=>isRowActive(n.Active)));
        // IMPORTANT: never overwrite classLevel here. It comes from two
        // authoritative sources: (1) the auth API response (login), and
        // (2) localStorage (restored on mount). The profileFields config
        // only has a generic 'Class 3' placeholder. The only time we
        // should touch classLevel from config is if neither source has
        // ever provided a real value — i.e. a completely fresh first visit
        // where localStorage is empty AND the student hasn't logged in yet.
        setProfile(p => {
          if (p.id) return p; // logged in — classLevel came from auth, never overwrite
          const cl = merged.profileFields.find(f => f['Field Key'] === 'class_level');
          return { ...p, classLevel: cl?.Value || '' };
        });
        // ── Announcement strip: read Google Doc URL from the Config tab.
        // data.config is the parsed { Key: Value } object from the master
        // sheet's "Config" tab — completely separate from subject/class rows.
        const docUrl = (data.config || {})['AnnouncementDocUrl'] || '';
        if (docUrl && !cancelled) {
          const exportUrl = docUrl.replace(/\/edit.*$/, '/export?format=txt');
          fetch(`/api/proxy-doc?url=${encodeURIComponent(exportUrl)}`)
            .then(r => r.text())
            .then(txt => {
              if (cancelled) return;
              const text = txt.split('\n').map(l => l.trim()).filter(Boolean).join('  ·  ');
              setAnnouncementText(text);
            })
            .catch(() => {/* non-critical */});
        }
        setCfgReady(true);
      })
      .catch(err => {
        if (cancelled) return;
        console.warn('[portal] Sheet fetch failed, using fallback:', err.message);
        setCfgReady(true); // still show portal with fallback data
      });
    return () => { cancelled = true; };
  }, [lang, profile.classLevel]);

  // ── Fetch the cross-class dataset on demand ─────────────────────────────
  // Runs only once classFilter becomes truthy ('all' or a Set of classes),
  // i.e. the moment the student picks another class pill. Cached in
  // crossClassCfg so toggling pills back and forth doesn't refetch.
  // Sheet quiz content is English-only (see the Danish-fallback note in the
  // main fetch above), so this preview is skipped entirely in Danish — the
  // class pills aren't meaningful there since LMOD is always the static
  // hand-translated set regardless of class.
  useEffect(() => {
    if (!classFilter) return;
    if (lang === 'da') return;
    if (crossClassCfg) return; // already loaded
    let cancelled = false;
    setCrossClassLoading(true);
    fetchAllSheetData('') // no classLevel param = full, unfiltered dataset
      .then(data => {
        if (cancelled) return;
        if (data && typeof data === 'object') setCrossClassCfg(data);
      })
      .catch(err => console.warn('[portal] Cross-class fetch failed:', err.message))
      .finally(() => { if (!cancelled) setCrossClassLoading(false); });
    return () => { cancelled = true; };
  }, [classFilter, lang, crossClassCfg]);

  // Reset the cross-class cache when language changes, since it's only ever
  // populated in English and would otherwise leak stale English data into
  // a Danish session if the user previewed a class, then switched language.
  useEffect(() => { setCrossClassCfg(null); }, [lang]);

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const S          = cfg.settings;
  const NAV        = cfg.navigation.filter(t => isRowActive(t.Active));
  // AMON / ASTAT: prefer real attendance API data when available, fall back to demo config.
  const realAtt   = realAttendance;
  const AMON       = realAtt
    ? (realAtt.records || []).reduce((acc, rec) => {
        const monthKey = (rec.Date || '').slice(0, 7); // YYYY-MM
        if (!monthKey) return acc;
        if (!acc.find(m => m._key === monthKey)) {
          const d = new Date(monthKey + '-01');
          acc.push({ _key: monthKey,
            Month: d.toLocaleString('en-IN', {month:'long'}),
            'Month Short': d.toLocaleString('en-IN', {month:'short'}),
            'Attendance %': 0, _total: 0, _present: 0, 'Display Order': acc.length + 1 });
        }
        const entry = acc.find(m => m._key === monthKey);
        entry._total++;
        const v = String(rec.Present || '').trim().toUpperCase();
        if (v === 'TRUE' || v === 'YES' || v === '1') entry._present++;
        entry['Attendance %'] = Math.round((entry._present / entry._total) * 100);
        return acc;
      }, []).slice(-6) // last 6 months
    : cfg.attMonthly;

  const ASTAT      = realAtt?.summary
    ? [
        { Metric:'classes_conducted', Value: String(realAtt.summary.total   || 0), Label:'Classes Conducted', 'Display Order':1 },
        { Metric:'classes_attended',  Value: String(realAtt.summary.attended || 0), Label:'Classes Attended',  'Display Order':2 },
        { Metric:'attendance_rate',   Value: `${realAtt.summary.rate || 0}%`,        Label:'Attendance Rate',  'Display Order':3 },
      ]
    : cfg.attStats;

  const SCHED      = cfg.schedule.filter(s => isRowActive(s.Active));
  const PFIELDS    = cfg.profileFields;
  const LMOD    = (cfg.learningModules||[]).filter(m=>isRowActive(m.Active)).sort((a,b)=>(Number(a['Display Order'])||0)-(Number(b['Display Order'])||0));

  // ── SHEET-DRIVEN CURRICULUM SYSTEM ──────────────────────────────────────────
  //
  // Subjects and topics now come entirely from the Google Sheet via
  // portal-config.js (which already filters by classLevel server-side).
  // AGE_CURRICULUM has been removed — no more hardcoded subject/topic lists,
  // no more code deploys needed to add subjects or update taglines.
  //
  // classLevelIsSet: true once the student has a recognised class set.
  // CLASS_LEVELS is the sheet-driven list of all class levels (Class 0-10 +
  // Adult, by default) returned from portal-config.js as cfg.classLevels.
  // Deduplicate by Class name — the master sheet may have the same class on
  // multiple rows (one per subject), so we keep only the first occurrence
  // per class name after sorting by Display Order.
  const CLASS_LEVELS = (() => {
    const seen = new Set();
    return (cfg.classLevels || [])
      .filter(c => isRowActive(c.Active))
      .sort((a,b) => (Number(a['Display Order'])||999) - (Number(b['Display Order'])||999))
      .filter(c => { const k = (c.Class||'').trim(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  })();
  const KNOWN_CLASSES = CLASS_LEVELS.map(c => c.Class);
  const classLevelIsSet = KNOWN_CLASSES.includes(profile.classLevel);

  // Age group label (display only — used in the filter pill header)
  const CLASS_TO_AGE_LABEL = Object.fromEntries(CLASS_LEVELS.map(c => [c.Class, c.Age]));

  const studentAgeGroup = CLASS_TO_AGE_LABEL[profile.classLevel] || null;

  // classFilter state controls an *additional* client-side cross-class preview
  // (Assignments tab only — Dashboard/SUBJ/resumeTarget below always use the
  // student's OWN class via LMOD/ASGN_SUBJ, regardless of this filter):
  //   null      → default: show only current-class subjects (LMOD/ASGN_SUBJ)
  //   'all'     → show every class's subjects/topics merged together
  //   Set<str>  → show subjects/topics for exactly these classes (own class
  //               is always included in the Set by the pill click-handler)
  //
  // ASGN_SUBJ: subject cards from the sheet, own class only (already
  // class-filtered server-side). Used by the Dashboard tab and anywhere else
  // that must stay locked to the student's own class.
  const ASGN_SUBJ = (cfg.assignmentSubjects||[])
    .filter(s => isRowActive(s.Active))
    .sort((a,b) => (Number(a['Display Order'])||0) - (Number(b['Display Order'])||0));

  // ALL_CLASSES: display order for the class filter pills (sheet-driven).
  const ALL_CLASSES = CLASS_LEVELS.map(c => c.Class);

  // ── Cross-class preview resolution (Assignments tab "select another class") ──
  // previewClasses: the exact Set of classes to show, or null for "no
  // restriction" (the 'all' pill). crossClassActive is true whenever the
  // pills want something other than just the student's own class.
  const crossClassActive = classFilter === 'all' || classFilter instanceof Set;
  const previewClasses   = classFilter instanceof Set ? classFilter : null;

  // While crossClassCfg hasn't finished loading yet, fall back to the
  // own-class data so the screen doesn't flash empty — it'll update the
  // moment the fetch resolves.
  const crossSourceModules  = crossClassCfg?.learningModules    || cfg.learningModules;
  const crossSourceSubjects = crossClassCfg?.assignmentSubjects || cfg.assignmentSubjects;

  // classRowVisible: true if a Sheet row's Class column should be shown
  // under the CURRENT pill selection. Blank Class = visible to all classes
  // (same convention as the server-side classMatches() in portal-config.js).
  const classRowVisible = rowClass => {
    if (!crossClassActive) return true; // default view already own-class only
    if (!previewClasses) return true;   // 'all' pill — no restriction
    const rc = (rowClass || '').trim();
    if (!rc) return true;
    return previewClasses.has(rc);
  };

  // ASSIGN_LMOD: the module list actually used by the Assignments tab (topic
  // grids, module player, progress summary). Equals LMOD by default; once a
  // class-preview pill is active, it's built from the unfiltered cross-class
  // dataset and narrowed to the selected classes.
  const ASSIGN_LMOD = crossClassActive
    ? (crossSourceModules||[]).filter(m => isRowActive(m.Active) && classRowVisible(m.Class))
        .sort((a,b)=>(Number(a['Display Order'])||0)-(Number(b['Display Order'])||0))
    : LMOD;

  // stepsFor: quiz steps for a module. Falls back to the cross-class step
  // list when previewing another class, so a topic borrowed from "Class 9"
  // still has its quiz steps available even though cfg.learningSteps only
  // ever holds the student's own class.
  const stepsForSource = crossClassActive ? (crossClassCfg?.learningSteps || cfg.learningSteps) : cfg.learningSteps;
  const stepsFor = moduleId => (stepsForSource||[])
    .filter(s => isRowActive(s.Active) && s['Module ID']===moduleId)
    .sort((a,b)=>(Number(a['Step Number'])||0)-(Number(b['Step Number'])||0));

  // ASSIGN_SUBJ: subject cards for the Assignments tab. By default this is
  // just ASGN_SUBJ. In preview mode, rebuild it from the unfiltered subject
  // list, keeping only subjects that actually have at least one visible
  // topic under the current selection — so a subject only offered to Class 9
  // doesn't show an empty card while previewing Class 3, and vice versa.
  //
  // Fix for issues 4 & 5 (duplicate subjects / forced Class 1):
  // Previously the Map deduped by subject name but picked the first row it
  // found regardless of class — so Mathematics from Class 1 would appear
  // even when the student selected Class 5. Now we additionally require that
  // the subject row's Class column matches one of the selected classes before
  // treating it as the representative row for that subject.
  const ASSIGN_SUBJ = crossClassActive
    ? (() => {
        const visibleNames = new Set(ASSIGN_LMOD.map(m => m.Subject));
        const seen = new Map();
        // Sort so own-class rows are preferred over other classes when the same
        // subject exists across multiple classes (e.g. Mathematics in every class).
        const subjectPool = [...(crossSourceSubjects||[])].sort((a,b) => {
          const aOwn = a.Class === profile.classLevel ? 0 : 1;
          const bOwn = b.Class === profile.classLevel ? 0 : 1;
          return aOwn - bOwn;
        });
        subjectPool
          .filter(s =>
            isRowActive(s.Active) &&
            visibleNames.has(s.Subject) &&
            // Only include if this subject row's class is in the selected set,
            // OR if the subject row has no Class column (global subject).
            (!s.Class || !previewClasses || previewClasses.has(s.Class))
          )
          .forEach(s => { if (!seen.has(s.Subject)) seen.set(s.Subject, s); });
        return [...seen.values()].sort((a,b) => (Number(a['Display Order'])||0) - (Number(b['Display Order'])||0));
      })()
    : ASGN_SUBJ;

  // ── topicsForSubjectKey: match modules by Subject name (exact, no fuzzy
  // match), scoped to ASSIGN_LMOD so it automatically respects the current
  // class-preview selection. ──────────────────────────────────────────────
  const topicsForSubjectKey = subjectName =>
    ASSIGN_LMOD.filter(m => {
      if (m.Subject !== subjectName) return false;
      const id  = m['Module ID'];
      const p   = learnProgress[id];
      if (!p?.completedAt) return true;               // not yet completed → show
      const totalSteps    = stepsFor(id).length;
      const answeredSteps = Object.keys(p.answers || {}).length;
      return totalSteps > answeredSteps;              // new questions added → reappear
    });

  // ── Subtopics from sheet (optional Subtopics column, comma-separated) ────────
  // Renders the pill row inside the subject card. Falls back to an empty array
  // if the column isn't present yet (non-breaking during migration).
  const subtopicsFor = module => {
    const raw = module['Subtopics'] || '';
    return raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
  };

  // ── subjectStats: progress summary for one subject card ─────────────────────
  // allTopicsForSubjectKey: every module in this subject, regardless of
  // completion status — used purely for progress stats (% complete, X/Y
  // topics) so the progress bar reflects true completion even though
  // completed topics are hidden from the playable list below.
  const allTopicsForSubjectKey = subjectName => ASSIGN_LMOD.filter(m => m.Subject === subjectName);

  const ageSubjectStats = subjectName => {
    const allTopics = allTopicsForSubjectKey(subjectName);
    const completed = allTopics.filter(m => learnProgress[m['Module ID']]?.completedAt).length;
    const attempted = allTopics.reduce((s,m) => s+(learnProgress[m['Module ID']]?.attempted||0),0);
    const correct   = allTopics.reduce((s,m) => s+(learnProgress[m['Module ID']]?.correct||0),0);
    const pct = allTopics.length ? Math.round((completed/allTopics.length)*100) : 0;
    return { total: allTopics.length, completed, remaining: allTopics.length-completed, pct, attempted, correct };
  };

  // ── classFilter-aware subject list ──────────────────────────────────────────
  // FILTERED_SUBJECTS is what the Assignments tab actually renders — it now
  // correctly tracks ASSIGN_SUBJ, which already accounts for the pill
  // selection (own class / a chosen Set of classes / 'all'). This is the
  // fix for "selecting another class didn't load that class's subjects":
  // previously this line was hardcoded to ASGN_SUBJ (own class only) no
  // matter what classFilter was set to.
  const FILTERED_SUBJECTS = ASSIGN_SUBJ;

  // filterLabel: subtitle shown in the page header
  const filterLabel = (() => {
    if (!classFilter) return `${profile.classLevel}${studentAgeGroup ? ' · ' + studentAgeGroup : ''}`;
    if (classFilter === 'all') return 'All Classes';
    const arr = [...classFilter].sort();
    return arr.length === 1 ? arr[0] : arr.join(', ');
  })();

  // Step 1 subject cards — ASGN_SUBJ is already defined above (line ~1048).
  // topic COUNT and progress shown on each subject card is always computed live
  // from LMOD — so a brand-new subject just needs a row here + topic rows above,
  // no app code changes.

  // ASGN: prefer real API assignments. Compute 'Overdue' status automatically
  // (teacher sets Not Started/In Progress; client marks Overdue if past due date).
  // Must be declared AFTER ASGN_SUBJ (used for subject colour lookup).
  const today = new Date().toISOString().slice(0, 10);
  const ASGN_RAW = realAssignments || cfg.assignments;
  const ASGN = ASGN_RAW.filter(a => isRowActive(a.Active !== undefined ? a.Active : true)).map(a => {
    const subjectColor = (ASGN_SUBJ.find(s=>s.Subject===a.Subject)||{})['Color (Hex)'] || a['Color (Hex)'] || '#00c6a7';
    let status = a.Status || 'Not Started';
    if (!['Completed','Graded','graded','submitted'].includes(status)) {
      const dueIso = a.DueDate ? new Date(a.DueDate).toISOString().slice(0,10) : null;
      if (dueIso && dueIso < today) status = 'Overdue';
    }
    return { ...a, Status: status, 'Color (Hex)': subjectColor };
  }).sort((a, b) => {
    const priority = { Overdue: 0, 'Not Started': 1, 'In Progress': 2, Completed: 3, Graded: 4, graded: 4, submitted: 3 };
    const pa = priority[a.Status] ?? 1, pb = priority[b.Status] ?? 1;
    if (pa !== pb) return pa - pb;
    const da = a.DueDate ? new Date(a.DueDate) : new Date(9999,0);
    const db = b.DueDate ? new Date(b.DueDate) : new Date(9999,0);
    return da - db;
  });
  const topicsForSubject = subjectName => LMOD.filter(m=>m.Subject===subjectName);
  const subjectStats = subjectName => {
    const topics = topicsForSubject(subjectName);
    const completed = topics.filter(m => learnProgress[m['Module ID']]?.completedAt).length;
    return { total: topics.length, completed };
  };

  // ── Real Student Progress Dashboard: every number below is derived
  // live from learnProgress (per-module attempt/correct/completedAt state,
  // synced to the StudentProgress sheet via recordAnswer). When the real
  // Subjects API also returns data, we merge both sources — sheet data
  // is authoritative for TopicsDone/TotalTopics when set (teacher-managed);
  // quiz-level analytics always come from learnProgress (more granular).
  const SUBJ = ASGN_SUBJ.map(subj => {
    const topics        = topicsForSubject(subj.Subject);
    const topicProgress = topics.map(m => learnProgress[m['Module ID']]);
    const topicsDone    = topicProgress.filter(p => p?.completedAt).length;
    const attempted     = topicProgress.reduce((sum,p) => sum + (p?.attempted || 0), 0);
    const correct       = topicProgress.reduce((sum,p) => sum + (p?.correct   || 0), 0);
    const incorrect     = topicProgress.reduce((sum,p) => sum + (p?.incorrect || 0), 0);
    const lastAttempt   = topicProgress.reduce((latest,p) => {
      const ts = p?.completedAt || p?.startedAt;
      return ts && (!latest || ts > latest) ? ts : latest;
    }, null);

    // Merge with real subject data from the Subjects API when available
    const realSubj = realSubjects?.find(s => s.Subject === subj.Subject);
    const totalTopics  = realSubj?.['Total Topics'] ?? topics.length;
    const doneTopics   = realSubj?.['Topics Done']  ?? topicsDone;
    const pct          = totalTopics ? Math.round((doneTopics / totalTopics) * 100) : 0;

    return {
      Subject:            subj.Subject,
      'Color (Hex)':      subj['Color (Hex)'] || '#00c6a7',
      'Total Topics':     totalTopics,
      'Topics Done':      doneTopics,
      'Progress %':       realSubj?.['Progress %'] ?? pct,
      QuestionsAttempted: realSubj?.QuestionsAttempted  ?? attempted,
      QuestionsCorrect:   realSubj?.QuestionsCorrect    ?? correct,
      QuestionsIncorrect: realSubj?.QuestionsIncorrect  ?? incorrect,
      LastAttemptDate:    realSubj?.LastAttemptDate
        || (lastAttempt ? new Date(lastAttempt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '—'),
    };
  });

  // Achievements + overall quiz accuracy, both computed live from real
  // learnProgress data — see computeAchievements() above for the full badge
  // logic. liveQuizAvg backs the 'avg_score' stat card and 'ratio_quiz_avg'
  // donut slice with a real number instead of the sample 65/78 placeholders.
  const achievements = computeAchievements(SUBJ, learnProgress, t);
  const liveQuizAvg = achievements.totalAttempted ? achievements.accuracy : null;

  // Quick Access ("Continue Learning" — Req #4): find the most recently
  // touched module that's been started but not finished, across every
  // subject, so the dashboard button can jump straight back into it instead
  // of just opening the subject picker. Falls back to null if the student
  // has no in-progress module (brand-new student, or everything they've
  // started is already complete) — the button still works in that case, it
  // just opens the Assignments subject picker instead.
  const resumeTarget = (() => {
    // Only surface in-progress modules that belong to this student's current
    // subject list (the API already filtered LMOD by class).
    const validSubjectNames = new Set(ASGN_SUBJ.map(s => s.Subject));
    let best = null;
    LMOD.forEach(m => {
      if (!validSubjectNames.has(m.Subject)) return; // not in student's subjects
      const p = learnProgress[m['Module ID']];
      if (!p?.startedAt || p?.completedAt) return;
      const ts = p.startedAt;
      if (!best || ts > best.lastTs) best = { subjectName: m.Subject, moduleId: m['Module ID'], lastTs: ts };
    });
    return best;
  })();

  // Jumps to Assignments and, if there's an in-progress module, straight
  // into it. This is safe with the tab-change effect elsewhere that resets
  // activeModuleId/activeAssignmentSubject — that effect only fires when
  // tab !== 'assignments', so setting tab to 'assignments' here never
  // triggers it to clobber the subject/module we just set.
  const resumeLearning = () => {
    if (resumeTarget) {
      setActiveAssignmentSubject(resumeTarget.subjectName);
      setActiveModuleId(resumeTarget.moduleId);
    } else {
      setActiveAssignmentSubject(null);
      setActiveModuleId(null);
    }
    setTab('assignments');
  };

  // Compute live stat card values from real data where available, overriding
  // the hardcoded demo values in cfg.dashStats for those specific metrics.
  const liveStatOverrides = {
    attendance_pct:   realAtt?.summary ? `${realAtt.summary.rate}%` : null,
    pending_tasks:    realAssignments  ? String(ASGN.filter(a=>['Not Started','In Progress','Overdue'].includes(a.Status)).length) : null,
  };
  const statCards  = cfg.dashStats.filter(s => isRowActive(s.Active) && s['Metric Key'] && ['attendance_pct','submissions_pct','avg_score','pending_tasks'].includes(s['Metric Key']))
    .map(s => {
      if (s['Metric Key']==='avg_score' && liveQuizAvg!==null) return { ...s, Value:String(liveQuizAvg) };
      if (liveStatOverrides[s['Metric Key']]) return { ...s, Value: liveStatOverrides[s['Metric Key']] };
      return s;
    });
  const ratioStats = cfg.dashStats.filter(s => isRowActive(s.Active) && s['Metric Key'] && s['Metric Key'].startsWith('ratio_'))
    .map(s => s['Metric Key']==='ratio_quiz_avg' && liveQuizAvg!==null ? { ...s, Value:String(liveQuizAvg) } : s);
  const nextN      = parseInt(S.DashboardNextClasses, 10) || 3;
  const unreadCount = notifs.filter(n => n.Unread).length;
  const attColor   = p => p >= 95 ? (S.AttHighColor||'#4ade80') : p >= 85 ? (S.AttMidColor||'#00c6a7') : (S.AttLowColor||'#f5a623');
  const greeting   = (S.WelcomeGreeting || 'Good day, {firstName}! 👋').replace('{firstName}', profile.name.split(' ')[0] || '');
  const uploadMsg  = (S.UploadSuccessTemplate || '"{filename}" submitted successfully!').replace('{filename}', uploadName);

  // ── Charts ────────────────────────────────────────────────────────────────────
  const destroyCharts = useCallback(() => {
    [subjectRef, attendRef, ratioRef].forEach(r => { if (r.current) { r.current.destroy(); r.current = null; } });
  }, []);

  const initCharts = useCallback(() => {
    destroyCharts();
    if (!window.Chart || !cfgReady) return;
    const sEl = document.getElementById('subjectChart');
    const aEl = document.getElementById('attendChart');
    const rEl = document.getElementById('ratioChart');

    if (sEl && SUBJ.length) subjectRef.current = new window.Chart(sEl, {
      type: 'bar',
      data: { labels: SUBJ.map(s => s.Subject), datasets: [{ label:'Progress %', data: SUBJ.map(s => s['Progress %']), backgroundColor: SUBJ.map(s => s['Color (Hex)']), borderRadius: 8, borderWidth: 0 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{beginAtZero:true,max:100,grid:{color:'rgba(255,255,255,.06)'},ticks:{color:'#94a3b8',font:{size:11}}}, x:{grid:{display:false},ticks:{color:'#94a3b8',font:{size:11}}} } },
    });

    if (aEl && AMON.length) attendRef.current = new window.Chart(aEl, {
      type: 'line',
      data: { labels: AMON.map(m => m['Month Short']), datasets: [{ label:'Attendance %', data: AMON.map(m => m['Attendance %']), borderColor:'#00c6a7', backgroundColor:'rgba(0,198,167,.1)', tension:.4, fill:true, pointBackgroundColor:'#00c6a7', pointRadius:5 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{beginAtZero:false,min:70,max:105,grid:{color:'rgba(255,255,255,.06)'},ticks:{color:'#94a3b8',font:{size:11}}}, x:{grid:{display:false},ticks:{color:'#94a3b8',font:{size:11}}} } },
    });

    if (rEl && ratioStats.length) ratioRef.current = new window.Chart(rEl, {
      type: 'doughnut',
      data: { labels: ratioStats.map(r => r.Label.replace(/\s*\([^)]*\)\s*$/, '')), datasets: [{ data: ratioStats.map(r => Number(r.Value)||0), backgroundColor:['rgba(0,198,167,.85)','rgba(168,85,247,.85)','rgba(245,166,35,.85)'], borderWidth:0, hoverOffset:6 }] },
      options: { responsive:true, maintainAspectRatio:false, cutout:'68%', plugins:{ legend:{ position:'bottom', labels:{ color:'#94a3b8', font:{size:12}, boxWidth:12, padding:14 } } } },
    });
  }, [cfgReady, SUBJ, AMON, ratioStats, destroyCharts]);

  useEffect(() => {
    if (!authed || !cfgReady || !(tab==='dashboard'||tab==='progress'||tab==='attendance')) return;
    // Poll until Chart.js is loaded (handles race with afterInteractive script)
    let attempts = 0;
    const tryInit = () => {
      if (window.Chart) { initCharts(); return; }
      if (++attempts < 20) setTimeout(tryInit, 150);
    };
    const t = setTimeout(tryInit, 100);
    return () => clearTimeout(t);
  }, [authed, tab, cfgReady, initCharts]);

  // ── Auth ──────────────────────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault(); setLoginErr(''); setLoading(true);
    const u = e.target.username.value.trim(), p = e.target.password.value.trim();
    try {
      const res  = await fetch(S.AuthAPIEndpoint||'/api/student/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:u,password:p}) });
      const data = await res.json();
      console.log('[portal] Auth response:', JSON.stringify(data));
      if (res.ok && data.authenticated) {
        setProfile(prev => ({
          ...prev,
          name:       data.fullName || data.username,
          id:         data.studentId,
          // Use exactly what the sheet returned. If blank, store '' so the
          // Assignments tab shows a "set your class" prompt instead of
          // silently showing Class 3 content that may be wrong.
          classLevel: data.classLevel || '',
        }));
        setAuthed(true);
      }
      else setLoginErr(data.message || t('p_invalid_credentials'));
    } catch { setLoginErr(S.ConnectionErrorMsg || t('p_connection_failed')); }
    finally { setLoading(false); }
  };

  const handleLogout = () => {
    destroyCharts(); setAuthed(false); setTab('dashboard'); setMobileNavOpen(false);
    // Clear localStorage FIRST so the persistence effect below doesn't
    // immediately re-save the reset state with classLevel: 'Class 3'.
    try { localStorage.removeItem('vedanta_profile'); } catch {}
    setProfile({ name: '', id: '', classLevel: 'Class 3' });
    setLoginErr('');
  };

  // ── Restore profile from localStorage on client mount ────────────────────────
  // This runs only in the browser (not during SSR) so localStorage is always
  // available. It restores name, id, and classLevel from the previous session
  // so the correct age group / class shows immediately — even before the auth
  // API responds. The auth re-validates credentials, but the UI doesn't have
  // to wait for that before showing the right content.
  //
  // Issue 4 fix: previously this restored `profile` but never called
  // setAuthed(true), so a page refresh always fell back to the login screen
  // even though a valid session was sitting in localStorage. Now a restored
  // session with a real studentId is treated as authenticated immediately —
  // the student stays logged in across refreshes, exactly like the rest of
  // the app already assumed it worked.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('vedanta_profile');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Only restore if there's a real studentId — don't restore a half-empty state
        if (parsed?.id) {
          setProfile(parsed);
          setAuthed(true);
        }
      }
    } catch {}
  }, []); // empty deps — runs once after first client render, never again

  // ── Persist profile to localStorage whenever it changes ──────────────────────
  useEffect(() => {
    if (!profile.id) return; // don't save the empty pre-login state
    try { localStorage.setItem('vedanta_profile', JSON.stringify(profile)); } catch {}
  }, [profile.id, profile.name, profile.classLevel]);

  // ── Interactive Learning: per-student progress ───────────────────────────────
  // Persisted to localStorage (so it survives a refresh, and renders instantly
  // on login) AND synced to the StudentProgress Google Sheet via recordAnswer()
  // on every answered question. On login we also pull the sheet's raw history
  // back and rebuild any module's summary from it — this is what lets a
  // student see their real progress on a brand-new device, not just the one
  // that originally answered the questions.
  useEffect(() => {
    if (!profile.id) { setLearnProgress({}); return; }
    let local = {};
    try {
      const raw = localStorage.getItem(`learnProgress:${profile.id}`);
      local = raw ? JSON.parse(raw) : {};
    } catch { local = {}; }
    setLearnProgress(local);

    // Wait for real sheet config (step counts) to be loaded before rebuilding
    // completion state from raw rows — otherwise a not-yet-loaded LMOD/steps
    // would make every module look 0% complete even if finished.
    if (!cfgReady) return;

    fetch(`/api/student/progress-history?studentId=${encodeURIComponent(profile.id)}`)
      .then(r => r.json())
      .then(({ progress }) => {
        if (!Array.isArray(progress) || !progress.length) return;
        const rebuilt = rebuildLearnProgressFromRows(progress, moduleId => stepsFor(moduleId));
        setLearnProgress(prev => {
          const merged = { ...rebuilt };
          Object.keys(prev).forEach(moduleId => {
            const localAttempted = prev[moduleId]?.attempted || 0;
            const rebuiltAttempted = merged[moduleId]?.attempted || 0;
            if (localAttempted >= rebuiltAttempted) merged[moduleId] = prev[moduleId];
          });
          try { localStorage.setItem(`learnProgress:${profile.id}`, JSON.stringify(merged)); } catch {}
          return merged;
        });
      })
      .catch(() => {}); // offline or sheet unreachable — localStorage already rendered above

    // ── Fetch real per-student data (subjects progress, assignments, attendance,
    // chapter assignments) in parallel. Each is independent — if one fails the
    // others still render.
    const sid = encodeURIComponent(profile.id);
    setMyAssignmentsLoading(true);
    Promise.allSettled([
      fetch(`/api/student/subjects?studentId=${sid}`).then(r=>r.json()),
      fetch(`/api/student/assignments?studentId=${sid}`).then(r=>r.json()),
      fetch(`/api/student/attendance?studentId=${sid}`).then(r=>r.json()),
      fetch(`/api/student/chapter-assignments?studentId=${sid}`).then(r=>r.json()),
    ]).then(([subjRes, asgnRes, attRes, chAsgnRes]) => {
      if (subjRes.status === 'fulfilled' && subjRes.value.subjects?.length)
        setRealSubjects(subjRes.value.subjects);
      if (asgnRes.status === 'fulfilled' && asgnRes.value.assignments?.length)
        setRealAssignments(asgnRes.value.assignments);
      if (attRes.status === 'fulfilled' && attRes.value.records !== undefined)
        setRealAttendance(attRes.value);
      if (chAsgnRes.status === 'fulfilled')
        setMyAssignments(chAsgnRes.value.assignments || []);
      setMyAssignmentsLoading(false);
    });
  }, [profile.id, cfgReady]);

  const saveLearnProgress = useCallback((moduleId, patch) => {
    setLearnProgress(prev => {
      const merged = { ...(prev[moduleId]||{}), ...patch };
      const next = { ...prev, [moduleId]: merged };
      try { localStorage.setItem(`learnProgress:${profile.id}`, JSON.stringify(next)); } catch {}
      // Cross-device sync of per-question events happens via recordAnswer()
      // below (one row per answered question, matching the StudentProgress
      // sheet schema) — this function only owns the local/per-module summary
      // used to render module cards, the dashboard, etc.
      return next;
    });
  }, [profile.id]);

  // ── Student Progress Tracking: one row per answered question, sent to the
  // StudentProgress Google Sheet via /api/student/progress. Best-effort —
  // if the network call fails, the student's local progress (above) is
  // already saved, so nothing is lost; it just won't show up in the
  // dashboard/leaderboard on another device until the next successful sync.
  const recordAnswer = useCallback(({ moduleId, subject, topic, questionNumber, answerGiven, correctAnswer, isCorrect, timeTakenSeconds }) => {
    fetch('/api/student/progress', {
      method: 'POST', headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({
        studentId: profile.id, studentName: profile.name, subject, topic, moduleId,
        questionNumber, answerGiven, correctAnswer, status: isCorrect ? 'Correct' : 'Incorrect',
        timeTakenSeconds,
      }),
    }).catch(() => {});
  }, [profile.id, profile.name]);

  // Leaving the Assignments tab always returns to Subject selection (Step 1) next time it's opened.
  useEffect(() => { if (tab !== 'assignments') { setActiveModuleId(null); setActiveAssignmentSubject(null); } }, [tab]);
  useEffect(() => { if (tab !== 'myassignments') { setActiveMyAssignmentId(null); } }, [tab]);

  // ── Shareable quiz links ─────────────────────────────────────────────────
  // While a quiz is open, the address bar carries either ?moduleId=... (a
  // topic from the Assignments tab — any classmate can open the same one)
  // or ?assignmentId=... (a personal row from "Assignments for you" — only
  // works for the student it was actually assigned to). Copying the page URL
  // and sending it to another student, who then logs in, drops them straight
  // into the same quiz instead of the dashboard.
  const copyShareLink = useCallback(() => {
    const url = window.location.href;
    const flash = () => { setShareCopied(true); setTimeout(() => setShareCopied(false), 1800); };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(flash).catch(() => window.prompt(t('p_copy_link_prompt') || 'Copy this link:', url));
    } else {
      window.prompt(t('p_copy_link_prompt') || 'Copy this link:', url);
    }
  }, [t]);

  // Reflect the currently open quiz in the URL (via replaceState, so it
  // doesn't spam the browser's back-button history) so the address bar
  // itself becomes the share link the moment a student opens a quiz.
  useEffect(() => {
    if (!authed || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    let changed = false;

    if (tab === 'assignments' && activeModuleId) {
      if (params.get('moduleId') !== activeModuleId) { params.set('moduleId', activeModuleId); changed = true; }
      if (params.has('assignmentId')) { params.delete('assignmentId'); changed = true; }
    } else if (tab === 'myassignments' && activeMyAssignmentId) {
      if (params.get('assignmentId') !== activeMyAssignmentId) { params.set('assignmentId', activeMyAssignmentId); changed = true; }
      if (params.has('moduleId')) { params.delete('moduleId'); changed = true; }
    } else if (params.has('moduleId') || params.has('assignmentId')) {
      params.delete('moduleId'); params.delete('assignmentId'); changed = true;
    }

    if (changed) {
      const qs = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
  }, [authed, tab, activeModuleId, activeMyAssignmentId]);

  // On load, follow ?moduleId=/?assignmentId= from a shared link straight
  // into the matching quiz. Waits for login + config (and, for assignmentId,
  // for the student's own assignment list to finish loading) before giving
  // up — a link opened while logged out will still work right after login.
  const deepLinkAppliedRef = useRef(false);
  useEffect(() => {
    if (deepLinkAppliedRef.current) return;
    if (!authed || !cfgReady || typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const moduleId = params.get('moduleId');
    const assignmentId = params.get('assignmentId');
    if (!moduleId && !assignmentId) { deepLinkAppliedRef.current = true; return; }

    if (moduleId) {
      const mod = ASSIGN_LMOD.find(m => m['Module ID'] === moduleId);
      if (mod) {
        setActiveAssignmentSubject(mod.Subject);
        setActiveModuleId(moduleId);
        setTab('assignments');
        deepLinkAppliedRef.current = true;
      }
      // else: modules may not have loaded yet — try again next render
      return;
    }

    if (assignmentId) {
      if (myAssignmentsLoading) return; // wait for "Assignments for you" to finish fetching
      const row = myAssignments.find(a => a.AssignmentID === assignmentId);
      if (row) { setActiveMyAssignmentId(assignmentId); setTab('myassignments'); }
      deepLinkAppliedRef.current = true; // stop trying either way once resolved
    }
  }, [authed, cfgReady, ASSIGN_LMOD, myAssignments, myAssignmentsLoading]);

  // Re-fetch this student's "Assignments for you" list — used right after
  // the tab is opened and again after completing one, so Status flips to
  // "Completed" without needing a full page reload.
  const refetchMyAssignments = useCallback(() => {
    if (!profile.id) return;
    fetch(`/api/student/chapter-assignments?studentId=${encodeURIComponent(profile.id)}`)
      .then(r => r.json())
      .then(data => setMyAssignments(data.assignments || []))
      .catch(() => {});
  }, [profile.id]);

  // Background refresh so a newly-assigned chapter (or one being marked
  // Completed from the Parent Portal side) shows up in the nav badge without
  // the student needing to open "Assignments for you" or reload the page —
  // same background-watcher idea as ChatNotifications, just polled less
  // often since assignments change far less frequently than chat messages.
  useEffect(() => {
    if (!profile.id) return;
    const id = setInterval(refetchMyAssignments, 45000);
    return () => clearInterval(id);
  }, [profile.id, refetchMyAssignments]);

  // Called by LearningModulePlayer's onRangeComplete when a student finishes
  // every question in their assigned range. Optimistically flips the row to
  // "Completed" locally, then syncs the sheet — and exits back to the table.
  const completeMyAssignment = useCallback((assignmentId) => {
    setMyAssignments(prev => prev.map(a =>
      a.AssignmentID === assignmentId ? { ...a, Status: 'Completed' } : a
    ));
    fetch('/api/student/complete-assignment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignmentId }),
    }).catch(() => {});
  }, []);
  // Selecting any nav item closes the mobile drawer (desktop sidebar is unaffected — see CSS).
  useEffect(() => { setMobileNavOpen(false); }, [tab]);

  // Leaderboard data is fetched lazily — only once the student actually opens
  // the tab — since most logins won't touch it, and it's a cross-student
  // aggregate (not specific to this student) so there's no reason to block
  // login or the dashboard on it.
  useEffect(() => {
    if (tab !== 'leaderboard' || !authed) return;
    setLeaderboardLoading(true);
    fetch('/api/student/leaderboard')
      .then(r => r.json())
      .then(data => setLeaderboard({ overall: data.overall||[], bySubject: data.bySubject||{} }))
      .catch(() => {})
      .finally(() => setLeaderboardLoading(false));
  }, [tab, authed]);

  // Weighted leaderboard fetched the same way — lazily, once the Leaderboard
  // tab is opened. Kept as a separate request/cache from the regular
  // leaderboard since it's a different aggregate (assignment-scoped,
  // accuracy-ranked, min-50-attempts gated).
  useEffect(() => {
    if (tab !== 'leaderboard' || !authed) return;
    setWeightedLeaderboardLoading(true);
    fetch('/api/student/weighted-leaderboard')
      .then(r => r.json())
      .then(data => setWeightedLeaderboard({ overall: data.overall||[], bySubject: data.bySubject||{} }))
      .catch(() => {})
      .finally(() => setWeightedLeaderboardLoading(false));
  }, [tab, authed]);

  const notifStyle = type => ({
    bg: type==='assignment'?'rgba(59,130,246,.15)':type==='result'?'rgba(34,197,94,.15)':type==='reminder'?'rgba(245,166,35,.15)':type==='schedule'?'rgba(239,68,68,.15)':'rgba(168,85,247,.15)',
    cl: type==='assignment'?'#60a5fa':type==='result'?'#4ade80':type==='reminder'?'#f5a623':type==='schedule'?'#f87171':'#c084fc',
  });

  // ── Skeleton ──────────────────────────────────────────────────────────────────
  const SK = ({ w='100%', h='18px', r='6px', mb='0' }) => (
    <div style={{width:w,height:h,borderRadius:r,marginBottom:mb,background:'rgba(255,255,255,.06)',animation:'skpulse 1.4s ease-in-out infinite'}} />
  );

  // ── CSS ───────────────────────────────────────────────────────────────────────
  const CSS = `
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

  const mergedProfile = [
    { label:t('p_full_name'),  val:profile.name,  readonly:true,  fieldKey:'FullName'   },
    { label:t('p_student_id'), val:profile.id,    readonly:true,  fieldKey:'StudentID'  },
    ...PFIELDS.map(f => ({
      label:    f.Label,
      // For class_level, always use the live profile.classLevel value (set at
      // login from the Accounts sheet) rather than the stale fallback string in
      // PFIELDS.Value. This ensures the dropdown default reflects what's actually
      // stored on the student's account, not the hardcoded 'Class 3' placeholder.
      val:      f['Field Key'] === 'class_level' ? profile.classLevel : f.Value,
      readonly: f['Read-Only']==='Yes'||f['Read-Only']===true,
      fieldKey: ({
        class_level:   'ClassLevel',
        enrolled_date: 'EnrolledDate',
        email:         'Email',
        phone:         'Phone',
        address:       'Address',
      }[f['Field Key']] || f['Field Key']),
    })),
  ];

  // ── RENDER ────────────────────────────────────────────────────────────────────
  return (
    <>
      <Head>
        <title>{`${S.SiteName} | ${S.AcademyName}`}</title>
        {/* Clean, highly-legible type for quiz content (Issue 1: simple,
            clear, readable fonts). Inter is used for the question/options/
            learning-section body copy; Poppins for headings/titles. Both
            load with font-display:swap so there's no FOUT-related layout
            shift, and both fall back gracefully to system fonts if the
            network request fails. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Poppins:wght@600;700;800;900&display=swap" rel="stylesheet" />
        <style>{CSS}</style>
      </Head>
      <Script src="https://cdn.jsdelivr.net/npm/chart.js" strategy="afterInteractive" />

      {!authed ? (
        <div className="lw">
          <div className="lbg" />
          <div className="lb">
            <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'4px'}}><LanguageToggle /></div>
            <div className="li"><i className="fa-solid fa-shield-halved" /></div>
            <h1 className="lh">{S.LoginHeading}</h1>
            <p className="ls">{S.LoginSubheading}</p>
            <form onSubmit={handleLogin}>
              <div className="field">
                <label className="fl">{t('p_username_or_id')}</label>
                <div className="fw"><i className="fa-solid fa-user fi" /><input name="username" required className="inp" placeholder={t('p_username_ph')} /></div>
              </div>
              <div className="field">
                <label className="fl">{t('p_password')}</label>
                <div className="fw"><i className="fa-solid fa-lock fi" /><input name="password" type="password" required className="inp" placeholder="••••••••" /></div>
              </div>
              <button type="submit" className="lbtn" disabled={loading}>
                {loading ? <><i className="fa-solid fa-circle-notch fa-spin" /> {S.LoadingButtonText}</> : S.LoginButtonLabel}
              </button>
              {loginErr && <div className="lerr">⚠ {loginErr}</div>}
            </form>
            <Link href={S.BackLinkURL||'/'} className="bk"><i className="fa-solid fa-arrow-left" /> {S.BackLinkLabel}</Link>
          </div>
        </div>
      ) : (
        <div className={`dash${activeModuleId ? ' quiz-mode' : ''}`}>

          {/* GROUP CHAT — mounted once, unconditionally, at the top level.
              GroupChat renders itself as a fixed-position bubble/panel, not
              inline content, so it must not also be rendered inside a tab. */}
          <GroupChat ref={chatRef} profile={profile} t={t} classLevels={KNOWN_CLASSES} />

          {/* Floating sidebar button — only visible in quiz mode (issue 6) */}
          <button
            className="sb-float-btn"
            onClick={()=>setSidebarPeeking(p=>!p)}
            aria-label="Open navigation"
            title="Open menu"
          >
            <i className={`fa-solid ${sidebarPeeking ? 'fa-xmark' : 'fa-bars'}`} />
          </button>

          {/* Tap-outside backdrop — closes peeking sidebar in quiz mode */}
          {sidebarPeeking && activeModuleId && (
            <div
              style={{position:'fixed',inset:0,zIndex:294,background:'rgba(0,0,0,.45)'}}
              onClick={()=>setSidebarPeeking(false)}
            />
          )}

          {/* Tap-outside backdrop — mobile only (hidden via CSS on desktop) */}
          <div className={`mnav-backdrop${mobileNavOpen?' open':''}`} onClick={()=>setMobileNavOpen(false)} />

          {/* SIDEBAR */}
          <aside className={`sb${mobileNavOpen?' open':''}${sidebarPeeking&&activeModuleId?' quiz-peek':''}`}>
<ChatNotifications
  profile={profile}
  onUnreadChange={setChatUnread}
  onOpenChat={(groupId) => chatRef.current?.open(groupId)}
/>
<AssignmentNotifications
  profile={profile}
  onOpenAssignment={(assignmentId) => { setTab('myassignments'); setActiveMyAssignmentId(assignmentId); }}
/>
            <div className="sb-head">
              <div className="sb-av"><i className="fa-solid fa-user-graduate" /></div>
              <div style={{flex:1,minWidth:0}}><div className="sb-name">{profile.name}</div><div className="sb-id">{profile.id}</div></div>
              <button className="mnav-close" onClick={()=>setMobileNavOpen(false)} aria-label={t('p_close_nav')}><i className="fa-solid fa-xmark" /></button>
            </div>
            <p className="sb-sec">{S.SidebarSectionLabel}</p>
            <nav className="sb-nav">
              {NAV.map(navItem => (
                <button
                  key={navItem.ID}
                  className={`nb${tab===navItem.ID?' active':''}`}
                  onClick={() => {
                    if (navItem.ID === 'chat') { chatRef.current?.open(); return; }
                    setTab(navItem.ID);
                    setSidebarPeeking(false);
                  }}
                >
                  <i className={`fa-solid ${navItem['Icon (FontAwesome solid)']}`} /> {navItem.Label}
                  {navItem.ID==='notifications' && unreadCount>0 && <span className="nb-badge">{unreadCount}</span>}
{navItem.ID==='chat' && chatUnread>0 && <span className="nb-badge">{chatUnread}</span>}
{navItem.ID==='myassignments' && pendingMyAssignments>0 && <span className="nb-badge">{pendingMyAssignments}</span>}
                </button>
              ))}
            </nav>
            <div className="sb-ft">
              <div style={{marginBottom:'10px'}}><LanguageToggle style={{width:'100%',justifyContent:'center'}} /></div>
              <button className="lo-btn" onClick={handleLogout}><i className="fa-solid fa-power-off" /> {S.SignOutLabel}</button>
            </div>
          </aside>

          {/* MAIN */}
          <main className="main">

            {/* ── ANNOUNCEMENT STRIP ── shown at the top of every tab when text is available */}
            {announcementText && (
              <div className="ann-strip" role="marquee" aria-label="Announcement">
                <div className="ann-strip-inner">
                  {[0, 1].map(k => (
                    <span key={k} className="ann-strip-seg">
                      <i className="fa-solid fa-bullhorn"></i>
                      {announcementText}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Mobile-only top bar: hamburger to open the drawer. Hidden on
                desktop via CSS (.mnav-toggle has display:none until 640px). */}
            <div className="mnav-bar">
              <button className="mnav-toggle" onClick={()=>setMobileNavOpen(true)} aria-label={t('p_open_nav')}>
                <i className="fa-solid fa-bars" />
              </button>
              <span className="mnav-bar-title">{S.SiteName}</span>
            </div>

            {/* DASHBOARD */}
            {tab==='dashboard' && (<>
              <div className="main-top"><div><div className="pg-h">{t('p_dashboard_title')}</div><div className="pg-s">{S.DashboardSubtitle}</div></div></div>
              <div className="content">
                <div className="wbanner">
                  <div><h2>{greeting}</h2><p>{profile.classLevel} · {t('p_student_id')}: {profile.id} · {t('p_enrollment')}: {S.EnrolmentStatus}</p></div>
                  <div className="av-big"><i className="fa-solid fa-user-graduate" /></div>
                </div>

                {/* Learning Analytics — moved to the top of the dashboard so it's
                    the first thing a student sees after logging in (Req #1).
                    Now includes Last Activity Date and Subjects Completed,
                    and the Quick Access button (Req #4) sits right inside it
                    so "see my stats" and "get back to learning" are one glance
                    apart, not opposite ends of the page. */}
                <div className="card" style={{marginBottom:'22px'}}>
                  <div className="card-t-row">
                    <div className="card-t"><i className="fa-solid fa-chart-simple" /> {t('p_learning_analytics')}</div>
                    <button className="btn-t btn-t-sm" onClick={resumeLearning}>
                      <i className={`fa-solid ${resumeTarget ? 'fa-play' : 'fa-book-open'}`} />
                      {resumeTarget ? t('p_continue_learning') : t('p_go_to_assignments')}
                    </button>
                  </div>
                  <div className="ana-stats-g">
                    <div className="ana-stat"><div className="ana-stat-v">{achievements.totalAttempted}</div><div className="ana-stat-l">{t('p_questions_attempted')}</div></div>
                    <div className="ana-stat"><div className="ana-stat-v" style={{color:'#4ade80'}}>{achievements.totalCorrect}</div><div className="ana-stat-l">{t('p_correct_answers')}</div></div>
                    <div className="ana-stat"><div className="ana-stat-v" style={{color:'#f87171'}}>{achievements.totalAttempted-achievements.totalCorrect}</div><div className="ana-stat-l">{t('p_incorrect_answers')}</div></div>
                    <div className="ana-stat"><div className="ana-stat-v" style={{color:'var(--teal)'}}>{achievements.accuracy}%</div><div className="ana-stat-l">{t('p_overall_accuracy')}</div></div>
                    <div className="ana-stat"><div className="ana-stat-v">{SUBJ.filter(s=>s['Topics Done']>0).length}</div><div className="ana-stat-l">{t('p_subjects_started')}</div></div>
                    <div className="ana-stat"><div className="ana-stat-v">{SUBJ.filter(s=>s['Total Topics']>0 && s['Topics Done']===s['Total Topics']).length}</div><div className="ana-stat-l">{t('p_subjects_completed')}</div></div>
                    <div className="ana-stat"><div className="ana-stat-v">{achievements.completedCount}</div><div className="ana-stat-l">{t('p_topics_completed')}</div></div>
                    <div className="ana-stat"><div className="ana-stat-v" style={{fontSize:'15px'}}>{achievements.lastActivityAt ? new Date(achievements.lastActivityAt).toLocaleDateString(lang==='da'?'da-DK':'en-IN',{day:'numeric',month:'short',year:'numeric'}) : t('p_no_activity_yet')}</div><div className="ana-stat-l">{t('p_last_activity')}</div></div>
                  </div>
                  <div className="sec-divider" style={{marginTop:'22px'}}>{t('p_achievements')}</div>
                  {achievements.badges.length ? (
                    <div className="badge-grid">
                      {achievements.badges.map(b=>(
                        <div key={b.id} className="badge-card">
                          <div className="badge-icon" style={{background:`${b.color}22`,color:b.color}}><i className={`fa-solid ${b.icon}`} /></div>
                          <div className="badge-label">{b.label}</div>
                          <div className="badge-detail">{b.detail}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{textAlign:'center',color:'var(--muted)',fontSize:'13px',padding:'14px 0'}}>{t('p_no_achievements')}</div>
                  )}
                </div>

                <div className="sr">
                  {!cfgReady ? [1,2,3,4].map(i=><div key={i} className="sc"><SK h="60px" /></div>)
                  : statCards.map((s,i) => (
                    <div key={i} className="sc">
                      <div className="sc-l">{s.Label}</div>
                      <div className="sc-v" style={s['Metric Key']==='pending_tasks'?{color:'#f97316'}:{}}>{s.Value}</div>
                      <div className="sc-s">{s['Sub-label']}</div>
                    </div>
                  ))}
                </div>
                <div className="cr">
                  <div className="card"><div className="card-t"><i className="fa-solid fa-chart-bar" /> {t('p_subject_progress')}</div><div className="cv"><canvas id="subjectChart" /></div></div>
                  <div className="card"><div className="card-t"><i className="fa-solid fa-circle-half-stroke" /> {t('p_performance_ratios')}</div><div className="cv"><canvas id="ratioChart" /></div></div>
                </div>
                <div className="card">
                  <div className="card-t"><i className="fa-solid fa-clock" /> {t('p_next_classes', {n: nextN})}</div>
                  {SCHED.slice(0,nextN).map((u,i)=>(
                    <div key={i} className="sch-item">
                      <div className="sch-color" style={{background:u['Color (Hex)']}} />
                      <div className="sch-body"><div className="sch-subj">{u.Subject}</div><div className="sch-meta">{u.Teacher} · {t(`sched_mode_${u.Mode.toLowerCase()}`)}</div></div>
                      <div className="sch-right"><div className="sch-time">{u.Time}</div><div className="sch-date">{u.Date}</div></div>
                    </div>
                  ))}
                </div>
              </div>
            </>)}

            {/* ACADEMIC PROGRESS */}
            {tab==='progress' && (<>
              <div className="main-top"><div><div className="pg-h">{t('p_progress_title')}</div><div className="pg-s">{t('p_progress_subtitle')}</div></div></div>
              <div className="content">
                <div className="cr" style={{marginBottom:'22px'}}>
                  <div className="card"><div className="card-t"><i className="fa-solid fa-chart-bar" /> {t('p_completion_by_subject')}</div><div className="cv"><canvas id="subjectChart" /></div></div>
                  <div className="card"><div className="card-t"><i className="fa-solid fa-circle-half-stroke" /> {t('p_overall_ratios')}</div><div className="cv"><canvas id="ratioChart" /></div></div>
                </div>
                <div className="card">
                  <div className="card-t"><i className="fa-solid fa-list-check" /> {t('p_detailed_progress')}</div>
                  {!SUBJ.length ? (
                    <div style={{textAlign:'center',color:'var(--muted)',fontSize:'13px',padding:'20px 0'}}>{t('p_no_subjects_yet')}</div>
                  ) : SUBJ.map(s=>(
                    <div key={s.Subject} className="sp-item">
                      <div className="sp-hd">
                        <span className="sp-name">{s.Subject}</span>
                        <span className="sp-meta">{s['Topics Done']} / {s['Total Topics']} {t('p_topics')} · <span style={{color:s['Color (Hex)'],fontWeight:700}}>{s['Progress %']}%</span></span>
                      </div>
                      <div className="sp-bar"><div className="sp-fill" style={{width:`${s['Progress %']}%`,background:s['Color (Hex)']}} /></div>
                      <div className="sp-detail-row">
                        <span><i className="fa-solid fa-circle-check" style={{color:'#4ade80'}} /> {s.QuestionsCorrect} {t('p_correct')}</span>
                        <span><i className="fa-solid fa-circle-xmark" style={{color:'#f87171'}} /> {s.QuestionsIncorrect} {t('p_incorrect')}</span>
                        <span><i className="fa-solid fa-list-ol" /> {s.QuestionsAttempted} {t('p_attempted')}</span>
                        <span><i className="fa-solid fa-calendar" /> {t('p_last_attempt')} {s.LastAttemptDate}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>)}

            {/* LEADERBOARD */}
            {tab==='leaderboard' && (<>
              <div className="main-top"><div><div className="pg-h">{t('p_leaderboard_title')}</div><div className="pg-s">{t('p_leaderboard_subtitle')}</div></div></div>
              <div className="content">

                {/* ── TIME FILTER PILLS ───────────────────────────────────── */}
                {(() => {
                  const opts = [
                    { days:1,   label:'Today'    },
                    { days:7,   label:'7 Days'   },
                    { days:30,  label:'30 Days'  },
                    { days:90,  label:'3 Months' },
                    { days:0,   label:'All Time' },
                  ];
                  // Filter a leaderboard row array to only those whose
                  // lastActivity falls within [now - days*86400000, now].
                  // If days===0, no filter is applied.
                  const cutoff = lbDays > 0 ? Date.now() - lbDays * 86400000 : 0;
                  const filterRows = rows => lbDays === 0 ? rows
                    : rows.filter(r => {
                        if (!r.lastActivity) return false;
                        return new Date(r.lastActivity).getTime() >= cutoff;
                      });

                  const filteredOverall  = filterRows(leaderboard.overall);
                  const filteredBySubject = Object.fromEntries(
                    Object.entries(leaderboard.bySubject).map(([s,rows]) => [s, filterRows(rows)])
                  );

                  // ── DAILY QUESTIONS-ATTEMPTED BOARD ───────────────────────
                  // Build from leaderboard.overall where lastActivity is today,
                  // keyed by questions attempted that day. Falls back gracefully
                  // if the API doesn't return lastActivity (older script versions).
                  const todayStr = new Date().toISOString().slice(0,10);
                  const todayCutoff = new Date(todayStr).getTime();
                  const dailyRows = leaderboard.overall
                    .filter(r => r.lastActivity && new Date(r.lastActivity).getTime() >= todayCutoff)
                    .map(r => ({ ...r, todayAttempted: r.todayAttempted ?? r.attempted ?? 0 }))
                    .sort((a,b) => b.todayAttempted - a.todayAttempted)
                    .slice(0, 20);

                  return (
                    <>
                      {/* Time filter pills */}
                      <div className="lb-filter-row" style={{marginBottom:'20px'}}>
                        <span style={{fontSize:'11px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em',color:'var(--muted)',alignSelf:'center',marginRight:'4px'}}>Period:</span>
                        {opts.map(o => (
                          <button key={o.days} className={`lb-pill${lbDays===o.days?' active':''}`} onClick={()=>setLbDays(o.days)}>
                            {o.label}
                          </button>
                        ))}
                      </div>

                      {/* ── DAILY QUESTIONS-ATTEMPTED BOARD ── */}
                      <div className="card" style={{marginBottom:'22px'}}>
                        <div className="card-t">
                          <i className="fa-solid fa-bolt" style={{color:'#f5a623'}} /> Today's Activity — Questions Attempted
                          <span style={{marginLeft:'auto',fontSize:'11px',fontWeight:400,color:'var(--muted)'}}>{todayStr}</span>
                        </div>
                        {leaderboardLoading ? (
                          <>{[1,2,3].map(i=><div key={i} style={{marginBottom:'8px'}}><SK h="40px" /></div>)}</>
                        ) : !dailyRows.length ? (
                          <div style={{textAlign:'center',color:'var(--muted)',fontSize:'13px',padding:'18px 0'}}>
                            No activity recorded today yet — be the first! 🚀
                          </div>
                        ) : (
                          <>
                            {dailyRows.slice(0,10).map((row,i) => {
                              const rank = i+1;
                              const isMe = row.studentId === profile.id;
                              return (
                                <div key={row.studentId} className={`daily-row${isMe?' me':''}`}>
                                  <div className={`daily-rank${rank<=3?` top${rank}`:''}`}>
                                    {rank<=3 ? <i className="fa-solid fa-bolt" /> : rank}
                                  </div>
                                  <div className="daily-name">
                                    {row.studentName}
                                    {isMe && <span style={{color:'var(--accent)',fontWeight:800,marginLeft:'6px'}}>(You)</span>}
                                  </div>
                                  <div className="daily-stats">
                                    <span style={{fontWeight:700,color:isMe?'var(--accent)':'rgba(255,255,255,.75)'}}>
                                      {row.todayAttempted} attempted
                                    </span>
                                    <span style={{color:'var(--teal)',fontWeight:700}}>
                                      {row.accuracy}% acc
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                            {/* Current student's own today count from live learnProgress */}
                            {(() => {
                              const myToday = Object.values(learnProgress).reduce((s,p) => {
                                if (!p?.startedAt) return s;
                                return new Date(p.startedAt).getTime() >= todayCutoff ? s + (p.attempted||0) : s;
                              }, 0);
                              if (!myToday || dailyRows.find(r=>r.studentId===profile.id)) return null;
                              return (
                                <div className="daily-row me" style={{marginTop:'8px',borderTop:'1px solid var(--border)',paddingTop:'10px'}}>
                                  <div className="daily-rank">—</div>
                                  <div className="daily-name">{profile.name} <span style={{color:'var(--accent)',fontWeight:800}}>(You)</span></div>
                                  <div className="daily-stats">
                                    <span style={{fontWeight:700,color:'var(--accent)'}}>{myToday} attempted</span>
                                    <span style={{color:'var(--muted)',fontSize:'11px'}}>local</span>
                                  </div>
                                </div>
                              );
                            })()}
                          </>
                        )}
                      </div>

                      {/* ── OVERALL RANKING (time-filtered) ── */}
                      <div className="card" style={{marginBottom:'22px'}}>
                        <div className="card-t">
                          <i className="fa-solid fa-trophy" /> {t('p_overall_ranking')}
                          <span style={{marginLeft:'auto',fontSize:'11px',fontWeight:400,color:'var(--muted)'}}>
                            {lbDays===0?'All time':lbDays===1?'Today':`Last ${lbDays} days`}
                          </span>
                        </div>
                        {leaderboardLoading ? (
                          <>{[1,2,3].map(i=><div key={i} style={{marginBottom:'10px'}}><SK h="44px" /></div>)}</>
                        ) : !filteredOverall.length ? (
                          <div style={{textAlign:'center',color:'var(--muted)',fontSize:'13px',padding:'20px 0'}}>
                            No activity in this period. Try "All Time" to see all rankings.
                          </div>
                        ) : (
                          <div className="lb-list">
                            {filteredOverall.slice(0,20).map((row,i)=>{
                              const rank = i+1;
                              const isMe = row.studentId === profile.id;
                              return (
                                <div key={row.studentId} className={`lb-row${isMe?' me':''}`}>
                                  <div className={`lb-rank${rank<=3?` top${rank}`:''}`}>{rank<=3 ? <i className="fa-solid fa-trophy" /> : rank}</div>
                                  <div className="lb-name">{row.studentName}{isMe && <span className="lb-you">{t('p_you_suffix')}</span>}</div>
                                  <div className="lb-stats">
                                    <span className="lb-correct">{row.correct} {t('p_correct')}</span>
                                    <span className="lb-acc">{row.accuracy}% {t('p_accuracy')}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* ── SUBJECT CHAMPIONS (time-filtered) ── */}
                      <div className="sec-divider" style={{marginTop:0}}>
                        {t('p_subject_champions')}
                        <span style={{marginLeft:'8px',fontWeight:400,fontSize:'10px',color:'var(--muted)'}}>
                          {lbDays===0?'All time':lbDays===1?'Today':`Last ${lbDays} days`}
                        </span>
                      </div>
                      {leaderboardLoading ? (
                        <div className="card"><SK h="80px" /></div>
                      ) : !Object.keys(filteredBySubject).length ? (
                        <div className="card" style={{textAlign:'center',color:'var(--muted)',fontSize:'13px'}}>{t('p_no_subject_rankings')}</div>
                      ) : (
                        <div className="lb-subj-grid">
                          {Object.entries(filteredBySubject).map(([subject, rows]) => {
                            const champ = rows[0];
                            const subjMeta = ASGN_SUBJ.find(s=>s.SubjectEN===subject) || ASGN_SUBJ.find(s=>s.Subject===subject);
                            const subjectDisplay = subjMeta?.Subject || subject;
                            return (
                              <div key={subject} className="card lb-subj-card">
                                <div className="card-t"><i className={`fa-solid ${subjMeta?.['Icon (FontAwesome solid)']||'fa-medal'}`} style={{color:subjMeta?.['Color (Hex)']}} /> {subjectDisplay} {t('p_champion')}</div>
                                {champ ? (
                                  <>
                                    <div className="lb-champ-name">{champ.studentName}</div>
                                    <div className="lb-champ-stats">{champ.correct} {t('p_correct')} · {champ.accuracy}% {t('p_accuracy')}</div>
                                    {rows.length>1 && (
                                      <div className="lb-runner-ups">
                                        {rows.slice(1,4).map((r,ri)=>(
                                          <div key={r.studentId} className="lb-runner-row">
                                            <span>{ri+2}. {r.studentName}{r.studentId===profile.id?t('p_you_suffix'):''}</span>
                                            <span>{r.correct} {t('p_correct')}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <div style={{color:'var(--muted)',fontSize:'13px'}}>
                                    {lbDays > 0 ? `No activity in the last ${lbDays} day${lbDays===1?'':'s'}` : t('p_no_attempts_yet')}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* ── WEIGHTED LEADERBOARD (assignment-scoped, accuracy-ranked) ── */}
                      <div className="sec-divider">
                        Weighted Leaderboard
                        <span style={{marginLeft:'8px',fontWeight:400,fontSize:'10px',color:'var(--muted)'}}>
                          Assigned questions only · min. 50 attempted · ranked by accuracy
                        </span>
                      </div>
                      <div className="card" style={{marginBottom:'22px'}}>
                        <div className="card-t">
                          <i className="fa-solid fa-star" style={{color:'#f5a623'}} /> Weighted Ranking
                        </div>
                        {weightedLeaderboardLoading ? (
                          <>{[1,2,3].map(i=><div key={i} style={{marginBottom:'10px'}}><SK h="44px" /></div>)}</>
                        ) : !weightedLeaderboard.overall.length ? (
                          <div style={{textAlign:'center',color:'var(--muted)',fontSize:'13px',padding:'20px 0'}}>
                            No students have answered at least 50 assigned questions yet.
                          </div>
                        ) : (
                          <div className="lb-list">
                            {weightedLeaderboard.overall.slice(0,20).map((row,i)=>{
                              const rank = i+1;
                              const isMe = row.studentId === profile.id;
                              return (
                                <div key={row.studentId} className={`lb-row${isMe?' me':''}`}>
                                  <div className={`lb-rank${rank<=3?` top${rank}`:''}`}>{rank<=3 ? <i className="fa-solid fa-star" /> : rank}</div>
                                  <div className="lb-name">{row.studentName}{isMe && <span className="lb-you">{t('p_you_suffix')}</span>}</div>
                                  <div className="lb-stats">
                                    <span className="lb-correct">{row.attempted} assigned attempted</span>
                                    <span className="lb-acc">{row.accuracy}% {t('p_accuracy')}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {!weightedLeaderboardLoading && Object.keys(weightedLeaderboard.bySubject).length > 0 && (
                        <div className="lb-subj-grid">
                          {Object.entries(weightedLeaderboard.bySubject).map(([subject, rows]) => {
                            const champ = rows[0];
                            const subjMeta = ASGN_SUBJ.find(s=>s.SubjectEN===subject) || ASGN_SUBJ.find(s=>s.Subject===subject);
                            const subjectDisplay = subjMeta?.Subject || subject;
                            return (
                              <div key={subject} className="card lb-subj-card">
                                <div className="card-t"><i className={`fa-solid ${subjMeta?.['Icon (FontAwesome solid)']||'fa-star'}`} style={{color:subjMeta?.['Color (Hex)']}} /> {subjectDisplay} — Weighted Champion</div>
                                <div className="lb-champ-name">{champ.studentName}</div>
                                <div className="lb-champ-stats">{champ.accuracy}% {t('p_accuracy')} · {champ.attempted} assigned attempted</div>
                                {rows.length>1 && (
                                  <div className="lb-runner-ups">
                                    {rows.slice(1,4).map((r,ri)=>(
                                      <div key={r.studentId} className="lb-runner-row">
                                        <span>{ri+2}. {r.studentName}{r.studentId===profile.id?t('p_you_suffix'):''}</span>
                                        <span>{r.accuracy}%</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </>)}

            {/* ATTENDANCE */}
            {tab==='attendance' && (<>
              <div className="main-top"><div><div className="pg-h">{t('p_attendance_title')}</div><div className="pg-s">{t('p_attendance_subtitle')}</div></div></div>
              <div className="content">
                <div className="att-g">
                  {ASTAT.map((a,i)=>{
                    const colors=['var(--teal)','#4ade80','var(--accent)'];
                    return <div key={i} className="att-c"><div className="att-n" style={{color:colors[i]}}>{a.Value}</div><div className="att-l">{a.Label}</div></div>;
                  })}
                </div>
                <div className="card" style={{marginBottom:'22px'}}>
                  <div className="card-t"><i className="fa-solid fa-chart-line" /> {t('p_monthly_attendance_trend')}</div>
                  <div className="cv"><canvas id="attendChart" /></div>
                </div>
                <div className="card">
                  <div className="card-t"><i className="fa-solid fa-calendar" /> {t('p_month_breakdown')}</div>
                  <div className="month-g">
                    {AMON.map(m=>(
                      <div key={m['Month Short']} className="m-bar-wrap">
                        <div className="m-bar-outer">
                          <div className="m-bar" style={{height:`${m['Attendance %']-65}%`,background:attColor(m['Attendance %'])}} />
                        </div>
                        <div className="m-lbl">{m['Month Short']}</div>
                        <div className="m-pct">{m['Attendance %']}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>)}

            {/* ASSIGNMENTS */}
            {/* NOTE: server-side, extend GET /api/portal-config to also return
                `assignmentSubjects`, `learningModules` and `learningSteps` arrays
                (see FALLBACK above for the exact shape) so teachers can author
                subjects/topics from the Sheet. Until then this gracefully runs
                on the FALLBACK content. A POST /api/student/progress endpoint
                doesn't exist yet either — progress below is fully functional
                via localStorage per student, but won't sync across devices
                until that route is built.

                DRILL-DOWN FLOW (Subject → Topic → Lesson): adding a brand-new
                subject or topic never needs a code change here — just add rows
                to assignmentSubjects / learningModules / learningSteps above
                (or their matching Sheet tabs once wired up). */}
            {tab==='assignments' && (<>
              {/* ── AGE-GROUP ASSIGNMENT DASHBOARD ──────────────────────────────
                  Shows content for this student's age group only (derived from
                  profile.classLevel). Each subject is an expandable card showing
                  topics, progress, and quiz modules. Hindi/Computer show a
                  "Coming Soon" state until sheet content is added. ── */}

              {/* ── CLASS NOT SET PROMPT ── */}
              {!classLevelIsSet && !activeAssignmentSubject && (
                <div className="content" style={{paddingTop:'32px'}}>
                  <div className="main-top">
                    <div><div className="pg-h">{t('p_assignments_title')}</div></div>
                  </div>
                  <div className="card" style={{borderColor:'rgba(245,166,35,.4)',textAlign:'center',padding:'40px 30px'}}>
                    <div style={{fontSize:'48px',marginBottom:'16px'}}>🎓</div>
                    <div style={{fontFamily:'var(--fd)',fontSize:'22px',fontWeight:900,color:'#fff',marginBottom:'10px'}}>
                      Your Class Level is Not Set
                    </div>
                    <div style={{fontSize:'14px',color:'var(--muted)',marginBottom:'28px',lineHeight:1.8,maxWidth:'420px',margin:'0 auto 28px'}}>
                      To see your age-appropriate subjects and topics, please set your class level.
                      You can do this in your <strong style={{color:'var(--teal)'}}>Profile</strong> tab.
                    </div>
                    <div style={{display:'flex',gap:'12px',justifyContent:'center',flexWrap:'wrap'}}>
                      <button className="btn-t" onClick={()=>setTab('profile')}>
                        <i className="fa-solid fa-user-pen" /> Go to Profile →  Set Class Level
                      </button>
                    </div>
                    <div style={{marginTop:'28px',padding:'16px',background:'rgba(255,255,255,.04)',borderRadius:'12px',textAlign:'left'}}>
                      <div style={{fontSize:'12px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'10px'}}>Quick Set</div>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:'8px'}}>
                        {CLASS_LEVELS.map(c => (
                          <button
                            key={c.Class}
                            onClick={async () => {
                              // Save immediately to the sheet AND update local state
                              const r = await fetch('/api/student/profile', {
                                method: 'POST',
                                headers: {'Content-Type':'application/json'},
                                body: JSON.stringify({ studentId: profile.id, classLevel: c.Class }),
                              });
                              const data = await r.json().catch(() => ({}));
                              // Even if the API call fails, update local state so the UI
                              // still works — the server-side save can be retried later.
                              setProfile(p => {
                                const updated = { ...p, classLevel: c.Class };
                                try { localStorage.setItem('vedanta_profile', JSON.stringify(updated)); } catch {}
                                return updated;
                              });
                              if (!data.success) {
                                console.warn('[portal] Class level save failed, kept locally:', data.message);
                              }
                            }}
                            style={{padding:'10px 14px',borderRadius:'10px',border:'1px solid rgba(255,255,255,.12)',
                              background:'rgba(255,255,255,.04)',color:'rgba(255,255,255,.8)',cursor:'pointer',
                              fontFamily:'var(--fb)',fontWeight:700,fontSize:'13px',textAlign:'center',transition:'all .15s'}}
                            onMouseOver={e=>e.currentTarget.style.background='rgba(0,198,167,.12)'}
                            onMouseOut={e=>e.currentTarget.style.background='rgba(255,255,255,.04)'}
                          >
                            <div>{c.Label || c.Class}</div>
                            <div style={{fontSize:'11px',color:'var(--muted)',fontWeight:400}}>{c.Age}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {classLevelIsSet && (!activeAssignmentSubject ? (
                /* ── HOME VIEW: Filtered subject cards ── */
                <>
                  {/* ── Page header ── */}
                  <div className="main-top">
                    <div>
                      <div className="pg-h">{t('p_assignments_title')}</div>
                      <div className="pg-s">{filterLabel}</div>
                    </div>
                    {/* My Class badge — clicking resets filter to own class */}
                    <button
                      onClick={()=>setClassFilter(null)}
                      style={{flexShrink:0,background: !classFilter?'rgba(0,198,167,.18)':'rgba(255,255,255,.05)',
                        border:`1px solid ${!classFilter?'rgba(0,198,167,.4)':'rgba(255,255,255,.1)'}`,
                        borderRadius:'12px',padding:'8px 16px',textAlign:'center',cursor:'pointer',transition:'all .2s',fontFamily:'var(--fb)'}}
                    >
                      <div style={{fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:!classFilter?'var(--teal)':'var(--muted)'}}>My Class</div>
                      <div style={{fontSize:'17px',fontWeight:900,color:!classFilter?'var(--teal)':'rgba(255,255,255,.6)',fontFamily:'var(--fd)'}}>{profile.classLevel}</div>
                      <div style={{fontSize:'10px',color:'var(--muted)'}}>{studentAgeGroup}</div>
                    </button>
                  </div>
                  <div className="content">

                    {/* ── CLASS FILTER PILLS ───────────────────────────────────
                        Row of pill buttons: My Class | Class 1 | Class 2 | … | All Topics
                        "My Class" is the default and is always pre-selected on login.
                        Additional classes can be toggled on/off individually.
                        "All Topics" shows every class at once.
                    ──────────────────────────────────────────────────────────── */}
                    <div style={{
                      display:'flex',flexWrap:'wrap',gap:'8px',alignItems:'center',
                      marginBottom:'20px',padding:'14px 16px',
                      background:'var(--surf)',border:'1px solid var(--border)',
                      borderRadius:'14px',
                    }}>
                      {/* "My Class" pill — default/reset */}
                      <button
                        onClick={()=>setClassFilter(null)}
                        style={{
                          padding:'6px 14px',borderRadius:'100px',fontFamily:'var(--fb)',
                          fontSize:'13px',fontWeight:700,cursor:'pointer',transition:'all .15s',
                          background: !classFilter ? 'var(--teal)' : 'rgba(255,255,255,.06)',
                          color:      !classFilter ? '#0a0f2c'     : 'rgba(255,255,255,.6)',
                          border:     !classFilter ? '1px solid var(--teal)' : '1px solid rgba(255,255,255,.1)',
                        }}
                      >
                        <i className="fa-solid fa-star" style={{marginRight:'5px',fontSize:'11px'}} />
                        My Class ({profile.classLevel})
                      </button>

                      {/* Divider */}
                      <div style={{width:'1px',height:'22px',background:'var(--border)',margin:'0 2px'}} />

                      {/* Individual class pills */}
                      {ALL_CLASSES.filter(cls=>cls!==profile.classLevel).map(cls=>{
                        const isSet = classFilter instanceof Set && classFilter.has(cls);
                        return (
                          <button
                            key={cls}
                            onClick={()=>{
                              if (classFilter === 'all') {
                                // Coming from "All" — start a fresh Set with just this class
                                setClassFilter(new Set([cls]));
                              } else if (!classFilter) {
                                // Coming from "My Class" default — add this class alongside own
                                setClassFilter(new Set([profile.classLevel, cls]));
                              } else {
                                const next = new Set(classFilter);
                                if (isSet) {
                                  next.delete(cls);
                                  // If set is now empty or only own class remains, go back to default
                                  if (next.size === 0 || (next.size === 1 && next.has(profile.classLevel))) setClassFilter(null);
                                  else setClassFilter(next);
                                } else {
                                  next.add(cls);
                                  setClassFilter(next);
                                }
                              }
                            }}
                            style={{
                              padding:'6px 14px',borderRadius:'100px',fontFamily:'var(--fb)',
                              fontSize:'13px',fontWeight:700,cursor:'pointer',transition:'all .15s',
                              background: isSet ? 'rgba(168,85,247,.18)' : 'rgba(255,255,255,.05)',
                              color:      isSet ? '#c084fc'               : 'rgba(255,255,255,.55)',
                              border:     isSet ? '1px solid rgba(168,85,247,.4)' : '1px solid rgba(255,255,255,.08)',
                            }}
                          >
                            {cls}
                          </button>
                        );
                      })}

                      {/* Divider */}
                      <div style={{width:'1px',height:'22px',background:'var(--border)',margin:'0 2px'}} />

                      {/* "All Topics" pill */}
                      <button
                        onClick={()=>setClassFilter(classFilter==='all' ? null : 'all')}
                        style={{
                          padding:'6px 14px',borderRadius:'100px',fontFamily:'var(--fb)',
                          fontSize:'13px',fontWeight:700,cursor:'pointer',transition:'all .15s',
                          background: classFilter==='all' ? 'rgba(245,166,35,.18)' : 'rgba(255,255,255,.05)',
                          color:      classFilter==='all' ? 'var(--accent)'         : 'rgba(255,255,255,.55)',
                          border:     classFilter==='all' ? '1px solid rgba(245,166,35,.35)' : '1px solid rgba(255,255,255,.08)',
                        }}
                      >
                        <i className="fa-solid fa-layer-group" style={{marginRight:'5px',fontSize:'11px'}} />
                        All Topics
                      </button>

                      {/* Active filter summary label */}
                      {classFilter && (
                        <div style={{marginLeft:'auto',fontSize:'12px',color:'var(--muted)',fontWeight:600,display:'flex',alignItems:'center',gap:'6px'}}>
                          <i className="fa-solid fa-filter" style={{fontSize:'10px'}} />
                          {classFilter==='all' ? 'All classes' : `${[...classFilter].sort().join(' + ')}`}
                          <button
                            onClick={()=>setClassFilter(null)}
                            style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',padding:'2px 4px',fontSize:'12px',marginLeft:'2px'}}
                            title="Clear filter"
                          >✕</button>
                        </div>
                      )}
                    </div>

                    {/* ── PROGRESS SUMMARY STRIP ─────────────────────────────── */}
                    {(() => {
                      const totalTopics     = FILTERED_SUBJECTS.reduce((s,subj)=>s+allTopicsForSubjectKey(subj.Subject).length,0);
                      const completedTopics = FILTERED_SUBJECTS.reduce((s,subj)=>s+ageSubjectStats(subj.Subject).completed,0);
                      const pendingAsgns    = ASGN.filter(a=>['Not Started','In Progress','Overdue'].includes(a.Status)).length;
                      const overdueCnt      = ASGN.filter(a=>a.Status==='Overdue').length;
                      return (
                        <div className="asgn-summary-strip" style={{marginBottom:'20px'}}>
                          <div className="asgn-summary-cell">
                            <div className="asgn-summary-val" style={{color:'var(--teal)'}}>{FILTERED_SUBJECTS.length}</div>
                            <div className="asgn-summary-lbl">Subjects</div>
                          </div>
                          <div className="asgn-summary-cell">
                            <div className="asgn-summary-val" style={{color:'#fff'}}>{totalTopics}</div>
                            <div className="asgn-summary-lbl">Topics</div>
                          </div>
                          <div className="asgn-summary-cell">
                            <div className="asgn-summary-val" style={{color:'#22c55e'}}>{completedTopics}</div>
                            <div className="asgn-summary-lbl">Completed</div>
                          </div>
                          <div className="asgn-summary-cell">
                            <div className="asgn-summary-val" style={{color:overdueCnt>0?'#ef4444':'var(--accent)'}}>{pendingAsgns}</div>
                            <div className="asgn-summary-lbl">Pending</div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── RECOMMENDED FOCUS AREAS (only for own class) ─────── */}
                    {!classFilter && (() => {
                      const weakSubjects = ASGN_SUBJ.filter(subj => {
                        const stats = ageSubjectStats(subj.Subject);
                        return stats.attempted >= 5 && (stats.correct/stats.attempted) < 0.65;
                      });
                      if (!weakSubjects.length) return null;
                      return (
                        <div className="card" style={{borderColor:'rgba(245,166,35,.3)',marginBottom:'20px'}}>
                          <div className="card-t" style={{color:'var(--accent)'}}>
                            <i className="fa-solid fa-lightbulb" /> Recommended Focus Areas
                          </div>
                          <p style={{fontSize:'13px',color:'rgba(255,255,255,.6)',marginBottom:'14px',lineHeight:1.7}}>
                            Based on your quiz performance, extra practice is recommended in:
                          </p>
                          {weakSubjects.map(subj => {
                            const stats = ageSubjectStats(subj.Subject);
                            const acc = stats.attempted ? Math.round((stats.correct/stats.attempted)*100) : 0;
                            return (
                              <div key={subj.Subject} style={{display:'flex',alignItems:'center',gap:'12px',padding:'11px 0',borderBottom:'1px solid rgba(255,255,255,.06)'}}>
                                <div style={{width:'34px',height:'34px',borderRadius:'9px',background:`${subj['Color (Hex)']}22`,color:subj['Color (Hex)'],display:'flex',alignItems:'center',justifyContent:'center',fontSize:'14px',flexShrink:0}}>
                                  {subj.Emoji || <i className={`fa-solid ${subj['Icon (FontAwesome solid)']||'fa-book'}`} />}
                                </div>
                                <div style={{flex:1}}>
                                  <div style={{fontWeight:700,color:'#fff',fontSize:'14px'}}>{subj.Subject}</div>
                                  <div style={{fontSize:'12px',color:'rgba(255,255,255,.5)'}}>{stats.attempted} questions · {acc}% accuracy</div>
                                </div>
                                <button
                                  className="btn-t"
                                  style={{padding:'6px 12px',fontSize:'12px'}}
                                  onClick={()=>{setActiveAssignmentSubject(subj.Subject);setExpandedSubject(null);}}
                                >
                                  Practice
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}

                    {/* ── SUBJECT CARDS ─────────────────────────────────────── */}
                    <div className="sec-divider" style={{marginTop:0}}>
                      {!classFilter ? `Your Subjects — ${profile.classLevel}` : classFilter==='all' ? 'All Subjects (All Classes)' : `Subjects — ${[...classFilter].sort().join(', ')}`}
                    </div>

                    {FILTERED_SUBJECTS.map((subj) => {
                      const subjectName = subj.Subject;
                      const color       = subj['Color (Hex)'] || '#00c6a7';
                      const icon        = subj['Icon (FontAwesome solid)'] || 'fa-book';
                      const emoji       = subj.Emoji || '';
                      const stats       = ageSubjectStats(subjectName);
                      const isExpanded  = expandedSubject === subjectName;
                      const quizTopics  = topicsForSubjectKey(subjectName);

                      return (
                        <div key={subjectName} className="age-subj-card" style={{borderColor: isExpanded ? color+'44' : 'var(--border)'}}>
                          {/* Card header — always visible, click to expand */}
                          <div
                            className="age-subj-header"
                            onClick={() => setExpandedSubject(isExpanded ? null : subjectName)}
                            role="button" tabIndex={0}
                            onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setExpandedSubject(isExpanded?null:subjectName);}}}
                          >
                            <div style={{display:'flex',alignItems:'center',gap:'14px',flex:1,minWidth:0}}>
                              <div className="age-subj-icon" style={{background:`${color}18`,color,flexShrink:0}}>
                                {emoji || <i className={`fa-solid ${icon}`} />}
                              </div>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>
                                  <span className="age-subj-name">{subjectName}</span>
                                  {/* Class badge when the sheet has tagged this subject for a specific class */}
                                  {subj.Class && (
                                    <span style={{fontSize:'10px',fontWeight:700,padding:'2px 8px',borderRadius:'100px',
                                      background:'rgba(255,255,255,.06)',color:'var(--muted)',border:'1px solid rgba(255,255,255,.08)'}}>
                                      {subj.Class}
                                    </span>
                                  )}
                                </div>
                                <div style={{fontSize:'12px',color:'var(--muted)',marginTop:'2px'}}>{subj.Tagline}</div>
                              </div>
                            </div>
                            {/* Progress summary */}
                            <div style={{display:'flex',alignItems:'center',gap:'16px',flexShrink:0}}>
                              {stats.total > 0 && (
                                <div style={{textAlign:'right'}}>
                                  <div style={{fontSize:'18px',fontWeight:900,color:stats.pct>=75?'#22c55e':stats.pct>=40?'var(--accent)':'rgba(255,255,255,.6)',fontFamily:'var(--fd)'}}>{stats.pct}%</div>
                                  <div style={{fontSize:'11px',color:'var(--muted)'}}>{stats.completed}/{stats.total} topics</div>
                                </div>
                              )}
                              {/* Quick-open button (shown when collapsed) — only if there's
                                  at least one playable (not-yet-completed) topic. */}
                              {!isExpanded && quizTopics.length > 0 && (
                                <button
                                  className="btn-t"
                                  style={{padding:'6px 12px',fontSize:'12px',flexShrink:0}}
                                  onClick={e=>{e.stopPropagation();setActiveAssignmentSubject(subjectName);setExpandedSubject(null);}}
                                >
                                  Start <i className="fa-solid fa-arrow-right" style={{fontSize:'11px',marginLeft:'4px'}} />
                                </button>
                              )}
                              <i className={`fa-solid fa-chevron-${isExpanded?'up':'down'}`} style={{color:'var(--muted)',fontSize:'13px'}} />
                            </div>
                          </div>

                          {/* Progress bar — visible whenever this subject has any topics at
                              all (including fully completed ones), so a 100%-complete subject
                              still shows its progress rather than disappearing. */}
                          {stats.total > 0 && (
                            <div style={{padding:'0 20px 12px'}}>
                              <div style={{height:'5px',background:'rgba(255,255,255,.07)',borderRadius:'100px',overflow:'hidden'}}>
                                <div style={{height:'100%',width:`${stats.pct}%`,background:stats.pct>=75?'#22c55e':stats.pct>=40?'var(--accent)':color,borderRadius:'100px',transition:'width .6s ease'}} />
                              </div>
                              <div style={{display:'flex',justifyContent:'space-between',marginTop:'4px',fontSize:'11px',color:'var(--muted)'}}>
                                <span>✓ {stats.completed} Completed</span>
                                <span>○ {stats.remaining} Remaining</span>
                              </div>
                            </div>
                          )}

                          {/* Expanded content */}
                          {isExpanded && (
                            <div className="age-subj-expanded">
                              <div style={{padding:'0 20px 6px',borderTop:'1px solid rgba(255,255,255,.06)',marginTop:'4px'}}>

                                {quizTopics.length === 0 ? (
                                  stats.total > 0 ? (
                                    // Issue 3: all topics in this subject are completed (and no new
                                    // questions have been added since) — direct the student to the
                                    // Completed Topics tab rather than implying there's no content.
                                    <div style={{textAlign:'center',padding:'24px 0'}}>
                                      <div style={{fontSize:'32px',marginBottom:'10px'}}>🎉</div>
                                      <div style={{fontWeight:700,color:'#fff',marginBottom:'6px'}}>All {subjectName} topics completed!</div>
                                      <div style={{fontSize:'13px',color:'var(--muted)',lineHeight:1.7}}>
                                        Great work — find your finished topics, scores, and time taken in the <strong>Completed Topics</strong> tab. New topics will appear here as soon as your teacher adds them.
                                      </div>
                                    </div>
                                  ) : (
                                    <div style={{textAlign:'center',padding:'24px 0'}}>
                                      <div style={{fontSize:'32px',marginBottom:'10px'}}>🚧</div>
                                      <div style={{fontWeight:700,color:'#fff',marginBottom:'6px'}}>Content Coming Soon</div>
                                      <div style={{fontSize:'13px',color:'var(--muted)',lineHeight:1.7}}>
                                        Your teacher will add {subjectName} topics shortly.
                                      </div>
                                    </div>
                                  )
                                ) : (
                                  <>
                                    {/* Topic list — each row is one Learning Module from the sheet */}
                                    <div style={{marginTop:'14px'}}>
                                      <div style={{fontSize:'11px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--muted)',marginBottom:'10px'}}>
                                        Topics ({quizTopics.length})
                                      </div>
                                      {quizTopics.map((module) => {
                                        const mid       = module['Module ID'];
                                        const modDone   = !!learnProgress[mid]?.completedAt;
                                        const stepsCount = stepsFor(mid).length;
                                        const subs = subtopicsFor(module);
                                        return (
                                          <div key={mid} style={{marginBottom:'8px',borderRadius:'10px',border:'1px solid rgba(255,255,255,.06)',overflow:'hidden'}}>
                                            <div
                                              style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:'rgba(255,255,255,.03)',cursor:'pointer'}}
                                              onClick={()=>{ setActiveAssignmentSubject(subjectName); setActiveModuleId(mid); setExpandedSubject(null); }}
                                            >
                                              <div style={{display:'flex',alignItems:'center',gap:'9px'}}>
                                                <i className="fa-solid fa-folder-open" style={{color,fontSize:'12px'}} />
                                                <span style={{fontWeight:700,color:'rgba(255,255,255,.85)',fontSize:'13px'}}>{module.Title}</span>
                                                {stepsCount > 0 && <span style={{fontSize:'10px',padding:'1px 7px',borderRadius:'100px',background:`${color}22`,color,fontWeight:700}}>{stepsCount} step{stepsCount!==1?'s':''}</span>}
                                              </div>
                                              <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                                                {modDone && <i className="fa-solid fa-circle-check" style={{color:'#22c55e',fontSize:'13px'}} />}
                                                <i className="fa-solid fa-chevron-right" style={{color:'var(--muted)',fontSize:'10px'}} />
                                              </div>
                                            </div>
                                            {/* Subtopics pills (from Subtopics column in sheet) */}
                                            {subs.length > 0 && (
                                              <div style={{display:'flex',flexWrap:'wrap',gap:'5px',padding:'8px 14px 10px'}}>
                                                {subs.map((st,sti)=>(
                                                  <span key={sti} style={{fontSize:'11px',padding:'2px 9px',background:'rgba(255,255,255,.04)',borderRadius:'100px',color:'var(--muted)',border:'1px solid rgba(255,255,255,.06)'}}>{st}</span>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                    {/* Open all lessons button */}
                                    <div style={{textAlign:'center',padding:'12px 0 6px'}}>
                                      <button
                                        className="btn-t"
                                        style={{fontSize:'13px',padding:'9px 20px'}}
                                        onClick={()=>{setActiveAssignmentSubject(subjectName);setExpandedSubject(null);}}
                                      >
                                        <i className="fa-solid fa-book-open" style={{marginRight:'6px'}} />
                                        Open All {subjectName} Lessons
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* ── PENDING ASSIGNMENTS (compact, collapsible) ─────────── */}
                    {ASGN.filter(a=>['Not Started','In Progress','Overdue'].includes(a.Status)).length > 0 && (
                      <div className="card" style={{marginTop:'8px',marginBottom:'20px',borderColor:'rgba(245,166,35,.2)'}}>
                        <div className="card-t" style={{cursor:'pointer'}}
                          onClick={()=>setExpandedSubject(expandedSubject==='__asgn__'?null:'__asgn__')}>
                          <span><i className="fa-solid fa-list-check" style={{marginRight:'6px'}} />
                          Pending Assignments ({ASGN.filter(a=>['Not Started','In Progress','Overdue'].includes(a.Status)).length})</span>
                          <i className={`fa-solid fa-chevron-${expandedSubject==='__asgn__'?'up':'down'}`} style={{marginLeft:'auto',color:'var(--muted)',fontSize:'12px'}} />
                        </div>
                        {expandedSubject==='__asgn__' && ASGN.filter(a=>['Not Started','In Progress','Overdue'].includes(a.Status)).map(a => {
                          const statusMeta = {
                            'Overdue':     {cls:'overdue',   label:'⚠ Overdue',   dot:'#ef4444'},
                            'Not Started': {cls:'pending',   label:'Not Started', dot:'rgba(255,255,255,.3)'},
                            'In Progress': {cls:'inprogress',label:'In Progress', dot:'var(--accent)'},
                          };
                          const sm = statusMeta[a.Status] || statusMeta['Not Started'];
                          const dueStr = a.DueDate || a['Due Date'] || '';
                          const daysAway = dueStr ? Math.ceil((new Date(dueStr)-new Date())/86400000) : null;
                          const dueColor = a.Status==='Overdue'?'#ef4444':daysAway<=1?'#f97316':daysAway<=3?'var(--accent)':'var(--muted)';
                          return (
                            <div key={a['Assignment ID']||Math.random()} className="asgn-item asgn-item-v2">
                              <div className="asgn-dot" style={{background:sm.dot}} />
                              <div className="asgn-body" style={{flex:1}}>
                                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'8px',flexWrap:'wrap'}}>
                                  <div>
                                    <div className="asgn-title">{a.Title}</div>
                                    <div className="asgn-meta">
                                      {a.Subject}
                                      {dueStr && <> · <span style={{color:dueColor,fontWeight:600}}>Due {dueStr}</span></>}
                                    </div>
                                  </div>
                                  <span className={`asgn-badge ${sm.cls}`}>{sm.label}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {expandedSubject!=='__asgn__' && (
                          <div style={{fontSize:'12px',color:'var(--muted)',padding:'2px 0 8px',display:'flex',gap:'12px',flexWrap:'wrap'}}>
                            {ASGN.filter(a=>a.Status==='Overdue').length>0 && <span style={{color:'#ef4444',fontWeight:700}}><i className="fa-solid fa-circle-exclamation" style={{marginRight:'4px'}} />{ASGN.filter(a=>a.Status==='Overdue').length} Overdue</span>}
                            {ASGN.filter(a=>a.Status==='In Progress').length>0 && <span style={{color:'var(--accent)',fontWeight:700}}><i className="fa-solid fa-spinner" style={{marginRight:'4px'}} />{ASGN.filter(a=>a.Status==='In Progress').length} In Progress</span>}
                            {ASGN.filter(a=>a.Status==='Not Started').length>0 && <span style={{color:'rgba(255,255,255,.5)',fontWeight:600}}>{ASGN.filter(a=>a.Status==='Not Started').length} Not Started</span>}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── HOMEWORK SUBMISSION ─────────────────────────────────── */}
                    <div className="card">
                      <div className="card-t"><i className="fa-solid fa-cloud-arrow-up" /> {t('p_submit_homework')}</div>
                      <label className="upload-zone" htmlFor="hwFile">
                        <div style={{fontSize:'30px',color:'var(--muted)',marginBottom:'10px'}}><i className="fa-solid fa-cloud-arrow-up" /></div>
                        <p style={{fontSize:'14px',color:'rgba(255,255,255,.6)',marginBottom:'6px'}}>{S.UploadZonePrimary}</p>
                        <p style={{fontSize:'12px',color:'var(--muted)'}}>{S.UploadZoneSub}</p>
                      </label>
                      <input id="hwFile" type="file" style={{display:'none'}} onChange={e=>{setUploadName(e.target.files[0]?.name||'');setUploadDone(false);}} />
                      {uploadName && <p style={{fontSize:'13px',color:'var(--teal)',marginTop:'12px',fontWeight:600}}><i className="fa-solid fa-paperclip" /> {uploadName}</p>}
                      <div style={{textAlign:'center',marginTop:'16px'}}>
                        <button className="btn-t" onClick={()=>{ if(!uploadName){alert(S.UploadValidationError);return;} setUploadDone(true); }}>
                          <i className="fa-solid fa-paper-plane" /> {t('p_submit_assignment')}
                        </button>
                      </div>
                      {uploadDone && <div style={{background:'rgba(34,197,94,.1)',border:'1px solid rgba(34,197,94,.2)',color:'#4ade80',borderRadius:'10px',padding:'13px',fontSize:'13px',fontWeight:600,marginTop:'14px',textAlign:'center'}}>✅ {uploadMsg}</div>}
                    </div>
                  </div>
                </>
              ) : !activeModuleId ? (
                /* ── STEP 2: Topic grid, filtered to the chosen subject ── */
                <div className="content">
                  <div className="asgn-breadcrumb">
                    <span className="asgn-crumb" onClick={()=>{setActiveAssignmentSubject(null);setActiveModuleId(null);setExpandedSubject(null);}}>{t('p_breadcrumb_assignments')}</span>
                    <i className="fa-solid fa-chevron-right asgn-crumb-sep" />
                    <span className="asgn-crumb-current">{activeAssignmentSubject}</span>
                  </div>
                  <button className="lp-back" onClick={()=>setActiveAssignmentSubject(null)}><i className="fa-solid fa-arrow-left" /> Back to Subjects</button>
                  <div className="sec-divider" style={{marginTop:0}}>{activeAssignmentSubject} {t('p_topics_suffix')}</div>
                  <LearningModulesGrid modules={topicsForSubjectKey(activeAssignmentSubject)} stepsFor={stepsFor} progressMap={learnProgress} onOpen={setActiveModuleId} t={t} />
                </div>
              ) : (
                /* ── STEP 3: Introduction → Progressive Learning → Completion ── */
                <>
                  <div className="asgn-breadcrumb">
                    <span className="asgn-crumb" onClick={()=>{setActiveAssignmentSubject(null);setActiveModuleId(null);setExpandedSubject(null);}}>{t('p_breadcrumb_assignments')}</span>
                    <i className="fa-solid fa-chevron-right asgn-crumb-sep" />
                    <span className="asgn-crumb" onClick={()=>setActiveModuleId(null)}>{activeAssignmentSubject}</span>
                    <i className="fa-solid fa-chevron-right asgn-crumb-sep" />
                    <span className="asgn-crumb-current">{ASSIGN_LMOD.find(m=>m['Module ID']===activeModuleId)?.Title}</span>
                    <button className={`asgn-share-btn${shareCopied?' copied':''}`} onClick={copyShareLink} title="Copy a link straight to this quiz">
                      <i className={`fa-solid ${shareCopied ? 'fa-check' : 'fa-share-nodes'}`} /> {shareCopied ? 'Copied!' : 'Share'}
                    </button>
                  </div>
                  <LearningModulePlayer
                    key={activeModuleId}
                    module={ASSIGN_LMOD.find(m=>m['Module ID']===activeModuleId)}
                    steps={stepsFor(activeModuleId)}
                    progress={learnProgress[activeModuleId]}
                    onSave={patch=>saveLearnProgress(activeModuleId, patch)}
                    onAnswer={recordAnswer}
                    onExit={()=>setActiveModuleId(null)}
                    backLabel={`${t('p_back_to')} ${activeAssignmentSubject} ${t('p_topics_suffix')}`}
                    soundConfig={cfg.config || {}}
                    timerConfig={cfg.config || {}}
                    profile={profile}
                    t={t}
                  />
                </>
              ))}
            </>)}



            {/* ── ASSIGNMENTS FOR YOU ─────────────────────────────────────
                Chapter-specific homework a parent/teacher assigned from the
                Parent Portal builder table (My Students → Assignments tab).
                One row per chapter; "Start Quiz" opens the exact assigned
                question range and marks the row Completed automatically on
                finishing the last assigned question. */}
            {tab==='myassignments' && (
              activeMyAssignmentId ? (() => {
                const row = myAssignments.find(a => a.AssignmentID === activeMyAssignmentId);
                if (!row) { setActiveMyAssignmentId(null); return null; }
                const module = LMOD.find(m => m['Module ID'] === row.ModuleID);
                const steps  = stepsFor(row.ModuleID);

                // Self-diagnosing guard: rather than diving into the quiz player
                // and hitting its generic "no steps yet" message, explain exactly
                // what's missing so the student/teacher knows what to fix.
                if (!module || steps.length === 0) {
                  return (
                    <>
                      <div className="asgn-breadcrumb">
                        <span className="asgn-crumb" onClick={()=>setActiveMyAssignmentId(null)}>Assignments for you</span>
                        <i className="fa-solid fa-chevron-right asgn-crumb-sep" />
                        <span className="asgn-crumb-current">{row.ChapterTitle || row.ModuleID}</span>
                      </div>
                      <div className="content">
                        <div className="card" style={{textAlign:'center',borderColor:'rgba(239,68,68,.25)'}}>
                          <i className="fa-solid fa-triangle-exclamation" style={{fontSize:'24px',color:'#f87171',marginBottom:'10px',display:'block'}} />
                          {!module ? (
                            <>This chapter ("{row.ChapterTitle || row.ModuleID}") couldn't be found for your class. Ask your teacher to double-check it was assigned to the right class.</>
                          ) : (
                            <>"{module.Title}" doesn't have any questions added yet on your class's sheet, so it can't be opened right now. Let your teacher know — once questions are added to its Learning Steps tab, this will open normally.</>
                          )}
                          <div style={{marginTop:'16px'}}>
                            <button className="lp-back" onClick={()=>setActiveMyAssignmentId(null)}><i className="fa-solid fa-arrow-left" /> Back to Assignments for you</button>
                          </div>
                        </div>
                      </div>
                    </>
                  );
                }

                return (
                  <>
                    <div className="asgn-breadcrumb">
                      <span className="asgn-crumb" onClick={()=>setActiveMyAssignmentId(null)}>Assignments for you</span>
                      <i className="fa-solid fa-chevron-right asgn-crumb-sep" />
                      <span className="asgn-crumb-current">{row.ChapterTitle || module?.Title}</span>
                      <button className={`asgn-share-btn${shareCopied?' copied':''}`} onClick={copyShareLink} title="Copy a link straight to this quiz">
                        <i className={`fa-solid ${shareCopied ? 'fa-check' : 'fa-share-nodes'}`} /> {shareCopied ? 'Copied!' : 'Share'}
                      </button>
                    </div>
                    <LearningModulePlayer
                      key={activeMyAssignmentId}
                      module={module}
                      steps={steps}
                      rangeFrom={Number(row.FromQuestion) || 1}
                      rangeTo={Number(row.ToQuestion) || steps.length}
                      progress={learnProgress[row.ModuleID]}
                      onSave={patch=>saveLearnProgress(row.ModuleID, patch)}
                      onAnswer={recordAnswer}
                      onExit={()=>setActiveMyAssignmentId(null)}
                      onRangeComplete={()=>completeMyAssignment(row.AssignmentID)}
                      backLabel="Back to Assignments for you"
                      soundConfig={cfg.config || {}}
                      timerConfig={cfg.config || {}}
                      profile={profile}
                      t={t}
                    />
                  </>
                );
              })() : (
                <>
                  <div className="main-top"><div><div className="pg-h">Assignments for you</div><div className="pg-s">Chapters your teacher or parent has assigned, with the exact questions to answer</div></div></div>
                  <div className="content">
                    {myAssignmentsLoading && myAssignments.length === 0 ? (
                      <div className="card" style={{textAlign:'center',color:'var(--muted)'}}><i className="fa-solid fa-circle-notch fa-spin" /> Loading your assignments…</div>
                    ) : myAssignments.length === 0 ? (
                      <div className="card" style={{textAlign:'center',color:'var(--muted)'}}>
                        <i className="fa-solid fa-clipboard-list" style={{fontSize:'26px',marginBottom:'10px',display:'block',opacity:.5}} />
                        No assignments yet — your teacher or parent hasn't assigned any chapters.
                      </div>
                    ) : (
                      <div className="card">
                        <div className="card-t"><i className="fa-solid fa-clipboard-list" /> Your Assigned Chapters ({myAssignments.length})</div>
                        {myAssignments
                          .slice()
                          .sort((a,b)=> (a.Status==='Completed'?1:0) - (b.Status==='Completed'?1:0))
                          .map(a => {
                            const isDone = a.Status === 'Completed';
                            const total  = Number(a.TotalQuestions) || (Number(a.ToQuestion)-Number(a.FromQuestion)+1) || 0;
                            return (
                              <div key={a.AssignmentID} className="asgn-item asgn-item-v2">
                                <div className="asgn-dot" style={{background:isDone?'#22c55e':'var(--accent)'}} />
                                <div className="asgn-body" style={{flex:1}}>
                                  <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'10px',flexWrap:'wrap'}}>
                                    <div>
                                      <div className="asgn-title">{a.ChapterTitle || a.ModuleID}</div>
                                      <div className="asgn-meta">
                                        {a.Subject}{a.ClassLevel ? ` · ${a.ClassLevel}` : ''} · Q{a.FromQuestion}–{a.ToQuestion} of {total}
                                        {a.AssignedDate && <> · Assigned {String(a.AssignedDate).slice(0,10)}</>}
                                      </div>
                                      {a.Comments && (
                                        <div style={{fontSize:'11px',color:'rgba(0,198,167,.75)',marginTop:'4px',fontStyle:'italic'}}>
                                          <i className="fa-solid fa-comment-dots" style={{marginRight:'4px'}} />{a.Comments}
                                        </div>
                                      )}
                                    </div>
                                    <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:'8px'}}>
                                      <span className={`asgn-badge ${isDone?'graded':'pending'}`}>{isDone?'✓ Completed':a.Status||'Task assigned'}</span>
                                      {!isDone && (
                                        <button className="btn-t btn-t-sm" onClick={()=>setActiveMyAssignmentId(a.AssignmentID)}>
                                          <i className="fa-solid fa-play" /> Start Quiz
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                </>
              )
            )}



            {/* ── COMPLETED TOPICS ──────────────────────────────────────────
                Lists every module the student has finished, the date it was
                completed, and the time taken (from the timer or sheet log). */}
            {tab==='completedtopics' && (
              <>
                <div className="main-top">
                  <div>
                    <div className="pg-h">Completed Topics</div>
                    <div className="pg-s">Topics you have finished — when you completed them and how long it took</div>
                  </div>
                </div>
                <CompletedTopicsTab
                  learnProgress={learnProgress}
                  learningModules={LMOD}
                  subjects={ASSIGN_SUBJ}
                  stepsFor={stepsFor}
                  saveLearnProgress={saveLearnProgress}
                  onRetake={(moduleId, subjectName) => {
                    setActiveAssignmentSubject(subjectName);
                    setActiveModuleId(moduleId);
                    setTab('assignments');
                  }}
                />
              </>
            )}
            {/* SCHEDULE */}
            {tab==='schedule' && (<>
              <div className="main-top"><div><div className="pg-h">{t('p_schedule_title')}</div><div className="pg-s">{t('p_schedule_subtitle')}</div></div></div>
              <div className="content">
                <div className="card">
                  <div className="card-t"><i className="fa-solid fa-calendar-days" /> {t('p_schedule_card_title')}</div>
                  {SCHED.map((u,i)=>(
                    <div key={i} className="sch-item">
                      <div className="sch-color" style={{background:u['Color (Hex)']}} />
                      <div className="sch-body"><div className="sch-subj">{u.Subject}</div><div className="sch-meta"><i className="fa-solid fa-user" style={{fontSize:'11px',marginRight:4}} />{u.Teacher}</div></div>
                      <div className="sch-right">
                        <div className="sch-time">{u.Time}</div><div className="sch-date">{u.Date}</div>
                        <span style={{fontSize:'10px',fontWeight:700,padding:'2px 8px',borderRadius:'100px',marginTop:4,display:'inline-block',
                          background:u.Mode==='Physical'?'rgba(34,197,94,.12)':u.Mode==='Online'?'rgba(59,130,246,.12)':'rgba(168,85,247,.12)',
                          color:u.Mode==='Physical'?'#4ade80':u.Mode==='Online'?'#60a5fa':'#c084fc'}}>{t(`sched_mode_${u.Mode.toLowerCase()}`)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>)}

            {/* NOTIFICATIONS */}
            {tab==='notifications' && (<>
              <div className="main-top">
                <div><div className="pg-h">{t('p_notifications_title')}</div><div className="pg-s">{unreadCount} {unreadCount===1?t('p_unread_messages_one'):t('p_unread_messages_many')}</div></div>
                {unreadCount>0 && <button className="btn-outline" onClick={()=>setNotifs(n=>n.map(x=>({...x,Unread:false})))}><i className="fa-solid fa-check-double" /> {t('p_mark_all_read')}</button>}
              </div>
              <div className="content">
                <div className="card">
                  {notifs.map((n,i)=>{
                    const ns=notifStyle(n.Type);
                    return (
                      <div key={i} className={`notif-item${n.Unread?' unread':''}`}>
                        <div className="notif-ic" style={{background:ns.bg,color:ns.cl}}><i className={`fa-solid ${n.Icon}`} /></div>
                        <div style={{flex:1}}>
                          <div className="notif-title">{n.Title}</div>
                          <div className="notif-body">{n.Body}</div>
                          <div className="notif-time">{n.Timestamp}</div>
                        </div>
                        {n.Unread && <div className="unread-dot" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>)}

            {/* PROFILE */}
            {tab==='profile' && (<>
              <div className="main-top">
                <div><div className="pg-h">{t('p_profile_title')}</div><div className="pg-s">{t('p_profile_subtitle')}</div></div>
                <button className="btn-outline" onClick={()=>setProfileEdit(!profileEdit)}>
                  <i className={`fa-solid ${profileEdit?'fa-xmark':'fa-pen'}`} /> {profileEdit?t('p_cancel'):t('p_edit_profile')}
                </button>
              </div>
              <div className="content">
                {/* ── Account details card ── */}
                <div className="card" style={{marginBottom:'20px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'20px',marginBottom:'28px',paddingBottom:'20px',borderBottom:'1px solid var(--border)'}}>
                    <div style={{width:'72px',height:'72px',borderRadius:'20px',background:'linear-gradient(135deg,var(--teal),#0099cc)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'28px',color:'#fff',flexShrink:0}}>
                      <i className="fa-solid fa-user-graduate" />
                    </div>
                    <div>
                      <div style={{fontFamily:'var(--fd)',fontSize:'22px',fontWeight:900,color:'#fff',marginBottom:'4px'}}>{profile.name}</div>
                      <div style={{fontSize:'13px',color:'var(--muted)',marginBottom:'6px'}}>{profile.id} · {profile.classLevel}</div>
                      <div style={{display:'inline-flex',alignItems:'center',gap:'6px',fontSize:'12px',fontWeight:700,padding:'4px 12px',borderRadius:'100px',background:'rgba(0,198,167,.1)',color:'var(--teal)',border:'1px solid rgba(0,198,167,.2)'}}>
                        <i className="fa-solid fa-circle" style={{fontSize:'8px'}} /> {S.EnrolmentStatus} {t('p_student_suffix')}
                      </div>
                    </div>
                  </div>
                  <div className="card-t"><i className="fa-solid fa-id-card" /> {t('p_account_details')}</div>

                  {/* Profile fields — controlled inputs when editing */}
                  {profileEdit ? (
                    <div>
                      <div className="prof-g">
                        {/* Class Level dropdown */}
                        <div className="prof-field">
                          <span className="prof-label">Class Level</span>
                         <select
  id="pf-ClassLevel"
  defaultValue={profile.classLevel}
  className="prof-inp"
>
  {CLASS_LEVELS.map(c => (
    <option key={c.Class} value={c.Class}>
      {c.Label || c.Class}{c.Age ? ` (${c.Age})` : ''}
    </option>
  ))}
</select>
                        </div>
                        {/* Email */}
                        <div className="prof-field">
                          <span className="prof-label">Email</span>
                          <input id="pf-Email" type="email" className="prof-inp"
                            defaultValue={PFIELDS.find(f=>f['Field Key']==='email')?.Value||''}
                            placeholder="email@example.com" />
                        </div>
                        {/* Phone */}
                        <div className="prof-field">
                          <span className="prof-label">Phone</span>
                          <input id="pf-Phone" type="tel" className="prof-inp"
                            defaultValue={PFIELDS.find(f=>f['Field Key']==='phone')?.Value||''}
                            placeholder="+91 98765 43210" />
                        </div>
                        {/* Address */}
                        <div className="prof-field">
                          <span className="prof-label">Address</span>
                          <input id="pf-Address" className="prof-inp"
                            defaultValue={PFIELDS.find(f=>f['Field Key']==='address')?.Value||''}
                            placeholder="Your address" />
                        </div>
                      </div>
                      <div style={{marginTop:'20px',display:'flex',gap:'10px',flexWrap:'wrap'}}>
                        <button
                          className="btn-t"
                          disabled={saving==='profile'}
                          onClick={async () => {
                            const classLevelEl = document.getElementById('pf-ClassLevel');
                            const emailEl      = document.getElementById('pf-Email');
                            const phoneEl      = document.getElementById('pf-Phone');
                            const addressEl    = document.getElementById('pf-Address');
                            const updates = {
                              studentId:  profile.id,
                              classLevel: classLevelEl?.value,
                              email:      emailEl?.value,
                              phone:      phoneEl?.value,
                              address:    addressEl?.value,
                            };
                            setSaving('profile');
                            try {
                              const r = await fetch('/api/student/profile', {
                                method:  'POST',
                                headers: {'Content-Type':'application/json'},
                                body:    JSON.stringify(updates),
                              });
                              const data = await r.json();
                              if (data.success) {
                                // Update React state AND localStorage immediately
                                const newClass = classLevelEl?.value;
                                setProfile(p => {
                                  const updated = { ...p, classLevel: newClass || p.classLevel };
                                  try { localStorage.setItem('vedanta_profile', JSON.stringify(updated)); } catch {}
                                  return updated;
                                });
                                setProfileEdit(false);
                                alert('Profile saved successfully!');
                              } else {
                                alert('Save failed: ' + (data.message || 'Unknown error'));
                              }
                            } catch (err) {
                              alert('Save failed: ' + err.message);
                            } finally {
                              setSaving(null);
                            }
                          }}
                        >
                          {saving==='profile'
                            ? <><i className="fa-solid fa-circle-notch fa-spin" /> Saving…</>
                            : <><i className="fa-solid fa-check" /> {t('p_save_changes')}</>}
                        </button>
                        <button className="btn-outline" style={{padding:'11px 18px'}} onClick={()=>setProfileEdit(false)}>
                          <i className="fa-solid fa-xmark" /> {t('p_cancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Read-only display */
                    <div className="prof-g">
                      <div className="prof-field"><span className="prof-label">{t('p_full_name')}</span><span className="prof-val">{profile.name}</span></div>
                      <div className="prof-field"><span className="prof-label">{t('p_student_id')}</span><span className="prof-val">{profile.id}</span></div>
                      <div className="prof-field"><span className="prof-label">Class Level</span><span className="prof-val">{profile.classLevel}</span></div>
                      {PFIELDS.filter(f=>f.Visible!==false&&f['Field Key']!=='class_level').map((f,i)=>(
                        <div key={i} className="prof-field">
                          <span className="prof-label">{f.Label}</span>
                          <span className="prof-val">{f.Value||'—'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Password change card ── */}
                <div className="card">
                  <div className="card-t"><i className="fa-solid fa-lock" /> {t('p_change_password')}</div>
                  <div className="prof-g">
                    <div className="prof-field">
                      <span className="prof-label">{t('p_current_password')}</span>
                      <input id="pw-current" type="password" className="prof-inp" placeholder="••••••••" />
                    </div>
                    <div className="prof-field">
                      <span className="prof-label">{t('p_new_password')}</span>
                      <input id="pw-new" type="password" className="prof-inp" placeholder="Min. 6 characters" />
                    </div>
                    <div className="prof-field">
                      <span className="prof-label">{t('p_confirm_password')}</span>
                      <input id="pw-confirm" type="password" className="prof-inp" placeholder="Repeat new password" />
                    </div>
                  </div>
                  <div style={{marginTop:'20px'}}>
                    <button
                      className="btn-t"
                      disabled={saving==='password'}
                      onClick={async () => {
                        const curr    = document.getElementById('pw-current')?.value?.trim();
                        const newPw   = document.getElementById('pw-new')?.value?.trim();
                        const confirm = document.getElementById('pw-confirm')?.value?.trim();
                        if (!curr || !newPw || !confirm) { alert('Please fill in all three password fields.'); return; }
                        if (newPw !== confirm)            { alert('New passwords do not match.');               return; }
                        if (newPw.length < 6)             { alert('New password must be at least 6 characters.'); return; }
                        setSaving('password');
                        try {
                          const r = await fetch('/api/student/profile', {
                            method:  'POST',
                            headers: {'Content-Type':'application/json'},
                            body:    JSON.stringify({
                              studentId:       profile.id,
                              currentPassword: curr,
                              newPassword:     newPw,
                            }),
                          });
                          const data = await r.json();
                          if (data.success) {
                            document.getElementById('pw-current').value = '';
                            document.getElementById('pw-new').value     = '';
                            document.getElementById('pw-confirm').value = '';
                            alert('Password changed successfully! Use your new password next time you log in.');
                          } else {
                            alert('Password change failed: ' + (data.message || 'Unknown error'));
                          }
                        } catch (err) {
                          alert('Password change failed: ' + err.message);
                        } finally {
                          setSaving(null);
                        }
                      }}
                    >
                      {saving==='password'
                        ? <><i className="fa-solid fa-circle-notch fa-spin" /> Updating…</>
                        : <><i className="fa-solid fa-key" /> {t('p_update_password')}</>}
                    </button>
                  </div>
                </div>
              </div>
            </>)}

          </main>
        </div>
      )}
    </>
  );
}

export default function Portal() {
  return (
    <LanguageProvider>
      <PortalInner />
    </LanguageProvider>
  );
}
