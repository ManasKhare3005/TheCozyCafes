import prisma from '../lib/prisma.js';
import { getIo } from '../socket/handlers.js';

export async function getBookmarks(req, res) {
  try {
    const { roomId } = req.params;

    const membership = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: req.userId, roomId } },
    });
    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }

    const bookmarks = await prisma.bookmark.findMany({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        user: { select: { id: true, username: true, avatar: true } },
      },
    });

    res.json({ bookmarks });
  } catch (error) {
    console.error('Get bookmarks error:', error);
    res.status(500).json({ error: 'Failed to fetch bookmarks' });
  }
}

export async function createBookmark(req, res) {
  try {
    const { roomId } = req.params;
    const { url, title, description } = req.body;

    if (!url || !url.trim()) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const membership = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: req.userId, roomId } },
    });
    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }

    const bookmark = await prisma.bookmark.create({
      data: {
        url: url.trim(),
        title: title?.trim() || null,
        description: description?.trim() || null,
        userId: req.userId,
        roomId,
      },
      include: {
        user: { select: { id: true, username: true, avatar: true } },
      },
    });

    // Broadcast to room
    const io = getIo();
    if (io) {
      io.to(roomId).emit('bookmark:new', bookmark);
    }

    res.status(201).json({ bookmark });
  } catch (error) {
    console.error('Create bookmark error:', error);
    res.status(500).json({ error: 'Failed to create bookmark' });
  }
}

export async function deleteBookmark(req, res) {
  try {
    const { roomId, bookmarkId } = req.params;

    const bookmark = await prisma.bookmark.findUnique({ where: { id: bookmarkId } });
    if (!bookmark || bookmark.roomId !== roomId) {
      return res.status(404).json({ error: 'Bookmark not found' });
    }

    // Only the author or room owner can delete
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (bookmark.userId !== req.userId && room.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to delete this bookmark' });
    }

    await prisma.bookmark.delete({ where: { id: bookmarkId } });

    const io = getIo();
    if (io) {
      io.to(roomId).emit('bookmark:removed', { id: bookmarkId });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete bookmark error:', error);
    res.status(500).json({ error: 'Failed to delete bookmark' });
  }
}
