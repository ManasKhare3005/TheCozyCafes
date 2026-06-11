import bcrypt from 'bcryptjs';
import { customAlphabet } from 'nanoid';
import prisma from '../lib/prisma.js';
import { generateToken } from '../lib/jwt.js';
import { verifyCaptchaToken } from '../lib/captcha.js';
import { sendEmail } from '../lib/email.js';
import { getRequestIpHash } from '../lib/ipBan.js';
import { renderEmailTemplate } from '../lib/emailTemplates.js';
import {
  AUTH_TOKEN_TYPES,
  createAuthToken,
  hashAuthToken,
  shouldExposeDebugAuthTokens,
} from '../lib/authTokens.js';

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const MINIMUM_SIGNUP_AGE = 13;
const TERMS_VERSION = '2026-05-27';
const PRIVACY_VERSION = '2026-05-27';
const referralCodeGenerator = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

const userSelect = {
  id: true,
  email: true,
  username: true,
  discriminator: true,
  role: true,
  avatar: true,
  bio: true,
  mood: true,
  status: true,
  emailVerifiedAt: true,
  ageConfirmedAt: true,
  termsAcceptedAt: true,
  privacyAcceptedAt: true,
  termsVersion: true,
  privacyVersion: true,
  onboardingCompletedAt: true,
  referralCode: true,
  createdAt: true,
};

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function normalizeUsername(username) {
  return typeof username === 'string' ? username.trim() : '';
}

function cleanReferralCode(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned ? cleaned.slice(0, 24) : null;
}

function formatUser(user) {
  if (!user) return null;
  return {
    ...user,
    emailVerified: Boolean(user.emailVerifiedAt),
  };
}

function referralBackfill(user) {
  return user?.referralCode ? undefined : referralCodeGenerator();
}

function requiresEmailVerification() {
  if (process.env.REQUIRE_EMAIL_VERIFICATION === 'true') return true;
  if (process.env.REQUIRE_EMAIL_VERIFICATION === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

function appUrl() {
  return process.env.APP_URL || process.env.CLIENT_URL || 'http://localhost:5173';
}

function genericResetResponse(extra = {}) {
  return {
    message: 'If that email exists, a password reset link has been sent.',
    ...extra,
  };
}

async function requireCaptcha(req, res) {
  const ok = await verifyCaptchaToken(req.body?.captchaToken, req.ip);
  if (!ok) {
    res.status(400).json({ error: 'CAPTCHA verification failed' });
    return false;
  }
  return true;
}

async function findUserByEmail(email) {
  return prisma.user.findFirst({
    where: {
      email: {
        equals: normalizeEmail(email),
        mode: 'insensitive',
      },
    },
  });
}

async function issueEmailVerification(user) {
  await prisma.authToken.deleteMany({
    where: {
      userId: user.id,
      type: AUTH_TOKEN_TYPES.EMAIL_VERIFICATION,
      usedAt: null,
    },
  });

  const { token, expiresAt } = await createAuthToken({
    userId: user.id,
    type: AUTH_TOKEN_TYPES.EMAIL_VERIFICATION,
    ttlMs: EMAIL_VERIFICATION_TTL_MS,
  });

  const verifyUrl = `${appUrl()}/?verifyEmailToken=${encodeURIComponent(token)}`;
  const email = renderEmailTemplate('email_verification', {
    username: user.username,
    url: verifyUrl,
  });
  await sendEmail({
    to: user.email,
    ...email,
  });

  if (!shouldExposeDebugAuthTokens()) {
    return {};
  }

  return {
    debugEmailVerificationToken: token,
    debugEmailVerificationUrl: verifyUrl,
    emailVerificationExpiresAt: expiresAt,
  };
}

async function issuePasswordReset(user) {
  await prisma.authToken.deleteMany({
    where: {
      userId: user.id,
      type: AUTH_TOKEN_TYPES.PASSWORD_RESET,
      usedAt: null,
    },
  });

  const { token, expiresAt } = await createAuthToken({
    userId: user.id,
    type: AUTH_TOKEN_TYPES.PASSWORD_RESET,
    ttlMs: PASSWORD_RESET_TTL_MS,
  });

  const resetUrl = `${appUrl()}/?resetPasswordToken=${encodeURIComponent(token)}`;
  const email = renderEmailTemplate('password_reset', {
    username: user.username,
    url: resetUrl,
  });
  await sendEmail({
    to: user.email,
    ...email,
  });

  if (!shouldExposeDebugAuthTokens()) {
    return {};
  }

  return {
    debugPasswordResetToken: token,
    debugPasswordResetUrl: resetUrl,
    passwordResetExpiresAt: expiresAt,
  };
}

async function sendWelcomeEmail(user) {
  const email = renderEmailTemplate('welcome', { username: user.username });
  await sendEmail({
    to: user.email,
    ...email,
  });
}

function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return 'Password is required';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  return null;
}

function parseDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day, date };
}

function getAge(dateParts, now = new Date()) {
  let age = now.getUTCFullYear() - dateParts.year;
  const currentMonth = now.getUTCMonth() + 1;
  const currentDay = now.getUTCDate();

  if (
    currentMonth < dateParts.month ||
    (currentMonth === dateParts.month && currentDay < dateParts.day)
  ) {
    age -= 1;
  }

  return age;
}

function validateSignupCompliance({ birthDate, acceptTerms, acceptPrivacy }) {
  if (acceptTerms !== true || acceptPrivacy !== true) {
    return 'You must accept the Terms of Service and Privacy Policy to create an account';
  }

  const parsed = parseDateOnly(birthDate);
  if (!parsed) {
    return 'Valid birth date is required';
  }

  const now = new Date();
  if (parsed.date > now) {
    return 'Valid birth date is required';
  }

  if (getAge(parsed, now) < MINIMUM_SIGNUP_AGE) {
    return 'You must be at least 13 years old to create an account';
  }

  if (getAge(parsed, now) > 120) {
    return 'Valid birth date is required';
  }

  return null;
}

export async function register(req, res) {
  try {
    if (!(await requireCaptcha(req, res))) return;

    const email = normalizeEmail(req.body.email);
    const username = normalizeUsername(req.body.username);
    const { password, birthDate, acceptTerms, acceptPrivacy } = req.body;
    const requestedReferralCode = cleanReferralCode(req.body.referralCode);

    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Email, username, and password are required' });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 3-20 characters' });
    }

    const complianceError = validateSignupCompliance({ birthDate, acceptTerms, acceptPrivacy });
    if (complianceError) {
      return res.status(400).json({ error: complianceError });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: email, mode: 'insensitive' } },
          { username: { equals: username, mode: 'insensitive' } },
        ],
      },
    });

    if (existingUser) {
      if (existingUser.email.toLowerCase() === email) {
        return res.status(400).json({ error: 'Email already registered' });
      }
      return res.status(400).json({ error: 'Username already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const discriminator = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    const lastIpHash = getRequestIpHash(req);
    let referredById = null;

    if (requestedReferralCode) {
      const referrer = await prisma.user.findUnique({
        where: { referralCode: requestedReferralCode },
        select: { id: true },
      });
      referredById = referrer?.id || null;
    }

    const user = await prisma.user.create({
      data: {
        email,
        username,
        discriminator,
        password: hashedPassword,
        ageConfirmedAt: new Date(),
        termsAcceptedAt: new Date(),
        privacyAcceptedAt: new Date(),
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        lastIpHash,
        referralCode: referralCodeGenerator(),
        referredById,
      },
      select: userSelect,
    });

    const verificationDebug = await issueEmailVerification(user);

    if (requiresEmailVerification()) {
      return res.status(201).json({
        message: 'Registration successful. Please verify your email before signing in.',
        emailVerificationRequired: true,
        ...verificationDebug,
      });
    }

    const token = generateToken({ userId: user.id });
    sendWelcomeEmail(user).catch((error) => console.error('Welcome email error:', error));
    res.status(201).json({
      message: 'Registration successful',
      user: formatUser(user),
      token,
      emailVerificationRequired: false,
      ...verificationDebug,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

export async function login(req, res) {
  try {
    if (!(await requireCaptcha(req, res))) return;

    const email = normalizeEmail(req.body.email);
    const { password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      return res.status(423).json({
        error: 'Account temporarily locked. Try again later.',
        lockedUntil: user.lockedUntil,
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      const failedLoginAttempts = user.lockedUntil && user.lockedUntil <= now
        ? 1
        : user.failedLoginAttempts + 1;
      const shouldLock = failedLoginAttempts >= LOCKOUT_THRESHOLD;
      const lockedUntil = shouldLock ? new Date(Date.now() + LOCKOUT_MS) : null;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts,
          lockedUntil,
        },
      });

      if (shouldLock) {
        return res.status(423).json({
          error: 'Account temporarily locked. Try again later.',
          lockedUntil,
        });
      }

      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (requiresEmailVerification() && !user.emailVerifiedAt) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastIpHash: getRequestIpHash(req),
        },
      });

      return res.status(403).json({
        error: 'Please verify your email before signing in.',
        emailVerificationRequired: true,
      });
    }

    const newLoginReferralCode = referralBackfill(user);
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastIpHash: getRequestIpHash(req),
        ...(newLoginReferralCode ? { referralCode: newLoginReferralCode } : {}),
      },
      select: userSelect,
    });

    const token = generateToken({ userId: user.id });

    res.json({
      message: 'Login successful',
      user: formatUser(updatedUser),
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

export async function getMe(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: userSelect,
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.referralCode) {
      const updatedUser = await prisma.user.update({
        where: { id: req.userId },
        data: { referralCode: referralCodeGenerator() },
        select: userSelect,
      });
      return res.json({ user: formatUser(updatedUser) });
    }

    res.json({ user: formatUser(user) });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

export async function requestPasswordReset(req, res) {
  try {
    if (!(await requireCaptcha(req, res))) return;

    const email = normalizeEmail(req.body.email);
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.json(genericResetResponse());
    }

    try {
      const debug = await issuePasswordReset(user);
      return res.json(genericResetResponse(debug));
    } catch (error) {
      console.error('Password reset email error:', error);
      return res.json(genericResetResponse());
    }
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

export async function confirmPasswordReset(req, res) {
  try {
    if (!(await requireCaptcha(req, res))) return;

    const { token, password } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Reset token is required' });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const tokenHash = hashAuthToken(token);
    const authToken = await prisma.authToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !authToken ||
      authToken.type !== AUTH_TOKEN_TYPES.PASSWORD_RESET ||
      authToken.usedAt ||
      authToken.expiresAt <= new Date()
    ) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: authToken.userId },
        data: {
          password: hashedPassword,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }),
      prisma.authToken.update({
        where: { id: authToken.id },
        data: { usedAt: new Date() },
      }),
      prisma.authToken.deleteMany({
        where: {
          userId: authToken.userId,
          type: AUTH_TOKEN_TYPES.PASSWORD_RESET,
          usedAt: null,
          id: { not: authToken.id },
        },
      }),
    ]);

    res.json({ message: 'Password reset successful. You can now sign in.' });
  } catch (error) {
    console.error('Password reset confirm error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

export async function verifyEmail(req, res) {
  try {
    const token = req.body.token || req.query.token;
    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    const tokenHash = hashAuthToken(token);
    const authToken = await prisma.authToken.findUnique({
      where: { tokenHash },
      include: { user: { select: userSelect } },
    });

    if (
      !authToken ||
      authToken.type !== AUTH_TOKEN_TYPES.EMAIL_VERIFICATION ||
      authToken.usedAt ||
      authToken.expiresAt <= new Date()
    ) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    const verifiedAt = authToken.user.emailVerifiedAt || new Date();
    const newReferralCode = referralBackfill(authToken.user);
    const [updatedUser] = await prisma.$transaction([
      prisma.user.update({
        where: { id: authToken.userId },
        data: {
          emailVerifiedAt: verifiedAt,
          ...(newReferralCode ? { referralCode: newReferralCode } : {}),
        },
        select: userSelect,
      }),
      prisma.authToken.update({
        where: { id: authToken.id },
        data: { usedAt: new Date() },
      }),
      prisma.authToken.deleteMany({
        where: {
          userId: authToken.userId,
          type: AUTH_TOKEN_TYPES.EMAIL_VERIFICATION,
          usedAt: null,
          id: { not: authToken.id },
        },
      }),
    ]);

    const jwt = generateToken({ userId: updatedUser.id });
    sendWelcomeEmail(updatedUser).catch((error) => console.error('Welcome email error:', error));
    res.json({
      message: 'Email verified successfully',
      user: formatUser(updatedUser),
      token: jwt,
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

export async function resendVerification(req, res) {
  try {
    if (!(await requireCaptcha(req, res))) return;

    const email = normalizeEmail(req.body.email);
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await findUserByEmail(email);
    if (!user || user.emailVerifiedAt) {
      return res.json({ message: 'If verification is needed, a new email has been sent.' });
    }

    try {
      const debug = await issueEmailVerification(user);
      return res.json({
        message: 'If verification is needed, a new email has been sent.',
        ...debug,
      });
    } catch (error) {
      console.error('Verification email error:', error);
      return res.json({ message: 'If verification is needed, a new email has been sent.' });
    }
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

export async function completeOnboarding(req, res) {
  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { onboardingCompletedAt: new Date() },
      select: userSelect,
    });

    res.json({ user: formatUser(user) });
  } catch (error) {
    console.error('Complete onboarding error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
}
