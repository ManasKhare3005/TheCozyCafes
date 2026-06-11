import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import socketService from '../services/socket';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const COLOR_MAP = {
  yellow: { bg: 'bg-yellow-100', border: 'border-yellow-300', shadow: 'shadow-yellow-200/50', text: 'text-yellow-900', pin: 'bg-yellow-400' },
  pink: { bg: 'bg-pink-100', border: 'border-pink-300', shadow: 'shadow-pink-200/50', text: 'text-pink-900', pin: 'bg-pink-400' },
  green: { bg: 'bg-emerald-100', border: 'border-emerald-300', shadow: 'shadow-emerald-200/50', text: 'text-emerald-900', pin: 'bg-emerald-400' },
  blue: { bg: 'bg-sky-100', border: 'border-sky-300', shadow: 'shadow-sky-200/50', text: 'text-sky-900', pin: 'bg-sky-400' },
  purple: { bg: 'bg-violet-100', border: 'border-violet-300', shadow: 'shadow-violet-200/50', text: 'text-violet-900', pin: 'bg-violet-400' },
  orange: { bg: 'bg-orange-100', border: 'border-orange-300', shadow: 'shadow-orange-200/50', text: 'text-orange-900', pin: 'bg-orange-400' },
};

const STORAGE_KEY = 'sticky-board-positions';

function loadPositions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function savePositions(positions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
}

// Generate a default grid position for a note based on its index
function defaultPosition(index, boardWidth, boardHeight) {
  const cols = Math.max(3, Math.floor(boardWidth / 200));
  const row = Math.floor(index / cols);
  const col = index % cols;
  const spacingX = Math.min(200, (boardWidth - 40) / cols);
  const spacingY = 180;
  return {
    x: 20 + col * spacingX + (Math.random() - 0.5) * 20,
    y: 20 + row * spacingY + (Math.random() - 0.5) * 15,
  };
}

// Render @tags with highlighting
function renderNoteText(text) {
  const parts = text.split(/(@\w+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      return (
        <span key={i} className="font-bold text-cafe-700 bg-white/40 px-0.5 rounded">
          {part}
        </span>
      );
    }
    return part;
  });
}

function StickyNote({ note, position, onDragEnd, onDelete, onReport, currentUsername }) {
  const colors = COLOR_MAP[note.color] || COLOR_MAP.yellow;
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [pos, setPos] = useState(position);
  const [showMenu, setShowMenu] = useState(false);
  const noteRef = useRef(null);
  const menuRef = useRef(null);

  const isTagged = note.tags?.some(
    (t) => t.toLowerCase() === currentUsername?.toLowerCase()
  );

  // Update pos when prop changes
  useEffect(() => {
    setPos(position);
  }, [position.x, position.y]);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  const handleMouseDown = (e) => {
    if (e.target.closest('[data-menu]')) return;
    e.preventDefault();
    const rect = noteRef.current.getBoundingClientRect();
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setDragging(true);
  };

  const handleMouseMove = useCallback(
    (e) => {
      if (!dragging) return;
      const parent = noteRef.current?.parentElement;
      if (!parent) return;
      const parentRect = parent.getBoundingClientRect();
      setPos({
        x: Math.max(0, Math.min(e.clientX - parentRect.left - dragOffset.x, parentRect.width - 160)),
        y: Math.max(0, Math.min(e.clientY - parentRect.top - dragOffset.y, parentRect.height - 140)),
      });
    },
    [dragging, dragOffset]
  );

  const handleMouseUp = useCallback(() => {
    if (dragging) {
      setDragging(false);
      onDragEnd(note.id, pos);
    }
  }, [dragging, pos, note.id, onDragEnd]);

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragging, handleMouseMove, handleMouseUp]);

  // Touch support
  const handleTouchStart = (e) => {
    if (e.target.closest('[data-menu]')) return;
    const touch = e.touches[0];
    const rect = noteRef.current.getBoundingClientRect();
    setDragOffset({ x: touch.clientX - rect.left, y: touch.clientY - rect.top });
    setDragging(true);
  };

  const handleTouchMove = useCallback(
    (e) => {
      if (!dragging) return;
      e.preventDefault();
      const touch = e.touches[0];
      const parent = noteRef.current?.parentElement;
      if (!parent) return;
      const parentRect = parent.getBoundingClientRect();
      setPos({
        x: Math.max(0, Math.min(touch.clientX - parentRect.left - dragOffset.x, parentRect.width - 160)),
        y: Math.max(0, Math.min(touch.clientY - parentRect.top - dragOffset.y, parentRect.height - 140)),
      });
    },
    [dragging, dragOffset]
  );

  const handleTouchEnd = useCallback(() => {
    if (dragging) {
      setDragging(false);
      onDragEnd(note.id, pos);
    }
  }, [dragging, pos, note.id, onDragEnd]);

  useEffect(() => {
    if (dragging) {
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEnd);
      return () => {
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [dragging, handleTouchMove, handleTouchEnd]);

  const timeAgo = (() => {
    const diff = Date.now() - new Date(note.createdAt).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return 'just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  })();

  const isNew = Date.now() - new Date(note.createdAt).getTime() < 6 * 60 * 60 * 1000;

  return (
    <div
      ref={noteRef}
      className={`absolute w-40 select-none ${dragging ? 'z-50 scale-105' : 'z-10 hover:z-20'} transition-transform`}
      style={{
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        transform: `rotate(${note.rotation}deg)`,
        cursor: dragging ? 'grabbing' : 'grab',
      }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      {/* Pin */}
      <div className={`absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full ${colors.pin} border-2 border-white shadow-md z-10`} />

      {/* Note body */}
      <div
        className={`${colors.bg} ${colors.border} ${colors.text} border rounded-sm p-3 pt-4 shadow-lg ${colors.shadow}
                    min-h-[100px] flex flex-col justify-between relative`}
        style={{ fontFamily: "'Caveat', 'Patrick Hand', cursive, sans-serif" }}
      >
        {/* New indicator */}
        {isNew && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        )}

        {/* Text */}
        <p className="text-[15px] leading-snug font-medium break-words">
          {renderNoteText(note.text)}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between mt-2 pt-1">
          <span className="text-[9px] opacity-50">{timeAgo}</span>

          {/* Menu */}
          {(note.isOwn || isTagged) && (
            <div className="relative" data-menu ref={menuRef}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
                className="text-xs opacity-40 hover:opacity-80 transition-opacity px-1"
              >
                •••
              </button>

              {showMenu && (
                <div className="absolute bottom-full right-0 mb-1 bg-white rounded-xl shadow-warm-lg border border-cafe-200/50 overflow-hidden z-50 min-w-[120px]">
                  {note.isOwn && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(note.id);
                        setShowMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Delete my note
                    </button>
                  )}
                  {isTagged && !note.isOwn && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onReport(note.id);
                        setShowMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Report & remove
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PostNoteForm({ onPost, canPost, cooldownRemaining, friends = [] }) {
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(cooldownRemaining);
  const [mentionQuery, setMentionQuery] = useState(null); // null = not mentioning, string = search query
  const [mentionIndex, setMentionIndex] = useState(0);
  const inputRef = useRef(null);

  // Countdown timer
  useEffect(() => {
    setCountdown(cooldownRemaining);
  }, [cooldownRemaining]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  const formatCountdown = (ms) => {
    const h = Math.floor(ms / (1000 * 60 * 60));
    const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${h}h ${m}m`;
  };

  // Compute mention suggestions — friends are shaped as { friendshipId, friend: { id, username } }
  const mentionSuggestions = mentionQuery !== null
    ? friends
        .filter((f) => f.friend?.username?.toLowerCase().startsWith(mentionQuery.toLowerCase()))
        .map((f) => f.friend)
        .slice(0, 5)
    : [];

  // Detect @mention as user types
  const handleTextChange = (e) => {
    const val = e.target.value;
    setText(val);

    const cursorPos = e.target.selectionStart;
    const textUpToCursor = val.slice(0, cursorPos);

    // Find the last @ that starts a mention (preceded by space or start of string)
    const mentionMatch = textUpToCursor.match(/(?:^|\s)@(\w*)$/);
    if (mentionMatch) {
      setMentionQuery(mentionMatch[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  // Insert a selected mention into the text
  const insertMention = (username) => {
    const cursorPos = inputRef.current?.selectionStart || text.length;
    const textUpToCursor = text.slice(0, cursorPos);
    const textAfterCursor = text.slice(cursorPos);

    // Replace the partial @query with @username
    const replaced = textUpToCursor.replace(/(?:^|\s)@(\w*)$/, (match) => {
      const prefix = match.startsWith(' ') ? ' ' : '';
      return `${prefix}@${username} `;
    });

    const newText = replaced + textAfterCursor;
    setText(newText);
    setMentionQuery(null);

    // Refocus and set cursor position
    setTimeout(() => {
      inputRef.current?.focus();
      const pos = replaced.length;
      inputRef.current?.setSelectionRange(pos, pos);
    }, 0);
  };

  // Keyboard nav for mention dropdown
  const handleKeyDown = (e) => {
    if (mentionSuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMentionIndex((i) => (i + 1) % mentionSuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMentionIndex((i) => (i - 1 + mentionSuggestions.length) % mentionSuggestions.length);
    } else if (e.key === 'Tab' || e.key === 'Enter') {
      if (mentionQuery !== null && mentionSuggestions.length > 0) {
        e.preventDefault();
        insertMention(mentionSuggestions[mentionIndex].username);
      }
    } else if (e.key === 'Escape') {
      setMentionQuery(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (mentionQuery !== null && mentionSuggestions.length > 0) return; // Don't submit while picking mention
    if (!text.trim() || wordCount > 10) return;
    setError('');
    setPosting(true);
    try {
      await onPost(text.trim());
      setText('');
      setMentionQuery(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setPosting(false);
    }
  };

  if (!canPost && countdown > 0) {
    return (
      <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-cafe-200/50 px-4 py-3 shadow-warm text-center">
        <p className="text-sm text-cafe-500">Next note available in</p>
        <p className="text-lg font-serif font-bold text-cafe-800">{formatCountdown(countdown)}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white/90 backdrop-blur-sm rounded-2xl border border-cafe-200/50 px-4 py-3 shadow-warm relative"
    >
      {error && <p className="text-red-600 text-xs mb-2">{error}</p>}

      {/* Mention autocomplete dropdown */}
      {mentionQuery !== null && mentionSuggestions.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 mb-1 bg-white rounded-xl border border-cafe-200 shadow-warm-lg overflow-hidden z-10">
          {mentionSuggestions.map((friend, i) => (
            <button
              key={friend.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault(); // Prevent input blur
                insertMention(friend.username);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                i === mentionIndex
                  ? 'bg-cafe-100 text-cafe-900'
                  : 'text-cafe-700 hover:bg-cafe-50'
              }`}
            >
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-cafe-300 to-cafe-600
                              flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                {friend.username.slice(0, 2).toUpperCase()}
              </div>
              <span className="font-medium">@{friend.username}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder="Write a note (10 words max)..."
          maxLength={100}
          className="flex-1 bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-3 py-2
                     border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 text-sm"
        />
        <button
          type="submit"
          disabled={posting || !text.trim() || wordCount > 10}
          className="bg-cafe-700 hover:bg-cafe-800 disabled:bg-cafe-300 text-white text-sm font-medium
                     px-4 py-2 rounded-xl transition-colors shadow-warm shrink-0"
        >
          {posting ? '...' : 'Pin it'}
        </button>
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <p className="text-[10px] text-cafe-400">
          Use @username to tag someone
        </p>
        <p className={`text-[10px] font-mono ${wordCount > 10 ? 'text-red-500' : 'text-cafe-400'}`}>
          {wordCount}/10 words
        </p>
      </div>
    </form>
  );
}

function StickyBoard({ onClose, friends = [] }) {
  const { token, user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [positions, setPositions] = useState(loadPositions());
  const [loading, setLoading] = useState(true);
  const [canPost, setCanPost] = useState(true);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [tagNotification, setTagNotification] = useState(null);
  const boardRef = useRef(null);

  // Fetch notes and cooldown
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [notesRes, cooldownRes] = await Promise.all([
          fetch(`${API_URL}/sticky`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_URL}/sticky/cooldown`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (notesRes.ok) {
          const data = await notesRes.json();
          setNotes(data.notes);
        }

        if (cooldownRes.ok) {
          const data = await cooldownRes.json();
          setCanPost(data.canPost);
          setCooldownRemaining(data.cooldownRemaining);
        }
      } catch (err) {
        console.error('Failed to fetch sticky data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token]);

  // Socket listeners
  useEffect(() => {
    const socket = socketService.socket;
    if (!socket) return;

    const handleNew = (note) => {
      setNotes((prev) => {
        if (prev.some((n) => n.id === note.id)) return prev;
        return [...prev, note];
      });
    };

    const handleRemoved = ({ noteId }) => {
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    };

    const handleTagged = ({ noteId, noteText }) => {
      setTagNotification({ noteId, noteText });
      setTimeout(() => setTagNotification(null), 5000);
    };

    socket.on('sticky:new', handleNew);
    socket.on('sticky:removed', handleRemoved);
    socket.on('sticky:tagged', handleTagged);

    return () => {
      socket.off('sticky:new', handleNew);
      socket.off('sticky:removed', handleRemoved);
      socket.off('sticky:tagged', handleTagged);
    };
  }, []);

  const handleDragEnd = useCallback((noteId, newPos) => {
    setPositions((prev) => {
      const next = { ...prev, [noteId]: newPos };
      savePositions(next);
      return next;
    });
  }, []);

  const handlePost = useCallback(
    async (text) => {
      const res = await fetch(`${API_URL}/sticky`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Set cooldown
      setCanPost(false);
      setCooldownRemaining(24 * 60 * 60 * 1000);
    },
    [token]
  );

  const handleDelete = useCallback(
    async (noteId) => {
      try {
        await fetch(`${API_URL}/sticky/${noteId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (err) {
        console.error('Failed to delete note:', err);
      }
    },
    [token]
  );

  const handleReport = useCallback(
    async (noteId) => {
      try {
        const res = await fetch(`${API_URL}/sticky/${noteId}/report`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const data = await res.json();
          alert(data.error);
        }
      } catch (err) {
        console.error('Failed to report note:', err);
      }
    },
    [token]
  );

  const getPosition = (noteId, index) => {
    if (positions[noteId]) return positions[noteId];
    const board = boardRef.current;
    const w = board?.clientWidth || 800;
    const h = board?.clientHeight || 600;
    return defaultPosition(index, w, h);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-amber-50">
      {/* Header */}
      <header className="bg-white border-b border-cafe-200/50 px-6 py-4 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📌</span>
          <div>
            <h1 className="text-xl font-serif font-bold text-cafe-900">The Board</h1>
            <p className="text-xs text-cafe-400">Pin anonymous notes — 10 words, once a day</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-xl text-cafe-400 hover:text-cafe-700 hover:bg-cafe-100 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      {/* Tag notification */}
      {tagNotification && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-cafe-800 text-white px-5 py-3 rounded-2xl shadow-warm-lg animate-bounce-slow">
          <p className="text-sm">
            Someone mentioned you: <span className="font-medium">"{tagNotification.noteText}"</span>
          </p>
        </div>
      )}

      {/* Board */}
      <div
        ref={boardRef}
        className="flex-1 relative overflow-auto"
        style={{
          backgroundImage: `
            radial-gradient(circle, rgba(139,90,43,0.08) 1px, transparent 1px)
          `,
          backgroundSize: '24px 24px',
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full text-cafe-400">
            Loading the board...
          </div>
        ) : notes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <span className="text-6xl block mb-4">📌</span>
              <p className="font-serif text-xl text-cafe-600">The board is empty</p>
              <p className="text-cafe-400 text-sm mt-1">Be the first to pin a note!</p>
            </div>
          </div>
        ) : (
          notes.map((note, index) => (
            <StickyNote
              key={note.id}
              note={note}
              position={getPosition(note.id, index)}
              onDragEnd={handleDragEnd}
              onDelete={handleDelete}
              onReport={handleReport}
              currentUsername={user?.username}
            />
          ))
        )}
      </div>

      {/* Post form */}
      <div className="shrink-0 p-4 border-t border-cafe-200/50 bg-white/80 backdrop-blur-sm">
        <div className="max-w-lg mx-auto">
          <PostNoteForm
            onPost={handlePost}
            canPost={canPost}
            cooldownRemaining={cooldownRemaining}
            friends={friends}
          />
        </div>
      </div>
    </div>
  );
}

export default StickyBoard;
