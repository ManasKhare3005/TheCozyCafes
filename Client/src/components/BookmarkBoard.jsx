import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import socketService from '../services/socket';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function BookmarkBoard({ roomId, onClose }) {
  const { user, token } = useAuth();
  const [bookmarks, setBookmarks] = useState([]);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchBookmarks = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/bookmarks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBookmarks(data.bookmarks);
      }
    } catch (err) {
      console.error('Failed to fetch bookmarks:', err);
    } finally {
      setLoading(false);
    }
  }, [roomId, token]);

  useEffect(() => {
    fetchBookmarks();
  }, [fetchBookmarks]);

  // Listen for real-time updates
  useEffect(() => {
    const socket = socketService.socket;

    const handleNew = (bookmark) => {
      setBookmarks((prev) => [bookmark, ...prev]);
    };
    const handleRemoved = ({ id }) => {
      setBookmarks((prev) => prev.filter((b) => b.id !== id));
    };

    socket?.on('bookmark:new', handleNew);
    socket?.on('bookmark:removed', handleRemoved);
    return () => {
      socket?.off('bookmark:new', handleNew);
      socket?.off('bookmark:removed', handleRemoved);
    };
  }, []);

  const handlePost = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;

    setPosting(true);
    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/bookmarks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url, title }),
      });

      if (res.ok) {
        setUrl('');
        setTitle('');
      }
    } catch (err) {
      console.error('Failed to create bookmark:', err);
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (bookmarkId) => {
    try {
      await fetch(`${API_URL}/rooms/${roomId}/bookmarks/${bookmarkId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error('Failed to delete bookmark:', err);
    }
  };

  const getDomain = (rawUrl) => {
    try {
      return new URL(rawUrl).hostname.replace('www.', '');
    } catch {
      return rawUrl;
    }
  };

  return (
    <div className="fixed inset-0 bg-cafe-900/50 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg h-[80vh] flex flex-col shadow-warm-lg border border-cafe-200/50">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-cafe-200/50">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔖</span>
            <h3 className="font-serif font-bold text-cafe-900 text-lg">Bookmarks</h3>
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

        <p className="text-xs text-cafe-400 px-5 py-2 bg-cafe-50 border-b border-cafe-200/50">
          Share links, resources, and interesting finds with the table.
        </p>

        {/* Bookmarks list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <p className="text-center text-cafe-400 py-8">Loading...</p>
          ) : bookmarks.length === 0 ? (
            <div className="text-center py-12">
              <span className="text-4xl block mb-3">🔖</span>
              <p className="text-cafe-500 font-serif">No bookmarks yet</p>
              <p className="text-cafe-400 text-sm mt-1">Share a link to get started</p>
            </div>
          ) : (
            bookmarks.map((b) => (
              <div
                key={b.id}
                className="group flex items-start gap-3 bg-cafe-50 rounded-xl px-4 py-3 border border-cafe-200/50 hover:border-cafe-300 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-cafe-200 flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-cafe-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <a
                    href={b.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-cafe-800 hover:text-cafe-600 hover:underline block truncate"
                  >
                    {b.title || getDomain(b.url)}
                  </a>
                  <p className="text-[11px] text-cafe-400 truncate">{b.url}</p>
                  <p className="text-[10px] text-cafe-400 mt-1">
                    by {b.user?.username || 'Unknown'} · {new Date(b.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {(b.user?.id === user.id || b.userId === user.id) && (
                  <button
                    onClick={() => handleDelete(b.id)}
                    className="opacity-0 group-hover:opacity-100 text-cafe-400 hover:text-red-500 transition-all p-1 shrink-0"
                    title="Remove bookmark"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Add form */}
        <form onSubmit={handlePost} className="border-t border-cafe-200/50 p-4 space-y-2">
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste a URL..."
              required
              className="flex-1 bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-2.5
                         border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 text-sm"
            />
            <button
              type="submit"
              disabled={posting || !url.trim()}
              className="bg-cafe-700 hover:bg-cafe-800 disabled:bg-cafe-200 disabled:text-cafe-400
                         text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors shadow-warm shrink-0"
            >
              Save
            </button>
          </div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            maxLength={100}
            className="w-full bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-2
                       border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 text-xs"
          />
        </form>
      </div>
    </div>
  );
}

export default BookmarkBoard;
