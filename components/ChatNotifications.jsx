// components/ChatNotifications.jsx
//
// Background watcher for new group-chat / DM messages — mount this ONCE,
// unconditionally, near the top of the portal shell (not inside the chat
// tab), so it keeps working no matter which tab the student is looking at.
//
// It polls the same /api/student/chat-groups endpoint GroupChat.jsx uses
// (now returning each chat's lastMessage — see chat-apps-script.gs),
// compares it against what this student has already seen (see
// utils/chatLastSeen.js), and:
//   - reports a total unread-chat count via onUnreadChange(count), for a
//     sidebar badge (same pattern as the existing Notifications badge)
//   - shows a small dismissible toast the first time a new message is
//     detected, with a "View" button that calls onOpenChat(groupId) to
//     jump straight to that conversation
//
// Polls less often than GroupChat's in-chat 4s polling (this runs
// everywhere in the background; that only runs while the chat is open).
//
// USAGE (in portal.js, mounted unconditionally, e.g. right next to
// <GroupChat /> near the top of the portal wrapper — GroupChat is now a
// floating widget, not tab content, so both live at the top level):
//   const chatRef = useRef(null);
//   ...
//   <GroupChat ref={chatRef} profile={profile} t={t} classLevels={KNOWN_CLASSES} />
//   <ChatNotifications
//     profile={profile}
//     onUnreadChange={setChatUnread}
//     onOpenChat={(groupId) => chatRef.current?.open(groupId)}
//   />
// The toast's "View" button calls onOpenChat, which pops the floating chat
// widget open (or brings it out of minimize) straight to that conversation
// — no tab-switching involved anymore. Still show
// {chatUnread>0 && <span className="nb-badge">{chatUnread}</span>} next to
// the Chat nav item the same way the Notifications badge already works,
// and wire that nav item's onClick to chatRef.current?.open() as well.

import { useEffect, useRef, useState, useCallback } from 'react';
import { isUnread } from '../utils/chatLastSeen';

const POLL_MS = 20000;
const TOAST_MS = 8000;

export default function ChatNotifications({ profile, onUnreadChange, onOpenChat }) {
  const [toast, setToast] = useState(null); // { groupId, groupName, studentName, message }
  const notifiedRef = useRef(new Set()); // dedupe key: `${groupId}:${timestamp}` — one toast per new message
  const toastTimerRef = useRef(null);

  const poll = useCallback(() => {
    if (!profile?.id) return;
    fetch(`/api/student/chat-groups?studentId=${encodeURIComponent(profile.id)}`)
      .then(r => r.json())
      .then(data => {
        const groups = data.groups || [];
        let unreadCount = 0;
        let newestUnannounced = null;

        groups.forEach(g => {
          const lm = g.lastMessage;
          if (!lm || String(lm.studentId) === String(profile.id)) return; // no messages yet, or it's my own
          if (!isUnread(profile.id, g.groupId, lm.timestamp)) return;

          unreadCount += 1;
          const dedupeKey = `${g.groupId}:${lm.timestamp}`;
          if (!notifiedRef.current.has(dedupeKey)) {
            notifiedRef.current.add(dedupeKey);
            if (!newestUnannounced || new Date(lm.timestamp) > new Date(newestUnannounced.timestamp)) {
              newestUnannounced = { ...lm, groupId: g.groupId, groupName: g.groupName };
            }
          }
        });

        onUnreadChange?.(unreadCount);
        if (newestUnannounced) {
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
          setToast(newestUnannounced);
          toastTimerRef.current = setTimeout(() => setToast(null), TOAST_MS);
        }
      })
      .catch(() => {}); // background watcher — fail silently, next poll tries again
  }, [profile?.id, onUnreadChange]);

  useEffect(() => {
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  if (!toast) return null;

  return (
    <div className="cn-toast" role="status">
      <div className="cn-toast-icon"><i className="fa-solid fa-comment-dots" /></div>
      <div className="cn-toast-body">
        <div className="cn-toast-title">{toast.studentName} · {toast.groupName}</div>
        <div className="cn-toast-msg">{toast.message?.length > 80 ? toast.message.slice(0, 80) + '…' : toast.message}</div>
      </div>
      <button className="cn-toast-view" onClick={() => { onOpenChat?.(toast.groupId); setToast(null); }}>View</button>
      <button className="cn-toast-close" onClick={() => setToast(null)} aria-label="Dismiss">
        <i className="fa-solid fa-xmark" />
      </button>

      <style jsx>{`
        .cn-toast {
          position: fixed; right: 18px; bottom: 18px; z-index: 9999;
          display: flex; align-items: center; gap: 10px;
          max-width: 340px; padding: 12px 12px 12px 14px;
          background: #1B2130; color: #fff; border-radius: 14px;
          box-shadow: 0 10px 30px rgba(0,0,0,.25);
          font-family: 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif;
          animation: cn-in .25s ease-out;
        }
        @keyframes cn-in { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .cn-toast-icon {
          width: 32px; height: 32px; border-radius: 50%; background: #00C6A7;
          color: #fff; display: flex; align-items: center; justify-content: center;
          font-size: 13px; flex-shrink: 0;
        }
        .cn-toast-body { flex: 1; min-width: 0; }
        .cn-toast-title { font-size: 12.5px; font-weight: 800; margin-bottom: 2px; }
        .cn-toast-msg { font-size: 12px; color: rgba(255,255,255,.75); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cn-toast-view {
          border: none; background: #00C6A7; color: #fff; font-weight: 700;
          font-size: 11.5px; padding: 6px 10px; border-radius: 999px; cursor: pointer; flex-shrink: 0;
        }
        .cn-toast-close {
          border: none; background: none; color: rgba(255,255,255,.6); cursor: pointer;
          font-size: 11px; flex-shrink: 0;
        }
        .cn-toast-close:hover { color: #fff; }

        @media (max-width: 640px) {
          .cn-toast { left: 12px; right: 12px; max-width: none; bottom: 70px; }
        }
      `}</style>
    </div>
  );
}
