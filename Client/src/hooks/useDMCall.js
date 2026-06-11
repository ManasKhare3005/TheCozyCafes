import { useState, useEffect, useCallback, useRef } from 'react';
import socketService from '../services/socket';
import { ICE_CONFIG } from '../lib/iceConfig';

export function useDMCall(friendId) {
  // idle | calling | ringing | active
  const [callState, setCallState] = useState('idle');
  const [callType, setCallType] = useState(null); // 'voice' | 'video'
  const [incomingCall, setIncomingCall] = useState(null); // { callerId, callerName, callType }
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const pcRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const durationIntervalRef = useRef(null);
  const friendIdRef = useRef(friendId);
  friendIdRef.current = friendId;

  // Clean up everything
  const cleanup = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    pendingCandidatesRef.current = [];

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    remoteStreamRef.current = null;

    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  const startDurationTimer = useCallback(() => {
    setCallDuration(0);
    durationIntervalRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
  }, []);

  // Get media stream
  const getMedia = useCallback(async (type) => {
    const constraints = {
      audio: true,
      video: type === 'video' ? { width: 640, height: 480 } : false,
    };
    return navigator.mediaDevices.getUserMedia(constraints);
  }, []);

  // Create peer connection
  const createPC = useCallback((targetUserId) => {
    const pc = new RTCPeerConnection(ICE_CONFIG);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    pc.ontrack = (event) => {
      remoteStreamRef.current = event.streams[0];
      // Attach to video or audio element
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketService.dmCallSignal(targetUserId, 'ice-candidate', event.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        startDurationTimer();
      }
    };

    pcRef.current = pc;
    return pc;
  }, [startDurationTimer]);

  const flushPendingCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (pc && pendingCandidatesRef.current.length > 0) {
      for (const candidate of pendingCandidatesRef.current) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.warn('Failed to add buffered ICE candidate:', err);
        }
      }
      pendingCandidatesRef.current = [];
    }
  }, []);

  // Initiate a call
  const startCall = useCallback(async (type = 'voice') => {
    if (!friendIdRef.current) return;

    try {
      const stream = await getMedia(type);
      localStreamRef.current = stream;
      if (localVideoRef.current && type === 'video') {
        localVideoRef.current.srcObject = stream;
      }

      setCallType(type);
      setCallState('calling');
      setIsVideoOn(type === 'video');
      setIsMuted(false);

      socketService.dmCallInitiate(friendIdRef.current, type);
    } catch (err) {
      console.error('Failed to get media:', err);
      alert('Could not access microphone/camera. Please check permissions.');
    }
  }, [getMedia]);

  // Accept an incoming call
  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;

    try {
      const stream = await getMedia(incomingCall.callType);
      localStreamRef.current = stream;
      if (localVideoRef.current && incomingCall.callType === 'video') {
        localVideoRef.current.srcObject = stream;
      }

      setCallType(incomingCall.callType);
      setCallState('active');
      setIsVideoOn(incomingCall.callType === 'video');
      setIsMuted(false);

      // Create PC and answer
      const pc = createPC(incomingCall.callerId);
      socketService.dmCallAccept(incomingCall.callerId);

      setIncomingCall(null);
    } catch (err) {
      console.error('Failed to accept call:', err);
      if (incomingCall) {
        socketService.dmCallReject(incomingCall.callerId);
      }
      setIncomingCall(null);
      cleanup();
    }
  }, [incomingCall, getMedia, createPC, cleanup]);

  // Reject an incoming call
  const rejectCall = useCallback(() => {
    if (incomingCall) {
      socketService.dmCallReject(incomingCall.callerId);
      setIncomingCall(null);
    }
  }, [incomingCall]);

  // End an active call
  const endCall = useCallback(() => {
    const targetId = friendIdRef.current || incomingCall?.callerId;
    if (targetId) {
      socketService.dmCallEnd(targetId);
    }
    cleanup();
    setCallState('idle');
    setCallType(null);
    setIncomingCall(null);
    setCallDuration(0);
  }, [cleanup, incomingCall]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getAudioTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setIsMuted(!track.enabled);
      }
    }
  }, []);

  // Toggle video
  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getVideoTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setIsVideoOn(track.enabled);
      }
    }
  }, []);

  // Socket event listeners
  useEffect(() => {
    const socket = socketService.socket;
    if (!socket) return;

    const handleIncoming = ({ callerId, callerName, callType: type }) => {
      // Only show incoming call if it's from the friend we're chatting with
      // or if we're in idle state
      if (callerId === friendIdRef.current || callState === 'idle') {
        setIncomingCall({ callerId, callerName, callType: type });
      }
    };

    const handleAccepted = async ({ acceptedBy }) => {
      if (callState !== 'calling') return;

      setCallState('active');

      // We initiated — create offer
      const pc = createPC(acceptedBy);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketService.dmCallSignal(acceptedBy, 'offer', offer);
      } catch (err) {
        console.error('Failed to create offer:', err);
        endCall();
      }
    };

    const handleRejected = () => {
      cleanup();
      setCallState('idle');
      setCallType(null);
    };

    const handleEnded = () => {
      cleanup();
      setCallState('idle');
      setCallType(null);
      setCallDuration(0);
    };

    const handleSignal = async ({ fromUserId, type, data }) => {
      try {
        if (type === 'offer') {
          let pc = pcRef.current;
          if (!pc) {
            pc = createPC(fromUserId);
          }
          await pc.setRemoteDescription(new RTCSessionDescription(data));
          await flushPendingCandidates();

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socketService.dmCallSignal(fromUserId, 'answer', answer);
        } else if (type === 'answer') {
          if (pcRef.current) {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(data));
            await flushPendingCandidates();
          }
        } else if (type === 'ice-candidate') {
          if (pcRef.current && pcRef.current.remoteDescription) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(data));
          } else {
            pendingCandidatesRef.current.push(data);
          }
        }
      } catch (err) {
        console.error('DM call signaling error:', err);
      }
    };

    socket.on('dm:call:incoming', handleIncoming);
    socket.on('dm:call:accepted', handleAccepted);
    socket.on('dm:call:rejected', handleRejected);
    socket.on('dm:call:ended', handleEnded);
    socket.on('dm:call:signal', handleSignal);

    return () => {
      socket.off('dm:call:incoming', handleIncoming);
      socket.off('dm:call:accepted', handleAccepted);
      socket.off('dm:call:rejected', handleRejected);
      socket.off('dm:call:ended', handleEnded);
      socket.off('dm:call:signal', handleSignal);
    };
  }, [callState, createPC, cleanup, endCall, flushPendingCandidates]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    callState,
    callType,
    incomingCall,
    isMuted,
    isVideoOn,
    callDuration,
    localVideoRef,
    remoteVideoRef,
    remoteAudioRef,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
  };
}
