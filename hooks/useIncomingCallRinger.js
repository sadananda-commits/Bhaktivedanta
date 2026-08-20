// hooks/useIncomingCallRinger.js
//
// Polls for an incoming call and escalates the alert across every channel
// the browser gives us, so an idle student (tab open, but away from the
// keyboard/screen) gets pulled back. Honest limitation: this all depends on
// the tab still being open and its JS timers still running. A locked phone
// or a fully closed app will NOT ring from this — that needs real Web Push
// (a service worker + VAPID keys) or a native push service, which is a
// separate infra piece from this polling-based signaling setup. What this
// DOES reliably cover: idle-but-open tabs, backgrounded-but-open tabs (most
// browsers keep polling alive for a while, just throttled), and multiple
// devices signed in at once (every device with a fresh presence row polls
// independently and will ring).
//
// Usage:
//   const { incoming, accept, decline } = useIncomingCallRinger(profile.id);
//   // render your existing "incoming call" modal when `incoming` is set,
//   // wire its buttons to accept()/decline()

import { useEffect, useRef, useState, useCallback } from 'react';

const POLL_MS = 2000; // was 4000 — halves the worst-case delay before the callee even sees the incoming modal

// Ask for Notification permission once, e.g. right after login, so the
// browser-level popup ("Show desktop notifications when idle") is available
// by the time a call actually comes in — asking for it in the middle of an
// incoming call would be too late.
export function requestCallNotificationPermission() {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'default') Notification.requestPermission().catch(() => {});
}

// Loops a simple ringtone using the Web Audio API so no audio asset file is
// needed. Stops cleanly via the returned function.
function startRingtone() {
  if (typeof window === 'undefined' || !window.AudioContext) return () => {};
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  let stopped = false;
  let timeoutId;

  const ringOnce = () => {
    if (stopped) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.9);
    timeoutId = setTimeout(ringOnce, 1600);
  };
  ringOnce();

  return () => {
    stopped = true;
    clearTimeout(timeoutId);
    ctx.close().catch(() => {});
  };
}

export default function useIncomingCallRinger(studentId) {
  const [incoming, setIncoming] = useState(null); // { CallID, CallerName, Offer }
  const stopRingRef = useRef(() => {});
  const notificationRef = useRef(null);
  const originalTitleRef = useRef(typeof document !== 'undefined' ? document.title : '');
  const titleFlashRef = useRef(null);

  const stopAllAlerts = useCallback(() => {
    stopRingRef.current();
    stopRingRef.current = () => {};
    if (notificationRef.current) { notificationRef.current.close(); notificationRef.current = null; }
    if (titleFlashRef.current) { clearInterval(titleFlashRef.current); titleFlashRef.current = null; }
    if (typeof document !== 'undefined') document.title = originalTitleRef.current;
  }, []);

  const raiseAlert = useCallback((call) => {
    stopRingRef.current = startRingtone();

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([400, 200, 400, 200, 400]); // mobile: buzz even if the screen is dim, not locked
    }

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      notificationRef.current = new Notification(`📞 ${call.CallerName || 'Someone'} is calling`, {
        body: 'Tap to open the portal and answer',
        requireInteraction: true,
        tag: 'incoming-call',
      });
      notificationRef.current.onclick = () => {
        window.focus();
        notificationRef.current && notificationRef.current.close();
      };
    }

    let flashOn = false;
    titleFlashRef.current = setInterval(() => {
      flashOn = !flashOn;
      document.title = flashOn ? `📞 Incoming call — ${call.CallerName || ''}` : originalTitleRef.current;
    }, 1000);
  }, []);

  useEffect(() => {
    if (!studentId) return undefined;
    let cancelled = false;
    let activeCallId = null;

    const poll = async () => {
      try {
        const r = await fetch(`/api/student/call?action=incoming&studentId=${encodeURIComponent(studentId)}`);
        const data = await r.json();
        if (cancelled) return;

        if (data && data.CallID && data.Status === 'ringing') {
          if (data.CallID !== activeCallId) {
            activeCallId = data.CallID;
            setIncoming(data);
            raiseAlert(data);
          }
        } else if (activeCallId) {
          // The ringing row is gone (answered elsewhere, declined, or the
          // caller hung up/timed out) — clear our own alert state.
          activeCallId = null;
          setIncoming(null);
          stopAllAlerts();
        }
      } catch {
        // fail soft — next poll retries; a missed poll doesn't drop the call,
        // the ringing row is still sitting server-side either way
      }
    };

    poll();
    const intervalId = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(intervalId); };
  }, [studentId, raiseAlert, stopAllAlerts]);

  const accept = useCallback(async (answer) => {
    if (!incoming) return;
    stopAllAlerts();
    await fetch('/api/student/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'answer', callId: incoming.CallID, answer }),
    });
    setIncoming(null);
  }, [incoming, stopAllAlerts]);

  const decline = useCallback(async () => {
    if (!incoming) return;
    stopAllAlerts();
    await fetch('/api/student/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'decline', callId: incoming.CallID }),
    });
    setIncoming(null);
  }, [incoming, stopAllAlerts]);

  useEffect(() => stopAllAlerts, [stopAllAlerts]); // cleanup on unmount

  return { incoming, accept, decline };
}
