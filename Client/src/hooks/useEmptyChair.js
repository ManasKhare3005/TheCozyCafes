import { useState, useEffect, useRef, useCallback } from 'react';
import socketService from '../services/socket';
import { track } from '../lib/analytics';

export function useEmptyChair() {
  const [status, setStatus] = useState('idle'); // idle | queued | matched | ended
  const [messages, setMessages] = useState([]);
  const [partner, setPartner] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(300);
  const [endReason, setEndReason] = useState(null);
  const [revealedPartner, setRevealedPartner] = useState(null);
  const [hasRevealed, setHasRevealed] = useState(false);
  const [extendWaiting, setExtendWaiting] = useState(false);   // I asked for +5
  const [extendRequested, setExtendRequested] = useState(false); // partner asked for +5
  const timerRef = useRef(null);

  // Start countdown when matched
  useEffect(() => {
    if (status !== 'matched') {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [status]);

  // Socket event handlers
  useEffect(() => {
    const handleQueued = () => {
      setStatus('queued');
      track('emptychair_queued');
    };
    const handleCancelled = () => {
      setStatus('idle');
      track('emptychair_cancelled');
    };
    const handleMatched = ({ sessionId: sid, partner: p, duration }) => {
      setSessionId(sid);
      setPartner(p);
      setTimeRemaining(duration);
      setMessages([]);
      setRevealedPartner(null);
      setHasRevealed(false);
      setExtendWaiting(false);
      setExtendRequested(false);
      setEndReason(null);
      setStatus('matched');
      track('emptychair_matched', { duration });
    };
    const handleMessage = (msg) => {
      setMessages((prev) => [...prev, msg]);
    };
    const handleEnded = ({ reason }) => {
      setEndReason(reason);
      setStatus('ended');
      track('emptychair_ended', { reason: reason || null });
    };
    const handleRevealed = ({ userId, username }) => {
      setRevealedPartner({ userId, username });
    };
    const handleError = ({ message }) => {
      console.error('Empty chair error:', message);
    };
    const handleExtended = ({ duration }) => {
      setTimeRemaining(duration);
      setExtendWaiting(false);
      setExtendRequested(false);
      track('emptychair_extended');
    };
    const handleExtendRequested = () => setExtendRequested(true);
    const handleExtendWaiting = () => setExtendWaiting(true);

    socketService.onEmptyChairQueued(handleQueued);
    socketService.onEmptyChairCancelled(handleCancelled);
    socketService.onEmptyChairMatched(handleMatched);
    socketService.onEmptyChairMessage(handleMessage);
    socketService.onEmptyChairEnded(handleEnded);
    socketService.onEmptyChairRevealed(handleRevealed);
    socketService.onEmptyChairError(handleError);
    socketService.onEmptyChairExtended(handleExtended);
    socketService.onEmptyChairExtendRequested(handleExtendRequested);
    socketService.onEmptyChairExtendWaiting(handleExtendWaiting);

    return () => {
      socketService.offEmptyChairQueued(handleQueued);
      socketService.offEmptyChairCancelled(handleCancelled);
      socketService.offEmptyChairMatched(handleMatched);
      socketService.offEmptyChairMessage(handleMessage);
      socketService.offEmptyChairEnded(handleEnded);
      socketService.offEmptyChairRevealed(handleRevealed);
      socketService.offEmptyChairError(handleError);
      socketService.offEmptyChairExtended(handleExtended);
      socketService.offEmptyChairExtendRequested(handleExtendRequested);
      socketService.offEmptyChairExtendWaiting(handleExtendWaiting);
    };
  }, []);

  const joinQueue = useCallback(() => {
    track('emptychair_join_clicked');
    socketService.emptyChairJoin();
  }, []);

  const cancel = useCallback(() => {
    socketService.emptyChairCancel();
    setStatus('idle');
  }, []);

  const sendMessage = useCallback((text) => {
    if (!text.trim()) return;
    track('emptychair_message_sent');
    socketService.emptyChairSendMessage(text);
  }, []);

  const leave = useCallback(() => {
    socketService.emptyChairLeave();
  }, []);

  const reveal = useCallback(() => {
    socketService.emptyChairReveal();
    setHasRevealed(true);
    track('emptychair_reveal_clicked');
  }, []);

  const extend = useCallback(() => {
    socketService.emptyChairExtend();
    track('emptychair_extend_clicked');
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setMessages([]);
    setPartner(null);
    setSessionId(null);
    setTimeRemaining(300);
    setEndReason(null);
    setRevealedPartner(null);
    setHasRevealed(false);
    setExtendWaiting(false);
    setExtendRequested(false);
  }, []);

  return {
    status,
    messages,
    partner,
    sessionId,
    timeRemaining,
    endReason,
    revealedPartner,
    hasRevealed,
    extendWaiting,
    extendRequested,
    joinQueue,
    cancel,
    sendMessage,
    leave,
    reveal,
    extend,
    reset,
  };
}
