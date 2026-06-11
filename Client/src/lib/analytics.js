const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || '';
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com').replace(/\/+$/, '');
const STORAGE_KEY = 'chatroom_analytics_id';

let identifiedUserId = null;

function isEnabled() {
  return Boolean(POSTHOG_KEY);
}

function getAnonymousId() {
  if (typeof window === 'undefined') return 'server';

  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;

    const id = window.crypto?.randomUUID?.() || `anon_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return `anon_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}

function posthogCapture(event, properties = {}, distinctId = identifiedUserId || getAnonymousId()) {
  if (!isEnabled() || typeof fetch === 'undefined') return;

  const payload = {
    api_key: POSTHOG_KEY,
    event,
    properties: {
      distinct_id: distinctId,
      app: 'chat-room-cafe',
      ...properties,
    },
  };

  fetch(`${POSTHOG_HOST}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

export function track(event, properties = {}) {
  posthogCapture(event, properties);
}

export function identifyAnalytics(user) {
  if (!user?.id) return;
  const anonymousId = getAnonymousId();
  identifiedUserId = user.id;

  posthogCapture('$identify', {
    $anon_distinct_id: anonymousId,
    $set: {
      username: user.username,
      role: user.role,
      created_at: user.createdAt,
    },
  }, user.id);
}

export function resetAnalytics() {
  identifiedUserId = null;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
