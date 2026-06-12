import React, { useState, useRef, useEffect } from 'react';
import LinkPreview from './LinkPreview';

function ControlledGif({ src, title, expanded }) {
  const videoRef = useRef(null);
  const loopCountRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const playTwice = () => {
    const video = videoRef.current;
    if (!video) return;

    loopCountRef.current = 0;
    setIsPlaying(true);
    video.currentTime = 0;
    video.play().catch(() => {
      setIsPlaying(false);
    });
  };

  const handleEnded = () => {
    const video = videoRef.current;
    if (!video) return;

    loopCountRef.current += 1;
    if (loopCountRef.current < 2) {
      video.currentTime = 0;
      video.play().catch(() => setIsPlaying(false));
      return;
    }

    setIsPlaying(false);
  };

  useEffect(() => {
    playTwice();
  }, [src]);

  return (
    <div
      className="relative inline-block max-w-full"
      onMouseEnter={() => {
        if (!isPlaying) playTwice();
      }}
      onFocus={() => {
        if (!isPlaying) playTwice();
      }}
    >
      <video
        ref={videoRef}
        src={src}
        muted
        playsInline
        autoPlay
        preload="metadata"
        onEnded={handleEnded}
        aria-label={title || 'GIF'}
        className="rounded-xl max-w-full cursor-pointer"
        style={{ maxHeight: expanded ? 'none' : '300px', objectFit: 'cover' }}
      />
      {!isPlaying && (
        <div className="absolute inset-x-2 bottom-2 flex justify-end pointer-events-none">
          <span className="rounded-full bg-cafe-900/70 px-2 py-0.5 text-[10px] font-medium text-white">
            Hover to replay
          </span>
        </div>
      )}
    </div>
  );
}

function MediaContent({ message, isOwnMessage }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!message.mediaUrl) return null;

  if (message.mediaType === 'gif') {
    return (
      <div className="mt-1.5 mb-1" onClick={() => setExpanded(!expanded)}>
        <ControlledGif
          src={message.mediaUrl}
          title={message.mediaName || 'GIF'}
          expanded={expanded}
        />
      </div>
    );
  }

  if (message.mediaType === 'image') {
    return (
      <div className="mt-1.5 mb-1">
        <img
          src={message.mediaUrl}
          alt={message.mediaName || 'Image'}
          className={`rounded-xl max-w-full cursor-pointer transition-opacity duration-200 ${
            imageLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ maxHeight: expanded ? 'none' : '300px', objectFit: 'cover' }}
          onClick={() => setExpanded(!expanded)}
          onLoad={() => setImageLoaded(true)}
        />
        {!imageLoaded && (
          <div className="w-48 h-32 rounded-xl bg-cafe-200/50 animate-pulse" />
        )}
      </div>
    );
  }

  if (message.mediaType === 'video') {
    return (
      <div className="mt-1.5 mb-1">
        <video
          src={message.mediaUrl}
          controls
          className="rounded-xl max-w-full"
          style={{ maxHeight: '300px' }}
          preload="metadata"
        />
      </div>
    );
  }

  if (message.mediaType === 'audio') {
    return (
      <div className="mt-1.5 mb-1">
        <audio src={message.mediaUrl} controls className="max-w-full" preload="metadata" />
      </div>
    );
  }

  // Generic file (PDF, etc.)
  return (
    <a
      href={message.mediaUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`mt-1.5 mb-1 flex items-center gap-2 px-3 py-2 rounded-xl transition-colors ${
        isOwnMessage
          ? 'bg-white/15 hover:bg-white/25 text-white'
          : 'bg-cafe-50 hover:bg-cafe-100 text-cafe-700'
      }`}
    >
      <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
      <span className="text-sm truncate">{message.mediaName || 'File'}</span>
      <svg className="w-4 h-4 shrink-0 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    </a>
  );
}

function ReplyPreview({ replyTo, isOwnMessage }) {
  if (!replyTo) return null;

  const senderName = replyTo.sender?.username || 'Unknown';
  const previewText = replyTo.text
    ? (replyTo.text.length > 80 ? replyTo.text.slice(0, 80) + '...' : replyTo.text)
    : replyTo.mediaType
      ? `[${replyTo.mediaType}]`
      : '';

  return (
    <div
      className={`rounded-lg px-2.5 py-1.5 mb-1.5 border-l-2 ${
        isOwnMessage
          ? 'bg-white/10 border-white/40'
          : 'bg-cafe-50 border-cafe-400'
      }`}
    >
      <p className={`text-[11px] font-semibold ${isOwnMessage ? 'text-cafe-200' : 'text-cafe-600'}`}>
        {senderName}
      </p>
      <p className={`text-[11px] leading-snug truncate ${isOwnMessage ? 'text-cafe-300' : 'text-cafe-400'}`}>
        {previewText}
      </p>
    </div>
  );
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '🎉'];

function ReactionBar({ reactions, currentUserId, onToggle, messageId }) {
  if (!reactions || Object.keys(reactions).length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {Object.entries(reactions).map(([emoji, userIds]) => {
        const hasReacted = userIds.includes(currentUserId);
        return (
          <button
            key={emoji}
            onClick={() => onToggle(messageId, emoji)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors animate-reaction-pop ${
              hasReacted
                ? 'bg-cafe-100 border-cafe-400 text-cafe-800'
                : 'bg-cafe-50 border-cafe-200 text-cafe-500 hover:bg-cafe-100'
            }`}
          >
            <span>{emoji}</span>
            {/* keying the count makes the chip re-pop when someone else joins in */}
            <span key={userIds.length} className="font-medium animate-reaction-pop">{userIds.length}</span>
          </button>
        );
      })}
    </div>
  );
}

function EmojiPicker({ onSelect, anchorRef, align = 'left' }) {
  const pickerElRef = useRef(null);
  const [position, setPosition] = useState(null);

  useEffect(() => {
    const updatePosition = () => {
      const anchor = anchorRef?.current;
      if (!anchor) return;

      const margin = 8;
      const rect = anchor.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(288, viewportWidth - margin * 2);
      const pickerHeight = pickerElRef.current?.offsetHeight || 48;
      const preferredLeft = align === 'right' ? rect.right - width : rect.left;
      const left = Math.min(
        Math.max(preferredLeft, margin),
        Math.max(margin, viewportWidth - width - margin)
      );
      const topAbove = rect.top - pickerHeight - 6;
      const topBelow = rect.bottom + 6;
      const top = topAbove >= margin
        ? topAbove
        : Math.min(topBelow, Math.max(margin, viewportHeight - pickerHeight - margin));

      setPosition({ left, top, width });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorRef, align]);

  return (
    <div
      ref={pickerElRef}
      className={`fixed bg-white rounded-xl shadow-warm-lg border border-cafe-200/50 p-1.5 flex flex-wrap justify-center gap-0.5 z-50 ${
        position ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        width: position?.width ?? 288,
      }}
    >
      {QUICK_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onSelect(emoji)}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-cafe-100 transition-colors text-base"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

function ChatMessage({ message, isOwnMessage, currentUserId, isAdmin, isPinned, onReply, onToggleReaction, onPin, onEdit, onDelete, onWhisper, onThread, onReport, compact }) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showHeartAnim, setShowHeartAnim] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const pickerRef = useRef(null);
  const editInputRef = useRef(null);

  const handleDoubleClick = () => {
    if (!onToggleReaction) return;
    onToggleReaction(message.id, '❤️');
    setShowHeartAnim(true);
    setTimeout(() => setShowHeartAnim(false), 600);
  };

  const handleStartEdit = () => {
    setEditText(message.text);
    setIsEditing(true);
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const handleSaveEdit = () => {
    if (editText.trim() && editText.trim() !== message.text) {
      onEdit(message.id, editText.trim());
    }
    setIsEditing(false);
    setEditText('');
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditText('');
  };

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleDelete = () => {
    onDelete(message.id);
    setShowDeleteConfirm(false);
  };

  useEffect(() => {
    if (!showEmojiPicker) return;
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmojiPicker]);

  // System message (join/leave notifications)
  if (message.type === 'system') {
    return (
      <div className="flex justify-center my-3">
        <span className="text-xs text-cafe-400 bg-cafe-100 px-4 py-1.5 rounded-full border border-cafe-200/50">
          {message.text}
        </span>
      </div>
    );
  }

  // Whisper message
  if (message.type === 'whisper') {
    const isSender = message.sender?.id === currentUserId;
    return (
      <div className={`flex ${isSender ? 'justify-end' : 'justify-start'} mb-3`}>
        <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl border border-purple-200 ${
          isSender
            ? 'bg-purple-600 text-white rounded-tr-sm'
            : 'bg-purple-50 text-purple-900 rounded-tl-sm'
        }`}>
          <p className={`text-[10px] font-medium mb-0.5 ${isSender ? 'text-purple-200' : 'text-purple-500'}`}>
            {isSender ? `Whisper to ${message.targetUserId === currentUserId ? 'yourself' : 'them'}` : `${message.sender?.username} whispers`}
          </p>
          <p className="text-sm break-words leading-relaxed">{message.text}</p>
          <p className={`text-[11px] mt-1 ${isSender ? 'text-purple-300' : 'text-purple-400'}`}>
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    );
  }

  // Call message (voice/video call history)
  if (message.mediaType === 'call') {
    let callInfo = {};
    try { callInfo = JSON.parse(message.mediaName || '{}'); } catch {}
    const isMissed = callInfo.status === 'missed';
    const isCancelled = callInfo.status === 'cancelled';
    const isVideo = callInfo.callType === 'video';

    return (
      <div className="flex justify-center my-3">
        <div className={`flex items-center gap-2.5 px-4 py-2 rounded-xl border text-xs ${
          isMissed
            ? 'bg-red-50 border-red-200 text-red-600'
            : isCancelled
              ? 'bg-cafe-50 border-cafe-200 text-cafe-500'
              : 'bg-green-50 border-green-200 text-green-700'
        }`}>
          {isVideo ? (
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          )}
          <span className="font-medium">{message.text}</span>
          <span className="text-[10px] opacity-70">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    );
  }

  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const isAnonymous = message.isAnonymous || message.sender?.username === 'Anonymous';
  const hasMedia = !!message.mediaUrl;
  const hasText = message.text && message.text.trim();

  return (
    <div className={`group flex items-start gap-1 ${isOwnMessage ? 'justify-end animate-msg-in-right' : 'justify-start animate-msg-in-left'} mb-3`}>
      {/* Action buttons — own messages (left side) */}
      {isOwnMessage && !compact && (
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 mt-2 transition-all shrink-0">
          {onEdit && message.text && (Date.now() - new Date(message.timestamp).getTime() < 15 * 60 * 1000) && (
            <button
              onClick={handleStartEdit}
              className="p-1.5 rounded-lg text-cafe-300 hover:text-cafe-600 hover:bg-cafe-100 transition-all"
              title="Edit message"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1.5 rounded-lg text-cafe-300 hover:text-red-500 hover:bg-red-50 transition-all"
              title="Delete message"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          {isAdmin && onPin && (
            <button
              onClick={() => onPin(message.id)}
              className={`p-1.5 rounded-lg transition-all ${isPinned ? 'text-amber-500 hover:text-amber-700' : 'text-cafe-300 hover:text-cafe-600'} hover:bg-cafe-100`}
              title={isPinned ? 'Unpin' : 'Pin message'}
            >
              <svg className="w-3.5 h-3.5" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
          )}
          {onThread && (
            <button
              onClick={() => onThread(message)}
              className="p-1.5 rounded-lg text-cafe-300 hover:text-cafe-600 hover:bg-cafe-100 transition-all"
              title="Start thread"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </button>
          )}
          {onReply && (
            <button
              onClick={() => onReply(message)}
              className="p-1.5 rounded-lg text-cafe-300 hover:text-cafe-600 hover:bg-cafe-100 transition-all"
              title="Reply"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            </button>
          )}
          <div className="relative" ref={isOwnMessage ? pickerRef : undefined}>
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-1.5 rounded-lg text-cafe-300 hover:text-cafe-600 hover:bg-cafe-100 transition-all"
              title="React"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            {showEmojiPicker && (
              <EmojiPicker
                anchorRef={pickerRef}
                align="left"
                onSelect={(emoji) => { onToggleReaction(message.id, emoji); setShowEmojiPicker(false); }}
              />
            )}
          </div>
        </div>
      )}

      <div
        onDoubleClick={handleDoubleClick}
        className={`relative max-w-[70%] select-none ${
          isOwnMessage
            ? isAnonymous
              ? 'bg-amber-700 text-white rounded-2xl rounded-tr-sm'
              : 'bg-cafe-700 text-white rounded-2xl rounded-tr-sm'
            : isAnonymous
              ? 'bg-white text-cafe-900 rounded-2xl rounded-tl-sm border border-amber-200 shadow-sm'
              : 'bg-white text-cafe-900 rounded-2xl rounded-tl-sm border border-cafe-200/50 shadow-sm'
        } ${hasMedia && !hasText ? 'px-2 py-2' : 'px-4 py-2.5'}`}
      >
        {/* Heart animation on double-click */}
        {showHeartAnim && (
          <span className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 animate-heart-pop text-4xl">
            ❤️
          </span>
        )}
        {!isOwnMessage && (
          <p className={`text-xs font-semibold mb-1 flex items-center gap-1 ${
            isAnonymous ? 'text-amber-600' : 'text-cafe-500'
          } ${hasMedia && !hasText ? 'px-2' : ''}`}>
            {isAnonymous && <span className="text-[10px]">?</span>}
            {message.sender?.username || 'Unknown'}
          </p>
        )}

        {/* Reply preview */}
        {message.replyTo && (
          <div className={hasMedia && !hasText ? 'px-2' : ''}>
            <ReplyPreview replyTo={message.replyTo} isOwnMessage={isOwnMessage} />
          </div>
        )}

        {/* Media */}
        {hasMedia && <MediaContent message={message} isOwnMessage={isOwnMessage} />}

        {/* Text or edit form */}
        {isEditing ? (
          <div className={`${hasMedia ? 'px-2 pt-1' : ''}`}>
            <textarea
              ref={editInputRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleEditKeyDown}
              className="w-full bg-white/20 text-sm rounded-lg px-2 py-1.5 border border-white/30 focus:outline-none focus:ring-1 focus:ring-white/50 resize-none text-inherit"
              rows={Math.min(editText.split('\n').length, 4)}
              maxLength={5000}
            />
            <div className="flex items-center gap-1.5 mt-1">
              <button
                onClick={handleSaveEdit}
                className="text-[10px] px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 transition-colors"
              >
                Save
              </button>
              <button
                onClick={handleCancelEdit}
                className="text-[10px] px-2 py-0.5 rounded hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <span className="text-[9px] opacity-60 ml-auto">Enter to save · Esc to cancel</span>
            </div>
          </div>
        ) : hasText ? (
          <p className={`text-sm break-words leading-relaxed ${hasMedia ? 'px-2 pt-1' : ''}`}>{message.text}</p>
        ) : null}

        {/* Link previews */}
        {hasText && !message.isDeleted && (
          <LinkPreview text={message.text} isOwnMessage={isOwnMessage} />
        )}

        <p
          className={`text-[11px] mt-1 ${hasMedia && !hasText ? 'px-2' : ''} ${
            isOwnMessage
              ? isAnonymous ? 'text-amber-200/70' : 'text-cafe-300'
              : 'text-cafe-400'
          }`}
        >
          {time}
          {message.isEdited && <span className="ml-1">· edited</span>}
          {isOwnMessage && isAnonymous && <span className="ml-1">· Anon</span>}
        </p>

        {/* Reactions display */}
        <ReactionBar
          reactions={message.reactions}
          currentUserId={currentUserId}
          onToggle={onToggleReaction}
          messageId={message.id}
        />

        {/* Thread indicator */}
        {!compact && message.threadCount > 0 && onThread && (
          <button
            onClick={() => onThread(message)}
            className={`flex items-center gap-1.5 mt-1.5 text-[11px] font-medium transition-colors ${
              isOwnMessage ? 'text-cafe-300 hover:text-white' : 'text-cafe-500 hover:text-cafe-700'
            }`}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            {message.threadCount} {message.threadCount === 1 ? 'reply' : 'replies'}
          </button>
        )}
      </div>

      {/* Action buttons — other's messages (right side) */}
      {!isOwnMessage && !compact && (
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 mt-2 transition-all shrink-0">
          {isAdmin && onDelete && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1.5 rounded-lg text-cafe-300 hover:text-red-500 hover:bg-red-50 transition-all"
              title="Delete message (admin)"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          {isAdmin && onPin && (
            <button
              onClick={() => onPin(message.id)}
              className={`p-1.5 rounded-lg transition-all ${isPinned ? 'text-amber-500 hover:text-amber-700' : 'text-cafe-300 hover:text-cafe-600'} hover:bg-cafe-100`}
              title={isPinned ? 'Unpin' : 'Pin message'}
            >
              <svg className="w-3.5 h-3.5" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
          )}
          <div className="relative" ref={!isOwnMessage ? pickerRef : undefined}>
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-1.5 rounded-lg text-cafe-300 hover:text-cafe-600 hover:bg-cafe-100 transition-all"
              title="React"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            {showEmojiPicker && (
              <EmojiPicker
                anchorRef={pickerRef}
                align="right"
                onSelect={(emoji) => { onToggleReaction(message.id, emoji); setShowEmojiPicker(false); }}
              />
            )}
          </div>
          {onThread && (
            <button
              onClick={() => onThread(message)}
              className="p-1.5 rounded-lg text-cafe-300 hover:text-cafe-600 hover:bg-cafe-100 transition-all"
              title="Start thread"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </button>
          )}
          {onReply && (
            <button
              onClick={() => onReply(message)}
              className="p-1.5 rounded-lg text-cafe-300 hover:text-cafe-600 hover:bg-cafe-100 transition-all"
              title="Reply"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            </button>
          )}
          {onWhisper && message.sender && (
            <button
              onClick={() => onWhisper(message.sender.id, message.sender.username)}
              className="p-1.5 rounded-lg text-cafe-300 hover:text-purple-600 hover:bg-purple-50 transition-all"
              title={`Whisper to ${message.sender.username}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </button>
          )}
          {onReport && (
            <button
              onClick={() => onReport(message)}
              className="p-1.5 rounded-lg text-cafe-300 hover:text-red-500 hover:bg-red-50 transition-all"
              title="Report message"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Delete confirmation popup */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-cafe-900/50 modal-backdrop flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-xs w-full mx-4 shadow-warm-lg border border-cafe-200/50 text-center">
            <div className="w-12 h-12 mx-auto mb-3 bg-red-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="text-lg font-serif font-bold text-cafe-900 mb-1">Delete message?</h3>
            <p className="text-sm text-cafe-500 mb-4">This can't be undone.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-medium text-cafe-600 bg-cafe-100 hover:bg-cafe-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatMessage;
