import prisma from '../lib/prisma.js';

// ─── Badge Definitions ───
// Rarity: common, uncommon, rare, epic, legendary
export const BADGES = {
  // ── Messaging ──
  first_message: {
    name: 'First Sip',
    description: 'Send your first message',
    emoji: '☕',
    rarity: 'common',
    check: async (userId) => {
      const count = await prisma.message.count({ where: { senderId: userId } });
      return count >= 1;
    },
  },
  chatterbox: {
    name: 'Chatterbox',
    description: 'Send 100 messages',
    emoji: '💬',
    rarity: 'common',
    check: async (userId) => {
      const count = await prisma.message.count({ where: { senderId: userId } });
      return count >= 100;
    },
  },
  motormouth: {
    name: 'Motormouth',
    description: 'Send 1,000 messages',
    emoji: '🗣️',
    rarity: 'uncommon',
    check: async (userId) => {
      const count = await prisma.message.count({ where: { senderId: userId } });
      return count >= 1000;
    },
  },
  legendary_talker: {
    name: 'Legendary Talker',
    description: 'Send 10,000 messages',
    emoji: '👑',
    rarity: 'legendary',
    check: async (userId) => {
      const count = await prisma.message.count({ where: { senderId: userId } });
      return count >= 10000;
    },
  },

  // ── Rooms ──
  table_starter: {
    name: 'Table Starter',
    description: 'Create your first room',
    emoji: '🪑',
    rarity: 'common',
    check: async (userId) => {
      const count = await prisma.room.count({ where: { ownerId: userId } });
      return count >= 1;
    },
  },
  room_hopper: {
    name: 'Room Hopper',
    description: 'Join 5 different rooms',
    emoji: '🚪',
    rarity: 'uncommon',
    check: async (userId) => {
      const count = await prisma.roomMember.count({ where: { userId } });
      return count >= 5;
    },
  },
  empire_builder: {
    name: 'Empire Builder',
    description: 'Own 10 rooms',
    emoji: '🏰',
    rarity: 'epic',
    check: async (userId) => {
      const count = await prisma.room.count({ where: { ownerId: userId } });
      return count >= 10;
    },
  },

  // ── Social ──
  friendly: {
    name: 'Friendly Face',
    description: 'Make your first friend',
    emoji: '🤝',
    rarity: 'common',
    check: async (userId) => {
      const count = await prisma.friendship.count({
        where: { status: 'accepted', OR: [{ requesterId: userId }, { addresseeId: userId }] },
      });
      return count >= 1;
    },
  },
  social_butterfly: {
    name: 'Social Butterfly',
    description: 'Have 10 friends',
    emoji: '🦋',
    rarity: 'uncommon',
    check: async (userId) => {
      const count = await prisma.friendship.count({
        where: { status: 'accepted', OR: [{ requesterId: userId }, { addresseeId: userId }] },
      });
      return count >= 10;
    },
  },
  beloved: {
    name: 'Beloved',
    description: 'Have 50 friends',
    emoji: '💖',
    rarity: 'epic',
    check: async (userId) => {
      const count = await prisma.friendship.count({
        where: { status: 'accepted', OR: [{ requesterId: userId }, { addresseeId: userId }] },
      });
      return count >= 50;
    },
  },

  // ── Confessions & Polls ──
  confessor: {
    name: 'Confessor',
    description: 'Post 10 confessions',
    emoji: '🤫',
    rarity: 'uncommon',
    // Can't track directly since confessions are anonymous — skip for now
    check: async () => false,
  },
  poll_creator: {
    name: 'Pollster',
    description: 'Create 5 polls',
    emoji: '📊',
    rarity: 'uncommon',
    check: async (userId) => {
      const count = await prisma.poll.count({ where: { creatorId: userId } });
      return count >= 5;
    },
  },
  poll_master: {
    name: 'Poll Master',
    description: 'Create 50 polls',
    emoji: '🗳️',
    rarity: 'epic',
    check: async (userId) => {
      const count = await prisma.poll.count({ where: { creatorId: userId } });
      return count >= 50;
    },
  },

  // ── Reactions ──
  reactor: {
    name: 'Reactor',
    description: 'React to 50 messages',
    emoji: '⚡',
    rarity: 'uncommon',
    check: async (userId) => {
      const count = await prisma.messageReaction.count({ where: { userId } });
      return count >= 50;
    },
  },
  reaction_machine: {
    name: 'Reaction Machine',
    description: 'React to 500 messages',
    emoji: '🤖',
    rarity: 'rare',
    check: async (userId) => {
      const count = await prisma.messageReaction.count({ where: { userId } });
      return count >= 500;
    },
  },

  // ── Events ──
  party_planner: {
    name: 'Party Planner',
    description: 'Create 5 events',
    emoji: '🎉',
    rarity: 'uncommon',
    check: async (userId) => {
      const count = await prisma.roomEvent.count({ where: { creatorId: userId } });
      return count >= 5;
    },
  },

  // ── Bookmarks ──
  curator: {
    name: 'Curator',
    description: 'Share 20 bookmarks',
    emoji: '🔖',
    rarity: 'uncommon',
    check: async (userId) => {
      const count = await prisma.bookmark.count({ where: { userId } });
      return count >= 20;
    },
  },

  // ── Hard / Legendary ──
  night_owl: {
    name: 'Night Owl',
    description: 'Send 100 messages between midnight and 5 AM',
    emoji: '🦉',
    rarity: 'rare',
    check: async (userId) => {
      // Raw count of messages sent in the wee hours
      const msgs = await prisma.$queryRaw`
        SELECT COUNT(*)::int as count FROM messages
        WHERE "senderId" = ${userId}
        AND EXTRACT(HOUR FROM "createdAt") >= 0
        AND EXTRACT(HOUR FROM "createdAt") < 5
      `;
      return (msgs[0]?.count || 0) >= 100;
    },
  },
  early_bird: {
    name: 'Early Bird',
    description: 'Send 100 messages between 5 AM and 7 AM',
    emoji: '🐦',
    rarity: 'rare',
    check: async (userId) => {
      const msgs = await prisma.$queryRaw`
        SELECT COUNT(*)::int as count FROM messages
        WHERE "senderId" = ${userId}
        AND EXTRACT(HOUR FROM "createdAt") >= 5
        AND EXTRACT(HOUR FROM "createdAt") < 7
      `;
      return (msgs[0]?.count || 0) >= 100;
    },
  },
  marathon_chatter: {
    name: 'Marathon Chatter',
    description: 'Send messages on 30 different days',
    emoji: '🏃',
    rarity: 'rare',
    check: async (userId) => {
      const days = await prisma.$queryRaw`
        SELECT COUNT(DISTINCT DATE("createdAt"))::int as count
        FROM messages WHERE "senderId" = ${userId}
      `;
      return (days[0]?.count || 0) >= 30;
    },
  },
  centurion: {
    name: 'Centurion',
    description: 'Send messages on 100 different days',
    emoji: '🏛️',
    rarity: 'epic',
    check: async (userId) => {
      const days = await prisma.$queryRaw`
        SELECT COUNT(DISTINCT DATE("createdAt"))::int as count
        FROM messages WHERE "senderId" = ${userId}
      `;
      return (days[0]?.count || 0) >= 100;
    },
  },
  year_rounder: {
    name: 'Year-Rounder',
    description: 'Send messages on 365 different days',
    emoji: '📆',
    rarity: 'legendary',
    check: async (userId) => {
      const days = await prisma.$queryRaw`
        SELECT COUNT(DISTINCT DATE("createdAt"))::int as count
        FROM messages WHERE "senderId" = ${userId}
      `;
      return (days[0]?.count || 0) >= 365;
    },
  },
  kick_survivor: {
    name: 'Kick Survivor',
    description: 'Survive 3 kick votes (vote failed/tied)',
    emoji: '🛡️',
    rarity: 'rare',
    check: async (userId) => {
      const count = await prisma.kickVote.count({
        where: { targetId: userId, status: { in: ['failed'] } },
      });
      return count >= 3;
    },
  },
  untouchable: {
    name: 'Untouchable',
    description: 'Survive 10 kick votes',
    emoji: '⭐',
    rarity: 'legendary',
    check: async (userId) => {
      const count = await prisma.kickVote.count({
        where: { targetId: userId, status: { in: ['failed'] } },
      });
      return count >= 10;
    },
  },
  dm_enthusiast: {
    name: 'DM Enthusiast',
    description: 'Send 500 direct messages',
    emoji: '✉️',
    rarity: 'rare',
    check: async (userId) => {
      const count = await prisma.directMessage.count({ where: { senderId: userId } });
      return count >= 500;
    },
  },
  pen_pal: {
    name: 'Pen Pal',
    description: 'Send 5,000 direct messages',
    emoji: '📜',
    rarity: 'legendary',
    check: async (userId) => {
      const count = await prisma.directMessage.count({ where: { senderId: userId } });
      return count >= 5000;
    },
  },
};

// ─── Evaluate and award new badges for a user ───
export async function evaluateBadges(userId) {
  const existing = await prisma.userBadge.findMany({
    where: { userId },
    select: { badgeId: true },
  });
  const earned = new Set(existing.map((b) => b.badgeId));
  const newBadges = [];

  for (const [badgeId, badge] of Object.entries(BADGES)) {
    if (earned.has(badgeId)) continue;
    try {
      const qualifies = await badge.check(userId);
      if (qualifies) {
        await prisma.userBadge.create({ data: { badgeId, userId } });
        newBadges.push(badgeId);
      }
    } catch (err) {
      // Skip badges that fail evaluation
    }
  }

  return newBadges;
}

// ─── API Endpoints ───
export async function getMyBadges(req, res) {
  try {
    // Evaluate first to pick up any new ones
    await evaluateBadges(req.userId);

    const userBadges = await prisma.userBadge.findMany({
      where: { userId: req.userId },
      orderBy: { awardedAt: 'desc' },
    });

    const badges = userBadges.map((ub) => {
      const def = BADGES[ub.badgeId];
      return {
        id: ub.badgeId,
        name: def?.name || ub.badgeId,
        description: def?.description || '',
        emoji: def?.emoji || '🏅',
        rarity: def?.rarity || 'common',
        awardedAt: ub.awardedAt,
      };
    });

    res.json({ badges });
  } catch (error) {
    console.error('Get badges error:', error);
    res.status(500).json({ error: 'Failed to fetch badges' });
  }
}

export async function getUserBadges(req, res) {
  try {
    const { userId } = req.params;

    const userBadges = await prisma.userBadge.findMany({
      where: { userId },
      orderBy: { awardedAt: 'desc' },
    });

    const badges = userBadges.map((ub) => {
      const def = BADGES[ub.badgeId];
      return {
        id: ub.badgeId,
        name: def?.name || ub.badgeId,
        description: def?.description || '',
        emoji: def?.emoji || '🏅',
        rarity: def?.rarity || 'common',
        awardedAt: ub.awardedAt,
      };
    });

    res.json({ badges });
  } catch (error) {
    console.error('Get user badges error:', error);
    res.status(500).json({ error: 'Failed to fetch badges' });
  }
}

export async function getAllBadges(req, res) {
  try {
    const earned = await prisma.userBadge.findMany({
      where: { userId: req.userId },
      select: { badgeId: true },
    });
    const earnedSet = new Set(earned.map((b) => b.badgeId));

    const all = Object.entries(BADGES).map(([id, def]) => ({
      id,
      name: def.name,
      description: def.description,
      emoji: def.emoji,
      rarity: def.rarity,
      earned: earnedSet.has(id),
    }));

    res.json({ badges: all });
  } catch (error) {
    console.error('Get all badges error:', error);
    res.status(500).json({ error: 'Failed to fetch badges' });
  }
}
