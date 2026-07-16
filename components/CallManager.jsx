import { useState, useEffect, useRef, useCallback } from 'react';
import { usePresence } from '../lib/PresenceContext';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export default function CallManager({ profile, callRequest, onCallRequestHandled }) {
  const { updateOnlineUsers } = usePresence();
  
  const [phase, setPhase] = useState('idle'); // idle | outgoing | incoming | connecting | connected
  const [callInfo, setCallInfo] = useState(null); // { peerId, peerName }
  const [duration, setDuration] = useState(0);

  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const timersRef = useRef({});

  // ─── WebSocket Connection ───────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.id) return;

    const ws = new WebSocket(`ws://localhost:3000/api/ws/calls`);

    ws.onopen = () => {
      console.log('[CallManager] WebSocket connected');
      ws.send(JSON.stringify({
        type: 'register',
        payload: { studentId: profile.id, deviceId: `${profile.id}-${Date.now()}` }
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
  }, [profile?.id]);

  function handleMessage(msg, ws) {
    const { type } = msg;

    if (type === 'registered') {
      console.log('[CallManager] Registered:', profile.id);
    } 
    else if (type === 'presence-update') {
      if (msg.online) updateOnlineUsers(msg.online);
    } 
    else if (type === 'incoming-call') {
      const { callId, callerId, callerName, offer } = msg.payload;
      console.log('[CallManager] Incoming call from:', callerName);
      setPhase('incoming');
      setCallInfo({ peerId: callerId, peerName: callerName, callId, offer });
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

  const startCall = useCallback(async (calleeId, calleeName) => {
    if (phase !== 'idle') return;

    try {
      console.log('[CallManager] Starting call to:', calleeName);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

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
        payload: { callId, offer, calleeId, callerId: profile.id, callerName: profile.name }
      }));

      console.log('[CallManager] ✅ Offer sent to server');
      setPhase('outgoing');
      setCallInfo({ peerId: calleeId, peerName: calleeName, callId });

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
      console.log('[CallManager] Accepting call');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      const pc = createPC(callInfo.peerId);
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(callInfo.offer));

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
      console.error('[CallManager] ❌ No PC to add candidate');
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
      startCall(callRequest.calleeId, callRequest.calleeName);
      onCallRequestHandled?.();
    }
  }, [callRequest, startCall, onCallRequestHandled]);

  const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <>
      <audio ref={remoteVideoRef} autoPlay playsInline style={{ display: 'none' }} />

      {/* Incoming call modal */}
      {phase === 'incoming' && callInfo && (
        <div style={styles.backdrop}>
          <div style={styles.modal}>
            <div style={styles.avatar}>📞</div>
            <div style={styles.name}>{callInfo.peerName}</div>
            <div style={styles.status}>Incoming call...</div>
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

      {/* Call bar */}
      {(phase === 'outgoing' || phase === 'connecting' || phase === 'connected') && callInfo && (
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
};
