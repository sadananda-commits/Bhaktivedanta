// lib/quizApi.js
//
// Thin client-side wrapper around /api/quiz. Every quiz action (host or
// participant) goes through this — see pages/api/quiz.js for the server
// proxy, and Code.gs (Apps Script) for where these actions actually run.
//
// Host actions are authorized by hostCode — a short code the teacher/parent
// set themselves when creating the quiz (see createQuiz below) — NOT by
// email/login. Code.gs re-validates it on every call. hostEmail is only used
// for createQuiz (ownership bookkeeping) and getMyQuizzes (the "my quizzes"
// dashboard list), both of which come from the already-logged-in portal
// session, not from the host panel itself.

async function callQuiz(action, params = {}) {
  const res = await fetch('/api/quiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

export const quizApi = {
  // Participant actions
  joinQuiz: (quizId, name, age) => callQuiz('joinQuiz', { quizId, name, age }),
  getQuizState: (quizId) => callQuiz('getQuizState', { quizId }),
  submitAnswer: (quizId, participantId, qNum, selectedAnswer) =>
    callQuiz('submitAnswer', { quizId, participantId, qNum, selectedAnswer }),
  getResults: (quizId) => callQuiz('getResults', { quizId }),

  // Creation / ownership actions — hostEmail must be the logged-in
  // teacher/admin's portal identity (from Parent Portal's own session).
  createQuiz: (quizId, title, description, hostEmail, hostCode, opts = {}) =>
    callQuiz('createQuiz', { quizId, title, description, hostEmail, hostCode, ...opts }),
  getMyQuizzes: (hostEmail) => callQuiz('getMyQuizzes', { hostEmail }),
  addQuestions: (quizId, hostCode, questions) => callQuiz('addQuestions', { quizId, hostCode, questions }),
  getQuestions: (quizId, hostCode) => callQuiz('getQuestions', { quizId, hostCode }),
  updateQuestion: (quizId, hostCode, qNum, fields) => callQuiz('updateQuestion', { quizId, hostCode, qNum, ...fields }),
  deleteQuestion: (quizId, hostCode, qNum) => callQuiz('deleteQuestion', { quizId, hostCode, qNum }),
  deleteQuestions: (quizId, hostCode, qNums) => callQuiz('deleteQuestions', { quizId, hostCode, qNums }),
  deleteAllQuestions: (quizId, hostCode) => callQuiz('deleteAllQuestions', { quizId, hostCode }),
  deleteQuiz: (quizId, hostCode) => callQuiz('deleteQuiz', { quizId, hostCode }),

  // Host-panel actions — hostCode must match the code set for THIS quiz at
  // creation time. See pages/quiz-host/[code].js for how it's collected.
  verifyHostCode: (quizId, hostCode) => callQuiz('verifyHostCode', { quizId, hostCode }),
  getParticipants: (quizId, hostCode) => callQuiz('getParticipants', { quizId, hostCode }),
  removeParticipant: (quizId, hostCode, participantId) => callQuiz('removeParticipant', { quizId, hostCode, participantId }),
  startQuiz: (quizId, hostCode) => callQuiz('startQuiz', { quizId, hostCode }),
  nextQuestion: (quizId, hostCode) => callQuiz('nextQuestion', { quizId, hostCode }),
  revealAnswer: (quizId, hostCode) => callQuiz('revealAnswer', { quizId, hostCode }),
  pauseQuiz: (quizId, hostCode) => callQuiz('pauseQuiz', { quizId, hostCode }),
  resumeQuiz: (quizId, hostCode) => callQuiz('resumeQuiz', { quizId, hostCode }),
  resetQuiz: (quizId, hostCode) => callQuiz('resetQuiz', { quizId, hostCode }),
  endQuiz: (quizId, hostCode) => callQuiz('endQuiz', { quizId, hostCode }),
};
