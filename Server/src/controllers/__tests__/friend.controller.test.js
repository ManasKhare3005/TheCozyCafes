import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  friendship: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  directMessage: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
  },
}));

const ioTargetMock = vi.hoisted(() => ({
  emit: vi.fn(),
}));

const ioMock = vi.hoisted(() => ({
  to: vi.fn(),
}));

const socketHandlersMock = vi.hoisted(() => ({
  getIo: vi.fn(),
}));

const notificationMock = vi.hoisted(() => ({
  createNotification: vi.fn(),
}));

const blocksMock = vi.hoisted(() => ({
  isBlockedBetween: vi.fn(),
}));

vi.mock('../../lib/prisma.js', () => ({ default: prismaMock }));
vi.mock('../../socket/handlers.js', () => socketHandlersMock);
vi.mock('../notification.controller.js', () => notificationMock);
vi.mock('../../lib/blocks.js', () => blocksMock);

import {
  getConversation,
  getConversationsList,
  getFriends,
  getPendingRequests,
  removeFriend,
  respondToRequest,
  searchUsers,
  sendFriendRequest,
} from '../friend.controller.js';

function createResponse() {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

function user(overrides = {}) {
  return {
    id: 'friend-1',
    username: 'GraceCafe',
    discriminator: '4242',
    avatar: null,
    ...overrides,
  };
}

function friendship(overrides = {}) {
  return {
    id: 'friendship-1',
    requesterId: 'user-1',
    addresseeId: 'friend-1',
    status: 'pending',
    requester: user({ id: 'user-1', username: 'AdaCafe', discriminator: '1111' }),
    addressee: user(),
    ...overrides,
  };
}

describe('friend controller block enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    ioMock.to.mockReturnValue(ioTargetMock);
    socketHandlersMock.getIo.mockReturnValue(ioMock);
    notificationMock.createNotification.mockResolvedValue({});
    blocksMock.isBlockedBetween.mockResolvedValue(false);

    prismaMock.user.findUnique.mockResolvedValue(user());
    prismaMock.user.findFirst.mockResolvedValue(user());
    prismaMock.friendship.findFirst.mockResolvedValue(null);
    prismaMock.friendship.findUnique.mockResolvedValue(friendship());
    prismaMock.friendship.create.mockResolvedValue(friendship());
    prismaMock.friendship.update.mockResolvedValue(friendship({ status: 'accepted' }));
    prismaMock.friendship.delete.mockResolvedValue(friendship({ status: 'accepted' }));
    prismaMock.directMessage.findMany.mockResolvedValue([]);
    prismaMock.directMessage.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.directMessage.count.mockResolvedValue(0);
    prismaMock.directMessage.findFirst.mockResolvedValue(null);
  });

  it('returns accepted friends with unread counts and hides blocked friendships', async () => {
    prismaMock.friendship.findMany.mockResolvedValue([
      friendship({
        id: 'visible-friendship',
        requesterId: 'user-1',
        addresseeId: 'friend-1',
        status: 'accepted',
      }),
      friendship({
        id: 'blocked-friendship',
        requesterId: 'user-1',
        addresseeId: 'blocked-1',
        addressee: user({ id: 'blocked-1', username: 'BlockedCafe' }),
        status: 'accepted',
      }),
    ]);
    blocksMock.isBlockedBetween
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    prismaMock.directMessage.count.mockResolvedValue(4);
    const req = { userId: 'user-1' };
    const res = createResponse();

    await getFriends(req, res);

    expect(prismaMock.directMessage.count).toHaveBeenCalledWith({
      where: {
        senderId: 'friend-1',
        receiverId: 'user-1',
        read: false,
      },
    });
    expect(res.json).toHaveBeenCalledWith({
      friends: [{
        friendshipId: 'visible-friendship',
        friend: expect.objectContaining({ id: 'friend-1' }),
        unreadCount: 4,
      }],
    });
  });

  it('returns incoming and outgoing pending friend requests', async () => {
    const incoming = [friendship({ requesterId: 'friend-1', addresseeId: 'user-1' })];
    const outgoing = [friendship({ requesterId: 'user-1', addresseeId: 'friend-2' })];
    prismaMock.friendship.findMany
      .mockResolvedValueOnce(incoming)
      .mockResolvedValueOnce(outgoing);
    const req = { userId: 'user-1' };
    const res = createResponse();

    await getPendingRequests(req, res);

    expect(prismaMock.friendship.findMany).toHaveBeenNthCalledWith(1, {
      where: { addresseeId: 'user-1', status: 'pending' },
      include: {
        requester: { select: { id: true, username: true, discriminator: true, avatar: true } },
      },
    });
    expect(prismaMock.friendship.findMany).toHaveBeenNthCalledWith(2, {
      where: { requesterId: 'user-1', status: 'pending' },
      include: {
        addressee: { select: { id: true, username: true, discriminator: true, avatar: true } },
      },
    });
    expect(res.json).toHaveBeenCalledWith({ incoming, outgoing });
  });

  it('does not create a friend request when either user has blocked the other', async () => {
    blocksMock.isBlockedBetween.mockResolvedValue(true);
    const req = {
      body: { addresseeId: 'friend-1' },
      userId: 'user-1',
    };
    const res = createResponse();

    await sendFriendRequest(req, res);

    expect(blocksMock.isBlockedBetween).toHaveBeenCalledWith('user-1', 'friend-1');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Cannot send a friend request to this user',
    });
    expect(prismaMock.friendship.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.friendship.create).not.toHaveBeenCalled();
    expect(notificationMock.createNotification).not.toHaveBeenCalled();
    expect(ioTargetMock.emit).not.toHaveBeenCalled();
  });

  it('creates a friend request, emits to the addressee, and creates a notification', async () => {
    const created = friendship();
    prismaMock.friendship.create.mockResolvedValue(created);
    const req = {
      body: { addresseeId: 'friend-1' },
      userId: 'user-1',
    };
    const res = createResponse();

    await sendFriendRequest(req, res);

    expect(prismaMock.friendship.create).toHaveBeenCalledWith({
      data: {
        requesterId: 'user-1',
        addresseeId: 'friend-1',
      },
      include: {
        requester: { select: { id: true, username: true, discriminator: true, avatar: true } },
        addressee: { select: { id: true, username: true, discriminator: true, avatar: true } },
      },
    });
    expect(ioMock.to).toHaveBeenCalledWith('user:friend-1');
    expect(ioTargetMock.emit).toHaveBeenCalledWith('friend:request:received', {
      friendship: created,
    });
    expect(notificationMock.createNotification).toHaveBeenCalledWith({
      userId: 'friend-1',
      type: 'friend_request',
      title: 'New friend request',
      body: 'AdaCafe sent you a friend request',
      fromUserId: 'user-1',
      fromUsername: 'AdaCafe',
    });
    expect(res.json).toHaveBeenCalledWith({ friendship: created });
  });

  it('does not accept a pending request when the requester is blocked', async () => {
    blocksMock.isBlockedBetween.mockResolvedValue(true);
    prismaMock.friendship.findUnique.mockResolvedValue(friendship({
      requesterId: 'friend-1',
      addresseeId: 'user-1',
    }));
    const req = {
      params: { friendshipId: 'friendship-1' },
      body: { action: 'accept' },
      userId: 'user-1',
    };
    const res = createResponse();

    await respondToRequest(req, res);

    expect(blocksMock.isBlockedBetween).toHaveBeenCalledWith('user-1', 'friend-1');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Cannot accept this friend request' });
    expect(prismaMock.friendship.update).not.toHaveBeenCalled();
    expect(notificationMock.createNotification).not.toHaveBeenCalled();
  });

  it('accepts pending requests, emits to requester, and creates a notification', async () => {
    const pending = friendship({
      requesterId: 'friend-1',
      addresseeId: 'user-1',
    });
    const accepted = friendship({
      requesterId: 'friend-1',
      addresseeId: 'user-1',
      status: 'accepted',
      addressee: user({ id: 'user-1', username: 'AdaCafe' }),
    });
    prismaMock.friendship.findUnique.mockResolvedValue(pending);
    prismaMock.friendship.update.mockResolvedValue(accepted);
    const req = {
      params: { friendshipId: 'friendship-1' },
      body: { action: 'accept' },
      userId: 'user-1',
    };
    const res = createResponse();

    await respondToRequest(req, res);

    expect(prismaMock.friendship.update).toHaveBeenCalledWith({
      where: { id: 'friendship-1' },
      data: { status: 'accepted' },
      include: {
        requester: { select: { id: true, username: true, discriminator: true, avatar: true } },
        addressee: { select: { id: true, username: true, discriminator: true, avatar: true } },
      },
    });
    expect(ioMock.to).toHaveBeenCalledWith('user:friend-1');
    expect(ioTargetMock.emit).toHaveBeenCalledWith('friend:request:accepted', {
      friendship: accepted,
    });
    expect(notificationMock.createNotification).toHaveBeenCalledWith({
      userId: 'friend-1',
      type: 'friend_accepted',
      title: 'Friend request accepted',
      body: 'AdaCafe accepted your friend request',
      fromUserId: 'user-1',
      fromUsername: 'AdaCafe',
    });
    expect(res.json).toHaveBeenCalledWith({ friendship: accepted });
  });

  it('removes friendships only when the requester is part of them', async () => {
    prismaMock.friendship.findUnique.mockResolvedValue(friendship({
      requesterId: 'user-1',
      addresseeId: 'friend-1',
      status: 'accepted',
    }));
    const req = {
      params: { friendshipId: 'friendship-1' },
      userId: 'user-1',
    };
    const res = createResponse();

    await removeFriend(req, res);

    expect(prismaMock.friendship.delete).toHaveBeenCalledWith({
      where: { id: 'friendship-1' },
    });
    expect(ioMock.to).toHaveBeenCalledWith('user:friend-1');
    expect(ioTargetMock.emit).toHaveBeenCalledWith('friend:removed', {
      friendshipId: 'friendship-1',
    });
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('maps friendship state into search results', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      user({ id: 'friend-1', username: 'GraceCafe' }),
      user({ id: 'friend-2', username: 'KatherineCafe' }),
    ]);
    prismaMock.friendship.findMany.mockResolvedValue([
      friendship({
        id: 'friendship-1',
        requesterId: 'friend-1',
        addresseeId: 'user-1',
        status: 'pending',
      }),
    ]);
    const req = {
      query: { q: 'ca' },
      userId: 'user-1',
    };
    const res = createResponse();

    await searchUsers(req, res);

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: {
        username: { contains: 'ca', mode: 'insensitive' },
        id: { not: 'user-1' },
        blocksReceived: { none: { blockerId: 'user-1' } },
        blocksMade: { none: { blockedId: 'user-1' } },
      },
      select: { id: true, username: true, discriminator: true, avatar: true },
      take: 20,
    });
    expect(res.json).toHaveBeenCalledWith({
      users: [
        expect.objectContaining({
          id: 'friend-1',
          friendship: {
            status: 'pending',
            id: 'friendship-1',
            isIncoming: true,
          },
        }),
        expect.objectContaining({
          id: 'friend-2',
          friendship: null,
        }),
      ],
    });
  });

  it('does not load direct messages when an accepted friendship is blocked', async () => {
    prismaMock.friendship.findFirst.mockResolvedValue(friendship({
      requesterId: 'user-1',
      addresseeId: 'friend-1',
      status: 'accepted',
    }));
    blocksMock.isBlockedBetween.mockResolvedValue(true);
    const req = {
      params: { friendId: 'friend-1' },
      userId: 'user-1',
    };
    const res = createResponse();

    await getConversation(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Conversation is blocked' });
    expect(prismaMock.directMessage.findMany).not.toHaveBeenCalled();
    expect(prismaMock.directMessage.updateMany).not.toHaveBeenCalled();
  });

  it('loads direct messages for accepted unblocked friendships and marks unread messages read', async () => {
    const messages = [{ id: 'dm-1', conversationId: 'friend-1_user-1', text: 'hello' }];
    prismaMock.friendship.findFirst.mockResolvedValue(friendship({
      requesterId: 'friend-1',
      addresseeId: 'user-1',
      status: 'accepted',
    }));
    prismaMock.directMessage.findMany.mockResolvedValue(messages);
    const req = {
      params: { friendId: 'friend-1' },
      userId: 'user-1',
    };
    const res = createResponse();

    await getConversation(req, res);

    expect(prismaMock.directMessage.findMany).toHaveBeenCalledWith({
      where: { conversationId: 'friend-1_user-1' },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: {
        sender: { select: { id: true, username: true, discriminator: true, avatar: true } },
        replyTo: {
          include: {
            sender: { select: { id: true, username: true } },
          },
        },
      },
    });
    expect(prismaMock.directMessage.updateMany).toHaveBeenCalledWith({
      where: { conversationId: 'friend-1_user-1', receiverId: 'user-1', read: false },
      data: { read: true },
    });
    expect(res.json).toHaveBeenCalledWith({ messages });
  });

  it('builds the conversation list, skips blocked friends, and sorts by newest message', async () => {
    const older = new Date('2026-05-29T10:00:00.000Z');
    const newer = new Date('2026-05-29T12:00:00.000Z');
    prismaMock.friendship.findMany.mockResolvedValue([
      friendship({
        id: 'friendship-older',
        requesterId: 'user-1',
        addresseeId: 'friend-1',
        status: 'accepted',
      }),
      friendship({
        id: 'friendship-newer',
        requesterId: 'user-1',
        addresseeId: 'friend-2',
        addressee: user({ id: 'friend-2', username: 'NewCafe' }),
        status: 'accepted',
      }),
      friendship({
        id: 'friendship-blocked',
        requesterId: 'user-1',
        addresseeId: 'blocked-1',
        addressee: user({ id: 'blocked-1', username: 'BlockedCafe' }),
        status: 'accepted',
      }),
    ]);
    blocksMock.isBlockedBetween
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    prismaMock.directMessage.findFirst
      .mockResolvedValueOnce({ id: 'older-message', createdAt: older })
      .mockResolvedValueOnce({ id: 'newer-message', createdAt: newer });
    prismaMock.directMessage.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(3);
    const req = { userId: 'user-1' };
    const res = createResponse();

    await getConversationsList(req, res);

    expect(res.json).toHaveBeenCalledWith({
      conversations: [
        expect.objectContaining({
          friendshipId: 'friendship-newer',
          lastMessage: { id: 'newer-message', createdAt: newer },
          unreadCount: 3,
        }),
        expect.objectContaining({
          friendshipId: 'friendship-older',
          lastMessage: { id: 'older-message', createdAt: older },
          unreadCount: 1,
        }),
      ],
    });
  });
});
