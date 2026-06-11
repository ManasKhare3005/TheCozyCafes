import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  room: {
    findMany: vi.fn(),
  },
  message: {
    count: vi.fn(),
    groupBy: vi.fn(),
  },
}));

const txMock = vi.hoisted(() => ({
  room: {
    findUnique: vi.fn(),
  },
  roomMember: {
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
  },
  roomBan: {
    findUnique: vi.fn(),
  },
}));

const ioMock = vi.hoisted(() => ({
  emit: vi.fn(),
}));

const socketHandlersMock = vi.hoisted(() => ({
  getIo: vi.fn(),
}));

vi.mock('../../lib/prisma.js', () => ({ default: prismaMock }));
vi.mock('../../socket/handlers.js', () => socketHandlersMock);

import { getMyRooms, joinByCodeSecure, joinRoomSecure } from '../room.controller.js';

function createResponse() {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

function room(overrides = {}) {
  return {
    id: 'room-1',
    name: 'Quiet Table',
    ownerId: 'owner-1',
    code: null,
    isPrivate: false,
    isAnonymous: false,
    isLocked: false,
    maxMembers: 5,
    cafeHoursEnabled: false,
    cafeHoursStart: null,
    cafeHoursEnd: null,
    cafeHoursDays: null,
    cafeHoursTimezone: 'UTC',
    ...overrides,
  };
}

function roomWithClientFields(overrides = {}) {
  return {
    ...room(overrides),
    owner: { id: 'owner-1', username: 'OwnerCafe', avatar: null },
    _count: { members: 3 },
  };
}

function myRoom(overrides = {}) {
  return {
    ...room({
      id: 'room-1',
      ownerId: 'owner-1',
      code: 'invite-code',
      isAnonymous: false,
    }),
    owner: { id: 'owner-1', username: 'OwnerCafe', avatar: null },
    members: [
      {
        isAnonymous: false,
        lastReadAt: new Date('2026-05-29T11:00:00.000Z'),
      },
    ],
    _count: { members: 2, messages: 12 },
    updatedAt: new Date('2026-05-29T12:00:00.000Z'),
    ...overrides,
  };
}

function runTransactionWithTx(callback) {
  return callback(txMock);
}

describe('secure room joining', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-29T12:00:00.000Z'));
    vi.clearAllMocks();

    prismaMock.room.findMany.mockResolvedValue([]);
    prismaMock.message.groupBy.mockResolvedValue([]);
    prismaMock.$transaction.mockImplementation(runTransactionWithTx);
    txMock.room.findUnique
      .mockResolvedValueOnce(room())
      .mockResolvedValueOnce(roomWithClientFields());
    txMock.roomMember.findUnique.mockResolvedValue(null);
    txMock.roomMember.count.mockResolvedValue(2);
    txMock.roomMember.create.mockResolvedValue({ id: 'membership-1' });
    txMock.roomBan.findUnique.mockResolvedValue(null);
    socketHandlersMock.getIo.mockReturnValue(ioMock);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('joins a room inside a serializable transaction and emits the new member count', async () => {
    const req = {
      params: { roomId: 'room-1' },
      body: {},
      userId: 'user-1',
    };
    const res = createResponse();

    await joinRoomSecure(req, res);

    expect(prismaMock.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    expect(txMock.room.findUnique).toHaveBeenNthCalledWith(1, {
      where: { id: 'room-1' },
    });
    expect(txMock.roomMember.findUnique).toHaveBeenCalledWith({
      where: {
        userId_roomId: {
          userId: 'user-1',
          roomId: 'room-1',
        },
      },
    });
    expect(txMock.roomBan.findUnique).toHaveBeenCalledWith({
      where: {
        userId_roomId: {
          userId: 'user-1',
          roomId: 'room-1',
        },
      },
    });
    expect(txMock.roomMember.count).toHaveBeenCalledWith({ where: { roomId: 'room-1' } });
    expect(txMock.roomMember.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        roomId: 'room-1',
        isAnonymous: false,
      },
    });
    expect(ioMock.emit).toHaveBeenCalledWith('room:updated', {
      roomId: 'room-1',
      memberCount: 3,
    });
    expect(res.json).toHaveBeenCalledWith({
      room: expect.objectContaining({
        id: 'room-1',
        isAnonymousRoom: false,
        userIsAnonymous: false,
      }),
    });
  });

  it('rejects private room joins with the wrong invite code', async () => {
    txMock.room.findUnique.mockReset();
    txMock.room.findUnique.mockResolvedValue(room({
      isPrivate: true,
      code: 'correct-code',
    }));
    const req = {
      params: { roomId: 'room-1' },
      body: { code: 'wrong-code' },
      userId: 'user-1',
    };
    const res = createResponse();

    await joinRoomSecure(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid invite code' });
    expect(txMock.roomMember.create).not.toHaveBeenCalled();
    expect(ioMock.emit).not.toHaveBeenCalled();
  });

  it('rejects joins when moderation has locked the room', async () => {
    txMock.room.findUnique.mockReset();
    txMock.room.findUnique.mockResolvedValue(room({
      isLocked: true,
    }));
    const req = {
      params: { roomId: 'room-1' },
      body: {},
      userId: 'user-1',
    };
    const res = createResponse();

    await joinRoomSecure(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'This room is locked by moderation' });
    expect(txMock.roomMember.count).not.toHaveBeenCalled();
    expect(txMock.roomMember.create).not.toHaveBeenCalled();
  });

  it('rejects banned users before checking capacity or creating membership', async () => {
    txMock.roomBan.findUnique.mockResolvedValue({ id: 'ban-1' });
    const req = {
      params: { roomId: 'room-1' },
      body: {},
      userId: 'user-1',
    };
    const res = createResponse();

    await joinRoomSecure(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'You are banned from this room' });
    expect(txMock.roomMember.count).not.toHaveBeenCalled();
    expect(txMock.roomMember.create).not.toHaveBeenCalled();
  });

  it('rejects full rooms before creating membership', async () => {
    txMock.roomMember.count.mockResolvedValue(5);
    const req = {
      params: { roomId: 'room-1' },
      body: {},
      userId: 'user-1',
    };
    const res = createResponse();

    await joinRoomSecure(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'This table is full (5 members max)',
    });
    expect(txMock.roomMember.create).not.toHaveBeenCalled();
  });

  it('rejects joins outside cafe hours', async () => {
    txMock.room.findUnique.mockReset();
    txMock.room.findUnique.mockResolvedValue(room({
      cafeHoursEnabled: true,
      cafeHoursStart: '09:00',
      cafeHoursEnd: '10:00',
      cafeHoursDays: '0,1,2,3,4,5,6',
      cafeHoursTimezone: 'UTC',
    }));
    const req = {
      params: { roomId: 'room-1' },
      body: {},
      userId: 'user-1',
    };
    const res = createResponse();

    await joinRoomSecure(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'This cafe table is closed right now. Open 09:00-10:00 (UTC)',
    });
    expect(txMock.roomMember.count).not.toHaveBeenCalled();
    expect(txMock.roomMember.create).not.toHaveBeenCalled();
  });

  it('maps serializable transaction write conflicts to a retryable response', async () => {
    const conflict = new Error('write conflict');
    conflict.code = 'P2034';
    prismaMock.$transaction.mockRejectedValue(conflict);
    const req = {
      params: { roomId: 'room-1' },
      body: {},
      userId: 'user-1',
    };
    const res = createResponse();

    await joinRoomSecure(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'This table is busy. Please try joining again.',
    });
  });

  it('requires an invite code for join-by-code requests before starting a transaction', async () => {
    const req = {
      body: {},
      userId: 'user-1',
    };
    const res = createResponse();

    await joinByCodeSecure(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invite code is required' });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('uses the invite code as both lookup key and private-room credential', async () => {
    txMock.room.findUnique.mockReset();
    txMock.room.findUnique
      .mockResolvedValueOnce(room({
        id: 'private-room',
        isPrivate: true,
        code: 'join-code',
        isAnonymous: true,
      }))
      .mockResolvedValueOnce(roomWithClientFields({
        id: 'private-room',
        isPrivate: true,
        code: 'join-code',
        isAnonymous: true,
      }));
    const req = {
      body: { code: 'join-code' },
      userId: 'user-1',
    };
    const res = createResponse();

    await joinByCodeSecure(req, res);

    expect(txMock.room.findUnique).toHaveBeenNthCalledWith(1, {
      where: { code: 'join-code' },
    });
    expect(txMock.roomMember.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        roomId: 'private-room',
        isAnonymous: true,
      },
    });
    expect(res.json).toHaveBeenCalledWith({
      room: expect.objectContaining({
        id: 'private-room',
        isAnonymousRoom: true,
        userIsAnonymous: true,
      }),
    });
  });
});

describe('getMyRooms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.room.findMany.mockResolvedValue([]);
    prismaMock.message.groupBy.mockResolvedValue([]);
  });

  it('returns an empty room list without running an unread-count query', async () => {
    const req = { userId: 'user-1' };
    const res = createResponse();

    await getMyRooms(req, res);

    expect(prismaMock.room.findMany).toHaveBeenCalledWith({
      where: {
        members: {
          some: { userId: 'user-1' },
        },
      },
      include: {
        owner: {
          select: { id: true, username: true, avatar: true },
        },
        members: {
          where: { userId: 'user-1' },
          select: { isAnonymous: true, lastReadAt: true },
        },
        _count: {
          select: { members: true, messages: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    expect(prismaMock.message.groupBy).not.toHaveBeenCalled();
    expect(prismaMock.message.count).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ rooms: [] });
  });

  it('uses one grouped unread-count query for all rooms', async () => {
    const ownedLastReadAt = new Date('2026-05-29T10:00:00.000Z');
    const joinedLastReadAt = new Date('2026-05-29T11:30:00.000Z');
    const ownedRoom = myRoom({
      id: 'owned-room',
      ownerId: 'user-1',
      code: 'owned-code',
      members: [{ isAnonymous: false, lastReadAt: ownedLastReadAt }],
    });
    const joinedRoom = myRoom({
      id: 'joined-room',
      ownerId: 'owner-2',
      code: 'hidden-code',
      isAnonymous: true,
      members: [{ isAnonymous: true, lastReadAt: joinedLastReadAt }],
    });
    prismaMock.room.findMany.mockResolvedValue([ownedRoom, joinedRoom]);
    prismaMock.message.groupBy.mockResolvedValue([
      { roomId: 'owned-room', _count: { _all: 2 } },
      { roomId: 'joined-room', _count: { _all: 5 } },
    ]);
    const req = { userId: 'user-1' };
    const res = createResponse();

    await getMyRooms(req, res);

    expect(prismaMock.message.count).not.toHaveBeenCalled();
    expect(prismaMock.message.groupBy).toHaveBeenCalledTimes(1);
    expect(prismaMock.message.groupBy).toHaveBeenCalledWith({
      by: ['roomId'],
      where: {
        isEphemeral: false,
        isDeleted: false,
        parentId: null,
        senderId: { not: 'user-1' },
        roomId: { in: ['owned-room', 'joined-room'] },
        OR: [
          {
            roomId: 'owned-room',
            createdAt: { gt: ownedLastReadAt },
          },
          {
            roomId: 'joined-room',
            createdAt: { gt: joinedLastReadAt },
          },
        ],
      },
      _count: { _all: true },
    });
    expect(res.json).toHaveBeenCalledWith({
      rooms: [
        expect.objectContaining({
          id: 'owned-room',
          code: 'owned-code',
          isAnonymousRoom: false,
          userIsAnonymous: false,
          unreadCount: 2,
          members: undefined,
        }),
        expect.objectContaining({
          id: 'joined-room',
          code: undefined,
          isAnonymousRoom: true,
          userIsAnonymous: true,
          unreadCount: 5,
          members: undefined,
        }),
      ],
    });
  });

  it('defaults unread count to zero when a room has no grouped result', async () => {
    prismaMock.room.findMany.mockResolvedValue([myRoom({ id: 'quiet-room' })]);
    prismaMock.message.groupBy.mockResolvedValue([]);
    const req = { userId: 'user-1' };
    const res = createResponse();

    await getMyRooms(req, res);

    expect(res.json).toHaveBeenCalledWith({
      rooms: [
        expect.objectContaining({
          id: 'quiet-room',
          unreadCount: 0,
        }),
      ],
    });
  });
});
