import { describe, expect, it } from 'vitest';
import { assertProductionConfig, validateProductionConfig } from '../config.js';

const goodProductionEnv = {
  NODE_ENV: 'production',
  JWT_SECRET: 'x'.repeat(64),
  IP_BAN_HASH_SECRET: 'i'.repeat(64),
  AUTH_DEBUG_TOKENS: 'false',
  REQUIRE_EMAIL_VERIFICATION: 'true',
  CLIENT_URL: 'https://chatroom.app',
  APP_URL: 'https://chatroom.app',
  ENFORCE_HTTPS: 'true',
  DATABASE_URL: 'postgresql://prod-user:prod-password@db.chatroom.internal:5432/chatroom',
  REDIS_URL: 'redis://redis.chatroom.internal:6379',
  SENTRY_DSN: 'https://public@sentry.ingest.chatroom.app/1',
  HCAPTCHA_SECRET: '0x'.padEnd(48, 'a'),
  RESEND_API_KEY: 're_'.padEnd(48, 'a'),
  EMAIL_FROM: 'Chat Room Cafe <noreply@chatroom.app>',
  CLOUDINARY_CLOUD_NAME: 'chatroom-prod',
  CLOUDINARY_API_KEY: 'cloudinary-key',
  CLOUDINARY_API_SECRET: 'cloudinary-secret',
  GROQ_API_KEY: 'gsk_'.padEnd(48, 'a'),
  GIPHY_API_KEY: 'giphy-key',
};

describe('production config validation', () => {
  it('skips validation outside production', () => {
    expect(validateProductionConfig({
      NODE_ENV: 'development',
      JWT_SECRET: 'replace-with-a-secret',
    })).toEqual([]);
  });

  it('accepts a complete production configuration', () => {
    expect(validateProductionConfig(goodProductionEnv)).toEqual([]);
    expect(() => assertProductionConfig(goodProductionEnv)).not.toThrow();
  });

  it('rejects unsafe production defaults', () => {
    const errors = validateProductionConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'replace-with-a-long-random-secret-before-real-use',
      IP_BAN_HASH_SECRET: 'replace-with-a-long-random-secret-before-real-use',
      AUTH_DEBUG_TOKENS: 'true',
      REQUIRE_EMAIL_VERIFICATION: 'false',
      CLIENT_URL: 'http://localhost:5173',
      APP_URL: 'http://localhost:5173',
      ENFORCE_HTTPS: 'false',
      DATABASE_URL: '',
      REDIS_URL: '',
      SENTRY_DSN: '',
      HCAPTCHA_SECRET: '',
      RESEND_API_KEY: '',
      EMAIL_FROM: 'Chat Room Cafe <noreply@example.com>',
      CLOUDINARY_CLOUD_NAME: 'your-cloud-name',
      CLOUDINARY_API_KEY: 'your-api-key',
      CLOUDINARY_API_SECRET: 'your-api-secret',
      GROQ_API_KEY: 'your-groq-api-key',
      GIPHY_API_KEY: 'your-giphy-api-key',
    });

    expect(errors).toEqual([
      'JWT_SECRET must be a strong production secret of at least 48 characters',
      'IP_BAN_HASH_SECRET must be a stable production secret of at least 48 characters',
      'AUTH_DEBUG_TOKENS must be disabled in production',
      'REQUIRE_EMAIL_VERIFICATION must not be false in production',
      'CLIENT_URL must use https:// in production',
      'APP_URL must use https:// in production',
      'ENFORCE_HTTPS must be true in production',
      'DATABASE_URL must be set to a production database URL',
      'REDIS_URL must be set in production for Socket.IO scaling',
      'SENTRY_DSN must be set in production for error tracking',
      'HCAPTCHA_SECRET must be set in production',
      'RESEND_API_KEY must be set in production for auth email',
      'EMAIL_FROM must be set to a real production sender',
      'CLOUDINARY_CLOUD_NAME must be set in production',
      'CLOUDINARY_API_KEY must be set in production',
      'CLOUDINARY_API_SECRET must be set in production',
      'GROQ_API_KEY must be set in production',
      'GIPHY_API_KEY must be set in production',
    ]);
  });
});
