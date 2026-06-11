import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  user: {
    findUnique: vi.fn(),
  },
  moderationReport: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  message: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  room: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  roomBan: {
    upsert: vi.fn(),
  },
  roomMember: {
    deleteMany: vi.fn(),
    count: vi.fn(),
  },
  kickVote: {
    updateMany: vi.fn(),
  },
  ipBan: {
    findMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  },
}));

const ioTargetMock = vi.hoisted(() => ({
  emit: vi.fn(),
}));

const ioMock = vi.hoisted(() => ({
  to: vi.fn(() => ioTargetMock),
  emit: vi.fn(),
}));

const socketHandlersMock = vi.hoisted(() => ({
  getIo: vi.fn(),
  kickUserFromRoom: vi.fn(),
}));

const emailMock = vi.hoisted(() => ({
  sendEmail: vi.fn(),
}));

const emailTemplatesMock = vi.hoisted(() => ({
  renderEmailTemplate: vi.fn(() => ({ subject: 'Safety notice', text: 'Safety notice' })),
}));

vi.mock('../../lib/prisma.js', () => ({ default: prismaMock }));
vi.mock('../../socket/handlers.js', () => socketHandlersMock);
vi.mock('../../lib/email.js', () => emailMock);
vi.mock('../../lib/emailTemplates.js', () => emailTemplatesMock);

import {
  banReportIp,
  banReportedUser,
  deleteReportedMessage,
  getReports,
  setReportedRoomLock,
} from '../moderation.controller.js';

function createResponse() {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

function report(overrides = {}) {
  return {
    id: 'report-1',
    targetType: 'message',
    reason: 'spam',
    details: 'links everywhere',
    status: 'open',
    messageId: 'message-1',
    targetUserId: 'target-1',
    targetIpHash: 'target-ip-hash',
    reporterIpHash: 'reporter-ip-hash',
    roomId: 'room-1',
    reporter: { id: 'reporter-1', username: 'Reporter', discriminator: '1111' },
    targetUser: { id: 'target-1', username: 'TargetCafe', discriminator: '2222', role: 'user' },
    ...overrides,
  };
}

describe('admin moderation actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.user.findUnique.mockResolvedValue({ role: 'admin' });
    prismaMock.moderationReport.findUnique.mockResolvedValue(report());
    prismaMock.moderationReport.findMany.mockResolvedValue([report()]);
    prismaMock.moderationReport.update.mockResolvedValue(report({
      status: 'resolved',
      resolutionNote: 'done',
    }));
    prismaMock.message.findUnique.mockResolvedValue({ id: 'message-1', roomId: 'room-1' });
    prismaMock.message.update.mockResolvedValue({ id: 'message-1', isDeleted: true });
    prismaMock.room.findUnique.mockResolvedValue({ id: 'room-1', name: 'Quiet Table' });
    prismaMock.room.update.mockResolvedValue({ id: 'room-1', name: 'Quiet Table', isLocked: true });
    prismaMock.roomBan.upsert.mockReturnValue({ operation: 'ban' });
    prismaMock.roomMember.deleteMany.mockReturnValue({ operation: 'remove-member' });
    prismaMock.roomMember.count.mockResolvedValue(2);
    prismaMock.kickVote.updateMany.mockReturnValue({ operation: 'cancel-votes' });
    prismaMock.ipBan.upsert.mockResolvedValue({ id: 'ip-ban-1', ipHash: 'target-ip-hash' });
    prismaMock.$transaction.mockResolvedValue([]);
    socketHandlersMock.getIo.mockReturnValue(ioMock);
    emailMock.sendEmail.mockResolvedValue({ delivered: false });
  });

  it('requires admin access to view reports', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ role: 'user' });
    const req = { userId: 'user-1', query: {} };
    const res = createResponse();

    await getReports(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Admin access required' });
    expect(prismaMock.moderationReport.findMany).not.toHaveBeenCalled();
  });

  it('soft-deletes a reported message, resolves the report, and emits deletion', async () => {
    const req = {
      userId: 'admin-1',
      params: { reportId: 'report-1' },
      body: { resolutionNote: 'confirmed spam' },
    };
    const res = createResponse();

    await deleteReportedMessage(req, res);

    expect(prismaMock.message.update).toHaveBeenCalledWith({
      where: { id: 'message-1' },
      data: {
        text: '',
        isDeleted: true,
        mediaUrl: null,
        mediaType: null,
        mediaName: null,
      },
    });
    expect(prismaMock.moderationReport.update).toHaveBeenCalledWith({
      where: { id: 'report-1' },
      data: {
        status: 'resolved',
        resolutionNote: 'Deleted reported message: confirmed spam',
        reviewerId: 'admin-1',
        reviewedAt: expect.any(Date),
      },
      include: expect.any(Object),
    });
    expect(ioMock.to).toHaveBeenCalledWith('room-1');
    expect(ioTargetMock.emit).toHaveBeenCalledWith('message:deleted', { messageId: 'message-1' });
    expect(res.json).toHaveBeenCalledWith({
      report: expect.objectContaining({ status: 'resolved' }),
      message: { id: 'message-1', deleted: true },
    });
  });

  it('bans a reported user from a room and removes them from active membership', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ role: 'admin' })
      .mockResolvedValueOnce({ id: 'target-1', username: 'TargetCafe', discriminator: '2222', role: 'user', email: 'target@example.com' });
    const req = {
      userId: 'admin-1',
      params: { reportId: 'report-1' },
      body: { reason: 'harassment', resolutionNote: 'clear violation' },
    };
    const res = createResponse();

    await banReportedUser(req, res);

    expect(prismaMock.roomBan.upsert).toHaveBeenCalledWith({
      where: {
        userId_roomId: {
          userId: 'target-1',
          roomId: 'room-1',
        },
      },
      update: { reason: 'harassment' },
      create: {
        userId: 'target-1',
        roomId: 'room-1',
        reason: 'harassment',
      },
    });
    expect(prismaMock.$transaction).toHaveBeenCalledWith([
      { operation: 'ban' },
      { operation: 'remove-member' },
      { operation: 'cancel-votes' },
    ]);
    expect(socketHandlersMock.kickUserFromRoom).toHaveBeenCalledWith(
      'target-1',
      'room-1',
      'admin-1',
      'harassment',
    );
    expect(ioMock.emit).toHaveBeenCalledWith('room:updated', {
      roomId: 'room-1',
      memberCount: 2,
    });
    expect(res.json).toHaveBeenCalledWith({
      report: expect.objectContaining({ status: 'resolved' }),
      bannedUser: expect.objectContaining({ id: 'target-1' }),
      room: { id: 'room-1', name: 'Quiet Table' },
    });
    expect(emailMock.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'target@example.com',
      subject: 'Safety notice',
    }));
  });

  it('locks a reported room and resolves the report', async () => {
    const req = {
      userId: 'admin-1',
      params: { reportId: 'report-1' },
      body: { isLocked: true, resolutionNote: 'raid containment' },
    };
    const res = createResponse();

    await setReportedRoomLock(req, res);

    expect(prismaMock.room.update).toHaveBeenCalledWith({
      where: { id: 'room-1' },
      data: { isLocked: true },
      select: { id: true, name: true, isLocked: true },
    });
    expect(prismaMock.moderationReport.update).toHaveBeenCalledWith({
      where: { id: 'report-1' },
      data: {
        status: 'resolved',
        resolutionNote: 'Locked room Quiet Table: raid containment',
        reviewerId: 'admin-1',
        reviewedAt: expect.any(Date),
      },
      include: expect.any(Object),
    });
    expect(ioMock.emit).toHaveBeenCalledWith('room:updated', {
      roomId: 'room-1',
      isLocked: true,
    });
    expect(res.json).toHaveBeenCalledWith({
      report: expect.objectContaining({ status: 'resolved' }),
      room: { id: 'room-1', name: 'Quiet Table', isLocked: true },
    });
  });

  it('bans a report target IP hash and resolves the report', async () => {
    const req = {
      userId: 'admin-1',
      params: { reportId: 'report-1' },
      body: { subject: 'target', reason: 'raid pattern', resolutionNote: 'clear network abuse' },
    };
    const res = createResponse();

    await banReportIp(req, res);

    expect(prismaMock.ipBan.upsert).toHaveBeenCalledWith({
      where: { ipHash: 'target-ip-hash' },
      update: {
        reason: 'raid pattern',
        expiresAt: null,
        createdById: 'admin-1',
      },
      create: {
        ipHash: 'target-ip-hash',
        reason: 'raid pattern',
        expiresAt: null,
        createdById: 'admin-1',
      },
    });
    expect(prismaMock.moderationReport.update).toHaveBeenCalledWith({
      where: { id: 'report-1' },
      data: {
        status: 'resolved',
        resolutionNote: 'Banned target IP hash: clear network abuse',
        reviewerId: 'admin-1',
        reviewedAt: expect.any(Date),
      },
      include: expect.any(Object),
    });
    expect(res.json).toHaveBeenCalledWith({
      report: expect.objectContaining({ status: 'resolved' }),
      ipBan: { id: 'ip-ban-1', ipHash: 'target-ip-hash' },
    });
  });
});
