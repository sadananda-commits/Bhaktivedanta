import { useState, useEffect, useRef, useCallback } from 'react';
import { usePresence } from '../lib/PresenceContext';

const ICE_SERVERS = [
  { urls: 'stun:stun.relay.metered.ca:80' },
  {
    urls: 'turn:global.relay.metered.ca:80',
    username: '7ef80766d85666a9be534171',
    credential: 'r+7EwMBQJg1wkZB0',
  },
  {
    urls: 'turn:global.relay.metered.ca:80?transport=tcp',
    username: '7ef80766d85666a9be534171',
    credential: 'r+7EwMBQJg1wkZB0',
  },
  {
    urls: 'turn:global.relay.metered.ca:443',
    username: '7ef80766d85666a9be534171',
    credential: 'r+7EwMBQJg1wkZB0',
  },
  {
    urls: 'turns:global.relay.metered.ca:443?transport=tcp',
    username: '7ef80766d85666a9be534171',
    credential: 'r+7EwMBQJg1wkZB0',
  },
];

export default function CallManager({ profile, callRequest, onCallRequestHandled }) {
  const { updateOnlineUsers } = usePresence();
  
  const [phase, setPhase] = useState('idle'); // idle | outgoing | incoming | connecting | connected
  const [callInfo, setCallInfo] = useState(null); // { peerId, peerName, callId, callType }
  const [duration, setDuration] = useState(0);

  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  const timersRef = useRef({});
  const bufferedCandidatesRef = useRef([]);

  // ─── WebSocket Connection ───────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.id) return;

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = process.env.NEXT_PUBLIC_WS_URL || `${wsProtocol}//${window.location.host}/api/ws/calls`;

    console.log('[CallManager] WebSocket URL:', wsHost);
    const ws = new WebSocket(wsHost);

    ws.onopen = () => {
      console.log('[CallManager] WebSocket connected');
      // Send name with register message
      ws.send(JSON.stringify({
        type: 'register',
        payload: { 
          studentId: profile.id, 
          studentName: profile.name,  // ← ADDED student name
          deviceId: `${profile.id}-${Date.now()}` 
        }
      }));
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      handleMessage(msg, ws);
    };

    ws.onerror = () => console.error('[CallManager] WebSocket error');
    ws.onclose = () => console.log('[CallManager] WebSocket disconnected');

    wsRef.current = ws;

    return () => {
      if (ws.readyState === 1) ws.close();
    };
  }, [profile?.id, profile?.name]);

  function handleMessage(msg, ws) {
    const { type } = msg;

    if (type === 'registered') {
      console.log('[CallManager] Registered:', profile.id);
    } 
    else if (type === 'presence-update') {
      if (msg.online) updateOnlineUsers(msg.online);
    } 
    else if (type === 'incoming-call') {
      const { callId, callerId, callerName, offer, callType } = msg.payload;
      console.log('[CallManager] Incoming', callType || 'audio', 'call from:', callerName);
      setPhase('incoming');
      setCallInfo({ peerId: callerId, peerName: callerName, callId, offer, callType: callType || 'audio' });
    } 
    else if (type === 'answer') {
      console.log('[CallManager] Received answer');
      const { answer } = msg.payload;
      handleAnswer(answer);
    } 
    else if (type === 'candidate') {
      console.log('[CallManager] Received candidate');
      const { candidate } = msg.payload;
      handleCandidate(candidate);
    } 
    else if (type === 'call-ended') {
      endCall();
    }
  }

  // ─── Call Functions ──────────────────────────────────────────────────────
  const createPC = useCallback((peerId) => {
    console.log('[CallManager] Creating peer connection');
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        console.log('[CallManager] 🧊 Generated ICE candidate');
        if (wsRef.current && wsRef.current.readyState === 1) {
          wsRef.current.send(JSON.stringify({
            type: 'candidate',
            payload: { candidate: e.candidate, from: profile.id }
          }));
        } else {
          console.error('[CallManager] ❌ WebSocket not ready to send candidate');
        }
      } else {
        console.log('[CallManager] ✅ ICE gathering complete');
      }
    };

    pc.ontrack = (e) => {
      console.log('[CallManager] Track received:', e.track.kind);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = e.streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[CallManager] Connection state:', pc.connectionState);
      console.log('[CallManager] ICE connection state:', pc.iceConnectionState);
      if (pc.connectionState === 'connected') {
        clearTimeout(timersRef.current.media);
        setPhase('connected');
        startDuration();
      } else if (pc.connectionState === 'failed') {
        console.error('[CallManager] ❌ Connection failed');
        console.error('[CallManager] ICE gathering state:', pc.iceGatheringState);
        endCall();
      }
    };

    pcRef.current = pc;
    return pc;
  }, [profile.id]);

  const startCall = useCallback(async (calleeId, calleeName, mode = 'audio', additionalCallees = []) => {
    if (phase !== 'idle') return;

    try {
      console.log(`[CallManager] Starting ${mode} call to:`, calleeName);
      
      // Request media based on mode
      const constraints = { 
        audio: true, 
        video: mode === 'video' ? {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        } : false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;

      // Display local video if in video mode
      if (mode === 'video' && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const pc = createPC(calleeId);
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const callId = `${profile.id}-${Date.now()}`;
      
      if (!wsRef.current || wsRef.current.readyState !== 1) {
        console.error('[CallManager] ❌ WebSocket not ready to send offer');
        return;
      }
      
      wsRef.current.send(JSON.stringify({
        type: 'offer',
        payload: { 
          callId, 
          offer, 
          calleeId, 
          callType: mode,  // IMPORTANT: include call type
          callerId: profile.id, 
          callerName: profile.name,
          additionalCallees: additionalCallees.length > 0 ? additionalCallees : undefined
        }
      }));

      console.log('[CallManager] ✅ Offer sent to server');
      setPhase('outgoing');
      setCallInfo({ peerId: calleeId, peerName: calleeName, callId, callType: mode });

      // Timeout
      timersRef.current.media = setTimeout(() => {
        console.error('[CallManager] Call timeout');
        endCall();
      }, 30000);

    } catch (err) {
      console.error('[CallManager] Error:', err.message);
    }
  }, [phase, profile.id, profile.name, createPC]);

  const acceptCall = useCallback(async () => {
    if (phase !== 'incoming' || !callInfo) return;

    try {
      console.log('[CallManager] Accepting', callInfo.callType, 'call');
      
      // Request media based on callType
      const constraints = { 
        audio: true, 
        video: callInfo.callType === 'video' ? {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        } : false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;

      // Display local video if in video mode
      if (callInfo.callType === 'video' && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const pc = createPC(callInfo.peerId);
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(callInfo.offer));

      flushBufferedCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (!wsRef.current || wsRef.current.readyState !== 1) {
        console.error('[CallManager] ❌ WebSocket not ready to send answer');
        return;
      }

      wsRef.current.send(JSON.stringify({
        type: 'answer',
        payload: { answer, callId: callInfo.callId, callerId: callInfo.peerId }
      }));

      console.log('[CallManager] ✅ Answer sent to server');
      setPhase('connecting');

      timersRef.current.media = setTimeout(() => {
        console.error('[CallManager] Connection timeout');
        endCall();
      }, 30000);

    } catch (err) {
      console.error('[CallManager] Error:', err.message);
      declineCall();
    }
  }, [phase, callInfo, createPC]);

  function handleAnswer(answer) {
    const pc = pcRef.current;
    console.log('[CallManager] handleAnswer - PC state:', pc?.signalingState);
    if (pc && pc.signalingState === 'have-local-offer') {
      pc.setRemoteDescription(new RTCSessionDescription(answer))
        .then(() => {
          console.log('[CallManager] ✅ Answer set successfully');
          flushBufferedCandidates();
          setPhase('connecting');
        })
        .catch(e => console.error('[CallManager] ❌ Error setting answer:', e.message));
    } else {
      console.error('[CallManager] ❌ Cannot set answer - PC state:', pc?.signalingState);
    }
  }

  function handleCandidate(candidate) {
    const pc = pcRef.current;
    if (pc) {
      pc.addIceCandidate(new RTCIceCandidate(candidate))
        .then(() => console.log('[CallManager] ✅ Candidate added'))
        .catch(e => console.error('[CallManager] ❌ Error adding candidate:', e.message));
    } else {
      console.log('[CallManager] 📦 Buffering candidate (PC not created yet)');
      bufferedCandidatesRef.current.push(candidate);
    }
  }

  function flushBufferedCandidates() {
    const pc = pcRef.current;
    if (pc && bufferedCandidatesRef.current.length > 0) {
      console.log(`[CallManager] 🔄 Flushing ${bufferedCandidatesRef.current.length} buffered candidates`);
      bufferedCandidatesRef.current.forEach(candidate => {
        pc.addIceCandidate(new RTCIceCandidate(candidate))
          .then(() => console.log('[CallManager] ✅ Buffered candidate added'))
          .catch(e => console.error('[CallManager] ❌ Error adding buffered candidate:', e.message));
      });
      bufferedCandidatesRef.current = [];
    }
  }

  const declineCall = useCallback(() => {
    if (callInfo?.callId && wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({
        type: 'decline',
        payload: { callId: callInfo.callId }
      }));
    }
    endCall();
  }, [callInfo?.callId]);

  const endCall = useCallback(() => {
    if (callInfo?.callId && wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({
        type: 'end',
        payload: { callId: callInfo.callId }
      }));
    }

    localStreamRef.current?.getTracks().forEach(t => t.stop());
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    pcRef.current?.close();
    Object.values(timersRef.current).forEach(clearTimeout);

    setPhase('idle');
    setCallInfo(null);
    setDuration(0);
  }, [callInfo?.callId]);

  const startDuration = () => {
    let secs = 0;
    timersRef.current.duration = setInterval(() => {
      secs++;
      setDuration(secs);
    }, 1000);
  };

  // Handle callRequest from parent (GroupChat calling)
  useEffect(() => {
    if (callRequest?.calleeId) {
      startCall(
        callRequest.calleeId, 
        callRequest.calleeName,
        callRequest.mode || 'audio',
        callRequest.additionalCallees || []
      );
      onCallRequestHandled?.();
    }
  }, [callRequest, startCall, onCallRequestHandled]);

  const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <>
      {/* Video elements for video calls */}
      <video ref={remoteVideoRef} autoPlay playsInline style={{ display: 'none' }} />
      <video ref={localVideoRef} autoPlay playsInline muted style={{ display: 'none' }} />

      {/* Incoming call modal */}
      {phase === 'incoming' && callInfo && (
        <div style={styles.backdrop}>
          <div style={styles.modal}>
            <div style={styles.avatar}>📞</div>
            <div style={styles.name}>{callInfo.peerName}</div>
            <div style={styles.status}>
              Incoming {callInfo.callType === 'video' ? '📹 video' : '🎤 audio'} call...
            </div>
            <div style={styles.buttons}>
              <button onClick={declineCall} style={{ ...styles.btn, ...styles.decline }}>
                ✕ Decline
              </button>
              <button onClick={acceptCall} style={{ ...styles.btn, ...styles.accept }}>
                ✓ Accept
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video call UI - Full screen during connected */}
      {(phase === 'connecting' || phase === 'connected') && callInfo?.callType === 'video' && (
        <div style={styles.videoCallContainer}>
          {/* Remote video (main, larger) */}
          <video 
            ref={remoteVideoRef} 
            autoPlay 
            playsInline
            style={styles.remoteVideo}
          />
          
          {/* Local video (small PIP in corner) */}
          <video 
            ref={localVideoRef} 
            autoPlay 
            playsInline 
            muted
            style={styles.localVideo}
          />

          {/* Call info and end button */}
          <div style={styles.videoCallBar}>
            <div style={styles.videoCallInfo}>
              <span>{callInfo.peerName}</span>
              <span style={styles.duration}>{fmt(duration)}</span>
            </div>
            <button onClick={() => endCall()} style={styles.endVideoBtn}>
              📞 End Call
            </button>
          </div>
        </div>
      )}

      {/* Audio call bar - Only for audio calls */}
      {(phase === 'outgoing' || phase === 'connecting' || phase === 'connected') && callInfo && callInfo.callType !== 'video' && (
        <div style={styles.bar}>
          <span>{callInfo.peerName}</span>
          <span>{phase === 'outgoing' ? 'Calling...' : phase === 'connecting' ? 'Connecting...' : fmt(duration)}</span>
          <button onClick={() => endCall()} style={styles.endBtn}>End</button>
        </div>
      )}
    </>
  );
}

const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: {
    background: '#1B2130',
    color: '#fff',
    borderRadius: '20px',
    padding: '40px',
    textAlign: 'center',
    minWidth: '300px',
  },
  avatar: {
    fontSize: '60px',
    marginBottom: '20px',
  },
  name: {
    fontSize: '20px',
    fontWeight: 'bold',
    marginBottom: '10px',
  },
  status: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: '30px',
  },
  buttons: {
    display: 'flex',
    gap: '20px',
    justifyContent: 'center',
  },
  btn: {
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    border: 'none',
    color: '#fff',
    fontSize: '14px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  decline: {
    background: '#ef4444',
  },
  accept: {
    background: '#22c55e',
  },
  bar: {
    position: 'fixed',
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#1B2130',
    color: '#fff',
    padding: '15px 25px',
    borderRadius: '50px',
    zIndex: 9999,
    display: 'flex',
    gap: '20px',
    alignItems: 'center',
    fontSize: '14px',
    fontFamily: 'Arial, sans-serif',
  },
  endBtn: {
    background: '#ef4444',
    color: '#fff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '20px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  videoCallContainer: {
    position: 'fixed',
    inset: 0,
    background: '#000',
    zIndex: 9998,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  remoteVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    backgroundColor: '#000',
  },
  localVideo: {
    position: 'absolute',
    bottom: '100px',
    right: '20px',
    width: '150px',
    height: '150px',
    borderRadius: '10px',
    border: '3px solid #fff',
    objectFit: 'cover',
    backgroundColor: '#1B2130',
  },
  videoCallBar: {
    position: 'absolute',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(27, 33, 48, 0.9)',
    color: '#fff',
    padding: '15px 25px',
    borderRadius: '50px',
    display: 'flex',
    gap: '30px',
    alignItems: 'center',
    fontSize: '14px',
    fontFamily: 'Arial, sans-serif',
  },
  videoCallInfo: {
    display: 'flex',
    gap: '20px',
    alignItems: 'center',
  },
  duration: {
    fontWeight: 'bold',
    color: '#22c55e',
    minWidth: '60px',
    textAlign: 'right',
  },
  endVideoBtn: {
    background: '#ef4444',
    color: '#fff',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '20px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
  },
};
