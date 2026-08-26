// pages/api/quiz.js
//
// Replaces Code.gs (Apps Script) entirely. Same request shape as before —
// lib/quizApi.js already POSTs { action, ...params } to /api/quiz, so it
// needed NO changes at all. This file dispatches by action, exactly like
// Code.gs's handlers map did, but reads/writes Firestore via firebase-admin
// instead of a spreadsheet — no more Apps Script /exec cold starts, which
// were very likely the biggest single source of the slowness.
//
// Data model (see also firestore.rules):
//   quizzes/{quizId}                       — public live state (safe to
//                                             read directly from the browser
//                                             via lib/quizFirestore.js)
//   quizzes/{quizId}/questions/{qNum}      — the actual question bank,
//                                             INCLUDING the correct answer —
//                                             admin-only, never sent to a
//                                             participant's browser directly
//   quizzes/{quizId}/participants/{id}     — joined participants. Self-paced
//                                             ("take it later") participants
//                                             are regular docs in this SAME
//                                             subcollection, just with 3
//                                             extra fields: mode: 'solo',
//                                             soloQuestionIndex (0-based,
//                                             which question they're
//                                             currently on), soloStartedAt
//                                             (ISO — when THEY were served
//                                             that question, their own
//                                             per-participant clock instead
//                                             of the shared
//                                             currentQuestionStartedAt).
//                                             Live participants simply don't
//                                             have these fields at all —
//                                             every check below treats a
//                                             missing/non-'solo' mode as
//                                             live. No Firestore schema
//                                             migration needed for this —
//                                             new fields just start
//                                             appearing on new solo joins.
//   quizzes/{quizId}/answers/{partId_qNum} — one doc per (participant,
//                                             question) — the deterministic
//                                             doc ID doubles as the
//                                             duplicate-submit guard. Used
//                                             for both live and solo answers
//                                             identically.
//   quizSecrets/{quizId}                   — { hostEmail, hostCodeLower,
//                                             hostCode } — NEVER readable
//                                             from the client; only this
//                                             file (via firebase-admin) ever
//                                             touches it

import { db, FieldValue } from '../../lib/firebaseAdmin';

const ACTIONS = {
  createQuiz: createQuiz,
  verifyHostCode: verifyHostCode,
  addQuestions: addQuestions,
  getQuestions: getQuestions,
  updateQuestion: updateQuestion,
  deleteQuestion: deleteQuestion,
  deleteQuestions: deleteQuestions,           // multi-select delete
  deleteAllQuestions: deleteAllQuestions,     // clear the whole question bank
  joinQuiz: joinQuiz,
  getQuizState: getQuizState,
  getParticipants: getParticipants,
  removeParticipant: removeParticipant,
  startQuiz: startQuiz,
  nextQuestion: nextQuestion,
  revealAnswer: revealAnswer,
  submitAnswer: submitAnswer,
  pauseQuiz: pauseQuiz,
  resumeQuiz: resumeQuiz,
  resetQuiz: resetQuiz,
  endQuiz: endQuiz,
  getMyQuizzes: getMyQuizzes,
  getResults: getResults,
  // Self-paced ("take it later") actions — see the comment above
  // joinSoloQuiz for what these add to the participant doc shape.
  joinSoloQuiz: joinSoloQuiz,
  getSoloState: getSoloState,
  submitSoloAnswer: submitSoloAnswer,
  soloNextQuestion: soloNextQuestion,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { action, ...params } = req.body || {};
  const fn = ACTIONS[action];
  if (!fn) {
    res.status(400).json({ error: 'Unknown action: ' + action });
    return;
  }
  try {
    const result = await fn(params);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message || String(err) });
  }
}

// ── Small helpers (ported from Code.gs) ────────────────────────────────────

function nowIso() {
  return new Date().toISOString();
}

// Turns "a, c" / "C,A" / "a" into a canonical, order-independent form
// ("A,C" / "A") so selected-vs-correct comparisons don't care about the
// order the student tapped things in, or stray casing/whitespace.
function normalizeAnswer(str) {
  return String(str || '')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean)
    .sort()
    .join(',');
}

function isSolo(participant) {
  return participant.mode === 'solo';
}

async function getQuizDoc(quizId) {
  const id = String(quizId || '').trim().toUpperCase();
  const snap = await db.collection('quizzes').doc(id).get();
  if (!snap.exists) throw new Error('Quiz not found: ' + id);
  return { id, ref: snap.ref, data: snap.data() };
}

async function getSecretDoc(quizId) {
  const snap = await db.collection('quizSecrets').doc(quizId).get();
  if (!snap.exists) throw new Error('Quiz not found: ' + quizId);
  return snap.data();
}

// Every host-only action (start/next/reveal/pause/resume/end/getParticipants/
// addQuestions) must pass hostCode, and it must match this quiz's own host
// code exactly — the short code the teacher/parent set themselves when
// creating the quiz. hostEmail is only ever used for getMyQuizzes (the
// dashboard's "my quizzes" list), not for host-panel authorization.
function assertHost(secret, hostCode) {
  if (!hostCode || String(secret.hostCode).trim().toUpperCase() !== String(hostCode).trim().toUpperCase()) {
    throw new Error('Incorrect host code for this quiz.');
  }
}

// Strips the correct answer before anything goes to a participant. qDoc is
// the raw Firestore question doc data; quizData is the parent quiz doc data
// (for totalQuestions / defaultTimeLimitSec fallbacks).
function publicQuestion(qDoc, quizData) {
  return {
    qNum: Number(qDoc.qNum),
    // Lets every screen (participant AND host) show "Question X of Y".
    totalQuestions: Number(quizData.totalQuestions) || 0,
    questionText: qDoc.questionText,
    options: {
      A: qDoc.optionA || '',
      B: qDoc.optionB || '',
      C: qDoc.optionC || '',
      D: qDoc.optionD || '',
    },
    mediaUrl: qDoc.mediaUrl || '',
    timeLimitSec: Number(qDoc.timeLimitSec) || Number(quizData.defaultTimeLimitSec) || 20,
    // Multi-select is inferred from the Correct Answer field containing more
    // than one letter (e.g. "A,C") — tells the client to render checkbox-
    // style toggles instead of radio-style single-pick, WITHOUT revealing
    // which letters are actually correct.
    multiSelect: normalizeAnswer(qDoc.correctAnswer).split(',').length > 1,
  };
}

function computeScore(isCorrect, responseDurationMs, timeLimitSec, qDoc, quizData) {
  if (!isCorrect) return Number(quizData.wrongAnswerPoints) || 0;

  const questionPoints = Number(qDoc.points) || Number(quizData.basePoints) || 1000;
  if (quizData.speedBonusEnabled === false) return questionPoints;

  const minPoints = Number(quizData.minCorrectPoints) || 0;
  const fractionRemaining = Math.max(0, Math.min(1, 1 - (responseDurationMs / (timeLimitSec * 1000))));
  return Math.round(minPoints + (questionPoints - minPoints) * fractionRemaining);
}

// Running leaderboard computed from every answer submitted so far — used to
// show "where do I stand" after each round, distinct from the frozen
// `leaderboard` field written once at endQuiz.
async function computeStandings(quizId) {
  const [participantsSnap, answersSnap] = await Promise.all([
    db.collection('quizzes').doc(quizId).collection('participants').get(),
    db.collection('quizzes').doc(quizId).collection('answers').get(),
  ]);
  const answers = answersSnap.docs.map(d => d.data());

  const standings = participantsSnap.docs
    // Self-paced takers are excluded from the LIVE running standings shown
    // between questions — their scores aren't "final" yet and mixing them
    // in would blur the Live/Self-Paced split that's meant to only really
    // show up in the final results (see endQuiz).
    .filter(pDoc => pDoc.data().status !== 'left' && !isSolo(pDoc.data()))
    .map(pDoc => {
      const participant = pDoc.data();
      const mine = answers.filter(a => a.participantId === pDoc.id);
      const totalScore = mine.reduce((sum, a) => sum + (Number(a.pointsEarned) || 0), 0);
      return { participantId: pDoc.id, name: participant.name, totalScore };
    });

  standings.sort((a, b) => b.totalScore - a.totalScore);
  standings.forEach((r, i) => { r.rank = i + 1; });
  return standings.slice(0, 8); // top 8 keeps the payload small and the screen readable
}

// ── Actions ─────────────────────────────────────────────────────────────

async function createQuiz(p) {
  const quizId = String(p.quizId || '').trim().toUpperCase();
  if (!quizId) throw new Error('quizId required');
  if (!p.hostEmail) throw new Error('hostEmail required');
  const hostCode = String(p.hostCode || '').trim().toUpperCase();
  if (!hostCode) throw new Error('hostCode required');
  if (!/^[A-Za-z0-9]{4,10}$/.test(hostCode)) throw new Error('Host code should be 4–10 letters/numbers.');

  const quizRef = db.collection('quizzes').doc(quizId);
  const secretRef = db.collection('quizSecrets').doc(quizId);

  await db.runTransaction(async (txn) => {
    const existing = await txn.get(quizRef);
    if (existing.exists) throw new Error('Quiz ID already exists: ' + quizId);

    txn.set(quizRef, {
      quizId,
      title: p.title || quizId,
      description: p.description || '',
      status: 'lobby',
      currentQuestionIndex: -1,
      currentQuestionStartedAt: null,
      currentQuestion: null,
      pausedAt: null,
      answeredCount: 0,
      participantCount: 0,
      soloParticipantCount: 0,
      totalQuestions: 0,
      reveal: null,
      leaderboard: null,
      defaultTimeLimitSec: Number(p.defaultTimeLimit) || 20,
      basePoints: Number(p.basePoints) || 1000,
      minCorrectPoints: Number(p.minCorrectPoints) || 500,
      wrongAnswerPoints: Number(p.wrongAnswerPoints) || 0,
      speedBonusEnabled: p.speedBonusEnabled !== false,
      createdAt: nowIso(),
    });

    txn.set(secretRef, {
      hostEmail: p.hostEmail,
      hostEmailLower: String(p.hostEmail).trim().toLowerCase(),
      hostCode,
    });
  });

  return { ok: true, quizId };
}

// Lightweight check used by the host-panel entry screen (pages/quiz-host/
// [code].js) before it renders anything host-only — lets that page show a
// clean "wrong code" error without needing any other action to fail first.
async function verifyHostCode(p) {
  const { data: quizData } = await getQuizDoc(p.quizId);
  const secret = await getSecretDoc(String(p.quizId).trim().toUpperCase());
  assertHost(secret, p.hostCode);
  return { ok: true, quizId: quizData.quizId, title: quizData.title };
}

// Bulk-adds questions parsed client-side from the teacher's uploaded Excel
// Shared by addQuestions (bulk Excel import) and updateQuestion (single edit
// from the front-end question manager) — same rules either way: Question
// Text + at least Option A/B required, and every letter in Correct Answer
// must have a matching option filled in.
function validateQuestionFields(q, label) {
  const questionText = String(q.questionText || '').trim();
  if (!questionText) throw new Error(label + ': Question Text is required.');

  const options = {
    A: String(q.optionA || '').trim(),
    B: String(q.optionB || '').trim(),
    C: String(q.optionC || '').trim(),
    D: String(q.optionD || '').trim(),
  };
  if (!options.A || !options.B) {
    throw new Error(label + ' ("' + questionText + '"): needs at least Option A and Option B.');
  }

  const correctAnswer = normalizeAnswer(q.correctAnswer);
  if (!correctAnswer) {
    throw new Error(label + ' ("' + questionText + '"): Correct Answer is required.');
  }
  const badLetter = correctAnswer.split(',').find(letter => !options[letter]);
  if (badLetter) {
    throw new Error(label + ' ("' + questionText + '"): Correct Answer "' + badLetter + '" has no matching option filled in.');
  }

  return {
    questionText,
    optionA: options.A,
    optionB: options.B,
    optionC: options.C,
    optionD: options.D,
    correctAnswer,
    timeLimitSec: q.timeLimitSec || null,
    points: q.points || null,
    mediaUrl: String(q.mediaUrl || '').trim(),
  };
}

// Question-bank edits (add/update/delete/reorder-via-delete) are only
// allowed before the quiz has started — editing a question mid-quiz while
// it's live on a projector is a can of worms (renumbering, an already-active
// question changing under students' feet) that's out of scope here. Once
// status leaves 'lobby', the question bank is frozen.
function assertEditableQuestions(quizData) {
  if (quizData.status !== 'lobby') {
    throw new Error('Questions can only be added, edited, or deleted before the quiz is started (it\'s currently ' + quizData.status + ').');
  }
}

// file (see components/QuizQuestionUploader.js). Ignores any "Q Num" the
// sheet/template had — questions are numbered by appending after whatever
// already exists for this quiz, so two uploads back-to-back can never
// collide on question numbers. Question docs use the question number itself
// as their Firestore doc ID (e.g. "1", "2"...), so every later read
// (startQuiz/nextQuestion/submitAnswer) is a cheap direct doc.get() instead
// of a query.
async function addQuestions(p) {
  const { id: quizId, data: quizData } = await getQuizDoc(p.quizId);
  const secret = await getSecretDoc(quizId);
  assertHost(secret, p.hostCode);
  assertEditableQuestions(quizData);
  if (!Array.isArray(p.questions) || !p.questions.length) throw new Error('No questions to add.');

  const existingTotal = Number(quizData.totalQuestions) || 0;
  const questionsRef = db.collection('quizzes').doc(quizId).collection('questions');

  // validateQuestionFields throws on the first bad row, so nothing is
  // written until every row in this batch has passed.
  const rowsToAdd = p.questions.map((q, i) => ({
    qNum: existingTotal + i + 1,
    ...validateQuestionFields(q, 'Row ' + (i + 1)),
  }));

  const batch = db.batch();
  rowsToAdd.forEach(row => {
    batch.set(questionsRef.doc(String(row.qNum)), row);
  });
  batch.update(db.collection('quizzes').doc(quizId), {
    totalQuestions: FieldValue.increment(rowsToAdd.length),
  });
  await batch.commit();

  return {
    ok: true,
    added: rowsToAdd.length,
    firstQNum: existingTotal + 1,
    lastQNum: existingTotal + rowsToAdd.length,
  };
}

// Lists the full question bank (INCLUDING correct answers) for the
// front-end question manager — host-only, since this is exactly the data
// participants must never see directly.
async function getQuestions(p) {
  const { id: quizId } = await getQuizDoc(p.quizId);
  const secret = await getSecretDoc(quizId);
  assertHost(secret, p.hostCode);

  const snap = await db.collection('quizzes').doc(quizId).collection('questions').get();
  const questions = snap.docs
    .map(d => d.data())
    .sort((a, b) => Number(a.qNum) - Number(b.qNum));

  return { questions };
}

// Edits one existing question in place — same validation as adding one,
// just overwriting the doc at that qNum instead of appending a new one.
async function updateQuestion(p) {
  const { id: quizId, data: quizData } = await getQuizDoc(p.quizId);
  const secret = await getSecretDoc(quizId);
  assertHost(secret, p.hostCode);
  assertEditableQuestions(quizData);

  const qNum = Number(p.qNum);
  if (!qNum) throw new Error('qNum required');
  const questionRef = db.collection('quizzes').doc(quizId).collection('questions').doc(String(qNum));
  const existing = await questionRef.get();
  if (!existing.exists) throw new Error('Question ' + qNum + ' not found.');

  const validated = validateQuestionFields(p, 'Question ' + qNum);
  await questionRef.set({ qNum, ...validated });

  return { ok: true, qNum };
}

// Deletes one question and renumbers everything after it so the question
// bank stays gap-free (1, 2, 3... with no holes) — startQuiz/nextQuestion
// depend on that contiguous numbering to find "the next doc" by number.
// Small collection, so a full read-and-rewrite is simpler and safer than
// trying to patch just the affected range.
async function deleteQuestion(p) {
  const { id: quizId, ref: quizRef, data: quizData } = await getQuizDoc(p.quizId);
  const secret = await getSecretDoc(quizId);
  assertHost(secret, p.hostCode);
  assertEditableQuestions(quizData);

  const targetQNum = Number(p.qNum);
  if (!targetQNum) throw new Error('qNum required');

  const questionsRef = quizRef.collection('questions');
  const snap = await questionsRef.get();
  const remaining = snap.docs
    .map(d => d.data())
    .filter(q => Number(q.qNum) !== targetQNum)
    .sort((a, b) => Number(a.qNum) - Number(b.qNum));

  const batch = db.batch();
  // Clear every existing doc first, then rewrite 1..N fresh — avoids any
  // ambiguity about which old doc IDs to reuse vs delete.
  snap.docs.forEach(d => batch.delete(d.ref));
  remaining.forEach((q, i) => {
    batch.set(questionsRef.doc(String(i + 1)), { ...q, qNum: i + 1 });
  });
  batch.update(quizRef, { totalQuestions: remaining.length });
  await batch.commit();

  return { ok: true, remaining: remaining.length };
}

// Multi-select delete — the "check a batch, delete them" button next to
// each question's individual trash icon. Same read-all/delete-all/rewrite-
// renumbered approach as deleteQuestion above, just filtering out a whole
// Set of qNums instead of one.
async function deleteQuestions(p) {
  const { id: quizId, ref: quizRef, data: quizData } = await getQuizDoc(p.quizId);
  const secret = await getSecretDoc(quizId);
  assertHost(secret, p.hostCode);
  assertEditableQuestions(quizData);
  if (!Array.isArray(p.qNums) || !p.qNums.length) throw new Error('No questions selected to delete.');

  const toRemove = new Set(p.qNums.map(n => Number(n)));
  const questionsRef = quizRef.collection('questions');
  const snap = await questionsRef.get();
  const remaining = snap.docs
    .map(d => d.data())
    .filter(q => !toRemove.has(Number(q.qNum)))
    .sort((a, b) => Number(a.qNum) - Number(b.qNum));

  const batch = db.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  remaining.forEach((q, i) => {
    batch.set(questionsRef.doc(String(i + 1)), { ...q, qNum: i + 1 });
  });
  batch.update(quizRef, { totalQuestions: remaining.length });
  await batch.commit();

  return { ok: true, removed: toRemove.size, remaining: remaining.length };
}

// Wipes the whole question bank in one shot — the "start over" button for a
// host who uploaded the wrong Excel file and wants to re-upload a fresh one,
// instead of deleting questions one row (or one checkbox-batch) at a time.
async function deleteAllQuestions(p) {
  const { id: quizId, ref: quizRef, data: quizData } = await getQuizDoc(p.quizId);
  const secret = await getSecretDoc(quizId);
  assertHost(secret, p.hostCode);
  assertEditableQuestions(quizData);

  const snap = await quizRef.collection('questions').get();
  const batch = db.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  batch.update(quizRef, { totalQuestions: 0 });
  await batch.commit();

  return { ok: true, removed: snap.size };
}

async function joinQuiz(p) {
  const { id: quizId, ref: quizRef, data: quizData } = await getQuizDoc(p.quizId);
  if (quizData.status === 'ended') throw new Error('This quiz has already ended.');
  if (!p.name) throw new Error('name required');

  const participantRef = quizRef.collection('participants').doc();
  await participantRef.set({
    name: String(p.name).trim(),
    age: p.age || '',
    joinTime: nowIso(),
    status: 'active',
  });
  await quizRef.update({ participantCount: FieldValue.increment(1) });

  return { ok: true, participantId: participantRef.id, quizId, status: quizData.status };
}

async function getQuizState(p) {
  const { id: quizId, data } = await getQuizDoc(p.quizId);
  return {
    quizId,
    title: data.title,
    description: data.description,
    status: data.status,
    currentQuestionIndex: data.currentQuestionIndex,
    currentQuestion: data.currentQuestion || null,
    totalQuestions: data.totalQuestions || 0,
    participantCount: data.participantCount || 0,
    // Surfaced separately from participantCount (which only ever counts
    // live joins — see joinQuiz/joinSoloQuiz) so the host can see at a
    // glance that people are taking it self-paced, without it inflating
    // the live lobby/"X answered" numbers.
    soloParticipantCount: data.soloParticipantCount || 0,
    answeredCount: data.answeredCount || 0,
  };
}

async function getParticipants(p) {
  const { id: quizId } = await getQuizDoc(p.quizId);
  const secret = await getSecretDoc(quizId);
  assertHost(secret, p.hostCode);

  const snap = await db.collection('quizzes').doc(quizId).collection('participants').get();
  return {
    // Self-paced takers are deliberately left out of this list — it feeds
    // the host's live "Participants" panel (with a Remove button that kicks
    // someone out of the LIVE round), which isn't a meaningful action for
    // someone playing entirely on their own timer.
    participants: snap.docs
      .filter(d => d.data().status !== 'left' && !isSolo(d.data()))
      .map(d => ({ participantId: d.id, name: d.data().name, age: d.data().age, joinTime: d.data().joinTime })),
  };
}

// Removes one participant — allowed at ANY quiz status (lobby, live, paused,
// ended), unlike question edits or reset which are restricted to specific
// states. A soft delete (status: 'left'), not an actual doc delete, so their
// past answers/scores stay intact for anything already computed (results
// tables, CSV export) — they just stop counting going forward: excluded
// from participantCount, the live "X of Y answered" tally, and the
// standings/leaderboard the next time either is recomputed. The participant
// themselves gets kicked to a "removed" screen (see lib/quizFirestore.js's
// optional self-participant listener) rather than being silently forgotten
// while still sitting in the quiz.
async function removeParticipant(p) {
  const { id: quizId, ref: quizRef } = await getQuizDoc(p.quizId);
  const secret = await getSecretDoc(quizId);
  assertHost(secret, p.hostCode);
  if (!p.participantId) throw new Error('participantId required');

  const participantRef = quizRef.collection('participants').doc(p.participantId);
  await db.runTransaction(async (txn) => {
    const snap = await txn.get(participantRef);
    if (!snap.exists) throw new Error('Participant not found.');
    if (snap.data().status === 'left') return; // already removed — no-op, not an error
    txn.update(participantRef, { status: 'left' });
    txn.update(quizRef, { participantCount: FieldValue.increment(-1) });
  });

  return { ok: true };
}

async function startQuiz(p) {
  const { id: quizId, ref: quizRef, data: quizData } = await getQuizDoc(p.quizId);
  const secret = await getSecretDoc(quizId);
  assertHost(secret, p.hostCode);
  if (quizData.status !== 'lobby') throw new Error('Quiz is not in lobby (status: ' + quizData.status + ')');

  const qSnap = await quizRef.collection('questions').doc('1').get();
  if (!qSnap.exists) throw new Error('Quiz has no questions.');

  const startedAt = nowIso();
  const currentQuestion = { ...publicQuestion(qSnap.data(), quizData), startedAt };

  await quizRef.update({
    status: 'live',
    currentQuestionIndex: 0,
    currentQuestionStartedAt: startedAt,
    currentQuestion,
    answeredCount: 0,
    reveal: null,
  });

  return { ok: true };
}

// Advances to the next question (or ends the quiz if this was the last
// one). Deliberately does NOT re-broadcast the reveal/standings itself —
// that's a separate host action (see revealAnswer), paced entirely by the
// host's own two clicks — see OnlineQuizHost.js's "Reveal Answers Now" /
// "Next Question" buttons.
async function nextQuestion(p) {
  const { id: quizId, ref: quizRef, data: quizData } = await getQuizDoc(p.quizId);
  const secret = await getSecretDoc(quizId);
  assertHost(secret, p.hostCode);
  if (quizData.status !== 'live') throw new Error('Quiz is not live.');

  const currentIdx = Number(quizData.currentQuestionIndex);
  const nextIdx = currentIdx + 1;
  const qSnap = await quizRef.collection('questions').doc(String(nextIdx + 1)).get();

  if (!qSnap.exists) {
    return endQuiz(p); // no more questions — auto-end
  }

  const startedAt = nowIso();
  const currentQuestion = { ...publicQuestion(qSnap.data(), quizData), startedAt };

  await quizRef.update({
    currentQuestionIndex: nextIdx,
    currentQuestionStartedAt: startedAt,
    currentQuestion,
    answeredCount: 0,
    reveal: null,
  });

  return { ok: true, qNum: nextIdx + 1 };
}

// Lets the host reveal the answer breakdown for the CURRENT question
// without advancing — supports a "show results, then next" two-step flow.
async function revealAnswer(p) {
  const { id: quizId, ref: quizRef, data: quizData } = await getQuizDoc(p.quizId);
  const secret = await getSecretDoc(quizId);
  assertHost(secret, p.hostCode);

  const idx = Number(quizData.currentQuestionIndex);
  if (idx < 0) throw new Error('No question is currently active.');
  await broadcastQuestionEnded(quizId, quizRef, idx + 1);
  return { ok: true };
}

async function broadcastQuestionEnded(quizId, quizRef, qNum) {
  const qSnap = await quizRef.collection('questions').doc(String(qNum)).get();
  if (!qSnap.exists) return;
  const q = qSnap.data();

  const [answersSnap, participantsSnap] = await Promise.all([
    quizRef.collection('answers').where('qNum', '==', qNum).get(),
    quizRef.collection('participants').get(),
  ]);
  const answers = answersSnap.docs.map(d => d.data());
  // Excludes self-paced takers — this feeds the "no answer" bucket for THIS
  // live round (participantCount minus who answered), and solo players
  // aren't on this round at all, live or otherwise.
  const participantCount = participantsSnap.docs.filter(d => d.data().status !== 'left' && !isSolo(d.data())).length;

  // Each participant may have selected more than one letter (multi-select),
  // so a single answer doc can contribute to more than one bucket here.
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  let correctCount = 0;
  answers.forEach(a => {
    String(a.selectedAnswer || '').split(',').forEach(letter => {
      const l = letter.trim().toUpperCase();
      if (counts[l] !== undefined) counts[l]++;
    });
    if (a.isCorrect === true) correctCount++;
  });
  const incorrectCount = answers.length - correctCount; // among those who answered
  const noAnswerCount = Math.max(0, participantCount - answers.length); // timed out with nothing submitted

  const standings = await computeStandings(quizId);

  await quizRef.update({
    reveal: {
      qNum,
      correctAnswer: q.correctAnswer,
      answerCounts: counts,
      correctCount,
      incorrectCount: incorrectCount + noAnswerCount, // no-answer counts as incorrect, same rule as final scoring
      standings,
    },
  });
}

async function submitAnswer(p) {
  const { id: quizId, ref: quizRef, data: quizData } = await getQuizDoc(p.quizId);
  if (quizData.status !== 'live') throw new Error('Quiz is not live.');
  if (!p.participantId) throw new Error('participantId required');

  const qNum = Number(quizData.currentQuestionIndex) + 1;
  if (Number(p.qNum) !== qNum) throw new Error('Answer submitted for wrong/expired question.');

  const qSnap = await quizRef.collection('questions').doc(String(qNum)).get();
  if (!qSnap.exists) throw new Error('Question not found.');
  const question = qSnap.data();

  const timeLimitSec = Number(question.timeLimitSec) || Number(quizData.defaultTimeLimitSec) || 20;
  const startedAtMs = Date.parse(quizData.currentQuestionStartedAt);
  const answeredAtMs = Date.now();
  let responseDurationMs = answeredAtMs - startedAtMs;
  responseDurationMs = Math.max(0, Math.min(responseDurationMs, timeLimitSec * 1000));
  const isLate = (answeredAtMs - startedAtMs) > timeLimitSec * 1000;

  const isCorrect = normalizeAnswer(p.selectedAnswer) !== '' &&
    normalizeAnswer(p.selectedAnswer) === normalizeAnswer(question.correctAnswer);
  const pointsEarned = isLate ? 0 : computeScore(isCorrect, responseDurationMs, timeLimitSec, question, quizData);

  // The doc ID (participantId_qNum) IS the duplicate-submit guard — a
  // transaction here makes "does it already exist" and "write it" atomic,
  // which is actually a stronger guarantee than the original Sheets-based
  // check had.
  const answerRef = quizRef.collection('answers').doc(`${p.participantId}_${qNum}`);
  await db.runTransaction(async (txn) => {
    const existing = await txn.get(answerRef);
    if (existing.exists) throw new Error('Already answered this question.');
    txn.set(answerRef, {
      participantId: p.participantId,
      qNum,
      selectedAnswer: p.selectedAnswer,
      isCorrect,
      answeredAt: nowIso(),
      responseDurationMs,
      pointsEarned,
    });
    txn.update(quizRef, { answeredCount: FieldValue.increment(1) });
  });

  // Personal feedback goes back in the direct HTTP response, not the
  // realtime channel — only the answering participant should see whether
  // THEY were right; the Firestore doc stays aggregate-only (answeredCount),
  // same rule the old Pusher-based setup followed.
  return { ok: true, isCorrect, pointsEarned };
}

// Resets a paused-or-ended quiz back to a fresh lobby so it can be run again
// from Question 1 — for a re-run with a new group, or a redo with the same
// one. Deliberately keeps the participant roster (so already-joined devices
// don't need to re-enter the join code) and the question bank untouched —
// only wipes the THINGS THAT WERE PRODUCED BY RUNNING IT: every submitted
// answer, the running/final leaderboard, and the quiz's own progress
// pointers (currentQuestionIndex, reveal, etc). Deliberately only allowed
// from 'paused' or 'ended' — never mid-'live' — so a reset can't be fired
// out from under a question that's actively counting down on a projector.
async function resetQuiz(p) {
  const { id: quizId, ref: quizRef, data: quizData } = await getQuizDoc(p.quizId);
  const secret = await getSecretDoc(quizId);
  assertHost(secret, p.hostCode);

  if (quizData.status !== 'paused' && quizData.status !== 'ended') {
    throw new Error('Quiz can only be reset while paused or ended (it\'s currently ' + quizData.status + ').');
  }

  const [answersSnap, participantsSnap] = await Promise.all([
    quizRef.collection('answers').get(),
    quizRef.collection('participants').get(),
  ]);
  const batch = db.batch();
  answersSnap.docs.forEach(d => batch.delete(d.ref));
  // Every answer is about to be wiped, so any self-paced participant's
  // progress pointer needs to go back to Question 1 too — otherwise they'd
  // be left "on Question 5" with none of questions 1–5's answers actually
  // existing anymore. Live participants don't have these fields at all, so
  // this only ever touches solo docs.
  participantsSnap.docs.forEach(d => {
    if (isSolo(d.data())) {
      batch.update(d.ref, { soloQuestionIndex: 0, soloStartedAt: nowIso() });
    }
  });
  batch.update(quizRef, {
    status: 'lobby',
    currentQuestionIndex: -1,
    currentQuestionStartedAt: null,
    currentQuestion: null,
    pausedAt: null,
    answeredCount: 0,
    reveal: null,
    leaderboard: null,
  });
  await batch.commit();

  return { ok: true };
}


async function pauseQuiz(p) {
  const { id: quizId, ref: quizRef } = await getQuizDoc(p.quizId);
  const secret = await getSecretDoc(quizId);
  assertHost(secret, p.hostCode);
  // Remember the moment we paused — resumeQuiz uses this to shift the
  // question's clock forward by exactly however long the pause lasted, so
  // the countdown truly freezes and continues rather than resetting.
  await quizRef.update({ status: 'paused', pausedAt: nowIso() });
  return { ok: true };
}

async function resumeQuiz(p) {
  const { id: quizId, ref: quizRef, data: quizData } = await getQuizDoc(p.quizId);
  const secret = await getSecretDoc(quizId);
  assertHost(secret, p.hostCode);

  // Shift "currentQuestionStartedAt" forward by exactly how long the pause
  // lasted. Time that elapsed BEFORE the pause still counts (no free extra
  // time), but time spent paused doesn't count against the student at all —
  // the deadline moves out by the same amount, so remaining time is
  // preserved precisely.
  let newStartedAt = quizData.currentQuestionStartedAt;
  if (quizData.pausedAt) {
    const pausedDurationMs = Date.now() - Date.parse(quizData.pausedAt);
    newStartedAt = new Date(Date.parse(quizData.currentQuestionStartedAt) + pausedDurationMs).toISOString();
  }

  const idx = Number(quizData.currentQuestionIndex);
  const qSnap = await quizRef.collection('questions').doc(String(idx + 1)).get();
  const timeLimitSec = qSnap.exists
    ? (Number(qSnap.data().timeLimitSec) || Number(quizData.defaultTimeLimitSec) || 20)
    : (Number(quizData.defaultTimeLimitSec) || 20);

  // Broadcast the corrected startedAt + timeLimitSec (embedded in
  // currentQuestion, which is what lib/quizFirestore.js reads for the
  // 'quiz-resumed' payload) so every client recomputes its countdown
  // against the SAME shifted deadline, instead of each device just resuming
  // its own stale local timer.
  await quizRef.update({
    status: 'live',
    currentQuestionStartedAt: newStartedAt,
    pausedAt: null,
    'currentQuestion.startedAt': newStartedAt,
    'currentQuestion.timeLimitSec': timeLimitSec,
  });

  return { ok: true };
}

async function endQuiz(p) {
  const { id: quizId, ref: quizRef, data: quizData } = await getQuizDoc(p.quizId);
  const secret = await getSecretDoc(quizId);
  assertHost(secret, p.hostCode);

  const idx = Number(quizData.currentQuestionIndex);
  if (idx >= 0) await broadcastQuestionEnded(quizId, quizRef, idx + 1);

  const [participantsSnap, answersSnap] = await Promise.all([
    quizRef.collection('participants').get(),
    quizRef.collection('answers').get(),
  ]);
  const answers = answersSnap.docs.map(d => d.data());
  const totalQuestions = Number(quizData.totalQuestions) || 0;

  // Only the LIVE cohort gets scored/frozen here — self-paced participants
  // are deliberately excluded. Ending the quiz closes the live round, but
  // self-paced stays open indefinitely (see the big comment above
  // joinSoloQuiz), so there's no single moment where "final" self-paced
  // results could ever be frozen — getResults below recomputes those fresh
  // on every call instead.
  const liveResults = participantsSnap.docs
    .filter(pDoc => pDoc.data().status !== 'left' && !isSolo(pDoc.data()))
    .map(pDoc => {
      const participant = pDoc.data();
      const mine = answers.filter(a => a.participantId === pDoc.id);
      const correct = mine.filter(a => a.isCorrect === true).length;
      const totalScore = mine.reduce((sum, a) => sum + (Number(a.pointsEarned) || 0), 0);
      const avgResponseMs = mine.length
        ? Math.round(mine.reduce((s, a) => s + (Number(a.responseDurationMs) || 0), 0) / mine.length)
        : 0;
      return {
        participantId: pDoc.id,
        // Matches what OnlineQuizHost.js's Final Results screen and CSV
        // export actually read (r.name / r.rank) — same shape getResults
        // below returns.
        name: participant.name,
        totalScore,
        // Counted against the total question count, not just answered ones —
        // a skipped/timed-out question is still an incorrect, not invisible.
        correctAnswers: correct,
        incorrectAnswers: Math.max(0, totalQuestions - correct),
        avgResponseMs,
        mode: 'live',
      };
    });

  liveResults.sort((a, b) => b.totalScore - a.totalScore || a.avgResponseMs - b.avgResponseMs);
  liveResults.forEach((r, i) => { r.rank = i + 1; });

  await quizRef.update({ status: 'ended', leaderboard: liveResults });

  // Returned merged with the current self-paced standings so whoever's
  // watching live right when the host ends it sees the complete picture
  // immediately, not just the live half — matches what getResults returns.
  const soloResults = await computeSoloLeaderboard(quizRef, totalQuestions);
  return { ok: true, leaderboard: liveResults.concat(soloResults) };
}

// Lists every quiz created by a given host — used by the teacher-facing
// "Online Quizzes" panel (Parent/Teacher Portal) to show "my quizzes"
// without exposing anyone else's.
async function getMyQuizzes(p) {
  if (!p.hostEmail) throw new Error('hostEmail required');
  const hostEmailLower = String(p.hostEmail).trim().toLowerCase();

  const secretsSnap = await db.collection('quizSecrets').where('hostEmailLower', '==', hostEmailLower).get();
  const quizIds = secretsSnap.docs.map(d => d.id);
  const secretsById = Object.fromEntries(secretsSnap.docs.map(d => [d.id, d.data()]));

  if (!quizIds.length) return { quizzes: [] };

  const quizDocs = await Promise.all(quizIds.map(id => db.collection('quizzes').doc(id).get()));
  const quizzes = quizDocs
    .filter(snap => snap.exists)
    .map(snap => {
      const data = snap.data();
      return {
        quizId: data.quizId,
        title: data.title,
        description: data.description,
        status: data.status,
        hostCode: secretsById[snap.id]?.hostCode,
        createdAt: data.createdAt,
      };
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); // newest first

  return { quizzes };
}

// Returns the FULL current report — the live cohort's one-time frozen
// result (empty until the host presses "End Quiz") concatenated with a
// freshly recomputed self-paced leaderboard (see computeSoloLeaderboard).
// Called with no host code required — anyone with the join link can check
// it, live or self-paced, at any time, including long after the live
// session ended. Every call recomputes the self-paced half from scratch, so
// this genuinely is "the latest rankings" each time it's fetched.
async function getResults(p) {
  const { ref: quizRef, data } = await getQuizDoc(p.quizId);
  const liveLeaderboard = data.leaderboard || [];
  const totalQuestions = Number(data.totalQuestions) || 0;
  const soloLeaderboard = await computeSoloLeaderboard(quizRef, totalQuestions);
  return { leaderboard: liveLeaderboard.concat(soloLeaderboard) };
}

// ── Self-paced ("take it later") mode ───────────────────────────────────
// Lets someone who missed the live session join the SAME quiz and move
// through it entirely on their own: they get Question 1 the instant they
// join, click "Next" themselves instead of waiting on the host, and see
// their own independent per-question countdown (their own soloStartedAt,
// not the shared currentQuestionStartedAt). Nothing here touches the live
// quiz doc's currentQuestion/currentQuestionIndex — those stay 100% about
// the host-driven live round — so this never interferes with (or gets
// interfered with by) whatever's happening live.
//
// The quiz stays open to new self-paced joiners FOREVER — including well
// after the host has pressed "End Quiz". That's the entire point of this
// mode: someone who missed the live session should be able to click the
// same link days later and still take the quiz from Question 1. So unlike
// the rest of this file, none of the functions below ever check
// quizData.status at all.
//
// Because of that, self-paced results can never be "frozen" the way the
// live cohort's are in endQuiz — new solo completions keep happening
// indefinitely. So there IS no stored solo leaderboard: computeSoloLeaderboard
// below recomputes it fresh, from scratch, on every single call. getResults
// merges that fresh computation with the live cohort's one-time frozen
// snapshot every time it's called — see its comment for why that split is
// the right one.

async function joinSoloQuiz(p) {
  const { id: quizId, ref: quizRef, data: quizData } = await getQuizDoc(p.quizId);
  if (!p.name) throw new Error('name required');

  const qSnap = await quizRef.collection('questions').doc('1').get();
  if (!qSnap.exists) throw new Error('This quiz has no questions yet.');

  const startedAt = nowIso();
  const participantRef = quizRef.collection('participants').doc();
  await participantRef.set({
    name: String(p.name).trim(),
    age: p.age || '',
    joinTime: startedAt,
    status: 'active',
    mode: 'solo',
    soloQuestionIndex: 0,
    soloStartedAt: startedAt,
  });
  // Deliberately does NOT increment participantCount — that field drives
  // the host's live headcount/lobby screen, which self-paced takers aren't
  // part of. Tracked separately below so the host still has visibility.
  await quizRef.update({ soloParticipantCount: FieldValue.increment(1) });

  return {
    ok: true,
    participantId: participantRef.id,
    quizId,
    title: quizData.title,
    question: { ...publicQuestion(qSnap.data(), quizData), startedAt },
  };
}

// Re-fetches whatever a self-paced participant should currently be looking
// at — the solo equivalent of getQuizState, used on page reload/reconnect
// (see the client's "Restore identity on reload" effect).
async function getSoloState(p) {
  const { ref: quizRef, data: quizData } = await getQuizDoc(p.quizId);
  const pSnap = await quizRef.collection('participants').doc(p.participantId).get();
  if (!pSnap.exists) throw new Error('Participant not found.');
  const participant = pSnap.data();
  if (!isSolo(participant)) throw new Error('Not a self-paced participant.');

  const totalQuestions = Number(quizData.totalQuestions) || 0;
  const idx = Number(participant.soloQuestionIndex);
  const qSnap = idx < totalQuestions
    ? await quizRef.collection('questions').doc(String(idx + 1)).get()
    : null;

  if (!qSnap || !qSnap.exists) {
    const { summary, leaderboard } = await soloCompletionPayload(quizRef, quizData, p.participantId, participant);
    return { ok: true, completed: true, summary, leaderboard };
  }

  return {
    ok: true,
    title: quizData.title,
    question: { ...publicQuestion(qSnap.data(), quizData), startedAt: participant.soloStartedAt },
  };
}

async function submitSoloAnswer(p) {
  const { ref: quizRef, data: quizData } = await getQuizDoc(p.quizId);
  const participantRef = quizRef.collection('participants').doc(p.participantId);
  const pSnap = await participantRef.get();
  if (!pSnap.exists) throw new Error('Participant not found.');
  const participant = pSnap.data();
  if (!isSolo(participant)) throw new Error('Not a self-paced participant.');

  const qNum = Number(participant.soloQuestionIndex) + 1;
  if (Number(p.qNum) !== qNum) throw new Error('Answer submitted for wrong/expired question.');

  const qSnap = await quizRef.collection('questions').doc(String(qNum)).get();
  if (!qSnap.exists) throw new Error('Question not found.');
  const question = qSnap.data();

  const timeLimitSec = Number(question.timeLimitSec) || Number(quizData.defaultTimeLimitSec) || 20;
  const startedAtMs = Date.parse(participant.soloStartedAt);
  const answeredAtMs = Date.now();
  let responseDurationMs = answeredAtMs - startedAtMs;
  responseDurationMs = Math.max(0, Math.min(responseDurationMs, timeLimitSec * 1000));
  const isLate = (answeredAtMs - startedAtMs) > timeLimitSec * 1000;

  const isCorrect = normalizeAnswer(p.selectedAnswer) !== '' &&
    normalizeAnswer(p.selectedAnswer) === normalizeAnswer(question.correctAnswer);
  const pointsEarned = isLate ? 0 : computeScore(isCorrect, responseDurationMs, timeLimitSec, question, quizData);

  // Same doc-ID-as-guard trick as the live submitAnswer — participantId_qNum
  // makes "already exists" and "write it" atomic inside the transaction.
  const answerRef = quizRef.collection('answers').doc(`${p.participantId}_${qNum}`);
  await db.runTransaction(async (txn) => {
    const existing = await txn.get(answerRef);
    if (existing.exists) throw new Error('Already answered this question.');
    txn.set(answerRef, {
      participantId: p.participantId,
      qNum,
      selectedAnswer: p.selectedAnswer,
      isCorrect,
      answeredAt: nowIso(),
      responseDurationMs,
      pointsEarned,
    });
  });

  // No leaderboard-patching needed here (unlike an earlier version of this
  // function) — solo standings are never frozen in the first place, see
  // computeSoloLeaderboard/getResults below. This answer is simply live the
  // instant the next getResults call runs.

  return { ok: true, isCorrect, pointsEarned };
}

// Advances a self-paced participant to their next question, or reports
// completion once they've answered every question. No quiz-status check of
// any kind — self-paced never gets cut off by the host ending the live
// quiz; that's the whole point of this mode (see the file-level comment
// above joinSoloQuiz).
async function soloNextQuestion(p) {
  const { ref: quizRef, data: quizData } = await getQuizDoc(p.quizId);
  const participantRef = quizRef.collection('participants').doc(p.participantId);
  const pSnap = await participantRef.get();
  if (!pSnap.exists) throw new Error('Participant not found.');
  const participant = pSnap.data();
  if (!isSolo(participant)) throw new Error('Not a self-paced participant.');

  const totalQuestions = Number(quizData.totalQuestions) || 0;
  const nextIdx = Number(participant.soloQuestionIndex) + 1;

  if (nextIdx >= totalQuestions) {
    await participantRef.update({ soloQuestionIndex: totalQuestions });
    const { summary, leaderboard } = await soloCompletionPayload(quizRef, quizData, p.participantId, participant);
    return { ok: true, completed: true, summary, leaderboard };
  }

  const qSnap = await quizRef.collection('questions').doc(String(nextIdx + 1)).get();
  const startedAt = nowIso();
  await participantRef.update({ soloQuestionIndex: nextIdx, soloStartedAt: startedAt });

  return { ok: true, question: { ...publicQuestion(qSnap.data(), quizData), startedAt } };
}

// Bundles a just-finished solo participant's own score together with the
// CURRENT self-paced standings — so their "you're done!" screen can show
// "here's how you rank among everyone who's taken this so far" immediately,
// without a second round trip. Reused by getSoloState's completed branch
// (reload-after-finishing) for the exact same reason.
async function soloCompletionPayload(quizRef, quizData, participantId, participant) {
  const totalQuestions = Number(quizData.totalQuestions) || 0;
  const answersSnap = await quizRef.collection('answers').where('participantId', '==', participantId).get();
  const answers = answersSnap.docs.map(d => d.data());
  const correct = answers.filter(a => a.isCorrect === true).length;
  const summary = {
    name: participant.name,
    totalScore: answers.reduce((sum, a) => sum + (Number(a.pointsEarned) || 0), 0),
    correctAnswers: correct,
    incorrectAnswers: Math.max(0, answers.length - correct),
    questionsAnswered: answers.length,
    totalQuestions,
  };
  const leaderboard = await computeSoloLeaderboard(quizRef, totalQuestions);
  return { summary, leaderboard };
}

// Computes the self-paced leaderboard FROM SCRATCH every time it's called —
// there's no stored/frozen version of this, unlike the live cohort's
// leaderboard field (see endQuiz). That's deliberate: self-paced
// participants can finish at any time, indefinitely, so "the" self-paced
// ranking is only ever "as of right now" — every call here IS the report
// updating "as and when anyone else takes the test".
//
// Only counts participants who've actually FINISHED (soloQuestionIndex >=
// totalQuestions) — someone three questions into their own attempt
// shouldn't show up mid-list with an inflated partial score.
async function computeSoloLeaderboard(quizRef, totalQuestions) {
  const [participantsSnap, answersSnap] = await Promise.all([
    quizRef.collection('participants').get(),
    quizRef.collection('answers').get(),
  ]);
  const answers = answersSnap.docs.map(d => d.data());

  const rows = participantsSnap.docs
    .filter(pDoc => pDoc.data().status !== 'left' && isSolo(pDoc.data()) &&
      Number(pDoc.data().soloQuestionIndex) >= totalQuestions)
    .map(pDoc => {
      const participant = pDoc.data();
      const mine = answers.filter(a => a.participantId === pDoc.id);
      const correct = mine.filter(a => a.isCorrect === true).length;
      const totalScore = mine.reduce((sum, a) => sum + (Number(a.pointsEarned) || 0), 0);
      const avgResponseMs = mine.length
        ? Math.round(mine.reduce((s, a) => s + (Number(a.responseDurationMs) || 0), 0) / mine.length)
        : 0;
      return {
        participantId: pDoc.id,
        name: participant.name,
        totalScore,
        correctAnswers: correct,
        incorrectAnswers: Math.max(0, totalQuestions - correct),
        avgResponseMs,
        mode: 'solo',
      };
    });

  rows.sort((a, b) => b.totalScore - a.totalScore || a.avgResponseMs - b.avgResponseMs);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

