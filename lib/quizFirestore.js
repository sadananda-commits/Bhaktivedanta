// lib/quizFirestore.js
//
// Drop-in replacement for the old lib/quizPusher.js — same subscribeToQuiz()
// / onConnectionStateChange() shape, same event names and payload shapes, so
// components/OnlineQuizHost.js and components/OnlineQuizParticipant.js only
// ever needed a one-line import change (see the diff notes at the bottom of
// this file) — nothing else in either component had to change.
//
// Instead of a Pusher channel, this listens directly to the quiz's Firestore
// document (+ its participants subcollection) via onSnapshot, and DIFFS each
// snapshot against the previous one to synthesize the same events Pusher
// used to push: 'quiz-started', 'question-started', 'answer-count-updated',
// 'question-ended', 'quiz-paused', 'quiz-resumed', 'quiz-ended',
// 'participant-joined'. Every mutation is still written server-side only —
// see pages/api/quiz.js (via firebase-admin) — this file only ever reads.
//
// The very first snapshot of each listener is treated as a baseline only
// (no events fired from it), matching how a fresh Pusher subscription never
// replays history either — components still get their initial state from
// quizApi.getQuizState()/getParticipants(), same as before.

import { doc, onSnapshot, collection } from 'firebase/firestore';
import { db } from './firebaseClient';

const connectionListeners = new Set();
let lastKnownConnectionState = 'connected';

function emitConnectionState(state) {
  if (state === lastKnownConnectionState) return;
  lastKnownConnectionState = state;
  connectionListeners.forEach(fn => fn(state));
}

// handlers: { 'question-started': fn, 'answer-count-updated': fn, ... }
// Returns an unsubscribe function — call it from a useEffect cleanup.
export function subscribeToQuiz(quizCode, handlers) {
  const quizId = String(quizCode).toUpperCase();
  let prev = null;
  let sawFirstParticipantsSnapshot = false;
  const knownParticipantIds = new Set();

  // eslint-disable-next-line no-console
  console.log('[quizFirestore] subscribing to quiz doc:', quizId);

  const unsubQuiz = onSnapshot(
    doc(db, 'quizzes', quizId),
    { includeMetadataChanges: true },
    (snap) => {
      emitConnectionState(snap.metadata.fromCache ? 'disconnected' : 'connected');
      if (!snap.exists()) {
        // eslint-disable-next-line no-console
        console.warn('[quizFirestore] snapshot received but quizzes/' + quizId + ' does not exist');
        return;
      }
      const data = snap.data();
      // eslint-disable-next-line no-console
      console.log('[quizFirestore] quiz doc snapshot', {
        fromCache: snap.metadata.fromCache,
        status: data.status,
        currentQuestionIndex: data.currentQuestionIndex,
        answeredCount: data.answeredCount,
      });

      // Baseline only — mirrors a fresh Pusher subscription never replaying
      // events that already happened before it connected.
      if (prev === null) { prev = data; return; }

      // Same two events Code.gs used to fire together on Start Quiz.
      if (prev.status === 'lobby' && data.status === 'live') {
        handlers['quiz-started']?.({ status: 'live' });
      }
      if (data.currentQuestion && prev.currentQuestionIndex !== data.currentQuestionIndex) {
        handlers['question-started']?.(data.currentQuestion);
      }
      if (data.answeredCount !== prev.answeredCount) {
        handlers['answer-count-updated']?.({
          qNum: data.currentQuestion?.qNum,
          answeredCount: data.answeredCount,
          participantCount: data.participantCount,
        });
      }
      if (data.reveal && (!prev.reveal || prev.reveal.qNum !== data.reveal.qNum)) {
        handlers['question-ended']?.(data.reveal);
      }
      if (prev.status === 'live' && data.status === 'paused') {
        handlers['quiz-paused']?.({ status: 'paused' });
      }
      if (prev.status === 'paused' && data.status === 'live') {
        handlers['quiz-resumed']?.({
          startedAt: data.currentQuestion?.startedAt,
          timeLimitSec: data.currentQuestion?.timeLimitSec,
        });
      }
      if (prev.status !== 'ended' && data.status === 'ended') {
        handlers['quiz-ended']?.({ leaderboard: data.leaderboard || [] });
      }
      // Reset can happen from either 'paused' or 'ended' — either way, any
      // transition back INTO 'lobby' from something else is a reset. There's
      // no other path that produces this transition (a brand-new quiz is
      // already 'lobby' on its very first snapshot, which never reaches
      // this branch — see the baseline-only check above).
      if (prev.status !== 'lobby' && data.status === 'lobby') {
        handlers['quiz-reset']?.({ status: 'lobby' });
      }

      prev = data;
    },
    (err) => {
      // Most common cause: firestore.rules hasn't been deployed yet, so
      // Firestore rejects this read with permission-denied. Surface it via
      // the same connection banner the UI already shows for a dropped
      // connection — a silently console-only error here is exactly what
      // makes this failure mode so confusing (writes via /api/quiz still
      // succeed, since those use firebase-admin and bypass rules entirely,
      // so the app *looks* like it's just not updating rather than broken).
      console.error('quizFirestore: quiz doc listener error', err.code || err);
      emitConnectionState('disconnected');
    }
  );

  // 'participant-joined' is driven by the participants subcollection, not
  // the main doc, so a new joiner is caught the instant their doc is
  // written, independent of whatever else changed on the quiz doc that tick.
  const unsubParticipants = onSnapshot(
    collection(db, 'quizzes', quizId, 'participants'),
    (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type !== 'added') return;
        const id = change.doc.id;
        if (knownParticipantIds.has(id)) return;
        knownParticipantIds.add(id);
        // Skip the flood of "added" changes Firestore reports for every
        // pre-existing doc on the very first snapshot — only real joins
        // after that should ring the join sound / bump the live counter.
        if (!sawFirstParticipantsSnapshot) return;
        handlers['participant-joined']?.({
          participantId: id,
          name: change.doc.data().name,
          participantCount: snap.docs.filter(d => d.data().status !== 'left').length,
        });
      });
      sawFirstParticipantsSnapshot = true;
    },
    (err) => {
      console.error('quizFirestore: participants listener error', err.code || err);
      emitConnectionState('disconnected');
    }
  );

  return () => { unsubQuiz(); unsubParticipants(); };
}

// fn receives a connection-state string. Kept compatible with the values
// components already switch on ('connected' vs anything else). Firestore
// doesn't expose the same granular websocket states Pusher did, so this
// collapses to a two-state signal: whether the last snapshot came from the
// local cache (likely offline/reconnecting) or the live server.
export function onConnectionStateChange(fn) {
  connectionListeners.add(fn);
  fn(lastKnownConnectionState); // fire once immediately, same as quizPusher.js did
  return () => connectionListeners.delete(fn);
}

// ── What changed in the two components that use this file ─────────────────
// components/OnlineQuizHost.js and components/OnlineQuizParticipant.js each
// had exactly one line change:
//   import { subscribeToQuiz, onConnectionStateChange } from '../lib/quizPusher';
//   -> import { subscribeToQuiz, onConnectionStateChange } from '../lib/quizFirestore';
// Every handler name and payload shape they already relied on is preserved.
