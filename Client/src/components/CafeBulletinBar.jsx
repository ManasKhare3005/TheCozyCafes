import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import socketService from '../services/socket';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function CafeBulletinBar({ onSelectRoom, rooms }) {
  const { token, user } = useAuth();
  const [bulletins, setBulletins] = useState([]);

  const fetchBulletins = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/bulletins`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBulletins(data.bulletins);
      }
    } catch (err) {
      console.error('Failed to fetch bulletins:', err);
    }
  }, [token]);

  useEffect(() => {
    fetchBulletins();
  }, [fetchBulletins]);

  // Socket listeners
  useEffect(() => {
    const handleNew = (bulletin) => setBulletins((prev) => [bulletin, ...prev]);
    const handleRemoved = ({ bulletinId }) => setBulletins((prev) => prev.filter((b) => b.id !== bulletinId));
    const handleStarred = ({ bulletinId, starCount }) => {
      setBulletins((prev) => prev.map((b) => b.id === bulletinId ? { ...b, starCount } : b));
    };

    socketService.onBulletinNew(handleNew);
    socketService.onBulletinRemoved(handleRemoved);
    socketService.onBulletinStarred(handleStarred);
    return () => {
      socketService.offBulletinNew(handleNew);
      socketService.offBulletinRemoved(handleRemoved);
      socketService.offBulletinStarred(handleStarred);
    };
  }, []);

  const handleStar = async (bulletinId) => {
    try {
      const res = await fetch(`${API_URL}/bulletins/${bulletinId}/star`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBulletins((prev) => prev.map((b) =>
          b.id === bulletinId ? { ...b, hasStarred: data.starred, starCount: data.starCount } : b
        ));
      }
    } catch (err) {
      console.error('Failed to toggle star:', err);
    }
  };

  const handleClickBulletin = (bulletin) => {
    const joinedRoom = rooms?.find((r) => r.id === bulletin.room.id);
    if (joinedRoom) {
      onSelectRoom?.(joinedRoom);
    }
  };

  if (bulletins.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">📢</span>
        <h3 className="text-xs font-bold text-cafe-600 uppercase tracking-wide">Cafe Bulletin</h3>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
        {bulletins.map((b) => {
          const isMember = rooms?.some((r) => r.id === b.room.id);
          const timeLeft = getTimeLeft(b.expiresAt);

          return (
            <div
              key={b.id}
              className="shrink-0 w-64 bg-white rounded-xl border border-cafe-200/50 p-3 shadow-sm hover:shadow-warm transition-shadow cursor-pointer"
              onClick={() => handleClickBulletin(b)}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm">☕</span>
                <span className="text-xs font-semibold text-cafe-700 truncate">{b.room.name}</span>
                {b.room.isPrivate && (
                  <svg className="w-3 h-3 text-cafe-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                )}
              </div>
              <p className="text-sm text-cafe-800 leading-snug mb-2 line-clamp-2">{b.text}</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleStar(b.id); }}
                    className={`flex items-center gap-1 text-[10px] transition-colors ${
                      b.hasStarred ? 'text-amber-500' : 'text-cafe-400 hover:text-amber-500'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill={b.hasStarred ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                    {b.starCount > 0 && <span>{b.starCount}</span>}
                  </button>
                  {!isMember && (
                    <span className="text-[9px] text-cafe-400 bg-cafe-50 px-1.5 py-0.5 rounded-full">Not joined</span>
                  )}
                </div>
                <span className="text-[9px] text-cafe-400">{timeLeft}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getTimeLeft(expiresAt) {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'expired';
  const hrs = Math.floor(diff / (60 * 60 * 1000));
  if (hrs > 0) return `${hrs}h left`;
  const mins = Math.floor(diff / (60 * 1000));
  return `${mins}m left`;
}

export default CafeBulletinBar;
