import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { useAuth } from '../context/AuthContext';

const MOOD_COLORS = {
  happy: { bg: 'bg-green-50', border: 'border-green-200', dot: 'bg-green-400', label: 'Feeling good' },
  hopeful: { bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-400', label: 'Hopeful' },
  neutral: { bg: 'bg-cafe-50', border: 'border-cafe-200', dot: 'bg-cafe-400', label: 'Neutral' },
  sad: { bg: 'bg-blue-50', border: 'border-blue-200', dot: 'bg-blue-400', label: 'Feeling down' },
  lonely: { bg: 'bg-indigo-50', border: 'border-indigo-200', dot: 'bg-indigo-400', label: 'Lonely' },
  anxious: { bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-400', label: 'Anxious' },
  stressed: { bg: 'bg-orange-50', border: 'border-orange-200', dot: 'bg-orange-400', label: 'Stressed' },
  angry: { bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-400', label: 'Frustrated' },
};

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function MoodIndicator({ mood }) {
  const m = MOOD_COLORS[mood] || MOOD_COLORS.neutral;
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${m.bg} ${m.border} border`}>
      <span className={`w-2 h-2 rounded-full ${m.dot}`} />
      {m.label}
    </div>
  );
}

const BaristaMessage = React.memo(function BaristaMessage({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cafe-400 to-cafe-700 flex items-center justify-center shrink-0 mr-2.5 mt-0.5">
          <span className="text-sm">☕</span>
        </div>
      )}
      <div className={`max-w-[70%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
        isUser
          ? 'bg-cafe-700 text-white rounded-br-md'
          : 'bg-white border border-cafe-200/50 text-cafe-800 rounded-bl-md shadow-sm'
      }`}>
        {msg.content}
      </div>
    </div>
  );
});

const BaristaChat = forwardRef(function BaristaChat(_, ref) {
  const { token } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    open: () => setIsOpen(true),
  }));
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Load history when first opened
  useEffect(() => {
    if (isOpen && !historyLoaded) {
      loadHistory();
    }
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/barista/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.messages) {
        setMessages(data.messages);
      }
      setHistoryLoaded(true);
    } catch {
      setHistoryLoaded(true);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg = { id: Date.now(), role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/barista/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();

      if (data.reply) {
        setMessages((prev) => [
          ...prev,
          { id: Date.now() + 1, role: 'assistant', content: data.reply },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { id: Date.now() + 1, role: 'assistant', content: data.error || 'Something went wrong.' },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: 'assistant', content: "Hmm, I can't seem to connect right now. Try again in a sec?" },
      ]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const clearChat = async () => {
    try {
      await fetch(`${API_BASE}/barista/history`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessages([]);
    } catch {}
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-cafe-900/60 flex items-center justify-center z-50 p-4">
      <div className="bg-cafe-50 rounded-2xl w-full max-w-lg h-[85vh] flex flex-col shadow-warm-lg border border-cafe-200/50 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-cafe-700 to-cafe-800 px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center">
              <span className="text-xl">☕</span>
            </div>
            <div>
              <h3 className="text-white font-serif font-bold text-lg">The Barista</h3>
              <p className="text-white/60 text-xs">Always here to listen</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={clearChat}
              className="text-white/40 hover:text-white/80 p-2 rounded-lg hover:bg-white/10 transition-colors"
              title="Clear conversation"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/40 hover:text-white/80 p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 min-h-0" style={{ willChange: 'scroll-position' }}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-20 h-20 rounded-full bg-cafe-100 flex items-center justify-center mb-5">
                <span className="text-4xl">☕</span>
              </div>
              <p className="font-serif text-cafe-700 text-xl mb-2">Hey there!</p>
              <p className="text-cafe-400 text-sm max-w-[300px] leading-relaxed">
                I'm your barista. How are you doing today? Pull up a stool and let's talk.
              </p>
            </div>
          ) : (
            messages.map((msg) => <BaristaMessage key={msg.id} msg={msg} />)
          )}
          {isLoading && (
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cafe-400 to-cafe-700 flex items-center justify-center shrink-0">
                <span className="text-sm">☕</span>
              </div>
              <div className="bg-white border border-cafe-200/50 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-cafe-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-cafe-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-cafe-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={sendMessage} className="p-4 border-t border-cafe-200/50 bg-white shrink-0">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="How are you feeling..."
              className="flex-1 bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-3
                         border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 text-sm transition-colors"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-cafe-700 hover:bg-cafe-800 disabled:bg-cafe-300 text-white p-3 rounded-xl
                         transition-colors shadow-sm shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

export default BaristaChat;
