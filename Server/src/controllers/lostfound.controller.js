import prisma from '../lib/prisma.js';
import { getIo } from '../socket/handlers.js';

const VALID_TAGS = ['question', 'looking-for', 'recommendation', 'help'];
const EXPIRY_DAYS = 7;

export async function getPosts(req, res) {
  try {
    const { tag, status } = req.query;

    const where = {
      expiresAt: { gt: new Date() },
    };
    if (tag && VALID_TAGS.includes(tag)) where.tag = tag;
    if (status === 'open' || status === 'resolved') where.status = status;
    // Also show recently resolved posts
    if (!status) {
      delete where.expiresAt;
      where.OR = [
        { expiresAt: { gt: new Date() } },
        { status: 'resolved' },
      ];
    }

    const posts = await prisma.lostFoundPost.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        author: { select: { id: true, username: true, avatar: true } },
        _count: { select: { replies: true } },
      },
    });

    res.json({ posts });
  } catch (err) {
    console.error('Failed to fetch lost & found posts:', err);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
}

export async function createPost(req, res) {
  try {
    const { title, body, tag } = req.body;

    if (!title?.trim() || title.length > 100) {
      return res.status(400).json({ error: 'Title is required (max 100 chars)' });
    }
    if (!body?.trim() || body.length > 1000) {
      return res.status(400).json({ error: 'Body is required (max 1000 chars)' });
    }
    if (!VALID_TAGS.includes(tag)) {
      return res.status(400).json({ error: 'Invalid tag' });
    }

    const post = await prisma.lostFoundPost.create({
      data: {
        title: title.trim(),
        body: body.trim(),
        tag,
        authorId: req.userId,
        expiresAt: new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000),
      },
      include: {
        author: { select: { id: true, username: true, avatar: true } },
        _count: { select: { replies: true } },
      },
    });

    const io = getIo();
    if (io) io.emit('lostfound:new', post);

    res.status(201).json({ post });
  } catch (err) {
    console.error('Failed to create post:', err);
    res.status(500).json({ error: 'Failed to create post' });
  }
}

export async function getReplies(req, res) {
  try {
    const { postId } = req.params;

    const replies = await prisma.lostFoundReply.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, username: true, avatar: true } },
      },
    });

    res.json({ replies });
  } catch (err) {
    console.error('Failed to fetch replies:', err);
    res.status(500).json({ error: 'Failed to fetch replies' });
  }
}

export async function createReply(req, res) {
  try {
    const { postId } = req.params;
    const { text } = req.body;

    if (!text?.trim() || text.length > 500) {
      return res.status(400).json({ error: 'Reply text is required (max 500 chars)' });
    }

    const post = await prisma.lostFoundPost.findUnique({ where: { id: postId } });
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const reply = await prisma.lostFoundReply.create({
      data: {
        text: text.trim(),
        authorId: req.userId,
        postId,
      },
      include: {
        author: { select: { id: true, username: true, avatar: true } },
      },
    });

    const io = getIo();
    if (io) io.emit('lostfound:reply', { postId, reply });

    res.status(201).json({ reply });
  } catch (err) {
    console.error('Failed to create reply:', err);
    res.status(500).json({ error: 'Failed to create reply' });
  }
}

export async function resolvePost(req, res) {
  try {
    const { postId } = req.params;

    const post = await prisma.lostFoundPost.findUnique({ where: { id: postId } });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.authorId !== req.userId) {
      return res.status(403).json({ error: 'Only the author can resolve this post' });
    }

    const updated = await prisma.lostFoundPost.update({
      where: { id: postId },
      data: { status: 'resolved' },
    });

    const io = getIo();
    if (io) io.emit('lostfound:resolved', { postId });

    res.json({ post: updated });
  } catch (err) {
    console.error('Failed to resolve post:', err);
    res.status(500).json({ error: 'Failed to resolve post' });
  }
}
