import { useState, useEffect, useCallback, useRef } from 'react';
import socketService from '../services/socket';
import { track } from '../lib/analytics';
import { playClink, playChime } from '../lib/sounds';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export function useChat(token, currentUser, roomId, roomIsAnonymous = false) {
  const [messages, setMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isIncognito, setIsIncognito] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(roomIsAnonymous);
  const [isAnonymousRoom, setIsAnonymousRoom] = useState(false);
  const [anonymousName, setAnonymousName] = useState(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [maxMembers, setMaxMembers] = useState(5);
  const [cafeHours, setCafeHours] = useState(null);
  const [isCafeClosed, setIsCafeClosed] = useState(false);
  const [userAmbience, setUserAmbience] = useState({}); // { userId: { emoji, name } }
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [whisperTarget, setWhisperTarget] = useState(null); // { id, username }
  const typingTimeoutRef = useRef(null);
  const currentRoomRef = useRef(null);
  const prevRoomIsAnonymousRef = useRef(roomIsAnonymous);
  const roomIdRef = useRef(roomId);
  const currentUserIdRef = useRef(currentUser?.id);
  roomIdRef.current = roomId;
  currentUserIdRef.current = currentUser?.id;

  // Sync anonymous status when room prop changes (only for non-anonymous rooms)
  useEffect(() => {
    // Skip syncing for room-level anonymous rooms — it's enforced by the server
    if (isAnonymousRoom) return;

    // Only notify socket if the status CHANGED (not on initial load)
    // and we're connected to a room
    if (isConnected && roomId && currentRoomRef.current === roomId) {
      if (prevRoomIsAnonymousRef.current !== roomIsAnonymous) {
        socketService.setAnonymous(roomIsAnonymous);
      }
    }

    setIsAnonymous(roomIsAnonymous);
    prevRoomIsAnonymousRef.current = roomIsAnonymous;
  }, [roomIsAnonymous, roomId, isConnected, isAnonymousRoom]);

  // Fetch message history when room changes
  useEffect(() => {
    if (!roomId) {
      setMessages([]);
      setIsLoadingHistory(false);
      return;
    }

    const fetchMessages = async () => {
      setIsLoadingHistory(true);
      try {
        const res = await fetch(`${API_URL}/messages/room/${roomId}?limit=50`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages.map((msg) => ({
            id: msg.id,
            text: msg.text,
            sender: msg.sender,
            timestamp: msg.createdAt,
            isEphemeral: msg.isEphemeral,
            isEdited: msg.isEdited || false,
            mediaUrl: msg.mediaUrl,
            mediaType: msg.mediaType,
            mediaName: msg.mediaName,
            replyTo: msg.replyTo || null,
            threadCount: msg.threadCount || 0,
          })));
        }
      } catch (error) {
        console.error('Failed to fetch messages:', error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    fetchMessages();
  }, [token, roomId]);

  // Socket connection and event handling
  useEffect(() => {
    const socket = socketService.connect(token);
    
    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    // If already connected, set state immediately
    if (socket.connected) {
      setIsConnected(true);
    }

    // Room joined - receive online users and anonymous status
    const handleRoomJoined = ({ roomId: joinedRoomId, onlineUsers: users, isAnonymous: anon, anonymousName: anonName, isAnonymousRoom: roomAnon, maxMembers: roomMax, cafeHoursEnabled, cafeHoursStart, cafeHoursEnd, cafeHoursTimezone, pinnedMessages: pins }) => {
      if (joinedRoomId === roomIdRef.current) {
        setOnlineUsers(users);
        if (anonName) {
          setAnonymousName(anonName);
        }
        if (roomAnon !== undefined) {
          setIsAnonymousRoom(roomAnon);
        }
        if (anon !== undefined) {
          setIsAnonymous(anon);
        }
        if (roomMax !== undefined) {
          setMaxMembers(roomMax);
        }
        if (cafeHoursEnabled) {
          setCafeHours({ start: cafeHoursStart, end: cafeHoursEnd, timezone: cafeHoursTimezone });
        } else {
          setCafeHours(null);
        }
        setPinnedMessages(pins || []);
      }
    };

    // Room users updated (joins, leaves, anonymous toggles)
    const handleRoomUsersUpdated = ({ onlineUsers: users }) => {
      setOnlineUsers((prev) => {
        // Door chime when the room gains a person
        if (prev.length > 0 && users.length > prev.length) playChime();
        return users;
      });
    };

    // Message handlers
    const handleMessage = (message) => {
      setMessages((prev) => [...prev, message]);
      const isOwn = message.realSenderId && message.realSenderId === currentUserIdRef.current;
      if (!isOwn && message.type !== 'system') playClink();
      if (isOwn) {
        track('message_sent', {
          room_id: roomIdRef.current,
          has_text: Boolean(message.text?.trim()),
          has_media: Boolean(message.mediaUrl),
          media_type: message.mediaType || null,
          is_ephemeral: Boolean(message.isEphemeral),
          is_anonymous: Boolean(message.isAnonymous),
        });
      }
    };

    const handleUserLeft = ({ user, onlineCount, wasKicked, reason }) => {
      let text;
      if (wasKicked) {
        text = `${user.username} was kicked from the room`;
      } else if (reason) {
        text = `${user.username} left the room — "${reason}"`;
      } else {
        text = `${user.username} left the room`;
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `system-${Date.now()}`,
          type: 'system',
          text,
          timestamp: new Date().toISOString(),
        },
      ]);
      setOnlineUsers((prev) => prev.filter((u) => u.id !== user.id));
      setTypingUsers((prev) => prev.filter((u) => u.id !== user.id));
    };

    const handleUserTyping = ({ userId, username, isTyping }) => {
      setTypingUsers((prev) => {
        if (isTyping) {
          if (prev.find((u) => u.id === userId)) return prev;
          return [...prev, { id: userId, username }];
        }
        return prev.filter((u) => u.id !== userId);
      });
    };

    const handleIncognitoUpdated = ({ isIncognito: incognito }) => {
      setIsIncognito(incognito);
    };

    const handleAnonymousUpdated = ({ isAnonymous: anon, anonymousName: anonName }) => {
      setIsAnonymous(anon);
      setAnonymousName(anonName || null);
    };

    const handleKickVoteUpdated = (data) => {
      if (data.type === 'started') {
        setMessages((prev) => [
          ...prev,
          {
            id: `system-${Date.now()}`,
            type: 'system',
            text: `⚠️ A vote to kick ${data.vote.target?.username || 'a user'} has started`,
            timestamp: new Date().toISOString(),
          },
        ]);
      } else if (data.type === 'resolved') {
        const statusMsg = data.vote.status === 'passed' 
          ? 'passed - user will be removed'
          : data.vote.isTied 
            ? 'tied - user stays'
            : 'failed - user stays';
        setMessages((prev) => [
          ...prev,
          {
            id: `system-${Date.now()}`,
            type: 'system',
            text: `Vote kick ${statusMsg}`,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    };

    const handleIdentityRevealed = ({ userId, username }) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `system-${Date.now()}`,
          type: 'system',
          text: `🎭 ${username}'s identity has been revealed for a kick vote`,
          timestamp: new Date().toISOString(),
        },
      ]);
    };

    const handleMessageEdited = ({ messageId, text, isEdited }) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, text, isEdited } : msg))
      );
    };

    const handleMessageDeleted = ({ messageId }) => {
      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
    };

    const handleReactionUpdated = ({ messageId, reactions }) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, reactions } : msg))
      );
    };

    const handleCafeClosed = () => {
      setIsCafeClosed(true);
    };

    const handlePinnedUpdated = ({ pinned }) => {
      setPinnedMessages(pinned || []);
    };

    const handleWhisperReceived = (whisper) => {
      setMessages((prev) => [...prev, whisper]);
    };

    const handleThreadReply = ({ parentId, message, threadCount }) => {
      // Update thread count on the parent message in main feed
      setMessages((prev) =>
        prev.map((msg) => (msg.id === parentId ? { ...msg, threadCount } : msg))
      );
      if (message?.realSenderId && message.realSenderId === currentUserIdRef.current) {
        track('thread_reply_sent', {
          room_id: roomIdRef.current,
          parent_id: parentId,
          has_text: Boolean(message.text?.trim()),
          has_media: Boolean(message.mediaUrl),
          media_type: message.mediaType || null,
        });
      }
    };

    const handleAmbienceUpdated = ({ userId, emoji, name, trackId }) => {
      setUserAmbience((prev) => {
        if (!trackId) {
          const next = { ...prev };
          delete next[userId];
          return next;
        }
        return { ...prev, [userId]: { emoji, name } };
      });
    };

    // Subscribe to events
    socketService.onMessageEdited(handleMessageEdited);
    socketService.onMessageDeleted(handleMessageDeleted);
    socketService.onThreadReply(handleThreadReply);
    socketService.onPinnedUpdated(handlePinnedUpdated);
    socketService.onWhisperReceived(handleWhisperReceived);
    socketService.onAmbienceUpdated(handleAmbienceUpdated);
    socketService.onReactionUpdated(handleReactionUpdated);
    socketService.onCafeClosed(handleCafeClosed);
    socketService.onRoomJoined(handleRoomJoined);
    socketService.onRoomUsersUpdated(handleRoomUsersUpdated);
    socketService.onMessage(handleMessage);
    socketService.onUserLeft(handleUserLeft);
    socketService.onUserTyping(handleUserTyping);
    socketService.onIncognitoUpdated(handleIncognitoUpdated);
    socketService.onAnonymousUpdated(handleAnonymousUpdated);
    socketService.onKickVoteUpdated(handleKickVoteUpdated);
    socketService.onIdentityRevealed(handleIdentityRevealed);

    // Cleanup
    return () => {
      socketService.offMessageEdited(handleMessageEdited);
      socketService.offMessageDeleted(handleMessageDeleted);
      socketService.offThreadReply(handleThreadReply);
      socketService.offRoomJoined(handleRoomJoined);
      socketService.offRoomUsersUpdated(handleRoomUsersUpdated);
      socketService.offMessage(handleMessage);
      socketService.offUserLeft(handleUserLeft);
      socketService.offUserTyping(handleUserTyping);
      socketService.offIncognitoUpdated(handleIncognitoUpdated);
      socketService.offAnonymousUpdated(handleAnonymousUpdated);
      socketService.offKickVoteUpdated(handleKickVoteUpdated);
      socketService.offIdentityRevealed(handleIdentityRevealed);
      socketService.offPinnedUpdated(handlePinnedUpdated);
      socketService.offWhisperReceived(handleWhisperReceived);
      socketService.offAmbienceUpdated(handleAmbienceUpdated);
      socketService.offReactionUpdated(handleReactionUpdated);
      socketService.offCafeClosed(handleCafeClosed);
    };
  }, [token]);

  // Handle room changes
  useEffect(() => {
    if (currentRoomRef.current !== roomId) {
      // Reset state for new room
      setMessages([]);
      setOnlineUsers([]);
      setTypingUsers([]);
      setAnonymousName(null);
      setIsAnonymousRoom(false);
      setCafeHours(null);
      setIsCafeClosed(false);
      setUserAmbience({});
      setPinnedMessages([]);
      setWhisperTarget(null);
      currentRoomRef.current = null; // Mark as not-yet-joined
    }

    // Join room when connected and not yet joined
    if (isConnected && roomId && currentRoomRef.current !== roomId) {
      socketService.joinRoom(roomId);
      currentRoomRef.current = roomId;
    }
  }, [roomId, isConnected]);

  // Periodically check cafe hours client-side so the UI updates in real time
  useEffect(() => {
    if (!cafeHours) {
      setIsCafeClosed(false);
      return;
    }

    const checkCafeOpen = () => {
      const { start, end, timezone } = cafeHours;
      const tz = timezone || 'UTC';
      try {
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        const parts = formatter.formatToParts(now);
        let h = parts.find(p => p.type === 'hour')?.value || '00';
        // en-US with hour12:false returns "24" at midnight instead of "00"
        if (h === '24') h = '00';
        const m = parts.find(p => p.type === 'minute')?.value || '00';
        const currentTime = `${h}:${m}`;

        let isOpen;
        if (start > end) {
          // Overnight range
          isOpen = currentTime >= start || currentTime < end;
        } else {
          isOpen = currentTime >= start && currentTime < end;
        }
        setIsCafeClosed(!isOpen);
      } catch {
        setIsCafeClosed(false);
      }
    };

    checkCafeOpen();
    const interval = setInterval(checkCafeOpen, 30000); // check every 30s
    return () => clearInterval(interval);
  }, [cafeHours]);

  const sendWhisper = useCallback((text) => {
    if (whisperTarget && text.trim()) {
      socketService.sendWhisper(whisperTarget.id, text);
    }
  }, [whisperTarget]);

  const pinMessage = useCallback((messageId) => {
    socketService.pinMessage(messageId);
  }, []);

  const toggleReaction = useCallback((messageId, emoji) => {
    socketService.toggleReaction(messageId, emoji);
  }, []);

  const editMessage = useCallback((messageId, text) => {
    if (messageId && text?.trim()) {
      socketService.editMessage(messageId, text);
    }
  }, []);

  const deleteMessage = useCallback((messageId) => {
    if (messageId) {
      socketService.deleteMessage(messageId);
    }
  }, []);

  const sendMessage = useCallback((text, media, replyTo) => {
    if (text.trim() || media) {
      socketService.sendMessage(text, media, replyTo);
    }
  }, []);

  const setTyping = useCallback((isTyping) => {
    socketService.setTyping(isTyping);
    
    // Auto-clear typing after 2 seconds
    if (isTyping) {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        socketService.setTyping(false);
      }, 2000);
    }
  }, []);

  const toggleIncognito = useCallback(() => {
    socketService.setIncognito(!isIncognito);
  }, [isIncognito]);

  return {
    messages,
    onlineUsers,
    typingUsers,
    isAnonymousRoom,
    isConnected,
    isIncognito,
    isAnonymous,
    anonymousName,
    isLoadingHistory,
    maxMembers,
    cafeHours,
    isCafeClosed,
    userAmbience,
    pinnedMessages,
    editMessage,
    deleteMessage,
    pinMessage,
    whisperTarget,
    setWhisperTarget,
    sendWhisper,
    toggleReaction,
    sendMessage,
    setTyping,
    toggleIncognito,
  };
}
