import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';

const VALID_MOODS = ['chill', 'busy', 'caffeinated', 'sleepy', 'creative', 'chatty', 'focused', 'vibing'];

// Update the current user's mood
export async function updateMood(req, res) {
  try {
    const { mood } = req.body;

    if (mood && !VALID_MOODS.includes(mood)) {
      return res.status(400).json({ error: 'Invalid mood', validMoods: VALID_MOODS });
    }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { mood: mood || null },
      select: { id: true, mood: true },
    });

    res.json({ mood: user.mood });
  } catch (error) {
    console.error('Update mood error:', error);
    res.status(500).json({ error: 'Failed to update mood' });
  }
}

// Update the current user's custom status
export async function updateStatus(req, res) {
  try {
    const { status } = req.body;

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { status: status?.trim()?.slice(0, 100) || null },
      select: { id: true, status: true },
    });

    res.json({ status: user.status });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
}

// Update user profile (bio, avatar)
export async function updateProfile(req, res) {
  try {
    const { bio, avatar } = req.body;

    const data = {};
    if (bio !== undefined) data.bio = bio?.trim()?.slice(0, 200) || null;
    if (avatar !== undefined) data.avatar = avatar || null;

    const user = await prisma.user.update({
      where: { id: req.userId },
      data,
      select: {
        id: true,
        email: true,
        username: true,
        discriminator: true,
        role: true,
        avatar: true,
        bio: true,
        mood: true,
        status: true,
        createdAt: true,
      },
    });

    res.json({ user });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
}

// Get a user's profile by ID
export async function getProfile(req, res) {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        discriminator: true,
        avatar: true,
        bio: true,
        mood: true,
        status: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
}

function exportFilename(username) {
  const safeName = (username || 'account').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
  return `chat-room-cafe-export-${safeName || 'account'}-${new Date().toISOString().slice(0, 10)}.json`;
}

function selectMessageFields() {
  return {
    id: true,
    text: true,
    createdAt: true,
    isEphemeral: true,
    isEdited: true,
    isDeleted: true,
    isPinned: true,
    mediaUrl: true,
    mediaType: true,
    mediaName: true,
    roomId: true,
    parentId: true,
    replyToId: true,
  };
}

export async function exportMyData(req, res) {
  try {
    const userId = req.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        discriminator: true,
        avatar: true,
        bio: true,
        mood: true,
        status: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [
      roomMemberships,
      ownedRooms,
      roomMessages,
      directMessages,
      friendshipsSent,
      friendshipsReceived,
      baristaMessages,
      stickyNotes,
      bookmarks,
      eventsCreated,
      eventRsvps,
      badges,
      musicTracks,
      lostFoundPosts,
      lostFoundReplies,
      bulletins,
      bulletinStars,
      scheduledMessages,
      notifications,
      pollsCreated,
      pollVotes,
      kickVotesInitiated,
      kickVotesReceived,
      kickVotesCast,
    ] = await Promise.all([
      prisma.roomMember.findMany({
        where: { userId },
        include: {
          room: {
            select: {
              id: true,
              name: true,
              description: true,
              isPrivate: true,
              isAnonymous: true,
              category: true,
              maxMembers: true,
              createdAt: true,
              ownerId: true,
            },
          },
        },
        orderBy: { joinedAt: 'desc' },
      }),
      prisma.room.findMany({
        where: { ownerId: userId },
        select: {
          id: true,
          name: true,
          description: true,
          isPrivate: true,
          isAnonymous: true,
          category: true,
          maxMembers: true,
          createdAt: true,
          updatedAt: true,
          cafeHoursEnabled: true,
          cafeHoursStart: true,
          cafeHoursEnd: true,
          cafeHoursDays: true,
          cafeHoursTimezone: true,
          _count: { select: { members: true, messages: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.message.findMany({
        where: { senderId: userId },
        select: selectMessageFields(),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.directMessage.findMany({
        where: { OR: [{ senderId: userId }, { receiverId: userId }] },
        select: {
          id: true,
          text: true,
          conversationId: true,
          createdAt: true,
          read: true,
          senderId: true,
          receiverId: true,
          mediaUrl: true,
          mediaType: true,
          mediaName: true,
          replyToId: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.friendship.findMany({
        where: { requesterId: userId },
        include: { addressee: { select: { id: true, username: true, discriminator: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.friendship.findMany({
        where: { addresseeId: userId },
        include: { requester: { select: { id: true, username: true, discriminator: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.baristaMessage.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      prisma.stickyNote.findMany({ where: { authorId: userId }, orderBy: { createdAt: 'desc' } }),
      prisma.bookmark.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      prisma.roomEvent.findMany({ where: { creatorId: userId }, orderBy: { createdAt: 'desc' } }),
      prisma.eventRsvp.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      prisma.userBadge.findMany({ where: { userId }, orderBy: { awardedAt: 'desc' } }),
      prisma.musicTrack.findMany({ where: { addedById: userId }, orderBy: { createdAt: 'desc' } }),
      prisma.lostFoundPost.findMany({ where: { authorId: userId }, orderBy: { createdAt: 'desc' } }),
      prisma.lostFoundReply.findMany({ where: { authorId: userId }, orderBy: { createdAt: 'desc' } }),
      prisma.cafeBulletin.findMany({ where: { authorId: userId }, orderBy: { createdAt: 'desc' } }),
      prisma.cafeBulletinStar.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      prisma.scheduledMessage.findMany({ where: { senderId: userId }, orderBy: { createdAt: 'desc' } }),
      prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      prisma.poll.findMany({
        where: { creatorId: userId },
        include: { options: { include: { _count: { select: { votes: true } } } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.pollVote.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      prisma.kickVote.findMany({ where: { initiatorId: userId }, orderBy: { createdAt: 'desc' } }),
      prisma.kickVote.findMany({ where: { targetId: userId }, orderBy: { createdAt: 'desc' } }),
      prisma.kickVoteBallot.findMany({ where: { voterId: userId }, orderBy: { createdAt: 'desc' } }),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      account: user,
      rooms: {
        memberships: roomMemberships,
        owned: ownedRooms,
      },
      communications: {
        roomMessages,
        directMessages,
        baristaMessages,
      },
      social: {
        friendshipsSent,
        friendshipsReceived,
      },
      content: {
        stickyNotes,
        bookmarks,
        eventsCreated,
        eventRsvps,
        badges,
        musicTracks,
        lostFoundPosts,
        lostFoundReplies,
        bulletins,
        bulletinStars,
        scheduledMessages,
        notifications,
        pollsCreated,
        pollVotes,
        kickVotesInitiated,
        kickVotesReceived,
        kickVotesCast,
      },
    };

    res.setHeader('Content-Disposition', `attachment; filename="${exportFilename(user.username)}"`);
    res.json(exportData);
  } catch (error) {
    console.error('Export data error:', error);
    res.status(500).json({ error: 'Failed to export account data' });
  }
}

export async function deleteMyAccount(req, res) {
  try {
    const { password, confirmation } = req.body;

    if (confirmation !== 'DELETE') {
      return res.status(400).json({ error: 'Type DELETE to confirm account deletion' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, password: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const userId = req.userId;
    const [ownedRoomCount, authoredMessageCount, directMessageCount, pollCount] = await Promise.all([
      prisma.room.count({ where: { ownerId: userId } }),
      prisma.message.count({ where: { senderId: userId } }),
      prisma.directMessage.count({ where: { OR: [{ senderId: userId }, { receiverId: userId }] } }),
      prisma.poll.count({ where: { creatorId: userId } }),
    ]);

    await prisma.$transaction(async (tx) => {
      await tx.notification.updateMany({
        where: { fromUserId: userId },
        data: {
          fromUserId: null,
          fromUsername: 'Deleted user',
        },
      });

      await tx.message.updateMany({
        where: { senderId: userId },
        data: {
          text: '',
          senderId: null,
          mediaUrl: null,
          mediaType: null,
          mediaName: null,
          isDeleted: true,
          isPinned: false,
          pinnedAt: null,
        },
      });

      await tx.directMessage.deleteMany({
        where: { OR: [{ senderId: userId }, { receiverId: userId }] },
      });

      await tx.poll.deleteMany({
        where: { creatorId: userId },
      });

      await tx.room.deleteMany({
        where: { ownerId: userId },
      });

      await tx.user.delete({
        where: { id: userId },
      });
    });

    res.json({
      message: 'Account deleted',
      deleted: {
        ownedRooms: ownedRoomCount,
        authoredMessagesScrubbed: authoredMessageCount,
        directMessages: directMessageCount,
        polls: pollCount,
      },
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
}

export { VALID_MOODS };
