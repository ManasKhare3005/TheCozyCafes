import prisma from '../lib/prisma.js';
import { getIo } from '../socket/handlers.js';
import { createNotification } from './notification.controller.js';
import { isBlockedBetween } from '../lib/blocks.js';

function getConversationId(userId1, userId2) {
  return [userId1, userId2].sort().join('_');
}

// GET /api/friends
export async function getFriends(req, res) {
  try {
    const friendships = await prisma.friendship.findMany({
      where: {
        status: 'accepted',
        OR: [
          { requesterId: req.userId },
          { addresseeId: req.userId },
        ],
      },
      include: {
        requester: { select: { id: true, username: true, discriminator: true, avatar: true } },
        addressee: { select: { id: true, username: true, discriminator: true, avatar: true } },
      },
    });

    const friends = await Promise.all(friendships.map(async (f) => {
      const friend = f.requesterId === req.userId ? f.addressee : f.requester;

      if (await isBlockedBetween(req.userId, friend.id)) {
        return null;
      }

      // Count unread DMs from this friend
      const unreadCount = await prisma.directMessage.count({
        where: {
          senderId: friend.id,
          receiverId: req.userId,
          read: false,
        },
      });

      return {
        friendshipId: f.id,
        friend,
        unreadCount,
      };
    }));

    res.json({ friends: friends.filter(Boolean) });
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
}

// GET /api/friends/requests
export async function getPendingRequests(req, res) {
  try {
    const incoming = await prisma.friendship.findMany({
      where: { addresseeId: req.userId, status: 'pending' },
      include: {
        requester: { select: { id: true, username: true, discriminator: true, avatar: true } },
      },
    });

    const outgoing = await prisma.friendship.findMany({
      where: { requesterId: req.userId, status: 'pending' },
      include: {
        addressee: { select: { id: true, username: true, discriminator: true, avatar: true } },
      },
    });

    res.json({ incoming, outgoing });
  } catch (error) {
    console.error('Get requests error:', error);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
}

// POST /api/friends/request
export async function sendFriendRequest(req, res) {
  try {
    const { username, addresseeId } = req.body;

    if (!username && !addresseeId) {
      return res.status(400).json({ error: 'Username or addresseeId is required' });
    }

    let addressee;
    if (addresseeId) {
      addressee = await prisma.user.findUnique({
        where: { id: addresseeId },
        select: { id: true, username: true, discriminator: true, avatar: true },
      });
    } else {
      // Support "username#1234" format
      const hashMatch = username.match(/^(.+)#(\d{4})$/);
      if (hashMatch) {
        addressee = await prisma.user.findFirst({
          where: { username: hashMatch[1], discriminator: hashMatch[2] },
          select: { id: true, username: true, discriminator: true, avatar: true },
        });
      } else {
        addressee = await prisma.user.findUnique({
          where: { username },
          select: { id: true, username: true, discriminator: true, avatar: true },
        });
      }
    }

    if (!addressee) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (addressee.id === req.userId) {
      return res.status(400).json({ error: "You can't add yourself" });
    }

    if (await isBlockedBetween(req.userId, addressee.id)) {
      return res.status(403).json({ error: 'Cannot send a friend request to this user' });
    }

    // Check for existing friendship in either direction
    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: req.userId, addresseeId: addressee.id },
          { requesterId: addressee.id, addresseeId: req.userId },
        ],
      },
    });

    if (existing) {
      if (existing.status === 'accepted') {
        return res.status(400).json({ error: 'Already friends' });
      }
      if (existing.status === 'pending') {
        return res.status(400).json({ error: 'Friend request already pending' });
      }
      // If declined, delete old and allow re-request
      await prisma.friendship.delete({ where: { id: existing.id } });
    }

    const friendship = await prisma.friendship.create({
      data: {
        requesterId: req.userId,
        addresseeId: addressee.id,
      },
      include: {
        requester: { select: { id: true, username: true, discriminator: true, avatar: true } },
        addressee: { select: { id: true, username: true, discriminator: true, avatar: true } },
      },
    });

    // Notify addressee via socket
    const io = getIo();
    if (io) {
      io.to(`user:${addressee.id}`).emit('friend:request:received', { friendship });
    }

    // Create notification
    await createNotification({
      userId: addressee.id,
      type: 'friend_request',
      title: 'New friend request',
      body: `${friendship.requester.username} sent you a friend request`,
      fromUserId: req.userId,
      fromUsername: friendship.requester.username,
    });

    res.json({ friendship });
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({ error: 'Failed to send friend request' });
  }
}

// POST /api/friends/request/:friendshipId/respond
export async function respondToRequest(req, res) {
  try {
    const { friendshipId } = req.params;
    const { action } = req.body; // 'accept' or 'decline'

    if (!['accept', 'decline'].includes(action)) {
      return res.status(400).json({ error: 'Action must be accept or decline' });
    }

    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (friendship.addresseeId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (friendship.status !== 'pending') {
      return res.status(400).json({ error: 'Request already handled' });
    }

    if (action === 'accept' && await isBlockedBetween(req.userId, friendship.requesterId)) {
      return res.status(403).json({ error: 'Cannot accept this friend request' });
    }

    const updated = await prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: action === 'accept' ? 'accepted' : 'declined' },
      include: {
        requester: { select: { id: true, username: true, discriminator: true, avatar: true } },
        addressee: { select: { id: true, username: true, discriminator: true, avatar: true } },
      },
    });

    // Notify requester via socket
    const io = getIo();
    if (io && action === 'accept') {
      io.to(`user:${friendship.requesterId}`).emit('friend:request:accepted', { friendship: updated });

      // Create notification
      await createNotification({
        userId: friendship.requesterId,
        type: 'friend_accepted',
        title: 'Friend request accepted',
        body: `${updated.addressee.username} accepted your friend request`,
        fromUserId: req.userId,
        fromUsername: updated.addressee.username,
      });
    }

    res.json({ friendship: updated });
  } catch (error) {
    console.error('Respond to request error:', error);
    res.status(500).json({ error: 'Failed to respond to request' });
  }
}

// DELETE /api/friends/:friendshipId
export async function removeFriend(req, res) {
  try {
    const { friendshipId } = req.params;

    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) {
      return res.status(404).json({ error: 'Friendship not found' });
    }

    if (friendship.requesterId !== req.userId && friendship.addresseeId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await prisma.friendship.delete({ where: { id: friendshipId } });

    const otherId = friendship.requesterId === req.userId
      ? friendship.addresseeId
      : friendship.requesterId;

    const io = getIo();
    if (io) {
      io.to(`user:${otherId}`).emit('friend:removed', { friendshipId });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
}

// GET /api/friends/search?q=<query>
export async function searchUsers(req, res) {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.json({ users: [] });
    }

    const users = await prisma.user.findMany({
      where: {
        username: { contains: q, mode: 'insensitive' },
        id: { not: req.userId },
        blocksReceived: { none: { blockerId: req.userId } },
        blocksMade: { none: { blockedId: req.userId } },
      },
      select: { id: true, username: true, discriminator: true, avatar: true },
      take: 20,
    });

    // Get existing friendships with these users
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: req.userId, addresseeId: { in: users.map((u) => u.id) } },
          { addresseeId: req.userId, requesterId: { in: users.map((u) => u.id) } },
        ],
      },
    });

    const friendshipMap = {};
    for (const f of friendships) {
      const otherId = f.requesterId === req.userId ? f.addresseeId : f.requesterId;
      friendshipMap[otherId] = { status: f.status, id: f.id, isIncoming: f.addresseeId === req.userId };
    }

    const results = users.map((u) => ({
      ...u,
      friendship: friendshipMap[u.id] || null,
    }));

    res.json({ users: results });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
}

// GET /api/friends/dm/:friendId
export async function getConversation(req, res) {
  try {
    const { friendId } = req.params;
    const conversationId = getConversationId(req.userId, friendId);

    // Verify friendship
    const friendship = await prisma.friendship.findFirst({
      where: {
        status: 'accepted',
        OR: [
          { requesterId: req.userId, addresseeId: friendId },
          { requesterId: friendId, addresseeId: req.userId },
        ],
      },
    });

    if (!friendship) {
      return res.status(403).json({ error: 'Not friends with this user' });
    }

    if (await isBlockedBetween(req.userId, friendId)) {
      return res.status(403).json({ error: 'Conversation is blocked' });
    }

    const messages = await prisma.directMessage.findMany({
      where: { conversationId },
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

    // Mark unread messages as read
    await prisma.directMessage.updateMany({
      where: { conversationId, receiverId: req.userId, read: false },
      data: { read: true },
    });

    res.json({ messages });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
}

// GET /api/friends/conversations
export async function getConversationsList(req, res) {
  try {
    // Get all accepted friends
    const friendships = await prisma.friendship.findMany({
      where: {
        status: 'accepted',
        OR: [
          { requesterId: req.userId },
          { addresseeId: req.userId },
        ],
      },
      include: {
        requester: { select: { id: true, username: true, discriminator: true, avatar: true } },
        addressee: { select: { id: true, username: true, discriminator: true, avatar: true } },
      },
    });

    const conversations = [];

    for (const f of friendships) {
      const friend = f.requesterId === req.userId ? f.addressee : f.requester;
      if (await isBlockedBetween(req.userId, friend.id)) continue;

      const conversationId = getConversationId(req.userId, friend.id);

      const lastMessage = await prisma.directMessage.findFirst({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
      });

      const unreadCount = await prisma.directMessage.count({
        where: { conversationId, receiverId: req.userId, read: false },
      });

      if (lastMessage) {
        conversations.push({
          friendshipId: f.id,
          friend,
          lastMessage,
          unreadCount,
        });
      }
    }

    // Sort by most recent message
    conversations.sort((a, b) => b.lastMessage.createdAt - a.lastMessage.createdAt);

    res.json({ conversations });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
}
