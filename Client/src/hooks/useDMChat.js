import { useState, useEffect, useCallback, useRef } from 'react';
import socketService from '../services/socket';
import { track } from '../lib/analytics';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function getConversationId(userId1, userId2) {
  return [userId1, userId2].sort().join('_');
}

export function useDMChat(token, currentUser, friendId) {
  const [messages, setMessages] = useState([]);
  const [typingUser, setTypingUser] = useState(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const typingTimeoutRef = useRef(null);
  const friendIdRef = useRef(friendId);
  const currentUserIdRef = useRef(currentUser?.id);
  friendIdRef.current = friendId;
  currentUserIdRef.current = currentUser?.id;

  const conversationId = friendId ? getConversationId(currentUser.id, friendId) : null;

  // Fetch DM history
  useEffect(() => {
    if (!friendId) {
      setMessages([]);
      setIsLoadingHistory(false);
      return;
    }

    const fetchHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const res = await fetch(`${API_URL}/friends/dm/${friendId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages.map((msg) => ({
            id: msg.id,
            text: msg.text,
            sender: msg.sender,
            timestamp: msg.createdAt,
            mediaUrl: msg.mediaUrl,
            mediaType: msg.mediaType,
            mediaName: msg.mediaName,
            replyTo: msg.replyTo || null,
          })));
        }
      } catch (error) {
        console.error('Failed to fetch DM history:', error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    setMessages([]);
    fetchHistory();
  }, [token, friendId]);

  // Listen for new DMs and typing
  useEffect(() => {
    if (!friendId || !conversationId) return;

    const handleDMReceived = (message) => {
      if (message.conversationId !== conversationId) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, {
          id: message.id,
          text: message.text,
          sender: message.sender,
          timestamp: message.timestamp,
          mediaUrl: message.mediaUrl,
          mediaType: message.mediaType,
          mediaName: message.mediaName,
          replyTo: message.replyTo || null,
        }];
      });
      // Mark as read if the message is from the friend
      if (message.sender.id === friendIdRef.current) {
        socketService.markDMRead(conversationId, friendIdRef.current);
      } else if (message.sender.id === currentUserIdRef.current) {
        track('dm_sent', {
          has_text: Boolean(message.text?.trim()),
          has_media: Boolean(message.mediaUrl),
          media_type: message.mediaType || null,
        });
      }
    };

    const handleDMTyping = ({ senderId, username, isTyping }) => {
      if (senderId !== friendIdRef.current) return;
      setTypingUser(isTyping ? { id: senderId, username } : null);
    };

    socketService.onDMReceived(handleDMReceived);
    socketService.onDMTyping(handleDMTyping);

    return () => {
      socketService.offDMReceived(handleDMReceived);
      socketService.offDMTyping(handleDMTyping);
    };
  }, [friendId, conversationId]);

  const sendMessage = useCallback((text, media, replyTo) => {
    if ((text.trim() || media) && friendIdRef.current) {
      socketService.sendDM(friendIdRef.current, text, media, replyTo);
    }
  }, []);

  const setTyping = useCallback((isTyping) => {
    if (!friendIdRef.current) return;
    socketService.setDMTyping(friendIdRef.current, isTyping);
    if (isTyping) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socketService.setDMTyping(friendIdRef.current, false);
      }, 2000);
    }
  }, []);

  return {
    messages,
    typingUser,
    isLoadingHistory,
    sendMessage,
    setTyping,
  };
}
