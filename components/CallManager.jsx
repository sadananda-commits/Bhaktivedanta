// components/CallManager.jsx
//
// Global 1:1 AUDIO calling between students, on top of the same
// CHAT_APPS_SCRIPT_URL / "Calls" sheet used for signaling — see
// pages/api/student/call.js for the API surface and the Apps Script
// snippet (calls-apps-script-additions.gs) for the backend half.
//
// Mount this ONCE, unconditionally, near the top of the portal shell,
// same as <ChatNotifications /> and <AssignmentNotifications />, so a
// student can receive a call no matter which tab they're on.
//
// To START a call from anywhere (e.g. a "Call" button in a DM header),
// the parent sets `callRequest={{ calleeId, calleeName }}` — this
// component picks that up, kicks off the call, then calls
// `onCallRequestHandled()` so the parent can clear it back to null.
//
// Audio only, on purpose (see conversation with Bichi, July 2026):
// no video, and calling is scoped to whoever the student can already
// DM — enforced by whatever screen renders the "Call" button, not by
// this component itself. Finished calls ARE logged (CallID/who/when/
// duration) to the "Call Log" sheet tab by the Apps Script backend, for
// audit purposes only — there's no in-app viewer for it, and nothing
// here reads it back. This component also sends this student's presence
// heartbeat every 25s (see HEARTBEAT_MS below), since "who's online" only
// exists to answer "who can I call right now" — see GroupChat.jsx's
// green online dot.
//
// WEBRTC NOTES:
// - Uses public Google STUN servers only, no TURN server configured.
//   This works on most home/mobile networks. Some school networks with
//   strict firewalls may block the direct peer-to-peer audio path even
//   after signaling succeeds (call "connects" but no audio comes through).
//   If that happens, add a TURN provider (Twilio Network Traversal
//   Service, Xirsys, Cloudflare Calls, etc. all have small free tiers)
//   and set NEXT_PUBLIC_TURN_URL / NEXT_PUBLIC_TURN_USERNAME /
//   NEXT_PUBLIC_TURN_CREDENTIAL in Vercel env vars — this file already
//   reads them if present, no code change needed.
// - Ringing times out after 30s with no answer (RING_TIMEOUT_MS).

import { useEffect, useRef, useState, useCallback } from 'react';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  ...(process.env.NEXT_PUBLIC_TURN_URL ? [{
    urls: process.env.NEXT_PUBLIC_TURN_URL,
    username: process.env.NEXT_PUBLIC_TURN_USERNAME,
    credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
  }] : []),
];

const INCOMING_POLL_MS = 3000; // background "is anyone calling me" check
const ACTIVE_POLL_MS   = 1500; // signaling poll once a call is ringing/live
const RING_TIMEOUT_MS  = 30000;
const HEARTBEAT_MS     = 25000; // presence "I'm online" ping — server treats anyone silent for 60s as offline

export default function CallManager({ profile, callRequest, onCallRequestHandled }) {
  const [phase, setPhase]       = useState('idle'); // idle | outgoing | incoming | connected
  const [peerName, setPeerName] = useState('');
  const [duration, setDuration] = useState(0);
  const [muted, setMuted]       = useState(false);

  const pcRef              = useRef(null);
  const localStreamRef     = useRef(null);
  const remoteAudioRef     = useRef(null);
  const callIdRef          = useRef(null);
  const seenCandidatesRef  = useRef(0);
  const activePollRef      = useRef(null);
  const incomingPollRef    = useRef(null);
  const ringTimeoutRef     = useRef(null);
  const durationTimerRef   = useRef(null);
  const incomingCallRef    = useRef(null); // raw call row while ringing, before accept

  const post = useCallback((action, body) => fetch('/api/student/call', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  }).then(r => r.json()).catch(() => ({})), []);

  const get = useCallback((action, params) => {
    const qs = new URLSearchParams({ action, ...params }).toString();
    return fetch(`/api/student/call?${qs}`).then(r => r.json()).catch(() => ({}));
  }, []);

  const cleanup = useCallback(() => {
    if (pcRef.current) { try { pcRef.current.close(); } catch {} pcRef.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
    if (activePollRef.current) { clearInterval(activePollRef.current); activePollRef.current = null; }
    if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null; }
    if (durationTimerRef.current) { clearInterval(durationTimerRef.current); durationTimerRef.current = null; }
    callIdRef.current = null;
    seenCandidatesRef.current = 0;
    incomingCallRef.current = null;
    setPhase('idle');
    setPeerName('');
    setDuration(0);
    setMuted(false);
  }, []);

  const endCall = useCallback((notify = true) => {
    if (notify && callIdRef.current) post('end', { callId: callIdRef.current });
    cleanup();
  }, [post, cleanup]);

  const createPeerConnection = useCallback((onCandidate) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (e) => { if (e.candidate) onCandidate(e.candidate); };
    pc.ontrack = (e) => { if (remoteAudioRef.current) remoteAudioRef.current.srcObject = e.streams[0]; };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') endCall(true);
    };
    return pc;
  }, [endCall]);

  const startDurationTimer = useCallback(() => {
    const startedAt = Date.now();
    durationTimerRef.current = setInterval(
      () => setDuration(Math.floor((Date.now() - startedAt) / 1000)),
      1000
    );
  }, []);

  // ── Presence heartbeat ───────────────────────────────────────────────────
  // CallManager is already mounted once, unconditionally, at the top of the
  // portal — the natural place to also say "I'm online" every ~25s, since
  // "who's online" only exists to answer "who can I call right now".
  useEffect(() => {
    if (!profile?.id) return;
    const beat = () => fetch('/api/student/presence', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: profile.id, studentName: profile.name }),
    }).catch(() => {});
    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [profile?.id, profile?.name]);

  // ── Outgoing call ──────────────────────────────────────────────────────
  const startCall = useCallback(async (calleeId, calleeName) => {
    if (phase !== 'idle') return; // already on a call — ignore
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      setPeerName(calleeName);
      setPhase('outgoing');

      const pc = createPeerConnection((candidate) => {
        post('candidate', { callId: callIdRef.current, role: 'caller', candidate });
      });
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const res = await post('start', {
        callerId: profile.id, callerName: profile.name,
        calleeId, calleeName, offer,
      });
      if (!res || !res.callId) throw new Error('Could not start call');
      callIdRef.current = res.callId;

      ringTimeoutRef.current = setTimeout(() => endCall(true), RING_TIMEOUT_MS);

      activePollRef.current = setInterval(async () => {
        const state = await get('state', { callId: callIdRef.current });
        if (!state || !state.Status) return;

        if (['declined', 'ended', 'missed'].includes(state.Status)) { cleanup(); return; }

        if (state.Status === 'accepted' && state.Answer && pc.signalingState === 'have-local-offer') {
          clearTimeout(ringTimeoutRef.current);
          await pc.setRemoteDescription(state.Answer);
          setPhase('connected');
          startDurationTimer();
        }

        const calleeCandidates = state.CalleeCandidates || [];
        for (let i = seenCandidatesRef.current; i < calleeCandidates.length; i++) {
          try { await pc.addIceCandidate(calleeCandidates[i]); } catch {}
        }
        seenCandidatesRef.current = calleeCandidates.length;
      }, ACTIVE_POLL_MS);

    } catch (err) {
      console.error('[CallManager] startCall error:', err);
      cleanup();
    }
  }, [phase, profile, post, get, createPeerConnection, endCall, cleanup, startDurationTimer]);

  // Kick off an outgoing call whenever the parent hands us a new request.
  useEffect(() => {
    if (callRequest?.calleeId) {
      startCall(callRequest.calleeId, callRequest.calleeName);
      onCallRequestHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callRequest]);

  // ── Incoming call detection (only while not already on a call) ─────────
  useEffect(() => {
    if (!profile?.id || phase !== 'idle') return;
    incomingPollRef.current = setInterval(async () => {
      const row = await get('incoming', { studentId: profile.id });
      if (row && row.CallID && row.Status === 'ringing') {
        incomingCallRef.current = row;
        setPeerName(row.CallerName);
        setPhase('incoming');
      }
    }, INCOMING_POLL_MS);
    return () => clearInterval(incomingPollRef.current);
  }, [profile?.id, phase, get]);

  // ── Accept / decline an incoming call ───────────────────────────────────
  const acceptCall = useCallback(async () => {
    const row = incomingCallRef.current;
    if (!row) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      callIdRef.current = row.CallID;

      const pc = createPeerConnection((candidate) => {
        post('candidate', { callId: row.CallID, role: 'callee', candidate });
      });
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      await pc.setRemoteDescription(row.Offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await post('answer', { callId: row.CallID, answer });

      setPhase('connected');
      startDurationTimer();

      activePollRef.current = setInterval(async () => {
        const state = await get('state', { callId: callIdRef.current });
        if (!state || !state.Status) return;
        if (state.Status === 'ended') { cleanup(); return; }
        const callerCandidates = state.CallerCandidates || [];
        for (let i = seenCandidatesRef.current; i < callerCandidates.length; i++) {
          try { await pc.addIceCandidate(callerCandidates[i]); } catch {}
        }
        seenCandidatesRef.current = callerCandidates.length;
      }, ACTIVE_POLL_MS);

    } catch (err) {
      console.error('[CallManager] acceptCall error:', err);
      post('decline', { callId: row.CallID });
      cleanup();
    }
  }, [post, get, createPeerConnection, cleanup, startDurationTimer]);

  const declineCall = useCallback(() => {
    const row = incomingCallRef.current;
    if (row) post('decline', { callId: row.CallID });
    cleanup();
  }, [post, cleanup]);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const track = localStreamRef.current.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  }, []);

  // Tear everything down if the component unmounts (e.g. logout).
  useEffect(() => () => cleanup(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <>
      <audio ref={remoteAudioRef} autoPlay />

      {phase === 'incoming' && (
        <div className="cm-modal-backdrop">
          <div className="cm-modal">
            <div className="cm-avatar"><i className="fa-solid fa-phone-volume" /></div>
            <div className="cm-title">{peerName}</div>
            <div className="cm-sub">Incoming call…</div>
            <div className="cm-actions">
              <button className="cm-decline" onClick={declineCall} aria-label="Decline"><i className="fa-solid fa-phone-slash" /></button>
              <button className="cm-accept" onClick={acceptCall} aria-label="Accept"><i className="fa-solid fa-phone" /></button>
            </div>
          </div>
        </div>
      )}

      {(phase === 'outgoing' || phase === 'connected') && (
        <div className="cm-bar">
          <div className="cm-bar-icon"><i className={`fa-solid ${phase === 'outgoing' ? 'fa-phone-volume' : 'fa-phone'}`} /></div>
          <div className="cm-bar-body">
            <div className="cm-bar-name">{peerName}</div>
            <div className="cm-bar-status">{phase === 'outgoing' ? 'Calling…' : fmt(duration)}</div>
          </div>
          {phase === 'connected' && (
            <button className="cm-bar-btn" onClick={toggleMute} aria-label="Mute">
              <i className={`fa-solid ${muted ? 'fa-microphone-slash' : 'fa-microphone'}`} />
            </button>
          )}
          <button className="cm-bar-end" onClick={() => endCall(true)} aria-label="End call">
            <i className="fa-solid fa-phone-slash" />
          </button>
        </div>
      )}

      <style jsx>{`
        .cm-modal-backdrop {
          position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 10000;
          display: flex; align-items: center; justify-content: center;
        }
        .cm-modal {
          background: #1B2130; color: #fff; border-radius: 20px; padding: 28px 32px;
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          font-family: 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif;
          min-width: 240px;
        }
        .cm-avatar {
          width: 56px; height: 56px; border-radius: 50%; background: #00C6A7;
          display: flex; align-items: center; justify-content: center; font-size: 22px; margin-bottom: 6px;
        }
        .cm-title { font-size: 16px; font-weight: 800; }
        .cm-sub { font-size: 12.5px; color: rgba(255,255,255,.65); margin-bottom: 14px; }
        .cm-actions { display: flex; gap: 20px; }
        .cm-decline, .cm-accept {
          width: 50px; height: 50px; border-radius: 50%; border: none; color: #fff;
          font-size: 18px; cursor: pointer;
        }
        .cm-decline { background: #ef4444; }
        .cm-accept { background: #22c55e; }

        .cm-bar {
          position: fixed; top: 14px; left: 50%; transform: translateX(-50%); z-index: 9999;
          display: flex; align-items: center; gap: 10px;
          background: #1B2130; color: #fff; border-radius: 999px; padding: 8px 10px 8px 14px;
          box-shadow: 0 10px 30px rgba(0,0,0,.25);
          font-family: 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .cm-bar-icon {
          width: 28px; height: 28px; border-radius: 50%; background: #00C6A7;
          display: flex; align-items: center; justify-content: center; font-size: 12px; flex-shrink: 0;
        }
        .cm-bar-name { font-size: 12.5px; font-weight: 800; }
        .cm-bar-status { font-size: 11px; color: rgba(255,255,255,.65); }
        .cm-bar-btn, .cm-bar-end {
          width: 30px; height: 30px; border-radius: 50%; border: none; color: #fff;
          font-size: 12px; cursor: pointer; flex-shrink: 0;
        }
        .cm-bar-btn { background: rgba(255,255,255,.15); }
        .cm-bar-end { background: #ef4444; }
      `}</style>
    </>
  );
}
