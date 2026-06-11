import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.routes.js';
import roomRoutes from './routes/room.routes.js';
import messageRoutes from './routes/message.routes.js';
import kickRoutes from './routes/kick.routes.js';
import baristaRoutes from './routes/barista.routes.js';
import friendRoutes from './routes/friend.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import userRoutes from './routes/user.routes.js';
import pollRoutes from './routes/poll.routes.js';
import confessionRoutes from './routes/confession.routes.js';
import stickyRoutes from './routes/sticky.routes.js';
import gifRoutes from './routes/gif.routes.js';
import bookmarkRoutes from './routes/bookmark.routes.js';
import menuRoutes from './routes/menu.routes.js';
import eventRoutes from './routes/event.routes.js';
import badgeRoutes from './routes/badge.routes.js';
import musicRoutes from './routes/music.routes.js';
import lostfoundRoutes from './routes/lostfound.routes.js';
import bulletinRoutes from './routes/bulletin.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import scheduledRoutes from './routes/scheduled.routes.js';
import linkpreviewRoutes from './routes/linkpreview.routes.js';
import moderationRoutes from './routes/moderation.routes.js';
import { setupSocketHandlers, getRoomUsers } from './socket/handlers.js';
import { processExpiredVotes, setSocketInstance } from './controllers/kick.controller.js';
import { setSocketInstance as setMusicSocketInstance } from './controllers/music.controller.js';
import logger, { installConsoleBridge, requestLogger } from './lib/logger.js';
import { assertProductionConfig } from './lib/config.js';
import {
  createHelmetOptions,
  createHttpsRedirectMiddleware,
  parseBooleanEnv,
  parseTrustProxy,
} from './lib/security.js';
import {
  captureException,
  flushSentry,
  initSentry,
  isSentryEnabled,
  requestErrorMiddleware,
} from './lib/sentry.js';
import { ipBanMiddleware } from './lib/ipBan.js';

initSentry();
installConsoleBridge({ captureException });
assertProductionConfig();

const app = express();
const httpServer = createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ENFORCE_HTTPS = parseBooleanEnv(process.env.ENFORCE_HTTPS, IS_PRODUCTION);
const TRUST_PROXY = parseTrustProxy(process.env.TRUST_PROXY, IS_PRODUCTION ? 1 : false);
const HSTS_MAX_AGE = Number.parseInt(process.env.HSTS_MAX_AGE || '31536000', 10);
const HTTPS_REDIRECT_ORIGIN = process.env.HTTPS_REDIRECT_ORIGIN
  || (process.env.APP_URL?.startsWith('https://') ? process.env.APP_URL : '');

if (TRUST_PROXY !== false) {
  app.set('trust proxy', TRUST_PROXY);
}

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
  },
});

async function configureSocketAdapter() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    logger.info('Socket.IO Redis adapter disabled: REDIS_URL is not set');
    return null;
  }

  const pubClient = createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();

  pubClient.on('error', (err) => logger.error({ err }, 'Redis pub client error'));
  subClient.on('error', (err) => logger.error({ err }, 'Redis sub client error'));

  try {
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    logger.info('Socket.IO Redis adapter connected');
    return { pubClient, subClient };
  } catch (err) {
    logger.error({ err }, 'Socket.IO Redis adapter setup failed');
    captureException(err, { subsystem: 'socket.io.redis' });
    await Promise.allSettled([quitRedisClient(pubClient), quitRedisClient(subClient)]);

    if (process.env.NODE_ENV === 'production') {
      throw err;
    }

    logger.warn('Continuing without the Redis adapter outside production');
    return null;
  }
}

const socketAdapterClients = await configureSocketAdapter();

function quitRedisClient(client) {
  return client?.isOpen ? client.quit() : Promise.resolve();
}

// Security headers
app.use(createHttpsRedirectMiddleware({
  enabled: ENFORCE_HTTPS,
  httpsOrigin: HTTPS_REDIRECT_ORIGIN || undefined,
}));
app.use(helmet(createHelmetOptions({
  enforceHttps: ENFORCE_HTTPS,
  hstsMaxAge: Number.isFinite(HSTS_MAX_AGE) ? HSTS_MAX_AGE : 31536000,
})));

// CORS — restrict to client origin only
app.use(cors({
  origin: CLIENT_URL,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  credentials: true,
}));
app.use(requestLogger);

// Body parser with size limit (1MB max)
app.use(express.json({ limit: '1mb' }));
app.use(ipBanMiddleware());

// Global rate limiter — per IP. Note: dorm/campus/office networks share one
// public IP across many users, so this is intentionally generous; per-user
// abuse is handled by the socket-level token buckets and auth limiter.
const GLOBAL_RATE_LIMIT_MAX = Number.parseInt(process.env.GLOBAL_RATE_LIMIT_MAX || '300', 10);
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number.isFinite(GLOBAL_RATE_LIMIT_MAX) ? GLOBAL_RATE_LIMIT_MAX : 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health' || req.path === '/ready',
  message: { error: 'Too many requests, please try again later' },
});
app.use(globalLimiter);

// Strict rate limiter for auth routes — 10 attempts per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later' },
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/ready', async (req, res) => {
  const checks = {
    database: { status: 'unknown' },
    redis: { status: process.env.REDIS_URL ? 'unknown' : 'disabled' },
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database.status = 'ok';
  } catch (err) {
    checks.database.status = 'down';
    checks.database.error = 'database check failed';
    logger.error({ err }, 'Readiness database check failed');
  }

  if (process.env.REDIS_URL) {
    const redisReady = Boolean(
      socketAdapterClients?.pubClient?.isReady &&
      socketAdapterClients?.subClient?.isReady
    );
    checks.redis.status = redisReady ? 'ok' : 'down';
  }

  const ready = checks.database.status === 'ok' && checks.redis.status !== 'down';
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    checks,
  });
});

// API routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api', kickRoutes);
app.use('/api/barista', baristaRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/users', userRoutes);
app.use('/api', pollRoutes);
app.use('/api', confessionRoutes);
app.use('/api/sticky', stickyRoutes);
app.use('/api/gifs', gifRoutes);
app.use('/api', bookmarkRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api', eventRoutes);
app.use('/api/badges', badgeRoutes);
app.use('/api', musicRoutes);
app.use('/api/lostfound', lostfoundRoutes);
app.use('/api/bulletins', bulletinRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/scheduled', scheduledRoutes);
app.use('/api/link-preview', linkpreviewRoutes);
app.use('/api/moderation', moderationRoutes);
app.use(requestErrorMiddleware);

// Setup socket handlers
setupSocketHandlers(io);

// Pass socket instance to kick controller
setSocketInstance(io, getRoomUsers());

// Pass socket instance to music controller
setMusicSocketInstance(io);

// Process expired votes every 5 minutes
setInterval(async () => {
  const processed = await processExpiredVotes();
  if (processed > 0) {
    logger.info({ processed }, 'Processed expired vote(s)');
  }
}, 5 * 60 * 1000);

// Clean up expired lost & found posts and bulletins every hour
import prisma from './lib/prisma.js';
setInterval(async () => {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { count: posts } = await prisma.lostFoundPost.deleteMany({
      where: { expiresAt: { lt: new Date() }, status: 'open' },
    });
    const { count: bulletins } = await prisma.cafeBulletin.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    const { count: stickies } = await prisma.stickyNote.deleteMany({
      where: { createdAt: { lt: oneDayAgo } },
    });
    // Incognito messages are persisted briefly for moderation only; honor the
    // "ephemeral" promise by hard-deleting them after 24 hours.
    const { count: ephemerals } = await prisma.message.deleteMany({
      where: { isEphemeral: true, createdAt: { lt: oneDayAgo } },
    });
    if (posts > 0 || bulletins > 0 || stickies > 0 || ephemerals > 0) {
      logger.info({ posts, bulletins, stickies, ephemerals }, 'Cleaned up expired content');
    }
  } catch (err) {
    logger.error({ err }, 'Cleanup failed');
    captureException(err, { job: 'expired-content-cleanup' });
  }
}, 60 * 60 * 1000);

// Process scheduled messages every 30 seconds
setInterval(async () => {
  try {
    const now = new Date();

    // Recover rows stuck in "sending" (server crashed mid-send): anything
    // claimed more than 5 minutes ago goes back to pending.
    await prisma.scheduledMessage.updateMany({
      where: {
        status: 'sending',
        claimedAt: { lte: new Date(now.getTime() - 5 * 60 * 1000) },
      },
      data: { status: 'pending', claimedAt: null },
    });

    const dueMessages = await prisma.scheduledMessage.findMany({
      where: {
        status: 'pending',
        scheduledAt: { lte: now },
      },
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
      },
    });

    for (const msg of dueMessages) {
      try {
        // Claim this row atomically before sending so a concurrent server
        // instance (or an overlapping tick) can't double-send it.
        const { count: claimed } = await prisma.scheduledMessage.updateMany({
          where: { id: msg.id, status: 'pending' },
          data: { status: 'sending', claimedAt: now },
        });
        if (claimed === 0) continue; // someone else claimed it
        // Create actual message in the room
        const savedMessage = await prisma.message.create({
          data: {
            text: msg.text,
            senderId: msg.senderId,
            roomId: msg.roomId,
          },
          include: {
            sender: { select: { id: true, username: true, avatar: true } },
          },
        });

        // Broadcast to room via socket
        io.to(msg.roomId).emit('message:received', {
          id: savedMessage.id,
          text: savedMessage.text,
          sender: savedMessage.sender,
          realSenderId: msg.senderId,
          timestamp: savedMessage.createdAt.toISOString(),
          isEphemeral: false,
          isAnonymous: false,
        });

        // Notify all room members for unread count
        const members = await prisma.roomMember.findMany({
          where: { roomId: msg.roomId },
          select: { userId: true },
        });
        for (const member of members) {
          if (member.userId !== msg.senderId) {
            io.to(`user:${member.userId}`).emit('room:new:message', {
              roomId: msg.roomId,
              senderId: msg.senderId,
            });
          }
        }

        // Mark as sent
        await prisma.scheduledMessage.update({
          where: { id: msg.id },
          data: { status: 'sent' },
        });

        logger.info({ messageId: msg.id, roomId: msg.roomId }, 'Sent scheduled message');
      } catch (err) {
        logger.error({ err, messageId: msg.id, roomId: msg.roomId }, 'Failed to send scheduled message');
        captureException(err, { job: 'scheduled-message-send', messageId: msg.id, roomId: msg.roomId });
        // Release the claim so the message retries next tick instead of
        // being stuck in "sending" forever.
        await prisma.scheduledMessage.updateMany({
          where: { id: msg.id, status: 'sending' },
          data: { status: 'pending' },
        }).catch(() => {});
      }
    }
  } catch (err) {
    logger.error({ err }, 'Scheduled message processor error');
    captureException(err, { job: 'scheduled-message-processor' });
  }
}, 30 * 1000);

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  logger.info({
    port: PORT,
    sentryEnabled: isSentryEnabled(),
  }, 'Server running');
});

let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, 'Shutdown signal received');
  const closeServer = new Promise((resolve) => {
    httpServer.close(resolve);
  });

  await Promise.allSettled([
    closeServer,
    quitRedisClient(socketAdapterClients?.pubClient),
    quitRedisClient(socketAdapterClients?.subClient),
    prisma.$disconnect(),
    flushSentry(),
  ]);
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.error({ err }, 'Unhandled promise rejection');
  captureException(err, { process: 'unhandledRejection' });
});
process.on('uncaughtException', async (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  captureException(err, { process: 'uncaughtException' });
  await flushSentry();
  process.exit(1);
});
