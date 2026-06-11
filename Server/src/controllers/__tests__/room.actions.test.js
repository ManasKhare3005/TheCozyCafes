import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  room: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  roomMember: {
    count: vi.fn(),
    delete: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
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
vi.mock('nanoid', () => ({ nanoid: () => 'invite123' }));

import {
  createRoom,
  deleteRoom,
  getPublicRooms,
  getRoom,
  leaveRoom,
  toggleAnonymous,
} from '../room.controller.js';

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
    description: 'A calm table',
    ownerId: 'owner-1',
    code: null,
    isPrivate: false,
    isAnonymous: false,
    maxMembers: 5,
    category: 'study',
    members: [],
    _count: { members: 1, messages: 0 },
    ...overrides,
  };
}

describe('room actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socketHandlersMock.getIo.mockReturnValue(ioMock);
    prismaMock.room.findMany.mockResolvedValue([]);
    prismaMock.room.findUnique.mockResolvedValue(room());
    prismaMock.room.create.mockResolvedValue(room());
    prismaMock.room.delete.mockResolvedValue(room());
    prismaMock.roomMember.count.mockResolvedValue(2);
    prismaMock.roomMember.delete.mockResolvedValue({ id: 'membership-1' });
    prismaMock.roomMember.findUnique.mockResolvedValue({ id: 'membership-1', isAnonymous: false });
    prismaMock.roomMember.update.mockResolvedValue({ id: 'membership-1', isAnonymous: true });
  });

  it('loads discoverable public rooms excluding rooms the user already joined', async () => {
    const publicRooms = [room({ id: 'public-room' })];
    prismaMock.room.findMany.mockResolvedValue(publicRooms);
    const req = { userId: 'user-1' };
    const res = createResponse();

    await getPublicRooms(req, res);

    expect(prismaMock.room.findMany).toHaveBeenCalledWith({
      where: {
        isPrivate: false,
        isLocked: false,
        members: {
          none: { userId: 'user-1' },
        },
      },
      include: {
        owner: {
          select: { id: true, username: true, avatar: true },
        },
        _count: {
          select: { members: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    expect(res.json).toHaveBeenCalledWith({ rooms: publicRooms });
  });

  it('blocks private room details from non-members', async () => {
    prismaMock.room.findUnique.mockResolvedValue(room({
      isPrivate: true,
      members: [{ userId: 'other-user' }],
    }));
    const req = { params: { roomId: 'private-room' }, userId: 'user-1' };
    const res = createResponse();

    await getRoom(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Access denied' });
  });

  it('creates private cafe-hour rooms with a generated invite code and owner membership', async () => {
    const createdRoom = room({
      id: 'created-room',
      isPrivate: true,
      code: 'invite123',
      maxMembers: 10,
    });
    prismaMock.room.create.mockResolvedValue(createdRoom);
    const req = {
      userId: 'owner-1',
      body: {
        name: '  Focus Booth  ',
        description: '  deep work  ',
        isPrivate: true,
        isAnonymous: true,
        maxMembers: 10,
        category: 'study',
        cafeHoursEnabled: true,
        cafeHoursStart: '09:00',
        cafeHoursEnd: '17:00',
        cafeHoursTimezone: 'America/Phoenix',
      },
    };
    const res = createResponse();

    await createRoom(req, res);

    expect(prismaMock.room.create).toHaveBeenCalledWith({
      data: {
        name: 'Focus Booth',
        description: 'deep work',
        isPrivate: true,
        isAnonymous: true,
        code: 'invite123',
        maxMembers: 10,
        category: 'study',
        cafeHoursEnabled: true,
        cafeHoursStart: '09:00',
        cafeHoursEnd: '17:00',
        cafeHoursDays: '0,1,2,3,4,5,6',
        cafeHoursTimezone: 'America/Phoenix',
        ownerId: 'owner-1',
        members: {
          create: {
            userId: 'owner-1',
            isAnonymous: true,
          },
        },
      },
      include: {
        owner: {
          select: { id: true, username: true, avatar: true },
        },
        _count: {
          select: { members: true },
        },
      },
    });
    expect(ioMock.emit).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ room: createdRoom });
  });

  it('broadcasts member count after a non-owner leaves a room', async () => {
    prismaMock.room.findUnique.mockResolvedValue(room({ ownerId: 'owner-1' }));
    prismaMock.roomMember.count.mockResolvedValue(3);
    const req = { params: { roomId: 'room-1' }, userId: 'user-1' };
    const res = createResponse();

    await leaveRoom(req, res);

    expect(prismaMock.roomMember.delete).toHaveBeenCalledWith({
      where: {
        userId_roomId: {
          userId: 'user-1',
          roomId: 'room-1',
        },
      },
    });
    expect(ioMock.emit).toHaveBeenCalledWith('room:updated', {
      roomId: 'room-1',
      memberCount: 3,
    });
    expect(res.json).toHaveBeenCalledWith({ message: 'Left room successfully' });
  });

  it('prevents room owners from leaving their own room', async () => {
    prismaMock.room.findUnique.mockResolvedValue(room({ ownerId: 'owner-1' }));
    const req = { params: { roomId: 'room-1' }, userId: 'owner-1' };
    const res = createResponse();

    await leaveRoom(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Owner cannot leave. Delete the room instead.',
    });
    expect(prismaMock.roomMember.delete).not.toHaveBeenCalled();
  });

  it('deletes owner-controlled rooms and broadcasts deletion', async () => {
    prismaMock.room.findUnique.mockResolvedValue(room({ ownerId: 'owner-1' }));
    const req = { params: { roomId: 'room-1' }, userId: 'owner-1' };
    const res = createResponse();

    await deleteRoom(req, res);

    expect(prismaMock.room.delete).toHaveBeenCalledWith({ where: { id: 'room-1' } });
    expect(ioMock.emit).toHaveBeenCalledWith('room:deleted', { roomId: 'room-1' });
    expect(res.json).toHaveBeenCalledWith({ message: 'Room deleted successfully' });
  });

  it('does not allow anonymous toggles inside room-level anonymous rooms', async () => {
    prismaMock.room.findUnique.mockResolvedValue(room({ isAnonymous: true }));
    const req = {
      params: { roomId: 'room-1' },
      body: { isAnonymous: false },
      userId: 'user-1',
    };
    const res = createResponse();

    await toggleAnonymous(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Cannot toggle anonymous mode in an anonymous room',
    });
    expect(prismaMock.roomMember.update).not.toHaveBeenCalled();
  });

  it('updates per-user anonymous mode for room members', async () => {
    prismaMock.room.findUnique.mockResolvedValue(room({ isAnonymous: false }));
    prismaMock.roomMember.update.mockResolvedValue({ isAnonymous: true });
    const req = {
      params: { roomId: 'room-1' },
      body: { isAnonymous: true },
      userId: 'user-1',
    };
    const res = createResponse();

    await toggleAnonymous(req, res);

    expect(prismaMock.roomMember.findUnique).toHaveBeenCalledWith({
      where: {
        userId_roomId: {
          userId: 'user-1',
          roomId: 'room-1',
        },
      },
    });
    expect(prismaMock.roomMember.update).toHaveBeenCalledWith({
      where: {
        userId_roomId: {
          userId: 'user-1',
          roomId: 'room-1',
        },
      },
      data: { isAnonymous: true },
    });
    expect(res.json).toHaveBeenCalledWith({ isAnonymous: true });
  });
});
