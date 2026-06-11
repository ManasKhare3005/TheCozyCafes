import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  user: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  authToken: {
    findUnique: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

const bcryptMock = vi.hoisted(() => ({
  hash: vi.fn(),
  compare: vi.fn(),
}));

const jwtMock = vi.hoisted(() => ({
  generateToken: vi.fn(),
}));

const captchaMock = vi.hoisted(() => ({
  verifyCaptchaToken: vi.fn(),
}));

const emailMock = vi.hoisted(() => ({
  sendEmail: vi.fn(),
}));

const authTokenMock = vi.hoisted(() => ({
  AUTH_TOKEN_TYPES: {
    EMAIL_VERIFICATION: 'email_verification',
    PASSWORD_RESET: 'password_reset',
  },
  createAuthToken: vi.fn(),
  hashAuthToken: vi.fn(),
  shouldExposeDebugAuthTokens: vi.fn(),
}));

vi.mock('../../lib/prisma.js', () => ({ default: prismaMock }));
vi.mock('bcryptjs', () => ({ default: bcryptMock }));
vi.mock('../../lib/jwt.js', () => jwtMock);
vi.mock('../../lib/captcha.js', () => captchaMock);
vi.mock('../../lib/email.js', () => emailMock);
vi.mock('../../lib/authTokens.js', () => authTokenMock);

import {
  confirmPasswordReset,
  getMe,
  login,
  register,
  requestPasswordReset,
  resendVerification,
  verifyEmail,
} from '../auth.controller.js';

function createResponse() {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

function validSignupBody(overrides = {}) {
  return {
    email: 'ada@example.com',
    username: 'AdaCafe',
    password: 'correct-password',
    birthDate: '2000-01-01',
    acceptTerms: true,
    acceptPrivacy: true,
    ...overrides,
  };
}

function dbUser(overrides = {}) {
  return {
    id: 'user-1',
    email: 'ada@example.com',
    username: 'AdaCafe',
    discriminator: '1234',
    role: 'user',
    avatar: null,
    bio: null,
    mood: null,
    status: 'offline',
    password: 'stored-password',
    failedLoginAttempts: 0,
    lockedUntil: null,
    emailVerifiedAt: null,
    ageConfirmedAt: new Date('2026-05-29T12:00:00.000Z'),
    termsAcceptedAt: new Date('2026-05-29T12:00:00.000Z'),
    privacyAcceptedAt: new Date('2026-05-29T12:00:00.000Z'),
    termsVersion: '2026-05-27',
    privacyVersion: '2026-05-27',
    onboardingCompletedAt: null,
    referralCode: 'ABC12345',
    createdAt: new Date('2026-05-29T12:00:00.000Z'),
    ...overrides,
  };
}

describe('auth controller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-29T12:00:00.000Z'));
    vi.clearAllMocks();

    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    process.env.AUTH_DEBUG_TOKENS = 'false';

    prismaMock.$transaction.mockImplementation(async (operations) => operations);
    prismaMock.user.findUnique.mockResolvedValue(dbUser());
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue(dbUser());
    prismaMock.user.update.mockResolvedValue(dbUser({ emailVerifiedAt: new Date('2026-05-29T12:00:00.000Z') }));
    prismaMock.authToken.findUnique.mockResolvedValue(null);
    prismaMock.authToken.update.mockReturnValue({ operation: 'update-auth-token' });
    prismaMock.authToken.deleteMany.mockResolvedValue({ count: 0 });
    bcryptMock.hash.mockResolvedValue('hashed-password');
    bcryptMock.compare.mockResolvedValue(true);
    jwtMock.generateToken.mockReturnValue('signed-jwt');
    captchaMock.verifyCaptchaToken.mockResolvedValue(true);
    emailMock.sendEmail.mockResolvedValue({ delivered: false });
    authTokenMock.createAuthToken.mockResolvedValue({
      token: 'email-token',
      expiresAt: new Date('2026-05-30T12:00:00.000Z'),
    });
    authTokenMock.hashAuthToken.mockReturnValue('hashed-token');
    authTokenMock.shouldExposeDebugAuthTokens.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.REQUIRE_EMAIL_VERIFICATION;
    delete process.env.AUTH_DEBUG_TOKENS;
  });

  it('rejects underage signups before writing user data', async () => {
    const req = {
      body: validSignupBody({ birthDate: '2015-01-01' }),
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'You must be at least 13 years old to create an account',
    });
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('normalizes signup data and returns a token when verification is optional', async () => {
    const req = {
      body: validSignupBody({
        email: '  ADA@Example.COM  ',
        username: '  AdaCafe  ',
      }),
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await register(req, res);

    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { email: { equals: 'ada@example.com', mode: 'insensitive' } },
          { username: { equals: 'AdaCafe', mode: 'insensitive' } },
        ],
      },
    });
    expect(bcryptMock.hash).toHaveBeenCalledWith('correct-password', 12);
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'ada@example.com',
        username: 'AdaCafe',
        password: 'hashed-password',
        ageConfirmedAt: expect.any(Date),
        termsAcceptedAt: expect.any(Date),
        privacyAcceptedAt: expect.any(Date),
      }),
      select: expect.any(Object),
    });
    expect(authTokenMock.createAuthToken).toHaveBeenCalledWith({
      userId: 'user-1',
      type: 'email_verification',
      ttlMs: expect.any(Number),
    });
    expect(emailMock.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'ada@example.com',
      subject: 'Verify your Chat Room Cafe email',
    }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Registration successful',
      token: 'signed-jwt',
      emailVerificationRequired: false,
      user: expect.objectContaining({
        id: 'user-1',
        emailVerified: false,
      }),
    }));
  });

  it('locks an account after the fifth failed login attempt', async () => {
    prismaMock.user.findFirst.mockResolvedValue(dbUser({
      failedLoginAttempts: 4,
    }));
    bcryptMock.compare.mockResolvedValue(false);
    const req = {
      body: {
        email: 'ada@example.com',
        password: 'wrong-password',
      },
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await login(req, res);

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        failedLoginAttempts: 5,
        lockedUntil: expect.any(Date),
      },
    });
    expect(res.status).toHaveBeenCalledWith(423);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Account temporarily locked. Try again later.',
      lockedUntil: expect.any(Date),
    }));
    expect(jwtMock.generateToken).not.toHaveBeenCalled();
  });

  it('blocks login for unverified email when verification is required', async () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
    prismaMock.user.findFirst.mockResolvedValue(dbUser({
      failedLoginAttempts: 2,
      emailVerifiedAt: null,
    }));
    const req = {
      body: {
        email: 'ada@example.com',
        password: 'correct-password',
      },
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await login(req, res);

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastIpHash: expect.any(String),
      },
    });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Please verify your email before signing in.',
      emailVerificationRequired: true,
    });
    expect(jwtMock.generateToken).not.toHaveBeenCalled();
  });

  it('logs in verified users and resets lockout counters', async () => {
    const verifiedUser = dbUser({
      failedLoginAttempts: 2,
      emailVerifiedAt: new Date('2026-05-01T10:00:00.000Z'),
    });
    prismaMock.user.findFirst.mockResolvedValue(verifiedUser);
    prismaMock.user.update.mockResolvedValue(verifiedUser);
    const req = {
      body: {
        email: 'ADA@EXAMPLE.COM',
        password: 'correct-password',
      },
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await login(req, res);

    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: {
        email: {
          equals: 'ada@example.com',
          mode: 'insensitive',
        },
      },
    });
    expect(bcryptMock.compare).toHaveBeenCalledWith('correct-password', 'stored-password');
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastIpHash: expect.any(String),
      },
      select: expect.any(Object),
    });
    expect(jwtMock.generateToken).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(res.json).toHaveBeenCalledWith({
      message: 'Login successful',
      user: expect.objectContaining({ id: 'user-1', emailVerified: true }),
      token: 'signed-jwt',
    });
  });

  it('returns the current user with a derived emailVerified flag', async () => {
    prismaMock.user.findUnique.mockResolvedValue(dbUser({
      emailVerifiedAt: new Date('2026-05-01T10:00:00.000Z'),
    }));
    const req = { userId: 'user-1' };
    const res = createResponse();

    await getMe(req, res);

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: expect.any(Object),
    });
    expect(res.json).toHaveBeenCalledWith({
      user: expect.objectContaining({ id: 'user-1', emailVerified: true }),
    });
  });

  it('uses a generic password reset response when the email is unknown', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    const req = {
      body: { email: 'unknown@example.com' },
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await requestPasswordReset(req, res);

    expect(authTokenMock.createAuthToken).not.toHaveBeenCalled();
    expect(emailMock.sendEmail).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      message: 'If that email exists, a password reset link has been sent.',
    });
  });

  it('issues password reset emails without revealing account existence beyond the generic message', async () => {
    prismaMock.user.findFirst.mockResolvedValue(dbUser());
    authTokenMock.createAuthToken.mockResolvedValue({
      token: 'reset token with spaces',
      expiresAt: new Date('2026-05-29T13:00:00.000Z'),
    });
    authTokenMock.shouldExposeDebugAuthTokens.mockReturnValue(true);
    const req = {
      body: { email: 'ada@example.com' },
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await requestPasswordReset(req, res);

    expect(prismaMock.authToken.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        type: 'password_reset',
        usedAt: null,
      },
    });
    expect(authTokenMock.createAuthToken).toHaveBeenCalledWith({
      userId: 'user-1',
      type: 'password_reset',
      ttlMs: expect.any(Number),
    });
    expect(emailMock.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'ada@example.com',
      subject: 'Reset your Chat Room Cafe password',
      text: expect.stringContaining('resetPasswordToken=reset%20token%20with%20spaces'),
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'If that email exists, a password reset link has been sent.',
      debugPasswordResetToken: 'reset token with spaces',
      debugPasswordResetUrl: expect.stringContaining('resetPasswordToken=reset%20token%20with%20spaces'),
    }));
  });

  it('confirms a valid password reset token and invalidates other reset tokens', async () => {
    const authToken = {
      id: 'auth-token-1',
      userId: 'user-1',
      type: 'password_reset',
      usedAt: null,
      expiresAt: new Date('2026-05-29T13:00:00.000Z'),
      user: dbUser(),
    };
    prismaMock.authToken.findUnique.mockResolvedValue(authToken);
    prismaMock.user.update.mockReturnValue({ operation: 'update-password' });
    prismaMock.authToken.deleteMany.mockReturnValue({ operation: 'delete-old-reset-tokens' });
    bcryptMock.hash.mockResolvedValue('new-hashed-password');
    const req = {
      body: {
        token: 'reset-token',
        password: 'new-password',
      },
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await confirmPasswordReset(req, res);

    expect(authTokenMock.hashAuthToken).toHaveBeenCalledWith('reset-token');
    expect(prismaMock.authToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: 'hashed-token' },
      include: { user: true },
    });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        password: 'new-hashed-password',
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    expect(prismaMock.$transaction).toHaveBeenCalledWith([
      { operation: 'update-password' },
      { operation: 'update-auth-token' },
      { operation: 'delete-old-reset-tokens' },
    ]);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Password reset successful. You can now sign in.',
    });
  });

  it('verifies email tokens, marks them used, and returns a login token', async () => {
    const unverifiedUser = dbUser({ emailVerifiedAt: null });
    const updatedUser = dbUser({
      emailVerifiedAt: new Date('2026-05-29T12:00:00.000Z'),
    });
    prismaMock.authToken.findUnique.mockResolvedValue({
      id: 'auth-token-1',
      userId: 'user-1',
      type: 'email_verification',
      usedAt: null,
      expiresAt: new Date('2026-05-29T13:00:00.000Z'),
      user: unverifiedUser,
    });
    prismaMock.user.update.mockReturnValue(updatedUser);
    prismaMock.authToken.deleteMany.mockReturnValue({ operation: 'delete-old-verification-tokens' });
    prismaMock.$transaction.mockResolvedValue([updatedUser]);
    const req = {
      body: { token: 'verify-token' },
      query: {},
    };
    const res = createResponse();

    await verifyEmail(req, res);

    expect(prismaMock.authToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: 'hashed-token' },
      include: { user: { select: expect.any(Object) } },
    });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { emailVerifiedAt: expect.any(Date) },
      select: expect.any(Object),
    });
    expect(jwtMock.generateToken).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(res.json).toHaveBeenCalledWith({
      message: 'Email verified successfully',
      user: expect.objectContaining({ id: 'user-1', emailVerified: true }),
      token: 'signed-jwt',
    });
  });

  it('quietly resends verification only for existing unverified users', async () => {
    prismaMock.user.findFirst.mockResolvedValue(dbUser({ emailVerifiedAt: null }));
    authTokenMock.shouldExposeDebugAuthTokens.mockReturnValue(true);
    const req = {
      body: { email: 'ada@example.com' },
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await resendVerification(req, res);

    expect(authTokenMock.createAuthToken).toHaveBeenCalledWith({
      userId: 'user-1',
      type: 'email_verification',
      ttlMs: expect.any(Number),
    });
    expect(emailMock.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      subject: 'Verify your Chat Room Cafe email',
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'If verification is needed, a new email has been sent.',
      debugEmailVerificationToken: 'email-token',
    }));
  });
});
