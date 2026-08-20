// lib/quizApi.js
//
// Thin client-side wrapper around /api/quiz. Every quiz action (host or
// participant) goes through this — see pages/api/quiz.js for the server
// proxy, and Code.gs (Apps Script) for where these actions actually run.

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

  // Host actions — hostEmail must be the logged-in teacher/admin's email.
  createQuiz: (quizId, title, description, hostEmail, opts = {}) =>
    callQuiz('createQuiz', { quizId, title, description, hostEmail, ...opts }),
  getParticipants: (quizId, hostEmail) => callQuiz('getParticipants', { quizId, hostEmail }),
  startQuiz: (quizId, hostEmail) => callQuiz('startQuiz', { quizId, hostEmail }),
  nextQuestion: (quizId, hostEmail) => callQuiz('nextQuestion', { quizId, hostEmail }),
  revealAnswer: (quizId, hostEmail) => callQuiz('revealAnswer', { quizId, hostEmail }),
  pauseQuiz: (quizId, hostEmail) => callQuiz('pauseQuiz', { quizId, hostEmail }),
  resumeQuiz: (quizId, hostEmail) => callQuiz('resumeQuiz', { quizId, hostEmail }),
  endQuiz: (quizId, hostEmail) => callQuiz('endQuiz', { quizId, hostEmail }),
  getMyQuizzes: (hostEmail) => callQuiz('getMyQuizzes', { hostEmail }),
};
