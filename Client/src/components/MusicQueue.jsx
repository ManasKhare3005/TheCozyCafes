import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import socketService from '../services/socket';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function extractVideoId(url) {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function MusicQueue({ roomId, onClose }) {
  const { user, token } = useAuth();
  const [nowPlaying, setNowPlaying] = useState(null);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [playerReady, setPlayerReady] = useState(false);
  const playerRef = useRef(null);
  const iframeRef = useRef(null);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/music`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNowPlaying(data.nowPlaying);
        setQueue(data.queue);
      }
    } catch (err) {
      console.error('Failed to fetch queue:', err);
    } finally {
      setLoading(false);
    }
  }, [roomId, token]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // Listen for real-time queue updates
  useEffect(() => {
    const socket = socketService.socket;
    const handleUpdated = ({ roomId: rid }) => {
      if (rid === roomId) fetchQueue();
    };
    socket?.on('music:updated', handleUpdated);
    return () => socket?.off('music:updated', handleUpdated);
  }, [roomId, fetchQueue]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    setError('');

    const videoId = extractVideoId(url.trim());
    if (!videoId) {
      setError('Please paste a valid YouTube URL');
      return;
    }

    setPosting(true);
    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/music`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: url.trim(), title: title.trim() || undefined }),
      });
      if (res.ok) {
        setUrl('');
        setTitle('');
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to add track');
      }
    } catch (err) {
      setError('Failed to add track');
    } finally {
      setPosting(false);
    }
  };

  const handleSkip = async () => {
    try {
      await fetch(`${API_URL}/rooms/${roomId}/music/skip`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error('Skip failed:', err);
    }
  };

  const handleTrackEnded = async () => {
    try {
      await fetch(`${API_URL}/rooms/${roomId}/music/ended`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error('Track ended notification failed:', err);
    }
  };

  const handleRemove = async (trackId) => {
    try {
      await fetch(`${API_URL}/rooms/${roomId}/music/${trackId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error('Remove failed:', err);
    }
  };

  const videoId = nowPlaying ? extractVideoId(nowPlaying.url) : null;

  return (
    <div className="fixed inset-0 bg-cafe-900/50 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg h-[85vh] flex flex-col shadow-warm-lg border border-cafe-200/50">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-cafe-200/50">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎵</span>
            <div>
              <h3 className="font-serif font-bold text-cafe-900 text-lg">Jukebox</h3>
              <p className="text-[11px] text-cafe-400">{queue.length} in queue</p>
            </div>
          </div>
          <button onClick={onClose} className="text-cafe-400 hover:text-cafe-700 transition-colors p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Now Playing */}
        {nowPlaying && videoId && (
          <div className="border-b border-cafe-200/50 bg-gradient-to-r from-cafe-50 to-amber-50">
            <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
              <iframe
                ref={iframeRef}
                src={`https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1`}
                className="absolute inset-0 w-full h-full rounded-none"
                allow="autoplay; encrypted-media"
                allowFullScreen
                title={nowPlaying.title}
                onLoad={() => setPlayerReady(true)}
              />
            </div>
            <div className="px-4 py-2 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-cafe-900 truncate">{nowPlaying.title}</p>
                <p className="text-[10px] text-cafe-400">
                  Added by {nowPlaying.addedBy?.username || 'Unknown'}
                </p>
              </div>
              <button
                onClick={handleSkip}
                className="text-xs bg-cafe-100 hover:bg-cafe-200 text-cafe-600 px-3 py-1.5 rounded-lg transition-colors font-medium shrink-0"
                title="Skip track"
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {!nowPlaying && !loading && (
          <div className="border-b border-cafe-200/50 bg-cafe-50 px-4 py-6 text-center">
            <span className="text-3xl block mb-2">🎵</span>
            <p className="text-cafe-500 font-serif text-sm">Nothing playing</p>
            <p className="text-cafe-400 text-xs mt-0.5">Add a YouTube link to start the music</p>
          </div>
        )}

        {/* Queue */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <p className="text-center text-cafe-400 py-8">Loading...</p>
          ) : queue.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-cafe-400 text-sm">Queue is empty</p>
            </div>
          ) : (
            <>
              <p className="text-[10px] font-bold text-cafe-400 uppercase tracking-wide mb-2">Up Next</p>
              {queue.map((track, i) => (
                <div
                  key={track.id}
                  className="group flex items-center gap-3 bg-cafe-50 rounded-xl px-3 py-2.5 border border-cafe-200/50 hover:border-cafe-300 transition-colors"
                >
                  <span className="text-xs text-cafe-400 font-mono w-5 text-center shrink-0">{i + 1}</span>
                  {track.thumbnail && (
                    <img
                      src={track.thumbnail}
                      alt=""
                      className="w-12 h-9 rounded-lg object-cover shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-cafe-800 font-medium truncate">{track.title}</p>
                    <p className="text-[10px] text-cafe-400">
                      {track.addedBy?.username || 'Unknown'}
                    </p>
                  </div>
                  {(track.addedBy?.id === user.id) && (
                    <button
                      onClick={() => handleRemove(track.id)}
                      className="opacity-0 group-hover:opacity-100 text-cafe-400 hover:text-red-500 transition-all p-1 shrink-0"
                      title="Remove"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        {/* Add track form */}
        <form onSubmit={handleAdd} className="border-t border-cafe-200/50 p-4 space-y-2">
          {error && (
            <p className="text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg">{error}</p>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setError(''); }}
              placeholder="Paste YouTube URL..."
              className="flex-1 bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-2.5
                         border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 text-sm"
            />
            <button
              type="submit"
              disabled={posting || !url.trim()}
              className="bg-cafe-700 hover:bg-cafe-800 disabled:bg-cafe-200 disabled:text-cafe-400
                         text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors shadow-warm shrink-0"
            >
              Add
            </button>
          </div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Song title (optional)"
            maxLength={100}
            className="w-full bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-2
                       border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 text-xs"
          />
        </form>
      </div>
    </div>
  );
}

export default MusicQueue;
