import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import socketService from '../services/socket';
import ChatMessage from './ChatMessage';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function ThreadPanel({ parentMessage, roomOwnerId, onClose }) {
  const { user, token } = useAuth();
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const repliesEndRef = useRef(null);
  const inputRef = useRef(null);

  const fetchReplies = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/messages/${parentMessage.id}/thread`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setReplies(data.messages.map((msg) => ({
          id: msg.id,
          text: msg.text,
          sender: msg.sender,
          timestamp: msg.createdAt,
          mediaUrl: msg.mediaUrl,
          mediaType: msg.mediaType,
          mediaName: msg.mediaName,
          replyTo: msg.replyTo || null,
          reactions: msg.reactions || {},
        })));
      }
    } catch (err) {
      console.error('Failed to fetch thread:', err);
    } finally {
      setLoading(false);
    }
  }, [parentMessage.id, token]);

  useEffect(() => {
    fetchReplies();
  }, [fetchReplies]);

  // Listen for real-time thread replies
  useEffect(() => {
    const handleThreadReply = ({ parentId, message }) => {
      if (parentId === parentMessage.id) {
        setReplies((prev) => [...prev, message]);
      }
    };

    socketService.onThreadReply(handleThreadReply);
    return () => socketService.offThreadReply(handleThreadReply);
  }, [parentMessage.id]);

  // Listen for reaction updates on thread messages
  useEffect(() => {
    const handleReaction = ({ messageId, reactions }) => {
      setReplies((prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, reactions } : msg))
      );
    };

    socketService.onReactionUpdated(handleReaction);
    return () => socketService.offReactionUpdated(handleReaction);
  }, []);

  // Auto-scroll on new replies
  useEffect(() => {
    repliesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [replies]);

  // Focus input on open
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = (e) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    socketService.sendThreadReply(parentMessage.id, text);
    setText('');
    setSending(false);
  };

  const handleToggleReaction = (messageId, emoji) => {
    socketService.toggleReaction(messageId, emoji);
  };

  return (
    <div className="fixed inset-0 bg-cafe-900/50 modal-backdrop flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md h-[90vh] sm:h-[80vh] flex flex-col shadow-warm-lg border border-cafe-200/50">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-cafe-200/50">
          <div className="flex items-center gap-2">
            <span className="text-xl">🧵</span>
            <div>
              <h3 className="font-serif font-bold text-cafe-900 text-lg">Thread</h3>
              <p className="text-[11px] text-cafe-400">{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-cafe-400 hover:text-cafe-700 transition-colors p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Parent message */}
        <div className="px-4 py-3 border-b border-cafe-200/50 bg-cafe-50/50">
          <div className="flex items-start gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cafe-300 to-cafe-600 flex items-center justify-center text-white font-serif font-bold text-[10px] shrink-0">
              {(parentMessage.sender?.username || '?').slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-cafe-700">{parentMessage.sender?.username || 'Unknown'}</span>
                <span className="text-[10px] text-cafe-400">
                  {new Date(parentMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-sm text-cafe-800 mt-0.5">
                {parentMessage.text}
              </p>
              {parentMessage.mediaUrl && (
                <div className="mt-1">
                  {parentMessage.mediaType === 'image' ? (
                    <img src={parentMessage.mediaUrl} alt="" className="max-h-32 rounded-lg" />
                  ) : (
                    <span className="text-xs text-cafe-400">[{parentMessage.mediaType}]</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Thread replies */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {loading ? (
            <p className="text-center text-cafe-400 py-8">Loading thread...</p>
          ) : replies.length === 0 ? (
            <div className="text-center py-8">
              <span className="text-3xl block mb-2">🧵</span>
              <p className="text-cafe-400 text-sm">No replies yet. Start the thread!</p>
            </div>
          ) : (
            replies.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                isOwnMessage={msg.sender?.id === user.id || msg.realSenderId === user.id}
                currentUserId={user.id}
                isAdmin={roomOwnerId === user.id}
                isPinned={false}
                onReply={() => {}}
                onToggleReaction={handleToggleReaction}
                onPin={() => {}}
                onWhisper={() => {}}
                compact
              />
            ))
          )}
          <div ref={repliesEndRef} />
        </div>

        {/* Reply input */}
        <form onSubmit={handleSend} className="border-t border-cafe-200/50 p-3 flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Reply in thread..."
            maxLength={5000}
            className="flex-1 bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-2.5
                       border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 text-sm"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            className="bg-cafe-700 hover:bg-cafe-800 disabled:bg-cafe-200 disabled:text-cafe-400
                       text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors shadow-warm shrink-0"
          >
            Reply
          </button>
        </form>
      </div>
    </div>
  );
}

export default ThreadPanel;
