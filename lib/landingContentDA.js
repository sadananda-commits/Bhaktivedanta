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
    { Id: 'KG', Label: 'Børnehaveklasse', Age: '4–5 år',  Description: 'Grundlæggende læsefærdighed, talforståelse og sanselæring — de tidligste kapitler i spørgsmålsbanken.', Color: '#f97316' },
    { Id: 'C1', Label: '1. klasse', Age: '5–6 år',  Description: 'Introduktion til læsning, grundlæggende regning og udforskning af naturen.', Color: '#eab308' },
    { Id: 'C2', Label: '2. klasse', Age: '6–7 år',  Description: 'Udvidet ordforråd, tocifret regning og grundlæggende naturvidenskabelige begreber.', Color: '#22c55e' },
    { Id: 'C3', Label: '3. klasse', Age: '7–8 år',  Description: 'Læseforståelse, multiplikation, introduktion til geografi og indisk historie.', Color: '#00c6a7' },
    { Id: 'C4', Label: '4. klasse', Age: '8–9 år',  Description: 'Essayskrivning, brøker, kræfter og stof, verdensgeografi, frihedsbevægelsen.', Color: '#3b82f6' },
    { Id: 'C5', Label: '5. klasse', Age: '9–10 år', Description: 'Avanceret læseforståelse, geometri, økosystemer, kortlæsning og oldtidens civilisationer.', Color: '#a855f7' },
  ],
  subjects: [
    { Name: 'Engelsk',    Icon: 'fa-book',           Color: '#3b82f6', Topics: 'Fonetik · Grammatik · Læseforståelse · Kreativ Skrivning',  Goal: 'Sikker kommunikation og udtryksfuld skrivning',  Method: 'Kapitelvise spørgsmål med øjeblikkelig feedback' },
    { Name: 'Matematik',  Icon: 'fa-calculator',     Color: '#f97316', Topics: 'Regning · Brøker · Geometri · Tekstopgaver',                Goal: 'Analytisk tænkning og problemløsning',           Method: 'Øvelsessæt i eget tempo, sporet automatisk' },
    { Name: 'Naturfag',   Icon: 'fa-flask',          Color: '#22c55e', Topics: 'Planters Liv · Menneskekroppen · Kraft & Stof · Simple Maskiner', Goal: 'Nysgerrighedsdrevet, erfaringsbaseret forståelse', Method: 'Spørgsmålsbank + live lærerstyrede quizzer' },
    { Name: 'Geografi',   Icon: 'fa-earth-americas', Color: '#eab308', Topics: 'Kort · Klimazoner · Landformer · Naturressourcer',          Goal: 'Rumlig bevidsthed og global viden',               Method: 'Kapitelvise spørgsmål med øjeblikkelig feedback' },
    { Name: 'Historie',   Icon: 'fa-landmark',       Color: '#a855f7', Topics: 'Tidlige Civilisationer · Indisk Historie · Nationale Bevægelser · Kultur', Goal: 'Kulturel identitet og kronologisk bevidsthed', Method: 'Spørgsmålsbank + live lærerstyrede quizzer' },
  ],
  testimonials: [
    { Name: 'Priya Mehta',   Role: 'Forælder',     Text: 'Vi betalte tidligere for tre forskellige apps — én til møder, én til quizzer og én til lektier. Nu er det hele samlet ét sted, gratis, bygget af vores eget fællesskab.' },
    { Name: 'Rajiv Sinha',   Role: 'Forælder',     Text: 'Det live dashboard betyder, at jeg ikke behøver spørge læreren om opdateringer — jeg kan se præcis, hvad min datter har øvet, og hvordan det går.' },
    { Name: 'Anjali Kapoor', Role: 'Lærer', Text: 'Det plejede at kræve tre forskellige logins at afholde en quiz. Nu opretter jeg den, deler ét link, og alle deltager bare — ingen vært krævet, ingen tidsbegrænsning.' },
  ],
  faqs: [
    { Question: 'Er platformen virkelig gratis?',             Answer: 'Ja. Der er intet abonnement, ingen pris pr. bruger og intet betalt niveau. Den er bygget og vedligeholdt af fællesskabet, for fællesskabet.' },
    { Question: 'Skal jeg bruge en Zoom- eller Kahoot-konto?', Answer: 'Nej. Møder og quizzer foregår helt inde i portalen — ingen eksterne konti, ingen tidsbegrænsning, og intet krav om en vært til møder.' },
    { Question: 'Hvordan fungerer spørgsmålsbanken?',         Answer: 'Vælg dit klassetrin, og gennemse derefter efter fag og kapitel. Spørgsmål besvares direkte i browseren med øjeblikkelig feedback, i dit eget tempo.' },
    { Question: 'Hvad sker der, når jeg opretter en profil?', Answer: 'Dit login oprettes øjeblikkeligt, og du kan starte med det samme — gennemse spørgsmålsbanken, deltage i møder eller tage quizzer.' },
    { Question: 'Kan forældre se deres barns fremskridt?',    Answer: 'Ja. Forældre får et live dashboard, der viser, hvad der er øvet, nøjagtighed pr. fag og seneste aktivitet — opdateret automatisk.' },
    { Question: 'Hvordan kan lærere deltage?',                Answer: 'Lærere kan afholde live quizzer, tildele kapitler, gennemgå afleverede lektier og følge hver elevs fremskridt fra Forældre- og Lærerportalen.' },
  ],
  about: [
    { Icon: 'fa-hand-holding-heart',  IconBg: 'rgba(0,198,167,.1)',   IconColor: 'var(--teal)',  Heading: 'Altid Gratis',                    Body: 'Intet abonnement, ingen pris pr. bruger, intet betalt niveau. Bygget af frivillige i fællesskabet, for alle i fællesskabet.' },
    { Icon: 'fa-users-between-lines', IconBg: 'rgba(245,166,35,.1)',  IconColor: 'var(--accent)', Heading: 'Bygget Af Vores Fællesskab',      Body: 'Et fælles alternativ til de store techplatforme, vi alle bruger — der mindsker vores afhængighed heraf, ét skridt ad gangen.' },
    { Icon: 'fa-chart-line',          IconBg: 'rgba(99,102,241,.1)',  IconColor: '#818cf8',      Heading: 'Live Fremskridtsdashboards',      Body: 'Forældre og elever ser reel faglig aktivitet — besvarede spørgsmål, nøjagtighed og seneste fremskridt, opdateret automatisk.' },
    { Icon: 'fa-video',               IconBg: 'rgba(239,68,68,.1)',   IconColor: '#f87171',      Heading: 'Ingen Tidsbegrænsning, Ingen Vært Krævet', Body: 'Møder fungerer som Zoom, minus de 40 minutters afbrydelse og kravet om, at en bestemt person skal starte opkaldet.' },
    { Icon: 'fa-gamepad',             IconBg: 'rgba(168,85,247,.1)',  IconColor: '#a855f7',      Heading: 'Live Quizzer Som Kahoot',         Body: 'Lærere og forældre afholder interaktive, tidsbegrænsede quizzer, der gør repetition sjov — ingen tredjeparts-app nødvendig.' },
    { Icon: 'fa-shield-halved',       IconBg: 'rgba(34,197,94,.1)',   IconColor: '#22c55e',      Heading: 'Et Trygt, Fællesskabsdrevet Rum', Body: 'Bygget og modereret af mennesker, fællesskabet allerede kender og stoler på — ikke en anonym platform drevet for profit.' },
  ],
  contact: {
    whatsappNumber: '919999999999',
    phone:          '+91 99999 99999',
    email:          'support@vedantaacademy.com',
    address:        'En fællesskabsdrevet platform — intet fysisk kontor',
  },
  hero: {
    badge:      'Fællesskabsbygget · Gratis For Alle',
    headline:        'En lærings- og samarbejdsplatform, bygget af vores eget fællesskab',
    headlineLine1:   'En læringsplatform',
    headlineLine2:   'bygget af vores eget fællesskab',
    subheadline:'Øv dig i spørgsmålsbanken efter klassetrin og kapitel, deltag i møder uden tidsbegrænsning eller krav om vært, tag del i quizzer i Kahoot-stil, og følg fremskridt — alt sammen ét gratis sted, der mindsker vores afhængighed af store techplatforme.',
    btn1Text:   'Tilmeld — Det Er Gratis',
    btn1Link:   '#enroll',
    btn2Text:   'Elev Login',
    btn2Link:   '/portal',
    stat1Num:   '0',   stat1Label: 'Pris For At Deltage',
    stat2Num:   '∞', stat2Label: 'Tidsbegrænsning På Møder',
    stat3Num:   '6',   stat3Label: 'Klassetrin Børnehaveklasse – 5. Klasse',
    stat4Num:   '5',   stat4Label: 'Kernefag',
    feat1: 'Spørgsmålsbank efter klassetrin, fag & kapitel',
    feat2: 'Møder uden vært — ingen tidsbegrænsning, intet abonnement',
    feat3: 'Live quizzer i Kahoot-stil for lærere & forældre',
    feat4: 'Opgaver & fremskridtsopfølgning, alt sammen ét sted',
  },
};

export default LANDING_FALLBACK_DA;
