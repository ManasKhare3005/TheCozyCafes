import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  roomMember: {
    findUnique: vi.fn(),
  },
  message: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
}));

vi.mock('../../lib/prisma.js', () => ({ default: prismaMock }));

import { getMessages, getThreadMessages, searchMessages } from '../message.controller.js';

function createResponse() {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

function message(overrides = {}) {
  return {
    id: 'message-1',
    text: 'hello',
    roomId: 'room-1',
    senderId: 'user-1',
    createdAt: new Date('2026-05-29T12:00:00.000Z'),
    sender: { id: 'user-1', username: 'AdaCafe', avatar: null },
    replyTo: null,
    reactions: [],
    ...overrides,
  };
}

describe('message controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.roomMember.findUnique.mockResolvedValue({ id: 'membership-1' });
    prismaMock.message.findMany.mockResolvedValue([]);
    prismaMock.message.findUnique.mockResolvedValue(null);
  });

  it('does not fetch room messages for a non-member', async () => {
    prismaMock.roomMember.findUnique.mockResolvedValue(null);
    const req = {
      params: { roomId: 'room-1' },
      query: {},
      userId: 'user-1',
    };
    const res = createResponse();

    await getMessages(req, res);

    expect(prismaMock.roomMember.findUnique).toHaveBeenCalledWith({
      where: {
        userId_roomId: {
          userId: 'user-1',
          roomId: 'room-1',
        },
      },
    });
    expect(prismaMock.message.findMany).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not a member of this room' });
  });

  it('clamps message fetch limits and groups reactions by emoji', async () => {
    const older = message({
      id: 'message-older',
      text: 'older',
      createdAt: new Date('2026-05-29T11:00:00.000Z'),
      reactions: [{ emoji: 'like', userId: 'user-2' }],
    });
    const newer = message({
      id: 'message-newer',
      text: 'newer',
      createdAt: new Date('2026-05-29T12:00:00.000Z'),
      reactions: [
        { emoji: 'like', userId: 'user-2' },
        { emoji: 'like', userId: 'user-3' },
        { emoji: 'star', userId: 'user-4' },
      ],
    });
    prismaMock.message.findMany.mockResolvedValue([newer, older]);
    const req = {
      params: { roomId: 'room-1' },
      query: { limit: '500' },
      userId: 'user-1',
    };
    const res = createResponse();

    await getMessages(req, res);

    expect(prismaMock.message.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        roomId: 'room-1',
        isEphemeral: false,
        isDeleted: false,
        parentId: null,
      }),
      orderBy: { createdAt: 'desc' },
      take: 100,
    }));
    expect(res.json).toHaveBeenCalledWith({
      messages: [
        { ...older, reactions: { like: ['user-2'] } },
        { ...newer, reactions: { like: ['user-2', 'user-3'], star: ['user-4'] } },
      ],
    });
  });

  it('rejects message search queries shorter than two characters', async () => {
    const req = {
      params: { roomId: 'room-1' },
      query: { q: 'a' },
      userId: 'user-1',
    };
    const res = createResponse();

    await searchMessages(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Search query must be at least 2 characters',
    });
    expect(prismaMock.roomMember.findUnique).not.toHaveBeenCalled();
  });

  it('returns a 404 when a thread parent message is missing', async () => {
    const req = {
      params: { messageId: 'missing-message' },
      userId: 'user-1',
    };
    const res = createResponse();

    await getThreadMessages(req, res);

    expect(prismaMock.message.findUnique).toHaveBeenCalledWith({
      where: { id: 'missing-message' },
      select: { roomId: true },
    });
    expect(prismaMock.roomMember.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.message.findMany).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Message not found' });
  });
});
