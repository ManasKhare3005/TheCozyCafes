import prisma from '../lib/prisma.js';

export async function searchMessages(req, res) {
  try {
    const { roomId } = req.params;
    const { q, limit: rawLimit = 20, before } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const query = q.trim();
    if (query.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const limit = Math.min(Math.max(parseInt(rawLimit) || 20, 1), 50);

    // Verify membership
    const membership = await prisma.roomMember.findUnique({
      where: {
        userId_roomId: { userId: req.userId, roomId },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }

    const messages = await prisma.message.findMany({
      where: {
        roomId,
        isEphemeral: false,
        text: { contains: query, mode: 'insensitive' },
        ...(before && { createdAt: { lt: new Date(before) } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        sender: {
          select: { id: true, username: true, avatar: true },
        },
      },
    });

    res.json({ messages: messages.reverse() });
  } catch (error) {
    console.error('Search messages error:', error);
    res.status(500).json({ error: 'Failed to search messages' });
  }
}

export async function getMessages(req, res) {
  try {
    const { roomId } = req.params;
    const { limit: rawLimit = 50, before } = req.query;
    const limit = Math.min(Math.max(parseInt(rawLimit) || 50, 1), 100);

    // Verify user is a member of the room
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

    const messages = await prisma.message.findMany({
      where: {
        roomId,
        isEphemeral: false,
        isDeleted: false,
        parentId: null, // Only top-level messages (not thread replies)
        ...(before && { createdAt: { lt: new Date(before) } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
        replyTo: {
          include: {
            sender: {
              select: { id: true, username: true },
            },
          },
        },
        reactions: {
          select: { emoji: true, userId: true },
        },
      },
    });

    // Group reactions per message and return in chronological order
    const formatted = messages.reverse().map(msg => {
      const grouped = {};
      for (const r of (msg.reactions || [])) {
        if (!grouped[r.emoji]) grouped[r.emoji] = [];
        grouped[r.emoji].push(r.userId);
      }
      return { ...msg, reactions: grouped };
    });

    res.json({ messages: formatted });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
}

// Get thread replies for a message
export async function getThreadMessages(req, res) {
  try {
    const { messageId } = req.params;

    // Fetch the parent message first to get room context
    const parent = await prisma.message.findUnique({
      where: { id: messageId },
      select: { roomId: true },
    });

    if (!parent) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Verify membership
    const membership = await prisma.roomMember.findUnique({
      where: {
        userId_roomId: { userId: req.userId, roomId: parent.roomId },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }

    const replies = await prisma.message.findMany({
      where: { parentId: messageId },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: {
          select: { id: true, username: true, avatar: true },
        },
        replyTo: {
          include: {
            sender: { select: { id: true, username: true } },
          },
        },
        reactions: {
          select: { emoji: true, userId: true },
        },
      },
    });

    const formatted = replies.map(msg => {
      const grouped = {};
      for (const r of (msg.reactions || [])) {
        if (!grouped[r.emoji]) grouped[r.emoji] = [];
        grouped[r.emoji].push(r.userId);
      }
      return { ...msg, reactions: grouped };
    });

    res.json({ messages: formatted });
  } catch (error) {
    console.error('Get thread messages error:', error);
    res.status(500).json({ error: 'Failed to fetch thread' });
  }
}
