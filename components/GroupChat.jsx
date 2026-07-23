// components/GroupChat.jsx
//
// Small-group + 1:1 chat for students, scoped to teacher/parent-assigned
// groups (see "Chat Groups" tab / chat-apps-script.gs) plus self-serve
// 1:1 chats between classmates. Every message is fully visible to
// teachers/parents (they can read the "Chat Messages" sheet tab directly)
// — there's no private-messaging mode here by design, group or DM.
//
// Polling-based (no websockets needed): once a chat is open, this fetches
// new messages every POLL_MS milliseconds, using `since` (the timestamp of
// the last message it has) so each poll only pulls what's new.
//
// ── Floating widget, not a tab ────────────────────────────────────────────
// This renders as a floating chat window (bottom-right corner), the same
// way most messenger widgets work. Mount it ONCE, unconditionally, near the
// top of the portal shell — same spot as <ChatNotifications /> — NOT inside
// whatever tab used to hold "Chat". That way opening a chat, then switching
// to the Quiz tab (or any other tab) to keep working, leaves the chat
// exactly where it was: still open, still polling, until the student
// explicitly hits the minimize or close button. Nothing here ever closes
// itself automatically.
//
// It has three visual states:
//   - closed:    just a small round launcher button in the corner
//   - open:      the full chat panel (picker / messages / input)
//   - minimized: a slim title bar only — chat keeps polling in the
//                background, just tucked out of the way
//
// USAGE (in portal.js, mounted unconditionally, e.g. right next to
// <ChatNotifications />):
//   const chatRef = useRef(null);
//   ...
//   <GroupChat ref={chatRef} profile={profile} t={t} classLevels={KNOWN_CLASSES} />
//   <ChatNotifications
//     profile={profile}
//     onUnreadChange={setChatUnread}
//     onOpenChat={(groupId) => chatRef.current?.open(groupId)}
//   />
//   ...and wire the "Chat" nav item to `onClick={() => chatRef.current?.open()}`
//   instead of switching tabs.
//
// `profile` needs at least { id, name, classLevel }. `classLevels`, if
// provided (an array of class-name strings, e.g. KNOWN_CLASSES from
// portal.js), lets a student start a chat with anyone in ANY of those
// classes, not just their own — the picker fetches every class in the list
// and merges the results into one searchable roster, tagging each name with
// its class. Without `classLevels`, it falls back to just profile.classLevel
// (old behaviour).
//
// The ref exposes an imperative API so anything outside (nav bar, a
// notification toast, a "message this student" button elsewhere in the
// portal) can pop the widget open without re-rendering it into existence:
//   chatRef.current.open()          -> opens the widget on whatever chat was last active
//   chatRef.current.open(groupId)   -> opens the widget AND jumps to that chat
//   chatRef.current.close()         -> hides it back to the launcher button
// `focusGroupId` is still supported as a simpler, prop-driven alternative
// to calling the ref (used the same way it always was), and also opens the
// widget if it was closed or minimized.

import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { markSeen } from '../utils/chatLastSeen';
import { usePresence } from '../lib/PresenceContext';

const POLL_MS = 4000;
const MAX_LEN = 300;
const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

// Renders message text with any URLs turned into safe, new-tab links.
// Plain text is escaped implicitly by React (we build an array of strings
// and <a> elements, never dangerouslySetInnerHTML) — this only changes what
// gets clicked, not what gets trusted; the server already decided whether
// the link was allowed before the message was ever saved.
function renderMessageText(text) {
  return text.split(URL_PATTERN).map((part, i) => {
    if (i % 2 === 1) {
      const href = part.startsWith('http') ? part : `https://${part}`;
      return (
        <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="gc-link">
          <i className="fa-solid fa-arrow-up-right-from-square" style={{ fontSize: '10px', marginRight: '3px' }} />
          {part}
        </a>
      );
    }
    return part;
  });
}

const GroupChat = forwardRef(function GroupChat({ profile, t, focusGroupId, classLevels, onStartCall }, ref) {
  const tr = t || (s => s);

  // ── Presence context (WebSocket-based) ────────────────────────────────────
  let presenceContext;
  try {
    presenceContext = usePresence();
  } catch {
    // PresenceProvider not available, will fall back to polling
    presenceContext = { onlineUsers: [], isUserOnline: () => false };
  }

  // ── Floating widget state: 'closed' | 'open' | 'minimized' ───────────────
  // Lives independently of which portal tab is active — this is the whole
  // point of it being a widget instead of tab content. Nothing sets this
  // back to 'closed' except the student clicking the close button (or
  // calling chatRef.current.close()).
  const [widgetState, setWidgetState] = useState('closed');

  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsError, setGroupsError] = useState('');
  const [activeGroupId, setActiveGroupId] = useState(null);

  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [input, setInput] = useState('');
  const [sendError, setSendError] = useState('');
  const [sending, setSending] = useState(false);
  const [reportedIds, setReportedIds] = useState(new Set());

  // ── 1:1 chat picker — searches across every class in `classLevels` ───────
  // Class and name are two SEPARATE filters (not one combined search box)
  // so a student can narrow "Class 4B" down to a short list first, then
  // find the name — much easier to scan than one long alphabetical roster.
  //
  // pickerMode toggles the same picker UI between two jobs: 'dm' (tap a
  // name, start chatting immediately — old behaviour) and 'group' (check
  // off several names, name the group, then Create). Same roster fetch,
  // same filters, just a different footer action.
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState('dm'); // 'dm' | 'group'
  const [classmates, setClassmates] = useState([]); // merged roster across all classes, each tagged with .classLevel
  const [classmatesLoading, setClassmatesLoading] = useState(false);
  const [classmatesError, setClassmatesError] = useState('');
  const [classFilter, setClassFilter] = useState(''); // '' = all classes
  const [classmateFilter, setClassmateFilter] = useState(''); // name search text
  const [startingDmFor, setStartingDmFor] = useState(null);
  const [dmError, setDmError] = useState('');

  const MAX_GROUP_MEMBERS = 10; // including the creator — mirrors the backend cap
  const [selectedMemberIds, setSelectedMemberIds] = useState(new Set()); // group mode only
  const [groupNameInput, setGroupNameInput] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupError, setGroupError] = useState('');

  // ── Presence — "who's online right now"
  // First tries WebSocket-based presence from context (real-time, no polling)
  // Falls back to API polling if context unavailable ────────────────────────
  const [onlineIds, setOnlineIds] = useState(new Set());

  // Update from context whenever it changes
  useEffect(() => {
    if (presenceContext?.onlineUsers?.length > 0) {
      const ids = new Set(presenceContext.onlineUsers.map(u => String(u.id)));
      setOnlineIds(ids);
      console.log('[GroupChat] Updated online users from context:', ids.size);
    }
  }, [presenceContext?.onlineUsers]);

  // Fallback to polling if context isn't available
  useEffect(() => {
    if (!profile?.id || widgetState === 'closed') return;

    // Only poll if we're NOT getting data from context
    if (presenceContext?.onlineUsers?.length > 0) return;

    const poll = () => fetch('/api/student/presence?action=online')
      .then(r => r.json())
      .then(data => setOnlineIds(new Set((data.online || []).map(String))))
      .catch(() => {});
    poll();
    const id = setInterval(poll, 15000);
    return () => clearInterval(id);
  }, [profile?.id, widgetState, presenceContext?.onlineUsers?.length]);

  // The full list of classes to draw students from. Falls back to just the
  // student's own class if the caller doesn't pass classLevels in.
  const classLevelOptions = useMemo(() => {
    if (classLevels?.length) return classLevels;
    return profile?.classLevel ? [profile.classLevel] : [];
  }, [classLevels, profile?.classLevel]);

  const lastTimestampRef = useRef(null);
  const pollRef = useRef(null);
  const scrollRef = useRef(null);

  // ── Load this student's groups on mount ──────────────────────────────────
  useEffect(() => {
    if (!profile?.id) return;
    setGroupsLoading(true);
    setGroupsError('');
    fetch(`/api/student/chat-groups?studentId=${encodeURIComponent(profile.id)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setGroupsError(data.error); setGroups([]); return; }
        const gs = data.groups || [];
        setGroups(gs);
        if (gs.length && !activeGroupId) setActiveGroupId(gs[0].groupId);
      })
      .catch(() => setGroupsError('Could not load your chats — try refreshing'))
      .finally(() => setGroupsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  // ── Jump to a specific chat when told to from outside (e.g. a
  // ChatNotifications toast's "View" button) ───────────────────────────────
  useEffect(() => {
    if (focusGroupId) {
      setActiveGroupId(focusGroupId);
      setWidgetState('open');
    }
  }, [focusGroupId]);

  // ── Fetch messages: full history on group switch, incremental after ──────
  const fetchMessages = useCallback((groupId, since) => {
    const url = `/api/student/chat-messages?groupId=${encodeURIComponent(groupId)}${since ? `&since=${encodeURIComponent(since)}` : ''}`;
    return fetch(url).then(r => r.json()).then(data => data.messages || []);
  }, []);

  useEffect(() => {
    if (!activeGroupId) return;
    setMessages([]);
    lastTimestampRef.current = null;
    setMessagesLoading(true);

    fetchMessages(activeGroupId, null).then(msgs => {
      setMessages(msgs);
      if (msgs.length) {
        lastTimestampRef.current = msgs[msgs.length - 1].timestamp;
        markSeen(profile?.id, activeGroupId, lastTimestampRef.current);
      }
      setMessagesLoading(false);
    });

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      fetchMessages(activeGroupId, lastTimestampRef.current).then(newMsgs => {
        if (!newMsgs.length) return;
        setMessages(prev => {
          const seen = new Set(prev.map(m => m.messageId));
          const merged = [...prev, ...newMsgs.filter(m => !seen.has(m.messageId))];
          return merged;
        });
        lastTimestampRef.current = newMsgs[newMsgs.length - 1].timestamp;
        markSeen(profile?.id, activeGroupId, lastTimestampRef.current);
      });
    }, POLL_MS);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeGroupId, fetchMessages]);

  // ── Auto-scroll to newest message ─────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const activeGroup = groups.find(g => g.groupId === activeGroupId);

  // For a 1:1 DM, figure out who the "other" student is so the header can
  // show their online status and a Call button — Group chats (3+ people)
  // don't get a Call button, calling is 1:1 only.
  const otherMember = activeGroup?.type === 'DM'
    ? { id: (activeGroup.memberIds || []).find(id => String(id) !== String(profile.id)), name: activeGroup.groupName }
    : null;
  const otherIsOnline = !!(otherMember && otherMember.id && onlineIds.has(String(otherMember.id)));

  const send = () => {
    const trimmed = input.trim();
    setSendError('');
    if (!trimmed) return;
    if (trimmed.length > MAX_LEN) { setSendError(`Keep it under ${MAX_LEN} characters`); return; }

    setSending(true);
    fetch('/api/student/chat-messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId: activeGroupId, studentId: profile.id, studentName: profile.name, message: trimmed }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) { setSendError(data.error); return; }
        setInput('');
        const mine = { messageId: data.messageId, groupId: activeGroupId, studentId: profile.id, studentName: profile.name, message: trimmed, timestamp: data.timestamp, flagged: false, hasLink: data.hasLink };
        setMessages(prev => [...prev, mine]);
        lastTimestampRef.current = data.timestamp;
        markSeen(profile?.id, activeGroupId, data.timestamp);
      })
      .catch(() => setSendError('Could not send — try again'))
      .finally(() => setSending(false));
  };

  const openPicker = (mode = 'dm') => {
    setPickerMode(mode);
    setShowPicker(prev => (prev && pickerMode === mode) ? false : true);
    setDmError('');
    setGroupError('');
    setClassmateFilter('');
    setClassFilter('');
    setSelectedMemberIds(new Set());
    setGroupNameInput('');
    if (classmates.length || !classLevelOptions.length) return; // already loaded, or nothing to look up

    setClassmatesLoading(true);
    setClassmatesError('');
    Promise.all(
      classLevelOptions.map(cl =>
        fetch(`/api/student/chat-dm?classLevel=${encodeURIComponent(cl)}&excludeStudentId=${encodeURIComponent(profile.id)}`)
          .then(r => r.json())
          .then(data => (data.classmates || []).map(c => ({ ...c, classLevel: cl })))
          .catch(() => []) // one class failing to load shouldn't block the rest
      )
    )
      .then(lists => {
        const merged = lists.flat().sort((a, b) => a.studentName.localeCompare(b.studentName));
        if (!merged.length) setClassmatesError('Could not load students — try again');
        setClassmates(merged);
      })
      .finally(() => setClassmatesLoading(false));
  };

  const toggleMember = (studentId) => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else if (next.size + 1 < MAX_GROUP_MEMBERS) { // +1 accounts for the creator
        next.add(studentId);
      }
      return next;
    });
  };

  const createGroupChat = () => {
    if (selectedMemberIds.size === 0) return;
    setCreatingGroup(true);
    setGroupError('');
    fetch('/api/student/chat-dm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'createGroup',
        studentId: profile.id,
        studentName: profile.name,
        groupName: groupNameInput.trim(),
        memberIds: Array.from(selectedMemberIds),
        classLevel: profile.classLevel,
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error || !data.groupId) {
          setGroupError(data.error || 'Could not create the group — try again');
          return;
        }
        setGroups(prev => [...prev, { groupId: data.groupId, groupName: data.groupName, type: 'Group', memberIds: [profile.id, ...Array.from(selectedMemberIds)] }]);
        setActiveGroupId(data.groupId);
        setShowPicker(false);
        setWidgetState('open');
      })
      .catch(() => setGroupError('Could not create the group — try again'))
      .finally(() => setCreatingGroup(false));
  };

  const startDm = useCallback((otherStudentId, otherStudentName) => {
    setStartingDmFor(otherStudentId);
    setDmError('');
    fetch('/api/student/chat-dm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: profile.id,
        studentName: profile.name,
        otherStudentId,
        otherStudentName,
        classLevel: profile.classLevel,
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error || !data.groupId) {
          setDmError(data.error || 'Could not start that chat — try again');
          return;
        }
        setGroups(prev => prev.some(g => g.groupId === data.groupId)
          ? prev
          : [...prev, { groupId: data.groupId, groupName: data.groupName || otherStudentName, type: 'DM' }]);
        setActiveGroupId(data.groupId);
        setShowPicker(false);
        setWidgetState('open'); // in case this was called from outside while closed/minimized (e.g. the online-students list)
      })
      .catch(() => setDmError('Could not start that chat — try again'))
      .finally(() => setStartingDmFor(null));
  }, [profile.id, profile.name, profile.classLevel]);

  // ── Imperative API for anything outside this component (nav bar, a
  // notification toast, etc.) to pop the widget open/closed without going
  // through props. This is the preferred integration point — see header.
  // Placed after startDm's definition (not right after focusGroupId's
  // effect, where it was originally) since startDmWith references it —
  // a const used inside a callback here still needs to exist by render
  // time, even though the callback itself only runs later. ──────────────
  useImperativeHandle(ref, () => ({
    open: (groupId) => {
      if (groupId) setActiveGroupId(groupId);
      setWidgetState('open');
    },
    close: () => setWidgetState('closed'),
    minimize: () => setWidgetState('minimized'),
    // Lets anything outside (e.g. the online-students list) start or jump
    // straight to a 1:1 chat with a specific student, without going through
    // the picker UI — reuses the exact same find-or-create logic.
    startDmWith: (otherId, otherName) => startDm(otherId, otherName),
  }), [startDm]);

  const report = (messageId) => {
    if (reportedIds.has(messageId)) return;
    fetch('/api/student/chat-messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reportMessage', messageId }),
    }).then(() => setReportedIds(prev => new Set(prev).add(messageId)));
  };

  const fmtTime = (iso) => {
    try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  };

  const hasGroups = groups.length > 0;
  const canStartDm = classLevelOptions.length > 0;
  const multiClass = classLevelOptions.length > 1;

  // ── The "start a chat" picker — shared markup used in both the empty
  // state (no groups yet) and the normal header, so it's always styled
  // consistently by the single <style jsx> block below. Class and name
  // filters are independent (both must match, when set). ──────────────────
  const filteredClassmates = classmates.filter(c => {
    if (classFilter && c.classLevel !== classFilter) return false;
    if (!classmateFilter.trim()) return true;
    return c.studentName.toLowerCase().includes(classmateFilter.trim().toLowerCase());
  });

  const picker = showPicker && (
    <div className="gc-picker">
      <div className="gc-picker-head">
        <div className="gc-picker-tabs">
          <button
            className={`gc-picker-tab${pickerMode === 'dm' ? ' active' : ''}`}
            onClick={() => openPicker('dm')}
          >
            1:1 chat
          </button>
          <button
            className={`gc-picker-tab${pickerMode === 'group' ? ' active' : ''}`}
            onClick={() => openPicker('group')}
          >
            New group
          </button>
        </div>
        <button className="gc-picker-close" onClick={() => setShowPicker(false)} aria-label="Close">
          <i className="fa-solid fa-xmark" />
        </button>
      </div>
      {multiClass && <div className="gc-picker-hint">Pick a class, then find their name</div>}

      {pickerMode === 'group' && (
        <input
          className="gc-picker-groupname"
          type="text"
          value={groupNameInput}
          onChange={e => setGroupNameInput(e.target.value)}
          placeholder="Name this group (optional)"
          maxLength={60}
        />
      )}

      {!classmatesLoading && !classmatesError && classmates.length > 0 && (
        <div className="gc-picker-filters">
          {multiClass && (
            <select
              className="gc-picker-class-select"
              value={classFilter}
              onChange={e => setClassFilter(e.target.value)}
              aria-label="Filter by class"
            >
              <option value="">All classes</option>
              {classLevelOptions.map(cl => <option key={cl} value={cl}>{cl}</option>)}
            </select>
          )}
          <div className="gc-picker-search">
            <i className="fa-solid fa-magnifying-glass" />
            <input
              type="text"
              value={classmateFilter}
              onChange={e => setClassmateFilter(e.target.value)}
              placeholder="Search by name…"
              autoFocus={!multiClass && pickerMode === 'dm'}
            />
            {classmateFilter && (
              <button className="gc-picker-search-clear" onClick={() => setClassmateFilter('')} aria-label="Clear search">
                <i className="fa-solid fa-xmark" />
              </button>
            )}
          </div>
        </div>
      )}

      {classmatesError ? (
        <div className="gc-empty-inner">{classmatesError}</div>
      ) : classmatesLoading ? (
        <div className="gc-empty-inner">Loading students…</div>
      ) : !classmates.length ? (
        <div className="gc-empty-inner">No other students found yet.</div>
      ) : !filteredClassmates.length ? (
        <div className="gc-empty-inner">
          {classFilter && classmateFilter
            ? <>No one named "{classmateFilter}" in {classFilter}</>
            : classFilter
            ? <>No one found in {classFilter}</>
            : <>No one matches "{classmateFilter}"</>}
        </div>
      ) : (
        <>
          {(classFilter || classmateFilter || pickerMode === 'group') && (
            <div className="gc-picker-count">
              {pickerMode === 'group'
                ? `${selectedMemberIds.size} of ${MAX_GROUP_MEMBERS - 1} selected`
                : `${filteredClassmates.length} student${filteredClassmates.length === 1 ? '' : 's'}`}
            </div>
          )}
          <div className="gc-picker-list">
            {filteredClassmates.map(c => pickerMode === 'group' ? (
              <label key={c.studentId} className="gc-picker-item gc-picker-item-check">
                <input
                  type="checkbox"
                  checked={selectedMemberIds.has(c.studentId)}
                  onChange={() => toggleMember(c.studentId)}
                  disabled={!selectedMemberIds.has(c.studentId) && selectedMemberIds.size + 1 >= MAX_GROUP_MEMBERS}
                />
                <span className="gc-picker-avatar"><i className="fa-solid fa-user" /></span>
                <span
                  className={`gc-status-dot${onlineIds.has(String(c.studentId)) ? ' online' : ''}`}
                  title={onlineIds.has(String(c.studentId)) ? 'Online now' : 'Offline'}
                />
                <span className="gc-picker-name">{c.studentName}</span>
                {c.classLevel && multiClass && !classFilter && <span className="gc-picker-class-badge">{c.classLevel}</span>}
              </label>
            ) : (
              <button
                key={c.studentId}
                className="gc-picker-item"
                onClick={() => startDm(c.studentId, c.studentName)}
                disabled={startingDmFor === c.studentId}
              >
                <span className="gc-picker-avatar"><i className="fa-solid fa-user" /></span>
                <span
                  className={`gc-status-dot${onlineIds.has(String(c.studentId)) ? ' online' : ''}`}
                  title={onlineIds.has(String(c.studentId)) ? 'Online now' : 'Offline'}
                />
                <span className="gc-picker-name">{c.studentName}</span>
                {c.classLevel && multiClass && !classFilter && <span className="gc-picker-class-badge">{c.classLevel}</span>}
                {startingDmFor === c.studentId
                  ? <i className="fa-solid fa-spinner fa-spin gc-picker-chevron" />
                  : <i className="fa-solid fa-chevron-right gc-picker-chevron" />}
              </button>
            ))}
          </div>
        </>
      )}
      {pickerMode === 'group' && classmates.length > 0 && (
        <div className="gc-picker-groupfooter">
          <button
            className="gc-create-group-btn"
            onClick={createGroupChat}
            disabled={selectedMemberIds.size === 0 || creatingGroup}
          >
            {creatingGroup
              ? <><i className="fa-solid fa-spinner fa-spin" /> Creating…</>
              : <><i className="fa-solid fa-people-group" /> Create group{selectedMemberIds.size ? ` (${selectedMemberIds.size + 1})` : ''}</>}
          </button>
        </div>
      )}
      {dmError && <div className="gc-error" style={{ margin: '0 10px 10px' }}><i className="fa-solid fa-circle-exclamation" /> {dmError}</div>}
      {groupError && <div className="gc-error" style={{ margin: '0 10px 10px' }}><i className="fa-solid fa-circle-exclamation" /> {groupError}</div>}
    </div>
  );

  // ── Closed: just the round launcher button in the corner ─────────────────
  if (widgetState === 'closed') {
    return (
      <button className="gcw-launcher" onClick={() => setWidgetState('open')} aria-label="Open chat">
        <i className="fa-solid fa-comment-dots" />
        <style jsx>{`
          .gcw-launcher {
            position: fixed; right: 20px; bottom: 20px; z-index: 9997;
            width: 56px; height: 56px; border-radius: 50%; border: none;
            background: #00C6A7; color: #fff; font-size: 21px; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 10px 26px rgba(0,0,0,.22);
            transition: transform .12s;
          }
          .gcw-launcher:hover { transform: scale(1.06); }
          @media (max-width: 640px) { .gcw-launcher { right: 14px; bottom: 14px; } }
        `}</style>
      </button>
    );
  }

  // ── Minimized: a slim title bar only — polling keeps running underneath,
  // it's just tucked out of the way while the student works on something
  // else. Clicking it (or the expand icon) reopens the full panel. ────────
  if (widgetState === 'minimized') {
    return (
      <div className="gcw-bar" onClick={() => setWidgetState('open')} role="button" tabIndex={0}>
        <i className="fa-solid fa-comment-dots" />
        <span className="gcw-bar-title">{hasGroups ? (activeGroup?.groupName || 'Chat') : 'Chat'}</span>
        <button className="gcw-bar-btn" onClick={e => { e.stopPropagation(); setWidgetState('open'); }} aria-label="Expand chat">
          <i className="fa-solid fa-chevron-up" />
        </button>
        <button className="gcw-bar-btn" onClick={e => { e.stopPropagation(); setWidgetState('closed'); }} aria-label="Close chat">
          <i className="fa-solid fa-xmark" />
        </button>
        <style jsx>{`
          .gcw-bar {
            position: fixed; right: 20px; bottom: 20px; z-index: 9997;
            display: flex; align-items: center; gap: 10px;
            width: 230px; max-width: calc(100vw - 24px);
            padding: 12px 10px 12px 16px; border-radius: 14px;
            background: #1B2130; color: #fff; cursor: pointer;
            font-family: 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif;
            box-shadow: 0 10px 26px rgba(0,0,0,.22);
          }
          .gcw-bar i.fa-comment-dots { color: #00C6A7; font-size: 15px; flex-shrink: 0; }
          .gcw-bar-title { flex: 1; min-width: 0; font-size: 13px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .gcw-bar-btn {
            border: none; background: none; color: rgba(255,255,255,.7); cursor: pointer;
            font-size: 12px; width: 22px; height: 22px; flex-shrink: 0;
            display: flex; align-items: center; justify-content: center;
          }
          .gcw-bar-btn:hover { color: #fff; }
          @media (max-width: 640px) { .gcw-bar { right: 12px; bottom: 12px; } }
        `}</style>
      </div>
    );
  }

  // ── Open: the full floating panel ─────────────────────────────────────────
  if (groupsLoading) {
    return (
      <div className="gcw-dock">
        <div className="gc-card gc-empty">Loading your groups…</div>
        <style jsx>{`.gcw-dock { position: fixed; right: 20px; bottom: 20px; z-index: 9997; }`}</style>
      </div>
    );
  }

  return (
    <div className="gcw-dock">
    <div className="gc-card">
      <div className="gc-header">
        <div className="gc-title">
          <i className={activeGroup?.type === 'DM' ? 'fa-solid fa-user' : 'fa-solid fa-comments'} />
          {hasGroups ? (
            groups.length > 1 ? (
              <select value={activeGroupId || ''} onChange={e => setActiveGroupId(e.target.value)} className="gc-group-select">
                {groups.map(g => <option key={g.groupId} value={g.groupId}>{g.type === 'DM' ? '👤 ' : ''}{g.groupName}</option>)}
              </select>
            ) : (
              <span>{activeGroup?.groupName}</span>
            )
          ) : (
            <span>Chat</span>
          )}
          {otherMember && (
            <>
              <span
                className={`gc-status-dot${otherIsOnline ? ' online' : ''}`}
                title={otherIsOnline ? 'Online now' : 'Offline'}
              />
              <button
                className="gc-call-btn"
                onClick={() => otherIsOnline && otherMember.id && onStartCall?.(otherMember.id, otherMember.name, 'audio')}
                disabled={!otherIsOnline}
                title={otherIsOnline ? `Call ${otherMember.name}` : `${otherMember.name} is offline`}
                aria-label="Audio Call"
              >
                <i className="fa-solid fa-phone" />
              </button>
              <button
                className="gc-call-btn"
                onClick={() => otherIsOnline && otherMember.id && onStartCall?.(otherMember.id, otherMember.name, 'video')}
                disabled={!otherIsOnline}
                title={otherIsOnline ? `Video call ${otherMember.name}` : `${otherMember.name} is offline`}
                aria-label="Video Call"
              >
                <i className="fa-solid fa-video" />
              </button>
            </>
          )}
          {canStartDm && (
            <>
              <button className={`gc-newchat-btn${showPicker && pickerMode === 'dm' ? ' active' : ''}`} onClick={() => openPicker('dm')} aria-label="Start a new chat">
                <i className="fa-solid fa-user-plus" />
                <span className="gc-newchat-label">New chat</span>
              </button>
              <button className={`gc-newchat-btn${showPicker && pickerMode === 'group' ? ' active' : ''}`} onClick={() => openPicker('group')} aria-label="Start a new group">
                <i className="fa-solid fa-people-group" />
                <span className="gc-newchat-label">New group</span>
              </button>
            </>
          )}
          <div className="gc-window-controls">
            <button className="gc-window-btn" onClick={() => setWidgetState('minimized')} aria-label="Minimize chat">
              <i className="fa-solid fa-minus" />
            </button>
            <button className="gc-window-btn" onClick={() => setWidgetState('closed')} aria-label="Close chat">
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        </div>
        <div className="gc-subtitle">Cheer each other on — your teacher can see this chat too 🎉 — keep working, this stays open</div>
      </div>

      {picker}

      {!hasGroups ? (
        <div className="gc-empty-inner" style={{ padding: '28px 20px' }}>
          <i className="fa-solid fa-people-group" style={{ fontSize: '22px', marginBottom: '8px', display: 'block' }} />
          {groupsError ? (
            <>Couldn't load your chats: {groupsError}</>
          ) : (
            <>
              <div>You don't have any chats yet.</div>
              {canStartDm ? (
                <>
                  <button className="gc-empty-cta" onClick={() => openPicker('dm')}>
                    <i className="fa-solid fa-user-plus" /> Start your first chat
                  </button>
                  <button className="gc-empty-cta" style={{ marginLeft: 8 }} onClick={() => openPicker('group')}>
                    <i className="fa-solid fa-people-group" /> Start a group
                  </button>
                </>
              ) : (
                <div style={{ marginTop: 4 }}>Ask your teacher to add you to a chat group.</div>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <div className="gc-messages" ref={scrollRef}>
            {messagesLoading ? (
              <div className="gc-empty-inner">Loading messages…</div>
            ) : messages.length === 0 ? (
              <div className="gc-empty-inner">No messages yet — say hi and get the chat started!</div>
            ) : (
              messages.map(m => {
                const isMine = m.studentId === profile.id;
                return (
                  <div key={m.messageId} className={`gc-msg ${isMine ? 'mine' : ''}`}>
                    {!isMine && <div className="gc-msg-author">{m.studentName}</div>}
                    <div className="gc-msg-bubble">
                      {renderMessageText(m.message)}
                      <span className="gc-msg-time">{fmtTime(m.timestamp)}</span>
                    </div>
                    {!isMine && (
                      <button
                        className="gc-report-btn"
                        onClick={() => report(m.messageId)}
                        disabled={reportedIds.has(m.messageId)}
                        aria-label="Report this message"
                      >
                        {reportedIds.has(m.messageId) ? 'Reported' : 'Report'}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {sendError && <div className="gc-error"><i className="fa-solid fa-circle-exclamation" /> {sendError}</div>}

          <div className="gc-input-row">
            <input
              className="gc-input"
              value={input}
              maxLength={MAX_LEN}
              placeholder="Write something encouraging, or share a link…"
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !sending) send(); }}
            />
            <button className="gc-send-btn" onClick={send} disabled={sending || !input.trim()}>
              <i className="fa-solid fa-paper-plane" />
            </button>
          </div>
        </>
      )}

      <style jsx>{`
        .gc-card {
          --brand: #00C6A7;
          --ink: #1B2130;
          --ink-muted: #6B7280;
          --paper: #FDFBF8;
          --border: #E7E2D9;
          --bubble-mine: #E8FBF6;
          --bubble-other: #F4F1EB;

          font-family: 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif;
          width: 380px;
          max-width: calc(100vw - 24px);
          display: flex;
          flex-direction: column;
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 34px rgba(28,33,48,0.22);
        }

        .gcw-dock {
          position: fixed;
          right: 20px;
          bottom: 20px;
          z-index: 9997;
        }
        @media (max-width: 640px) {
          .gcw-dock { right: 12px; bottom: 0; left: 12px; }
          .gc-card { width: auto; max-width: none; }
        }

        .gc-newchat-label { }
        @media (max-width: 420px) { .gc-newchat-label { display: none; } }
        .gc-empty {
          padding: 28px 20px;
          text-align: center;
          color: var(--ink-muted, #6B7280);
          font-size: 14px;
        }
        .gc-header {
          padding: 14px 18px;
          border-bottom: 1px solid var(--border);
        }
        .gc-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 800;
          font-size: 15.5px;
          color: var(--ink);
        }
        .gc-group-select {
          border: none;
          background: transparent;
          font-weight: 800;
          font-size: 15.5px;
          color: var(--ink);
          cursor: pointer;
        }
        .gc-subtitle {
          margin-top: 3px;
          font-size: 12px;
          color: var(--ink-muted);
        }

        .gc-messages {
          flex: 1;
          min-height: 220px;
          max-height: 380px;
          overflow-y: auto;
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .gc-empty-inner {
          margin: auto;
          color: var(--ink-muted);
          font-size: 13.5px;
          text-align: center;
        }

        .gc-msg { display: flex; flex-direction: column; align-items: flex-start; max-width: 78%; }
        .gc-msg.mine { align-self: flex-end; align-items: flex-end; }
        .gc-msg-author { font-size: 11.5px; font-weight: 700; color: var(--ink-muted); margin-bottom: 2px; padding: 0 4px; }
        .gc-msg-bubble {
          background: var(--bubble-other);
          border-radius: 14px;
          padding: 9px 13px;
          font-size: 14.5px;
          line-height: 1.4;
          color: var(--ink);
          position: relative;
          word-break: break-word;
        }
        .gc-msg.mine .gc-msg-bubble { background: var(--bubble-mine); }
        .gc-msg-time { display: block; font-size: 10px; color: var(--ink-muted); margin-top: 3px; text-align: right; }
        .gc-link { color: var(--brand); font-weight: 700; text-decoration: underline; word-break: break-all; }
        .gc-report-btn {
          margin-top: 2px; padding: 0; border: none; background: none; cursor: pointer;
          font-size: 10.5px; color: var(--ink-muted); text-decoration: underline;
        }
        .gc-report-btn:disabled { cursor: default; color: #B91C1C; text-decoration: none; }

        .gc-newchat-btn {
          margin-left: auto; display: flex; align-items: center; gap: 6px;
          padding: 7px 13px; border-radius: 999px;
          border: 1.5px solid var(--brand); background: var(--bubble-mine); color: var(--brand);
          cursor: pointer; font-size: 12.5px; font-weight: 800; font-family: inherit;
          flex-shrink: 0; transition: background .15s, color .15s;
        }
        .gc-newchat-btn:hover, .gc-newchat-btn.active { background: var(--brand); color: #fff; }

        .gc-empty-cta {
          margin: 12px auto 0; display: flex; align-items: center; gap: 8px;
          padding: 10px 18px; border-radius: 999px; border: none;
          background: var(--brand); color: #fff; font-weight: 800; font-size: 13.5px;
          font-family: inherit; cursor: pointer; box-shadow: 0 6px 16px rgba(0,198,167,.28);
        }
        .gc-empty-cta:hover { filter: brightness(1.05); }

        .gc-picker {
          border-bottom: 1px solid var(--border);
          background: var(--bubble-other);
        }
        .gc-picker-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 16px; font-size: 12px; font-weight: 700; text-transform: uppercase;
          letter-spacing: .04em; color: var(--ink-muted);
        }
        .gc-picker-close {
          border: none; background: none; cursor: pointer; color: var(--ink-muted);
          font-size: 13px; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;
        }
        .gc-picker-close:hover { color: var(--ink); }

        .gc-picker-tabs { display: flex; gap: 4px; }
        .gc-picker-tab {
          border: none; background: none; cursor: pointer;
          font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
          color: var(--ink-muted); padding: 4px 10px; border-radius: 999px;
        }
        .gc-picker-tab.active { background: var(--brand); color: #fff; }

        .gc-picker-groupname {
          margin: 0 12px 8px; padding: 8px 12px; border: 1.5px solid var(--border); border-radius: 10px;
          font-size: 13px; font-family: inherit; color: var(--ink); background: var(--paper);
          outline: none; width: calc(100% - 24px);
        }
        .gc-picker-groupname:focus { border-color: var(--brand); }

        .gc-picker-item-check { gap: 10px; }
        .gc-picker-item-check input[type="checkbox"] { width: 15px; height: 15px; cursor: pointer; flex-shrink: 0; }

        .gc-picker-groupfooter { padding: 4px 12px 12px; }
        .gc-create-group-btn {
          width: 100%; padding: 10px; border: none; border-radius: 10px;
          background: var(--brand); color: #fff; font-weight: 800; font-size: 13.5px;
          font-family: inherit; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .gc-create-group-btn:disabled { background: #D7D3C9; cursor: default; }

        .gc-picker-hint {
          margin: -4px 16px 8px; font-size: 11.5px; color: var(--ink-muted);
        }

        .gc-picker-search {
          display: flex; align-items: center; gap: 8px;
          margin: 0 12px 8px; padding: 7px 10px;
          background: var(--paper); border: 1.5px solid var(--border); border-radius: 999px;
        }
        .gc-picker-search i.fa-magnifying-glass { color: var(--ink-muted); font-size: 11px; flex-shrink: 0; }
        .gc-picker-search input {
          flex: 1; border: none; outline: none; background: transparent;
          font-size: 13px; font-family: inherit; color: var(--ink);
        }
        .gc-picker-search-clear {
          border: none; background: none; cursor: pointer; color: var(--ink-muted);
          font-size: 11px; flex-shrink: 0; width: 18px; height: 18px;
          display: flex; align-items: center; justify-content: center;
        }
        .gc-picker-search-clear:hover { color: var(--ink); }

        .gc-picker-list {
          max-height: 260px; overflow-y: auto; padding: 4px 10px 10px;
          display: flex; flex-direction: column; gap: 3px;
          scrollbar-width: thin;
        }
        .gc-picker-list::-webkit-scrollbar { width: 6px; }
        .gc-picker-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 999px; }
        .gc-picker-item {
          display: flex; align-items: center; gap: 10px; width: 100%;
          padding: 9px 10px; border-radius: 10px; border: 1px solid transparent;
          background: var(--paper); cursor: pointer; text-align: left;
          font-size: 13.5px; font-family: inherit; color: var(--ink);
          transition: background .12s, border-color .12s;
        }
        .gc-picker-item:hover { background: var(--bubble-mine); border-color: var(--brand); }
        .gc-picker-item:disabled { opacity: 0.6; cursor: default; }
        .gc-picker-avatar {
          width: 26px; height: 26px; border-radius: 50%; background: var(--bubble-mine);
          color: var(--brand); display: flex; align-items: center; justify-content: center;
          font-size: 11px; flex-shrink: 0;
        }
        .gc-picker-name { flex: 1; font-weight: 600; }
        .gc-picker-class-badge {
          font-size: 10.5px; font-weight: 700; color: var(--ink-muted);
          background: var(--bubble-other); border-radius: 999px; padding: 2px 8px; flex-shrink: 0;
        }
        .gc-picker-chevron { color: var(--ink-muted); font-size: 11px; flex-shrink: 0; }

        .gc-error {
          margin: 0 18px; padding: 8px 12px; border-radius: 8px;
          background: #FDEDED; color: #B91C1C; font-size: 12.5px; font-weight: 600;
          display: flex; align-items: center; gap: 6px;
        }

        .gc-input-row {
          display: flex; gap: 8px; padding: 12px 14px;
          border-top: 1px solid var(--border);
        }
        .gc-input {
          flex: 1; border: 1.5px solid var(--border); border-radius: 999px;
          padding: 10px 16px; font-size: 14px; font-family: inherit; outline: none;
        }
        .gc-input:focus { border-color: var(--brand); }
        .gc-send-btn {
          width: 40px; height: 40px; border-radius: 50%; border: none;
          background: var(--brand); color: #fff; cursor: pointer;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .gc-send-btn:disabled { background: #D7D3C9; cursor: default; }

        .gc-window-controls { display: flex; align-items: center; gap: 2px; margin-left: 4px; flex-shrink: 0; }
        .gc-window-btn {
          width: 24px; height: 24px; border-radius: 6px; border: none; background: none;
          color: var(--ink-muted); cursor: pointer; font-size: 12px;
          display: flex; align-items: center; justify-content: center;
        }
        .gc-window-btn:hover { background: var(--bubble-other); color: var(--ink); }

        .gc-status-dot {
          width: 8px; height: 8px; border-radius: 50%; background: #D7D3C9;
          flex-shrink: 0; margin: 0 -2px;
        }
        .gc-status-dot.online { background: #22c55e; box-shadow: 0 0 0 3px rgba(34,197,94,.18); }
        .gc-picker-item .gc-status-dot { margin: 0; }
        .gc-call-btn {
          width: 28px; height: 28px; border-radius: 50%; border: none;
          background: #22c55e; color: #fff; cursor: pointer; font-size: 11.5px;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .gc-call-btn:disabled { background: #D7D3C9; cursor: default; }

        .gc-picker-filters { display: flex; gap: 8px; margin: 0 12px 8px; }
        .gc-picker-class-select {
          flex-shrink: 0; max-width: 40%; border: 1.5px solid var(--border); border-radius: 999px;
          padding: 7px 10px; font-size: 12.5px; font-family: inherit; color: var(--ink);
          background: var(--paper); cursor: pointer;
        }
        .gc-picker-filters .gc-picker-search { margin: 0; flex: 1; min-width: 0; }
        .gc-picker-count { margin: 0 16px 6px; font-size: 11px; font-weight: 700; color: var(--ink-muted); }
      `}</style>
    </div>
    </div>
  );
});

GroupChat.displayName = 'GroupChat';

export default GroupChat;
