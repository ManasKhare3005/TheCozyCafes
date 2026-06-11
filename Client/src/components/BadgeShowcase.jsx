import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const RARITY_STYLES = {
  common: {
    bg: 'bg-gray-100',
    border: 'border-gray-300',
    text: 'text-gray-600',
    label: 'Common',
    glow: '',
  },
  uncommon: {
    bg: 'bg-green-50',
    border: 'border-green-300',
    text: 'text-green-700',
    label: 'Uncommon',
    glow: '',
  },
  rare: {
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    text: 'text-blue-700',
    label: 'Rare',
    glow: 'shadow-blue-200/50 shadow-md',
  },
  epic: {
    bg: 'bg-purple-50',
    border: 'border-purple-300',
    text: 'text-purple-700',
    label: 'Epic',
    glow: 'shadow-purple-300/50 shadow-lg',
  },
  legendary: {
    bg: 'bg-amber-50',
    border: 'border-amber-400',
    text: 'text-amber-700',
    label: 'Legendary',
    glow: 'shadow-amber-300/60 shadow-lg',
  },
};

const RARITY_ORDER = ['legendary', 'epic', 'rare', 'uncommon', 'common'];

function BadgeShowcase({ onClose, targetUserId }) {
  const { token, user } = useAuth();
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, earned, locked
  const isOwnProfile = !targetUserId || targetUserId === user.id;

  const fetchBadges = useCallback(async () => {
    try {
      const endpoint = isOwnProfile
        ? `${API_URL}/badges/all`
        : `${API_URL}/badges/user/${targetUserId}`;
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBadges(data.badges);
      }
    } catch (err) {
      console.error('Failed to fetch badges:', err);
    } finally {
      setLoading(false);
    }
  }, [token, isOwnProfile, targetUserId]);

  useEffect(() => {
    fetchBadges();
  }, [fetchBadges]);

  const filtered = badges.filter((b) => {
    if (filter === 'earned') return b.earned !== false;
    if (filter === 'locked') return b.earned === false;
    return true;
  });

  // Sort: earned first, then by rarity (legendary first)
  const sorted = [...filtered].sort((a, b) => {
    // Earned badges first
    const aEarned = a.earned !== false ? 1 : 0;
    const bEarned = b.earned !== false ? 1 : 0;
    if (aEarned !== bEarned) return bEarned - aEarned;
    // Then by rarity
    return RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
  });

  const earnedCount = badges.filter((b) => b.earned !== false).length;
  const totalCount = badges.length;

  return (
    <div className="fixed inset-0 bg-cafe-900/50 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg h-[85vh] flex flex-col shadow-warm-lg border border-cafe-200/50">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-cafe-200/50">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏆</span>
            <div>
              <h3 className="font-serif font-bold text-cafe-900 text-lg">Achievements</h3>
              <p className="text-[11px] text-cafe-400">
                {isOwnProfile
                  ? `${earnedCount} of ${totalCount} earned`
                  : `Viewing badges`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-cafe-400 hover:text-cafe-700 transition-colors p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress bar (own profile only) */}
        {isOwnProfile && totalCount > 0 && (
          <div className="px-5 py-3 border-b border-cafe-200/50 bg-cafe-50/50">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold text-cafe-500 uppercase tracking-wide">Progress</span>
              <span className="text-xs text-cafe-600 font-medium">{Math.round((earnedCount / totalCount) * 100)}%</span>
            </div>
            <div className="w-full bg-cafe-200 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-amber-600 rounded-full transition-all duration-500"
                style={{ width: `${(earnedCount / totalCount) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Filter tabs */}
        {isOwnProfile && (
          <div className="flex gap-1 px-5 py-2 border-b border-cafe-200/50">
            {[
              { key: 'all', label: 'All' },
              { key: 'earned', label: `Earned (${earnedCount})` },
              { key: 'locked', label: `Locked (${totalCount - earnedCount})` },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  filter === tab.key
                    ? 'bg-cafe-700 text-white'
                    : 'bg-cafe-50 text-cafe-500 hover:bg-cafe-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Badge grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-center text-cafe-400 py-8">Loading badges...</p>
          ) : sorted.length === 0 ? (
            <div className="text-center py-12">
              <span className="text-4xl block mb-3">🏆</span>
              <p className="text-cafe-500 font-serif">No badges yet</p>
              <p className="text-cafe-400 text-sm mt-1">Start chatting to earn your first badge!</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {sorted.map((badge) => {
                const style = RARITY_STYLES[badge.rarity] || RARITY_STYLES.common;
                const isLocked = badge.earned === false;

                return (
                  <div
                    key={badge.id}
                    className={`relative rounded-xl border-2 p-3 transition-all ${
                      isLocked
                        ? 'bg-gray-50 border-gray-200 opacity-50'
                        : `${style.bg} ${style.border} ${style.glow}`
                    }`}
                  >
                    {/* Rarity label */}
                    <div className={`absolute -top-2 right-2 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                      isLocked ? 'bg-gray-200 text-gray-500' : `${style.bg} ${style.text} border ${style.border}`
                    }`}>
                      {style.label}
                    </div>

                    {/* Emoji */}
                    <div className={`text-3xl mb-2 ${isLocked ? 'grayscale' : ''}`}>
                      {isLocked ? '🔒' : badge.emoji}
                    </div>

                    {/* Name + description */}
                    <h4 className={`text-sm font-bold ${isLocked ? 'text-gray-400' : 'text-cafe-900'}`}>
                      {badge.name}
                    </h4>
                    <p className={`text-[11px] mt-0.5 leading-tight ${isLocked ? 'text-gray-400' : 'text-cafe-500'}`}>
                      {badge.description}
                    </p>

                    {/* Awarded date */}
                    {badge.awardedAt && (
                      <p className="text-[9px] text-cafe-400 mt-1.5">
                        Earned {new Date(badge.awardedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default BadgeShowcase;
