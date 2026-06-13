import Groq from 'groq-sdk';
import prisma from '../lib/prisma.js';
import { getIo } from '../socket/handlers.js';
import { createNotification } from './notification.controller.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const STICKY_COLORS = ['yellow', 'pink', 'green', 'blue', 'purple', 'orange'];
const STICKY_REACTIONS = ['❤️', '☕']; // allowed reaction emojis — keep the board calm
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

// Build an anonymous reaction summary for a note: { "❤️": 3, "☕": 1 } and the
// set of emojis the current user has reacted with (for toggle state).
function summarizeReactions(reactions, userId) {
  const counts = {};
  const mine = [];
  for (const r of reactions) {
    counts[r.emoji] = (counts[r.emoji] || 0) + 1;
    if (r.userId === userId && !mine.includes(r.emoji)) mine.push(r.emoji);
  }
  return { counts, mine };
}

// Groq NSFW content check
async function isNSFW(text) {
  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content: `You are a content moderation filter. Analyze the following text and determine if it contains NSFW, offensive, hateful, sexually explicit, violent, bullying, or harassing content.
Respond with ONLY "safe" or "unsafe". Nothing else.`,
        },
        { role: 'user', content: text },
      ],
      max_tokens: 5,
      temperature: 0,
    });

    const result = response.choices[0]?.message?.content?.trim().toLowerCase();
    return result === 'unsafe';
  } catch (err) {
    console.error('Groq moderation check failed:', err);
    // If the check fails, allow the post (fail open) but log it
    return false;
  }
}

// Extract @username tags from text
function extractTags(text) {
  const matches = text.match(/@(\w{3,20})/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

// Get all visible sticky notes
export async function getStickyNotes(req, res) {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const notes = await prisma.stickyNote.findMany({
      where: { isRemoved: false, createdAt: { gte: oneDayAgo } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        text: true,
        color: true,
        rotation: true,
        createdAt: true,
        tags: true,
        authorId: true, // We'll use this to check ownership, but transform below
        reactions: { select: { emoji: true, userId: true } },
      },
    });

    // Transform — include isOwn flag but never expose authorId
    const notesData = notes.map((note) => {
      const { counts, mine } = summarizeReactions(note.reactions, req.userId);
      return {
        id: note.id,
        text: note.text,
        color: note.color,
        rotation: note.rotation,
        createdAt: note.createdAt.toISOString(),
        tags: note.tags ? note.tags.split(',') : [],
        isOwn: note.authorId === req.userId,
        reactions: counts,
        myReactions: mine,
      };
    });

    res.json({ notes: notesData });
  } catch (error) {
    console.error('Get sticky notes error:', error);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
}

// Create a new sticky note
export async function createStickyNote(req, res) {
  try {
    const { text, color: requestedColor } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Note text is required' });
    }

    // Word count check (max 10 words)
    const words = text.trim().split(/\s+/);
    if (words.length > 10) {
      return res.status(400).json({ error: 'Keep it short — 10 words max!' });
    }

    // Character limit as safety net
    if (text.trim().length > 100) {
      return res.status(400).json({ error: 'Note is too long' });
    }

    // Cooldown check — last note by this user
    const lastNote = await prisma.stickyNote.findFirst({
      where: { authorId: req.userId },
      orderBy: { createdAt: 'desc' },
    });

    if (lastNote) {
      const elapsed = Date.now() - lastNote.createdAt.getTime();
      if (elapsed < COOLDOWN_MS) {
        const remaining = COOLDOWN_MS - elapsed;
        const hours = Math.floor(remaining / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        return res.status(429).json({
          error: `You can post again in ${hours}h ${minutes}m`,
          cooldownRemaining: remaining,
        });
      }
    }

    // Groq NSFW check
    const unsafe = await isNSFW(text.trim());
    if (unsafe) {
      return res.status(400).json({
        error: "That note didn't pass our vibe check. Keep it friendly!",
      });
    }

    // Extract tags
    const tagUsernames = extractTags(text);
    const tagsString = tagUsernames.length > 0 ? tagUsernames.join(',') : null;

    // Color — honor the user's pick if valid, otherwise random. Rotation random.
    const color = STICKY_COLORS.includes(requestedColor)
      ? requestedColor
      : STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
    const rotation = (Math.random() - 0.5) * 12; // -6 to +6 degrees

    const note = await prisma.stickyNote.create({
      data: {
        text: text.trim(),
        color,
        rotation,
        authorId: req.userId,
        tags: tagsString,
      },
    });

    const noteData = {
      id: note.id,
      text: note.text,
      color: note.color,
      rotation: note.rotation,
      createdAt: note.createdAt.toISOString(),
      tags: tagUsernames,
      isOwn: false, // For other users; the creator will get isOwn=true from their own fetch
      reactions: {},
      myReactions: [],
    };

    // Broadcast to all connected users
    const io = getIo();
    if (io) {
      io.emit('sticky:new', noteData);

      // Notify tagged users
      if (tagUsernames.length > 0) {
        const taggedUsers = await prisma.user.findMany({
          where: {
            username: { in: tagUsernames, mode: 'insensitive' },
            id: { not: req.userId }, // Don't notify yourself
          },
          select: { id: true, username: true },
        });

        for (const tagged of taggedUsers) {
          // Live in-board toast (only seen if they're viewing the board)
          io.to(`user:${tagged.id}`).emit('sticky:tagged', {
            noteId: note.id,
            noteText: note.text,
          });
          // Persisted notification so the mention survives in the bell
          await createNotification({
            userId: tagged.id,
            type: 'mention',
            title: 'You were mentioned on The Board',
            body: note.text,
          });
        }
      }
    }

    res.status(201).json({
      note: { ...noteData, isOwn: true },
    });
  } catch (error) {
    console.error('Create sticky note error:', error);
    res.status(500).json({ error: 'Failed to post note' });
  }
}

// Delete own sticky note
export async function deleteStickyNote(req, res) {
  try {
    const { noteId } = req.params;

    const note = await prisma.stickyNote.findUnique({
      where: { id: noteId },
    });

    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    if (note.authorId !== req.userId) {
      return res.status(403).json({ error: 'You can only delete your own notes' });
    }

    await prisma.stickyNote.update({
      where: { id: noteId },
      data: { isRemoved: true },
    });

    // Broadcast removal
    const io = getIo();
    if (io) {
      io.emit('sticky:removed', { noteId });
    }

    res.json({ message: 'Note removed' });
  } catch (error) {
    console.error('Delete sticky note error:', error);
    res.status(500).json({ error: 'Failed to delete note' });
  }
}

// Report a sticky note (only by tagged users)
export async function reportStickyNote(req, res) {
  try {
    const { noteId } = req.params;

    const note = await prisma.stickyNote.findUnique({
      where: { id: noteId },
    });

    if (!note || note.isRemoved) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Check if the reporter is tagged in this note
    const reporter = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { username: true },
    });

    const tags = note.tags ? note.tags.split(',') : [];
    const isTagged = tags.some(
      (t) => t.toLowerCase() === reporter.username.toLowerCase()
    );

    if (!isTagged) {
      return res.status(403).json({ error: 'Only tagged users can report a note' });
    }

    // Remove the note
    await prisma.stickyNote.update({
      where: { id: noteId },
      data: { isRemoved: true },
    });

    // Broadcast removal
    const io = getIo();
    if (io) {
      io.emit('sticky:removed', { noteId });
    }

    res.json({ message: 'Note reported and removed' });
  } catch (error) {
    console.error('Report sticky note error:', error);
    res.status(500).json({ error: 'Failed to report note' });
  }
}

// Toggle a reaction (❤️ or ☕) on a note — anonymous, one per emoji per user
export async function reactStickyNote(req, res) {
  try {
    const { noteId } = req.params;
    const { emoji } = req.body;

    if (!STICKY_REACTIONS.includes(emoji)) {
      return res.status(400).json({ error: 'Invalid reaction' });
    }

    const note = await prisma.stickyNote.findUnique({ where: { id: noteId } });
    if (!note || note.isRemoved) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Toggle — remove if it exists, add if it doesn't
    const existing = await prisma.stickyNoteReaction.findUnique({
      where: { userId_noteId_emoji: { userId: req.userId, noteId, emoji } },
    });

    if (existing) {
      await prisma.stickyNoteReaction.delete({ where: { id: existing.id } });
    } else {
      await prisma.stickyNoteReaction.create({
        data: { emoji, noteId, userId: req.userId },
      });
    }

    // Recompute counts and broadcast to everyone
    const reactions = await prisma.stickyNoteReaction.findMany({
      where: { noteId },
      select: { emoji: true, userId: true },
    });
    const { counts, mine } = summarizeReactions(reactions, req.userId);

    const io = getIo();
    if (io) {
      io.emit('sticky:reaction', { noteId, reactions: counts });
    }

    res.json({ reactions: counts, myReactions: mine });
  } catch (error) {
    console.error('React sticky note error:', error);
    res.status(500).json({ error: 'Failed to react' });
  }
}

// Get cooldown status for the current user
export async function getCooldownStatus(req, res) {
  try {
    const lastNote = await prisma.stickyNote.findFirst({
      where: { authorId: req.userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!lastNote) {
      return res.json({ canPost: true, cooldownRemaining: 0 });
    }

    const elapsed = Date.now() - lastNote.createdAt.getTime();
    if (elapsed >= COOLDOWN_MS) {
      return res.json({ canPost: true, cooldownRemaining: 0 });
    }

    return res.json({
      canPost: false,
      cooldownRemaining: COOLDOWN_MS - elapsed,
    });
  } catch (error) {
    console.error('Get cooldown status error:', error);
    res.status(500).json({ error: 'Failed to check cooldown' });
  }
}
