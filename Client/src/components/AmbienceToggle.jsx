import React, { useState, useRef, useEffect } from 'react';
import socketService from '../services/socket';

const AMBIENCE_TRACKS = [
  { id: 'cafe', name: 'Cafe Lofi', emoji: '☕', url: '/sounds/Cafe_lofi.mp3' },
  { id: 'rain', name: 'Rain & Thunder', emoji: '🌧️', url: '/sounds/Rain_and_Thunder.mp3' },
  { id: 'fireplace', name: 'Fireplace', emoji: '🔥', url: '/sounds/Fireplace.mp3' },
  { id: 'jazz', name: 'Jazz Lofi', emoji: '🎷', url: '/sounds/Jazz_lofi.mp3' },
  { id: 'ocean', name: 'Ocean Waves', emoji: '🌊', url: '/sounds/Ocean_waves.mp3' },
  { id: 'birds', name: 'Birds', emoji: '🐦', url: '/sounds/Birds.mp3' },
  { id: 'crickets', name: 'Crickets', emoji: '🦗', url: '/sounds/Crickets.mp3' },
  { id: 'street', name: 'Street', emoji: '🏙️', url: '/sounds/Street.mp3' },
  { id: 'windchime', name: 'Wind Chimes', emoji: '🎐', url: '/sounds/Wind_Chime.mp3' },
];

function AmbienceToggle() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTrack, setActiveTrack] = useState('cafe');
  const [volume, setVolume] = useState(0.3);
  const [showPicker, setShowPicker] = useState(false);
  const audioRef = useRef(null);
  const pickerRef = useRef(null);

  // Close picker when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Handle play/pause
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.loop = true;
    }

    const audio = audioRef.current;
    const track = AMBIENCE_TRACKS.find((t) => t.id === activeTrack);

    if (isPlaying && track) {
      if (audio.src !== track.url) {
        audio.src = track.url;
      }
      audio.volume = volume;
      audio.play().catch(() => {
        // Autoplay may be blocked
        setIsPlaying(false);
      });
    } else {
      audio.pause();
    }

    return () => {
      // Don't stop on unmount — let it keep playing
    };
  }, [isPlaying, activeTrack, volume]);

  // Broadcast ambient status to room
  useEffect(() => {
    if (isPlaying) {
      const track = AMBIENCE_TRACKS.find((t) => t.id === activeTrack);
      socketService.setAmbience(activeTrack, track?.emoji, track?.name);
    } else {
      socketService.setAmbience(null, null, null);
    }
  }, [isPlaying, activeTrack]);

  // Update volume reactively
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Cleanup on full unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const currentTrack = AMBIENCE_TRACKS.find((t) => t.id === activeTrack);

  return (
    <div className="relative" ref={pickerRef}>
      <button
        onClick={() => setShowPicker(!showPicker)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm transition-all ${
          isPlaying
            ? 'bg-cafe-700 text-white shadow-warm'
            : 'bg-cafe-100 text-cafe-600 hover:bg-cafe-200'
        }`}
        title={isPlaying ? `Playing: ${currentTrack?.name}` : 'Ambience mode'}
      >
        <span className="text-sm">{isPlaying ? currentTrack?.emoji : '🎵'}</span>
        <span className="hidden sm:inline text-xs">{isPlaying ? 'On' : 'Ambience'}</span>
      </button>

      {showPicker && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-warm-lg border border-cafe-200/50 overflow-hidden z-50">
          <div className="p-3 border-b border-cafe-100">
            <p className="text-xs font-medium text-cafe-700 mb-2">Ambience Sounds</p>
            <div className="space-y-1">
              {AMBIENCE_TRACKS.map((track) => (
                <button
                  key={track.id}
                  onClick={() => {
                    setActiveTrack(track.id);
                    setIsPlaying(true);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-left transition-colors ${
                    activeTrack === track.id && isPlaying
                      ? 'bg-cafe-100 text-cafe-800 font-medium'
                      : 'text-cafe-600 hover:bg-cafe-50'
                  }`}
                >
                  <span>{track.emoji}</span>
                  <span className="flex-1">{track.name}</span>
                  {activeTrack === track.id && isPlaying && (
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Volume slider */}
          <div className="p-3 border-b border-cafe-100">
            <div className="flex items-center gap-2">
              <span className="text-xs text-cafe-400">🔈</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="flex-1 accent-cafe-700 h-1"
              />
              <span className="text-xs text-cafe-400">🔊</span>
            </div>
          </div>

          {/* Toggle */}
          <div className="p-2">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`w-full py-2 rounded-xl text-sm font-medium transition-colors ${
                isPlaying
                  ? 'bg-red-50 text-red-600 hover:bg-red-100'
                  : 'bg-cafe-700 text-white hover:bg-cafe-800'
              }`}
            >
              {isPlaying ? 'Stop' : 'Play'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AmbienceToggle;
