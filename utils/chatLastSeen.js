// utils/chatLastSeen.js
//
// Tracks, per student and per chat (group or DM), the timestamp of the
// newest message that student has actually had that chat open for. Used
// by ChatNotifications.jsx to decide what counts as "unread", and by
// GroupChat.jsx to mark a chat as seen while it's the open one.
//
// Plain localStorage is fine here — this runs in the real deployed app,
// not a sandboxed preview environment.

const keyFor = (studentId) => `vedanta_chat_lastseen_${studentId}`;

export function getLastSeenMap(studentId) {
  if (!studentId || typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(keyFor(studentId)) || '{}');
  } catch {
    return {};
  }
}

export function markSeen(studentId, groupId, timestampIso) {
  if (!studentId || !groupId || !timestampIso || typeof window === 'undefined') return;
  try {
    const map = getLastSeenMap(studentId);
    const prev = map[groupId];
    if (prev && new Date(prev).getTime() >= new Date(timestampIso).getTime()) return; // already up to date
    map[groupId] = timestampIso;
    window.localStorage.setItem(keyFor(studentId), JSON.stringify(map));
  } catch {
    /* storage full/unavailable — fail silently; worst case a toast re-shows */
  }
}

export function isUnread(studentId, groupId, lastMessageTimestampIso) {
  if (!lastMessageTimestampIso) return false;
  const seen = getLastSeenMap(studentId)[groupId];
  if (!seen) return true;
  return new Date(lastMessageTimestampIso).getTime() > new Date(seen).getTime();
}
