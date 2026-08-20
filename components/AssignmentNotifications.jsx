// components/AssignmentNotifications.jsx
//
// Background watcher for newly-assigned chapters ("Assignments for you") —
// mount this ONCE, unconditionally, near the top of the portal shell right
// alongside <ChatNotifications />, so it keeps working no matter which tab
// the student is looking at.
//
// It polls the same /api/student/chapter-assignments endpoint the
// "Assignments for you" tab uses, and:
//   - shows a small dismissible toast the first time a NEW (not-yet-seen)
//     assignment is detected, with a "View" button that calls
//     onOpenAssignment(assignmentId) to jump straight to it
//   - the persistent red nav badge (pendingMyAssignments count) is handled
//     directly in portal.js from the myAssignments state this component
//     doesn't own — this component is toast-only, on top of that badge
//
// Unlike chat (where "unread" is naturally defined by a per-conversation
// last-seen timestamp), an assignment doesn't have a running conversation —
// it either exists or it doesn't — so "new" here means "an AssignmentID
// this browser hasn't been notified about before," tracked in localStorage
// per student. On first mount (or first login on a new device) every
// currently-assigned chapter is marked as already-seen WITHOUT toasting,
// so a student doesn't get a flood of toasts for homework they already
// know about — only chapters assigned AFTER that point trigger a toast.
//
// USAGE (in portal.js, mounted unconditionally, next to ChatNotifications):
//   <AssignmentNotifications
//     profile={profile}
//     onOpenAssignment={(assignmentId) => { setTab('myassignments'); setActiveMyAssignmentId(assignmentId); }}
//   />
// The red nav badge itself is driven by `pendingMyAssignments` in
// portal.js (count of myAssignments where Status !== 'Completed') —
// see the {navItem.ID==='myassignments' && ...} line next to the chat one.

import { useEffect, useRef, useState, useCallback } from 'react';

const POLL_MS = 45000; // assignments change far less often than chat — no need to poll as aggressively
const TOAST_MS = 8000;

export default function AssignmentNotifications({ profile, onOpenAssignment }) {
  const [toast, setToast] = useState(null); // { AssignmentID, ChapterTitle, Subject, ModuleID, ... }
  const seenRef = useRef(null); // Set of AssignmentIDs already surfaced — null until first poll seeds it
  const toastTimerRef = useRef(null);

  const storageKey = profile?.id ? `assignmentsSeen:${profile.id}` : null;

  const poll = useCallback(() => {
    if (!profile?.id || !storageKey) return;
    fetch(`/api/student/chapter-assignments?studentId=${encodeURIComponent(profile.id)}`)
      .then(r => r.json())
      .then(data => {
        // Only chapters still outstanding are worth a toast — a chapter
        // marked Completed elsewhere (or already done before this device
        // ever saw it) shouldn't pop up as "new".
        const assignments = (data.assignments || []).filter(a => a.Status !== 'Completed');

        // First poll after mount/login: seed the "seen" set from
        // localStorage (or, if this is the very first time on this
        // device, from whatever's currently assigned) — never toast here.
        if (seenRef.current === null) {
          let stored = [];
          try { stored = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch {}
          seenRef.current = new Set(stored.length ? stored : assignments.map(a => a.AssignmentID));
          if (!stored.length) {
            try { localStorage.setItem(storageKey, JSON.stringify([...seenRef.current])); } catch {}
          }
          return;
        }

        const newOnes = assignments.filter(a => !seenRef.current.has(a.AssignmentID));
        if (newOnes.length) {
          newOnes.forEach(a => seenRef.current.add(a.AssignmentID));
          try { localStorage.setItem(storageKey, JSON.stringify([...seenRef.current])); } catch {}

          // Most recently assigned one wins if several landed between polls.
          const latest = newOnes[newOnes.length - 1];
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
          setToast(latest);
          toastTimerRef.current = setTimeout(() => setToast(null), TOAST_MS);
        }
      })
      .catch(() => {}); // background watcher — fail silently, next poll tries again
  }, [profile?.id, storageKey]);

  useEffect(() => {
    seenRef.current = null; // reset seeding whenever the logged-in student changes
    if (!profile?.id) return;
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [poll, profile?.id]);

  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  if (!toast) return null;

  return (
    <div className="an-toast" role="status">
      <div className="an-toast-icon"><i className="fa-solid fa-clipboard-list" /></div>
      <div className="an-toast-body">
        <div className="an-toast-title">New Assignment{toast.Subject ? ` · ${toast.Subject}` : ''}</div>
        <div className="an-toast-msg">
          {(toast.ChapterTitle || toast.ModuleID || 'A new chapter').length > 80
            ? (toast.ChapterTitle || toast.ModuleID).slice(0, 80) + '…'
            : (toast.ChapterTitle || toast.ModuleID)}
        </div>
      </div>
      <button className="an-toast-view" onClick={() => { onOpenAssignment?.(toast.AssignmentID); setToast(null); }}>View</button>
      <button className="an-toast-close" onClick={() => setToast(null)} aria-label="Dismiss">
        <i className="fa-solid fa-xmark" />
      </button>

      <style jsx>{`
        .an-toast {
          position: fixed; left: 18px; bottom: 18px; z-index: 9999;
          display: flex; align-items: center; gap: 10px;
          max-width: 340px; padding: 12px 12px 12px 14px;
          background: #1B2130; color: #fff; border-radius: 14px;
          box-shadow: 0 10px 30px rgba(0,0,0,.25);
          font-family: 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif;
          animation: an-in .25s ease-out;
        }
        @keyframes an-in { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .an-toast-icon {
          width: 32px; height: 32px; border-radius: 50%; background: #f97316;
          color: #fff; display: flex; align-items: center; justify-content: center;
          font-size: 13px; flex-shrink: 0;
        }
        .an-toast-body { flex: 1; min-width: 0; }
        .an-toast-title { font-size: 12.5px; font-weight: 800; margin-bottom: 2px; }
        .an-toast-msg { font-size: 12px; color: rgba(255,255,255,.75); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .an-toast-view {
          border: none; background: #f97316; color: #fff; font-weight: 700;
          font-size: 11.5px; padding: 6px 10px; border-radius: 999px; cursor: pointer; flex-shrink: 0;
        }
        .an-toast-close {
          border: none; background: none; color: rgba(255,255,255,.6); cursor: pointer;
          font-size: 11px; flex-shrink: 0;
        }
        .an-toast-close:hover { color: #fff; }

        @media (max-width: 640px) {
          .an-toast { left: 12px; right: 12px; max-width: none; bottom: 70px; }
        }
      `}</style>
    </div>
  );
}
