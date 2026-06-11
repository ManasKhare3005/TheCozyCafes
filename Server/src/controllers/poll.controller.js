import prisma from '../lib/prisma.js';
import { getIo } from '../socket/handlers.js';

// Create a poll in a room
export async function createPoll(req, res) {
  try {
    const { roomId } = req.params;
    const { question, options } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'Question is required' });
    }

    if (!options || !Array.isArray(options) || options.length < 2 || options.length > 6) {
      return res.status(400).json({ error: 'Need 2-6 options' });
    }

    // Verify membership
    const membership = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: req.userId, roomId } },
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }

    const poll = await prisma.poll.create({
      data: {
        question: question.trim(),
        creatorId: req.userId,
        roomId,
        options: {
          create: options.map((text, index) => ({
            text: text.trim(),
            order: index,
          })),
        },
      },
      include: {
        options: {
          include: {
            _count: { select: { votes: true } },
          },
          orderBy: { order: 'asc' },
        },
      },
    });

    const pollData = {
      id: poll.id,
      question: poll.question,
      creatorId: poll.creatorId,
      createdAt: poll.createdAt.toISOString(),
      isActive: poll.isActive,
      options: poll.options.map((o) => ({
        id: o.id,
        text: o.text,
        voteCount: o._count.votes,
      })),
      totalVotes: 0,
      userVotedOptionId: null,
    };

    // Broadcast to room
    const io = getIo();
    if (io) {
      io.to(roomId).emit('poll:created', pollData);
    }

    res.status(201).json({ poll: pollData });
  } catch (error) {
    console.error('Create poll error:', error);
    res.status(500).json({ error: 'Failed to create poll' });
  }
}

// Vote on a poll
export async function votePoll(req, res) {
  try {
    const { pollId } = req.params;
    const { optionId } = req.body;

    if (!optionId) {
      return res.status(400).json({ error: 'Option ID is required' });
    }

    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      include: { options: true },
    });

    if (!poll || !poll.isActive) {
      return res.status(404).json({ error: 'Poll not found or closed' });
    }

    // Verify user is member of the room
    const membership = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: req.userId, roomId: poll.roomId } },
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }

    // Check option belongs to this poll
    const option = poll.options.find((o) => o.id === optionId);
    if (!option) {
      return res.status(400).json({ error: 'Invalid option' });
    }

    // Remove any existing votes on this poll by this user
    await prisma.pollVote.deleteMany({
      where: {
        userId: req.userId,
        option: { pollId },
      },
    });

    // Cast vote
    await prisma.pollVote.create({
      data: {
        userId: req.userId,
        optionId,
      },
    });

    // Fetch updated results
    const updatedPoll = await prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        options: {
          include: { _count: { select: { votes: true } } },
          orderBy: { order: 'asc' },
        },
      },
    });

    const totalVotes = updatedPoll.options.reduce((sum, o) => sum + o._count.votes, 0);

    const pollData = {
      id: updatedPoll.id,
      options: updatedPoll.options.map((o) => ({
        id: o.id,
        text: o.text,
        voteCount: o._count.votes,
      })),
      totalVotes,
    };

    // Broadcast updated results to room
    const io = getIo();
    if (io) {
      io.to(poll.roomId).emit('poll:voted', pollData);
    }

    res.json({ poll: pollData, userVotedOptionId: optionId });
  } catch (error) {
    console.error('Vote poll error:', error);
    res.status(500).json({ error: 'Failed to vote' });
  }
}

// Get polls for a room
export async function getRoomPolls(req, res) {
  try {
    const { roomId } = req.params;

    // Verify membership
    const membership = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: req.userId, roomId } },
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }

    const polls = await prisma.poll.findMany({
      where: { roomId, isActive: true },
      include: {
        options: {
          include: {
            _count: { select: { votes: true } },
            votes: {
              where: { userId: req.userId },
              select: { optionId: true },
            },
          },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const pollsData = polls.map((poll) => {
      const totalVotes = poll.options.reduce((sum, o) => sum + o._count.votes, 0);
      const userVote = poll.options.find((o) => o.votes.length > 0);

      return {
        id: poll.id,
        question: poll.question,
        creatorId: poll.creatorId,
        createdAt: poll.createdAt.toISOString(),
        isActive: poll.isActive,
        options: poll.options.map((o) => ({
          id: o.id,
          text: o.text,
          voteCount: o._count.votes,
        })),
        totalVotes,
        userVotedOptionId: userVote?.id || null,
      };
    });

    res.json({ polls: pollsData });
  } catch (error) {
    console.error('Get room polls error:', error);
    res.status(500).json({ error: 'Failed to fetch polls' });
  }
}
