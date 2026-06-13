import React, { useState, useRef, useEffect } from 'react';
import CafeLoader from './CafeLoader';
import FriendsPanel from './FriendsPanel';
import CafeBulletinBar from './CafeBulletinBar';
import NotificationBell from './NotificationBell';
import { track } from '../lib/analytics';

const DONATION_URL = (import.meta.env.VITE_KOFI_URL || import.meta.env.VITE_DONATION_URL || 'https://ko-fi.com/thecozycafes').trim();

const ROOM_EMOJIS = ['☕', '📚', '💻', '🤫', '🎵', '🪟', '🎮', '🎨', '🌿', '🍰', '🔥', '💬', '🌙', '🎯', '🧩', '🍵'];

const ROOM_CATEGORIES = [
  { value: 'general', label: 'General', emoji: '☕', color: 'bg-cafe-100 text-cafe-700' },
  { value: 'gaming', label: 'Gaming', emoji: '🎮', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'music', label: 'Music', emoji: '🎵', color: 'bg-purple-100 text-purple-700' },
  { value: 'study', label: 'Study', emoji: '📚', color: 'bg-blue-100 text-blue-700' },
  { value: 'hangout', label: 'Hangout', emoji: '🪟', color: 'bg-orange-100 text-orange-700' },
  { value: 'tech', label: 'Tech', emoji: '💻', color: 'bg-cyan-100 text-cyan-700' },
  { value: 'art', label: 'Art', emoji: '🎨', color: 'bg-pink-100 text-pink-700' },
  { value: 'food', label: 'Food', emoji: '🍰', color: 'bg-amber-100 text-amber-700' },
];

// One shared question per day, picked by date — same for everyone in the cafe.
// Answers go on the sticky Board, which already auto-expires after 24h.
const DAILY_QUESTIONS = [
  "What's the best thing you ate this week?",
  "What song has been living in your head lately?",
  "If your mood today were a drink, what would it be?",
  "What's one small thing that made you smile recently?",
  "What are you procrastinating on right now? Be honest. ☕",
  "Coffee, tea, or something else entirely?",
  "What's a tiny win you had today?",
  "If you could teleport anywhere for one hour, where would you go?",
  "What's the last thing you watched that you'd actually recommend?",
  "Rain sounds or cafe chatter — which one is your focus fuel?",
  "What's something you're looking forward to this week?",
  "What hobby would you pick up if time wasn't a problem?",
  "Describe your day in exactly three words.",
  "What's your comfort food when everything goes wrong?",
  "Early bird, night owl, or permanently tired pigeon?",
  "What's one thing you learned recently that surprised you?",
  "If this cafe had a secret menu item, what should it be?",
  "What's a place you've never been but think about a lot?",
  "What did teenage-you think you'd be doing right now?",
  "What's the most underrated simple pleasure?",
  "Which fictional character would you grab a coffee with?",
  "What's your go-to song when you need a boost?",
  "What smell instantly takes you back somewhere?",
  "What's one thing on your bucket list you might actually do?",
  "If you had a free day tomorrow, no obligations — what's the plan?",
  "What's the best compliment you've ever received?",
  "Sweet or savory breakfast — defend your answer.",
  "What's something kind a stranger once did for you?",
  "What's your current phone wallpaper, and why?",
  "If your week were a weather forecast, what's the report?",
];

function getDailyQuestion() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000));
  return DAILY_QUESTIONS[dayOfYear % DAILY_QUESTIONS.length];
}

const CAFE_QUOTES = [
  { text: "Good communication is as stimulating as black coffee, and just as hard to sleep after.", author: "Anne Morrow Lindbergh" },
  { text: "Life is too short for bad coffee and boring conversations.", author: "Unknown" },
  { text: "Coffee and friends make the perfect blend.", author: "Unknown" },
  { text: "Where there is coffee, there is conversation.", author: "Old Proverb" },
  { text: "A cup of coffee shared with a friend is happiness tasted and time well spent.", author: "Unknown" },
  { text: "The best ideas start with a good cup of coffee and an even better conversation.", author: "Unknown" },
  { text: "Sometimes all you need is a little chat and a warm cup.", author: "Unknown" },
  { text: "Strangers are just friends waiting to happen.", author: "Rod McKuen" },
  { text: "Be the reason someone smiles today.", author: "Unknown" },
  { text: "In a world where you can be anything, be kind.", author: "Jennifer Dukes Lee" },
  { text: "Every conversation is a chance to learn something new.", author: "Unknown" },
  { text: "The world needs more warm cups and warm hearts.", author: "Unknown" },
  { text: "You never know how a small hello can change someone's entire day.", author: "Unknown" },
  { text: "Happiness is a cup of coffee and a really good conversation.", author: "Unknown" },
  { text: "A cafe is a place where you go to be alone in public.", author: "Unknown" },
  { text: "Talk to people. Connect. The best things in life aren't things.", author: "Unknown" },
  { text: "Behind every successful person is a substantial amount of coffee.", author: "Stephanie Piro" },
  { text: "Even the smallest act of caring can turn a life around.", author: "Unknown" },
  { text: "Today's good mood is sponsored by coffee.", author: "Unknown" },
  { text: "Adventure in life is good; consistency in coffee even better.", author: "Justina Chen" },
  { text: "People who love to eat are always the best people.", author: "Julia Child" },
  { text: "We don't meet people by accident. They are meant to cross our path for a reason.", author: "Unknown" },
  { text: "A yawn is a silent scream for coffee.", author: "Unknown" },
  { text: "Stay curious, stay caffeinated.", author: "Unknown" },
  { text: "The only thing better than coffee is coffee with a friend.", author: "Unknown" },
];

function getRoomEmoji(room, index) {
  // Use category emoji if set
  if (room.category) {
    const cat = ROOM_CATEGORIES.find(c => c.value === room.category);
    if (cat) return cat.emoji;
  }
  const name = room.name.toLowerCase();
  if (name.includes('main') || name.includes('general') || name.includes('counter')) return '☕';
  if (name.includes('book') || name.includes('read')) return '📚';
  if (name.includes('dev') || name.includes('code') || name.includes('tech')) return '💻';
  if (name.includes('quiet') || name.includes('whisper') || name.includes('secret')) return '🤫';
  if (name.includes('music') || name.includes('tune') || name.includes('song')) return '🎵';
  if (name.includes('window') || name.includes('chill') || name.includes('casual')) return '🪟';
  if (name.includes('game') || name.includes('play')) return '🎮';
  if (name.includes('art') || name.includes('draw') || name.includes('design')) return '🎨';
  if (name.includes('garden') || name.includes('nature') || name.includes('plant')) return '🌿';
  if (name.includes('food') || name.includes('cook') || name.includes('bake')) return '🍰';
  if (name.includes('anon') || name.includes('mystery')) return '🕵️';
  return ROOM_EMOJIS[index % ROOM_EMOJIS.length];
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || name.slice(0, 2).toUpperCase();
}

const MOOD_OPTIONS = [
  { value: null, emoji: '⚪', label: 'Clear mood' },
  { value: 'chill', emoji: '😌', label: 'Chill' },
  { value: 'busy', emoji: '🔴', label: 'Busy' },
  { value: 'caffeinated', emoji: '☕', label: 'Caffeinated' },
  { value: 'sleepy', emoji: '😴', label: 'Sleepy' },
  { value: 'creative', emoji: '🎨', label: 'Creative' },
  { value: 'chatty', emoji: '💬', label: 'Chatty' },
  { value: 'focused', emoji: '🎯', label: 'Focused' },
  { value: 'vibing', emoji: '🎵', label: 'Vibing' },
];

function UserMenu({ username, discriminator, referralCode, onLogout, tableCount, currentMood, currentStatus, onSetMood, onSetStatus, onOpenProfile, onOpenBlocks, isAdmin, onOpenAdmin }) {
  const [open, setOpen] = useState(false);
  const [statusInput, setStatusInput] = useState(currentStatus || '');
  const [copiedInvite, setCopiedInvite] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const copyInviteLink = async () => {
    if (!referralCode) return;
    const url = `${window.location.origin}/?ref=${encodeURIComponent(referralCode)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 1800);
    } catch {
      window.prompt('Invite link', url);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="motion-surface flex items-center gap-2.5 bg-white/15 hover:bg-white/25 backdrop-blur-sm
                   border border-white/20 rounded-2xl pl-2 pr-3.5 py-1.5 transition-all duration-200 max-w-[12rem] sm:max-w-none"
      >
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cafe-300 to-cafe-600
                        flex items-center justify-center text-white font-serif font-bold text-xs shadow-sm">
          {getInitials(username)}
        </div>
        <span className="text-white font-medium text-sm truncate">{username}</span>
        <svg className={`w-3.5 h-3.5 text-white/60 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
             fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 max-w-[calc(100vw-1.5rem)] bg-white rounded-2xl shadow-warm-lg border border-cafe-200/50
                        overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
          {/* User info */}
          <div className="px-4 py-3 border-b border-cafe-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cafe-300 to-cafe-600
                              flex items-center justify-center text-white font-serif font-bold text-sm">
                {getInitials(username)}
              </div>
              <div>
                <p className="font-serif font-bold text-cafe-900 text-sm">
                  {username}<span className="text-cafe-400 font-normal">#{discriminator || '0000'}</span>
                </p>
                <p className="text-xs text-cafe-400">{tableCount} {tableCount === 1 ? 'table' : 'tables'} joined</p>
              </div>
            </div>
          </div>

          {/* Mood picker */}
          <div className="px-3 py-2 border-b border-cafe-100">
            <p className="text-[10px] uppercase tracking-wider text-cafe-400 font-medium mb-1.5">Mood</p>
            <div className="flex flex-wrap gap-1">
              {MOOD_OPTIONS.map((m) => (
                <button
                  key={m.value || 'clear'}
                  onClick={() => { onSetMood(m.value); }}
                  className={`text-sm px-2 py-1 rounded-lg transition-colors ${
                    currentMood === m.value
                      ? 'bg-cafe-200 text-cafe-800'
                      : 'hover:bg-cafe-50 text-cafe-600'
                  }`}
                  title={m.label}
                >
                  {m.emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Status input */}
          <div className="px-3 py-2 border-b border-cafe-100">
            <p className="text-[10px] uppercase tracking-wider text-cafe-400 font-medium mb-1.5">Status</p>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={statusInput}
                onChange={(e) => setStatusInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onSetStatus(statusInput.trim() || null);
                  }
                }}
                placeholder="What are you up to?"
                maxLength={100}
                className="flex-1 bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-lg px-2.5 py-1.5
                           border border-cafe-200 focus:outline-none focus:ring-1 focus:ring-cafe-300 text-xs"
              />
              {statusInput !== (currentStatus || '') && (
                <button
                  onClick={() => onSetStatus(statusInput.trim() || null)}
                  className="text-[10px] px-2 py-1 rounded-lg bg-cafe-700 text-white hover:bg-cafe-800 transition-colors shrink-0"
                >
                  Set
                </button>
              )}
              {currentStatus && (
                <button
                  onClick={() => { setStatusInput(''); onSetStatus(null); }}
                  className="text-cafe-400 hover:text-cafe-600 transition-colors p-1 shrink-0"
                  title="Clear status"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="p-1.5">
            {referralCode && (
              <button
                onClick={copyInviteLink}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-cafe-700
                           hover:bg-cafe-50 transition-colors text-left"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8 7V5a4 4 0 118 0v2m-9 4h10m-9 4h6m-7 4h10a2 2 0 002-2V9a2 2 0 00-2-2H7a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                {copiedInvite ? 'Invite Copied' : 'Copy Invite'}
              </button>
            )}
            <a
              href={DONATION_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('donation_clicked', { source: 'user_menu', platform: 'ko-fi' })}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-cafe-700
                         hover:bg-cafe-50 transition-colors text-left"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 21s-7-4.35-9.2-8.64C1.13 9.1 3.16 5.5 6.7 5.5c2 0 3.35 1.1 4.02 2.05C11.39 6.6 12.74 5.5 14.74 5.5c3.54 0 5.57 3.6 3.9 6.86C16.44 16.65 12 21 12 21z" />
              </svg>
              Support on Ko-fi
            </a>
            <button
              onClick={() => { setOpen(false); onOpenProfile?.(); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-cafe-700
                         hover:bg-cafe-50 transition-colors text-left"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              My Profile
            </button>
            <button
              onClick={() => { setOpen(false); onOpenBlocks?.(); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-cafe-700
                         hover:bg-cafe-50 transition-colors text-left"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M18.364 5.636A9 9 0 115.636 18.364 9 9 0 0118.364 5.636zM7.05 7.05l9.9 9.9" />
              </svg>
              Blocked Users
            </button>
            {isAdmin && (
              <button
                onClick={() => { setOpen(false); onOpenAdmin?.(); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-amber-700
                           hover:bg-amber-50 transition-colors text-left"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7l7-4z" />
                </svg>
                Moderation
              </button>
            )}
            <button
              onClick={() => { setOpen(false); onLogout(); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-600
                         hover:bg-red-50 transition-colors text-left"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BaristaCard({ onClick }) {
  return (
    <div
      onClick={onClick}
      className="motion-surface hover-lift animate-soft-enter group relative col-span-1 sm:col-span-2 xl:col-span-3 bg-gradient-to-r from-cafe-700 via-cafe-800 to-cafe-900
                 rounded-2xl border border-cafe-600/30 px-5 py-4 shadow-warm hover:shadow-warm-lg transition-all duration-200
                 cursor-pointer overflow-hidden"
    >
      {/* Decorative steam lines */}
      <div className="absolute top-3 right-6 opacity-15 pointer-events-none flex gap-2">
        <div className="w-0.5 h-8 bg-cafe-300 rounded-full animate-pulse" />
        <div className="w-0.5 h-5 bg-cafe-300 rounded-full animate-pulse mt-2" style={{ animationDelay: '0.3s' }} />
        <div className="w-0.5 h-6 bg-cafe-300 rounded-full animate-pulse mt-1" style={{ animationDelay: '0.6s' }} />
      </div>

      <div className="flex items-center gap-4">
        {/* Avatar */}
        <div className="w-12 h-12 rounded-xl bg-cafe-600/50 border border-cafe-500/30 flex items-center justify-center shrink-0
                        group-hover:bg-cafe-600/70 transition-colors">
          <span className="text-2xl">☕</span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-serif font-bold text-white text-[15px] leading-tight">The Barista</h3>
            <span className="inline-flex items-center gap-1 text-[10px] bg-cafe-500/40 text-cafe-200 px-1.5 py-0.5 rounded-full font-medium border border-cafe-500/20">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              Staff
            </span>
          </div>
          <p className="text-cafe-200/80 text-sm leading-relaxed">
            Your friendly AI companion — vent, chat, or just say hi
          </p>
        </div>

        {/* CTA */}
        <span className="bg-white/15 hover:bg-white/25 text-white text-xs font-medium px-5 py-2 rounded-xl transition-colors shrink-0">
          Chat
        </span>
      </div>
    </div>
  );
}

function RoomLobby({
  rooms,
  publicRooms,
  onSelectRoom,
  onCreateRoom,
  onJoinRoom,
  onJoinByCode,
  onLeaveRoom,
  onToggleAnonymous,
  onLogout,
  currentUserId,
  username,
  discriminator,
  referralCode,
  isLoading,
  onOpenBarista,
  onOpenBoard,
  onOpenLostFound,
  onOpenEmptyChair,
  friends = [],
  incomingRequests = [],
  outgoingRequests = [],
  onSelectFriend,
  onSendFriendRequest,
  onRespondToRequest,
  onRemoveFriend,
  onSearchUsers,
  onlineFriendIds = new Set(),
  friendMoods = {},
  currentMood,
  currentStatus,
  onSetMood,
  onSetStatus,
  onOpenProfile,
  onOpenBlocks,
  isAdmin = false,
  onOpenAdmin,
  friendStatuses = {},
  notifications = [],
  notifUnreadCount = 0,
  onMarkAllNotifsRead,
  onMarkNotifRead,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinCodeModal, setShowJoinCodeModal] = useState(false);
  const [activeTab, setActiveTab] = useState('my'); // 'my' | 'public' | 'friends'
  const [categoryFilter, setCategoryFilter] = useState(null); // null = all

  const displayedRooms = activeTab === 'my' ? rooms : activeTab === 'public' ? publicRooms : [];
  const filteredRooms = displayedRooms.filter(room => {
    const matchesSearch = room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (room.description && room.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = !categoryFilter || room.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const handleRoomCreated = (room) => {
    setShowCreateModal(false);
    onSelectRoom(room);
  };

  // Pick a random quote on each page load
  const [quote] = useState(() => CAFE_QUOTES[Math.floor(Math.random() * CAFE_QUOTES.length)]);

  // Stats
  const totalMembers = rooms.reduce((sum, r) => sum + (r._count?.members || 0), 0);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-cafe-50 cafe-texture flex flex-col overflow-x-hidden">
      {/* Cafe Header with background illustration */}
      <div className="lobby-header relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-cafe-50/80 z-10" />
        <div className="relative z-20 pt-5 sm:pt-8 pb-10 sm:pb-12 px-3 sm:px-4">
          <div className="max-w-5xl mx-auto">
            {/* User menu + notifications pinned top-right */}
            <div className="flex justify-end items-center gap-2 mb-5 sm:mb-6">
              <NotificationBell
                notifications={notifications}
                unreadCount={notifUnreadCount}
                onMarkAllRead={onMarkAllNotifsRead}
                onMarkRead={onMarkNotifRead}
              />
              <UserMenu
                username={username}
                discriminator={discriminator}
                referralCode={referralCode}
                onLogout={onLogout}
                tableCount={rooms.length}
                currentMood={currentMood}
                currentStatus={currentStatus}
                onSetMood={onSetMood}
                onSetStatus={onSetStatus}
                onOpenProfile={onOpenProfile}
                onOpenBlocks={onOpenBlocks}
                isAdmin={isAdmin}
                onOpenAdmin={onOpenAdmin}
              />
            </div>

            {/* Centered title */}
            <div className="text-center max-w-2xl mx-auto">
              <div className="flex items-center justify-center gap-3 mb-3">
                <h1 className="text-3xl sm:text-4xl font-serif font-bold text-white drop-shadow-md">The Cozy Cafes</h1>
              </div>
              <p className="text-white/90 text-sm sm:text-base mb-5">Your virtual cafe — take a table and start chatting</p>

              {/* Quick stats pills */}
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <span className="inline-flex items-center gap-1.5 bg-cafe-800/60 border border-cafe-600/30
                               text-white/90 text-xs font-medium px-3.5 py-1.5 rounded-full">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                  {rooms.length} {rooms.length === 1 ? 'table' : 'tables'} joined
                </span>
                <span className="inline-flex items-center gap-1.5 bg-cafe-800/60 border border-cafe-600/30
                               text-white/90 text-xs font-medium px-3.5 py-1.5 rounded-full">
                  {publicRooms.length} public {publicRooms.length === 1 ? 'table' : 'tables'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-3 sm:px-4 -mt-6 relative z-30 pb-8 lg:pb-28 w-full flex-1">
        {/* Search Bar */}
        <div className="motion-surface animate-soft-enter bg-white rounded-2xl shadow-warm-lg border border-cafe-200/50 px-4 py-3 flex items-center gap-3 mb-6">
          <svg className="w-5 h-5 text-cafe-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Find a table..."
            className="flex-1 bg-transparent text-cafe-900 placeholder-cafe-400 outline-none text-sm"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="motion-surface text-cafe-300 hover:text-cafe-500 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Daily ritual question */}
        <div className="motion-surface animate-soft-enter bg-gradient-to-r from-amber-50 to-cafe-50 rounded-2xl border border-amber-200/50 shadow-warm px-4 py-3 mb-6 flex items-start gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <span className="text-2xl shrink-0">📋</span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-600">Today's question</p>
              <p className="text-sm text-cafe-800 font-medium leading-snug">{getDailyQuestion()}</p>
            </div>
          </div>
        </div>

        {/* Tabs + Actions */}
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div className="w-full sm:w-auto overflow-x-auto scrollbar-hide">
          <div className="inline-flex min-w-max gap-1 bg-cafe-100 rounded-xl p-1">
            <button
              onClick={() => setActiveTab('my')}
              className={`motion-surface px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                activeTab === 'my'
                  ? 'bg-white text-cafe-900 shadow-sm'
                  : 'text-cafe-500 hover:text-cafe-700'
              }`}
            >
              My Tables{rooms.length > 0 && <span className="ml-1.5 text-cafe-400 text-xs">({rooms.length})</span>}
            </button>
            <button
              onClick={() => setActiveTab('public')}
              className={`motion-surface px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                activeTab === 'public'
                  ? 'bg-white text-cafe-900 shadow-sm'
                  : 'text-cafe-500 hover:text-cafe-700'
              }`}
            >
              Browse Public{publicRooms.length > 0 && <span className="ml-1.5 text-cafe-400 text-xs">({publicRooms.length})</span>}
            </button>
            <button
              onClick={() => setActiveTab('friends')}
              className={`motion-surface px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 relative whitespace-nowrap ${
                activeTab === 'friends'
                  ? 'bg-white text-cafe-900 shadow-sm'
                  : 'text-cafe-500 hover:text-cafe-700'
              }`}
            >
              Friends{friends.length > 0 && <span className="ml-1.5 text-cafe-400 text-xs">({friends.length})</span>}
              {incomingRequests.length > 0 && activeTab !== 'friends' && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {incomingRequests.length}
                </span>
              )}
            </button>
          </div>
          </div>

          <div className="relative group/board inline-block w-full sm:w-auto">
            <button
              onClick={onOpenBoard}
              className="motion-surface hover-lift flex w-full sm:w-auto items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium
                         bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors border border-amber-200/50"
            >
              <span className="text-base">📌</span>
              The Board
            </button>
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 rounded-xl bg-cafe-800 text-white text-xs leading-relaxed w-52 text-center shadow-warm-lg opacity-0 invisible group-hover/board:opacity-100 group-hover/board:visible transition-all duration-200 pointer-events-none z-50">
              Anonymous sticky notes for everyone — leave a note, tag a friend
              <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-[6px] border-x-transparent border-t-[6px] border-t-cafe-800" />
            </div>
          </div>

          <div className="relative group/lf inline-block w-full sm:w-auto">
            <button
              onClick={onOpenLostFound}
              className="motion-surface hover-lift flex w-full sm:w-auto items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium
                         bg-sky-100 text-sky-800 hover:bg-sky-200 transition-colors border border-sky-200/50"
            >
              <span className="text-base">🔍</span>
              Lost & Found
            </button>
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 rounded-xl bg-cafe-800 text-white text-xs leading-relaxed w-56 text-center shadow-warm-lg opacity-0 invisible group-hover/lf:opacity-100 group-hover/lf:visible transition-all duration-200 pointer-events-none z-50">
              Community Q&A — ask questions, find recommendations, get help
              <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-[6px] border-x-transparent border-t-[6px] border-t-cafe-800" />
            </div>
          </div>

          <div className="relative group/ec inline-block w-full sm:w-auto">
            <button
              onClick={onOpenEmptyChair}
              className="motion-surface hover-lift flex w-full sm:w-auto items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium
                         bg-violet-100 text-violet-800 hover:bg-violet-200 transition-colors border border-violet-200/50"
            >
              <span className="text-base">🪑</span>
              Empty Chair
            </button>
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 rounded-xl bg-cafe-800 text-white text-xs leading-relaxed w-60 text-center shadow-warm-lg opacity-0 invisible group-hover/ec:opacity-100 group-hover/ec:visible transition-all duration-200 pointer-events-none z-50">
              Get paired with a random stranger for a 5-minute ephemeral chat
              <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-[6px] border-x-transparent border-t-[6px] border-t-cafe-800" />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <button
              onClick={() => setShowJoinCodeModal(true)}
              className="motion-surface hover-lift px-4 py-2 rounded-xl text-sm font-medium bg-cafe-100 text-cafe-700 hover:bg-cafe-200 transition-colors"
            >
              Enter Code
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="motion-surface hover-lift px-4 py-2 rounded-xl text-sm font-medium bg-cafe-700 text-white hover:bg-cafe-800 transition-colors shadow-warm"
            >
              + New Table
            </button>
          </div>
        </div>

        {/* Category Filter Pills */}
        {activeTab !== 'friends' && (
          <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setCategoryFilter(null)}
              className={`motion-surface shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                !categoryFilter
                  ? 'bg-cafe-700 text-white shadow-sm'
                  : 'bg-cafe-100 text-cafe-500 hover:bg-cafe-200'
              }`}
            >
              All
            </button>
            {ROOM_CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setCategoryFilter(categoryFilter === cat.value ? null : cat.value)}
                className={`motion-surface shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 flex items-center gap-1 ${
                  categoryFilter === cat.value
                    ? 'bg-cafe-700 text-white shadow-sm'
                    : `${cat.color} hover:opacity-80`
                }`}
              >
                <span>{cat.emoji}</span>
                {cat.label}
              </button>
            ))}
          </div>
        )}

        {/* Cafe Bulletin Bar */}
        <CafeBulletinBar onSelectRoom={onSelectRoom} rooms={rooms} />

        {/* Friends Panel */}
        {activeTab === 'friends' ? (
          <FriendsPanel
            friends={friends}
            incomingRequests={incomingRequests}
            outgoingRequests={outgoingRequests}
            onlineFriendIds={onlineFriendIds}
            friendMoods={friendMoods}
            friendStatuses={friendStatuses}
            onSelectFriend={onSelectFriend}
            onSendRequest={onSendFriendRequest}
            onRespondToRequest={onRespondToRequest}
            onRemoveFriend={onRemoveFriend}
            onSearchUsers={onSearchUsers}
          />
        ) : isLoading ? (
          <div className="flex items-center justify-center py-20">
            <CafeLoader size="small" message="Finding tables..." />
          </div>
        ) : filteredRooms.length === 0 ? (
          <div>
            {/* Show Barista card even when no rooms */}
            {activeTab === 'my' && !searchQuery && (
              <div className="mb-8">
                <BaristaCard onClick={onOpenBarista} />
              </div>
            )}
            <div className="text-center py-12">
              <div className="w-20 h-20 mx-auto mb-5 bg-cafe-100 rounded-full flex items-center justify-center">
                <span className="text-4xl">{searchQuery ? '🔍' : activeTab === 'my' ? '🪑' : '☕'}</span>
              </div>
              <p className="text-cafe-700 font-serif text-xl mb-2">
                {searchQuery
                  ? 'No tables match your search'
                  : activeTab === 'my'
                    ? "You haven't joined any tables yet"
                    : 'No public tables available'}
              </p>
              <p className="text-cafe-400 text-sm mb-6">
                {activeTab === 'my' ? 'Browse public tables or create your own!' : 'Be the first to create one!'}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                {activeTab === 'my' && (
                  <button
                    onClick={() => setActiveTab('public')}
                    className="motion-surface hover-lift w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-medium bg-cafe-100 text-cafe-700 hover:bg-cafe-200 transition-colors"
                  >
                    Browse Public Tables
                  </button>
                )}
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="motion-surface hover-lift w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-medium bg-cafe-700 text-white hover:bg-cafe-800 transition-colors shadow-warm"
                >
                  + Create a Table
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeTab === 'my' && !searchQuery && (
              <BaristaCard onClick={onOpenBarista} />
            )}
            {filteredRooms.map((room, index) => (
              <RoomCard
                key={room.id}
                room={room}
                emoji={getRoomEmoji(room, index)}
                isJoined={activeTab === 'my'}
                onSelect={() => onSelectRoom(room)}
                onJoin={() => onJoinRoom(room.id)}
                currentUserId={currentUserId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer with daily quote */}
      <footer className="mt-10 lg:mt-0 lg:fixed bottom-0 left-0 right-0 border-t border-cafe-200/50 bg-white/80 backdrop-blur-sm z-30">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-start gap-3 max-w-lg">
              <span className="text-cafe-300 text-xl shrink-0 mt-0.5">,,</span>
              <div>
                <p className="text-cafe-500 text-sm italic leading-relaxed">{quote.text}</p>
                <p className="text-cafe-400 text-xs mt-1">— {quote.author}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 text-cafe-300 text-xs">
              <span>☕</span>
              <span>The Cozy Cafes</span>
              <span className="text-cafe-200">·</span>
              <a
                href={DONATION_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track('donation_clicked', { source: 'lobby_footer', platform: 'ko-fi' })}
                className="text-cafe-400 hover:text-cafe-600 transition-colors"
              >
                support on Ko-fi
              </a>
              <span className="text-cafe-200">|</span>
              <a href="/launch.html" className="text-cafe-400 hover:text-cafe-600 transition-colors">
                about
              </a>
              <span className="text-cafe-200">|</span>
              <a href="/roadmap.html" className="text-cafe-400 hover:text-cafe-600 transition-colors">
                roadmap
              </a>
              <span className="text-cafe-200">|</span>
              <a href="/changelog.html" className="text-cafe-400 hover:text-cafe-600 transition-colors">
                changelog
              </a>
              <span className="text-cafe-200">|</span>
              <a href="/support.html" className="text-cafe-400 hover:text-cafe-600 transition-colors">
                support
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* Create Room Modal */}
      {showCreateModal && (
        <CreateRoomModal
          onClose={() => setShowCreateModal(false)}
          onCreate={onCreateRoom}
          onRoomCreated={handleRoomCreated}
        />
      )}

      {/* Join Code Modal */}
      {showJoinCodeModal && (
        <JoinCodeModal
          onClose={() => setShowJoinCodeModal(false)}
          onJoin={onJoinByCode}
          onSelectRoom={onSelectRoom}
        />
      )}
    </div>
  );
}

function RoomCard({ room, emoji, isJoined, onSelect, onJoin, currentUserId }) {
  const [joining, setJoining] = useState(false);

  const handleJoin = async (e) => {
    e.stopPropagation();
    setJoining(true);
    try {
      await onJoin();
    } catch (err) {
      alert(err.message);
    } finally {
      setJoining(false);
    }
  };

  const memberCount = room._count?.members || 0;
  const isOwner = room.ownerId === currentUserId || room.owner?.id === currentUserId;

  return (
    <div
      onClick={isJoined ? onSelect : undefined}
      className={`motion-surface hover-lift animate-soft-enter group bg-white rounded-2xl border border-cafe-200/50 p-4 shadow-warm hover:shadow-warm-lg transition-all duration-200 ${
        isJoined ? 'cursor-pointer' : ''
      }`}
    >
      {/* Top row: emoji + badges */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-11 h-11 rounded-xl bg-cafe-50 flex items-center justify-center shrink-0
                        group-hover:bg-cafe-100 transition-colors">
          <span className="text-2xl">{emoji}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-serif font-bold text-cafe-900 text-[15px] truncate leading-tight">{room.name}</h3>
            {isJoined && room.unreadCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold bg-amber-500 text-white rounded-full shrink-0">
                {room.unreadCount > 99 ? '99+' : room.unreadCount}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
            {room.isPrivate && (
              <span className="inline-flex items-center gap-0.5 text-[10px] bg-cafe-100 text-cafe-500 px-1.5 py-0.5 rounded-full font-medium">
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Private
              </span>
            )}
            {(room.isAnonymous || room.isAnonymousRoom) && (
              <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">Anon</span>
            )}
            {room.maxMembers === 10 && (
              <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">10-seat</span>
            )}
            {room.cafeHoursEnabled && (
              <span className="text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full font-medium" title={room.cafeHoursTimezone || 'UTC'}>
                {room.cafeHoursStart}–{room.cafeHoursEnd}
              </span>
            )}
            {room.category && (() => {
              const cat = ROOM_CATEGORIES.find(c => c.value === room.category);
              return cat ? (
                <span className={`text-[10px] ${cat.color} px-1.5 py-0.5 rounded-full font-medium`}>
                  {cat.emoji} {cat.label}
                </span>
              ) : null;
            })()}
            {isOwner && (
              <span className="text-[10px] bg-cafe-100 text-cafe-600 px-1.5 py-0.5 rounded-full font-medium">Admin</span>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-cafe-500 text-sm leading-relaxed line-clamp-2 mb-3">
        {room.description || (isJoined ? 'Your cozy corner' : 'A place to chat')}
      </p>

      {/* Bottom row */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-cafe-100">
        {/* Seats around the table — filled = taken */}
        <span
          className="flex items-center gap-1"
          title={`${memberCount} of ${room.maxMembers || 5} seats taken`}
        >
          {Array.from({ length: room.maxMembers || 5 }).map((_, i) => (
            <span
              key={i}
              className={`inline-block w-2.5 h-2.5 rounded-[4px] border transition-colors ${
                i < memberCount
                  ? 'bg-cafe-600 border-cafe-700'
                  : 'bg-cafe-50 border-cafe-300'
              }`}
            />
          ))}
          <span className="ml-1.5 text-xs text-cafe-400">
            {memberCount}/{room.maxMembers || 5}
          </span>
        </span>
        {isJoined ? (
          <button
            onClick={onSelect}
            className="motion-surface bg-cafe-700 hover:bg-cafe-800 text-white text-xs font-medium px-4 py-1.5 rounded-xl transition-colors shadow-sm shrink-0"
          >
            Sit down
          </button>
        ) : (
          <button
            onClick={handleJoin}
            disabled={joining}
            className="motion-surface bg-cafe-700 hover:bg-cafe-800 disabled:bg-cafe-300 text-white text-xs font-medium px-4 py-1.5 rounded-xl transition-colors shadow-sm shrink-0"
          >
            {joining ? 'Joining...' : 'Join table'}
          </button>
        )}
      </div>
    </div>
  );
}

function CreateRoomModal({ onClose, onCreate, onRoomCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [maxMembers, setMaxMembers] = useState(5);
  const [cafeHoursEnabled, setCafeHoursEnabled] = useState(false);
  const [cafeHoursStart, setCafeHoursStart] = useState('09:00');
  const [cafeHoursEnd, setCafeHoursEnd] = useState('17:00');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const room = await onCreate(name, description, isPrivate, isAnonymous, {
        maxMembers,
        category: category || undefined,
        cafeHoursEnabled,
        ...(cafeHoursEnabled && {
          cafeHoursStart,
          cafeHoursEnd,
          cafeHoursTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      onRoomCreated(room);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-cafe-900/40 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-5 sm:p-6 w-full max-w-md shadow-warm-lg border border-cafe-200/50 max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-serif font-bold text-cafe-900 mb-4">Create a Table</h3>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-xl mb-4 text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-cafe-700 mb-1">Table Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="The Cozy Corner"
              className="w-full bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-2.5
                         border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 transition-colors"
              required minLength={2} maxLength={50}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-cafe-700 mb-1">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A place to chat about..."
              className="w-full bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-2.5
                         border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 transition-colors"
              maxLength={200}
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-cafe-700 mb-2">Category (optional)</label>
            <div className="flex flex-wrap gap-2">
              {ROOM_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(category === cat.value ? '' : cat.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border-2 transition-all flex items-center gap-1 ${
                    category === cat.value
                      ? 'border-cafe-700 bg-cafe-50 text-cafe-800'
                      : 'border-cafe-200 text-cafe-500 hover:border-cafe-300'
                  }`}
                >
                  <span>{cat.emoji}</span>
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Table size */}
          <div>
            <label className="block text-sm font-medium text-cafe-700 mb-2">Table Size</label>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => setMaxMembers(5)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                  maxMembers === 5
                    ? 'border-cafe-700 bg-cafe-50 text-cafe-800'
                    : 'border-cafe-200 text-cafe-500 hover:border-cafe-300'
                }`}
              >
                <span className="block text-base">5 seats</span>
                <span className="text-[10px] text-cafe-400">Voice & video enabled</span>
              </button>
              <button
                type="button"
                onClick={() => setMaxMembers(10)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                  maxMembers === 10
                    ? 'border-cafe-700 bg-cafe-50 text-cafe-800'
                    : 'border-cafe-200 text-cafe-500 hover:border-cafe-300'
                }`}
              >
                <span className="block text-base">10 seats</span>
                <span className="text-[10px] text-cafe-400">Text only, no voice</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input type="checkbox" id="isPrivate" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="w-4 h-4 rounded accent-cafe-700" />
            <label htmlFor="isPrivate" className="text-cafe-700 text-sm">Private table (invite code required)</label>
          </div>
          {isPrivate && <p className="text-cafe-400 text-xs">You can find the invite code by clicking on the room name header</p>}

          <div className="flex items-center gap-3">
            <input type="checkbox" id="isAnonymous" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} className="w-4 h-4 rounded accent-amber-700" />
            <label htmlFor="isAnonymous" className="text-cafe-700 text-sm">Anonymous table (everyone gets random names)</label>
          </div>
          {isAnonymous && <p className="text-amber-600 text-xs">All users will have random animal names. No one can reveal their identity.</p>}

          {/* Cafe hours */}
          <div className="flex items-center gap-3">
            <input type="checkbox" id="cafeHours" checked={cafeHoursEnabled} onChange={(e) => setCafeHoursEnabled(e.target.checked)} className="w-4 h-4 rounded accent-cafe-700" />
            <label htmlFor="cafeHours" className="text-cafe-700 text-sm">Cafe hours (only open at certain times)</label>
          </div>
          {cafeHoursEnabled && (
            <div className="bg-cafe-50 rounded-xl p-3 space-y-2 border border-cafe-200">
              <p className="text-xs text-cafe-500">Table will only be accessible during these hours</p>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={cafeHoursStart}
                  onChange={(e) => setCafeHoursStart(e.target.value)}
                  className="bg-white border border-cafe-200 rounded-lg px-3 py-1.5 text-sm text-cafe-800 focus:ring-2 focus:ring-cafe-300 focus:outline-none"
                />
                <span className="text-cafe-400 text-sm">to</span>
                <input
                  type="time"
                  value={cafeHoursEnd}
                  onChange={(e) => setCafeHoursEnd(e.target.value)}
                  className="bg-white border border-cafe-200 rounded-lg px-3 py-1.5 text-sm text-cafe-800 focus:ring-2 focus:ring-cafe-300 focus:outline-none"
                />
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button type="button" onClick={onClose} className="motion-surface flex-1 bg-cafe-100 hover:bg-cafe-200 text-cafe-700 py-2.5 rounded-xl transition-colors">Cancel</button>
            <button type="submit" disabled={isLoading || !name.trim()} className="motion-surface flex-1 bg-cafe-700 hover:bg-cafe-800 disabled:bg-cafe-300 text-white py-2.5 rounded-xl transition-colors shadow-warm">
              {isLoading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function JoinCodeModal({ onClose, onJoin, onSelectRoom }) {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const room = await onJoin(code);
      onSelectRoom(room);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-cafe-900/40 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-5 sm:p-6 w-full max-w-md shadow-warm-lg border border-cafe-200/50">
        <h3 className="text-xl font-serif font-bold text-cafe-900 mb-4">Enter Invite Code</h3>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-xl mb-4 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-cafe-700 mb-1">Invite Code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter code..."
              className="w-full bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-2.5
                         border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 font-mono
                         tracking-widest text-center text-lg transition-colors"
              required
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button type="button" onClick={onClose} className="motion-surface flex-1 bg-cafe-100 hover:bg-cafe-200 text-cafe-700 py-2.5 rounded-xl transition-colors">Cancel</button>
            <button type="submit" disabled={isLoading || !code.trim()} className="motion-surface flex-1 bg-cafe-700 hover:bg-cafe-800 disabled:bg-cafe-300 text-white py-2.5 rounded-xl transition-colors shadow-warm">
              {isLoading ? 'Joining...' : 'Join'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default RoomLobby;
