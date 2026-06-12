import prisma from '../lib/prisma.js';
import { getIo } from '../socket/handlers.js';
import {
  MAX_DRAWING_STROKES,
  normalizeDrawStrokes,
} from '../lib/drawing.js';

const MAX_GALLERY_PREVIEW_LENGTH = 900_000;

async function getRoomMembership(userId, roomId) {
  return prisma.roomMember.findUnique({
    where: { userId_roomId: { userId, roomId } },
  });
}

async function getRoomManagerInfo(userId, roomId) {
  const [room, user] = await Promise.all([
    prisma.room.findUnique({ where: { id: roomId }, select: { id: true, ownerId: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } }),
  ]);

  return {
    room,
    canManage: Boolean(room && (room.ownerId === userId || user?.role === 'admin')),
  };
}

function serializeGalleryItem(item) {
  return {
    id: item.id,
    title: item.title,
    imageData: item.imageData,
    strokes: item.strokes,
    createdAt: item.createdAt,
    roomId: item.roomId,
    authorId: item.authorId,
    author: item.author,
  };
}

function cleanTitle(title) {
  if (typeof title !== 'string') return null;
  const trimmed = title.trim();
  return trimmed ? trimmed.slice(0, 80) : null;
}

function isValidPreviewData(imageData) {
  return (
    typeof imageData === 'string' &&
    imageData.length > 50 &&
    imageData.length <= MAX_GALLERY_PREVIEW_LENGTH &&
    /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(imageData)
  );
}

export async function getDrawingState(req, res) {
  try {
    const { roomId } = req.params;
    const membership = await getRoomMembership(req.userId, roomId);
    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }

    const [state, managerInfo] = await Promise.all([
      prisma.drawingState.findUnique({ where: { roomId } }),
      getRoomManagerInfo(req.userId, roomId),
    ]);

    res.json({
      strokes: normalizeDrawStrokes(state?.strokes || []),
      canManage: managerInfo.canManage,
      updatedAt: state?.updatedAt || null,
    });
  } catch (error) {
    console.error('Get drawing state error:', error);
    res.status(500).json({ error: 'Failed to fetch drawing state' });
  }
}

export async function getDrawingGallery(req, res) {
  try {
    const { roomId } = req.params;
    const membership = await getRoomMembership(req.userId, roomId);
    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }

    const [items, managerInfo] = await Promise.all([
      prisma.drawingGalleryItem.findMany({
        where: { roomId },
        orderBy: { createdAt: 'desc' },
        take: 60,
        include: {
          author: { select: { id: true, username: true, avatar: true } },
        },
      }),
      getRoomManagerInfo(req.userId, roomId),
    ]);

    res.json({
      drawings: items.map(serializeGalleryItem),
      canManage: managerInfo.canManage,
    });
  } catch (error) {
    console.error('Get drawing gallery error:', error);
    res.status(500).json({ error: 'Failed to fetch drawing gallery' });
  }
}

export async function createDrawingGalleryItem(req, res) {
  try {
    const { roomId } = req.params;
    const { title, imageData, strokes } = req.body || {};

    const membership = await getRoomMembership(req.userId, roomId);
    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }

    if (!isValidPreviewData(imageData)) {
      return res.status(400).json({ error: 'Invalid drawing preview' });
    }

    const cleanStrokes = normalizeDrawStrokes(strokes).slice(-MAX_DRAWING_STROKES);
    if (cleanStrokes.length === 0) {
      return res.status(400).json({ error: 'Nothing to save yet' });
    }

    const item = await prisma.drawingGalleryItem.create({
      data: {
        title: cleanTitle(title),
        imageData,
        strokes: cleanStrokes,
        roomId,
        authorId: req.userId,
      },
      include: {
        author: { select: { id: true, username: true, avatar: true } },
      },
    });

    const drawing = serializeGalleryItem(item);
    getIo()?.to(roomId).emit('drawing:gallery:new', drawing);
    res.status(201).json({ drawing });
  } catch (error) {
    console.error('Create drawing gallery item error:', error);
    res.status(500).json({ error: 'Failed to save drawing' });
  }
}

export async function deleteDrawingGalleryItem(req, res) {
  try {
    const { roomId, drawingId } = req.params;
    const membership = await getRoomMembership(req.userId, roomId);
    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }

    const item = await prisma.drawingGalleryItem.findUnique({ where: { id: drawingId } });
    if (!item || item.roomId !== roomId) {
      return res.status(404).json({ error: 'Drawing not found' });
    }

    const { canManage } = await getRoomManagerInfo(req.userId, roomId);
    if (!canManage) {
      return res.status(403).json({ error: 'Only the room creator or an admin can delete gallery drawings' });
    }

    await prisma.drawingGalleryItem.delete({ where: { id: drawingId } });
    getIo()?.to(roomId).emit('drawing:gallery:removed', { id: drawingId });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete drawing gallery item error:', error);
    res.status(500).json({ error: 'Failed to delete drawing' });
  }
}
