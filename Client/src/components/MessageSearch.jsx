import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function MessageSearch({ roomId, onClose }) {
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const searchMessages = useCallback(async (searchQuery, before) => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setResults([]);
      setHasSearched(false);
      setHasMore(false);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({ q: searchQuery.trim(), limit: '20' });
      if (before) params.set('before', before);

      const res = await fetch(`${API_URL}/messages/room/${roomId}/search?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        if (before) {
          setResults((prev) => [...prev, ...data.messages]);
        } else {
          setResults(data.messages);
        }
        setHasMore(data.messages.length === 20);
        setHasSearched(true);
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  }, [roomId, token]);

  const handleInputChange = (e) => {
    const value = e.target.value;
    setQuery(value);

    // Debounce search
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchMessages(value);
    }, 400);
  };

  const handleLoadMore = () => {
    if (results.length > 0) {
      const oldest = results[0]; // results are in chronological order
      searchMessages(query, oldest.createdAt);
    }
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (diffDays === 0) return `Today at ${time}`;
    if (diffDays === 1) return `Yesterday at ${time}`;
    if (diffDays < 7) return `${date.toLocaleDateString([], { weekday: 'short' })} at ${time}`;
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${time}`;
  };

  const highlightMatch = (text, searchQuery) => {
    if (!searchQuery || searchQuery.trim().length < 2) return text;
    const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-amber-200 text-cafe-900 rounded px-0.5">{part}</mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="fixed inset-0 bg-cafe-900/50 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg h-[80vh] flex flex-col shadow-warm-lg border border-cafe-200/50">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-cafe-200/50">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔍</span>
            <h3 className="font-serif font-bold text-cafe-900 text-lg">Search Messages</h3>
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

        {/* Search input */}
        <div className="px-4 py-3 border-b border-cafe-200/50">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cafe-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={handleInputChange}
              placeholder="Search messages..."
              className="w-full bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl pl-10 pr-4 py-2.5
                         border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 text-sm"
            />
            {loading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-cafe-300 border-t-cafe-600 rounded-full animate-spin" />
              </div>
            )}
          </div>
          {query.length === 1 && (
            <p className="text-xs text-cafe-400 mt-1.5 px-1">Type at least 2 characters to search</p>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {!hasSearched ? (
            <div className="text-center py-12">
              <span className="text-4xl block mb-3">🔍</span>
              <p className="text-cafe-500 font-serif">Search through messages</p>
              <p className="text-cafe-400 text-sm mt-1">Find conversations, links, and more</p>
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-12">
              <span className="text-4xl block mb-3">☕</span>
              <p className="text-cafe-500 font-serif">No messages found</p>
              <p className="text-cafe-400 text-sm mt-1">Try a different search term</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-cafe-400 px-1 mb-2">
                {results.length} result{results.length !== 1 ? 's' : ''} found
              </p>
              {results.map((msg) => (
                <div
                  key={msg.id}
                  className="bg-cafe-50 rounded-xl px-4 py-3 border border-cafe-200/50 hover:border-cafe-300 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-cafe-300 to-cafe-600 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                      {(msg.sender?.username || '?').slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-xs font-semibold text-cafe-700">
                      {msg.sender?.username || 'Unknown'}
                    </span>
                    <span className="text-[10px] text-cafe-400 ml-auto">
                      {formatTime(msg.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-cafe-800 leading-relaxed break-words">
                    {highlightMatch(msg.text, query)}
                  </p>
                  {msg.mediaType && (
                    <span className="inline-block mt-1 text-[10px] text-cafe-400 bg-cafe-100 rounded px-1.5 py-0.5">
                      📎 {msg.mediaType}
                    </span>
                  )}
                </div>
              ))}
              {hasMore && (
                <button
                  onClick={handleLoadMore}
                  disabled={loading}
                  className="w-full text-center text-sm text-cafe-500 hover:text-cafe-700 py-2 transition-colors"
                >
                  {loading ? 'Loading...' : 'Load more results'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default MessageSearch;
