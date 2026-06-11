import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function ScheduledMessages({ roomId, onClose }) {
  const { token } = useAuth();
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/scheduled?roomId=${roomId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
      }
    } catch (err) {
      console.error('Failed to fetch scheduled messages:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, roomId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const handleCancel = async (id) => {
    try {
      const res = await fetch(`${API_URL}/scheduled/${id}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== id));
      }
    } catch (err) {
      console.error('Failed to cancel scheduled message:', err);
    }
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = d - now;
    const diffMin = Math.round(diffMs / 60000);

    if (diffMin < 1) return 'Sending soon...';
    if (diffMin < 60) return `in ${diffMin} min`;

    const today = now.toDateString();
    const tomorrow = new Date(now.getTime() + 86400000).toDateString();
    const dateLabel = d.toDateString() === today
      ? 'Today'
      : d.toDateString() === tomorrow
        ? 'Tomorrow'
        : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    return `${dateLabel} at ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div className="fixed inset-0 bg-cafe-900/40 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-warm-lg border border-cafe-200/50 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-cafe-100">
          <div className="flex items-center gap-2">
            <span className="text-lg">🕐</span>
            <h3 className="font-serif font-bold text-cafe-900 text-lg">Scheduled Messages</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-cafe-100 rounded-xl transition-colors text-cafe-400 hover:text-cafe-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading ? (
            <div className="text-center py-8 text-cafe-400 text-sm">Loading...</div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8">
              <span className="text-3xl block mb-2">📭</span>
              <p className="text-cafe-400 text-sm">No scheduled messages for this room</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className="bg-cafe-50 border border-cafe-200 rounded-xl px-4 py-3"
              >
                <p className="text-cafe-800 text-sm leading-relaxed mb-2 whitespace-pre-wrap break-words">
                  {msg.text.length > 200 ? msg.text.slice(0, 200) + '...' : msg.text}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-cafe-500 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {formatDate(msg.scheduledAt)}
                  </span>
                  <button
                    onClick={() => handleCancel(msg.id)}
                    className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default ScheduledMessages;
