import prisma from '../lib/prisma.js';
import { getIo } from '../socket/handlers.js';

// GET /api/notifications
export async function getNotifications(req, res) {
  try {
    const { limit: rawLimit = 30, before } = req.query;
    const limit = Math.min(Math.max(parseInt(rawLimit) || 30, 1), 50);

    const notifications = await prisma.notification.findMany({
      where: {
        userId: req.userId,
        ...(before && { createdAt: { lt: new Date(before) } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const unreadCount = await prisma.notification.count({
      where: { userId: req.userId, read: false },
    });

    res.json({ notifications, unreadCount });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
}

// POST /api/notifications/read-all
export async function markAllRead(req, res) {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.userId, read: false },
      data: { read: true },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
}

// POST /api/notifications/:id/read
export async function markRead(req, res) {
  try {
    const { id } = req.params;
    await prisma.notification.updateMany({
      where: { id, userId: req.userId },
      data: { read: true },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
}

// Helper: create a notification and push it via socket
export async function createNotification({ userId, type, title, body, fromUserId, fromUsername, roomId, roomName }) {
  try {
    const notification = await prisma.notification.create({
      data: { userId, type, title, body, fromUserId, fromUsername, roomId, roomName },
    });

    const io = getIo();
    if (io) {
      io.to(`user:${userId}`).emit('notification:new', notification);
    }

    return notification;
  } catch (error) {
    console.error('Create notification error:', error);
  }
}
