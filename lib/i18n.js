// lib/i18n.js
//
// Small, dependency-free i18n layer for the whole site (landing page +
// student portal). Two languages today: English ('en', default) and
// Danish ('da'). Designed to be easy to extend with a third language later
// without touching every call site — just add another key to each string
// table and another case below.
//
// HOW IT WORKS
// ─────────────
// 1. <LanguageProvider> wraps each page (see pages/index.js / pages/portal.js)
//    and tracks the current language in React state, persisted to
//    localStorage under the key 'vedanta_lang' so it's remembered on the
//    user's next visit (defaults to English for first-time visitors).
// 2. useLanguage() gives any component { lang, setLang, t }.
//    - `t(key)` looks `key` up in UI_STRINGS (static interface text — nav
//      labels, buttons, headings, form labels, etc.) for the current
//      language, falling back to English, then to the key itself if it's
//      genuinely missing (so the UI never crashes — worst case it shows the
//      English/key text instead of Danish).
// 3. Quiz / learning content (questions, options, explanations) and landing
//    page CMS fallback content are NOT part of UI_STRINGS — they live in
//    lib/quizContentDA.js and lib/landingContentDA.js as parallel Danish
//    datasets shaped exactly like the existing English FALLBACK objects in
//    portal.js / index.js. The pages pick whichever dataset matches `lang`.
//
// ADDING/EDITING TRANSLATIONS
// ─────────────────────────────
// Just edit the 'da' value for the relevant key in UI_STRINGS below — no
// other file needs to change.

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

export const LANG_STORAGE_KEY = 'vedanta_lang';

// ── Static UI string table ──────────────────────────────────────────────
// Keys are grouped by area of the app purely for readability; the lookup
// itself is a flat object.
export const UI_STRINGS = {
  // ── Language toggle itself ──
  lang_toggle_label: { en: 'Language', da: 'Sprog' },

  // ── Landing page · nav ──
  nav_dashboard: { en: 'Dashboard', da: 'Dashboard' },
  nav_about:     { en: 'About',     da: 'Om os' },
  nav_classes:   { en: 'Classes',   da: 'Klassetrin' },
  nav_subjects:  { en: 'Subjects',  da: 'Fag' },
  nav_schedule:  { en: 'Schedule',  da: 'Skema' },
  nav_fees:      { en: 'Fees',      da: 'Priser' },
  nav_contact:   { en: 'Contact',   da: 'Kontakt' },
  nav_student_login: { en: 'Student Login', da: 'Elev Login' },
  nav_parent_login:  { en: 'Parent / Teacher', da: 'Forælder / Lærer' },
  nav_enroll_now: { en: 'Enroll Now', da: 'Tilmeld Nu' },
  nav_menu:      { en: 'Menu', da: 'Menu' },
  nav_open_menu: { en: 'Open menu', da: 'Åbn menu' },
  nav_close_menu:{ en: 'Close menu', da: 'Luk menu' },

  // ── Landing page · portal dashboard (live stats) ──
  pd_live_label: { en: 'Live From The Portal', da: 'Direkte Fra Portalen' },
  pd_heading_1:  { en: 'Real students,', da: 'Rigtige elever,' },
  pd_heading_2:  { en: 'real progress', da: 'reelle fremskridt' },
  pd_sub:        { en: 'Every number below updates automatically as students work through lessons in the Student Portal — nothing here is staged.', da: 'Alle tal nedenfor opdateres automatisk, når eleverne arbejder med opgaver i Elevportalen — intet her er iscenesat.' },
  pd_error:      { en: 'Live stats are temporarily unavailable — please check back shortly.', da: 'Live-statistik er midlertidigt utilgængelig — prøv venligst igen om lidt.' },
  pd_stat_total_students: { en: 'Total Students', da: 'Elever I Alt' },
  pd_stat_questions_available: { en: 'Questions Available', da: 'Tilgængelige Spørgsmål' },
  pd_stat_questions_attempted: { en: 'Questions Attempted', da: 'Besvarede Spørgsmål' },
  pd_stat_correct_answers: { en: 'Correct Answers', da: 'Korrekte Svar' },
  pd_stat_total_subjects: { en: 'Subjects Available', da: 'Tilgængelige Fag' },
  pd_stat_total_topics: { en: 'Topics Available', da: 'Tilgængelige Emner' },
  pd_leaderboard_title: { en: 'Top Students', da: 'Bedste Elever' },
  pd_lb_rank: { en: 'Rank', da: 'Placering' },
  pd_lb_student: { en: 'Student', da: 'Elev' },
  pd_lb_attempted: { en: 'Questions Attempted', da: 'Besvarede Spørgsmål' },
  pd_lb_accuracy: { en: 'Accuracy', da: 'Præcision' },
  pd_lb_empty: { en: 'No students on the leaderboard yet.', da: 'Ingen elever på ranglisten endnu.' },
  pd_lb_page_of: { en: 'Page {n} of {total}', da: 'Side {n} af {total}' },
  pd_lb_prev: { en: 'Previous', da: 'Forrige' },
  pd_lb_next: { en: 'Next', da: 'Næste' },
  pd_lb_sort_attempted: { en: 'Sort by attempted', da: 'Sortér efter besvarede' },
  pd_lb_sort_accuracy: { en: 'Sort by accuracy', da: 'Sortér efter præcision' },
  pd_top_performers: { en: 'Top Performers', da: 'Bedste Elever' },
  pd_no_champions: { en: 'No champions yet — be the first!', da: 'Ingen mestre endnu — bliv den første!' },
  pd_overall_champion: { en: 'Overall Champion', da: 'Samlet Mester' },
  pd_subject_champion: { en: 'Champion', da: 'Mester' },
  pd_correct_accuracy: { en: 'correct · {pct}% accuracy', da: 'korrekte · {pct}% præcision' },
  pd_recent_activity: { en: 'Recent Activity', da: 'Seneste Aktivitet' },
  pd_no_recent_activity: { en: 'No recent activity yet.', da: 'Ingen seneste aktivitet endnu.' },
  pd_worked_on: { en: 'worked on', da: 'arbejdede med' },
  pd_cta_text: { en: 'Already enrolled? Pick up right where you left off.', da: 'Allerede tilmeldt? Fortsæt, hvor du slap.' },
  pd_cta_btn: { en: 'Continue Learning in the Student Portal', da: 'Fortsæt Læring i Elevportalen' },

  // ── Landing page · about ──
  about_lbl: { en: 'About the Academy', da: 'Om Akademiet' },
  about_h_1: { en: 'A different kind of', da: 'En anderledes' },
  about_h_2: { en: 'learning experience', da: 'læringsoplevelse' },
  about_sub: { en: 'We combine rigorous CBSE standards with a child-centric, mentorship-first approach — making learning effective, personalised, and genuinely enjoyable.', da: 'Vi kombinerer høje CBSE-standarder med en børnecentreret tilgang med fokus på mentorordning — så læring bliver effektiv, personlig og virkelig sjov.' },

  // ── Landing page · classes ──
  classes_lbl: { en: 'Academic Programs', da: 'Akademiske Programmer' },
  classes_h:   { en: 'Classes Offered', da: 'Tilbudte Klassetrin' },
  classes_sub: { en: 'Six class levels, each with a tailored curriculum, learning objectives, and teaching approach designed for that specific age group.', da: 'Seks klassetrin, hver med et skræddersyet pensum, læringsmål og undervisningsmetode designet til netop den aldersgruppe.' },
  classes_age: { en: 'Age', da: 'Alder' },

  // ── Landing page · subjects ──
  subjects_lbl: { en: 'What We Teach', da: 'Hvad Vi Underviser I' },
  subjects_h_1: { en: 'Five core subjects,', da: 'Fem kernefag,' },
  subjects_h_2: { en: 'taught exceptionally well', da: 'undervist exceptionelt godt' },
  subjects_sub: { en: 'Each subject has a dedicated structure — clear topics, defined learning goals, and proven teaching methods used by our expert mentors.', da: 'Hvert fag har en fast struktur — klare emner, definerede læringsmål og afprøvede undervisningsmetoder brugt af vores erfarne mentorer.' },
  subjects_topics_covered: { en: 'Topics Covered', da: 'Emner Dækket' },
  subjects_learning_goal:  { en: 'Learning Goal', da: 'Læringsmål' },
  subjects_teaching_method:{ en: 'Teaching Method', da: 'Undervisningsmetode' },

  // ── Landing page · schedule ──
  sched_lbl: { en: 'Tuition Timings', da: 'Undervisningstider' },
  sched_h:   { en: 'Available Batches', da: 'Tilgængelige Hold' },
  sched_sub: { en: 'Choose the schedule that fits your routine. Seat availability updates in real time — reserve yours during enrollment.', da: 'Vælg det skema, der passer til din hverdag. Ledige pladser opdateres i realtid — reservér din plads ved tilmelding.' },
  sched_seats_available_one: { en: 'seat available', da: 'ledig plads' },
  sched_seats_available_many: { en: 'seats available', da: 'ledige pladser' },

  // ── Landing page · fees ──
  fees_lbl: { en: 'Fee Structure', da: 'Prisstruktur' },
  fees_h:   { en: 'Simple, transparent pricing', da: 'Simpel, gennemsigtig prissætning' },
  fees_sub: { en: 'No hidden charges. Pay monthly. Cancel anytime. All plans include access to the student portal and progress dashboard.', da: 'Ingen skjulte gebyrer. Betal månedligt. Opsig når som helst. Alle planer inkluderer adgang til elevportalen og fremskridtsoversigten.' },
  fees_most_popular: { en: 'Most Popular', da: 'Mest Populær' },
  fees_per_student: { en: 'per student', da: 'pr. elev' },
  fees_enroll_now: { en: 'Enroll Now', da: 'Tilmeld Nu' },

  // ── Landing page · testimonials ──
  test_lbl: { en: 'Parent Stories', da: 'Forældrehistorier' },
  test_h:   { en: 'What families say', da: 'Hvad familier siger' },
  test_sub: { en: 'Real words from the parents and students who are part of the Vedanta Academy community.', da: 'Rigtige ord fra forældre og elever, der er en del af Vedanta Academy-fællesskabet.' },

  // ── Landing page · teachers ──
  teach_lbl: { en: 'Expert Mentors', da: 'Erfarne Mentorer' },
  teach_h:   { en: "Meet your child's teachers", da: 'Mød dit barns lærere' },
  teach_sub: { en: 'Background-verified specialists dedicated to child-centred primary education and measurable academic outcomes.', da: 'Baggrundstjekkede specialister dedikeret til børnecentreret grundskoleundervisning og målbare faglige resultater.' },
  teach_experience: { en: 'Experience', da: 'Erfaring' },

  // ── Landing page · FAQ ──
  faq_lbl: { en: 'Got Questions?', da: 'Har Du Spørgsmål?' },
  faq_h:   { en: 'Frequently Asked Questions', da: 'Ofte Stillede Spørgsmål' },
  faq_sub: { en: 'Everything parents ask before enrolling — answered clearly and honestly.', da: 'Alt forældre spørger om før tilmelding — besvaret klart og ærligt.' },

  // ── Landing page · portal banner ──
  pb_h: { en: 'Already enrolled? Your dashboard is waiting.', da: 'Allerede tilmeldt? Dit dashboard venter.' },
  pb_p: { en: 'View assignments, track progress, check schedules — all in one place.', da: 'Se opgaver, følg fremskridt, tjek skemaer — alt sammen ét sted.' },
  pb_btn: { en: 'Open Student Portal', da: 'Åbn Elevportal' },

  // ── Landing page · enroll form ──
  enroll_lbl: { en: 'Get Started', da: 'Kom I Gang' },
  enroll_h:   { en: 'Enrollment Registration', da: 'Tilmeldingsregistrering' },
  enroll_sub: { en: 'Select your role below — student, parent, or teacher. Your account is created instantly on submission.', da: 'Vælg din rolle nedenfor — elev, forælder eller lærer. Din konto oprettes øjeblikkeligt ved indsendelse.' },
  enroll_step_student: { en: 'Student', da: 'Elev' },
  enroll_step_parent:  { en: 'Parent', da: 'Forælder' },
  enroll_step_course:  { en: 'Course', da: 'Forløb' },
  enroll_step_confirm: { en: 'Confirm', da: 'Bekræft' },
  // ── Role selector (Step 0) ───────────────────────────────────────────────
  enroll_role_heading:   { en: "Who's enrolling?", da: 'Hvem tilmelder sig?' },
  enroll_role_sub:       { en: 'Choose your role to see the right registration form.', da: 'Vælg din rolle for at se den rigtige tilmeldingsformular.' },
  enroll_role_student:   { en: 'Student', da: 'Elev' },
  enroll_role_student_d: { en: 'Enroll a child for tuition', da: 'Tilmeld et barn til undervisning' },
  enroll_role_parent:    { en: 'Parent / Guardian', da: 'Forælder / Værge' },
  enroll_role_parent_d:  { en: 'Monitor your child\'s progress', da: 'Følg dit barns fremskridt' },
  enroll_role_teacher:   { en: 'Teacher', da: 'Lærer' },
  enroll_role_teacher_d: { en: 'Join the teaching team', da: 'Bliv en del af lærerteamet' },
  // ── Parent / Teacher form fields ─────────────────────────────────────────
  f_pt_full_name:      { en: 'Full Name *', da: 'Fulde Navn *' },
  f_pt_full_name_ph:   { en: 'e.g. Priya Mehta', da: 'fx Priya Mehta' },
  f_pt_email:          { en: 'Email Address *', da: 'E-mailadresse *' },
  f_pt_phone:          { en: 'Phone Number *', da: 'Telefonnummer *' },
  f_pt_phone_ph:       { en: '+91 98765 43210', da: '+45 12 34 56 78' },
  f_pt_address:        { en: 'Address', da: 'Adresse' },
  f_pt_address_ph:     { en: 'Your home or office address', da: 'Din hjemme- eller arbejdsadresse' },
  f_pt_child_id:       { en: "Child's Student ID (optional)", da: 'Barnets Elev-ID (valgfrit)' },
  f_pt_child_id_ph:    { en: 'e.g. APX262834 — leave blank if unknown', da: 'fx APX262834 — lad stå tomt hvis ukendt' },
  f_pt_child_id_help:  { en: "Found in your child's welcome email. You can leave this blank — we'll link your account within 24 hours.", da: 'Findes i dit barns velkomst-e-mail. Du kan lade det stå tomt — vi linker din konto inden for 24 timer.' },
  f_pt_subject:        { en: 'Primary Subject', da: 'Primært Fag' },
  f_pt_subject_ph:     { en: 'e.g. Mathematics', da: 'fx Matematik' },
  f_pt_qualification:  { en: 'Qualification', da: 'Kvalifikationer' },
  f_pt_qualification_ph: { en: 'e.g. M.Sc. Mathematics, B.Ed', da: 'fx Cand.scient. i Matematik, Pædagogikum' },
  // ── Review labels ─────────────────────────────────────────────────────────
  f_pt_review_role:    { en: 'Role: ', da: 'Rolle: ' },
  f_pt_review_name:    { en: 'Name: ', da: 'Navn: ' },
  f_pt_review_email:   { en: 'Email: ', da: 'E-mail: ' },
  f_pt_review_phone:   { en: 'Phone: ', da: 'Telefon: ' },
  // ── Success screen ────────────────────────────────────────────────────────
  f_pt_success_title:  { en: 'Account Created Successfully! 🎉', da: 'Konto Oprettet! 🎉' },
  f_pt_success_sub:    { en: 'Save your login credentials — you will need them to access the portal.', da: 'Gem dine login-oplysninger — du skal bruge dem for at tilgå portalen.' },
  f_pt_cred_id:        { en: 'Account ID', da: 'Konto-ID' },
  f_pt_go_to_portal:   { en: 'Go to Parent & Teacher Portal', da: 'Gå Til Forældre- og Lærerportalen' },
  f_pt_note_parent:    { en: "We'll link your child's profile to your account within 24 hours.", da: 'Vi linker dit barns profil til din konto inden for 24 timer.' },
  f_pt_note_teacher:   { en: "We'll configure your student access shortly. Contact the academy if you need immediate access.", da: 'Vi konfigurerer din adgang til elever hurtigst muligt. Kontakt akademiet, hvis du har brug for øjeblikkelig adgang.' },
  f_pt_disclaimer:     { en: 'By submitting you confirm all details are accurate. Your account will be reviewed by the academy administrator.', da: 'Ved at indsende bekræfter du, at alle oplysninger er korrekte. Din konto gennemgås af akademiets administrator.' },
  f_pt_steps_details:  { en: 'Details', da: 'Oplysninger' },
  f_pt_steps_confirm:  { en: 'Confirm', da: 'Bekræft' },

  f_student_name: { en: 'Student Full Name *', da: 'Elevens Fulde Navn *' },
  f_student_name_ph: { en: 'e.g. Rohan Sharma', da: 'fx. Frederik Madsen' },
  f_dob: { en: 'Date of Birth *', da: 'Fødselsdato *' },
  f_gender: { en: 'Gender', da: 'Køn' },
  f_gender_select: { en: 'Select…', da: 'Vælg…' },
  f_gender_male: { en: 'Male', da: 'Dreng' },
  f_gender_female: { en: 'Female', da: 'Pige' },
  f_gender_na: { en: 'Prefer not to say', da: 'Ønsker ikke at oplyse' },
  f_school_name: { en: 'School Name', da: 'Skolens Navn' },
  f_school_name_ph: { en: 'e.g. Delhi Public School', da: 'fx. Københavns Friskole' },
  f_class_level: { en: 'Current Grade / Class *', da: 'Nuværende Klassetrin *' },
  f_class_select: { en: 'Select class…', da: 'Vælg klassetrin…' },
  f_next_parent: { en: 'Next: Parent Info', da: 'Næste: Forældreoplysninger' },

  f_parent_name: { en: 'Parent / Guardian Name *', da: 'Forælder/Værges Navn *' },
  f_parent_name_ph: { en: 'e.g. Mr. Vijay Sharma', da: 'fx. Hr. Lars Madsen' },
  f_email: { en: 'Email Address *', da: 'E-mailadresse *' },
  f_phone: { en: 'Primary Phone *', da: 'Primært Telefonnummer *' },
  f_phone_ph: { en: '+91 98765 43210', da: '+45 12 34 56 78' },
  f_emergency: { en: 'Emergency Contact', da: 'Nødkontakt' },
  f_emergency_ph: { en: '+91 00000 00000', da: '+45 00 00 00 00' },
  f_address: { en: 'Home Address', da: 'Hjemmeadresse' },
  f_address_ph: { en: 'Flat/House No., Street, City', da: 'Adresse, gade, by' },
  f_back: { en: 'Back', da: 'Tilbage' },
  f_next_course: { en: 'Next: Course Selection', da: 'Næste: Valg Af Forløb' },

  f_preferred_teacher: { en: 'Preferred Teacher', da: 'Foretrukken Lærer' },
  f_no_preference: { en: 'No preference', da: 'Ingen præference' },
  f_preferred_batch: { en: 'Preferred Batch', da: 'Foretrukket Hold' },
  f_select_batch: { en: 'Select batch…', da: 'Vælg hold…' },
  f_learning_mode: { en: 'Learning Mode', da: 'Undervisningsform' },
  f_select_mode: { en: 'Select mode…', da: 'Vælg form…' },
  f_mode_physical: { en: 'Physical (In-person)', da: 'Fysisk (Fremmøde)' },
  f_mode_online: { en: 'Online (Google Meet / Zoom)', da: 'Online (Google Meet / Zoom)' },
  f_mode_hybrid: { en: 'Hybrid (Mix of both)', da: 'Hybrid (Begge dele)' },
  sched_mode_physical: { en: 'Physical', da: 'Fysisk' },
  sched_mode_online: { en: 'Online', da: 'Online' },
  sched_mode_hybrid: { en: 'Hybrid', da: 'Hybrid' },
  f_review_mode_physical: { en: 'Physical', da: 'Fysisk' },
  f_review_mode_online: { en: 'Online', da: 'Online' },
  f_review_mode_hybrid: { en: 'Hybrid', da: 'Hybrid' },
  f_subjects_required: { en: 'Subjects Required', da: 'Ønskede Fag' },
  f_review_confirm: { en: 'Review & Confirm', da: 'Gennemse & Bekræft' },

  f_review_title: { en: 'Review Your Details', da: 'Gennemse Dine Oplysninger' },
  f_review_student: { en: 'Student:', da: 'Elev:' },
  f_review_dob: { en: 'DOB:', da: 'Fødselsdato:' },
  f_review_class: { en: 'Class:', da: 'Klassetrin:' },
  f_review_school: { en: 'School:', da: 'Skole:' },
  f_review_parent: { en: 'Parent:', da: 'Forælder:' },
  f_review_email: { en: 'Email:', da: 'E-mail:' },
  f_review_phone: { en: 'Phone:', da: 'Telefon:' },
  f_review_mode: { en: 'Mode:', da: 'Form:' },
  f_review_subjects: { en: 'Subjects:', da: 'Fag:' },
  f_review_disclaimer: { en: 'By submitting you confirm all details are accurate. A student account will be created instantly and your login credentials will be displayed on screen. The registrar will contact you within 24 hours to confirm batch placement.', da: 'Ved at indsende bekræfter du, at alle oplysninger er korrekte. En elevkonto oprettes øjeblikkeligt, og dine login-oplysninger vises på skærmen. Studiekontoret kontakter dig inden for 24 timer for at bekræfte holdplacering.' },
  f_creating_account: { en: 'Creating your account…', da: 'Opretter din konto…' },
  f_submit: { en: 'Submit Enrollment & Create Account', da: 'Indsend Tilmelding & Opret Konto' },

  f_success_title: { en: 'Enrollment Successful! 🎉', da: 'Tilmelding Gennemført! 🎉' },
  f_success_sub: { en: 'Your login credentials are ready — save them now', da: 'Dine login-oplysninger er klar — gem dem nu' },
  f_cred_student_id: { en: 'Student ID', da: 'Elev-ID' },
  f_cred_username: { en: 'Username', da: 'Brugernavn' },
  f_cred_temp_password: { en: 'Temp Password', da: 'Midlertidigt Kodeord' },
  f_cred_warning: { en: '⚠ Screenshot or write down these credentials. You will be prompted to set a new password on first login.', da: '⚠ Tag et skærmbillede eller skriv disse oplysninger ned. Du bliver bedt om at vælge et nyt kodeord ved første login.' },
  f_go_to_portal: { en: 'Go to Student Portal', da: 'Gå Til Elevportal' },
  f_connection_failed: { en: 'Connection failed. Is the server running?', da: 'Forbindelsen mislykkedes. Kører serveren?' },
  f_generic_error: { en: 'Something went wrong.', da: 'Noget gik galt.' },

  // ── Landing page · contact ──
  contact_lbl: { en: 'Get In Touch', da: 'Kom I Kontakt' },
  contact_h:   { en: 'Contact Us', da: 'Kontakt Os' },
  contact_sub: { en: 'Have a question before enrolling? Reach out — we respond within a few hours.', da: 'Har du et spørgsmål inden tilmelding? Skriv til os — vi svarer inden for et par timer.' },
  contact_whatsapp: { en: 'WhatsApp', da: 'WhatsApp' },
  contact_chat_now: { en: 'Chat Now', da: 'Chat Nu' },
  contact_phone: { en: 'Phone', da: 'Telefon' },
  contact_email: { en: 'Email', da: 'E-mail' },
  contact_location: { en: 'Location', da: 'Placering' },

  // ── Landing page · footer ──
  footer_brand_desc: { en: 'Vedanta Academy — dedicated foundational coaching built to scale child proficiency while keeping primary learning fun, engaging, and outcome-focused. CBSE aligned, KG to Class 5.', da: 'Vedanta Academy — dedikeret grundlæggende undervisning bygget til at styrke børns færdigheder, mens læring forbliver sjov, engagerende og resultatorienteret. CBSE-tilpasset, fra børnehaveklasse til 5. klasse.' },
  footer_academy: { en: 'Academy', da: 'Akademi' },
  footer_about_us: { en: 'About Us', da: 'Om Os' },
  footer_classes: { en: 'Classes', da: 'Klassetrin' },
  footer_subjects: { en: 'Subjects', da: 'Fag' },
  footer_teachers: { en: 'Teachers', da: 'Lærere' },
  footer_admission: { en: 'Admission', da: 'Optagelse' },
  footer_schedules: { en: 'Schedules', da: 'Skemaer' },
  footer_fee_structure: { en: 'Fee Structure', da: 'Prisstruktur' },
  footer_enroll_now: { en: 'Enroll Now', da: 'Tilmeld Nu' },
  footer_student_portal: { en: 'Student Portal', da: 'Elevportal' },
  footer_parent_portal:  { en: 'Parent & Teacher Portal', da: 'Forælder- & Lærerportal' },
  footer_contact: { en: 'Contact', da: 'Kontakt' },
  footer_rights: { en: '© 2026 Vedanta Academy. All Rights Reserved. CBSE Aligned · KG to Class 5.', da: '© 2026 Vedanta Academy. Alle Rettigheder Forbeholdes. CBSE-tilpasset · Børnehaveklasse til 5. klasse.' },
  page_title: { en: 'Vedanta Academy | Expert Home Tuition KG – Class 5', da: 'Vedanta Academy | Ekspert Hjemmeundervisning Børnehaveklasse – 5. Klasse' },
  page_meta_description: { en: 'Vedanta Academy — Premium CBSE home tuition. Micro-batches, real-time dashboards, expert mentors. Kindergarten to Class 5.', da: 'Vedanta Academy — Eksklusiv CBSE-hjemmeundervisning. Mikrohold, fremskridtsdashboards i realtid, erfarne mentorer. Børnehaveklasse til 5. klasse.' },

  // ─────────────────────────────────────────────────────────────────────
  // STUDENT PORTAL
  // ─────────────────────────────────────────────────────────────────────
  p_username_or_id: { en: 'Username or Student ID', da: 'Brugernavn eller Elev-ID' },
  p_username_ph: { en: 'e.g. rohan.sharma or APX262834', da: 'fx. frederik.madsen eller APX262834' },
  p_password: { en: 'Password', da: 'Kodeord' },
  p_back_to_academy: { en: 'Back to Academy', da: 'Tilbage Til Akademiet' },
  p_invalid_credentials: { en: 'Invalid credentials.', da: 'Forkerte loginoplysninger.' },
  p_verifying: { en: 'Verifying…', da: 'Bekræfter…' },
  p_sign_in_btn: { en: 'Access My Dashboard', da: 'Tilgå Mit Dashboard' },

  p_nav_dashboard: { en: 'Dashboard', da: 'Dashboard' },
  p_nav_progress: { en: 'Academic Progress', da: 'Faglige Fremskridt' },
  p_nav_leaderboard: { en: 'Leaderboard', da: 'Rangliste' },
  p_nav_attendance: { en: 'Attendance', da: 'Fremmøde' },
  p_nav_assignments: { en: 'Assignments', da: 'Opgaver' },
  p_nav_schedule: { en: 'Upcoming Classes', da: 'Kommende Timer' },
  p_nav_notifications: { en: 'Notifications', da: 'Notifikationer' },
  p_nav_profile: { en: 'My Profile', da: 'Min Profil' },
  p_my_academy: { en: 'My Academy', da: 'Mit Akademi' },
  p_sign_out: { en: 'Sign Out', da: 'Log Ud' },
  p_open_nav: { en: 'Open navigation menu', da: 'Åbn navigationsmenu' },
  p_close_nav: { en: 'Close navigation menu', da: 'Luk navigationsmenu' },

  p_dashboard_title: { en: 'Dashboard', da: 'Dashboard' },
  p_dashboard_subtitle: { en: "Welcome back — here's your academic snapshot.", da: 'Velkommen tilbage — her er dit faglige overblik.' },
  p_enrollment: { en: 'Enrollment', da: 'Indskrivning' },
  p_subject_progress: { en: 'Subject Progress', da: 'Fagligt Fremskridt' },
  p_performance_ratios: { en: 'Performance Ratios', da: 'Præstationsforhold' },
  p_learning_analytics: { en: 'Learning Analytics', da: 'Læringsstatistik' },
  p_questions_attempted: { en: 'Questions Attempted', da: 'Besvarede Spørgsmål' },
  p_correct_answers: { en: 'Correct Answers', da: 'Korrekte Svar' },
  p_incorrect_answers: { en: 'Incorrect Answers', da: 'Forkerte Svar' },
  p_overall_accuracy: { en: 'Overall Accuracy', da: 'Samlet Præcision' },
  p_subjects_started: { en: 'Subjects Started', da: 'Fag Påbegyndt' },
  p_topics_completed: { en: 'Topics Completed', da: 'Emner Gennemført' },
  p_achievements: { en: 'Achievements', da: 'Bedrifter' },
  p_no_achievements: { en: 'Complete a few topics to start earning achievements!', da: 'Gennemfør et par emner for at begynde at optjene bedrifter!' },
  p_next_classes: { en: 'Next {n} Classes', da: 'Næste {n} Timer' },

  p_progress_title: { en: 'Academic Progress', da: 'Faglige Fremskridt' },
  p_progress_subtitle: { en: 'Subject-wise completion and performance metrics.', da: 'Fuldførelse og præstation opdelt efter fag.' },
  p_completion_by_subject: { en: 'Completion by Subject', da: 'Fuldførelse Efter Fag' },
  p_overall_ratios: { en: 'Overall Ratios', da: 'Samlede Forhold' },
  p_detailed_progress: { en: 'Detailed Progress', da: 'Detaljeret Fremskridt' },
  p_no_subjects_yet: { en: 'No subjects configured yet — check back once your teacher adds one!', da: 'Ingen fag oprettet endnu — kig forbi igen, når din lærer har tilføjet et!' },
  p_topics: { en: 'topics', da: 'emner' },
  p_correct: { en: 'correct', da: 'korrekte' },
  p_incorrect: { en: 'incorrect', da: 'forkerte' },
  p_attempted: { en: 'attempted', da: 'besvaret' },
  p_last_attempt: { en: 'Last attempt:', da: 'Sidste forsøg:' },

  p_leaderboard_title: { en: 'Leaderboard', da: 'Rangliste' },
  p_leaderboard_subtitle: { en: 'See how you stack up against other students.', da: 'Se hvordan du klarer dig sammenlignet med andre elever.' },
  p_overall_ranking: { en: 'Overall Ranking', da: 'Samlet Placering' },
  p_no_leaderboard: { en: 'No leaderboard data yet — be the first to answer some questions!', da: 'Ingen ranglistedata endnu — vær den første til at besvare nogle spørgsmål!' },
  p_you_suffix: { en: ' (You)', da: ' (Dig)' },
  p_accuracy: { en: 'accuracy', da: 'præcision' },
  p_subject_champions: { en: 'Subject-Wise Champions', da: 'Fagmestre' },
  p_no_subject_rankings: { en: 'No subject rankings yet.', da: 'Ingen fagranglister endnu.' },
  p_no_attempts_yet: { en: 'No attempts yet.', da: 'Ingen forsøg endnu.' },
  p_champion: { en: 'Champion', da: 'Mester' },

  p_attendance_title: { en: 'Attendance', da: 'Fremmøde' },
  p_attendance_subtitle: { en: 'Track your class attendance and monthly trends.', da: 'Følg dit fremmøde og din udvikling måned for måned.' },
  p_monthly_attendance_trend: { en: 'Monthly Attendance Trend', da: 'Månedlig Fremmødeudvikling' },
  p_month_breakdown: { en: 'Month-by-Month Breakdown', da: 'Opdeling Måned For Måned' },

  p_assignments_title: { en: 'Learning & Assignments', da: 'Læring & Opgaver' },
  p_assignments_subtitle: { en: 'Choose a subject to start your guided lesson, or view your homework below.', da: 'Vælg et fag for at starte din guidede lektion, eller se dine lektier nedenfor.' },
  p_breadcrumb_assignments: { en: 'Assignments', da: 'Opgaver' },
  p_choose_subject: { en: 'Choose a Subject', da: 'Vælg Et Fag' },
  p_homework_submissions: { en: 'Homework & Submissions', da: 'Lektier & Afleveringer' },
  p_all_assignments: { en: 'All Assignments', da: 'Alle Opgaver' },
  p_due: { en: 'Due:', da: 'Frist:' },
  p_grade: { en: 'Grade:', da: 'Karakter:' },
  p_submit_homework: { en: 'Submit Homework', da: 'Aflever Lektier' },
  p_submit_assignment: { en: 'Submit Assignment', da: 'Aflever Opgave' },
  p_back_to_subjects: { en: 'Back to Subjects', da: 'Tilbage Til Fag' },
  p_topics_suffix: { en: 'Topics', da: 'Emner' },
  p_back_to_topics: { en: 'Back to topics', da: 'Tilbage til emner' },
  p_back_to: { en: 'Back to', da: 'Tilbage til' },
  p_no_topics_yet: { en: 'No learning topics yet — check back once your teacher adds one!', da: 'Ingen emner endnu — kig forbi igen, når din lærer har tilføjet et!' },
  p_no_subjects_configured: { en: 'No subjects configured yet — check back once your teacher adds one!', da: 'Ingen fag oprettet endnu — kig forbi igen, når din lærer har tilføjet et!' },
  p_coming_soon: { en: 'Coming Soon', da: 'Kommer Snart' },
  p_not_started: { en: 'Not Started', da: 'Ikke Påbegyndt' },
  p_completed: { en: 'Completed', da: 'Gennemført' },
  p_in_progress: { en: 'In Progress', da: 'I Gang' },
  p_upload_zone_primary: { en: 'Click to select a file, or drag and drop', da: 'Klik for at vælge en fil, eller træk og slip' },
  p_upload_zone_sub: { en: 'Supports PDF, DOC, JPG, PNG', da: 'Understøtter PDF, DOC, JPG, PNG' },
  p_upload_validation_error: { en: 'Select a file first.', da: 'Vælg en fil først.' },
  p_upload_success: { en: '"{filename}" submitted successfully!', da: '"{filename}" blev afleveret!' },

  p_no_steps_yet: { en: 'This topic has no steps yet — check back soon.', da: 'Dette emne har ingen trin endnu — kig forbi igen snart.' },
  p_pct_correct: { en: 'Correct', da: 'Korrekt' },
  p_aria_question: { en: 'Question {n}', da: 'Spørgsmål {n}' },
  p_aria_answered_correctly: { en: ', answered correctly', da: ', besvaret korrekt' },
  p_aria_answered_incorrectly: { en: ', answered incorrectly', da: ', besvaret forkert' },
  p_aria_not_yet_answered: { en: ', not yet answered', da: ', endnu ikke besvaret' },
  p_badge_explorer: { en: '{subject} Explorer', da: '{subject}-Opdagelsesrejsende' },
  p_badge_explorer_detail: { en: '{done}/{total} topics in {subject}', da: '{done}/{total} emner i {subject}' },
  p_badge_champion: { en: '{subject} Champion', da: '{subject}-Mester' },
  p_badge_champion_detail: { en: 'Completed every topic in {subject}', da: 'Gennemført alle emner i {subject}' },
  p_badge_fast_learner: { en: 'Fast Learner', da: 'Hurtig Elev' },
  p_badge_fast_learner_detail: { en: 'Completed a topic in under 10 minutes', da: 'Gennemførte et emne på under 10 minutter' },
  p_badge_consistent: { en: 'Consistent Performer', da: 'Stabil Præstation' },
  p_badge_consistent_subjects: { en: 'Active across {n} subjects', da: 'Aktiv på tværs af {n} fag' },
  p_badge_consistent_topics: { en: '{n} topics completed', da: '{n} emner gennemført' },
  p_badge_perfectionist: { en: 'Perfectionist', da: 'Perfektionist' },
  p_badge_perfectionist_detail: { en: 'Scored 100% on a topic', da: 'Opnåede 100% i et emne' },
  p_last_activity: { en: 'Last Activity', da: 'Seneste Aktivitet' },
  p_subjects_completed: { en: 'Subjects Completed', da: 'Fag Gennemført' },
  p_continue_learning: { en: 'Continue Learning', da: 'Fortsæt Læring' },
  p_go_to_assignments: { en: 'Go to Assignments', da: 'Gå Til Opgaver' },
  p_no_activity_yet: { en: 'No activity yet', da: 'Ingen aktivitet endnu' },
  p_retake_topic: { en: 'Retake Topic', da: 'Tag Emnet Igen' },
  p_review_my_answers: { en: 'Review My Answers', da: 'Gennemse Mine Svar' },
  p_continue_step: { en: 'Continue · Step {n} of {total}', da: 'Fortsæt · Trin {n} af {total}' },
  p_start_learning: { en: 'Start Learning', da: 'Begynd At Lære' },
  p_concepts_learned: { en: 'Concepts You Learned', da: 'Begreber Du Har Lært' },
  p_review_mistakes: { en: 'Review Your Mistakes', da: 'Gennemse Dine Fejl' },
  p_perfect_score: { en: 'Perfect Score — No Mistakes!', da: 'Perfekt Score — Ingen Fejl!' },
  p_your_answer: { en: 'Your answer:', da: 'Dit svar:' },
  p_correct_answer: { en: 'Correct answer:', da: 'Korrekt svar:' },
  p_now_you_try: { en: 'Now You Try', da: 'Prøv Selv' },
  p_step_of: { en: 'Step {n} of {total}', da: 'Trin {n} af {total}' },
  p_question_of: { en: 'Question {n} of {total}', da: 'Spørgsmål {n} af {total}' },
  p_progress_pct: { en: 'Progress: {pct}%', da: 'Fremskridt: {pct}%' },
  p_jump_to_question: { en: 'Jump to question', da: 'Hop til spørgsmål' },
  p_correct_excl: { en: 'Correct! ', da: 'Korrekt! ' },
  p_not_quite: { en: 'Not quite. ', da: 'Ikke helt. ' },
  p_learn_more: { en: 'Learn more', da: 'Læs mere' },
  p_previous: { en: 'Previous', da: 'Forrige' },
  p_finish_topic: { en: 'Finish Topic', da: 'Afslut Emne' },
  p_next_question: { en: 'Next Question', da: 'Næste Spørgsmål' },
  p_answer_to_continue: { en: 'Answer to Continue', da: 'Besvar For At Fortsætte' },
  p_excellent_star: { en: "Excellent work! You're a {subject} star!", da: 'Fremragende arbejde! Du er en {subject}-stjerne!' },
  p_great_job: { en: 'Great job — you really understand this topic!', da: 'Godt klaret — du forstår virkelig dette emne!' },
  p_nice_effort: { en: "Nice effort! A bit more practice and you'll have it mastered.", da: 'Flot forsøg! Lidt mere øvelse, så har du styr på det.' },
  p_good_try: { en: "Good try! Let's look at what tripped you up below.", da: 'Godt forsøgt! Lad os se på, hvad der gik galt nedenfor.' },

  p_schedule_title: { en: 'Upcoming Classes', da: 'Kommende Timer' },
  p_schedule_subtitle: { en: 'Your scheduled sessions for the coming days.', da: 'Dine planlagte timer for de kommende dage.' },
  p_schedule_card_title: { en: 'Schedule', da: 'Skema' },

  p_notifications_title: { en: 'Notifications', da: 'Notifikationer' },
  p_unread_messages_one: { en: 'unread message.', da: 'ulæst besked.' },
  p_unread_messages_many: { en: 'unread messages.', da: 'ulæste beskeder.' },
  p_mark_all_read: { en: 'Mark all read', da: 'Markér alle som læst' },

  p_profile_title: { en: 'My Profile', da: 'Min Profil' },
  p_profile_subtitle: { en: 'Manage your account details and preferences.', da: 'Administrér dine kontooplysninger og præferencer.' },
  p_edit_profile: { en: 'Edit Profile', da: 'Redigér Profil' },
  p_cancel: { en: 'Cancel', da: 'Annullér' },
  p_student_suffix: { en: 'Student', da: 'Elev' },
  p_account_details: { en: 'Account Details', da: 'Kontooplysninger' },
  p_save_changes: { en: 'Save Changes', da: 'Gem Ændringer' },
  p_change_password: { en: 'Change Password', da: 'Skift Kodeord' },
  p_current_password: { en: 'Current Password', da: 'Nuværende Kodeord' },
  p_new_password: { en: 'New Password', da: 'Nyt Kodeord' },
  p_confirm_password: { en: 'Confirm Password', da: 'Bekræft Kodeord' },
  p_update_password: { en: 'Update Password', da: 'Opdatér Kodeord' },
  p_full_name: { en: 'Full Name', da: 'Fulde Navn' },
  p_student_id: { en: 'Student ID', da: 'Elev-ID' },
  p_class_label: { en: 'Class', da: 'Klassetrin' },
  p_enrolled_label: { en: 'Enrolled', da: 'Indskrevet' },
  p_email_label: { en: 'Email', da: 'E-mail' },
  p_phone_label: { en: 'Phone', da: 'Telefon' },

  p_status_pending: { en: 'pending', da: 'afventer' },
  p_status_submitted: { en: 'submitted', da: 'afleveret' },
  p_status_graded: { en: 'graded', da: 'bedømt' },
  p_connection_failed: { en: 'Connection failed. Is the server running?', da: 'Forbindelsen mislykkedes. Kører serveren?' },
  p_status_submitted: { en: 'submitted', da: 'afleveret' },
  p_status_graded: { en: 'graded', da: 'bedømt' },
};

function interpolate(str, vars) {
  if (!vars) return str;
  return Object.keys(vars).reduce(
    (acc, k) => acc.replaceAll(`{${k}}`, String(vars[k])),
    str
  );
}

const LanguageContext = createContext({
  lang: 'en',
  setLang: () => {},
  t: (key) => key,
});

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState('en');
  const [hydrated, setHydrated] = useState(false);

  // Read persisted preference once on mount (client-only — localStorage
  // isn't available during SSR). Defaults to English if nothing saved yet,
  // matching "defaults to English for new visitors".
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved === 'en' || saved === 'da') setLangState(saved);
    } catch {
      // localStorage unavailable (e.g. private browsing) — silently keep default
    }
    setHydrated(true);
  }, []);

  const setLang = useCallback((next) => {
    setLangState(next);
    try { localStorage.setItem(LANG_STORAGE_KEY, next); } catch {}
  }, []);

  // Keep the <html lang="..."> attribute in sync with the selected language.
  // _document.js renders once server-side and has no access to this client
  // state, so this is the practical way to keep it accurate for
  // accessibility tools and search engines after the user switches language.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const t = useCallback((key, vars) => {
    const entry = UI_STRINGS[key];
    if (!entry) return key; // missing key — fail loud-ish in dev, harmless in prod
    const str = entry[lang] || entry.en || key;
    return interpolate(str, vars);
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, hydrated }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

// ── Small reusable toggle control ───────────────────────────────────────
// Renders as two buttons (EN / DA). Accepts a `dark` flag for placement on
// dark-background headers (student portal sidebar) vs the landing page's
// dark nav bar — both currently use the dark variant, but the flag is kept
// for future light-background placements.
export function LanguageToggle({ style }) {
  const { lang, setLang, t } = useLanguage();
  return (
    <div
      role="group"
      aria-label={t('lang_toggle_label')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: 'rgba(255,255,255,.07)',
        border: '1px solid rgba(255,255,255,.14)',
        borderRadius: '9px',
        padding: '3px',
        gap: '2px',
        ...style,
      }}
    >
      {['en', 'da'].map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
          style={{
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--fb, var(--font-b))',
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '.04em',
            padding: '6px 10px',
            borderRadius: '7px',
            background: lang === code ? '#00c6a7' : 'transparent',
            color: lang === code ? '#06231f' : 'rgba(255,255,255,.65)',
            transition: 'all .2s',
          }}
        >
          {code === 'en' ? 'EN' : 'DA'}
        </button>
      ))}
    </div>
  );
}
