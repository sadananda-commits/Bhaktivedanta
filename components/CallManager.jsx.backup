// components/CallManager.jsx
//
// Global 1:1 calling between students (audio by default, video opt-in), on
// top of the same CHAT_APPS_SCRIPT_URL / "Calls" sheet used for signaling —
// see pages/api/student/call.js for the API surface and chat-apps-script.gs
// for the backend half.
//
// Mount this ONCE, unconditionally, near the top of the portal shell,
// same as <ChatNotifications /> and <AssignmentNotifications />, so a
// student can receive a call no matter which tab they're on.
//
// To START a call from anywhere (e.g. a "Call" button in a DM header),
// the parent sets `callRequest={{ calleeId, calleeName, mode }}` — this
// component picks that up, kicks off the call, then calls
// `onCallRequestHandled()` so the parent can clear it back to null.
//
// Audio calling by default; video calling is opt-in per call (added July
// 2026) — the parent sets `callRequest={{ calleeId, calleeName, mode:
// 'video' }}` (mode defaults to 'audio' if omitted, so existing callers of
// this component keep today's audio-only behavior unchanged). Whether a
// given call is audio or video is read straight off the WebRTC offer's own
// SDP (an 'm=video' line) rather than a separate flag, so no chat-apps-
// script.gs / Sheet schema change was needed for this. Calling is scoped to
// whoever the student can already DM — enforced by whatever screen renders
// the Call/Video Call buttons, not by this component itself. Finished
// calls ARE logged (CallID/who/when/duration) to the "Call Log" sheet tab
// by the Apps Script backend, for audit purposes only — there's no in-app
// viewer for it, and nothing here reads it back.
//
// PRESENCE + RINGING WHILE IDLE OR ON ANOTHER DEVICE (added July 2026):
// - Presence (usePresenceHeartbeat) now reports active/idle per device, not
//   just "online" — a student who has the tab open but hasn't touched it in
//   a while is still callable, and getting called is exactly what's meant
//   to pull them back. A student who has explicitly signed out (or never
//   signed in) has no fresh presence row at all, and startCall rejects
//   immediately — see the 'offline' phase below — rather than ringing for
//   30s and timing out.
// - A student signed in on more than one device (tablet + laptop, say) has
//   a presence row per device, and the "who's calling me" poll is keyed by
//   student ID, not device ID — so every device they're signed into rings.
//   Whichever device answers first wins; the OTHER device(s) are watching
//   call state while showing the incoming modal (see the phase==='incoming'
//   effect below) and quietly dismiss themselves once they see the call was
//   answered, declined, or ended elsewhere.
// - Ring escalation (useIncomingCallRinger): a looping tone, a vibration
//   pattern, a browser Notification, and a flashing tab title, all meant to
//   get through even if the student isn't looking at this tab right now.
//   Real limit, stated plainly: all of this depends on the tab/app still
//   being open with its JS timers running. A locked phone or a fully closed
//   app will not ring from this — that needs real Web Push or a native push
//   service, which this polling-based signaling setup doesn't provide.
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
//   reads them if present, no code change needed. Video calls are more
//   exposed to this than audio (more bandwidth relayed through TURN if it's
//   needed at all), so if audio calls have been working fine but video
//   calls connect with no picture/choppy video, a TURN provider is the
//   first thing to check — outgoing video is also capped at ~500kbps
//   (capVideoBitrate_ before) to go easier on a school's shared bandwidth.
// - Ringing times out after 30s with no answer (RING_TIMEOUT_MS).

import { useEffect, useRef, useState, useCallback } from 'react';
import usePresenceHeartbeat from '../hooks/usePresenceHeartbeat';
import useIncomingCallRinger from '../hooks/useIncomingCallRinger';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  ...(process.env.NEXT_PUBLIC_TURN_URL ? [{
    urls: process.env.NEXT_PUBLIC_TURN_URL,
    username: process.env.NEXT_PUBLIC_TURN_USERNAME,
    credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
  }] : []),
];

const ACTIVE_POLL_MS  = 800;   // was 1500 — tighter poll once a call is ringing/live
const RING_TIMEOUT_MS = 30000;
const MEDIA_TIMEOUT_MS = 12000; // NEW — if SDP+ICE haven't produced a real connection within 12s of answering, give up rather than let a silent "connected" call run forever
const OFFLINE_MSG_MS  = 3500;  // how long the "they're signed out" toast stays up

export default function CallManager({ profile, callRequest, onCallRequestHandled }) {
  const [phase, setPhase]         = useState('idle'); // idle | outgoing | offline | incoming | connecting | connected
  const [peerName, setPeerName]   = useState('');
  const [duration, setDuration]   = useState(0);
  const [muted, setMuted]         = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [callMode, setCallMode]   = useState('audio'); // 'audio' | 'video' — which kind of call is live right now
  const [offlineName, setOfflineName] = useState('');

  const pcRef              = useRef(null);
  const localStreamRef     = useRef(null);
  const remoteVideoRef     = useRef(null); // single <video> element handles both audio-only and video calls — see render section
  const localVideoRef      = useRef(null); // local camera preview, video calls only
  const callIdRef          = useRef(null);
  const seenCandidatesRef  = useRef(0);
  const activePollRef      = useRef(null);
  const ringTimeoutRef     = useRef(null);
  const mediaTimeoutRef    = useRef(null);
  const durationTimerRef   = useRef(null);
  const offlineTimeoutRef  = useRef(null);

  // Caps outgoing video bitrate so a video call doesn't overwhelm a
  // school's shared/limited bandwidth the way an uncapped one can. Audio is
  // cheap enough not to bother capping. Safe to call even if this browser's
  // sender doesn't support setParameters — wrapped in try/catch.
  const capVideoBitrate_ = (pc) => {
    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
    if (!sender) return;
    try {
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) params.encodings = [{}];
      params.encodings[0].maxBitrate = 500_000; // ~500kbps, reasonable for a small preview-sized video call
      sender.setParameters(params).catch(() => {});
    } catch {}
  };

  // Whether an SDP offer/answer is a video call — checked from the SDP
  // itself (an 'm=video' media line) rather than a separate flag, so no
  // backend/schema change is needed to support this.
  const sdpHasVideo_ = (desc) => !!(desc && desc.sdp && desc.sdp.includes('m=video'));

  const post = useCallback((action, body) => fetch('/api/student/call', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  }).then(r => r.json()).catch(() => ({})), []);

  // ── Candidate batching ───────────────────────────────────────────────
  // NEW — reads callIdRef.current at SEND time, not at queue time. If the
  // call ID isn't back from post('start') yet (ICE candidates routinely fire
  // before that round-trip finishes), it retries in 150ms instead of sending
  // a batch with a blank callId that the backend just silently drops.
  const candidateQueueRef = useRef([]);
  const candidateFlushTimerRef = useRef(null);
  const flushCandidates_ = useCallback((role) => {
    const callId = callIdRef.current;
    if (!callId) {
      candidateFlushTimerRef.current = setTimeout(() => flushCandidates_(role), 150);
      return;
    }
    const batch = candidateQueueRef.current;
    candidateQueueRef.current = [];
    candidateFlushTimerRef.current = null;
    if (batch.length) post('candidate', { callId, role, candidates: batch });
  }, [post]);

  const queueCandidate = useCallback((role, candidate) => {
    candidateQueueRef.current.push(candidate);
    if (candidateFlushTimerRef.current) return;
    candidateFlushTimerRef.current = setTimeout(() => flushCandidates_(role), 200);
  }, [flushCandidates_]);

  const get = useCallback((action, params) => {
    const qs = new URLSearchParams({ action, ...params }).toString();
    return fetch(`/api/student/call?${qs}`).then(r => r.json()).catch(() => ({}));
  }, []);

  const cleanup = useCallback(() => {
    if (pcRef.current) { try { pcRef.current.close(); } catch {} pcRef.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
    if (activePollRef.current) { clearInterval(activePollRef.current); activePollRef.current = null; }
    if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null; }
    if (mediaTimeoutRef.current) { clearTimeout(mediaTimeoutRef.current); mediaTimeoutRef.current = null; }
    if (durationTimerRef.current) { clearInterval(durationTimerRef.current); durationTimerRef.current = null; }
    if (offlineTimeoutRef.current) { clearTimeout(offlineTimeoutRef.current); offlineTimeoutRef.current = null; }
    if (candidateFlushTimerRef.current) { clearTimeout(candidateFlushTimerRef.current); candidateFlushTimerRef.current = null; }
    candidateQueueRef.current = [];
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    callIdRef.current = null;
    seenCandidatesRef.current = 0;
    setPhase('idle');
    setPeerName('');
    setDuration(0);
    setMuted(false);
    setCameraOff(false);
    setCallMode('audio');
    setOfflineName('');
  }, []);

  const endCall = useCallback((notify = true) => {
    if (notify && callIdRef.current) post('end', { callId: callIdRef.current });
    cleanup();
  }, [post, cleanup]);

  // NEW — onMediaUp fires once, the first time the connection genuinely
  // comes up; onMediaDown fires on failed/disconnected/closed so a call that
  // drops mid-conversation doesn't just sit there frozen on "connected".
  const createPeerConnection = useCallback((onCandidate, onMediaUp, onMediaDown) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    let upFired = false;
    pc.onicecandidate = (e) => { if (e.candidate) onCandidate(e.candidate); };
    // One <video> element handles both call types — for an audio-only call
    // it just never receives a video track, and stays visually hidden (see
    // render section) while still playing the audio track normally.
    pc.ontrack = (e) => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0]; };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected' && !upFired) {
        upFired = true;
        onMediaUp && onMediaUp();
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        onMediaDown && onMediaDown();
      }
    };
    return pc;
  }, []);

  const startDurationTimer = useCallback(() => {
    const startedAt = Date.now();
    durationTimerRef.current = setInterval(
      () => setDuration(Math.floor((Date.now() - startedAt) / 1000)),
      1000
    );
  }, []);

  // ── Presence heartbeat ───────────────────────────────────────────────────
  // Device-aware (active/idle per device) — see hooks/usePresenceHeartbeat.js.
  // CallManager is already mounted once, unconditionally, at the top of the
  // portal, so it's still the natural home for this.
  usePresenceHeartbeat(profile?.id, profile?.name);

  // ── Incoming call detection + ring escalation ───────────────────────────
  // Keeps polling regardless of local `phase` (not just while idle) — that's
  // what lets a device notice a call was answered/declined/ended on ANOTHER
  // of this student's devices and quietly dismiss its own incoming state,
  // instead of being stuck showing a modal for a call that's already over.
  const { incoming: ringerIncoming, accept: ringerAccept, decline: ringerDecline } = useIncomingCallRinger(profile?.id);

  // ── Outgoing call ──────────────────────────────────────────────────────
  // mode: 'audio' (default) or 'video'. GroupChat's Call/Video Call buttons
  // should set callRequest={{ calleeId, calleeName, mode: 'video' }} for a
  // video call — omitting mode (or setting 'audio') keeps today's
  // audio-only behavior.
  const startCall = useCallback(async (calleeId, calleeName, mode = 'audio') => {
    if (phase !== 'idle') return; // already on a call — ignore
    try {
      const wantsVideo = mode === 'video';
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: wantsVideo ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false,
      });
      localStreamRef.current = stream;
      setPeerName(calleeName);
      setCallMode(mode);
      setPhase('outgoing');
      if (wantsVideo && localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = createPeerConnection(
        (candidate) => queueCandidate('caller', candidate),
        () => { // onMediaUp
          clearTimeout(mediaTimeoutRef.current);
          setPhase('connected');
          startDurationTimer();
        },
        () => endCall(true) // onMediaDown — call dropped after it was up
      );
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      if (wantsVideo) capVideoBitrate_(pc);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const res = await post('start', {
        callerId: profile.id, callerName: profile.name,
        calleeId, calleeName, offer,
      });
      if (res && res.error === 'offline') {
        // No fresh presence at all for this student — never signed in, or
        // explicitly signed out on every device. Don't create a call that
        // would just ring for 30s and time out; tell the caller right away.
        stream.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
        pcRef.current && pc.close();
        pcRef.current = null;
        setOfflineName(calleeName);
        setPhase('offline');
        offlineTimeoutRef.current = setTimeout(() => cleanup(), OFFLINE_MSG_MS);
        return;
      }
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
          setPhase('connecting'); // SDP is done, but ICE hasn't necessarily succeeded yet
          mediaTimeoutRef.current = setTimeout(() => {
            console.error('[CallManager] media never connected (caller side)');
            endCall(true);
          }, MEDIA_TIMEOUT_MS);
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
  }, [phase, profile, post, get, createPeerConnection, endCall, cleanup, startDurationTimer, queueCandidate]);

  // Kick off an outgoing call whenever the parent hands us a new request.
  useEffect(() => {
    if (callRequest?.calleeId) {
      startCall(callRequest.calleeId, callRequest.calleeName, callRequest.mode || 'audio');
      onCallRequestHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callRequest]);

  // ── React to the ringer hook noticing an incoming call ──────────────────
  // If we're idle, show the incoming modal (ring escalation is already
  // running inside the hook by this point). If we're already on a call,
  // auto-decline the new one rather than interrupting — same as a phone
  // showing "busy" instead of a second incoming screen mid-call.
  useEffect(() => {
    if (!ringerIncoming) return;
    if (phase === 'idle') {
      setPeerName(ringerIncoming.CallerName || '');
      setPhase('incoming');
    } else if (phase !== 'incoming') {
      ringerDecline();
    }
  }, [ringerIncoming, phase, ringerDecline]);

  // If the ringer hook's incoming call disappears while we're mid-'incoming'
  // (answered/declined/ended on another of this student's devices, or the
  // caller hung up before we picked up), quietly drop back to idle instead
  // of leaving a stale modal up.
  useEffect(() => {
    if (phase === 'incoming' && !ringerIncoming) cleanup();
  }, [phase, ringerIncoming, cleanup]);

  // Derived, not stored in state — the incoming modal needs to know whether
  // to say "Video call…" before the student has accepted (and before a
  // camera has been requested), and the offer's own SDP already has the
  // answer, so there's nothing to track separately.
  const incomingIsVideo = sdpHasVideo_(ringerIncoming?.Offer);

  // ── Accept / decline an incoming call ───────────────────────────────────
  const acceptCall = useCallback(async () => {
    const call = ringerIncoming;
    if (!call) return;
    try {
      const wantsVideo = sdpHasVideo_(call.Offer);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: wantsVideo ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false,
      });
      localStreamRef.current = stream;
      callIdRef.current = call.CallID;
      setCallMode(wantsVideo ? 'video' : 'audio');
      if (wantsVideo && localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = createPeerConnection(
        (candidate) => queueCandidate('callee', candidate),
        () => { // onMediaUp
          clearTimeout(mediaTimeoutRef.current);
          setPhase('connected');
          startDurationTimer();
        },
        () => endCall(true) // onMediaDown
      );
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      if (wantsVideo) capVideoBitrate_(pc);

      await pc.setRemoteDescription(call.Offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await ringerAccept(answer); // posts the answer, stops ring escalation, clears hook's incoming state

      setPhase('connecting');
      mediaTimeoutRef.current = setTimeout(() => {
        console.error('[CallManager] media never connected (callee side)');
        endCall(true);
      }, MEDIA_TIMEOUT_MS);

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
      ringerDecline();
      cleanup();
    }
  }, [ringerIncoming, ringerAccept, ringerDecline, post, get, createPeerConnection, cleanup, startDurationTimer, queueCandidate]);

  const declineCall = useCallback(() => {
    ringerDecline();
    cleanup();
  }, [ringerDecline, cleanup]);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const track = localStreamRef.current.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  }, []);

  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return;
    const track = localStreamRef.current.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCameraOff(!track.enabled);
  }, []);

  // Tear everything down if the component unmounts (e.g. logout).
  useEffect(() => () => cleanup(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <>
      {/* Always rendered so it never misses an ontrack event and audio
          keeps playing even when visually hidden (audio-only calls, or a
          video call with the camera off) — see cm-remote-video-hidden. */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className={callMode === 'video' && (phase === 'connected' || phase === 'connecting' || phase === 'outgoing') ? 'cm-remote-video-visible' : 'cm-remote-video-hidden'}
      />

      {phase === 'offline' && (
        <div className="cm-toast">
          <i className="fa-solid fa-circle-exclamation" /> {offlineName} appears to be signed out right now
        </div>
      )}

      {phase === 'incoming' && (
        <div className="cm-modal-backdrop">
          <div className="cm-modal">
            <div className="cm-avatar"><i className={`fa-solid ${incomingIsVideo ? 'fa-video' : 'fa-phone-volume'}`} /></div>
            <div className="cm-title">{peerName}</div>
            <div className="cm-sub">{incomingIsVideo ? 'Incoming video call…' : 'Incoming call…'}</div>
            <div className="cm-actions">
              <button className="cm-decline" onClick={declineCall} aria-label="Decline"><i className="fa-solid fa-phone-slash" /></button>
              <button className="cm-accept" onClick={acceptCall} aria-label="Accept"><i className="fa-solid fa-phone" /></button>
            </div>
          </div>
        </div>
      )}

      {/* Video call panel — replaces the small pill bar with a proper view
          once there's actually a camera involved. Local preview is a PiP in
          the corner, same pattern as most video call UIs. */}
      {callMode === 'video' && (phase === 'outgoing' || phase === 'connecting' || phase === 'connected') && (
        <div className="cm-video-panel">
          <div className="cm-video-status">
            <span className="cm-video-name">{peerName}</span>
            <span className="cm-video-sub">{phase === 'outgoing' ? 'Calling…' : phase === 'connecting' ? 'Connecting…' : fmt(duration)}</span>
          </div>
          <video ref={localVideoRef} autoPlay playsInline muted className={`cm-local-preview ${cameraOff ? 'cm-local-preview-off' : ''}`} />
          {cameraOff && <div className="cm-camera-off-badge"><i className="fa-solid fa-video-slash" /></div>}
          <div className="cm-video-controls">
            <button className="cm-bar-btn" onClick={toggleMute} aria-label="Mute">
              <i className={`fa-solid ${muted ? 'fa-microphone-slash' : 'fa-microphone'}`} />
            </button>
            <button className="cm-bar-btn" onClick={toggleCamera} aria-label="Toggle camera">
              <i className={`fa-solid ${cameraOff ? 'fa-video-slash' : 'fa-video'}`} />
            </button>
            <button className="cm-bar-end" onClick={() => endCall(true)} aria-label="End call">
              <i className="fa-solid fa-phone-slash" />
            </button>
          </div>
        </div>
      )}

      {/* Audio-only bar — unchanged from before, just gated to callMode==='audio'. */}
      {callMode === 'audio' && (phase === 'outgoing' || phase === 'connecting' || phase === 'connected') && (
        <div className="cm-bar">
          <div className="cm-bar-icon"><i className={`fa-solid ${phase === 'outgoing' ? 'fa-phone-volume' : 'fa-phone'}`} /></div>
          <div className="cm-bar-body">
            <div className="cm-bar-name">{peerName}</div>
            <div className="cm-bar-status">{phase === 'outgoing' ? 'Calling…' : phase === 'connecting' ? 'Connecting…' : fmt(duration)}</div>
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

        .cm-toast {
          position: fixed; top: 14px; left: 50%; transform: translateX(-50%); z-index: 9999;
          background: #1B2130; color: #fff; border-radius: 999px; padding: 10px 18px;
          font-family: 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 12.5px; font-weight: 700; box-shadow: 0 10px 30px rgba(0,0,0,.25);
          display: flex; align-items: center; gap: 8px;
        }
        .cm-toast i { color: #f5a623; }

        /* Kept in the DOM (not display:none) at 1x1px off-screen so audio
           keeps decoding/playing for audio-only calls and camera-off video
           calls — only display:none can risk some browsers suspending it. */
        .cm-remote-video-hidden {
          position: fixed; width: 1px; height: 1px; opacity: 0; pointer-events: none; left: -9999px;
        }
        .cm-remote-video-visible {
          position: fixed; inset: 0; width: 100%; height: 100%; object-fit: cover;
          background: #10131c; z-index: 9998;
        }

        .cm-video-panel {
          position: fixed; inset: 0; z-index: 9999;
          font-family: 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .cm-video-status {
          position: fixed; top: 18px; left: 50%; transform: translateX(-50%); z-index: 10000;
          background: rgba(27,33,48,.75); color: #fff; border-radius: 999px; padding: 8px 16px;
          display: flex; align-items: center; gap: 10px; backdrop-filter: blur(4px);
        }
        .cm-video-name { font-size: 13px; font-weight: 800; }
        .cm-video-sub { font-size: 11px; color: rgba(255,255,255,.7); }

        .cm-local-preview {
          position: fixed; bottom: 96px; right: 18px; z-index: 10000;
          width: 120px; height: 160px; object-fit: cover; border-radius: 14px;
          transform: scaleX(-1); /* mirror, like a selfie camera */
          box-shadow: 0 10px 24px rgba(0,0,0,.35); background: #10131c;
        }
        .cm-local-preview-off { opacity: 0; }

        .cm-camera-off-badge {
          position: fixed; bottom: 96px; right: 18px; z-index: 10001;
          width: 120px; height: 160px; border-radius: 14px; background: #1B2130;
          display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,.5); font-size: 22px;
        }

        .cm-video-controls {
          position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 10000;
          display: flex; gap: 14px; background: rgba(27,33,48,.75); border-radius: 999px;
          padding: 10px; backdrop-filter: blur(4px);
        }
        .cm-video-controls .cm-bar-btn,
        .cm-video-controls .cm-bar-end {
          width: 44px; height: 44px; font-size: 16px;
        }
      `}</style>
    </>
  );
}