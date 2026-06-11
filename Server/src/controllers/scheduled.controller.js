import prisma from '../lib/prisma.js';

// Create a scheduled message
export async function createScheduledMessage(req, res) {
  try {
    const { roomId, text, scheduledAt } = req.body;

    if (!roomId || !text?.trim() || !scheduledAt) {
      return res.status(400).json({ error: 'roomId, text, and scheduledAt are required' });
    }

    if (text.length > 5000) {
      return res.status(400).json({ error: 'Message too long (max 5000 characters)' });
    }

    const scheduleDate = new Date(scheduledAt);
    if (isNaN(scheduleDate.getTime()) || scheduleDate <= new Date()) {
      return res.status(400).json({ error: 'scheduledAt must be a future date' });
    }

    // Verify user is a member of the room
    const membership = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: req.userId, roomId } },
    });
    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }

    const scheduled = await prisma.scheduledMessage.create({
      data: {
        text: text.trim(),
        scheduledAt: scheduleDate,
        senderId: req.userId,
        roomId,
      },
      include: {
        room: { select: { id: true, name: true } },
      },
    });

    res.status(201).json({ scheduled });
  } catch (error) {
    console.error('Create scheduled message error:', error);
    res.status(500).json({ error: 'Failed to schedule message' });
  }
}

// Get user's scheduled messages (optionally filtered by room)
export async function getScheduledMessages(req, res) {
  try {
    const { roomId } = req.query;

    const where = {
      senderId: req.userId,
      status: 'pending',
    };
    if (roomId) where.roomId = roomId;

    const messages = await prisma.scheduledMessage.findMany({
      where,
      include: {
        room: { select: { id: true, name: true } },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    res.json({ messages });
  } catch (error) {
    console.error('Get scheduled messages error:', error);
    res.status(500).json({ error: 'Failed to fetch scheduled messages' });
  }
}

// Cancel a scheduled message
export async function cancelScheduledMessage(req, res) {
  try {
    const { id } = req.params;

    const msg = await prisma.scheduledMessage.findUnique({ where: { id } });
    if (!msg) {
      return res.status(404).json({ error: 'Scheduled message not found' });
    }
    if (msg.senderId !== req.userId) {
      return res.status(403).json({ error: 'Not your scheduled message' });
    }
    if (msg.status !== 'pending') {
      return res.status(400).json({ error: 'Message already sent or cancelled' });
    }

    await prisma.scheduledMessage.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    res.json({ message: 'Scheduled message cancelled' });
  } catch (error) {
    console.error('Cancel scheduled message error:', error);
    res.status(500).json({ error: 'Failed to cancel scheduled message' });
  }
}
