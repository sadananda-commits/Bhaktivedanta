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
// USAGE:
//   <GroupChat profile={profile} t={t} />
// `profile` needs at least { id, name, classLevel }. classLevel is only
// needed for the "start a 1:1 chat" picker — without it, that button is
// simply hidden.

import { useState, useEffect, useRef, useCallback } from 'react';

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

export default function GroupChat({ profile, t }) {
  const tr = t || (s => s);

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

  // ── 1:1 chat picker ────────────────────────────────────────────────────
  const [showPicker, setShowPicker] = useState(false);
  const [classmates, setClassmates] = useState([]);
  const [classmatesLoading, setClassmatesLoading] = useState(false);
  const [classmatesError, setClassmatesError] = useState('');
  const [classmateFilter, setClassmateFilter] = useState('');
  const [startingDmFor, setStartingDmFor] = useState(null);
  const [dmError, setDmError] = useState('');

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
      if (msgs.length) lastTimestampRef.current = msgs[msgs.length - 1].timestamp;
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
      });
    }, POLL_MS);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeGroupId, fetchMessages]);

  // ── Auto-scroll to newest message ─────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const activeGroup = groups.find(g => g.groupId === activeGroupId);

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
      })
      .catch(() => setSendError('Could not send — try again'))
      .finally(() => setSending(false));
  };

  const openPicker = () => {
    setShowPicker(prev => !prev);
    setDmError('');
    setClassmateFilter('');
    if (classmates.length || !profile?.classLevel) return; // already loaded, or nothing to look up
    setClassmatesLoading(true);
    setClassmatesError('');
    fetch(`/api/student/chat-dm?classLevel=${encodeURIComponent(profile.classLevel)}&excludeStudentId=${encodeURIComponent(profile.id)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setClassmatesError(data.error); return; }
        setClassmates(data.classmates || []);
      })
      .catch(() => setClassmatesError('Could not load classmates — try again'))
      .finally(() => setClassmatesLoading(false));
  };

  const startDm = (classmate) => {
    setStartingDmFor(classmate.studentId);
    setDmError('');
    fetch('/api/student/chat-dm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: profile.id,
        studentName: profile.name,
        otherStudentId: classmate.studentId,
        otherStudentName: classmate.studentName,
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
          : [...prev, { groupId: data.groupId, groupName: data.groupName || classmate.studentName, type: 'DM' }]);
        setActiveGroupId(data.groupId);
        setShowPicker(false);
      })
      .catch(() => setDmError('Could not start that chat — try again'))
      .finally(() => setStartingDmFor(null));
  };

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
  const canStartDm = !!profile?.classLevel;

  // ── The "start a chat" picker — shared markup used in both the empty
  // state (no groups yet) and the normal header, so it's always styled
  // consistently by the single <style jsx> block below. ──────────────────
  const filteredClassmates = classmateFilter.trim()
    ? classmates.filter(c => c.studentName.toLowerCase().includes(classmateFilter.trim().toLowerCase()))
    : classmates;

  const picker = showPicker && (
    <div className="gc-picker">
      <div className="gc-picker-head">
        <span>Start a chat with a classmate</span>
        <button className="gc-picker-close" onClick={() => setShowPicker(false)} aria-label="Close">
          <i className="fa-solid fa-xmark" />
        </button>
      </div>

      {!classmatesLoading && !classmatesError && classmates.length > 0 && (
        <div className="gc-picker-search">
          <i className="fa-solid fa-magnifying-glass" />
          <input
            type="text"
            value={classmateFilter}
            onChange={e => setClassmateFilter(e.target.value)}
            placeholder="Search classmates by name…"
            autoFocus
          />
          {classmateFilter && (
            <button className="gc-picker-search-clear" onClick={() => setClassmateFilter('')} aria-label="Clear search">
              <i className="fa-solid fa-xmark" />
            </button>
          )}
        </div>
      )}

      {classmatesError ? (
        <div className="gc-empty-inner">{classmatesError}</div>
      ) : classmatesLoading ? (
        <div className="gc-empty-inner">Loading classmates…</div>
      ) : !classmates.length ? (
        <div className="gc-empty-inner">No classmates found to chat with yet.</div>
      ) : !filteredClassmates.length ? (
        <div className="gc-empty-inner">No one matches "{classmateFilter}"</div>
      ) : (
        <div className="gc-picker-list">
          {filteredClassmates.map(c => (
            <button
              key={c.studentId}
              className="gc-picker-item"
              onClick={() => startDm(c)}
              disabled={startingDmFor === c.studentId}
            >
              <span className="gc-picker-avatar"><i className="fa-solid fa-user" /></span>
              <span className="gc-picker-name">{c.studentName}</span>
              {startingDmFor === c.studentId
                ? <i className="fa-solid fa-spinner fa-spin gc-picker-chevron" />
                : <i className="fa-solid fa-chevron-right gc-picker-chevron" />}
            </button>
          ))}
        </div>
      )}
      {dmError && <div className="gc-error" style={{ margin: '0 10px 10px' }}><i className="fa-solid fa-circle-exclamation" /> {dmError}</div>}
    </div>
  );

  if (groupsLoading) {
    return <div className="gc-card gc-empty">Loading your groups…</div>;
  }

  return (
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
          {canStartDm && (
            <button className={`gc-newchat-btn${showPicker ? ' active' : ''}`} onClick={openPicker} aria-label="Start a new 1:1 chat" title="Start a new chat">
              <i className="fa-solid fa-user-plus" />
            </button>
          )}
        </div>
        <div className="gc-subtitle">Cheer each other on — your teacher can see this chat too 🎉</div>
      </div>

      {picker}

      {!hasGroups ? (
        <div className="gc-empty-inner" style={{ padding: '28px 20px' }}>
          <i className="fa-solid fa-people-group" style={{ fontSize: '22px', marginBottom: '8px', display: 'block' }} />
          {groupsError
            ? <>Couldn't load your chats: {groupsError}</>
            : <>You're not in a chat group yet — ask your teacher to add you to one{canStartDm ? ', or start a 1:1 chat above.' : '.'}</>
          }
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
          max-width: 640px;
          display: flex;
          flex-direction: column;
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(28,33,48,0.04), 0 10px 28px rgba(28,33,48,0.06);
        }
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
          min-height: 260px;
          max-height: 420px;
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
          margin-left: auto; width: 28px; height: 28px; border-radius: 50%;
          border: none; background: var(--bubble-other); color: var(--ink);
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          font-size: 12px; flex-shrink: 0; transition: background .15s;
        }
        .gc-newchat-btn:hover, .gc-newchat-btn.active { background: var(--brand); color: #fff; }

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
      `}</style>
    </div>
  );
}
