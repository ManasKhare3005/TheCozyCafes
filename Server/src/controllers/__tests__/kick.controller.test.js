import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  room: {
    findUnique: vi.fn(),
  },
  roomMember: {
    findUnique: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  roomBan: {
    create: vi.fn(),
  },
  kickVote: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  kickVoteBallot: {
    create: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock('../../lib/prisma.js', () => ({ default: prismaMock }));

import { adminKick, castVote, setSocketInstance, startVoteKick } from '../kick.controller.js';

function createResponse() {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

function member(userId, username, overrides = {}) {
  return {
    id: `member-${userId}`,
    userId,
    roomId: 'room-1',
    joinedAt: new Date('2026-05-29T12:00:00.000Z'),
    isAnonymous: false,
    isRevealed: false,
    anonymousName: null,
    user: { id: userId, username },
    ...overrides,
  };
}

function room(overrides = {}) {
  return {
    id: 'room-1',
    ownerId: 'owner-1',
    members: [
      member('owner-1', 'OwnerCafe'),
      member('user-1', 'AdaCafe'),
      member('target-1', 'TargetCafe'),
    ],
    ...overrides,
  };
}

function vote(overrides = {}) {
  return {
    id: 'vote-1',
    roomId: 'room-1',
    targetId: 'target-1',
    initiatorId: 'user-1',
    reason: 'spam',
    status: 'active',
    createdAt: new Date('2026-05-29T12:00:00.000Z'),
    expiresAt: new Date('2026-05-30T12:00:00.000Z'),
    targetRevealedName: 'TargetCafe',
    room: room(),
    ballots: [],
    target: { id: 'target-1', username: 'TargetCafe' },
    initiator: { id: 'user-1', username: 'AdaCafe' },
    ...overrides,
  };
}

function setupSocketState() {
  const socket = {
    leave: vi.fn(),
    currentRoom: 'room-1',
  };
  const emitTarget = {
    emit: vi.fn(),
  };
  const io = {
    to: vi.fn(() => emitTarget),
    sockets: {
      sockets: new Map([['socket-target', socket]]),
    },
  };
  const roomUsers = new Map([
    ['socket-owner', { userId: 'owner-1', username: 'OwnerCafe', isAnonymous: false }],
    ['socket-user', { userId: 'user-1', username: 'AdaCafe', isAnonymous: false }],
    ['socket-target', { userId: 'target-1', username: 'TargetCafe', isAnonymous: false }],
  ]);
  const rooms = new Map([['room-1', roomUsers]]);

  setSocketInstance(io, rooms);
  return { io, emitTarget, roomUsers, socket };
}

describe('kick controller', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-29T12:00:00.000Z'));
    vi.clearAllMocks();

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    prismaMock.$transaction.mockResolvedValue([]);
    prismaMock.room.findUnique.mockResolvedValue(room());
    prismaMock.roomMember.findUnique.mockResolvedValue(member('target-1', 'TargetCafe'));
    prismaMock.roomMember.delete.mockReturnValue({ operation: 'delete-room-member' });
    prismaMock.roomMember.update.mockResolvedValue(member('target-1', 'TargetCafe'));
    prismaMock.roomMember.updateMany.mockReturnValue({ operation: 'unreveal-room-member' });
    prismaMock.roomBan.create.mockReturnValue({ operation: 'create-room-ban' });
    prismaMock.kickVote.findFirst.mockResolvedValue(null);
    prismaMock.kickVote.findUnique.mockResolvedValue(vote());
    prismaMock.kickVote.create.mockResolvedValue(vote());
    prismaMock.kickVote.update.mockReturnValue({ operation: 'update-kick-vote' });
    prismaMock.kickVote.updateMany.mockReturnValue({ operation: 'cancel-active-votes' });
    prismaMock.kickVoteBallot.create.mockResolvedValue({ id: 'ballot-1' });
    prismaMock.kickVoteBallot.update.mockResolvedValue({ id: 'ballot-1' });
    prismaMock.kickVoteBallot.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    setSocketInstance(null, null);
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    vi.useRealTimers();
  });

  it('does not allow non-owners to admin-kick room members', async () => {
    prismaMock.room.findUnique.mockResolvedValue(room({ ownerId: 'owner-1' }));
    const req = {
      params: { roomId: 'room-1' },
      body: { targetUserId: 'target-1' },
      userId: 'user-1',
    };
    const res = createResponse();

    await adminKick(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Only the room admin can kick users' });
    expect(prismaMock.roomMember.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('admin-kicks by removing membership, banning the target, cancelling active votes, and kicking the socket', async () => {
    const { io, emitTarget, roomUsers, socket } = setupSocketState();
    prismaMock.room.findUnique.mockResolvedValue(room({ ownerId: 'owner-1' }));
    const targetMembership = member('target-1', 'TargetCafe');
    prismaMock.roomMember.findUnique.mockResolvedValue(targetMembership);
    const req = {
      params: { roomId: 'room-1' },
      body: { targetUserId: 'target-1', reason: 'clear abuse' },
      userId: 'owner-1',
    };
    const res = createResponse();

    await adminKick(req, res);

    expect(prismaMock.roomMember.delete).toHaveBeenCalledWith({
      where: {
        userId_roomId: {
          userId: 'target-1',
          roomId: 'room-1',
        },
      },
    });
    expect(prismaMock.roomBan.create).toHaveBeenCalledWith({
      data: {
        userId: 'target-1',
        roomId: 'room-1',
        reason: 'clear abuse',
      },
    });
    expect(prismaMock.kickVote.updateMany).toHaveBeenCalledWith({
      where: {
        roomId: 'room-1',
        targetId: 'target-1',
        status: 'active',
      },
      data: { status: 'cancelled' },
    });
    expect(prismaMock.$transaction).toHaveBeenCalledWith([
      { operation: 'delete-room-member' },
      { operation: 'create-room-ban' },
      { operation: 'cancel-active-votes' },
    ]);
    expect(io.to).toHaveBeenCalledWith('socket-target');
    expect(emitTarget.emit).toHaveBeenCalledWith('user:kicked', {
      roomId: 'room-1',
      reason: 'clear abuse',
      message: 'You have been kicked from this room: clear abuse',
    });
    expect(emitTarget.emit).toHaveBeenCalledWith('user:left', expect.objectContaining({
      wasKicked: true,
    }));
    expect(roomUsers.has('socket-target')).toBe(false);
    expect(socket.leave).toHaveBeenCalledWith('room-1');
    expect(socket.currentRoom).toBeNull();
    expect(res.json).toHaveBeenCalledWith({
      message: 'User kicked and banned successfully',
      kickedUser: targetMembership.user,
    });
  });

  it('does not start vote-kicks against the room owner', async () => {
    prismaMock.room.findUnique.mockResolvedValue(room({ ownerId: 'owner-1' }));
    const req = {
      params: { roomId: 'room-1' },
      body: { targetUserId: 'owner-1' },
      userId: 'user-1',
    };
    const res = createResponse();

    await startVoteKick(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Cannot vote to kick the room admin' });
    expect(prismaMock.kickVote.create).not.toHaveBeenCalled();
    expect(prismaMock.kickVoteBallot.create).not.toHaveBeenCalled();
  });

  it('starts a vote-kick against an anonymous target without revealing their identity', async () => {
    const { io, emitTarget } = setupSocketState();
    const anonymousTarget = member('target-1', 'TargetCafe', {
      isAnonymous: true,
      anonymousName: 'Anonymous Fox',
    });
    prismaMock.room.findUnique.mockResolvedValue(room({
      members: [
        member('owner-1', 'OwnerCafe'),
        member('user-1', 'AdaCafe'),
        anonymousTarget,
      ],
    }));
    prismaMock.kickVote.create.mockResolvedValue(vote({
      targetRevealedName: 'TargetCafe',
      reason: 'spam links',
    }));
    const req = {
      params: { roomId: 'room-1' },
      body: { targetUserId: 'target-1', reason: 'spam links' },
      userId: 'user-1',
    };
    const res = createResponse();

    await startVoteKick(req, res);

    expect(prismaMock.kickVote.create).toHaveBeenCalledWith({
      data: {
        initiatorId: 'user-1',
        targetId: 'target-1',
        roomId: 'room-1',
        reason: 'spam links',
        expiresAt: expect.any(Date),
        targetRevealedName: 'TargetCafe',
      },
      include: {
        initiator: { select: { id: true, username: true } },
        target: { select: { id: true, username: true } },
      },
    });
    // Identity is NOT revealed at vote start — only after the vote passes
    expect(prismaMock.roomMember.update).not.toHaveBeenCalled();
    expect(emitTarget.emit).not.toHaveBeenCalledWith('user:identity:revealed', expect.anything());
    expect(prismaMock.kickVoteBallot.create).toHaveBeenCalledWith({
      data: {
        voterId: 'user-1',
        kickVoteId: 'vote-1',
        vote: true,
      },
    });
    expect(io.to).toHaveBeenCalledWith('room-1');
    expect(emitTarget.emit).toHaveBeenCalledWith('kick:vote:updated', {
      type: 'started',
      vote: expect.objectContaining({
        id: 'vote-1',
        votesFor: 1,
        eligibleVoters: 2,
        target: { id: 'anon-member-target-1', username: 'Anonymous Fox' },
        targetRevealedName: null,
      }),
    });
    expect(res.json).toHaveBeenCalledWith({
      message: 'Vote kick started',
      kickVote: expect.objectContaining({
        id: 'vote-1',
        votesFor: 1,
        status: 'active',
        target: { id: 'anon-member-target-1', username: 'Anonymous Fox' },
        targetRevealedName: null,
      }),
    });
  });

  it('reveals the target identity to the room when the vote passes', async () => {
    const { io, emitTarget } = setupSocketState();
    prismaMock.kickVote.findUnique.mockResolvedValue(vote({
      ballots: [{ id: 'ballot-initiator', voterId: 'user-1', vote: true }],
      room: room({
        members: [
          member('owner-1', 'OwnerCafe'),
          member('user-1', 'AdaCafe'),
          member('target-1', 'TargetCafe', { isAnonymous: true, anonymousName: 'Anonymous Fox' }),
        ],
      }),
    }));
    prismaMock.kickVoteBallot.findMany.mockResolvedValue([
      { id: 'ballot-initiator', voterId: 'user-1', vote: true },
      { id: 'ballot-owner', voterId: 'owner-1', vote: true },
    ]);
    const req = {
      params: { voteId: 'vote-1' },
      body: { vote: true },
      userId: 'owner-1',
    };
    const res = createResponse();

    await castVote(req, res);

    expect(io.to).toHaveBeenCalledWith('room-1');
    expect(emitTarget.emit).toHaveBeenCalledWith('user:identity:revealed', {
      userId: 'target-1',
      username: 'TargetCafe',
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      result: 'passed',
    }));
  });

  it('does not allow the target to vote on their own kick', async () => {
    prismaMock.kickVote.findUnique.mockResolvedValue(vote({
      room: room({
        members: [
          member('owner-1', 'OwnerCafe'),
          member('user-1', 'AdaCafe'),
          member('target-1', 'TargetCafe'),
        ],
      }),
    }));
    const req = {
      params: { voteId: 'vote-1' },
      body: { vote: false },
      userId: 'target-1',
    };
    const res = createResponse();

    await castVote(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'You cannot vote on your own kick' });
    expect(prismaMock.kickVoteBallot.create).not.toHaveBeenCalled();
    expect(prismaMock.kickVoteBallot.update).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('executes a kick when a majority votes yes', async () => {
    setupSocketState();
    prismaMock.kickVote.findUnique.mockResolvedValue(vote({
      ballots: [{ id: 'ballot-initiator', voterId: 'user-1', vote: true }],
      room: room({
        members: [
          member('owner-1', 'OwnerCafe'),
          member('user-1', 'AdaCafe'),
          member('target-1', 'TargetCafe'),
        ],
      }),
    }));
    prismaMock.kickVoteBallot.findMany.mockResolvedValue([
      { id: 'ballot-initiator', voterId: 'user-1', vote: true },
      { id: 'ballot-owner', voterId: 'owner-1', vote: true },
    ]);
    const req = {
      params: { voteId: 'vote-1' },
      body: { vote: true },
      userId: 'owner-1',
    };
    const res = createResponse();

    await castVote(req, res);

    expect(prismaMock.kickVoteBallot.create).toHaveBeenCalledWith({
      data: {
        voterId: 'owner-1',
        kickVoteId: 'vote-1',
        vote: true,
      },
    });
    expect(prismaMock.roomMember.delete).toHaveBeenCalledWith({
      where: {
        userId_roomId: {
          userId: 'target-1',
          roomId: 'room-1',
        },
      },
    });
    expect(prismaMock.roomBan.create).toHaveBeenCalledWith({
      data: {
        userId: 'target-1',
        roomId: 'room-1',
        reason: 'Vote passed',
      },
    });
    expect(prismaMock.kickVote.update).toHaveBeenCalledWith({
      where: { id: 'vote-1' },
      data: { status: 'passed' },
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Vote cast',
      result: 'passed',
      votesFor: 2,
      majorityThreshold: 2,
      status: 'passed',
    }));
  });
});
