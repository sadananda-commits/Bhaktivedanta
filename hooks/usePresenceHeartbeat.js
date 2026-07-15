// hooks/usePresenceHeartbeat.js
//
// Drop-in hook that keeps a student's presence row alive while the portal
// tab is open, and reports whether they're actively using it or just idle
// (tab open, no recent interaction). Pair with useIncomingCallRinger.js —
// this is what makes idle students still ring-able, and signed-out students
// not.
//
// Usage (e.g. in Portal.jsx once `authed` and `profile.id` are set):
//
//   usePresenceHeartbeat(authed ? profile.id : null, profile.name);
//
// Call signOutBeacon(profile.id) from handleLogout, BEFORE clearing
// profile/authed state, so the deliberate sign-out is distinguishable from
// "tab still open but idle" or "network hiccup, heartbeat briefly missed".

import { useEffect, useRef } from 'react';

const HEARTBEAT_MS = 25000;
const IDLE_AFTER_MS = 2 * 60 * 1000; // 2 minutes of no interaction → 'idle'
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];

// Stable per-browser id, persisted so refreshing the tab doesn't look like
// a new device. Deliberately NOT tied to studentId — a shared classroom
// computer would otherwise "merge" different students' presence rows.
export function getDeviceId() {
  if (typeof window === 'undefined') return 'server';
  try {
    let id = localStorage.getItem('vedanta_device_id');
    if (!id) {
      id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('vedanta_device_id', id);
    }
    return id;
  } catch {
    return 'dev_unknown';
  }
}

function detectDeviceType() {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';
  if (/tablet|ipad/i.test(ua)) return 'tablet';
  if (/mobi|android.*mobile|iphone/i.test(ua)) return 'mobile';
  return 'computer';
}

// Fires a best-effort beacon telling the server this device is signing out
// right now, so its presence row disappears immediately instead of waiting
// out the ~60s heartbeat timeout. Safe to call during page unload.
export function signOutBeacon(studentId) {
  if (!studentId || typeof navigator === 'undefined') return;
  const body = JSON.stringify({ action: 'signOut', studentId, deviceId: getDeviceId() });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/student/presence', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/student/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
    }
  } catch (err) {
    // best-effort only — worst case the row just expires normally
    console.error('[presence] signOutBeacon failed:', err);
  }
}

export default function usePresenceHeartbeat(studentId, studentName) {
  const statusRef = useRef('active');
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    if (!studentId) return undefined;

    const markActive = () => { lastActivityRef.current = Date.now(); };
    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, markActive, { passive: true }));
    document.addEventListener('visibilitychange', markActive);

    const sendHeartbeat = () => {
      const idleFor = Date.now() - lastActivityRef.current;
      // A hidden tab is always at least idle, even if the idle timer hasn't
      // elapsed yet — no point calling someone "active" on a backgrounded tab.
      const isActive = !document.hidden && idleFor < IDLE_AFTER_MS;
      statusRef.current = isActive ? 'active' : 'idle';

      fetch('/api/student/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          studentName,
          deviceId: getDeviceId(),
          deviceType: detectDeviceType(),
          status: statusRef.current,
        }),
        keepalive: true,
      }).catch(() => {}); // fail soft — next heartbeat retries in ~25s
    };

    sendHeartbeat(); // send one immediately on mount, don't wait for the first interval
    const intervalId = setInterval(sendHeartbeat, HEARTBEAT_MS);

    return () => {
      clearInterval(intervalId);
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, markActive));
      document.removeEventListener('visibilitychange', markActive);
    };
  }, [studentId, studentName]);
}
