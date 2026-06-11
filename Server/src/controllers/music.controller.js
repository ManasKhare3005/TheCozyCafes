import prisma from '../lib/prisma.js';

// Socket.IO instance, injected from index.js (same pattern as kick.controller)
let ioInstance = null;

export function setSocketInstance(io) {
  ioInstance = io;
}

function emitMusicUpdated(roomId) {
  if (ioInstance) {
    ioInstance.to(roomId).emit('music:updated', { roomId });
  }
}

// Extract YouTube video ID from various URL formats
function extractYouTubeId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Get queue for a room
export async function getQueue(req, res) {
  try {
    const { roomId } = req.params;

    const tracks = await prisma.musicTrack.findMany({
      where: { roomId, status: { in: ['queued', 'playing'] } },
      orderBy: { createdAt: 'asc' },
      include: {
        addedBy: { select: { id: true, username: true, avatar: true } },
      },
    });

    const nowPlaying = tracks.find((t) => t.status === 'playing') || null;
    const queue = tracks.filter((t) => t.status === 'queued');

    res.json({ nowPlaying, queue });
  } catch (error) {
    console.error('Get queue error:', error);
    res.status(500).json({ error: 'Failed to fetch queue' });
  }
}

// Add track to queue
export async function addTrack(req, res) {
  try {
    const { roomId } = req.params;
    const { url, title } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const videoId = extractYouTubeId(url);
    if (!videoId) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    // Verify membership
    const membership = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: req.userId, roomId } },
    });
    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }

    // Limit queue size to 50
    const queueSize = await prisma.musicTrack.count({
      where: { roomId, status: 'queued' },
    });
    if (queueSize >= 50) {
      return res.status(400).json({ error: 'Queue is full (max 50 tracks)' });
    }

    const thumbnail = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;

    const track = await prisma.musicTrack.create({
      data: {
        url: cleanUrl,
        title: title || `YouTube Video`,
        thumbnail,
        addedById: req.userId,
        roomId,
      },
      include: {
        addedBy: { select: { id: true, username: true, avatar: true } },
      },
    });

    // If nothing is playing, auto-play this track
    const playing = await prisma.musicTrack.findFirst({
      where: { roomId, status: 'playing' },
    });

    if (!playing) {
      await prisma.musicTrack.update({
        where: { id: track.id },
        data: { status: 'playing' },
      });
      track.status = 'playing';
    }

    // Broadcast via socket (set by setSocketInstance)
    emitMusicUpdated(roomId);

    res.json({ track });
  } catch (error) {
    console.error('Add track error:', error);
    res.status(500).json({ error: 'Failed to add track' });
  }
}

// Skip current track / advance queue
export async function skipTrack(req, res) {
  try {
    const { roomId } = req.params;

    // Mark current as skipped
    const current = await prisma.musicTrack.findFirst({
      where: { roomId, status: 'playing' },
    });

    if (current) {
      await prisma.musicTrack.update({
        where: { id: current.id },
        data: { status: 'skipped' },
      });
    }

    // Play next in queue
    const next = await prisma.musicTrack.findFirst({
      where: { roomId, status: 'queued' },
      orderBy: { createdAt: 'asc' },
    });

    if (next) {
      await prisma.musicTrack.update({
        where: { id: next.id },
        data: { status: 'playing' },
      });
    }

    emitMusicUpdated(roomId);

    res.json({ success: true });
  } catch (error) {
    console.error('Skip track error:', error);
    res.status(500).json({ error: 'Failed to skip track' });
  }
}

// Track ended â€” advance to next
export async function trackEnded(req, res) {
  try {
    const { roomId } = req.params;

    const current = await prisma.musicTrack.findFirst({
      where: { roomId, status: 'playing' },
    });

    if (current) {
      await prisma.musicTrack.update({
        where: { id: current.id },
        data: { status: 'played' },
      });
    }

    const next = await prisma.musicTrack.findFirst({
      where: { roomId, status: 'queued' },
      orderBy: { createdAt: 'asc' },
    });

    if (next) {
      await prisma.musicTrack.update({
        where: { id: next.id },
        data: { status: 'playing' },
      });
    }

    emitMusicUpdated(roomId);

    res.json({ success: true });
  } catch (error) {
    console.error('Track ended error:', error);
    res.status(500).json({ error: 'Failed to advance queue' });
  }
}

// Remove a track from queue (only adder or room owner)
export async function removeTrack(req, res) {
  try {
    const { roomId, trackId } = req.params;

    const track = await prisma.musicTrack.findUnique({
      where: { id: trackId },
      include: { room: { select: { ownerId: true } } },
    });

    if (!track || track.roomId !== roomId) {
      return res.status(404).json({ error: 'Track not found' });
    }

    if (track.addedById !== req.userId && track.room.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to remove this track' });
    }

    const wasPlaying = track.status === 'playing';

    await prisma.musicTrack.delete({ where: { id: trackId } });

    // If we removed the playing track, advance to next
    if (wasPlaying) {
      const next = await prisma.musicTrack.findFirst({
        where: { roomId, status: 'queued' },
        orderBy: { createdAt: 'asc' },
      });
      if (next) {
        await prisma.musicTrack.update({
          where: { id: next.id },
          data: { status: 'playing' },
        });
      }
    }

    emitMusicUpdated(roomId);

    res.json({ success: true });
  } catch (error) {
    console.error('Remove track error:', error);
    res.status(500).json({ error: 'Failed to remove track' });
  }
}
