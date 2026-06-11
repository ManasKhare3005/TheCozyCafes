const PLACEHOLDER_PATTERNS = [
  /replace-with/i,
  /your-secret/i,
  /\byour[-_\s]/i,
  /changeme/i,
  /example/i,
  /placeholder/i,
];

function isPlaceholder(value) {
  if (!value) return true;
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

export function validateProductionConfig(env = process.env) {
  if (env.NODE_ENV !== 'production') return [];

  const errors = [];

  if (isPlaceholder(env.JWT_SECRET) || String(env.JWT_SECRET || '').length < 48) {
    errors.push('JWT_SECRET must be a strong production secret of at least 48 characters');
  }

  if (isPlaceholder(env.IP_BAN_HASH_SECRET) || String(env.IP_BAN_HASH_SECRET || '').length < 48) {
    errors.push('IP_BAN_HASH_SECRET must be a stable production secret of at least 48 characters');
  }

  if (env.AUTH_DEBUG_TOKENS === 'true') {
    errors.push('AUTH_DEBUG_TOKENS must be disabled in production');
  }

  if (env.REQUIRE_EMAIL_VERIFICATION === 'false') {
    errors.push('REQUIRE_EMAIL_VERIFICATION must not be false in production');
  }

  if (!env.CLIENT_URL?.startsWith('https://')) {
    errors.push('CLIENT_URL must use https:// in production');
  }

  if (!env.APP_URL?.startsWith('https://')) {
    errors.push('APP_URL must use https:// in production');
  }

  if (env.ENFORCE_HTTPS !== 'true') {
    errors.push('ENFORCE_HTTPS must be true in production');
  }

  if (!env.DATABASE_URL || isPlaceholder(env.DATABASE_URL)) {
    errors.push('DATABASE_URL must be set to a production database URL');
  }

  if (!env.REDIS_URL || isPlaceholder(env.REDIS_URL)) {
    errors.push('REDIS_URL must be set in production for Socket.IO scaling');
  }

  if (!env.SENTRY_DSN || isPlaceholder(env.SENTRY_DSN)) {
    errors.push('SENTRY_DSN must be set in production for error tracking');
  }

  if (!env.HCAPTCHA_SECRET || isPlaceholder(env.HCAPTCHA_SECRET)) {
    errors.push('HCAPTCHA_SECRET must be set in production');
  }

  if (!env.RESEND_API_KEY || isPlaceholder(env.RESEND_API_KEY)) {
    errors.push('RESEND_API_KEY must be set in production for auth email');
  }

  if (!env.EMAIL_FROM || isPlaceholder(env.EMAIL_FROM)) {
    errors.push('EMAIL_FROM must be set to a real production sender');
  }

  if (!env.CLOUDINARY_CLOUD_NAME || isPlaceholder(env.CLOUDINARY_CLOUD_NAME)) {
    errors.push('CLOUDINARY_CLOUD_NAME must be set in production');
  }

  if (!env.CLOUDINARY_API_KEY || isPlaceholder(env.CLOUDINARY_API_KEY)) {
    errors.push('CLOUDINARY_API_KEY must be set in production');
  }

  if (!env.CLOUDINARY_API_SECRET || isPlaceholder(env.CLOUDINARY_API_SECRET)) {
    errors.push('CLOUDINARY_API_SECRET must be set in production');
  }

  if (!env.GROQ_API_KEY || isPlaceholder(env.GROQ_API_KEY)) {
    errors.push('GROQ_API_KEY must be set in production');
  }

  if (!env.GIPHY_API_KEY || isPlaceholder(env.GIPHY_API_KEY)) {
    errors.push('GIPHY_API_KEY must be set in production');
  }

  return errors;
}

export function assertProductionConfig(env = process.env) {
  const errors = validateProductionConfig(env);
  if (errors.length > 0) {
    throw new Error(`Invalid production configuration: ${errors.join('; ')}`);
  }
}
