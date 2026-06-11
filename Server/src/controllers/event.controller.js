import prisma from '../lib/prisma.js';
import { getIo } from '../socket/handlers.js';

export async function getEvents(req, res) {
  try {
    const { roomId } = req.params;

    const membership = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: req.userId, roomId } },
    });
    if (!membership) return res.status(403).json({ error: 'Not a member of this room' });

    const events = await prisma.roomEvent.findMany({
      where: { roomId },
      orderBy: { scheduledAt: 'asc' },
      take: 20,
      include: {
        creator: { select: { id: true, username: true } },
        rsvps: {
          include: { user: { select: { id: true, username: true } } },
        },
      },
    });

    res.json({ events });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
}

export async function createEvent(req, res) {
  try {
    const { roomId } = req.params;
    const { title, description, scheduledAt } = req.body;

    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
    if (!scheduledAt) return res.status(400).json({ error: 'Date/time is required' });

    const scheduled = new Date(scheduledAt);
    if (isNaN(scheduled.getTime()) || scheduled < new Date()) {
      return res.status(400).json({ error: 'Scheduled time must be in the future' });
    }

    const membership = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: req.userId, roomId } },
    });
    if (!membership) return res.status(403).json({ error: 'Not a member of this room' });

    const event = await prisma.roomEvent.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        scheduledAt: scheduled,
        creatorId: req.userId,
        roomId,
      },
      include: {
        creator: { select: { id: true, username: true } },
        rsvps: { include: { user: { select: { id: true, username: true } } } },
      },
    });

    const io = getIo();
    if (io) io.to(roomId).emit('event:created', event);

    res.status(201).json({ event });
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
}

export async function rsvpEvent(req, res) {
  try {
    const { roomId, eventId } = req.params;
    const { status } = req.body; // "going", "maybe", "not_going"

    if (!['going', 'maybe', 'not_going'].includes(status)) {
      return res.status(400).json({ error: 'Invalid RSVP status' });
    }

    const membership = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: req.userId, roomId } },
    });
    if (!membership) return res.status(403).json({ error: 'Not a member of this room' });

    const event = await prisma.roomEvent.findUnique({ where: { id: eventId } });
    if (!event || event.roomId !== roomId) {
      return res.status(404).json({ error: 'Event not found' });
    }

    await prisma.eventRsvp.upsert({
      where: { userId_eventId: { userId: req.userId, eventId } },
      update: { status },
      create: { status, userId: req.userId, eventId },
    });

    // Fetch updated event
    const updated = await prisma.roomEvent.findUnique({
      where: { id: eventId },
      include: {
        creator: { select: { id: true, username: true } },
        rsvps: { include: { user: { select: { id: true, username: true } } } },
      },
    });

    const io = getIo();
    if (io) io.to(roomId).emit('event:updated', updated);

    res.json({ event: updated });
  } catch (error) {
    console.error('RSVP error:', error);
    res.status(500).json({ error: 'Failed to RSVP' });
  }
}

export async function deleteEvent(req, res) {
  try {
    const { roomId, eventId } = req.params;

    const event = await prisma.roomEvent.findUnique({ where: { id: eventId } });
    if (!event || event.roomId !== roomId) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (event.creatorId !== req.userId && room.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await prisma.roomEvent.delete({ where: { id: eventId } });

    const io = getIo();
    if (io) io.to(roomId).emit('event:deleted', { id: eventId });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
}
