import prisma from '../lib/prisma.js';
import { getIo } from '../socket/handlers.js';
import { evaluateTextSafety } from '../lib/contentSafety.js';

// Get confessions for a room
export async function getConfessions(req, res) {
  try {
    const { roomId } = req.params;
    const { limit: rawLimit = 20, before } = req.query;
    const limit = Math.min(Math.max(parseInt(rawLimit) || 20, 1), 50);

    // Verify membership
    const membership = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: req.userId, roomId } },
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }

    // authorId is intentionally excluded — it exists only for moderation
    const confessions = await prisma.confession.findMany({
      where: {
        roomId,
        ...(before && { createdAt: { lt: new Date(before) } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, text: true, roomId: true, createdAt: true },
    });

    res.json({ confessions: confessions.reverse() });
  } catch (error) {
    console.error('Get confessions error:', error);
    res.status(500).json({ error: 'Failed to fetch confessions' });
  }
}

// Post an anonymous confession
export async function createConfession(req, res) {
  try {
    const { roomId } = req.params;
    const { text } = req.body;

    if (!text || !text.trim() || text.trim().length > 500) {
      return res.status(400).json({ error: 'Confession must be 1-500 characters' });
    }

    const safety = evaluateTextSafety(text.trim(), { maxLinks: 0, maxInviteLinks: 0 });
    if (!safety.allowed) {
      return res.status(400).json({ error: safety.message });
    }

    // Verify membership
    const membership = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: req.userId, roomId } },
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }

    // Author stored secretly for moderation only — never exposed in responses
    const confession = await prisma.confession.create({
      data: {
        text: text.trim(),
        roomId,
        authorId: req.userId,
      },
      select: { id: true, text: true, roomId: true, createdAt: true },
    });

    // Broadcast to room
    const io = getIo();
    if (io) {
      io.to(roomId).emit('confession:new', {
        id: confession.id,
        text: confession.text,
        createdAt: confession.createdAt.toISOString(),
      });
    }

    res.status(201).json({ confession });
  } catch (error) {
    console.error('Create confession error:', error);
    res.status(500).json({ error: 'Failed to post confession' });
  }
}
