import prisma from '../lib/prisma.js';
import { getIo, kickUserFromRoom } from '../socket/handlers.js';
import { getIpHash, getRequestIpHash } from '../lib/ipBan.js';
import { sendEmail } from '../lib/email.js';
import { renderEmailTemplate } from '../lib/emailTemplates.js';

const TARGET_TYPES = new Set(['message', 'user', 'room', 'dm', 'emptychair']);
const REPORT_REASONS = new Set([
  'spam',
  'harassment',
  'hate',
  'sexual_content',
  'violence',
  'self_harm',
  'impersonation',
  'underage',
  'other',
]);
const REPORT_STATUSES = new Set(['open', 'reviewing', 'resolved', 'dismissed']);

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

async function requireAdmin(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { role: true },
  });

  if (user?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return false;
  }

  return true;
}

async function createMessageReportContext({ messageId, reporterId }) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      sender: { select: { id: true, username: true, discriminator: true } },
      room: { select: { id: true, name: true } },
    },
  });

  if (!message) {
    const error = new Error('Message not found');
    error.status = 404;
    throw error;
  }

  const membership = await prisma.roomMember.findUnique({
    where: {
      userId_roomId: {
        userId: reporterId,
        roomId: message.roomId,
      },
    },
  });

  if (!membership) {
    const error = new Error('Not a member of this room');
    error.status = 403;
    throw error;
  }

  return {
    targetUserId: message.senderId,
    roomId: message.roomId,
    targetIpHash: message.senderIpHash || null,
    snapshot: {
      messageId: message.id,
      text: message.text?.slice(0, 2000) || '',
      mediaUrl: message.mediaUrl,
      mediaType: message.mediaType,
      mediaName: message.mediaName,
      createdAt: message.createdAt.toISOString(),
      sender: message.sender,
      room: message.room,
    },
  };
}

export async function createReport(req, res) {
  try {
    const targetType = req.body.targetType;
    const reason = req.body.reason;
    const details = cleanText(req.body.details, 1000);
    const messageId = cleanText(req.body.messageId, 128);
    const requestedTargetUserId = cleanText(req.body.targetUserId, 128);
    const requestedRoomId = cleanText(req.body.roomId, 128);
    const reporterIpHash = getRequestIpHash(req);

    if (!TARGET_TYPES.has(targetType)) {
      return res.status(400).json({ error: 'Invalid report target type' });
    }

    if (!REPORT_REASONS.has(reason)) {
      return res.status(400).json({ error: 'Invalid report reason' });
    }

    let targetUserId = requestedTargetUserId;
    let roomId = requestedRoomId;
    let snapshot = null;
    let targetIpHash = null;

    if (targetType === 'message') {
      if (!messageId) {
        return res.status(400).json({ error: 'messageId is required for message reports' });
      }
      const context = await createMessageReportContext({ messageId, reporterId: req.userId });
      targetUserId = context.targetUserId;
      roomId = context.roomId;
      targetIpHash = context.targetIpHash;
      snapshot = context.snapshot;
    }

    if (targetType === 'user') {
      if (!targetUserId) {
        return res.status(400).json({ error: 'targetUserId is required for user reports' });
      }
      if (targetUserId === req.userId) {
        return res.status(400).json({ error: 'You cannot report yourself' });
      }
      const target = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, username: true, discriminator: true, createdAt: true, lastIpHash: true },
      });
      if (!target) {
        return res.status(404).json({ error: 'User not found' });
      }
      targetIpHash = target.lastIpHash || null;
      const { lastIpHash, ...publicTarget } = target;
      snapshot = { target: { ...publicTarget, createdAt: target.createdAt.toISOString() } };
    }

    const report = await prisma.moderationReport.create({
      data: {
        reporterId: req.userId,
        targetType,
        reason,
        details,
        messageId: targetType === 'message' ? messageId : null,
        targetUserId: targetUserId || null,
        roomId: roomId || null,
        reporterIpHash,
        targetIpHash,
        snapshot,
      },
      include: {
        targetUser: { select: { id: true, username: true, discriminator: true } },
      },
    });

    res.status(201).json({ report });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Create report error:', error);
    res.status(500).json({ error: 'Failed to create report' });
  }
}

export async function getReports(req, res) {
  try {
    if (!(await requireAdmin(req, res))) return;

    const status = cleanText(req.query.status, 32) || 'open';
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);

    if (status !== 'all' && !REPORT_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Invalid report status' });
    }

    const reports = await prisma.moderationReport.findMany({
      where: status === 'all' ? {} : { status },
      include: {
        reporter: { select: { id: true, username: true, discriminator: true, avatar: true } },
        targetUser: { select: { id: true, username: true, discriminator: true, avatar: true } },
        reviewer: { select: { id: true, username: true, discriminator: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json({ reports });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
}

export async function updateReport(req, res) {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { reportId } = req.params;
    const status = req.body.status;
    const resolutionNote = cleanText(req.body.resolutionNote, 1000);

    if (!REPORT_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Invalid report status' });
    }

    const report = await prisma.moderationReport.update({
      where: { id: reportId },
      data: {
        status,
        resolutionNote,
        reviewerId: req.userId,
        reviewedAt: new Date(),
      },
      include: {
        reporter: { select: { id: true, username: true, discriminator: true } },
        targetUser: { select: { id: true, username: true, discriminator: true } },
      },
    });

    res.json({ report });
  } catch (error) {
    console.error('Update report error:', error);
    res.status(500).json({ error: 'Failed to update report' });
  }
}

async function getReportForAction(reportId) {
  const report = await prisma.moderationReport.findUnique({
    where: { id: reportId },
    include: {
      reporter: { select: { id: true, username: true, discriminator: true } },
      targetUser: { select: { id: true, username: true, discriminator: true, role: true } },
    },
  });

  if (!report) {
    const error = new Error('Report not found');
    error.status = 404;
    throw error;
  }

  return report;
}

function parseExpiresAt(value) {
  if (!value) return null;
  const expiresAt = new Date(value);
  return Number.isNaN(expiresAt.getTime()) ? undefined : expiresAt;
}

function actionNote(action, note) {
  return [action, cleanText(note, 1000)].filter(Boolean).join(': ');
}

async function resolveReport(reportId, reviewerId, resolutionNote) {
  return prisma.moderationReport.update({
    where: { id: reportId },
    data: {
      status: 'resolved',
      resolutionNote,
      reviewerId,
      reviewedAt: new Date(),
    },
    include: {
      reporter: { select: { id: true, username: true, discriminator: true } },
      targetUser: { select: { id: true, username: true, discriminator: true } },
      reviewer: { select: { id: true, username: true, discriminator: true } },
    },
  });
}

export async function deleteReportedMessage(req, res) {
  try {
    if (!(await requireAdmin(req, res))) return;

    const report = await getReportForAction(req.params.reportId);
    const messageId = cleanText(req.body.messageId, 128) || report.messageId;
    if (!messageId) {
      return res.status(400).json({ error: 'No message is attached to this report' });
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, roomId: true },
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    await prisma.message.update({
      where: { id: messageId },
      data: {
        text: '',
        isDeleted: true,
        mediaUrl: null,
        mediaType: null,
        mediaName: null,
      },
    });

    const updatedReport = await resolveReport(
      report.id,
      req.userId,
      actionNote('Deleted reported message', req.body.resolutionNote),
    );

    getIo()?.to(message.roomId).emit('message:deleted', { messageId });

    res.json({ report: updatedReport, message: { id: messageId, deleted: true } });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Delete reported message error:', error);
    res.status(500).json({ error: 'Failed to delete reported message' });
  }
}

export async function banReportedUser(req, res) {
  try {
    if (!(await requireAdmin(req, res))) return;

    const report = await getReportForAction(req.params.reportId);
    const targetUserId = cleanText(req.body.targetUserId, 128) || report.targetUserId;
    const roomId = cleanText(req.body.roomId, 128) || report.roomId;
    const reason = cleanText(req.body.reason, 500) || report.reason || 'Moderation action';

    if (!targetUserId || !roomId) {
      return res.status(400).json({ error: 'targetUserId and roomId are required' });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, username: true, discriminator: true, role: true, email: true },
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    if (targetUser.role === 'admin') {
      return res.status(400).json({ error: 'Cannot ban an admin user from the moderation queue' });
    }

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, name: true },
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    await prisma.$transaction([
      prisma.roomBan.upsert({
        where: {
          userId_roomId: {
            userId: targetUserId,
            roomId,
          },
        },
        update: { reason },
        create: {
          userId: targetUserId,
          roomId,
          reason,
        },
      }),
      prisma.roomMember.deleteMany({
        where: {
          userId: targetUserId,
          roomId,
        },
      }),
      prisma.kickVote.updateMany({
        where: {
          roomId,
          targetId: targetUserId,
          status: 'active',
        },
        data: { status: 'cancelled' },
      }),
    ]);

    kickUserFromRoom(targetUserId, roomId, req.userId, reason);

    const memberCount = await prisma.roomMember.count({ where: { roomId } });
    getIo()?.emit('room:updated', { roomId, memberCount });

    const updatedReport = await resolveReport(
      report.id,
      req.userId,
      actionNote(`Banned ${targetUser.username} from ${room.name}`, req.body.resolutionNote),
    );

    const notice = renderEmailTemplate('safety_notice', {
      username: targetUser.username,
      reason,
    });
    sendEmail({
      to: targetUser.email,
      ...notice,
    }).catch((error) => console.error('Safety notice email error:', error));

    res.json({
      report: updatedReport,
      bannedUser: {
        id: targetUser.id,
        username: targetUser.username,
        discriminator: targetUser.discriminator,
        role: targetUser.role,
      },
      room,
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Ban reported user error:', error);
    res.status(500).json({ error: 'Failed to ban reported user' });
  }
}

export async function setReportedRoomLock(req, res) {
  try {
    if (!(await requireAdmin(req, res))) return;

    const report = await getReportForAction(req.params.reportId);
    const roomId = cleanText(req.body.roomId, 128) || report.roomId;
    const isLocked = req.body.isLocked !== false;

    if (!roomId) {
      return res.status(400).json({ error: 'roomId is required' });
    }

    const room = await prisma.room.update({
      where: { id: roomId },
      data: { isLocked },
      select: { id: true, name: true, isLocked: true },
    });

    const updatedReport = await resolveReport(
      report.id,
      req.userId,
      actionNote(`${isLocked ? 'Locked' : 'Unlocked'} room ${room.name}`, req.body.resolutionNote),
    );

    getIo()?.emit('room:updated', {
      roomId: room.id,
      isLocked: room.isLocked,
    });

    res.json({ report: updatedReport, room });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Set reported room lock error:', error);
    res.status(500).json({ error: 'Failed to update room lock' });
  }
}

export async function banReportIp(req, res) {
  try {
    if (!(await requireAdmin(req, res))) return;

    const report = await getReportForAction(req.params.reportId);
    const subject = req.body.subject === 'reporter' ? 'reporter' : 'target';
    const ipHash = cleanText(req.body.ipHash, 128)
      || (subject === 'reporter' ? report.reporterIpHash : report.targetIpHash);
    const reason = cleanText(req.body.reason, 500) || `Report ${report.id} ${subject} IP`;
    const expiresAt = parseExpiresAt(req.body.expiresAt);

    if (!ipHash) {
      return res.status(400).json({ error: 'No IP hash is attached to this report' });
    }

    if (expiresAt === undefined) {
      return res.status(400).json({ error: 'Invalid expiresAt value' });
    }

    const ipBan = await prisma.ipBan.upsert({
      where: { ipHash },
      update: {
        reason,
        expiresAt,
        createdById: req.userId,
      },
      create: {
        ipHash,
        reason,
        expiresAt,
        createdById: req.userId,
      },
    });

    const updatedReport = await resolveReport(
      report.id,
      req.userId,
      actionNote(`Banned ${subject} IP hash`, req.body.resolutionNote),
    );

    res.json({ report: updatedReport, ipBan });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Ban report IP error:', error);
    res.status(500).json({ error: 'Failed to ban report IP' });
  }
}

export async function listIpBans(req, res) {
  try {
    if (!(await requireAdmin(req, res))) return;

    const includeExpired = req.query.includeExpired === 'true';
    const where = includeExpired
      ? {}
      : {
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        };

    const ipBans = await prisma.ipBan.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json({ ipBans });
  } catch (error) {
    console.error('List IP bans error:', error);
    res.status(500).json({ error: 'Failed to fetch IP bans' });
  }
}

export async function createIpBan(req, res) {
  try {
    if (!(await requireAdmin(req, res))) return;

    const rawIp = cleanText(req.body.rawIp, 128);
    const ipHash = cleanText(req.body.ipHash, 128) || getIpHash(rawIp);
    const reason = cleanText(req.body.reason, 500) || 'Manual moderation action';
    const expiresAt = parseExpiresAt(req.body.expiresAt);

    if (!ipHash) {
      return res.status(400).json({ error: 'ipHash or rawIp is required' });
    }

    if (expiresAt === undefined) {
      return res.status(400).json({ error: 'Invalid expiresAt value' });
    }

    const ipBan = await prisma.ipBan.upsert({
      where: { ipHash },
      update: {
        reason,
        expiresAt,
        createdById: req.userId,
      },
      create: {
        ipHash,
        reason,
        expiresAt,
        createdById: req.userId,
      },
    });

    res.status(201).json({ ipBan });
  } catch (error) {
    console.error('Create IP ban error:', error);
    res.status(500).json({ error: 'Failed to create IP ban' });
  }
}

export async function deleteIpBan(req, res) {
  try {
    if (!(await requireAdmin(req, res))) return;

    await prisma.ipBan.delete({
      where: { id: req.params.banId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete IP ban error:', error);
    res.status(500).json({ error: 'Failed to delete IP ban' });
  }
}

export async function blockUser(req, res) {
  try {
    const blockedUserId = cleanText(req.body.blockedUserId, 128);
    const reason = cleanText(req.body.reason, 500);

    if (!blockedUserId) {
      return res.status(400).json({ error: 'blockedUserId is required' });
    }

    if (blockedUserId === req.userId) {
      return res.status(400).json({ error: 'You cannot block yourself' });
    }

    const blockedUser = await prisma.user.findUnique({
      where: { id: blockedUserId },
      select: { id: true, username: true, discriminator: true, avatar: true },
    });

    if (!blockedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const block = await prisma.$transaction(async (tx) => {
      await tx.friendship.deleteMany({
        where: {
          OR: [
            { requesterId: req.userId, addresseeId: blockedUserId },
            { requesterId: blockedUserId, addresseeId: req.userId },
          ],
        },
      });

      return tx.userBlock.upsert({
        where: {
          blockerId_blockedId: {
            blockerId: req.userId,
            blockedId: blockedUserId,
          },
        },
        update: { reason },
        create: {
          blockerId: req.userId,
          blockedId: blockedUserId,
          reason,
        },
      });
    });

    res.json({ block, blockedUser });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ error: 'Failed to block user' });
  }
}

export async function unblockUser(req, res) {
  try {
    const { blockedUserId } = req.params;

    await prisma.userBlock.deleteMany({
      where: {
        blockerId: req.userId,
        blockedId: blockedUserId,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({ error: 'Failed to unblock user' });
  }
}

export async function getBlockedUsers(req, res) {
  try {
    const blocks = await prisma.userBlock.findMany({
      where: { blockerId: req.userId },
      include: {
        blocked: { select: { id: true, username: true, discriminator: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ blocks });
  } catch (error) {
    console.error('Get blocked users error:', error);
    res.status(500).json({ error: 'Failed to fetch blocked users' });
  }
}
