import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  ipBan: {
    findFirst: vi.fn(),
  },
}));

vi.mock('../prisma.js', () => ({ default: prismaMock }));

import {
  findActiveIpBan,
  getIpHash,
  getRequestIp,
  getRequestIpHash,
  getSocketIp,
  getSocketIpHash,
  ipBanMiddleware,
  normalizeIp,
  socketIpBanMiddleware,
} from '../ipBan.js';

function createResponse() {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe('IP ban helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.ipBan.findFirst.mockResolvedValue(null);
  });

  it('normalizes proxied, IPv4-mapped, and bracketed addresses', () => {
    expect(normalizeIp('203.0.113.10, 10.0.0.5')).toBe('203.0.113.10');
    expect(normalizeIp('::ffff:192.0.2.44')).toBe('192.0.2.44');
    expect(normalizeIp('[2001:db8::1]:443')).toBe('2001:db8::1');
    expect(normalizeIp('')).toBeNull();
  });

  it('extracts request and socket IPs from trusted connection surfaces', () => {
    expect(getRequestIp({
      headers: { 'x-forwarded-for': '198.51.100.7, 10.0.0.1' },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.2' },
    })).toBe('198.51.100.7');

    expect(getSocketIp({
      handshake: {
        headers: { 'x-forwarded-for': '::ffff:192.0.2.9' },
        address: '127.0.0.1',
      },
    })).toBe('192.0.2.9');
  });

  it('hashes IPs without exposing the raw address', () => {
    const env = { IP_BAN_HASH_SECRET: 'a-local-secret-only-used-for-ip-ban-tests' };
    const first = getIpHash('203.0.113.12', env);
    const second = getIpHash('203.0.113.12', env);

    expect(first).toBe(second);
    expect(first).toHaveLength(64);
    expect(first).not.toContain('203.0.113.12');
  });

  it('queries only active non-expired bans', async () => {
    const now = new Date('2026-06-10T00:00:00.000Z');

    await findActiveIpBan('ip-hash-1', now);

    expect(prismaMock.ipBan.findFirst).toHaveBeenCalledWith({
      where: {
        ipHash: 'ip-hash-1',
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
    });
  });

  it('lets health checks through without a database lookup', async () => {
    const middleware = ipBanMiddleware();
    const next = vi.fn();

    await middleware({ path: '/ready', headers: {} }, createResponse(), next);

    expect(next).toHaveBeenCalledWith();
    expect(prismaMock.ipBan.findFirst).not.toHaveBeenCalled();
  });

  it('attaches request IP hashes and blocks active bans', async () => {
    const ban = { id: 'ban-1', expiresAt: null };
    prismaMock.ipBan.findFirst.mockResolvedValueOnce(ban);
    const req = {
      path: '/api/rooms',
      headers: { 'x-forwarded-for': '203.0.113.42' },
    };
    const res = createResponse();
    const next = vi.fn();

    await ipBanMiddleware()(req, res, next);

    expect(getRequestIpHash(req)).toBe(req.ipHash);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Access blocked by moderation',
      banId: 'ban-1',
      expiresAt: null,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('checks socket connections before accepting them', async () => {
    const socket = {
      handshake: {
        headers: { 'x-forwarded-for': '198.51.100.15' },
      },
    };
    const next = vi.fn();

    await socketIpBanMiddleware(socket, next);

    expect(socket.ipHash).toBe(getSocketIpHash(socket));
    expect(next).toHaveBeenCalledWith();

    prismaMock.ipBan.findFirst.mockResolvedValueOnce({ id: 'ban-2' });
    const blockedNext = vi.fn();
    await socketIpBanMiddleware({
      handshake: {
        headers: { 'x-forwarded-for': '198.51.100.16' },
      },
    }, blockedNext);

    expect(blockedNext).toHaveBeenCalledWith(expect.any(Error));
    expect(blockedNext.mock.calls[0][0].message).toBe('Access blocked by moderation');
  });
});
