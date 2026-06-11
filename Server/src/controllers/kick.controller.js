import prisma from '../lib/prisma.js';

// Store io instance reference (will be set from index.js)
let ioInstance = null;
let roomUsersMap = null;

export function setSocketInstance(io, roomUsers) {
  ioInstance = io;
  roomUsersMap = roomUsers;
}

// Helper to kick user from room via socket
function kickUserFromSocket(userId, roomId, reason) {
  console.log('kickUserFromSocket called:', { userId, roomId, reason });
  
  if (!ioInstance || !roomUsersMap) {
    console.log('WARNING: ioInstance or roomUsersMap not set');
    return;
  }
  
  const roomUsers = roomUsersMap.get(roomId);
  if (!roomUsers) {
    console.log('WARNING: No room users found for room:', roomId);
    return;
  }

  console.log('Room users:', Array.from(roomUsers.entries()).map(([sid, data]) => ({ socketId: sid, userId: data.userId })));

  for (const [socketId, userData] of roomUsers.entries()) {
    if (userData.userId === userId) {
      console.log('Found user socket:', socketId);
      
      // Emit kick event to the user
      ioInstance.to(socketId).emit('user:kicked', { 
        roomId, 
        reason,
        message: `You have been kicked from this room: ${reason}` 
      });

      // Notify others
      ioInstance.to(roomId).emit('user:left', {
        user: { 
          id: userData.isAnonymous ? socketId : userId, 
          username: userData.username 
        },
        onlineCount: roomUsers.size - 1,
        wasKicked: true,
      });

      // Remove from room tracking
      roomUsers.delete(socketId);

      // Force disconnect from room
      const socket = ioInstance.sockets.sockets.get(socketId);
      if (socket) {
        socket.leave(roomId);
        socket.currentRoom = null;
      }
      break;
    }
  }
}

// Emit vote update to room
function emitVoteUpdate(roomId, voteData) {
  console.log('Emitting vote update to room:', roomId, voteData);
  if (!ioInstance) {
    console.log('WARNING: ioInstance not set for emitVoteUpdate');
    return;
  }
  ioInstance.to(roomId).emit('kick:vote:updated', voteData);
}

// Mask a user's identity in vote payloads while they are anonymous.
// Real identity is only revealed after a kick vote passes — revealing at
// vote start would let anyone deanonymize a user just by starting a vote.
function maskVoteUser(user, member, roomIsAnonymous) {
  const isAnon = Boolean((member?.isAnonymous || roomIsAnonymous) && !member?.isRevealed);
  if (!isAnon || !user) return user;
  return {
    id: `anon-${member?.id || 'user'}`,
    username: member?.anonymousName || 'Anonymous User',
  };
}

// Emit identity reveal to room
function emitIdentityReveal(roomId, userId, username) {
  console.log('Emitting identity reveal to room:', roomId, { userId, username });
  if (!ioInstance) {
    console.log('WARNING: ioInstance not set for emitIdentityReveal');
    return;
  }
  ioInstance.to(roomId).emit('user:identity:revealed', { userId, username });
}

// Admin kick - instant removal and ban
export async function adminKick(req, res) {
  try {
    const { roomId } = req.params;
    const { targetUserId, reason } = req.body;

    console.log('Admin kick request:', { roomId, targetUserId, requesterId: req.userId });

    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user ID is required' });
    }

    // Get room and verify admin
    const room = await prisma.room.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (room.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Only the room admin can kick users' });
    }

    if (targetUserId === req.userId) {
      return res.status(400).json({ error: 'You cannot kick yourself' });
    }

    // Check if target is a member
    const membership = await prisma.roomMember.findUnique({
      where: {
        userId_roomId: {
          userId: targetUserId,
          roomId,
        },
      },
      include: {
        user: { select: { id: true, username: true } },
      },
    });

    console.log('Membership found:', membership);

    if (!membership) {
      return res.status(404).json({ error: 'User is not a member of this room' });
    }

    // Remove from room and ban
    await prisma.$transaction([
      prisma.roomMember.delete({
        where: {
          userId_roomId: {
            userId: targetUserId,
            roomId,
          },
        },
      }),
      prisma.roomBan.create({
        data: {
          userId: targetUserId,
          roomId,
          reason: reason || 'Kicked by admin',
        },
      }),
      // Cancel any active vote against this user
      prisma.kickVote.updateMany({
        where: {
          roomId,
          targetId: targetUserId,
          status: 'active',
        },
        data: {
          status: 'cancelled',
        },
      }),
    ]);

    // Kick from socket
    kickUserFromSocket(targetUserId, roomId, reason || 'Kicked by admin');

    res.json({ 
      message: 'User kicked and banned successfully',
      kickedUser: membership.user,
    });
  } catch (error) {
    console.error('Admin kick error:', error);
    res.status(500).json({ error: 'Failed to kick user' });
  }
}

// Start a vote-kick
export async function startVoteKick(req, res) {
  try {
    const { roomId } = req.params;
    const { targetUserId, reason } = req.body;

    console.log('Vote kick request:', { roomId, targetUserId, initiatorId: req.userId });

    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user ID is required' });
    }

    // Get room with members
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        members: {
          include: {
            user: { select: { id: true, username: true } },
          },
        },
      },
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    console.log('Room members:', room.members.map(m => ({ userId: m.userId, username: m.user.username })));

    // Can't vote-kick the admin
    if (targetUserId === room.ownerId) {
      return res.status(403).json({ error: 'Cannot vote to kick the room admin' });
    }

    // Can't vote-kick yourself
    if (targetUserId === req.userId) {
      return res.status(400).json({ error: 'You cannot vote to kick yourself' });
    }

    // Check if initiator is a member
    const initiatorMember = room.members.find(m => m.userId === req.userId);
    if (!initiatorMember) {
      return res.status(403).json({ error: 'You are not a member of this room' });
    }

    // Check if target is a member
    const targetMember = room.members.find(m => m.userId === targetUserId);
    console.log('Target member found:', targetMember);
    if (!targetMember) {
      return res.status(404).json({ error: 'Target user is not a member of this room' });
    }

    // Check if there's already an active vote against this user
    const existingVote = await prisma.kickVote.findFirst({
      where: {
        roomId,
        targetId: targetUserId,
        status: 'active',
      },
    });

    if (existingVote) {
      return res.status(400).json({ error: 'There is already an active vote against this user' });
    }

    // Create the vote (expires in 24 hours)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const kickVote = await prisma.kickVote.create({
      data: {
        initiatorId: req.userId,
        targetId: targetUserId,
        roomId,
        reason,
        expiresAt,
        targetRevealedName: targetMember.user.username,
      },
      include: {
        initiator: { select: { id: true, username: true } },
        target: { select: { id: true, username: true } },
      },
    });

    // NOTE: the target is intentionally NOT revealed here. Their identity is
    // only revealed if the vote passes (see executeKick). Anonymous display
    // names are used in all vote payloads while the vote is active.

    // Initiator automatically votes to kick
    await prisma.kickVoteBallot.create({
      data: {
        voterId: req.userId,
        kickVoteId: kickVote.id,
        vote: true,
      },
    });

    const targetIsAnonymous = Boolean((targetMember.isAnonymous || room.isAnonymous) && !targetMember.isRevealed);

    const voteData = {
      id: kickVote.id,
      target: maskVoteUser(kickVote.target, targetMember, room.isAnonymous),
      targetRevealedName: targetIsAnonymous ? null : kickVote.targetRevealedName,
      initiator: maskVoteUser(kickVote.initiator, initiatorMember, room.isAnonymous),
      reason: kickVote.reason,
      expiresAt: kickVote.expiresAt,
      createdAt: kickVote.createdAt,
      votesFor: 1,
      votesAgainst: 0,
      totalMembers: room.members.length,
      eligibleVoters: room.members.length - 1, // Exclude target
      status: 'active',
    };

    // Emit vote started event
    emitVoteUpdate(roomId, { type: 'started', vote: voteData });

    res.json({ 
      message: 'Vote kick started',
      kickVote: voteData,
    });
  } catch (error) {
    console.error('Start vote kick error:', error);
    res.status(500).json({ error: 'Failed to start vote kick' });
  }
}

// Cast a vote
export async function castVote(req, res) {
  try {
    const { voteId } = req.params;
    const { vote } = req.body; // true = kick, false = don't kick

    const kickVote = await prisma.kickVote.findUnique({
      where: { id: voteId },
      include: {
        room: {
          include: { members: true },
        },
        ballots: true,
        target: { select: { id: true, username: true } },
        initiator: { select: { id: true, username: true } },
      },
    });

    if (!kickVote) {
      return res.status(404).json({ error: 'Vote not found' });
    }

    if (kickVote.status !== 'active') {
      return res.status(400).json({ error: 'This vote is no longer active' });
    }

    if (new Date() > kickVote.expiresAt) {
      // Process expired vote
      await processVoteResult(kickVote);
      return res.status(400).json({ error: 'This vote has expired' });
    }

    // Check if voter is a member
    const voterMember = kickVote.room.members.find(m => m.userId === req.userId);
    if (!voterMember) {
      return res.status(403).json({ error: 'You are not a member of this room' });
    }

    // Can't vote on your own kick
    if (kickVote.targetId === req.userId) {
      return res.status(403).json({ error: 'You cannot vote on your own kick' });
    }

    // Check if already voted
    const existingBallot = kickVote.ballots.find(b => b.voterId === req.userId);
    if (existingBallot) {
      // Update existing vote
      await prisma.kickVoteBallot.update({
        where: { id: existingBallot.id },
        data: { vote },
      });
    } else {
      // Create new vote
      await prisma.kickVoteBallot.create({
        data: {
          voterId: req.userId,
          kickVoteId: voteId,
          vote,
        },
      });
    }

    // Get updated vote counts
    const updatedBallots = await prisma.kickVoteBallot.findMany({
      where: { kickVoteId: voteId },
    });

    const votesFor = updatedBallots.filter(b => b.vote).length;
    const votesAgainst = updatedBallots.filter(b => !b.vote).length;
    const totalMembers = kickVote.room.members.length;
    const eligibleVoters = totalMembers - 1; // Exclude the target
    const majorityThreshold = Math.floor(eligibleVoters / 2) + 1;

    let result = null;

    // Check if majority reached
    if (votesFor >= majorityThreshold) {
      // Kick passed
      await executeKick(kickVote.roomId, kickVote.targetId, voteId, 'Vote passed', kickVote.targetRevealedName);
      result = 'passed';
    } else if (votesAgainst >= majorityThreshold) {
      // Kick failed - unreavel user if they were revealed
      await prisma.$transaction([
        prisma.kickVote.update({
          where: { id: voteId },
          data: { status: 'failed' },
        }),
        prisma.roomMember.updateMany({
          where: {
            userId: kickVote.targetId,
            roomId: kickVote.roomId,
            isRevealed: true,
          },
          data: { isRevealed: false },
        }),
      ]);
      result = 'failed';
    }

    const targetMember = kickVote.room.members.find(m => m.userId === kickVote.targetId);
    const initiatorMember = kickVote.room.members.find(m => m.userId === kickVote.initiatorId);

    const voteData = {
      id: kickVote.id,
      // If the vote passed the identity is revealed anyway; while active, keep
      // anonymous users masked.
      target: result === 'passed'
        ? kickVote.target
        : maskVoteUser(kickVote.target, targetMember, kickVote.room.isAnonymous),
      initiator: maskVoteUser(kickVote.initiator, initiatorMember, kickVote.room.isAnonymous),
      reason: kickVote.reason,
      votesFor,
      votesAgainst,
      totalMembers,
      eligibleVoters,
      majorityThreshold,
      result,
      status: result || 'active',
    };

    // Emit vote update
    emitVoteUpdate(kickVote.roomId, { type: 'updated', vote: voteData });

    res.json({
      message: existingBallot ? 'Vote updated' : 'Vote cast',
      ...voteData,
    });
  } catch (error) {
    console.error('Cast vote error:', error);
    res.status(500).json({ error: 'Failed to cast vote' });
  }
}

// Get active votes for a room
export async function getActiveVotes(req, res) {
  try {
    const { roomId } = req.params;

    // Check membership
    const membership = await prisma.roomMember.findUnique({
      where: {
        userId_roomId: {
          userId: req.userId,
          roomId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this room' });
    }

    // Get room members (needed for the member count and anonymity masking)
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: { members: true },
    });

    // Get active votes
    const votes = await prisma.kickVote.findMany({
      where: {
        roomId,
        status: 'active',
      },
      include: {
        initiator: { select: { id: true, username: true } },
        target: { select: { id: true, username: true } },
        ballots: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Process any expired votes
    const now = new Date();
    for (const vote of votes) {
      if (now > vote.expiresAt) {
        await processVoteResult(vote);
      }
    }

    // Get fresh data after processing
    const activeVotes = await prisma.kickVote.findMany({
      where: {
        roomId,
        status: 'active',
        expiresAt: { gt: now },
      },
      include: {
        initiator: { select: { id: true, username: true } },
        target: { select: { id: true, username: true } },
        ballots: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalMembers = room.members.length;
    const formattedVotes = activeVotes.map(vote => {
      const eligibleVoters = totalMembers - 1;
      const targetMember = room.members.find(m => m.userId === vote.targetId);
      const initiatorMember = room.members.find(m => m.userId === vote.initiatorId);
      const targetIsAnonymous = Boolean((targetMember?.isAnonymous || room.isAnonymous) && !targetMember?.isRevealed);
      return {
        id: vote.id,
        target: maskVoteUser(vote.target, targetMember, room.isAnonymous),
        targetRevealedName: targetIsAnonymous ? null : vote.targetRevealedName,
        initiator: maskVoteUser(vote.initiator, initiatorMember, room.isAnonymous),
        reason: vote.reason,
        createdAt: vote.createdAt,
        expiresAt: vote.expiresAt,
        votesFor: vote.ballots.filter(b => b.vote).length,
        votesAgainst: vote.ballots.filter(b => !b.vote).length,
        totalMembers,
        eligibleVoters,
        majorityThreshold: Math.floor(eligibleVoters / 2) + 1,
        hasVoted: vote.ballots.some(b => b.voterId === req.userId),
        myVote: vote.ballots.find(b => b.voterId === req.userId)?.vote,
        status: 'active',
      };
    });

    res.json({ votes: formattedVotes });
  } catch (error) {
    console.error('Get active votes error:', error);
    res.status(500).json({ error: 'Failed to get active votes' });
  }
}

// Helper function to execute kick after vote passes
async function executeKick(roomId, targetId, voteId, reason, revealedName) {
  await prisma.$transaction([
    prisma.roomMember.delete({
      where: {
        userId_roomId: {
          userId: targetId,
          roomId,
        },
      },
    }),
    prisma.roomBan.create({
      data: {
        userId: targetId,
        roomId,
        reason: reason || 'Vote kicked by members',
      },
    }),
    prisma.kickVote.update({
      where: { id: voteId },
      data: { status: 'passed' },
    }),
  ]);

  // The vote passed — only now is an anonymous target's identity revealed
  if (revealedName) {
    emitIdentityReveal(roomId, targetId, revealedName);
  }

  // Kick from socket
  kickUserFromSocket(targetId, roomId, reason);
}

// Process vote result (for expired votes)
async function processVoteResult(vote) {
  const votesFor = vote.ballots.filter(b => b.vote).length;
  const votesAgainst = vote.ballots.filter(b => !b.vote).length;
  const isTied = votesFor === votesAgainst;

  if (votesFor > votesAgainst) {
    // Majority voted to kick
    await executeKick(vote.roomId, vote.targetId, vote.id, 'Vote passed (expired)', vote.targetRevealedName);
    emitVoteUpdate(vote.roomId, { 
      type: 'resolved', 
      vote: { id: vote.id, status: 'passed', targetId: vote.targetId } 
    });
  } else {
    // Majority voted to keep OR tie - user stays
    const status = isTied ? 'tied' : 'failed';
    await prisma.$transaction([
      prisma.kickVote.update({
        where: { id: vote.id },
        data: { status },
      }),
      // Unreveal the user
      prisma.roomMember.updateMany({
        where: {
          userId: vote.targetId,
          roomId: vote.roomId,
          isRevealed: true,
        },
        data: { isRevealed: false },
      }),
    ]);
    emitVoteUpdate(vote.roomId, { 
      type: 'resolved', 
      vote: { id: vote.id, status, targetId: vote.targetId, isTied } 
    });
  }
}

// Process all expired votes (called periodically)
export async function processExpiredVotes() {
  try {
    const expiredVotes = await prisma.kickVote.findMany({
      where: {
        status: 'active',
        expiresAt: { lte: new Date() },
      },
      include: {
        ballots: true,
      },
    });

    for (const vote of expiredVotes) {
      await processVoteResult(vote);
    }

    return expiredVotes.length;
  } catch (error) {
    console.error('Process expired votes error:', error);
    return 0;
  }
}

// Get room members for kick UI (shows real names for revealed users)
export async function getRoomMembers(req, res) {
  try {
    const { roomId } = req.params;

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        members: {
          include: {
            user: { select: { id: true, username: true, avatar: true } },
          },
        },
      },
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Check if requester is a member
    const isMember = room.members.some(m => m.userId === req.userId);
    if (!isMember) {
      return res.status(403).json({ error: 'You are not a member of this room' });
    }

    const isAdmin = room.ownerId === req.userId;

    const members = room.members.map(m => {
      const isAnonymous = m.isAnonymous && !m.isRevealed;
      const isSelf = m.userId === req.userId;

      // Only the user themselves can see their own real identity when anonymous
      // In anonymous rooms, nobody (including admin) sees real names
      const canSeeIdentity = isSelf || !isAnonymous;

      return {
        userId: canSeeIdentity ? m.userId : `anon-${m.id}`,
        username: canSeeIdentity ? m.user.username : (m.anonymousName || 'Anonymous User'),
        avatar: canSeeIdentity ? m.user.avatar : null,
        isAnonymous: isAnonymous,
        isRevealed: m.isRevealed,
        isOwner: m.userId === room.ownerId,
        joinedAt: m.joinedAt,
        // Admin gets the real userId for kick functionality only, but NOT the real username
        ...(isAdmin && isAnonymous && !isSelf ? { realUserId: m.userId } : {}),
      };
    });

    res.json({ 
      members,
      ownerId: room.ownerId,
      isAdmin,
    });
  } catch (error) {
    console.error('Get room members error:', error);
    res.status(500).json({ error: 'Failed to get room members' });
  }
}