import React, { useEffect, useRef, useState } from 'react';
import { useChat } from '../hooks/useChat';
import { useAuth } from '../context/AuthContext';
import ChatMessage from './ChatMessage';
import MessageInput from './MessageInput';
import TypingIndicator from './TypingIndicator';
import KickVotePanel from './KickVotePanel';
import VoiceChannel from './VoiceChannel';
import PollPanel from './PollPanel';
import ConfessionBoard from './ConfessionBoard';
import AmbienceToggle from './AmbienceToggle';
import { useVoiceChat } from '../hooks/useVoiceChat';
import socketService from '../services/socket';
import BookmarkBoard from './BookmarkBoard';
import EventsPanel from './EventsPanel';
import BadgeShowcase from './BadgeShowcase';
import ThreadPanel from './ThreadPanel';
import MusicQueue from './MusicQueue';
import DrawingBoard from './DrawingBoard';
import DrawingGallery from './DrawingGallery';
import PictionaryGame from './PictionaryGame';
import CafeLoader from './CafeLoader';
import CafeBulletinCreate from './CafeBulletinCreate';
import MessageSearch from './MessageSearch';
import ScheduledMessages from './ScheduledMessages';
import { isSoundOn, setSoundOn } from '../lib/sounds';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Shown by the Barista when a room goes quiet - something to restart the talk
const CONVERSATION_STARTERS = [
  "What's everyone drinking right now?",
  "Quick poll: best time of day, morning or late night?",
  "What's the last song you had on repeat?",
  "If this table had a snack menu, what should be on it?",
  "One word for how your week is going - go.",
  "Anyone watched/read something good lately?",
  "Hot take: pineapple on pizza. Discuss.",
  "What's a small thing that made today better?",
  "If you could instantly master one skill, what would it be?",
  "Show of hands - who's procrastinating on something right now?",
  "What's your most controversial food opinion?",
  "Describe your current mood as a weather forecast.",
];
const QUIET_THRESHOLD_MS = 10 * 60 * 1000;

function CafeCupIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h11v6a4 4 0 01-4 4H9a4 4 0 01-4-4V8z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 10h1.5a2.5 2.5 0 010 5H16" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v1m4-1v1m4-1v1M4 20h14" />
    </svg>
  );
}

function BellIcon({ muted = false, className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17H9m6 0a3 3 0 01-6 0m6 0h3.5a1 1 0 00.8-1.6L18 13.7V10a6 6 0 10-12 0v3.7l-1.3 1.7a1 1 0 00.8 1.6H9" />
      {muted && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4l16 16" />}
    </svg>
  );
}

function SoundToggle() {
  const [on, setOn] = useState(isSoundOn);
  const toggle = () => {
    setSoundOn(!on);
    setOn(!on);
  };
  return (
    <button
      onClick={toggle}
      className={`flex items-center justify-center w-9 h-9 rounded-xl text-sm transition-colors ${
        on ? 'bg-cafe-100 text-cafe-700 hover:bg-cafe-200' : 'bg-cafe-50 text-cafe-300 hover:bg-cafe-100'
      }`}
      title={on ? 'Mute cafe sounds (message clinks, door chime)' : 'Unmute cafe sounds'}
      aria-label={on ? 'Mute cafe sounds' : 'Unmute cafe sounds'}
    >
      <BellIcon muted={!on} />
    </button>
  );
}

function HeaderMenu({ label, title, items, accent = 'bg-cafe-400', className = '' }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const menuId = `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-room-menu`;

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const visibleItems = items.filter((item) => !item.hidden);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((value) => !value)}
        className={`group flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm bg-gradient-to-b from-white to-cafe-50 text-cafe-700 hover:text-cafe-900 border border-cafe-200/70 shadow-sm hover:shadow-warm transition-all ${className}`}
        title={title || label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${accent} shadow-sm`} />
        <span className="text-sm font-medium">{label}</span>
        <svg className={`w-3.5 h-3.5 text-cafe-400 group-hover:text-cafe-600 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && visibleItems.length > 0 && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 mt-2 w-64 rounded-2xl border border-cafe-200/80 bg-white shadow-warm-lg z-40 overflow-hidden p-1.5"
        >
          {visibleItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className="group/item w-full flex items-start gap-3 text-left px-3 py-2.5 rounded-xl text-sm text-cafe-700 hover:bg-cafe-50 transition-colors"
            >
              <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${item.accent || accent}`} />
              <span className="flex-1 min-w-0">
                <span className="block font-medium text-cafe-800 group-hover/item:text-cafe-950">{item.label}</span>
                {item.description && (
                  <span className="block text-[11px] leading-snug text-cafe-400 mt-0.5">{item.description}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ChatRoom({ room, onShowRoomInfo, onLogout, onBack, onKicked }) {
  const { user, token } = useAuth();
  const {
    messages,
    onlineUsers,
    typingUsers,
    isConnected,
    isIncognito,
    isAnonymous,
    isAnonymousRoom,
    anonymousName,
    isLoadingHistory,
    maxMembers,
    cafeHours,
    isCafeClosed,
    userAmbience,
    pinnedMessages,
    editMessage,
    deleteMessage,
    pinMessage,
    whisperTarget,
    setWhisperTarget,
    sendWhisper,
    toggleReaction,
    sendMessage,
    setTyping,
    toggleIncognito,
  } = useChat(token, user, room?.id, room?.userIsAnonymous);
  const messagesEndRef = useRef(null);
  const [showKickPanel, setShowKickPanel] = useState(false);
  const [starter, setStarter] = useState(null);
  const starterDismissedRef = useRef(false);

  // Conversation starter: when the room has been quiet for a while and at
  // least two people are sitting here, the Barista drops a prompt card.
  useEffect(() => {
    const check = () => {
      if (isLoadingHistory || starterDismissedRef.current) return;
      if (onlineUsers.length < 2) return;
      const last = messages[messages.length - 1];
      const lastTime = last?.timestamp ? new Date(last.timestamp).getTime() : 0;
      if (Date.now() - lastTime > QUIET_THRESHOLD_MS) {
        setStarter((prev) => prev || CONVERSATION_STARTERS[Math.floor(Math.random() * CONVERSATION_STARTERS.length)]);
      }
    };
    check();
    const id = setInterval(check, 30 * 1000);
    return () => clearInterval(id);
  }, [messages, onlineUsers.length, isLoadingHistory]);

  // Fresh activity clears the card and re-arms it for the next lull
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last?.timestamp) return;
    if (Date.now() - new Date(last.timestamp).getTime() < QUIET_THRESHOLD_MS) {
      setStarter(null);
      starterDismissedRef.current = false;
    }
  }, [messages]);
  const [showConfessions, setShowConfessions] = useState(false);
  const [showPins, setShowPins] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [showBadges, setShowBadges] = useState(false);
  const [activeThread, setActiveThread] = useState(null);
  const [showMusic, setShowMusic] = useState(false);
  const [showDrawing, setShowDrawing] = useState(false);
  const [showDrawingGallery, setShowDrawingGallery] = useState(false);
  const [showPictionary, setShowPictionary] = useState(false);
  const [showPolls, setShowPolls] = useState(false);
  const [showBulletinCreate, setShowBulletinCreate] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showScheduled, setShowScheduled] = useState(false);
  const [cafeMenu, setCafeMenu] = useState(null);
  const [menuDismissed, setMenuDismissed] = useState(false);
  const [kickInfo, setKickInfo] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);
  const messageInputRef = useRef(null);

  const {
    isInVoice,
    voiceUsers,
    isMuted,
    joinVoice,
    leaveVoice,
    toggleMute: toggleVoiceMute,
  } = useVoiceChat();

  // Listen for kick events
  useEffect(() => {
    const handleKicked = ({ roomId, reason, message }) => {
      if (roomId === room?.id) {
        setKickInfo({
          roomName: room?.name || 'the room',
          reason: reason || 'No reason provided',
        });
      }
    };

    socketService.onKicked(handleKicked);
    return () => socketService.offKicked(handleKicked);
  }, [room?.id]);

  // Fetch today's cafe menu
  useEffect(() => {
    if (!room?.id || !token) return;
    fetch(`${API_URL}/menu/today`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => data && setCafeMenu(data.prompt))
      .catch(() => {});
  }, [room?.id, token]);

  const handleDismissKick = () => {
    const roomId = room?.id;
    setKickInfo(null);
    onKicked?.(roomId);
  };

  const handleReportMessage = async (message) => {
    if (!message?.id || !window.confirm('Report this message to moderation?')) return;

    try {
      const details = window.prompt('Optional context for moderators') || '';
      await fetch(`${API_URL}/moderation/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetType: 'message',
          messageId: message.id,
          reason: 'other',
          details,
        }),
      });
    } catch (error) {
      console.error('Failed to report message:', error);
    }
  };

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!room) {
    return (
      <div className="flex-1 flex flex-col bg-cafe-50">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-cafe-400">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-cafe-100 text-cafe-400 flex items-center justify-center">
              <CafeCupIcon className="w-8 h-8" />
            </div>
            <p className="text-xl font-serif text-cafe-500">Pull up a chair</p>
            <p className="text-sm mt-1 text-cafe-400">Pick a table from the lobby</p>
          </div>
        </div>
      </div>
    );
  }

  const isRoomOwner = room.ownerId === user.id;
  const boardMenuItems = [
    { label: 'Confession Board', description: 'Anonymous notes for the table', onClick: () => setShowConfessions(true), accent: 'bg-amber-400' },
    { label: 'Bookmarks', description: 'Shared links and references', onClick: () => setShowBookmarks(true), accent: 'bg-cafe-400' },
    { label: 'Drawing Board', description: 'Collaborative napkin sketching', onClick: () => setShowDrawing(true), accent: 'bg-pink-400' },
    { label: 'Drawing Gallery', description: 'Saved room drawings', onClick: () => setShowDrawingGallery(true), accent: 'bg-pink-500' },
  ];
  const activityMenuItems = [
    { label: 'Events', description: 'Plan hangouts and room moments', onClick: () => setShowEvents(true), accent: 'bg-blue-400' },
    { label: 'Polls', description: 'Ask quick questions', onClick: () => setShowPolls(true), accent: 'bg-sky-400' },
    { label: 'Jukebox', description: 'Queue music together', onClick: () => setShowMusic(true), accent: 'bg-purple-400' },
    { label: 'Badges', description: 'See achievements', onClick: () => setShowBadges(true), accent: 'bg-amber-400' },
  ];
  const gameMenuItems = [
    { label: 'Pictionary', description: 'Draw, guess, and race the timer', onClick: () => setShowPictionary(true), accent: 'bg-emerald-400' },
  ];
  const manageMenuItems = [
    { label: 'Scheduled Messages', description: 'Review pending sends', onClick: () => setShowScheduled(true), accent: 'bg-cafe-400' },
    { label: 'Members', description: 'Moderate this table', onClick: () => setShowKickPanel(true), accent: 'bg-amber-500' },
    { label: 'Post Bulletin', description: 'Publish a lobby announcement', onClick: () => setShowBulletinCreate(true), hidden: !isRoomOwner, accent: 'bg-sky-400' },
  ];

  return (
    <div
      className="flex-1 flex flex-col bg-cafe-50 relative"
      onDragEnter={(e) => {
        e.preventDefault();
        dragCounterRef.current++;
        if (e.dataTransfer.types.includes('Files')) setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        dragCounterRef.current--;
        if (dragCounterRef.current === 0) setIsDragOver(false);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        dragCounterRef.current = 0;
        setIsDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file && messageInputRef.current) {
          messageInputRef.current.handleDroppedFile(file);
        }
      }}
    >
      {/* Full-screen drop overlay */}
      {isDragOver && (
        <div className="absolute inset-0 bg-cafe-100/80 border-4 border-dashed border-cafe-400 rounded-2xl z-50 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <svg className="w-12 h-12 text-cafe-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-cafe-600 text-lg font-serif font-bold">Drop file to upload</p>
            <p className="text-cafe-400 text-sm mt-1">Max size: 10MB</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-cafe-200/50 px-4 lg:px-6 py-3 flex items-center justify-between gap-3 shadow-sm">
        {/* Left: Back button + Room info */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            onClick={onBack}
            className="p-2 rounded-xl text-cafe-400 hover:text-cafe-700 hover:bg-cafe-100 transition-colors -ml-2"
            title="Back to lobby"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        <button
          onClick={onShowRoomInfo}
          className="flex items-center gap-3 hover:bg-cafe-50 rounded-xl px-2 py-1 transition-colors min-w-0"
        >
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-serif font-bold text-sm shadow-sm
            ${room.isPrivate
              ? 'bg-gradient-to-br from-amber-800 to-amber-950'
              : 'bg-gradient-to-br from-cafe-600 to-cafe-800'
            }`}>
            {room.isPrivate ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            ) : room.name.charAt(0).toUpperCase()}
          </div>
          <div className="text-left min-w-0">
            <h1 className="text-lg font-serif font-bold text-cafe-900 flex items-center gap-2 min-w-0">
              <span className="truncate max-w-[15rem] lg:max-w-[22rem]">{room.name}</span>
              {isAnonymousRoom && <span className="text-amber-600 text-sm font-sans font-normal">anonymous room</span>}
              {isAnonymous && !isAnonymousRoom && <span className="text-amber-600 text-sm font-sans font-normal">incognito</span>}
              <svg className="w-4 h-4 text-cafe-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </h1>
            <p className="text-sm text-cafe-500">
              {isConnected ? (
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full" />
                  {onlineUsers.length} online
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                  Connecting...
                </span>
              )}
            </p>
          </div>
        </button>
        </div>

        {/* Right: Controls */}
        <div className="flex flex-wrap items-center justify-end gap-1.5 min-w-0">
          {/* Search messages */}
          <button
            onClick={() => setShowSearch(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm bg-cafe-50 text-cafe-600 hover:bg-cafe-100 transition-colors"
            title="Search Messages"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="hidden sm:inline">Search</span>
          </button>

          {/* Ambience toggle */}
          <AmbienceToggle />

          {/* UI sound toggle (clinks + door chime) */}
          <SoundToggle />

          <HeaderMenu label="Boards" title="Boards and shared room spaces" items={boardMenuItems} accent="bg-pink-400" />
          <HeaderMenu label="Activities" title="Room activities" items={activityMenuItems} accent="bg-blue-400" />
          <HeaderMenu label="Games" title="Games" items={gameMenuItems} accent="bg-emerald-400" />
          <HeaderMenu label="Manage" title="Room management" items={manageMenuItems} accent="bg-amber-500" />


          {/* Incognito toggle */}
          <button
            onClick={toggleIncognito}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm transition-all duration-200 ${
              isIncognito
                ? 'bg-amber-700 text-white shadow-warm'
                : 'bg-cafe-100 text-cafe-600 hover:bg-cafe-200'
            }`}
            title={isIncognito ? 'Incognito mode ON - messages not saved' : 'Turn on incognito mode'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
            </svg>
            <span className="hidden sm:inline">{isIncognito ? 'Incog' : 'Normal'}</span>
          </button>

          {/* Divider */}
          <div className="w-px h-6 bg-cafe-200 mx-1"></div>

          {/* User pill with avatar + logout */}
          <div className="flex items-center gap-1.5 bg-cafe-50 border border-cafe-200/50 rounded-2xl pl-1.5 pr-1.5 py-1">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cafe-300 to-cafe-600
                            flex items-center justify-center text-white font-serif font-bold text-[10px] shadow-sm shrink-0">
              {(isAnonymousRoom ? (anonymousName || 'A') : user.username).split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
                || (isAnonymousRoom ? 'AN' : user.username.slice(0, 2).toUpperCase())}
            </div>
            <span className="text-cafe-700 text-sm font-medium hidden md:inline px-1 max-w-[100px] truncate">
              {isAnonymousRoom ? (anonymousName || 'Anonymous') : user.username}
            </span>
            <button
              onClick={onLogout}
              className="text-cafe-400 hover:text-red-500 transition-colors p-1.5 hover:bg-red-50 rounded-lg"
              title="Sign out"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Ambient status bar */}
      {Object.keys(userAmbience).length > 0 && (
        <div className="bg-cafe-50/80 border-b border-cafe-200/50 px-4 py-1.5 flex items-center gap-3 overflow-x-auto">
          <span className="text-[10px] text-cafe-400 shrink-0">Vibing:</span>
          {Object.entries(userAmbience).map(([userId, { emoji, name }]) => {
            const u = onlineUsers.find((o) => o.id === userId);
            return (
              <span key={userId} className="flex items-center gap-1 text-xs text-cafe-600 shrink-0">
                <span>{emoji}</span>
                <span className="font-medium">{u?.username || 'Someone'}</span>
                <span className="text-cafe-400">Â· {name}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Status banners */}
      {(isAnonymous || isIncognito) && (
        <div className={`border-b px-4 py-2 text-center ${
          isAnonymous && isIncognito
            ? 'bg-gradient-to-r from-amber-50 to-amber-100 border-amber-200'
            : isAnonymous
              ? 'bg-amber-50 border-amber-200'
              : 'bg-orange-50 border-orange-200'
        }`}>
          <p className="text-sm">
            {isAnonymous && (
              <span className="text-amber-800">
                {isAnonymousRoom
                  ? <>This is an anonymous room. You are <strong>{anonymousName || 'Anonymous'}</strong></>
                  : <>You are <strong>{anonymousName || 'Anonymous'}</strong> in this room</>
                }
              </span>
            )}
            {isAnonymous && isIncognito && <span className="text-cafe-300 mx-2">+</span>}
            {isIncognito && (
              <span className="text-amber-700">Incognito - messages won't be saved</span>
            )}
          </p>
        </div>
      )}

      {/* Pinned messages bar */}
      {pinnedMessages.length > 0 && (
        <div className="border-b border-cafe-200/50 bg-white">
          <button
            onClick={() => setShowPins(!showPins)}
            className="w-full flex items-center gap-2 px-4 py-2 text-xs text-cafe-600 hover:bg-cafe-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5 text-cafe-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.828 3.414a2 2 0 012.586-.586l.586.293a2 2 0 01.707 2.707l-1.414 1.414 2.121 2.121 1.414-1.414a2 2 0 012.707.707l.293.586a2 2 0 01-.586 2.586L16.12 13.95a2 2 0 01-2.828 0l-.707-.707L10 15.828a2 2 0 01-2.828 0L5.05 13.707a2 2 0 010-2.828L7.172 8.757l-.707-.707a2 2 0 010-2.828L9.828 3.414z" />
            </svg>
            <span className="font-medium">{pinnedMessages.length} pinned message{pinnedMessages.length !== 1 ? 's' : ''}</span>
            <svg className={`w-3 h-3 ml-auto transition-transform ${showPins ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showPins && (
            <div className="px-4 pb-3 space-y-2">
              {pinnedMessages.map((pin) => (
                <div key={pin.id} className="flex items-start gap-2 bg-cafe-50 rounded-xl px-3 py-2 border border-cafe-200/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-cafe-600">{pin.sender?.username || 'Unknown'}</p>
                    <p className="text-sm text-cafe-800 truncate">
                      {pin.text || (pin.mediaType ? `[${pin.mediaType}]` : '')}
                    </p>
                  </div>
                  {room.ownerId === user.id && (
                    <button
                      onClick={() => pinMessage(pin.id)}
                      className="text-cafe-400 hover:text-red-500 transition-colors p-1 shrink-0"
                      title="Unpin"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Today's Special - cafe menu icebreaker */}
      {cafeMenu && !menuDismissed && (
        <div className="bg-gradient-to-r from-amber-50 to-cafe-50 border-b border-amber-200/50 px-4 py-2.5 flex items-center gap-3">
          <span className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <CafeCupIcon className="w-4 h-4" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Today's Special</p>
            <p className="text-sm text-cafe-800 font-serif">{cafeMenu}</p>
          </div>
          <button
            onClick={() => setMenuDismissed(true)}
            className="text-cafe-400 hover:text-cafe-600 transition-colors p-1 shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 chat-messages">
        {isLoadingHistory ? (
          <div className="flex items-center justify-center h-full">
            <CafeLoader size="small" message="Fetching messages..." />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-cafe-400">
            <p className="font-serif text-lg">Start the conversation...</p>
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              isOwnMessage={message.sender?.id === user.id || message.realSenderId === user.id}
              currentUserId={user.id}
              isAdmin={room.ownerId === user.id}
              isPinned={pinnedMessages.some((p) => p.id === message.id)}
              onReply={setReplyingTo}
              onToggleReaction={toggleReaction}
              onPin={pinMessage}
              onEdit={editMessage}
              onDelete={deleteMessage}
              onWhisper={(senderId, senderName) => setWhisperTarget({ id: senderId, username: senderName })}
              onThread={(msg) => setActiveThread(msg)}
              onReport={handleReportMessage}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing indicator */}
      <TypingIndicator typingUsers={typingUsers} />

      {/* Voice channel (only for tables with 5 or fewer max members) */}
      {maxMembers <= 5 && !isCafeClosed && (
        <VoiceChannel
          voiceUsers={voiceUsers}
          isInVoice={isInVoice}
          isMuted={isMuted}
          onJoin={joinVoice}
          onLeave={leaveVoice}
          onToggleMute={toggleVoiceMute}
        />
      )}

      {/* Cafe closed banner */}
      {isCafeClosed && cafeHours && (
        <div className="bg-amber-50 border-t border-amber-200 px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-2 text-amber-800">
            <CafeCupIcon className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">
              This table is closed for the day. Come back between{' '}
              <span className="font-semibold">{cafeHours.start}</span> and{' '}
              <span className="font-semibold">{cafeHours.end}</span>
              <span className="text-amber-600 text-xs ml-1">({cafeHours.timezone})</span>
            </p>
          </div>
        </div>
      )}

      {/* Conversation starter card (quiet room) */}
      {starter && !isCafeClosed && (
        <div className="bg-amber-50 border-t border-amber-200 px-4 py-2.5 flex items-center gap-3 animate-card-slide">
          <span className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <CafeCupIcon className="w-4 h-4" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-600">The Barista slides a card onto the table</p>
            <p className="text-sm text-cafe-800 truncate">{starter}</p>
          </div>
          <button
            onClick={() => {
              messageInputRef.current?.setDraft(starter);
              setStarter(null);
              starterDismissedRef.current = true;
            }}
            className="text-xs px-3 py-1.5 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 transition-colors shrink-0"
          >
            Ask it
          </button>
          <button
            onClick={() => {
              setStarter(null);
              starterDismissedRef.current = true;
            }}
            className="text-amber-400 hover:text-amber-700 transition-colors p-1 shrink-0"
            title="Dismiss"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Whisper mode indicator */}
      {whisperTarget && (
        <div className="bg-purple-50 border-t border-purple-200 px-4 py-2 flex items-center gap-2">
          <span className="text-purple-600 text-xs font-medium">Whispering to {whisperTarget.username}</span>
          <button
            onClick={() => setWhisperTarget(null)}
            className="text-purple-400 hover:text-purple-700 transition-colors p-0.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Message input */}
      <MessageInput
        ref={messageInputRef}
        onSend={whisperTarget
          ? (text) => { sendWhisper(text); }
          : sendMessage
        }
        onTyping={setTyping}
        disabled={!isConnected || isCafeClosed}
        placeholder={
          isCafeClosed ? "The cafe is closed right now..."
          : whisperTarget ? `Whisper to ${whisperTarget.username}...`
          : isAnonymous ? `Message as ${anonymousName || 'Anonymous'}...`
          : "Type a message..."
        }
        replyTo={whisperTarget ? null : replyingTo}
        onClearReply={() => setReplyingTo(null)}
        onSchedule={!whisperTarget ? async (text, scheduledAt) => {
          try {
            const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/scheduled`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ roomId: room.id, text, scheduledAt }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
          } catch (err) {
            alert(err.message || 'Failed to schedule message');
          }
        } : undefined}
      />

      {/* Kick/Vote Panel */}
      {showKickPanel && (
        <KickVotePanel
          roomId={room.id}
          isAdmin={room.ownerId === user.id}
          ownerId={room.ownerId}
          onClose={() => setShowKickPanel(false)}
        />
      )}

      {/* Confession Board */}
      {showConfessions && (
        <ConfessionBoard
          roomId={room.id}
          onClose={() => setShowConfessions(false)}
        />
      )}

      {/* Bookmark Board */}
      {showBookmarks && (
        <BookmarkBoard
          roomId={room.id}
          onClose={() => setShowBookmarks(false)}
        />
      )}

      {/* Events Panel */}
      {showEvents && (
        <EventsPanel
          roomId={room.id}
          onClose={() => setShowEvents(false)}
        />
      )}

      {/* Polls Panel */}
      {showPolls && (
        <PollPanel
          roomId={room.id}
          onClose={() => setShowPolls(false)}
        />
      )}

      {/* Drawing Board */}
      {showDrawing && (
        <DrawingBoard
          roomId={room.id}
          onClose={() => setShowDrawing(false)}
        />
      )}

      {/* Drawing Gallery */}
      {showDrawingGallery && (
        <DrawingGallery
          roomId={room.id}
          onClose={() => setShowDrawingGallery(false)}
          onOpenBoard={() => {
            setShowDrawingGallery(false);
            setShowDrawing(true);
          }}
        />
      )}

      {/* Pictionary Game */}
      {showPictionary && (
        <PictionaryGame
          roomId={room.id}
          onClose={() => setShowPictionary(false)}
        />
      )}

      {/* Music Queue */}
      {showMusic && (
        <MusicQueue
          roomId={room.id}
          onClose={() => setShowMusic(false)}
        />
      )}

      {/* Thread Panel */}
      {activeThread && (
        <ThreadPanel
          parentMessage={activeThread}
          roomOwnerId={room.ownerId}
          onClose={() => setActiveThread(null)}
        />
      )}

      {/* Badge Showcase */}
      {showBadges && (
        <BadgeShowcase onClose={() => setShowBadges(false)} />
      )}

      {/* Message Search */}
      {showSearch && (
        <MessageSearch
          roomId={room.id}
          onClose={() => setShowSearch(false)}
        />
      )}

      {/* Scheduled Messages */}
      {showScheduled && (
        <ScheduledMessages
          roomId={room.id}
          onClose={() => setShowScheduled(false)}
        />
      )}

      {/* Cafe Bulletin Create */}
      {showBulletinCreate && (
        <CafeBulletinCreate
          roomId={room.id}
          onClose={() => setShowBulletinCreate(false)}
        />
      )}

      {/* Kick Notification Modal */}
      {kickInfo && (
        <div className="fixed inset-0 bg-cafe-900/50 modal-backdrop flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 shadow-warm-lg border border-red-200 text-center">
            <div className="w-14 h-14 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
              <svg className="w-7 h-7 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <h3 className="text-xl font-serif font-bold text-cafe-900 mb-2">You've been kicked</h3>
            <p className="text-cafe-600 mb-1">
              You were removed from <span className="font-semibold text-cafe-800">{kickInfo.roomName}</span>
            </p>
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 my-4">
              <p className="text-sm text-cafe-500 mb-1">Reason</p>
              <p className="text-red-700 font-medium">{kickInfo.reason}</p>
            </div>
            <button
              onClick={handleDismissKick}
              className="w-full bg-cafe-700 hover:bg-cafe-800 text-white font-medium py-3 rounded-xl transition-colors shadow-warm"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatRoom;
