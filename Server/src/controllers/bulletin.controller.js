import prisma from '../lib/prisma.js';
import { getIo } from '../socket/handlers.js';

const EXPIRY_HOURS = 24;

export async function getActiveBulletins(req, res) {
  try {
    const bulletins = await prisma.cafeBulletin.findMany({
      where: { expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      include: {
        room: { select: { id: true, name: true, isPrivate: true } },
        author: { select: { id: true, username: true } },
        _count: { select: { stars: true } },
        stars: {
          where: { userId: req.userId },
          select: { id: true },
        },
      },
    });

    const result = bulletins.map((b) => ({
      id: b.id,
      text: b.text,
      createdAt: b.createdAt,
      expiresAt: b.expiresAt,
      room: b.room,
      author: b.author,
      starCount: b._count.stars,
      hasStarred: b.stars.length > 0,
    }));

    res.json({ bulletins: result });
  } catch (err) {
    console.error('Failed to fetch bulletins:', err);
    res.status(500).json({ error: 'Failed to fetch bulletins' });
  }
}

export async function createBulletin(req, res) {
  try {
    const { roomId, text } = req.body;

    if (!text?.trim() || text.length > 120) {
      return res.status(400).json({ error: 'Bulletin text is required (max 120 chars)' });
    }

    // Verify user is the room owner
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Only the room owner can create bulletins' });
    }

    // Remove any existing active bulletin for this room
    await prisma.cafeBulletin.deleteMany({
      where: { roomId, expiresAt: { gt: new Date() } },
    });

    const bulletin = await prisma.cafeBulletin.create({
      data: {
        text: text.trim(),
        roomId,
        authorId: req.userId,
        expiresAt: new Date(Date.now() + EXPIRY_HOURS * 60 * 60 * 1000),
      },
      include: {
        room: { select: { id: true, name: true, isPrivate: true } },
        author: { select: { id: true, username: true } },
      },
    });

    const result = {
      ...bulletin,
      starCount: 0,
      hasStarred: false,
    };

    const io = getIo();
    if (io) io.emit('bulletin:new', result);

    res.status(201).json({ bulletin: result });
  } catch (err) {
    console.error('Failed to create bulletin:', err);
    res.status(500).json({ error: 'Failed to create bulletin' });
  }
}

export async function deleteBulletin(req, res) {
  try {
    const { bulletinId } = req.params;

    const bulletin = await prisma.cafeBulletin.findUnique({ where: { id: bulletinId } });
    if (!bulletin) return res.status(404).json({ error: 'Bulletin not found' });
    if (bulletin.authorId !== req.userId) {
      return res.status(403).json({ error: 'Only the author can delete this bulletin' });
    }

    await prisma.cafeBulletin.delete({ where: { id: bulletinId } });

    const io = getIo();
    if (io) io.emit('bulletin:removed', { bulletinId });

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete bulletin:', err);
    res.status(500).json({ error: 'Failed to delete bulletin' });
  }
}

export async function toggleStar(req, res) {
  try {
    const { bulletinId } = req.params;

    const bulletin = await prisma.cafeBulletin.findUnique({ where: { id: bulletinId } });
    if (!bulletin) return res.status(404).json({ error: 'Bulletin not found' });

    const existing = await prisma.cafeBulletinStar.findUnique({
      where: { userId_bulletinId: { userId: req.userId, bulletinId } },
    });

    if (existing) {
      await prisma.cafeBulletinStar.delete({ where: { id: existing.id } });
    } else {
      await prisma.cafeBulletinStar.create({
        data: { userId: req.userId, bulletinId },
      });
    }

    const starCount = await prisma.cafeBulletinStar.count({ where: { bulletinId } });

    const io = getIo();
    if (io) io.emit('bulletin:starred', { bulletinId, starCount });

    res.json({ starred: !existing, starCount });
  } catch (err) {
    console.error('Failed to toggle star:', err);
    res.status(500).json({ error: 'Failed to toggle star' });
  }
}
