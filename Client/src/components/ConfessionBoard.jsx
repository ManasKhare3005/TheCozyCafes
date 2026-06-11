import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import socketService from '../services/socket';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function ConfessionBoard({ roomId, onClose }) {
  const { token } = useAuth();
  const [confessions, setConfessions] = useState([]);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);

  const fetchConfessions = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/confessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConfessions(data.confessions);
      }
    } catch (err) {
      console.error('Failed to fetch confessions:', err);
    } finally {
      setLoading(false);
    }
  }, [roomId, token]);

  useEffect(() => {
    fetchConfessions();
  }, [fetchConfessions]);

  // Listen for new confessions via socket
  useEffect(() => {
    const handleNew = (confession) => {
      setConfessions((prev) => [...prev, confession]);
    };

    const socket = socketService.socket;
    socket?.on('confession:new', handleNew);
    return () => {
      socket?.off('confession:new', handleNew);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [confessions]);

  const handlePost = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;

    setPosting(true);
    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/confessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text }),
      });

      if (res.ok) {
        setText('');
      }
    } catch (err) {
      console.error('Failed to post confession:', err);
    } finally {
      setPosting(false);
    }
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 bg-cafe-900/50 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg h-[80vh] flex flex-col shadow-warm-lg border border-cafe-200/50">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-cafe-200/50">
          <div className="flex items-center gap-2">
            <span className="text-xl">🤫</span>
            <h3 className="font-serif font-bold text-cafe-900 text-lg">Confession Board</h3>
          </div>
          <button
            onClick={onClose}
            className="text-cafe-400 hover:text-cafe-700 transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-xs text-cafe-400 px-5 py-2 bg-amber-50 border-b border-amber-200">
          Everything here is 100% anonymous. No one can see who posted what.
        </p>

        {/* Confessions list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <p className="text-center text-cafe-400 py-8">Loading...</p>
          ) : confessions.length === 0 ? (
            <div className="text-center py-12">
              <span className="text-4xl block mb-3">🤫</span>
              <p className="text-cafe-500 font-serif">No confessions yet</p>
              <p className="text-cafe-400 text-sm mt-1">Be the first to share something anonymously</p>
            </div>
          ) : (
            confessions.map((c) => (
              <div
                key={c.id}
                className="bg-gradient-to-br from-cafe-50 to-amber-50/50 rounded-xl p-4 border border-cafe-200/50"
              >
                <p className="text-cafe-800 text-sm leading-relaxed">{c.text}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] text-cafe-400">Anonymous</span>
                  <span className="text-[10px] text-cafe-300">{formatTime(c.createdAt)}</span>
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Post form */}
        <form onSubmit={handlePost} className="border-t border-cafe-200/50 p-4 flex gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Share something anonymously..."
            maxLength={500}
            className="flex-1 bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-2.5
                       border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 text-sm"
          />
          <button
            type="submit"
            disabled={posting || !text.trim()}
            className="bg-cafe-700 hover:bg-cafe-800 disabled:bg-cafe-200 disabled:text-cafe-400
                       text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors shadow-warm"
          >
            Post
          </button>
        </form>
      </div>
    </div>
  );
}

export default ConfessionBoard;
