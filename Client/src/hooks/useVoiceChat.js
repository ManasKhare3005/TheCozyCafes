import { useState, useEffect, useCallback, useRef } from 'react';
import socketService from '../services/socket';
import { ICE_CONFIG } from '../lib/iceConfig';

export function useVoiceChat() {
  const [isInVoice, setIsInVoice] = useState(false);
  const [voiceUsers, setVoiceUsers] = useState([]);
  const [isMuted, setIsMuted] = useState(false);

  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map()); // socketId -> RTCPeerConnection
  const pendingCandidatesRef = useRef(new Map()); // socketId -> [ICECandidate]

  // Clean up a single peer
  const cleanupPeer = useCallback((socketId) => {
    const pc = peersRef.current.get(socketId);
    if (pc) {
      pc.close();
      peersRef.current.delete(socketId);
    }
    pendingCandidatesRef.current.delete(socketId);

    // Remove audio element
    const audio = document.getElementById(`voice-audio-${socketId}`);
    if (audio) audio.remove();
  }, []);

  // Clean up all peers and local stream
  const cleanupAll = useCallback(() => {
    peersRef.current.forEach((_, socketId) => cleanupPeer(socketId));
    peersRef.current.clear();
    pendingCandidatesRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
  }, [cleanupPeer]);

  // Create a peer connection for a remote user
  const createPeerConnection = useCallback((targetSocketId) => {
    const pc = new RTCPeerConnection(ICE_CONFIG);

    // Add local audio tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Handle incoming remote audio
    pc.ontrack = (event) => {
      let audio = document.getElementById(`voice-audio-${targetSocketId}`);
      if (!audio) {
        audio = document.createElement('audio');
        audio.id = `voice-audio-${targetSocketId}`;
        audio.autoplay = true;
        document.body.appendChild(audio);
      }
      audio.srcObject = event.streams[0];
    };

    // Send ICE candidates to the remote peer
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketService.voiceSignal(targetSocketId, 'ice-candidate', event.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        console.warn(`Peer ${targetSocketId} connection state: ${pc.connectionState}`);
      }
    };

    peersRef.current.set(targetSocketId, pc);
    return pc;
  }, []);

  // Flush any ICE candidates that arrived before remote description was set
  const flushPendingCandidates = useCallback(async (socketId) => {
    const pending = pendingCandidatesRef.current.get(socketId);
    const pc = peersRef.current.get(socketId);
    if (pending && pc) {
      for (const candidate of pending) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.warn('Failed to add buffered ICE candidate:', err);
        }
      }
      pendingCandidatesRef.current.delete(socketId);
    }
  }, []);

  // Join voice channel
  const joinVoice = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      socketService.joinVoice();
      setIsInVoice(true);
      setIsMuted(false);
    } catch (err) {
      console.error('Microphone access denied:', err);
      alert('Could not access microphone. Please check your browser permissions.');
    }
  }, []);

  // Leave voice channel
  const leaveVoice = useCallback(() => {
    cleanupAll();
    socketService.leaveVoice();
    setIsInVoice(false);
    setIsMuted(false);
  }, [cleanupAll]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getAudioTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        const muted = !track.enabled;
        setIsMuted(muted);
        socketService.voiceToggleMute(muted);
      }
    }
  }, []);

  // Socket event listeners
  useEffect(() => {
    const socket = socketService.socket;
    if (!socket) return;

    // We joined voice — existing users will send us offers
    const handleJoined = () => {
      // Nothing to do — we wait for offers from existing users
    };

    // A new user joined voice — we (as existing user) send them an offer
    const handleUserJoined = async (userInfo) => {
      if (!localStreamRef.current) return;

      const pc = createPeerConnection(userInfo.socketId);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketService.voiceSignal(userInfo.socketId, 'offer', offer);
      } catch (err) {
        console.error('Failed to create offer:', err);
      }
    };

    // A user left voice
    const handleUserLeft = ({ socketId }) => {
      cleanupPeer(socketId);
    };

    // WebRTC signaling
    const handleSignal = async ({ fromSocketId, type, data }) => {
      try {
        if (type === 'offer') {
          // Someone sent us an offer — create answer
          const pc = createPeerConnection(fromSocketId);
          await pc.setRemoteDescription(new RTCSessionDescription(data));
          await flushPendingCandidates(fromSocketId);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socketService.voiceSignal(fromSocketId, 'answer', answer);
        } else if (type === 'answer') {
          const pc = peersRef.current.get(fromSocketId);
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(data));
            await flushPendingCandidates(fromSocketId);
          }
        } else if (type === 'ice-candidate') {
          const pc = peersRef.current.get(fromSocketId);
          if (pc && pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(data));
          } else {
            // Buffer until remote description is set
            if (!pendingCandidatesRef.current.has(fromSocketId)) {
              pendingCandidatesRef.current.set(fromSocketId, []);
            }
            pendingCandidatesRef.current.get(fromSocketId).push(data);
          }
        }
      } catch (err) {
        console.error('Signaling error:', err);
      }
    };

    // Voice user list updates (for UI)
    const handleUsersUpdated = ({ users }) => {
      setVoiceUsers(users);
    };

    socket.on('voice:joined', handleJoined);
    socket.on('voice:user-joined', handleUserJoined);
    socket.on('voice:user-left', handleUserLeft);
    socket.on('voice:signal', handleSignal);
    socket.on('voice:users-updated', handleUsersUpdated);

    return () => {
      socket.off('voice:joined', handleJoined);
      socket.off('voice:user-joined', handleUserJoined);
      socket.off('voice:user-left', handleUserLeft);
      socket.off('voice:signal', handleSignal);
      socket.off('voice:users-updated', handleUsersUpdated);
    };
  }, [createPeerConnection, cleanupPeer, flushPendingCandidates]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        cleanupAll();
        socketService.leaveVoice();
      }
    };
  }, [cleanupAll]);

  return {
    isInVoice,
    voiceUsers,
    isMuted,
    joinVoice,
    leaveVoice,
    toggleMute,
  };
}
