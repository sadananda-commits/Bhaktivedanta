// lib/quizPusher.js
//
// Subscribes to the `quiz-{code}` channel and wires up the event set
// documented in quiz-schema.md. Both the participant view and the host
// panel use this — they just listen for different events.
//
// Requires the `pusher-js` package: npm install pusher-js
//
// Env vars needed (public — safe to expose client-side):
//   NEXT_PUBLIC_PUSHER_KEY
//   NEXT_PUBLIC_PUSHER_CLUSTER

import Pusher from 'pusher-js';

let pusherInstance = null;

function getPusher() {
  if (!pusherInstance) {
    pusherInstance = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
    });
  }
  return pusherInstance;
}

// handlers: { 'question-started': fn, 'answer-count-updated': fn, ... }
// Returns an unsubscribe function — call it from a useEffect cleanup.
export function subscribeToQuiz(quizCode, handlers) {
  const pusher = getPusher();
  const channel = pusher.subscribe('quiz-' + quizCode);

  Object.keys(handlers).forEach(eventName => {
    channel.bind(eventName, handlers[eventName]);
  });

  return () => {
    Object.keys(handlers).forEach(eventName => {
      channel.unbind(eventName, handlers[eventName]);
    });
    pusher.unsubscribe('quiz-' + quizCode);
  };
}
