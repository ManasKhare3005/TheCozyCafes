import crypto from 'node:crypto';
import prisma from './prisma.js';

export const AUTH_TOKEN_TYPES = {
  EMAIL_VERIFICATION: 'email_verification',
  PASSWORD_RESET: 'password_reset',
};

export function createRawAuthToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashAuthToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createAuthToken({ userId, type, ttlMs }) {
  const token = createRawAuthToken();
  const tokenHash = hashAuthToken(token);
  const expiresAt = new Date(Date.now() + ttlMs);

  await prisma.authToken.create({
    data: {
      tokenHash,
      type,
      expiresAt,
      userId,
    },
  });

  return { token, tokenHash, expiresAt };
}

export function shouldExposeDebugAuthTokens() {
  return process.env.NODE_ENV !== 'production' && process.env.AUTH_DEBUG_TOKENS === 'true';
}
