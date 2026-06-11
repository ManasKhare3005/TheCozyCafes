import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function GifPicker({ onSelect, onClose }) {
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState([]);
  const [loading, setLoading] = useState(false);
  const searchTimeoutRef = useRef(null);
  const pickerRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Load trending on mount
  useEffect(() => {
    fetchTrending();
  }, []);

  const fetchTrending = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/gifs/trending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setGifs(data.gifs || []);
    } catch {
      setGifs([]);
    } finally {
      setLoading(false);
    }
  };

  const searchGifs = useCallback(async (q) => {
    if (!q.trim()) {
      fetchTrending();
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/gifs/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setGifs(data.gifs || []);
    } catch {
      setGifs([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const handleSearch = (e) => {
    const val = e.target.value;
    setQuery(val);

    // Debounce search
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => searchGifs(val), 400);
  };

  return (
    <div
      ref={pickerRef}
      className="absolute bottom-full mb-2 left-0 w-80 bg-white rounded-2xl shadow-warm-lg border border-cafe-200/50 overflow-hidden z-50"
    >
      {/* Header */}
      <div className="p-3 border-b border-cafe-100">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={handleSearch}
            placeholder="Search GIFs..."
            autoFocus
            className="flex-1 bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-3 py-2 text-sm
                       border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300"
          />
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-cafe-400 hover:text-cafe-700 hover:bg-cafe-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-cafe-400 mt-1.5 text-right">Powered by GIPHY</p>
      </div>

      {/* GIF grid */}
      <div className="h-64 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-cafe-400 text-sm">Loading...</div>
          </div>
        ) : gifs.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-cafe-400">
              <p className="text-2xl mb-1">🎭</p>
              <p className="text-sm">{query ? 'No GIFs found' : 'Add a GIPHY_API_KEY to enable GIFs'}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                onClick={() => onSelect(gif)}
                className="rounded-xl overflow-hidden hover:ring-2 hover:ring-cafe-400 transition-all bg-cafe-100"
              >
                <img
                  src={gif.preview || gif.url}
                  alt={gif.title}
                  className="w-full h-24 object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default GifPicker;
