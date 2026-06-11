import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useEmptyChair } from '../hooks/useEmptyChair';
import { track } from '../lib/analytics';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const QUEUE_GREETINGS = [
  "While we wait for someone to take the other seat — how's your day been? ☕",
  "No one at the table yet, but I'm here. What's on your mind today?",
  "I'll keep you company till someone sits down. So — good day or long day?",
];

function EmptyChair({ onClose }) {
  const { user, token } = useAuth();
  const {
    status,
    messages,
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
  } = useEmptyChair();

  const [text, setText] = useState('');
  const messagesEndRef = useRef(null);

  // Barista keeps the user company while they wait in the queue
  const [baristaMessages, setBaristaMessages] = useState([]);
  const [baristaInput, setBaristaInput] = useState('');
  const [baristaLoading, setBaristaLoading] = useState(false);
  const baristaEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    baristaEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [baristaMessages, baristaLoading]);

  // Seed a greeting when entering the queue; clear leftovers when leaving it
  useEffect(() => {
    if (status === 'queued') {
      setBaristaMessages([{
        role: 'assistant',
        content: QUEUE_GREETINGS[Math.floor(Math.random() * QUEUE_GREETINGS.length)],
      }]);
      setBaristaInput('');
    } else {
      setBaristaMessages([]);
    }
  }, [status]);

  const handleBaristaSend = async (e) => {
    e.preventDefault();
    const message = baristaInput.trim();
    if (!message || baristaLoading) return;

    setBaristaMessages((prev) => [...prev, { role: 'user', content: message }]);
    setBaristaInput('');
    setBaristaLoading(true);
    track('emptychair_barista_message');

    try {
      const res = await fetch(`${API_BASE}/barista/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message, mode: 'emptychair_queue' }),
      });
      const data = await res.json();
      const reply = res.ok && data.reply
        ? data.reply
        : "The barista stepped away for a moment — hang tight, I'm still watching the door for you! 🪑";
      setBaristaMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setBaristaMessages((prev) => [...prev, {
        role: 'assistant',
        content: "The barista stepped away for a moment — hang tight, I'm still watching the door for you! 🪑",
      }]);
    } finally {
      setBaristaLoading(false);
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (status === 'matched') leave();
      if (status === 'queued') cancel();
    };
  }, [status, leave, cancel]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    sendMessage(text);
    setText('');
  };

  const handleClose = () => {
    if (status === 'matched') leave();
    if (status === 'queued') cancel();
    onClose();
  };

  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  const partnerName = revealedPartner?.username || 'A Stranger';

  return (
    <div className="fixed inset-0 bg-cafe-900/50 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md h-[80vh] flex flex-col shadow-warm-lg border border-cafe-200/50">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-cafe-200/50">
          <div className="flex items-center gap-2">
            <span className="text-xl">🪑</span>
            <h3 className="font-serif font-bold text-cafe-900 text-lg">The Empty Chair</h3>
          </div>
          <div className="flex items-center gap-2">
            {status === 'matched' && (
              <span className={`text-xs font-mono font-bold px-2 py-1 rounded-lg ${
                timeRemaining <= 60 ? 'bg-red-100 text-red-600' : 'bg-cafe-100 text-cafe-600'
              }`}>
                {formatTime(timeRemaining)}
              </span>
            )}
            <button onClick={handleClose} className="text-cafe-400 hover:text-cafe-700 transition-colors p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* IDLE STATE */}
          {status === 'idle' && (
            <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
              <div className="w-24 h-24 rounded-full bg-violet-100 flex items-center justify-center mb-6">
                <span className="text-5xl">🪑</span>
              </div>
              <h4 className="font-serif font-bold text-cafe-900 text-xl mb-2">Sit with a stranger</h4>
              <p className="text-sm text-cafe-500 mb-6 leading-relaxed">
                Get paired with a random person for a 5-minute ephemeral chat.
                No history saved. Just a conversation between two strangers in a cafe.
              </p>
              <button
                onClick={joinQueue}
                className="px-8 py-3 rounded-xl bg-violet-600 text-white font-medium hover:bg-violet-700 transition-colors shadow-lg"
              >
                Take a Seat
              </button>
            </div>
          )}

          {/* QUEUED STATE — the Barista keeps you company while you wait */}
          {status === 'queued' && (
            <>
              <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between">
                <p className="text-xs text-amber-700 flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                  Looking for someone to sit down...
                </p>
                <button
                  onClick={cancel}
                  className="text-[10px] px-2.5 py-1 rounded-lg bg-cafe-100 text-cafe-600 hover:bg-cafe-200 transition-colors"
                >
                  Leave Queue
                </button>
              </div>

              {/* Barista chat while waiting */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <p className="text-center text-cafe-400 text-xs pb-2">
                  ☕ The Barista will keep you company until a stranger arrives
                </p>
                {baristaMessages.map((msg, i) => {
                  const isOwn = msg.role === 'user';
                  return (
                    <div key={i} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl ${
                        isOwn
                          ? 'bg-violet-600 text-white rounded-tr-sm'
                          : 'bg-amber-50 text-cafe-900 border border-amber-200/70 rounded-tl-sm shadow-sm'
                      }`}>
                        {!isOwn && (
                          <p className="text-[10px] font-semibold text-amber-700 mb-0.5">☕ The Barista</p>
                        )}
                        <p className="text-sm break-words leading-relaxed">{msg.content}</p>
                      </div>
                    </div>
                  );
                })}
                {baristaLoading && (
                  <div className="flex justify-start">
                    <div className="bg-amber-50 border border-amber-200/70 rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm">
                      <p className="text-sm text-cafe-400 animate-pulse">brewing a reply...</p>
                    </div>
                  </div>
                )}
                <div ref={baristaEndRef} />
              </div>

              {/* Input */}
              <form onSubmit={handleBaristaSend} className="p-3 border-t border-cafe-200/50 flex gap-2">
                <input
                  type="text"
                  value={baristaInput}
                  onChange={(e) => setBaristaInput(e.target.value)}
                  placeholder="Chat with the Barista while you wait..."
                  maxLength={500}
                  autoFocus
                  className="flex-1 bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-2.5
                             border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-amber-300 text-sm"
                />
                <button
                  type="submit"
                  disabled={!baristaInput.trim() || baristaLoading}
                  className="px-4 py-2.5 bg-amber-600 text-white rounded-xl hover:bg-amber-700 disabled:bg-cafe-300 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </form>
            </>
          )}

          {/* MATCHED STATE */}
          {status === 'matched' && (
            <>
              <div className="bg-violet-50 border-b border-violet-200 px-4 py-2 text-center">
                <p className="text-xs text-violet-600">
                  Chatting with <strong>{partnerName}</strong>
                  {revealedPartner && <span className="ml-1 text-green-600">(revealed)</span>}
                </p>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 && (
                  <p className="text-center text-cafe-400 text-sm py-8">
                    🪑 Someone sat down! Say hello — the conversation disappears when the timer runs out.
                  </p>
                )}
                {messages.map((msg, i) => {
                  const isOwn = msg.senderId === user.id;
                  return (
                    <div key={i} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl ${
                        isOwn
                          ? 'bg-violet-600 text-white rounded-tr-sm'
                          : 'bg-white text-cafe-900 border border-cafe-200/50 rounded-tl-sm shadow-sm'
                      }`}>
                        <p className="text-sm break-words leading-relaxed">{msg.text}</p>
                        <p className={`text-[10px] mt-1 ${isOwn ? 'text-violet-300' : 'text-cafe-400'}`}>
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Actions bar */}
              <div className="flex items-center gap-2 px-3 py-2 border-t border-cafe-200/50 bg-cafe-50/50">
                {!hasRevealed && (
                  <button
                    onClick={reveal}
                    className="text-[10px] px-2.5 py-1.5 rounded-lg bg-violet-100 text-violet-600 hover:bg-violet-200 transition-colors shrink-0"
                  >
                    Reveal Identity
                  </button>
                )}
                {hasRevealed && (
                  <span className="text-[10px] text-green-600 shrink-0">Identity revealed</span>
                )}
                {timeRemaining <= 120 && !extendWaiting && (
                  <button
                    onClick={extend}
                    className={`text-[10px] px-2.5 py-1.5 rounded-lg transition-colors shrink-0 ${
                      extendRequested
                        ? 'bg-green-100 text-green-700 hover:bg-green-200 animate-pulse'
                        : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                    }`}
                  >
                    {extendRequested ? 'They want +5 min — accept?' : '+5 minutes?'}
                  </button>
                )}
                {extendWaiting && (
                  <span className="text-[10px] text-amber-600 shrink-0">Waiting for them to accept +5 min...</span>
                )}
                <button
                  onClick={leave}
                  className="text-[10px] px-2.5 py-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors shrink-0 ml-auto"
                >
                  Leave Early
                </button>
              </div>

              {/* Input */}
              <form onSubmit={handleSend} className="p-3 border-t border-cafe-200/50 flex gap-2">
                <input
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Say something..."
                  maxLength={500}
                  autoFocus
                  className="flex-1 bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-2.5
                             border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-violet-300 text-sm"
                />
                <button
                  type="submit"
                  disabled={!text.trim()}
                  className="px-4 py-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:bg-cafe-300 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </form>
            </>
          )}

          {/* ENDED STATE */}
          {status === 'ended' && (
            <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
              <div className="w-20 h-20 rounded-full bg-cafe-100 flex items-center justify-center mb-5">
                <span className="text-4xl">
                  {endReason === 'timeout' ? '⏰' : endReason === 'left' ? '👋' : '🔌'}
                </span>
              </div>
              <h4 className="font-serif font-bold text-cafe-900 text-lg mb-1">
                {endReason === 'timeout' ? "Time's up!" : endReason === 'left' ? 'They left' : 'Disconnected'}
              </h4>
              <p className="text-sm text-cafe-500 mb-5">
                {endReason === 'timeout'
                  ? 'The 5 minutes flew by.'
                  : endReason === 'left'
                    ? 'The other person left the chair.'
                    : 'The other person disconnected.'
                }
              </p>

              {revealedPartner && !hasRevealed && (
                <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 mb-4 w-full max-w-xs">
                  <p className="text-xs text-violet-600 mb-1">They revealed themselves:</p>
                  <p className="font-semibold text-violet-800">{revealedPartner.username}</p>
                  <button
                    onClick={reveal}
                    className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors"
                  >
                    Reveal Back
                  </button>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={reset}
                  className="px-6 py-2.5 rounded-xl bg-violet-600 text-white font-medium hover:bg-violet-700 transition-colors"
                >
                  Sit Again
                </button>
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl bg-cafe-100 text-cafe-600 font-medium hover:bg-cafe-200 transition-colors"
                >
                  Back to Lobby
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default EmptyChair;
