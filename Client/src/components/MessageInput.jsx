import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useAuth } from '../context/AuthContext';
import VoiceNoteButton from './VoiceNoteButton';
import GifPicker from './GifPicker';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const ACCEPT_TYPES = 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg,audio/webm,application/pdf';

const MessageInput = forwardRef(function MessageInput({ onSend, onTyping, disabled, placeholder = 'Type a message...', replyTo, onClearReply, onSchedule }, ref) {
  const { token } = useAuth();
  const [text, setText] = useState('');
  const [pendingMedia, setPendingMedia] = useState(null); // { url, mediaType, mediaName, preview }
  const [uploading, setUploading] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [sendPulse, setSendPulse] = useState(0);
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);

  // Focus input when replying
  useEffect(() => {
    if (replyTo) {
      inputRef.current?.focus();
    }
  }, [replyTo]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (disabled) return;
    if (!text.trim() && !pendingMedia) return;

    onSend(text, pendingMedia, replyTo || null);
    setText('');
    setPendingMedia(null);
    onClearReply?.();
    onTyping(false);
    setSendPulse((p) => p + 1); // retrigger the send-dart animation
  };

  const handleChange = (e) => {
    setText(e.target.value);
    onTyping(e.target.value.length > 0);
  };

  const uploadFile = async (file) => {
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('File too large. Max size is 10MB.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      const data = await res.json();

      // Create a local preview for images
      let preview = null;
      if (data.mediaType === 'image') {
        preview = URL.createObjectURL(file);
      }

      setPendingMedia({
        url: data.url,
        mediaType: data.mediaType,
        mediaName: data.mediaName,
        preview,
      });
    } catch (err) {
      alert(err.message || 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  // Expose imperative methods for parent (drop zone, conversation starters)
  useImperativeHandle(ref, () => ({
    handleDroppedFile: (file) => uploadFile(file),
    setDraft: (draft) => {
      setText(draft);
      inputRef.current?.focus();
    },
  }));

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    await uploadFile(file);
  };

  // Drag & drop handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      await uploadFile(file);
    }
  };

  const handleGifSelect = (gif) => {
    setShowGifPicker(false);
    // Send GIF as a media message immediately
    onSend('', { url: gif.mp4 || gif.url, mediaType: gif.mp4 ? 'gif' : 'image', mediaName: 'GIF' }, replyTo || null);
    onClearReply?.();
  };

  const clearPendingMedia = () => {
    if (pendingMedia?.preview) {
      URL.revokeObjectURL(pendingMedia.preview);
    }
    setPendingMedia(null);
  };

  return (
    <div
      className="shrink-0 bg-white border-t border-cafe-200/50 relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 bg-cafe-100/90 border-2 border-dashed border-cafe-400 rounded-xl z-50 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <svg className="w-8 h-8 text-cafe-500 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-cafe-600 text-sm font-medium">Drop file here</p>
          </div>
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <div className="px-4 pt-3 pb-0">
          <div className="flex items-center gap-2 bg-cafe-50 border border-cafe-200 rounded-xl px-3 py-2 border-l-4 border-l-cafe-500">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-cafe-600">
                Replying to {replyTo.sender?.username || 'Unknown'}
              </p>
              <p className="text-xs text-cafe-400 truncate">
                {replyTo.text
                  ? (replyTo.text.length > 80 ? replyTo.text.slice(0, 80) + '...' : replyTo.text)
                  : replyTo.mediaType ? `[${replyTo.mediaType}]` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={onClearReply}
              className="text-cafe-400 hover:text-red-500 transition-colors p-1 shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Pending media preview */}
      {pendingMedia && (
        <div className="px-4 pt-3 pb-0">
          <div className="inline-flex items-center gap-2 bg-cafe-50 border border-cafe-200 rounded-xl px-3 py-2">
            {pendingMedia.mediaType === 'image' && pendingMedia.preview ? (
              <img src={pendingMedia.preview} alt="Preview" className="w-12 h-12 rounded-lg object-cover" />
            ) : pendingMedia.mediaType === 'video' ? (
              <div className="w-12 h-12 rounded-lg bg-cafe-200 flex items-center justify-center">
                <svg className="w-5 h-5 text-cafe-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            ) : pendingMedia.mediaType === 'audio' ? (
              <div className="w-10 h-10 rounded-lg bg-cafe-200 flex items-center justify-center">
                <svg className="w-5 h-5 text-cafe-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
                </svg>
              </div>
            ) : (
              <div className="w-10 h-10 rounded-lg bg-cafe-200 flex items-center justify-center">
                <svg className="w-5 h-5 text-cafe-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs text-cafe-700 font-medium truncate max-w-[150px]">{pendingMedia.mediaName}</p>
              <p className="text-[10px] text-cafe-400 capitalize">{pendingMedia.mediaType}</p>
            </div>
            <button
              type="button"
              onClick={clearPendingMedia}
              className="text-cafe-400 hover:text-red-500 transition-colors p-1 -mr-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Uploading indicator */}
      {uploading && (
        <div className="px-4 pt-3 pb-0">
          <div className="inline-flex items-center gap-2 bg-cafe-50 border border-cafe-200 rounded-xl px-3 py-2 text-xs text-cafe-500">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Uploading...
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2 p-4">
        {/* File picker button */}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_TYPES}
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          className="p-3 rounded-xl text-cafe-400 hover:text-cafe-700 hover:bg-cafe-100 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          title="Attach file"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        </button>

        {/* GIF picker button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowGifPicker(!showGifPicker)}
            disabled={disabled || uploading}
            className="p-3 rounded-xl text-cafe-400 hover:text-cafe-700 hover:bg-cafe-100 transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed shrink-0 font-bold text-xs"
            title="Send a GIF"
          >
            GIF
          </button>
          {showGifPicker && (
            <GifPicker
              onSelect={handleGifSelect}
              onClose={() => setShowGifPicker(false)}
            />
          )}
        </div>

        {/* Voice note button */}
        <VoiceNoteButton
          onSend={(text, media) => {
            onSend(text, media, null);
            onTyping(false);
          }}
          disabled={disabled || uploading}
        />

        <input
          type="text"
          value={text}
          onChange={handleChange}
          ref={inputRef}
          placeholder={disabled ? 'Connecting...' : uploading ? 'Uploading...' : placeholder}
          disabled={disabled || uploading}
          className="flex-1 bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-3
                     border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 focus:border-cafe-300
                     disabled:opacity-50 transition-colors"
        />
        {/* Schedule button */}
        {onSchedule && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSchedulePicker(!showSchedulePicker)}
              disabled={disabled || uploading || !text.trim()}
              className="p-3 rounded-xl text-cafe-400 hover:text-cafe-700 hover:bg-cafe-100 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              title="Schedule message"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            {showSchedulePicker && (
              <div className="absolute bottom-full right-0 mb-2 bg-white border border-cafe-200 rounded-2xl shadow-warm-lg p-4 w-64 z-50">
                <p className="text-sm font-medium text-cafe-700 mb-3">Schedule message</p>
                <div className="space-y-2 mb-3">
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full bg-cafe-50 border border-cafe-200 rounded-xl px-3 py-2 text-sm text-cafe-800 focus:ring-2 focus:ring-cafe-300 focus:outline-none"
                  />
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full bg-cafe-50 border border-cafe-200 rounded-xl px-3 py-2 text-sm text-cafe-800 focus:ring-2 focus:ring-cafe-300 focus:outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSchedulePicker(false)}
                    className="flex-1 text-xs text-cafe-500 hover:bg-cafe-100 py-2 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!scheduleDate || !scheduleTime}
                    onClick={() => {
                      const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`);
                      if (scheduledAt <= new Date()) {
                        alert('Please pick a time in the future');
                        return;
                      }
                      onSchedule(text, scheduledAt.toISOString());
                      setText('');
                      setScheduleDate('');
                      setScheduleTime('');
                      setShowSchedulePicker(false);
                      onTyping(false);
                    }}
                    className="flex-1 text-xs bg-cafe-700 text-white hover:bg-cafe-800 disabled:bg-cafe-300 py-2 rounded-xl transition-colors font-medium"
                  >
                    Schedule
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={disabled || uploading || (!text.trim() && !pendingMedia)}
          className="bg-cafe-700 hover:bg-cafe-800 disabled:bg-cafe-200 disabled:text-cafe-400 disabled:cursor-not-allowed
                     text-white font-medium px-6 py-3 rounded-xl transition-all duration-200 shadow-warm hover:shadow-warm-lg"
        >
          <span className="inline-flex items-center gap-1.5">
            Send
            <svg
              key={sendPulse}
              className={`w-3.5 h-3.5 ${sendPulse > 0 ? 'animate-send-dart' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </span>
        </button>
      </form>
    </div>
  );
});

export default MessageInput;
