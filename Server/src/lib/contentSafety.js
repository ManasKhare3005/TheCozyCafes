const DEFAULT_BLOCKED_TERMS = [
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'cunt',
  'dick',
  'pussy',
  'slut',
  'whore',
  'kill yourself',
  'kys',
];

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+|\b[a-z0-9.-]+\.(?:com|net|org|io|gg|me|app|dev|co|in|ai|xyz|link|ly)(?:\/[^\s<>"']*)?/gi;
const INVITE_LINK_PATTERN = /(?:discord\.gg|discord(?:app)?\.com\/invite|t\.me\/|telegram\.me\/|chat\.whatsapp\.com|wa\.me\/|signal\.group|bit\.ly|tinyurl\.com|cutt\.ly|shorturl\.at)/i;
const REPEATED_CHAR_PATTERN = /(.)\1{39,}/;

const DEFAULT_MESSAGES = {
  banned_term: 'That message contains language we do not allow here.',
  too_many_links: 'Too many links in one message.',
  repeated_link: 'Please avoid repeating the same link.',
  invite_link_spam: 'Too many invite or short links in one message.',
  repeated_char_spam: 'Please shorten repeated characters before sending.',
  repeated_message: 'Please avoid sending the same message repeatedly.',
  link_burst: 'Please slow down with links.',
};

function splitCsv(value) {
  if (!value || typeof value !== 'string') return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeForSafety(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[@]/g, 'a')
    .replace(/[$]/g, 's')
    .replace(/[0]/g, 'o')
    .replace(/[1|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4]/g, 'a')
    .replace(/[5]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function getBlockedTerms(extraBlockedTerms = []) {
  return [
    ...DEFAULT_BLOCKED_TERMS,
    ...splitCsv(process.env.CONTENT_BANNED_TERMS),
    ...extraBlockedTerms,
  ]
    .map(normalizeForSafety)
    .filter(Boolean);
}

function containsBlockedTerm(text, extraBlockedTerms) {
  const normalized = normalizeForSafety(text);
  if (!normalized) return false;

  const words = new Set(normalized.split(/\s+/));
  const paddedText = ` ${normalized} `;

  return getBlockedTerms(extraBlockedTerms).some((term) => {
    if (term.includes(' ')) {
      return paddedText.includes(` ${term} `);
    }
    return words.has(term);
  });
}

export function extractLinks(text) {
  return [...String(text || '').matchAll(URL_PATTERN)]
    .map((match) => match[0].replace(/[).,!?;:]+$/g, '').toLowerCase());
}

function decision(code) {
  return {
    allowed: false,
    code,
    message: DEFAULT_MESSAGES[code] || 'That message cannot be sent.',
  };
}

export function evaluateTextSafety(text, options = {}) {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) return { allowed: true };

  const {
    maxLinks = 3,
    maxInviteLinks = 1,
    extraBlockedTerms = [],
  } = options;

  if (containsBlockedTerm(trimmed, extraBlockedTerms)) {
    return decision('banned_term');
  }

  if (REPEATED_CHAR_PATTERN.test(trimmed)) {
    return decision('repeated_char_spam');
  }

  const links = extractLinks(trimmed);
  if (links.length > maxLinks) {
    return decision('too_many_links');
  }

  if (links.length >= 2 && new Set(links).size < links.length) {
    return decision('repeated_link');
  }

  const inviteLinkCount = links.filter((link) => INVITE_LINK_PATTERN.test(link)).length;
  if (inviteLinkCount > maxInviteLinks) {
    return decision('invite_link_spam');
  }

  return { allowed: true };
}

export function checkSocketSpam(socket, channel, text, now = Date.now()) {
  const normalized = normalizeForSafety(text);
  if (!normalized || normalized.length < 3) return { allowed: true };

  if (!socket.contentSafetyHistory) {
    socket.contentSafetyHistory = new Map();
  }

  const key = channel || 'default';
  const windowMs = 60 * 1000;
  const history = (socket.contentSafetyHistory.get(key) || [])
    .filter((entry) => now - entry.at <= windowMs);
  const links = extractLinks(text);

  history.push({
    at: now,
    normalized,
    hasLink: links.length > 0,
  });

  socket.contentSafetyHistory.set(key, history);

  const sameMessageCount = history.filter((entry) => entry.normalized === normalized).length;
  if (normalized.length >= 8 && sameMessageCount >= 3) {
    return decision('repeated_message');
  }

  const recentLinkCount = history.filter((entry) => entry.hasLink && now - entry.at <= 20 * 1000).length;
  if (links.length > 0 && recentLinkCount >= 3) {
    return decision('link_burst');
  }

  return { allowed: true };
}
