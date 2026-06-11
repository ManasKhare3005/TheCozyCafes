// Tiny synthesized UI sounds (WebAudio, no asset files).
// Cup clink for incoming messages, soft door chime when someone joins.
// Respects a persistent mute preference.

const PREF_KEY = 'cozy-ui-sounds';

let audioCtx = null;
let lastPlayed = 0;

function getCtx() {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  // Browsers suspend audio contexts created before user interaction
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

export function isSoundOn() {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundOn(on) {
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
  } catch {
    // storage unavailable — sounds just stay session-default
  }
}

function playTone(ctx, { freq, type = 'sine', start = 0, duration = 0.15, gain = 0.08 }) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + start;
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

function throttled() {
  // Burst protection — at most one sound per 150ms
  const now = Date.now();
  if (now - lastPlayed < 150) return true;
  lastPlayed = now;
  return false;
}

// Porcelain "clink" — short bright ping with a fast harmonic
export function playClink() {
  if (!isSoundOn() || throttled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    playTone(ctx, { freq: 1850, duration: 0.09, gain: 0.05 });
    playTone(ctx, { freq: 2750, start: 0.005, duration: 0.07, gain: 0.025 });
  } catch {
    // audio blocked — fine, stay silent
  }
}

// Soft two-note door chime for someone arriving
export function playChime() {
  if (!isSoundOn() || throttled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    playTone(ctx, { freq: 880, duration: 0.25, gain: 0.05 });
    playTone(ctx, { freq: 1318.5, start: 0.12, duration: 0.3, gain: 0.04 });
  } catch {
    // audio blocked — fine, stay silent
  }
}
