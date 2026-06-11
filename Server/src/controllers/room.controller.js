import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { nanoid } from 'nanoid';
import { getIo } from '../socket/handlers.js';
import { isCafeOpen } from '../lib/cafeHours.js';

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function cafeClosedMessage(room) {
  const tz = room.cafeHoursTimezone || 'UTC';
  return `This cafe table is closed right now. Open ${room.cafeHoursStart}-${room.cafeHoursEnd} (${tz})`;
}

function formatRoomForClient(room) {
  return {
    ...room,
    isAnonymousRoom: room.isAnonymous || false,
    userIsAnonymous: room.isAnonymous || false,
  };
}

async function joinRoomMembership({ where, inviteCode, userId, notFoundMessage }) {
  return prisma.$transaction(async (tx) => {
    const room = await tx.room.findUnique({ where });

    if (!room) {
      throw httpError(404, notFoundMessage);
    }

    const existingMember = await tx.roomMember.findUnique({
      where: {
        userId_roomId: {
          userId,
          roomId: room.id,
        },
      },
    });

    if (existingMember) {
      throw httpError(400, 'Already a member of this room');
    }

    const ban = await tx.roomBan.findUnique({
      where: {
        userId_roomId: {
          userId,
          roomId: room.id,
        },
      },
    });

    if (ban) {
      throw httpError(403, 'You are banned from this room');
    }

    if (room.isPrivate && room.code !== inviteCode) {
      throw httpError(403, 'Invalid invite code');
    }

    if (room.isLocked) {
      throw httpError(403, 'This room is locked by moderation');
    }

    if (!isCafeOpen(room)) {
      throw httpError(403, cafeClosedMessage(room));
    }

    const memberCount = await tx.roomMember.count({ where: { roomId: room.id } });
    if (memberCount >= room.maxMembers) {
      throw httpError(400, `This table is full (${room.maxMembers} members max)`);
    }

    await tx.roomMember.create({
      data: {
        userId,
        roomId: room.id,
        isAnonymous: room.isAnonymous || false,
      },
    });

    return tx.room.findUnique({
      where: { id: room.id },
      include: {
        owner: {
          select: { id: true, username: true, avatar: true },
        },
        _count: {
          select: { members: true },
        },
      },
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

function handleJoinError(res, error, logLabel) {
  if (error.status) {
    return res.status(error.status).json({ error: error.message });
  }

  if (error.code === 'P2002') {
    return res.status(400).json({ error: 'Already a member of this room' });
  }

  if (error.code === 'P2034') {
    return res.status(409).json({ error: 'This table is busy. Please try joining again.' });
  }

  console.error(logLabel, error);
  return res.status(500).json({ error: 'Failed to join room' });
}

// Get all rooms user is a member of
export async function getMyRooms(req, res) {
  try {
    const rooms = await prisma.room.findMany({
      where: {
        members: {
          some: { userId: req.userId },
        },
      },
      include: {
        owner: {
          select: { id: true, username: true, avatar: true },
        },
        members: {
          where: { userId: req.userId },
          select: { isAnonymous: true, lastReadAt: true },
        },
        _count: {
          select: { members: true, messages: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const unreadCounts = new Map();
    if (rooms.length > 0) {
      const unreadGroups = await prisma.message.groupBy({
        by: ['roomId'],
        where: {
          isEphemeral: false,
          isDeleted: false,
          parentId: null,
          senderId: { not: req.userId },
          roomId: { in: rooms.map((room) => room.id) },
          OR: rooms.map((room) => ({
            roomId: room.id,
            createdAt: { gt: room.members[0]?.lastReadAt || new Date(0) },
          })),
        },
        _count: { _all: true },
      });

      for (const group of unreadGroups) {
        unreadCounts.set(group.roomId, group._count._all);
      }
    }

    const roomsWithData = rooms.map((room) => {
      return {
        ...room,
        code: room.ownerId === req.userId ? room.code : undefined,
        isAnonymousRoom: room.isAnonymous,
        userIsAnonymous: room.isAnonymous || room.members[0]?.isAnonymous || false,
        unreadCount: unreadCounts.get(room.id) || 0,
        members: undefined,
      };
    });

    res.json({ rooms: roomsWithData });
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
}

// Get public rooms to discover
export async function getPublicRooms(req, res) {
  try {
    const rooms = await prisma.room.findMany({
      where: {
        isPrivate: false,
        isLocked: false,
        members: {
          none: { userId: req.userId },
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

    res.json({ rooms });
  } catch (error) {
    console.error('Get public rooms error:', error);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
}

// Get single room details
export async function getRoom(req, res) {
  try {
    const { roomId } = req.params;

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        owner: {
          select: { id: true, username: true, avatar: true },
        },
        members: {
          include: {
            user: {
              select: { id: true, username: true, avatar: true },
            },
          },
        },
        _count: {
          select: { messages: true },
        },
      },
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Check if user is a member
    const isMember = room.members.some((m) => m.userId === req.userId);
    if (room.isPrivate && !isMember) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ room });
  } catch (error) {
    console.error('Get room error:', error);
    res.status(500).json({ error: 'Failed to fetch room' });
  }
}

// Create a new room
export async function createRoom(req, res) {
  try {
    const { name, description, isPrivate, isAnonymous, maxMembers, category, cafeHoursEnabled, cafeHoursStart, cafeHoursEnd, cafeHoursDays, cafeHoursTimezone } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'Room name must be at least 2 characters' });
    }

    // Validate maxMembers: only 5 or 10 allowed
    const capacity = maxMembers === 10 ? 10 : 5;

    // Validate cafe hours if enabled
    if (cafeHoursEnabled) {
      if (!cafeHoursStart || !cafeHoursEnd) {
        return res.status(400).json({ error: 'Cafe hours require start and end times' });
      }
    }

    const room = await prisma.room.create({
      data: {
        name: name.trim(),
        description: description?.trim(),
        isPrivate: isPrivate || false,
        isAnonymous: isAnonymous || false,
        code: isPrivate ? nanoid(8) : null,
        maxMembers: capacity,
        category: category || null,
        cafeHoursEnabled: cafeHoursEnabled || false,
        cafeHoursStart: cafeHoursEnabled ? cafeHoursStart : null,
        cafeHoursEnd: cafeHoursEnabled ? cafeHoursEnd : null,
        cafeHoursDays: cafeHoursEnabled ? (cafeHoursDays || '0,1,2,3,4,5,6') : null,
        cafeHoursTimezone: cafeHoursEnabled ? (cafeHoursTimezone || 'UTC') : null,
        ownerId: req.userId,
        members: {
          create: {
            userId: req.userId,
            isAnonymous: isAnonymous || false,
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

    // Broadcast to all connected users that a new public room was created
    if (!room.isPrivate) {
      const io = getIo();
      if (io) {
        io.emit('room:created', { room });
      }
    }

    res.status(201).json({ room });
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
}

// Join a room
export async function joinRoom(req, res) {
  try {
    const { roomId } = req.params;
    const { code } = req.body;

    const room = await prisma.room.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Check if user is banned from this room
    const ban = await prisma.roomBan.findUnique({
      where: {
        userId_roomId: {
          userId: req.userId,
          roomId,
        },
      },
    });

    if (ban) {
      return res.status(403).json({ error: 'You are banned from this room' });
    }

    // Check if private room requires code
    if (room.isPrivate && room.code !== code) {
      return res.status(403).json({ error: 'Invalid invite code' });
    }

    if (room.isLocked) {
      return res.status(403).json({ error: 'This room is locked by moderation' });
    }

    // Check room capacity
    const memberCount = await prisma.roomMember.count({ where: { roomId } });
    if (memberCount >= room.maxMembers) {
      return res.status(400).json({ error: `This table is full (${room.maxMembers} members max)` });
    }

    // Check cafe hours (timezone-aware)
    if (!isCafeOpen(room)) {
      const tz = room.cafeHoursTimezone || 'UTC';
      return res.status(403).json({
        error: `This cafe table is closed right now. Open ${room.cafeHoursStart}–${room.cafeHoursEnd} (${tz})`,
      });
    }

    // Check if already a member
    const existingMember = await prisma.roomMember.findUnique({
      where: {
        userId_roomId: {
          userId: req.userId,
          roomId,
        },
      },
    });

    if (existingMember) {
      return res.status(400).json({ error: 'Already a member of this room' });
    }

    await prisma.roomMember.create({
      data: {
        userId: req.userId,
        roomId,
        isAnonymous: room.isAnonymous || false,
      },
    });

    const updatedRoom = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        owner: {
          select: { id: true, username: true, avatar: true },
        },
        _count: {
          select: { members: true },
        },
      },
    });

    // Broadcast member count update to all connected users
    const io = getIo();
    if (io) {
      io.emit('room:updated', {
        roomId,
        memberCount: updatedRoom._count.members,
      });
    }

    res.json({ room: updatedRoom });
  } catch (error) {
    console.error('Join room error:', error);
    res.status(500).json({ error: 'Failed to join room' });
  }
}

// Join room by invite code
export async function joinByCode(req, res) {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Invite code is required' });
    }

    const room = await prisma.room.findUnique({
      where: { code },
    });

    if (!room) {
      return res.status(404).json({ error: 'Invalid invite code' });
    }

    // Check if user is banned from this room
    const ban = await prisma.roomBan.findUnique({
      where: {
        userId_roomId: {
          userId: req.userId,
          roomId: room.id,
        },
      },
    });

    if (ban) {
      return res.status(403).json({ error: 'You are banned from this room' });
    }

    if (room.isLocked) {
      return res.status(403).json({ error: 'This room is locked by moderation' });
    }

    // Check room capacity
    const currentCount = await prisma.roomMember.count({ where: { roomId: room.id } });
    if (currentCount >= room.maxMembers) {
      return res.status(400).json({ error: `This table is full (${room.maxMembers} members max)` });
    }

    // Check if already a member
    const existingMember = await prisma.roomMember.findUnique({
      where: {
        userId_roomId: {
          userId: req.userId,
          roomId: room.id,
        },
      },
    });

    if (existingMember) {
      return res.status(400).json({ error: 'Already a member of this room' });
    }

    await prisma.roomMember.create({
      data: {
        userId: req.userId,
        roomId: room.id,
        isAnonymous: room.isAnonymous || false,
      },
    });

    const updatedRoom = await prisma.room.findUnique({
      where: { id: room.id },
      include: {
        owner: {
          select: { id: true, username: true, avatar: true },
        },
        _count: {
          select: { members: true },
        },
      },
    });

    // Broadcast member count update to all connected users
    const io = getIo();
    if (io) {
      io.emit('room:updated', {
        roomId: room.id,
        memberCount: updatedRoom._count.members,
      });
    }

    res.json({ room: updatedRoom });
  } catch (error) {
    console.error('Join by code error:', error);
    res.status(500).json({ error: 'Failed to join room' });
  }
}

// Safer join path used by routes. Keeps capacity/cafe-hours checks in one serializable transaction.
export async function joinRoomSecure(req, res) {
  try {
    const { roomId } = req.params;
    const { code } = req.body;

    const updatedRoom = await joinRoomMembership({
      where: { id: roomId },
      inviteCode: code,
      userId: req.userId,
      notFoundMessage: 'Room not found',
    });

    const io = getIo();
    if (io) {
      io.emit('room:updated', {
        roomId: updatedRoom.id,
        memberCount: updatedRoom._count.members,
      });
    }

    res.json({ room: formatRoomForClient(updatedRoom) });
  } catch (error) {
    return handleJoinError(res, error, 'Join room error:');
  }
}

export async function joinByCodeSecure(req, res) {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Invite code is required' });
    }

    const updatedRoom = await joinRoomMembership({
      where: { code },
      inviteCode: code,
      userId: req.userId,
      notFoundMessage: 'Invalid invite code',
    });

    const io = getIo();
    if (io) {
      io.emit('room:updated', {
        roomId: updatedRoom.id,
        memberCount: updatedRoom._count.members,
      });
    }

    res.json({ room: formatRoomForClient(updatedRoom) });
  } catch (error) {
    return handleJoinError(res, error, 'Join by code error:');
  }
}

// Leave a room
export async function leaveRoom(req, res) {
  try {
    const { roomId } = req.params;

    const room = await prisma.room.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Owner can't leave, they must delete the room
    if (room.ownerId === req.userId) {
      return res.status(400).json({ error: 'Owner cannot leave. Delete the room instead.' });
    }

    await prisma.roomMember.delete({
      where: {
        userId_roomId: {
          userId: req.userId,
          roomId,
        },
      },
    });

    // Broadcast member count update to all connected users
    const memberCount = await prisma.roomMember.count({ where: { roomId } });
    const io = getIo();
    if (io) {
      io.emit('room:updated', {
        roomId,
        memberCount,
      });
    }

    res.json({ message: 'Left room successfully' });
  } catch (error) {
    console.error('Leave room error:', error);
    res.status(500).json({ error: 'Failed to leave room' });
  }
}

// Delete a room (owner only)
export async function deleteRoom(req, res) {
  try {
    const { roomId } = req.params;

    const room = await prisma.room.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (room.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Only the owner can delete this room' });
    }

    await prisma.room.delete({
      where: { id: roomId },
    });

    // Broadcast to all connected users that a room was deleted
    const io = getIo();
    if (io) {
      io.emit('room:deleted', { roomId });
    }

    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    console.error('Delete room error:', error);
    res.status(500).json({ error: 'Failed to delete room' });
  }
}

// Toggle anonymous status for a room
export async function toggleAnonymous(req, res) {
  try {
    const { roomId } = req.params;
    const { isAnonymous } = req.body;

    // Block toggle for room-level anonymous rooms
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (room?.isAnonymous) {
      return res.status(403).json({ error: 'Cannot toggle anonymous mode in an anonymous room' });
    }

    const membership = await prisma.roomMember.findUnique({
      where: {
        userId_roomId: {
          userId: req.userId,
          roomId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }

    const updated = await prisma.roomMember.update({
      where: {
        userId_roomId: {
          userId: req.userId,
          roomId,
        },
      },
      data: { isAnonymous: isAnonymous },
    });

    res.json({ isAnonymous: updated.isAnonymous });
  } catch (error) {
    console.error('Toggle anonymous error:', error);
    res.status(500).json({ error: 'Failed to toggle anonymous status' });
  }
}
