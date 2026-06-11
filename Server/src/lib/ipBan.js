import crypto from 'node:crypto';
import prisma from './prisma.js';

const EXEMPT_PATHS = new Set(['/health', '/ready']);

export function normalizeIp(value) {
  if (!value || typeof value !== 'string') return null;
  const first = value.split(',')[0].trim();
  if (!first) return null;
  return first
    .replace(/^::ffff:/, '')
    .replace(/^\[(.*)](?::\d+)?$/, '$1')
    .replace(/^([^:]+):\d+$/, '$1');
}

export function getIpHash(ip, env = process.env) {
  const normalized = normalizeIp(ip);
  if (!normalized) return null;
  const secret = env.IP_BAN_HASH_SECRET || env.JWT_SECRET || 'local-development-ip-ban-secret';
  return crypto.createHmac('sha256', secret).update(normalized).digest('hex');
}

export function getRequestIp(req) {
  return normalizeIp(req.headers?.['x-forwarded-for']) || normalizeIp(req.ip) || normalizeIp(req.socket?.remoteAddress);
}

export function getSocketIp(socket) {
  return normalizeIp(socket.handshake?.headers?.['x-forwarded-for']) || normalizeIp(socket.handshake?.address);
}

export function getRequestIpHash(req) {
  return getIpHash(getRequestIp(req));
}

export function getSocketIpHash(socket) {
  return getIpHash(getSocketIp(socket));
}

export async function findActiveIpBan(ipHash, now = new Date(), client = prisma) {
  if (!ipHash) return null;
  return client.ipBan.findFirst({
    where: {
      ipHash,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: now } },
      ],
    },
  });
}

export function ipBanMiddleware() {
  return async (req, res, next) => {
    try {
      if (EXEMPT_PATHS.has(req.path)) return next();

      const ipHash = getRequestIpHash(req);
      req.ipHash = ipHash;

      const ban = await findActiveIpBan(ipHash);
      if (ban) {
        return res.status(403).json({
          error: 'Access blocked by moderation',
          banId: ban.id,
          expiresAt: ban.expiresAt,
        });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export async function socketIpBanMiddleware(socket, next) {
  try {
    const ipHash = getSocketIpHash(socket);
    socket.ipHash = ipHash;

    const ban = await findActiveIpBan(ipHash);
    if (ban) {
      return next(new Error('Access blocked by moderation'));
    }

    return next();
  } catch {
    return next(new Error('IP moderation check failed'));
  }
}
