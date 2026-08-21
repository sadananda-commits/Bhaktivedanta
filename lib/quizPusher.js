// lib/quizPusher.js
//
// Subscribes to the `quiz-{code}` channel and wires up the event set
// documented in quiz-schema.md. Both the participant view and the host
// panel use this — they just listen for different events.
//
// Also exposes connection-state monitoring: on flaky school wifi, Pusher's
// underlying websocket can drop without any error being thrown — the app
// just silently stops receiving events. onConnectionStateChange lets a
// component notice "we've been disconnected" and fall back to polling
// getQuizState until we're back.
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

// fn receives the raw Pusher connection state string:
// 'connecting' | 'connected' | 'unavailable' | 'failed' | 'disconnected'
// Returns an unsubscribe function.
export function onConnectionStateChange(fn) {
  const pusher = getPusher();
  const handler = (states) => fn(states.current);
  pusher.connection.bind('state_change', handler);
  fn(pusher.connection.state); // fire once immediately with current state
  return () => pusher.connection.unbind('state_change', handler);
}
