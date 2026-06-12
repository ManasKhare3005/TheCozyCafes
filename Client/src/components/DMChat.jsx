import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDMChat } from '../hooks/useDMChat';
import { useDMCall } from '../hooks/useDMCall';
import ChatMessage from './ChatMessage';
import MessageInput from './MessageInput';
import TypingIndicator from './TypingIndicator';
import CafeLoader from './CafeLoader';
import { IncomingCallOverlay, ActiveCallBar, CallingOverlay, VideoCallView } from './CallOverlay';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || name.slice(0, 2).toUpperCase();
}

const MOOD_CONFIG = {
  chill: { emoji: '😌', label: 'Chill' },
  busy: { emoji: '🔴', label: 'Busy' },
  caffeinated: { emoji: '☕', label: 'Caffeinated' },
  sleepy: { emoji: '😴', label: 'Sleepy' },
  creative: { emoji: '🎨', label: 'Creative' },
  chatty: { emoji: '💬', label: 'Chatty' },
  focused: { emoji: '🎯', label: 'Focused' },
  vibing: { emoji: '🎵', label: 'Vibing' },
};

function DMChat({ friend, onBack, isOnline, friendMood }) {
  const { user, token } = useAuth();
  const {
    messages,
    typingUser,
    isLoadingHistory,
    sendMessage,
    setTyping,
  } = useDMChat(token, user, friend.id);

  const messagesEndRef = useRef(null);
  const [replyingTo, setReplyingTo] = useState(null);

  const {
    callState,
    callType,
    incomingCall,
    isMuted,
    isVideoOn,
    callDuration,
    localVideoRef,
    remoteVideoRef,
    remoteAudioRef,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
  } = useDMCall(friend.id);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const typingUsers = typingUser ? [typingUser] : [];

  const reportFriend = async () => {
    if (!window.confirm(`Report ${friend.username} to moderation?`)) return;
    try {
      const details = window.prompt('Optional context for moderators') || '';
      await fetch(`${API_URL}/moderation/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetType: 'user',
          targetUserId: friend.id,
          reason: 'other',
          details,
        }),
      });
    } catch (error) {
      console.error('Failed to report user:', error);
    }
  };

  const blockFriend = async () => {
    if (!window.confirm(`Block ${friend.username}? This removes the friendship and stops DMs/calls.`)) return;
    try {
      await fetch(`${API_URL}/moderation/blocks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ blockedUserId: friend.id }),
      });
      onBack();
    } catch (error) {
      console.error('Failed to block user:', error);
    }
  };

  return (
    <div className="flex-1 min-h-0 h-full flex flex-col overflow-hidden bg-cafe-50">
      {/* Header */}
      <header className="shrink-0 bg-white border-b border-cafe-200/50 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="p-2 rounded-xl text-cafe-400 hover:text-cafe-700 hover:bg-cafe-100 transition-colors -ml-2"
            title="Back to lobby"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cafe-300 to-cafe-600
                              flex items-center justify-center text-white font-serif font-bold text-sm shadow-sm">
                {getInitials(friend.username)}
              </div>
              <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                isOnline ? 'bg-green-500' : 'bg-cafe-300'
              }`} />
            </div>
            <div className="text-left">
              <h1 className="text-lg font-serif font-bold text-cafe-900">{friend.username}</h1>
              <p className={`text-sm ${isOnline ? 'text-green-600' : 'text-cafe-400'}`}>
                {isOnline
                  ? (friendMood && MOOD_CONFIG[friendMood]
                    ? `${MOOD_CONFIG[friendMood].emoji} ${MOOD_CONFIG[friendMood].label}`
                    : 'Online')
                  : 'Offline'}
              </p>
            </div>
          </div>
        </div>

        {/* Call buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={reportFriend}
            className="p-2.5 rounded-xl text-cafe-500 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Report user"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </button>
          <button
            onClick={blockFriend}
            className="p-2.5 rounded-xl text-cafe-500 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Block user"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636A9 9 0 115.636 18.364 9 9 0 0118.364 5.636zM7.05 7.05l9.9 9.9" />
            </svg>
          </button>
          <button
            onClick={() => startCall('voice')}
            disabled={callState !== 'idle'}
            className="p-2.5 rounded-xl text-cafe-500 hover:text-green-600 hover:bg-green-50 transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed"
            title="Voice call"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </button>
          <button
            onClick={() => startCall('video')}
            disabled={callState !== 'idle'}
            className="p-2.5 rounded-xl text-cafe-500 hover:text-green-600 hover:bg-green-50 transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed"
            title="Video call"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Call state banners */}
      {callState === 'calling' && (
        <CallingOverlay friendName={friend.username} onCancel={endCall} />
      )}
      {callState === 'active' && callType === 'voice' && (
        <ActiveCallBar
          friendName={friend.username}
          callType={callType}
          callDuration={callDuration}
          isMuted={isMuted}
          isVideoOn={isVideoOn}
          onToggleMute={toggleMute}
          onToggleVideo={toggleVideo}
          onEndCall={endCall}
        />
      )}

      {/* Hidden audio element for voice calls */}
      <audio ref={remoteAudioRef} autoPlay />

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 chat-messages">
        {isLoadingHistory ? (
          <div className="flex items-center justify-center h-full">
            <CafeLoader size="small" message="Loading messages..." />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-cafe-400">
            <div className="text-center">
              <span className="text-4xl block mb-3">💬</span>
              <p className="font-serif text-lg text-cafe-500">Start chatting with {friend.username}</p>
              <p className="text-sm mt-1">Say hi!</p>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              isOwnMessage={message.sender?.id === user.id}
              onReply={setReplyingTo}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing indicator */}
      <TypingIndicator typingUsers={typingUsers} />

      {/* Message input */}
      <MessageInput
        onSend={sendMessage}
        onTyping={setTyping}
        placeholder={`Message ${friend.username}...`}
        replyTo={replyingTo}
        onClearReply={() => setReplyingTo(null)}
      />

      {/* Incoming call popup */}
      {incomingCall && callState === 'idle' && (
        <IncomingCallOverlay
          callerName={incomingCall.callerName}
          callType={incomingCall.callType}
          onAccept={acceptCall}
          onReject={rejectCall}
        />
      )}

      {/* Full-screen video call */}
      {callState === 'active' && callType === 'video' && (
        <VideoCallView
          localVideoRef={localVideoRef}
          remoteVideoRef={remoteVideoRef}
          friendName={friend.username}
          callDuration={callDuration}
          isMuted={isMuted}
          isVideoOn={isVideoOn}
          onToggleMute={toggleMute}
          onToggleVideo={toggleVideo}
          onEndCall={endCall}
        />
      )}
    </div>
  );
}

export default DMChat;
