// lib/landingContentDA.js
//
// Danish mirror of the FALLBACK content object in pages/index.js. Shape
// matches exactly — same keys, same array lengths/order — so index.js can
// simply pick LANDING_FALLBACK_DA instead of the English FALLBACK when the
// site language is Danish. This is content shown instantly on first render
// and whenever the live Google Sheet (/api/content) is unreachable; it is
// independent from whatever the Sheet itself contains (the Sheet is not
// localized — see the README note added during this Danish-language
// rollout for how to extend that later if desired).

const LANDING_FALLBACK_DA = {
  classes: [
    { Id: 'KG', Label: 'Børnehaveklasse', Age: '4–5 år',  Description: 'Grundlæggende læsefærdighed, talforståelse og sanselæring gennem leg.', Color: '#f97316' },
    { Id: 'C1', Label: '1. klasse', Age: '5–6 år',  Description: 'Introduktion til læsning, grundlæggende regning og udforskning af naturen.', Color: '#eab308' },
    { Id: 'C2', Label: '2. klasse', Age: '6–7 år',  Description: 'Udvidet ordforråd, tocifret regning og grundlæggende naturvidenskabelige begreber.', Color: '#22c55e' },
    { Id: 'C3', Label: '3. klasse', Age: '7–8 år',  Description: 'Læseforståelse, multiplikation, introduktion til geografi og indisk historie.', Color: '#00c6a7' },
    { Id: 'C4', Label: '4. klasse', Age: '8–9 år',  Description: 'Essayskrivning, brøker, kræfter og stof, verdensgeografi, frihedsbevægelsen.', Color: '#3b82f6' },
    { Id: 'C5', Label: '5. klasse', Age: '9–10 år', Description: 'Avanceret læseforståelse, geometri, økosystemer, kortlæsning og oldtidens civilisationer.', Color: '#a855f7' },
  ],
  subjects: [
    { Name: 'Engelsk',    Icon: 'fa-book',           Color: '#3b82f6', Topics: 'Fonetik · Grammatik · Læseforståelse · Kreativ Skrivning',  Goal: 'Sikker kommunikation og udtryksfuld skrivning',  Method: 'Historiebaseret læring, rollespil, læsekredse' },
    { Name: 'Matematik',  Icon: 'fa-calculator',     Color: '#f97316', Topics: 'Regning · Brøker · Geometri · Tekstopgaver',                Goal: 'Analytisk tænkning og problemløsning',           Method: 'Visuelle hjælpemidler, konkrete materialer, struktureret opgaveark' },
    { Name: 'Naturfag',   Icon: 'fa-flask',          Color: '#22c55e', Topics: 'Planters Liv · Menneskekroppen · Kraft & Stof · Simple Maskiner', Goal: 'Nysgerrighedsdrevet, erfaringsbaseret forståelse', Method: 'Eksperimenter, observationer, modelbygning' },
    { Name: 'Geografi',   Icon: 'fa-earth-americas', Color: '#eab308', Topics: 'Kort · Klimazoner · Landformer · Naturressourcer',          Goal: 'Rumlig bevidsthed og global viden',               Method: 'Kortøvelser, dokumentarklip, feltdiskussioner' },
    { Name: 'Historie',   Icon: 'fa-landmark',       Color: '#a855f7', Topics: 'Tidlige Civilisationer · Indisk Historie · Nationale Bevægelser · Kultur', Goal: 'Kulturel identitet og kronologisk bevidsthed', Method: 'Tidslinjer, fortælling, diskussion af kildemateriale' },
  ],
  schedules: [
    { Batch: 'Morgenhold',     Days: 'Man – Fre', Time: '7:00 – 8:30',  Mode: 'Physical', Seats: '3', Color: '#f97316' },
    { Batch: 'Eftermiddagshold', Days: 'Man – Fre', Time: '15:30 – 17:00',  Mode: 'Physical', Seats: '1', Color: '#eab308' },
    { Batch: 'Aftenhold',      Days: 'Man – Fre', Time: '18:00 – 19:30',  Mode: 'Online',   Seats: '4', Color: '#22c55e' },
    { Batch: 'Weekend Morgen', Days: 'Lør – Søn', Time: '9:00 – 11:00', Mode: 'Hybrid',   Seats: '5', Color: '#3b82f6' },
    { Batch: 'Weekend Aften',  Days: 'Lør – Søn', Time: '16:00 – 18:00',  Mode: 'Online',   Seats: '2', Color: '#a855f7' },
  ],
  fees: [
    { Tier: 'Enkeltfag', Price: '1.500 kr.', Period: '/måned', Perks: '1 Fag|Ugentlige Tests|Lektiehjælp|Fremskridtsrapporter', Highlight: 'FALSE' },
    { Tier: 'Kernepakke', Price: '3.500 kr.', Period: '/måned', Perks: '3 Fag|Ugentlige Tests|Lektiehjælp|Fremskridtsrapporter|Forældremøder', Highlight: 'TRUE' },
    { Tier: 'Fuldt Akademi', Price: '5.500 kr.', Period: '/måned', Perks: 'Alle 5 Fag|Daglige Tests|Lektiehjælp|Fremskridtsrapporter|Forældremøder|Eksamensforberedelse', Highlight: 'FALSE' },
  ],
  testimonials: [
    { Name: 'Priya Mehta',   Role: 'Forælder, 3. klasse',     Text: 'Min søn gik fra at kæmpe med brøker til at topscore i skoletesten på bare to måneder. Lærerne her holder virkelig af eleverne.' },
    { Name: 'Rajiv Sinha',   Role: 'Forælder, 5. klasse',     Text: 'Dashboardet i realtid hjælper mig med at følge min datters fremskridt uden at skulle ringe til læreren hver uge. Genialt system.' },
    { Name: 'Anjali Kapoor', Role: 'Forælder, Børnehaveklasse & 2. klasse', Text: 'Begge mine børn går her, og med de små hold føler ingen af dem sig nogensinde overset.' },
  ],
  teachers: [
    { Id: 'T01', Name: 'Fru Anjali Sharma', Qualification: 'Cand.scient. i Matematik · Pædagogikum', Experience: '5 år', Subjects: 'Matematik & Naturfag', Bio: 'Kendt for at gøre komplekse begreber intuitive. Hendes elever ligger konsekvent i top-10% af deres skoleeksamener.' },
    { Id: 'T02', Name: 'Hr. Pradeep Nair',  Qualification: 'Cand.mag. i Engelsk Litteratur · Pædagogikum', Experience: '7 år', Subjects: 'Engelsk & Historie', Bio: 'Prisbelønnet underviser, hvis fortælleglæde gør historie og sprog levende i hver eneste time.' },
  ],
  faqs: [
    { Question: 'Hvilke aldersgrupper underviser I?',          Answer: 'Vi dækker børnehaveklasse (4–5 år) til 5. klasse (9–10 år), i overensstemmelse med CBSE-pensummet.' },
    { Question: 'Hvor mange elever er der på hvert hold?',     Answer: 'Vi begrænser altid hold til maksimalt 5 elever for at sikre individuel opmærksomhed og en personlig læringsoplevelse.' },
    { Question: 'Tilbyder I onlineundervisning?',              Answer: 'Ja. Vi tilbyder fysisk, online (via Google Meet / Zoom) og hybrid undervisning. Du vælger din foretrukne form ved tilmelding.' },
    { Question: 'Hvad sker der, når jeg har indsendt formularen?', Answer: 'Dit elev-ID, brugernavn og midlertidige kodeord oprettes med det samme. Du kan logge ind på Elevportalen straks.' },
    { Question: 'Kan jeg ændre mit skema efter tilmelding?',   Answer: 'Ja, skemaændringer kan anmodes om via portalen eller ved at kontakte studiekontoret, afhængigt af ledige pladser.' },
    { Question: 'Bliver der stillet undervisningsmateriale til rådighed?', Answer: 'Ja. Opgaveark, øvelsesopgaver og læsemateriale uploades direkte til dit elevdashboard.' },
  ],
  about: [
    { Icon: 'fa-users-between-lines', IconBg: 'rgba(0,198,167,.1)',   IconColor: 'var(--teal)',  Heading: 'Undervisning I Mikrohold',        Body: 'Strengt begrænset til 5 elever pr. hold — hvert barn får udelt opmærksomhed og en virkelig personlig læringsvej.' },
    { Icon: 'fa-chart-line',          IconBg: 'rgba(245,166,35,.1)',  IconColor: 'var(--accent)', Heading: 'Live Fremskridtsdashboards',      Body: 'Forældre og elever har adgang til faglige logs i realtid — lektiefuldførelse, fremmøde, quizscorer og udviklingsmål opdateret dagligt.' },
    { Icon: 'fa-map-pin',             IconBg: 'rgba(99,102,241,.1)',  IconColor: '#818cf8',      Heading: 'CBSE-Pensum I Fuld Overensstemmelse', Body: 'Hver lektion er nøje tilpasset gældende CBSE-standarder, så eleverne altid ligger foran skolens forventninger.' },
    { Icon: 'fa-laptop-code',         IconBg: 'rgba(239,68,68,.1)',   IconColor: '#f87171',      Heading: 'Fysisk, Online & Hybrid',         Body: 'Vælg den form, der passer bedst til din familie. Skift form når som helst via elevportalen — ingen spørgsmål stillet.' },
    { Icon: 'fa-medal',               IconBg: 'rgba(168,85,247,.1)',  IconColor: '#a855f7',      Heading: 'Dokumenterede Resultater',        Body: 'Vores elever ligger konsekvent i top-15% af deres skoleeksamener inden for tre måneder efter start — målbar, synlig fremgang.' },
    { Icon: 'fa-shield-halved',       IconBg: 'rgba(34,197,94,.1)',   IconColor: '#22c55e',      Heading: 'Baggrundstjekkede Lærere',        Body: 'Alle lærere er uddannede, pædagogisk certificerede, baggrundstjekkede og trænet i børnecentreret undervisning på begynderniveau.' },
  ],
  contact: {
    whatsappNumber: '919999999999',
    phone:          '+91 99999 99999',
    email:          'support@vedantaacademy.com',
    address:        'Sector 15, Block C, New Delhi',
  },
  hero: {
    badge:      'CBSE-Certificeret · Børnehaveklasse til 5. klasse',
    // Split explicitly into two lines instead of relying on an English-only
    // string split (the original English content split on "'s", which only
    // works for an English sentence) — see headlineLine1/2 usage in index.js.
    headline:        "Hvor ethvert barns potentiale frigøres",
    headlineLine1:   'Hvor ethvert barns',
    headlineLine2:   'potentiale frigøres',
    subheadline:'Eksklusiv, personlig CBSE-hjemmeundervisning med erfarne mentorer, mikrohold på 5 elever og en elevportal i realtid, der følger hvert skridt i dit barns udvikling.',
    btn1Text:   'Tilmeld Nu — Gratis',
    btn1Link:   '#enroll',
    btn2Text:   'Elev Login',
    btn2Link:   '/portal',
    stat1Num:   '5',   stat1Label: 'Maks. Elever Pr. Hold',
    stat2Num:   '98%', stat2Label: 'Forældretilfredshed',
    stat3Num:   '6',   stat3Label: 'Klassetrin Børnehaveklasse – 5. Klasse',
    stat4Num:   '5',   stat4Label: 'Kernefag',
    feat1: 'Live fremmøde- og lektieopfølgning',
    feat2: 'Personlige fremskridtsdashboards',
    feat3: 'Fysisk, online & hybrid muligheder',
    feat4: 'Indhold tilpasset CBSE-pensum',
  },
};

export default LANDING_FALLBACK_DA;
