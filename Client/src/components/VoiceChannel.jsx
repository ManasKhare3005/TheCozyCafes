import React from 'react';
import socketService from '../services/socket';

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || name.slice(0, 2).toUpperCase();
}

function VoiceChannel({ voiceUsers, isInVoice, isMuted, onJoin, onLeave, onToggleMute }) {
  const currentSocketId = socketService.socket?.id;

  return (
    <div className="shrink-0 bg-white border-t border-cafe-200/50">
      {/* Voice users list — always visible when someone is in voice */}
      {voiceUsers.length > 0 && (
        <div className="px-4 pt-3 pb-1">
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs font-semibold text-cafe-600 uppercase tracking-wide">
              Voice Channel
            </span>
            <span className="text-xs text-cafe-400">({voiceUsers.length})</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {voiceUsers.map((u) => (
              <div
                key={u.socketId}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs ${
                  u.socketId === currentSocketId
                    ? 'bg-cafe-700 text-white'
                    : 'bg-cafe-50 text-cafe-700 border border-cafe-200/50'
                }`}
              >
                <div className={`w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0 ${
                  u.socketId === currentSocketId
                    ? 'bg-white/20 text-white'
                    : 'bg-cafe-200 text-cafe-600'
                }`}>
                  {getInitials(u.username)}
                </div>
                <span className="truncate max-w-[80px]">{u.username}</span>
                {u.isMuted && (
                  <svg className="w-3 h-3 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                )}
                {!u.isMuted && (
                  <svg className={`w-3 h-3 shrink-0 ${u.socketId === currentSocketId ? 'text-green-300' : 'text-green-500'}`}
                       fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="px-4 py-3 flex items-center gap-2">
        {isInVoice ? (
          <>
            {/* Mute toggle */}
            <button
              type="button"
              onClick={onToggleMute}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                isMuted
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-cafe-100 text-cafe-600 hover:bg-cafe-200'
              }`}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              )}
              {isMuted ? 'Muted' : 'Mic On'}
            </button>

            {/* Leave voice */}
            <button
              type="button"
              onClick={onLeave}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium
                         bg-red-600 text-white hover:bg-red-700 transition-colors ml-auto"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
              </svg>
              Leave
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onJoin}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium w-full justify-center
                       bg-green-600 text-white hover:bg-green-700 transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            Join Voice
          </button>
        )}
      </div>
    </div>
  );
}

export default VoiceChannel;
