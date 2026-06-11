import prisma from '../lib/prisma.js';
import { socketAuthMiddleware } from '../middleware/auth.middleware.js';
import { isCafeOpen } from '../lib/cafeHours.js';
import { createNotification } from '../controllers/notification.controller.js';
import { isBlockedBetween } from '../lib/blocks.js';
import { checkSocketSpam, evaluateTextSafety } from '../lib/contentSafety.js';
import { socketIpBanMiddleware } from '../lib/ipBan.js';

// Track connected users per room
const roomUsers = new Map(); // roomId -> Map(socketId -> user)

// Track globally online users (for friend presence)
const globalOnlineUsers = new Map(); // userId -> Set<socketId>

// Track voice channel users per room
const roomVoiceUsers = new Map(); // roomId -> Map(socketId -> userInfo)

const RATE_LIMITS = {
  message: { capacity: 10, refillPerSecond: 2 },
  room: { capacity: 8, refillPerSecond: 1 },
  typing: { capacity: 20, refillPerSecond: 10 },
  reaction: { capacity: 30, refillPerSecond: 10 },
  whisper: { capacity: 10, refillPerSecond: 2 },
  draw: { capacity: 120, refillPerSecond: 60 },
  dm: { capacity: 10, refillPerSecond: 2 },
  call: { capacity: 10, refillPerSecond: 1 },
  emptychair: { capacity: 10, refillPerSecond: 2 },
};

const VALID_MOODS = new Set(['chill', 'busy', 'caffeinated', 'sleepy', 'creative', 'chatty', 'focused', 'vibing']);
const STATUS_MAX_LENGTH = 100;
const DRAW_COLORS = new Set([
  '#1c1917', '#dc2626', '#ea580c', '#ca8a04', '#16a34a',
  '#2563eb', '#7c3aed', '#db2777', '#ffffff', '#fffbeb',
]);
const ALLOWED_MEDIA_TYPES = new Set(['image', 'video', 'audio', 'file']);

function rateLimitSocket(socket, eventName) {
  const config = RATE_LIMITS[eventName];
  if (!config) return true;

  if (!socket.rateBuckets) {
    socket.rateBuckets = new Map();
  }

  const now = Date.now();
  const bucket = socket.rateBuckets.get(eventName) || {
    tokens: config.capacity,
    updatedAt: now,
    lastWarnedAt: 0,
  };

  const elapsedSeconds = Math.max(0, (now - bucket.updatedAt) / 1000);
  bucket.tokens = Math.min(config.capacity, bucket.tokens + elapsedSeconds * config.refillPerSecond);
  bucket.updatedAt = now;

  if (bucket.tokens < 1) {
    if (now - bucket.lastWarnedAt > 5000) {
      socket.emit('error', { message: 'Slow down a little and try again.' });
      bucket.lastWarnedAt = now;
    }
    socket.rateBuckets.set(eventName, bucket);
    return false;
  }

  bucket.tokens -= 1;
  socket.rateBuckets.set(eventName, bucket);
  return true;
}

async function isAcceptedFriend(socket, otherUserId) {
  if (!otherUserId || otherUserId === socket.userId) return false;
  if (await isBlockedBetween(socket.userId, otherUserId)) return false;
  if (socket.friendIds?.includes(otherUserId)) return true;

  const friendship = await prisma.friendship.findFirst({
    where: {
      status: 'accepted',
      OR: [
        { requesterId: socket.userId, addresseeId: otherUserId },
        { requesterId: otherUserId, addresseeId: socket.userId },
      ],
    },
    select: { id: true },
  });

  return Boolean(friendship);
}

function conversationIdFor(userId1, userId2) {
  return [userId1, userId2].sort().join('_');
}

function canSignalVoicePeer(socket, targetSocketId) {
  const roomId = socket.currentRoom;
  if (!roomId || !targetSocketId) return false;
  const voiceUsers = roomVoiceUsers.get(roomId);
  return Boolean(voiceUsers?.has(socket.id) && voiceUsers.has(targetSocketId));
}

function normalizeStatus(status) {
  if (status == null) return null;
  if (typeof status !== 'string') return null;
  const trimmed = status.trim();
  return trimmed ? trimmed.slice(0, STATUS_MAX_LENGTH) : null;
}

function isAllowedMediaUrl(mediaUrl) {
  if (typeof mediaUrl !== 'string' || mediaUrl.length > 2048) return false;

  try {
    const parsed = new URL(mediaUrl);
    const hostname = parsed.hostname.toLowerCase();
    return (
      parsed.protocol === 'https:' &&
      (hostname === 'res.cloudinary.com' || hostname === 'giphy.com' || hostname.endsWith('.giphy.com'))
    );
  } catch {
    return false;
  }
}

function normalizeMediaPayload({ mediaUrl, mediaType, mediaName }) {
  if (!mediaUrl) {
    return { mediaUrl: null, mediaType: null, mediaName: null };
  }

  if (!isAllowedMediaUrl(mediaUrl) || !ALLOWED_MEDIA_TYPES.has(mediaType)) {
    return null;
  }

  return {
    mediaUrl,
    mediaType,
    mediaName: typeof mediaName === 'string' ? mediaName.slice(0, 255) : null,
  };
}

function rejectUnsafeText(socket, channel, text, options = {}) {
  const { errorEvent = 'error', ...safetyOptions } = options;
  const contentDecision = evaluateTextSafety(text, safetyOptions);
  if (!contentDecision.allowed) {
    socket.emit(errorEvent, { message: contentDecision.message, code: contentDecision.code });
    return true;
  }

  const spamDecision = checkSocketSpam(socket, channel, text);
  if (!spamDecision.allowed) {
    socket.emit(errorEvent, { message: spamDecision.message, code: spamDecision.code });
    return true;
  }

  return false;
}

function isFiniteCoordinate(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1000;
}

function isValidDrawLine(data) {
  if (!data || typeof data !== 'object') return false;
  return (
    isFiniteCoordinate(data.x1) &&
    isFiniteCoordinate(data.y1) &&
    isFiniteCoordinate(data.x2) &&
    isFiniteCoordinate(data.y2) &&
    DRAW_COLORS.has(data.color) &&
    Number.isFinite(data.size) &&
    data.size >= 1 &&
    data.size <= 72
  );
}

async function getValidRoomReplyToId(roomId, replyToId) {
  if (!replyToId) return null;

  const replyTo = await prisma.message.findUnique({
    where: { id: replyToId },
    select: { id: true, roomId: true, isDeleted: true },
  });

  return replyTo && replyTo.roomId === roomId && !replyTo.isDeleted ? replyTo.id : null;
}

async function getValidDirectMessageReplyToId(conversationId, replyToId) {
  if (!replyToId) return null;

  const replyTo = await prisma.directMessage.findUnique({
    where: { id: replyToId },
    select: { id: true, conversationId: true },
  });

  return replyTo && replyTo.conversationId === conversationId ? replyTo.id : null;
}

// ─── Empty Chair (ephemeral stranger chat) ───
const emptyChairQueue = [];               // [{ socketId, userId, username, joinedAt }]
const emptyChairSessions = new Map();     // sessionId -> { user1, user2, startTime, timer, revealed: Set }
const userEmptyChairSession = new Map();  // userId -> sessionId

// Recently matched pairs — don't immediately rematch the same two people
// (also prevents someone who was just left/blocked from cycling straight back in)
const recentEmptyChairPairs = new Map(); // "idA_idB" (sorted) -> matchedAt timestamp
const EMPTY_CHAIR_REMATCH_COOLDOWN_MS = 10 * 60 * 1000;

function wasRecentlyPaired(userId1, userId2) {
  const key = [userId1, userId2].sort().join('_');
  const matchedAt = recentEmptyChairPairs.get(key);
  if (!matchedAt) return false;
  if (Date.now() - matchedAt > EMPTY_CHAIR_REMATCH_COOLDOWN_MS) {
    recentEmptyChairPairs.delete(key);
    return false;
  }
  return true;
}

function recordEmptyChairPair(userId1, userId2) {
  // Opportunistic pruning keeps the map from growing unbounded
  if (recentEmptyChairPairs.size > 5000) {
    const cutoff = Date.now() - EMPTY_CHAIR_REMATCH_COOLDOWN_MS;
    for (const [key, ts] of recentEmptyChairPairs) {
      if (ts < cutoff) recentEmptyChairPairs.delete(key);
    }
  }
  recentEmptyChairPairs.set([userId1, userId2].sort().join('_'), Date.now());
}

function createEmptyChairSession(io, u1, u2, s1, s2) {
  const sessionId = `ec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const roomName = `emptychair:${sessionId}`;

  s1.join(roomName);
  s2.join(roomName);

  const session = {
    user1: u1,
    user2: u2,
    roomName,
    startTime: Date.now(),
    revealed: new Set(),
    extendVotes: new Set(),
    timer: setTimeout(() => {
      endEmptyChairSession(io, sessionId, 'timeout');
    }, 5 * 60 * 1000),
  };

  emptyChairSessions.set(sessionId, session);
  userEmptyChairSession.set(u1.userId, sessionId);
  userEmptyChairSession.set(u2.userId, sessionId);
  recordEmptyChairPair(u1.userId, u2.userId);

  s1.emit('emptychair:matched', {
    sessionId,
    partner: { username: 'A Stranger' },
    duration: 300,
  });
  s2.emit('emptychair:matched', {
    sessionId,
    partner: { username: 'A Stranger' },
    duration: 300,
  });
}

let emptyChairMatchingInFlight = false;

async function tryMatchEmptyChair(io) {
  if (emptyChairMatchingInFlight) return; // a run is already scanning the queue
  emptyChairMatchingInFlight = true;

  try {
    let progress = true;
    while (progress) {
      progress = false;

      // Drop queue entries whose sockets are gone
      for (let i = emptyChairQueue.length - 1; i >= 0; i--) {
        if (!io.sockets.sockets.get(emptyChairQueue[i].socketId)) {
          emptyChairQueue.splice(i, 1);
        }
      }

      pairSearch:
      for (let i = 0; i < emptyChairQueue.length - 1; i++) {
        for (let j = i + 1; j < emptyChairQueue.length; j++) {
          const u1 = emptyChairQueue[i];
          const u2 = emptyChairQueue[j];

          if (wasRecentlyPaired(u1.userId, u2.userId)) continue;
          if (await isBlockedBetween(u1.userId, u2.userId)) continue;

          // The queue may have changed while awaiting the block check —
          // re-verify both candidates are still queued and connected.
          if (!emptyChairQueue.includes(u1) || !emptyChairQueue.includes(u2)) {
            progress = true;
            break pairSearch;
          }
          const s1 = io.sockets.sockets.get(u1.socketId);
          const s2 = io.sockets.sockets.get(u2.socketId);
          if (!s1 || !s2) {
            progress = true;
            break pairSearch;
          }

          emptyChairQueue.splice(emptyChairQueue.indexOf(u2), 1);
          emptyChairQueue.splice(emptyChairQueue.indexOf(u1), 1);
          createEmptyChairSession(io, u1, u2, s1, s2);
          progress = true;
          break pairSearch;
        }
      }
    }
  } finally {
    emptyChairMatchingInFlight = false;
  }
}

function endEmptyChairSession(io, sessionId, reason) {
  const session = emptyChairSessions.get(sessionId);
  if (!session) return;

  clearTimeout(session.timer);
  io.to(session.roomName).emit('emptychair:ended', { reason });

  // Clean up socket room membership
  const s1 = io.sockets.sockets.get(session.user1.socketId);
  const s2 = io.sockets.sockets.get(session.user2.socketId);
  if (s1) s1.leave(session.roomName);
  if (s2) s2.leave(session.roomName);

  userEmptyChairSession.delete(session.user1.userId);
  userEmptyChairSession.delete(session.user2.userId);
  emptyChairSessions.delete(sessionId);
}

function removeFromEmptyChairQueue(userId) {
  const idx = emptyChairQueue.findIndex((u) => u.userId === userId);
  if (idx !== -1) emptyChairQueue.splice(idx, 1);
}

// Track DM calls for history
const pendingDMCalls = new Map(); // callId (sorted userIds) -> { callType, callerId, receiverId, initiatedAt }
const activeDMCalls = new Map();  // callId -> { callType, callerId, receiverId, startTime }

function getCallId(userId1, userId2) {
  return [userId1, userId2].sort().join('_');
}

async function saveCallMessage(callerId, receiverId, callType, status, duration) {
  try {
    const conversationId = [callerId, receiverId].sort().join('_');

    let text;
    if (status === 'ended') {
      const m = Math.floor(duration / 60);
      const s = duration % 60;
      text = `${callType === 'video' ? 'Video' : 'Voice'} call \u00b7 ${m}:${s.toString().padStart(2, '0')}`;
    } else if (status === 'missed') {
      text = `Missed ${callType === 'video' ? 'video' : 'voice'} call`;
    } else {
      text = `${callType === 'video' ? 'Video' : 'Voice'} call \u00b7 Cancelled`;
    }

    const dm = await prisma.directMessage.create({
      data: {
        text,
        conversationId,
        senderId: callerId,
        receiverId,
        mediaType: 'call',
        mediaName: JSON.stringify({ callType, status, duration }),
      },
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
      },
    });

    const message = {
      id: dm.id,
      text: dm.text,
      sender: dm.sender,
      receiverId,
      conversationId,
      timestamp: dm.createdAt.toISOString(),
      mediaType: 'call',
      mediaName: dm.mediaName,
    };

    ioInstance.to(`user:${callerId}`).emit('dm:received', message);
    ioInstance.to(`user:${receiverId}`).emit('dm:received', message);
  } catch (err) {
    console.error('Failed to save call message:', err);
  }
}

// Store io reference for external use
let ioInstance = null;

// Export helpers for kick functionality
export function getIo() {
  return ioInstance;
}

export function getRoomUsers() {
  return roomUsers;
}

export function kickUserFromRoom(userId, roomId, kickedBy, reason) {
  const io = ioInstance;
  if (!io || !roomUsers.has(roomId)) return;

  // Find the user's socket in this room
  const roomUserMap = roomUsers.get(roomId);
  for (const [socketId, userData] of roomUserMap.entries()) {
    if (userData.userId === userId) {
      // Emit kick event to the user
      io.to(socketId).emit('user:kicked', {
        roomId,
        kickedBy,
        reason: reason || 'Kicked from the room',
        message: `You have been kicked from this room: ${reason || 'No reason provided'}`
      });

      // Create kicked notification
      createNotification({
        userId,
        type: 'kicked',
        title: 'Removed from room',
        body: `You were kicked: ${reason || 'No reason provided'}`,
        roomId,
      });

      // Notify others
      io.to(roomId).emit('user:left', {
        user: { 
          id: userData.isAnonymous ? socketId : userId, 
          username: userData.username 
        },
        onlineCount: roomUserMap.size - 1,
        wasKicked: true,
      });

      // Remove from room tracking
      roomUserMap.delete(socketId);

      // Force disconnect from room
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.leave(roomId);
        socket.currentRoom = null;
      }

      break;
    }
  }
}

// Anonymous animal names pool
const ANONYMOUS_ANIMALS = [
  'Alligator', 'Anteater', 'Armadillo', 'Axolotl',
  'Badger', 'Bat', 'Bear', 'Beaver', 'Bison', 'Buffalo', 'Bunny',
  'Camel', 'Capybara', 'Cat', 'Chameleon', 'Cheetah', 'Chinchilla', 'Chipmunk', 'Cobra', 'Corgi', 'Coyote', 'Crab', 'Crow',
  'Deer', 'Dingo', 'Dolphin', 'Donkey', 'Dove', 'Dragon', 'Duck',
  'Eagle', 'Elephant', 'Elk', 'Emu',
  'Falcon', 'Ferret', 'Flamingo', 'Fox', 'Frog',
  'Gazelle', 'Gecko', 'Giraffe', 'Goat', 'Goose', 'Gorilla', 'Grizzly',
  'Hamster', 'Hawk', 'Hedgehog', 'Hippo', 'Horse', 'Husky', 'Hyena',
  'Iguana', 'Impala',
  'Jackal', 'Jaguar', 'Jellyfish',
  'Kangaroo', 'Koala', 'Komodo',
  'Lemur', 'Leopard', 'Lion', 'Llama', 'Lobster', 'Lynx',
  'Manatee', 'Meerkat', 'Moose', 'Mouse',
  'Narwhal', 'Newt',
  'Octopus', 'Okapi', 'Orca', 'Ostrich', 'Otter', 'Owl',
  'Panda', 'Panther', 'Parrot', 'Peacock', 'Pelican', 'Penguin', 'Phoenix', 'Pig', 'Platypus', 'Pony', 'Porcupine', 'Puffin', 'Puma',
  'Quail', 'Quokka',
  'Rabbit', 'Raccoon', 'Raven', 'Reindeer', 'Rhino', 'Robin',
  'Salamander', 'Salmon', 'Seal', 'Shark', 'Sheep', 'Sloth', 'Snail', 'Snake', 'Sparrow', 'Squid', 'Squirrel', 'Stingray', 'Stork', 'Swan',
  'Tiger', 'Toad', 'Toucan', 'Turkey', 'Turtle',
  'Unicorn',
  'Vulture',
  'Walrus', 'Weasel', 'Whale', 'Wolf', 'Wolverine', 'Wombat', 'Woodpecker',
  'Yak',
  'Zebra'
];

// Track used anonymous names per room
const roomAnonymousNames = new Map(); // roomId -> Set(usedAnimalNames)

function getAvailableAnonymousName(roomId) {
  if (!roomAnonymousNames.has(roomId)) {
    roomAnonymousNames.set(roomId, new Set());
  }
  
  const usedNames = roomAnonymousNames.get(roomId);
  const availableAnimals = ANONYMOUS_ANIMALS.filter(animal => !usedNames.has(animal));
  
  if (availableAnimals.length === 0) {
    // All names used, generate numbered fallback
    let counter = 1;
    while (usedNames.has(`Anonymous ${counter}`)) {
      counter++;
    }
    const name = `Anonymous ${counter}`;
    usedNames.add(name);
    return name;
  }
  
  // Pick a random available animal
  const animal = availableAnimals[Math.floor(Math.random() * availableAnimals.length)];
  usedNames.add(animal);
  return `Anonymous ${animal}`;
}

function releaseAnonymousName(roomId, anonymousName) {
  if (roomAnonymousNames.has(roomId)) {
    // Extract animal name from "Anonymous X"
    const animal = anonymousName.replace('Anonymous ', '');
    roomAnonymousNames.get(roomId).delete(animal);
  }
}

export function setupSocketHandlers(io) {
  // Store io instance for external use
  ioInstance = io;
  
  // Apply IP moderation and authentication middleware
  io.use(socketIpBanMiddleware);
  io.use(socketAuthMiddleware);

  io.on('connection', async (socket) => {
    console.log(`User connected: ${socket.id}, userId: ${socket.userId}`);

    // Fetch user from database
    const user = await prisma.user.findUnique({
      where: { id: socket.userId },
      select: { id: true, username: true, avatar: true, mood: true, status: true },
    });

    if (!user) {
      socket.disconnect();
      return;
    }

    // Store user info on socket
    socket.user = user;
    socket.currentRoom = null;
    socket.isIncognito = false;
    socket.isAnonymous = false;
    socket.isRevealed = false;
    socket.anonymousName = null;

    if (socket.ipHash) {
      prisma.user.update({
        where: { id: user.id },
        data: { lastIpHash: socket.ipHash },
      }).catch((err) => console.error('Failed to update user IP hash:', err));
    }

    // Join personal room for DMs and friend notifications
    socket.join(`user:${user.id}`);

    // --- Global online presence ---
    const isFirstSocket = !globalOnlineUsers.has(user.id) || globalOnlineUsers.get(user.id).size === 0;
    if (!globalOnlineUsers.has(user.id)) {
      globalOnlineUsers.set(user.id, new Set());
    }
    globalOnlineUsers.get(user.id).add(socket.id);

    // Fetch friends and handle presence
    try {
      const friendships = await prisma.friendship.findMany({
        where: {
          status: 'accepted',
          OR: [{ requesterId: user.id }, { addresseeId: user.id }],
        },
      });
      const friendIds = friendships.map(f =>
        f.requesterId === user.id ? f.addresseeId : f.requesterId
      );
      socket.friendIds = friendIds; // Cache for disconnect

      // Notify friends that this user came online (only on first socket)
      if (isFirstSocket) {
        for (const friendId of friendIds) {
          io.to(`user:${friendId}`).emit('friend:online', { userId: user.id, mood: user.mood, status: user.status });
        }
      }

      // Send the user a list of which friends are currently online
      const onlineFriendIds = friendIds.filter(id =>
        globalOnlineUsers.has(id) && globalOnlineUsers.get(id).size > 0
      );
      socket.emit('friends:online:list', { onlineUserIds: onlineFriendIds });
    } catch (err) {
      console.error('Failed to fetch friends for presence:', err);
    }

    // Join a chat room
    socket.on('room:join', async (roomId) => {
      if (!rateLimitSocket(socket, 'room')) return;

      try {
        // Verify membership and get anonymous status
        const membership = await prisma.roomMember.findUnique({
          where: {
            userId_roomId: {
              userId: user.id,
              roomId,
            },
          },
        });

        if (!membership) {
          socket.emit('error', { message: 'Not a member of this room' });
          return;
        }

        // Leave previous room if any (silent — just switching rooms)
        if (socket.currentRoom) {
          leaveRoom(socket, io, { silent: true });
        }

        // Join new room
        socket.join(roomId);
        socket.currentRoom = roomId;

        // Fetch room to check room-level anonymous
        const room = await prisma.room.findUnique({ where: { id: roomId } });
        const isRoomAnonymous = room?.isAnonymous || false;

        // If revealed (during kick vote), can't be anonymous
        socket.isRevealed = membership.isRevealed;

        if (isRoomAnonymous && !membership.isRevealed) {
          // Room-level anonymous: forced for everyone
          socket.isAnonymous = true;
          if (membership.anonymousName) {
            // Reuse persisted name
            socket.anonymousName = membership.anonymousName;
            // Register it in the used-names set so it's not given to someone else
            if (!roomAnonymousNames.has(roomId)) roomAnonymousNames.set(roomId, new Set());
            const animal = membership.anonymousName.replace('Anonymous ', '');
            roomAnonymousNames.get(roomId).add(animal);
          } else {
            // Assign and persist a new name
            socket.anonymousName = getAvailableAnonymousName(roomId);
            await prisma.roomMember.update({
              where: { userId_roomId: { userId: user.id, roomId } },
              data: { anonymousName: socket.anonymousName },
            });
          }
        } else {
          // Per-user anonymous mode
          socket.isAnonymous = membership.isAnonymous && !membership.isRevealed;
          if (socket.isAnonymous) {
            // If the same user already has another socket in this room (second
            // tab), reuse its anonymous name instead of burning a new one.
            const existingEntry = Array.from(roomUsers.get(roomId)?.values() || [])
              .find((u) => u.userId === user.id && u.anonymousName);
            socket.anonymousName = existingEntry?.anonymousName || getAvailableAnonymousName(roomId);
          }
        }
        socket.isRoomAnonymous = isRoomAnonymous;

        // Track user in room
        if (!roomUsers.has(roomId)) {
          roomUsers.set(roomId, new Map());
        }
        
        const displayUser = socket.isAnonymous 
          ? { id: socket.id, username: socket.anonymousName, avatar: null, isAnonymous: true }
          : { id: socket.id, username: user.username, avatar: user.avatar, isAnonymous: false };
        
        roomUsers.get(roomId).set(socket.id, {
          socketId: socket.id,
          userId: user.id,
          username: displayUser.username,
          avatar: displayUser.avatar,
          isAnonymous: socket.isAnonymous,
          isRevealed: socket.isRevealed,
          anonymousName: socket.anonymousName,
          realUsername: user.username, // Keep for server reference
        });

        // Build online users list
        const onlineUsers = Array.from(roomUsers.get(roomId).values()).map((u) => ({
          id: u.isAnonymous ? u.socketId : u.userId,
          username: u.username,
          avatar: u.avatar,
          isAnonymous: u.isAnonymous,
        }));

        // Always update the online users list so everyone sees the user appear
        socket.to(roomId).emit('room:users:updated', { onlineUsers });

        // Send online users to the joining user
        // Fetch pinned messages for the room
        const pinnedMessages = await prisma.message.findMany({
          where: { roomId, isPinned: true },
          orderBy: { pinnedAt: 'desc' },
          include: {
            sender: { select: { id: true, username: true, avatar: true } },
          },
        });

        const formattedPins = pinnedMessages.map((m) => ({
          id: m.id,
          text: m.text,
          sender: m.sender,
          timestamp: m.createdAt.toISOString(),
          mediaUrl: m.mediaUrl,
          mediaType: m.mediaType,
        }));

        socket.emit('room:joined', {
          roomId,
          onlineUsers,
          isAnonymous: socket.isAnonymous,
          anonymousName: socket.anonymousName,
          isAnonymousRoom: isRoomAnonymous,
          maxMembers: room?.maxMembers || 5,
          cafeHoursEnabled: room?.cafeHoursEnabled || false,
          cafeHoursStart: room?.cafeHoursStart,
          cafeHoursEnd: room?.cafeHoursEnd,
          cafeHoursTimezone: room?.cafeHoursTimezone || null,
          pinnedMessages: formattedPins,
        });

        // Mark room as read when user joins
        await prisma.roomMember.update({
          where: { userId_roomId: { userId: user.id, roomId } },
          data: { lastReadAt: new Date() },
        });

        console.log(`${user.username} joined room ${roomId}${socket.isAnonymous ? ` as ${socket.anonymousName}` : ''}`);
      } catch (error) {
        console.error('Room join error:', error);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // Leave current room
    socket.on('room:leave', (data) => {
      const reason = typeof data === 'object' ? data?.reason : undefined;
      leaveRoom(socket, io, { silent: false, reason });
    });

    // Toggle anonymous mode
    socket.on('user:anonymous', async (enabled) => {
      if (!socket.currentRoom) {
        socket.emit('error', { message: 'Not in a room' });
        return;
      }

      // Can't toggle in room-level anonymous rooms
      if (socket.isRoomAnonymous) {
        socket.emit('error', { message: 'Cannot change anonymous mode in an anonymous room' });
        return;
      }

      // Can't go anonymous if revealed (during kick vote)
      if (enabled && socket.isRevealed) {
        socket.emit('error', { message: 'Cannot go anonymous while under kick vote' });
        return;
      }

      try {
        // Update in database
        await prisma.roomMember.update({
          where: {
            userId_roomId: {
              userId: user.id,
              roomId: socket.currentRoom,
            },
          },
          data: { isAnonymous: enabled },
        });

        const oldUsername = socket.isAnonymous ? socket.anonymousName : user.username;
        const oldUserId = socket.isAnonymous ? socket.id : user.id;

        // Release old anonymous name if going visible
        if (!enabled && socket.anonymousName) {
          releaseAnonymousName(socket.currentRoom, socket.anonymousName);
          socket.anonymousName = null;
        }
        
        // Get new anonymous name if going anonymous
        if (enabled && !socket.anonymousName) {
          socket.anonymousName = getAvailableAnonymousName(socket.currentRoom);
        }

        socket.isAnonymous = enabled;
        const newUsername = enabled ? socket.anonymousName : user.username;
        const newUserId = enabled ? socket.id : user.id;

        // Update in room tracking
        if (roomUsers.has(socket.currentRoom)) {
          const roomUser = roomUsers.get(socket.currentRoom).get(socket.id);
          if (roomUser) {
            roomUser.username = newUsername;
            roomUser.avatar = enabled ? null : user.avatar;
            roomUser.isAnonymous = enabled;
            roomUser.anonymousName = socket.anonymousName;
          }
        }

        // Notify the user
        socket.emit('user:anonymous:updated', {
          isAnonymous: enabled,
          anonymousName: socket.anonymousName,
        });

        // Update the online users list for everyone (no fake leave/join messages)
        const onlineUsers = Array.from(roomUsers.get(socket.currentRoom).values()).map((u) => ({
          id: u.isAnonymous ? u.socketId : u.userId,
          username: u.username,
          avatar: u.avatar,
          isAnonymous: u.isAnonymous,
        }));

        io.to(socket.currentRoom).emit('room:users:updated', { onlineUsers });

        console.log(`${user.username} ${enabled ? `went anonymous as ${socket.anonymousName}` : 'revealed identity'} in room ${socket.currentRoom}`);
      } catch (error) {
        console.error('Anonymous toggle error:', error);
        socket.emit('error', { message: 'Failed to toggle anonymous mode' });
      }
    });

    // Handle incoming messages
    socket.on('message:send', async (data = {}) => {
      if (!rateLimitSocket(socket, 'message')) return;

      if (!socket.currentRoom) {
        socket.emit('error', { message: 'Not in a room' });
        return;
      }

      const messageText = typeof data.text === 'string' ? data.text.trim() : '';
      const hasText = messageText.length > 0;
      const media = normalizeMediaPayload(data);
      if (!media) {
        socket.emit('error', { message: 'Invalid media attachment' });
        return;
      }

      const hasMedia = Boolean(media.mediaUrl);
      if (!hasText && !hasMedia) {
        socket.emit('error', { message: 'Message cannot be empty' });
        return;
      }

      // Validate message length
      if (messageText.length > 5000) {
        socket.emit('error', { message: 'Message too long (max 5000 characters)' });
        return;
      }

      if (hasText && rejectUnsafeText(socket, 'room-message', messageText, { maxLinks: 3, maxInviteLinks: 1 })) {
        return;
      }

      // Check cafe hours — block messages when the room is closed
      try {
        const room = await prisma.room.findUnique({ where: { id: socket.currentRoom } });
        if (room && !isCafeOpen(room)) {
          socket.emit('cafe:closed', {
            message: 'The cafe is currently closed. Come back during open hours!',
            start: room.cafeHoursStart,
            end: room.cafeHoursEnd,
            timezone: room.cafeHoursTimezone || 'UTC',
          });
          return;
        }
      } catch (err) {
        console.error('Cafe hours check error:', err);
      }

      try {
        const validReplyToId = await getValidRoomReplyToId(socket.currentRoom, data.replyToId);

        // Save message to database (always store real sender for moderation)
        const savedMessage = await prisma.message.create({
          data: {
            text: hasText ? messageText : '',
            senderId: user.id,
            roomId: socket.currentRoom,
            isEphemeral: socket.isIncognito || false,
            senderIpHash: socket.ipHash || null,
            mediaUrl: media.mediaUrl,
            mediaType: media.mediaType,
            mediaName: media.mediaName,
            replyToId: validReplyToId,
          },
          include: {
            sender: {
              select: { id: true, username: true, avatar: true },
            },
          },
        });

        // Prepare message for broadcast (hide identity if anonymous)
        const displaySender = socket.isAnonymous
          ? { id: `anon-${socket.id}`, username: socket.anonymousName, avatar: null }
          : savedMessage.sender;

        const message = {
          id: savedMessage.id,
          text: savedMessage.text,
          sender: displaySender,
          timestamp: savedMessage.createdAt.toISOString(),
          isEphemeral: savedMessage.isEphemeral,
          isAnonymous: socket.isAnonymous,
          mediaUrl: savedMessage.mediaUrl,
          mediaType: savedMessage.mediaType,
          mediaName: savedMessage.mediaName,
          replyTo: validReplyToId ? data.replyTo || null : null,
        };

        // Broadcast to room. realSenderId must never reach other clients for
        // anonymous messages — it deanonymizes the sender — so it only goes to
        // the sender's own socket (used for own-message detection client-side).
        if (socket.isAnonymous) {
          socket.to(socket.currentRoom).emit('message:received', message);
          socket.emit('message:received', { ...message, realSenderId: user.id });
        } else {
          io.to(socket.currentRoom).emit('message:received', { ...message, realSenderId: user.id });
        }

        // Notify all room members for unread count updates (including those not currently in the room)
        if (!savedMessage.isEphemeral) {
          const members = await prisma.roomMember.findMany({
            where: { roomId: socket.currentRoom },
            select: { userId: true },
          });
          for (const member of members) {
            if (member.userId !== user.id) {
              io.to(`user:${member.userId}`).emit('room:new:message', {
                roomId: socket.currentRoom,
                senderId: user.id,
              });
            }
          }
        }

        console.log(`[${socket.currentRoom}] ${socket.isAnonymous ? socket.anonymousName : user.username}: ${messageText}`);
      } catch (error) {
        console.error('Error saving message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle thread replies
    socket.on('thread:send', async (data = {}) => {
      if (!rateLimitSocket(socket, 'message')) return;

      if (!socket.currentRoom || !data.parentId) {
        socket.emit('error', { message: 'Missing thread parent' });
        return;
      }

      const messageText = typeof data.text === 'string' ? data.text.trim() : '';
      const hasText = messageText.length > 0;
      const media = normalizeMediaPayload(data);
      if (!media) {
        socket.emit('error', { message: 'Invalid media attachment' });
        return;
      }

      const hasMedia = Boolean(media.mediaUrl);
      if (!hasText && !hasMedia) {
        socket.emit('error', { message: 'Message cannot be empty' });
        return;
      }

      if (messageText.length > 5000) {
        socket.emit('error', { message: 'Message too long (max 5000 characters)' });
        return;
      }

      if (hasText && rejectUnsafeText(socket, 'thread-message', messageText, { maxLinks: 3, maxInviteLinks: 1 })) {
        return;
      }

      try {
        const parent = await prisma.message.findUnique({
          where: { id: data.parentId },
          select: { id: true, roomId: true, parentId: true, isDeleted: true },
        });

        if (!parent || parent.roomId !== socket.currentRoom || parent.parentId || parent.isDeleted) {
          socket.emit('error', { message: 'Invalid thread parent' });
          return;
        }

        const validReplyToId = await getValidRoomReplyToId(socket.currentRoom, data.replyToId);

        // Save thread reply
        const savedMessage = await prisma.message.create({
          data: {
            text: hasText ? messageText : '',
            senderId: user.id,
            roomId: socket.currentRoom,
            isEphemeral: socket.isIncognito || false,
            senderIpHash: socket.ipHash || null,
            mediaUrl: media.mediaUrl,
            mediaType: media.mediaType,
            mediaName: media.mediaName,
            replyToId: validReplyToId,
            parentId: data.parentId,
          },
          include: {
            sender: {
              select: { id: true, username: true, avatar: true },
            },
          },
        });

        // Increment thread count on parent
        const updated = await prisma.message.update({
          where: { id: data.parentId },
          data: { threadCount: { increment: 1 } },
          select: { threadCount: true },
        });

        const displaySender = socket.isAnonymous
          ? { id: `anon-${socket.id}`, username: socket.anonymousName, avatar: null }
          : savedMessage.sender;

        const threadMsg = {
          id: savedMessage.id,
          text: savedMessage.text,
          sender: displaySender,
          timestamp: savedMessage.createdAt.toISOString(),
          isEphemeral: savedMessage.isEphemeral,
          isAnonymous: socket.isAnonymous,
          mediaUrl: savedMessage.mediaUrl,
          mediaType: savedMessage.mediaType,
          mediaName: savedMessage.mediaName,
          replyTo: validReplyToId ? data.replyTo || null : null,
          parentId: data.parentId,
        };

        // Broadcast thread reply to room — same anonymity rule as message:send:
        // realSenderId only goes back to the sender's own socket.
        const threadPayload = { parentId: data.parentId, threadCount: updated.threadCount };
        if (socket.isAnonymous) {
          socket.to(socket.currentRoom).emit('thread:reply', { ...threadPayload, message: threadMsg });
          socket.emit('thread:reply', { ...threadPayload, message: { ...threadMsg, realSenderId: user.id } });
        } else {
          io.to(socket.currentRoom).emit('thread:reply', { ...threadPayload, message: { ...threadMsg, realSenderId: user.id } });
        }
      } catch (error) {
        console.error('Error saving thread reply:', error);
        socket.emit('error', { message: 'Failed to send thread reply' });
      }
    });

    // Handle whisper messages (private message within a room)
    socket.on('whisper:send', ({ targetUserId, text }) => {
      if (!rateLimitSocket(socket, 'whisper')) return;
      const messageText = typeof text === 'string' ? text.trim() : '';
      if (!socket.currentRoom || !targetUserId || !messageText) return;
      if (messageText.length > 1000) {
        socket.emit('error', { message: 'Whisper too long (max 1000 characters)' });
        return;
      }

      if (rejectUnsafeText(socket, 'whisper', messageText, { maxLinks: 1, maxInviteLinks: 0 })) {
        return;
      }

      const roomId = socket.currentRoom;
      const roomUserMap = roomUsers.get(roomId);
      if (!roomUserMap) return;

      const senderId = socket.isAnonymous ? socket.id : user.id;
      const senderName = socket.isAnonymous ? socket.anonymousName : user.username;

      const whisper = {
        id: `whisper-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'whisper',
        text: messageText,
        sender: { id: senderId, username: senderName },
        targetUserId,
        timestamp: new Date().toISOString(),
      };

      // Send to all sockets of the target user in this room
      for (const [sid, userData] of roomUserMap.entries()) {
        const uid = userData.isAnonymous ? userData.socketId : userData.userId;
        if (uid === targetUserId) {
          io.to(sid).emit('whisper:received', whisper);
        }
      }

      // Also send back to the sender
      socket.emit('whisper:received', whisper);
    });

    // Handle message reactions
    socket.on('reaction:toggle', async ({ messageId, emoji }) => {
      if (!rateLimitSocket(socket, 'reaction')) return;
      if (!socket.currentRoom || !messageId || !emoji) return;

      try {
        const message = await prisma.message.findUnique({
          where: { id: messageId },
          select: { roomId: true, isDeleted: true },
        });

        if (!message || message.roomId !== socket.currentRoom || message.isDeleted) return;

        // Check if reaction already exists
        const existing = await prisma.messageReaction.findUnique({
          where: {
            userId_messageId_emoji: {
              userId: user.id,
              messageId,
              emoji,
            },
          },
        });

        if (existing) {
          // Remove reaction
          await prisma.messageReaction.delete({ where: { id: existing.id } });
        } else {
          // Add reaction
          await prisma.messageReaction.create({
            data: { emoji, userId: user.id, messageId },
          });
        }

        // Fetch updated reactions for this message
        const reactions = await prisma.messageReaction.findMany({
          where: { messageId },
          select: { emoji: true, userId: true },
        });

        // Group reactions: { "👍": ["userId1", "userId2"], "❤️": ["userId3"] }
        const grouped = {};
        for (const r of reactions) {
          if (!grouped[r.emoji]) grouped[r.emoji] = [];
          grouped[r.emoji].push(r.userId);
        }

        // Broadcast to room
        io.to(socket.currentRoom).emit('reaction:updated', { messageId, reactions: grouped });
      } catch (error) {
        console.error('Reaction error:', error);
      }
    });

    // Handle pin/unpin messages
    socket.on('message:pin', async ({ messageId }) => {
      if (!socket.currentRoom) return;
      try {
        // Verify room ownership
        const room = await prisma.room.findUnique({ where: { id: socket.currentRoom } });
        if (!room || room.ownerId !== user.id) {
          socket.emit('error', { message: 'Only the room owner can pin messages' });
          return;
        }

        // Check current pin count
        const pinCount = await prisma.message.count({
          where: { roomId: socket.currentRoom, isPinned: true },
        });

        const msg = await prisma.message.findUnique({ where: { id: messageId } });
        if (!msg || msg.roomId !== socket.currentRoom) return;

        if (msg.isPinned) {
          // Unpin
          await prisma.message.update({
            where: { id: messageId },
            data: { isPinned: false, pinnedAt: null },
          });
        } else {
          // Pin — enforce max 3
          if (pinCount >= 3) {
            socket.emit('error', { message: 'Maximum 3 pinned messages. Unpin one first.' });
            return;
          }
          await prisma.message.update({
            where: { id: messageId },
            data: { isPinned: true, pinnedAt: new Date() },
          });
        }

        // Fetch updated pinned messages
        const pinned = await prisma.message.findMany({
          where: { roomId: socket.currentRoom, isPinned: true },
          orderBy: { pinnedAt: 'desc' },
          include: {
            sender: { select: { id: true, username: true, avatar: true } },
          },
        });

        const formatted = pinned.map((m) => ({
          id: m.id,
          text: m.text,
          sender: m.sender,
          timestamp: m.createdAt.toISOString(),
          mediaUrl: m.mediaUrl,
          mediaType: m.mediaType,
        }));

        io.to(socket.currentRoom).emit('message:pinned:updated', { pinned: formatted });
      } catch (error) {
        console.error('Pin error:', error);
      }
    });

    // Handle message editing
    socket.on('message:edit', async ({ messageId, text }) => {
      const messageText = typeof text === 'string' ? text.trim() : '';
      if (!socket.currentRoom || !messageId || !messageText) return;

      try {
        const msg = await prisma.message.findUnique({ where: { id: messageId } });
        if (!msg || msg.roomId !== socket.currentRoom) return;

        // Only the sender can edit their own message
        if (msg.senderId !== user.id) {
          socket.emit('error', { message: 'You can only edit your own messages' });
          return;
        }

        // Don't allow editing deleted messages
        if (msg.isDeleted) return;

        // Only allow editing within 15 minutes of sending
        const fifteenMin = 15 * 60 * 1000;
        if (Date.now() - new Date(msg.createdAt).getTime() > fifteenMin) {
          socket.emit('error', { message: 'Messages can only be edited within 15 minutes of sending' });
          return;
        }

        if (messageText.length > 5000) {
          socket.emit('error', { message: 'Message too long (max 5000 characters)' });
          return;
        }

        if (rejectUnsafeText(socket, 'message-edit', messageText, { maxLinks: 3, maxInviteLinks: 1 })) {
          return;
        }

        await prisma.message.update({
          where: { id: messageId },
          data: { text: messageText, isEdited: true },
        });

        io.to(socket.currentRoom).emit('message:edited', {
          messageId,
          text: messageText,
          isEdited: true,
        });
      } catch (error) {
        console.error('Edit message error:', error);
        socket.emit('error', { message: 'Failed to edit message' });
      }
    });

    // Handle message deletion
    socket.on('message:delete', async ({ messageId }) => {
      if (!socket.currentRoom || !messageId) return;

      try {
        const msg = await prisma.message.findUnique({ where: { id: messageId } });
        if (!msg || msg.roomId !== socket.currentRoom) return;

        // Sender can delete their own messages, room owner can delete any
        const room = await prisma.room.findUnique({ where: { id: socket.currentRoom } });
        if (msg.senderId !== user.id && room?.ownerId !== user.id) {
          socket.emit('error', { message: 'You can only delete your own messages' });
          return;
        }

        // Soft delete — keep the record but clear content
        await prisma.message.update({
          where: { id: messageId },
          data: { text: '', isDeleted: true, mediaUrl: null, mediaType: null, mediaName: null },
        });

        io.to(socket.currentRoom).emit('message:deleted', { messageId });
      } catch (error) {
        console.error('Delete message error:', error);
        socket.emit('error', { message: 'Failed to delete message' });
      }
    });

    // Handle ambient status
    socket.on('user:ambience', ({ trackId, emoji, name }) => {
      if (!socket.currentRoom) return;
      const userId = socket.isAnonymous ? socket.id : user.id;
      const username = socket.isAnonymous ? socket.anonymousName : user.username;
      // Broadcast to everyone in room (including sender, so all clients stay in sync)
      io.to(socket.currentRoom).emit('user:ambience:updated', {
        userId,
        username,
        trackId: trackId || null,
        emoji: emoji || null,
        name: name || null,
      });
    });

    // Drawing board — relay strokes to room
    socket.on('draw:line', (data) => {
      if (!rateLimitSocket(socket, 'draw')) return;
      if (!socket.currentRoom) return;
      if (!isValidDrawLine(data)) return;
      socket.to(socket.currentRoom).emit('draw:line', {
        x1: data.x1,
        y1: data.y1,
        x2: data.x2,
        y2: data.y2,
        color: data.color,
        size: data.size,
      });
    });

    socket.on('draw:clear', () => {
      if (!rateLimitSocket(socket, 'draw')) return;
      if (!socket.currentRoom) return;
      socket.to(socket.currentRoom).emit('draw:clear');
    });

    // Handle typing indicator
    socket.on('user:typing', (isTyping) => {
      if (!rateLimitSocket(socket, 'typing')) return;
      if (!socket.currentRoom) return;

      const displayName = socket.isAnonymous ? socket.anonymousName : user.username;
      socket.to(socket.currentRoom).emit('user:typing', {
        userId: socket.isAnonymous ? socket.id : user.id,
        username: displayName,
        isTyping,
      });
    });

    // Handle mood update broadcast to friends
    socket.on('user:mood:update', ({ mood } = {}) => {
      if (mood != null && !VALID_MOODS.has(mood)) return;
      if (socket.friendIds) {
        for (const friendId of socket.friendIds) {
          io.to(`user:${friendId}`).emit('friend:mood:updated', { userId: user.id, mood: mood || null });
        }
      }
    });

    // Handle status update broadcast to friends
    socket.on('user:status:update', ({ status } = {}) => {
      const normalizedStatus = normalizeStatus(status);
      if (socket.friendIds) {
        for (const friendId of socket.friendIds) {
          io.to(`user:${friendId}`).emit('friend:status:updated', { userId: user.id, status: normalizedStatus });
        }
      }
    });

    // Handle incognito mode toggle
    socket.on('user:incognito', (enabled) => {
      socket.isIncognito = enabled;
      socket.emit('user:incognito:updated', { isIncognito: enabled });
    });

    // Handle direct messages
    socket.on('dm:send', async (payload = {}) => {
      if (!rateLimitSocket(socket, 'dm')) return;
      const { receiverId, text, mediaUrl, mediaType, mediaName, replyToId, replyTo } = payload;
      const messageText = typeof text === 'string' ? text.trim() : '';

      try {
        if (messageText.length > 5000) {
          socket.emit('error', { message: 'Message too long (max 5000 characters)' });
          return;
        }
        const hasText = messageText.length > 0;
        const media = normalizeMediaPayload({ mediaUrl, mediaType, mediaName });
        if (!media) {
          socket.emit('error', { message: 'Invalid media attachment' });
          return;
        }

        const hasMedia = Boolean(media.mediaUrl);
        if ((!hasText && !hasMedia) || !receiverId) return;

        if (hasText && rejectUnsafeText(socket, 'direct-message', messageText, { maxLinks: 5, maxInviteLinks: 2 })) {
          return;
        }

        const conversationId = [user.id, receiverId].sort().join('_');

        if (!(await isAcceptedFriend(socket, receiverId))) {
          socket.emit('error', { message: 'Not friends with this user' });
          return;
        }

        const validReplyToId = await getValidDirectMessageReplyToId(conversationId, replyToId);

        const dm = await prisma.directMessage.create({
          data: {
            text: hasText ? messageText : '',
            conversationId,
            senderId: user.id,
            receiverId,
            senderIpHash: socket.ipHash || null,
            mediaUrl: media.mediaUrl,
            mediaType: media.mediaType,
            mediaName: media.mediaName,
            replyToId: validReplyToId,
          },
          include: {
            sender: { select: { id: true, username: true, avatar: true } },
          },
        });

        const message = {
          id: dm.id,
          text: dm.text,
          sender: dm.sender,
          receiverId,
          conversationId,
          timestamp: dm.createdAt.toISOString(),
          mediaUrl: dm.mediaUrl,
          mediaType: dm.mediaType,
          mediaName: dm.mediaName,
          replyTo: validReplyToId ? replyTo || null : null,
        };

        io.to(`user:${user.id}`).emit('dm:received', message);
        io.to(`user:${receiverId}`).emit('dm:received', message);

        // Create DM notification for receiver
        createNotification({
          userId: receiverId,
          type: 'dm',
          title: `Message from ${user.username}`,
          body: hasText ? (messageText.length > 100 ? messageText.slice(0, 100) + '...' : messageText) : `Sent a ${media.mediaType || 'file'}`,
          fromUserId: user.id,
          fromUsername: user.username,
        });
      } catch (error) {
        console.error('DM send error:', error);
        socket.emit('error', { message: 'Failed to send DM' });
      }
    });

    socket.on('dm:typing', async ({ receiverId, isTyping } = {}) => {
      if (!rateLimitSocket(socket, 'typing')) return;
      if (!receiverId) return;
      if (!(await isAcceptedFriend(socket, receiverId))) return;
      io.to(`user:${receiverId}`).emit('dm:typing', {
        senderId: user.id,
        username: user.username,
        isTyping,
      });
    });

    socket.on('dm:read', async ({ conversationId, senderId } = {}) => {
      if (!rateLimitSocket(socket, 'dm')) return;

      try {
        if (!senderId || conversationId !== conversationIdFor(user.id, senderId)) return;
        if (!(await isAcceptedFriend(socket, senderId))) return;

        await prisma.directMessage.updateMany({
          where: { conversationId, receiverId: user.id, read: false },
          data: { read: true },
        });
        io.to(`user:${senderId}`).emit('dm:read', { conversationId, readBy: user.id });
      } catch (error) {
        console.error('DM read error:', error);
      }
    });

    // ─── Room Voice Chat ───

    socket.on('voice:join', async () => {
      const roomId = socket.currentRoom;
      if (!roomId) {
        socket.emit('error', { message: 'Not in a room' });
        return;
      }

      // Check if room allows voice (only rooms with maxMembers <= 5)
      try {
        const room = await prisma.room.findUnique({ where: { id: roomId }, select: { maxMembers: true } });
        if (room && room.maxMembers > 5) {
          socket.emit('error', { message: 'Voice chat is disabled for large tables (10 members)' });
          return;
        }
      } catch (err) {
        console.error('Voice join room check error:', err);
      }

      if (!roomVoiceUsers.has(roomId)) {
        roomVoiceUsers.set(roomId, new Map());
      }

      const voiceUsers = roomVoiceUsers.get(roomId);
      if (voiceUsers.has(socket.id)) return; // already in voice

      const userInfo = {
        socketId: socket.id,
        userId: user.id,
        username: socket.isAnonymous ? socket.anonymousName : user.username,
        isMuted: false,
      };

      // Existing users before we add — they will create offers to us
      const existingUsers = Array.from(voiceUsers.values());

      voiceUsers.set(socket.id, userInfo);

      // Tell the joiner who's already in voice (they'll wait for offers)
      socket.emit('voice:joined', { users: existingUsers });

      // Tell each existing voice user to create an offer to the new joiner
      for (const existing of existingUsers) {
        io.to(existing.socketId).emit('voice:user-joined', userInfo);
      }

      // Broadcast updated voice user list to the entire room
      io.to(roomId).emit('voice:users-updated', {
        users: Array.from(voiceUsers.values()),
      });

      console.log(`${userInfo.username} joined voice in room ${roomId}`);
    });

    socket.on('voice:leave', () => {
      leaveVoice(socket, io);
    });

    socket.on('voice:signal', ({ targetSocketId, type, data } = {}) => {
      if (!rateLimitSocket(socket, 'call')) return;
      if (!canSignalVoicePeer(socket, targetSocketId)) return;
      // Relay WebRTC signaling to the target peer
      io.to(targetSocketId).emit('voice:signal', {
        fromSocketId: socket.id,
        fromUserId: user.id,
        type,
        data,
      });
    });

    socket.on('voice:toggle-mute', ({ isMuted }) => {
      const roomId = socket.currentRoom;
      if (!roomId || !roomVoiceUsers.has(roomId)) return;

      const voiceUser = roomVoiceUsers.get(roomId).get(socket.id);
      if (voiceUser) {
        voiceUser.isMuted = isMuted;
        io.to(roomId).emit('voice:users-updated', {
          users: Array.from(roomVoiceUsers.get(roomId).values()),
        });
      }
    });

    // ─── DM Calls (1-on-1 voice/video) ───

    socket.on('dm:call:initiate', async ({ receiverId, callType } = {}) => {
      if (!rateLimitSocket(socket, 'call')) return;
      if (!['voice', 'video'].includes(callType)) {
        socket.emit('error', { message: 'Invalid call type' });
        return;
      }

      // Verify friendship before allowing call
      if (!(await isAcceptedFriend(socket, receiverId))) {
        socket.emit('error', { message: 'Not friends with this user' });
        return;
      }

      const callId = getCallId(user.id, receiverId);
      pendingDMCalls.set(callId, {
        callType,
        callerId: user.id,
        receiverId,
        initiatedAt: Date.now(),
      });

      io.to(`user:${receiverId}`).emit('dm:call:incoming', {
        callerId: user.id,
        callerName: user.username,
        callType,
      });
    });

    socket.on('dm:call:accept', ({ callerId } = {}) => {
      if (!rateLimitSocket(socket, 'call')) return;
      const callId = getCallId(user.id, callerId);
      const pending = pendingDMCalls.get(callId);
      if (!pending || pending.receiverId !== user.id || pending.callerId !== callerId) return;

      pendingDMCalls.delete(callId);
      activeDMCalls.set(callId, {
        callType: pending.callType,
        callerId: pending.callerId,
        receiverId: pending.receiverId,
        startTime: Date.now(),
      });

      io.to(`user:${callerId}`).emit('dm:call:accepted', {
        acceptedBy: user.id,
      });
    });

    socket.on('dm:call:reject', ({ callerId } = {}) => {
      if (!rateLimitSocket(socket, 'call')) return;
      const callId = getCallId(user.id, callerId);
      const pending = pendingDMCalls.get(callId);
      if (!pending || pending.receiverId !== user.id || pending.callerId !== callerId) return;

      pendingDMCalls.delete(callId);
      saveCallMessage(pending.callerId, pending.receiverId, pending.callType, 'missed', 0);

      io.to(`user:${callerId}`).emit('dm:call:rejected', {
        rejectedBy: user.id,
      });
    });

    socket.on('dm:call:end', ({ targetUserId } = {}) => {
      if (!rateLimitSocket(socket, 'call')) return;
      const callId = getCallId(user.id, targetUserId);
      let shouldNotify = false;

      const active = activeDMCalls.get(callId);
      if (active) {
        activeDMCalls.delete(callId);
        const duration = Math.floor((Date.now() - active.startTime) / 1000);
        saveCallMessage(active.callerId, active.receiverId, active.callType, 'ended', duration);
        shouldNotify = true;
      } else {
        // Cancelling a pending/ringing call
        const pending = pendingDMCalls.get(callId);
        if (pending) {
          pendingDMCalls.delete(callId);
          saveCallMessage(pending.callerId, pending.receiverId, pending.callType, 'cancelled', 0);
          shouldNotify = true;
        }
      }

      if (targetUserId && shouldNotify) {
        io.to(`user:${targetUserId}`).emit('dm:call:ended', {
          endedBy: user.id,
        });
      }
    });

    socket.on('dm:call:signal', async ({ targetUserId, type, data } = {}) => {
      if (!rateLimitSocket(socket, 'call')) return;
      if (!targetUserId || !(await isAcceptedFriend(socket, targetUserId))) return;

      const callId = getCallId(user.id, targetUserId);
      if (!activeDMCalls.has(callId) && !pendingDMCalls.has(callId)) return;

      io.to(`user:${targetUserId}`).emit('dm:call:signal', {
        fromUserId: user.id,
        type,
        data,
      });
    });

    // ─── Empty Chair Events ───
    socket.on('emptychair:join', () => {
      if (!rateLimitSocket(socket, 'emptychair')) return;
      if (userEmptyChairSession.has(user.id)) {
        return socket.emit('emptychair:error', { message: 'Already in a session' });
      }
      if (emptyChairQueue.some((u) => u.userId === user.id)) {
        return socket.emit('emptychair:error', { message: 'Already in queue' });
      }
      emptyChairQueue.push({
        socketId: socket.id,
        userId: user.id,
        username: user.username,
        joinedAt: Date.now(),
      });
      socket.emit('emptychair:queued');
      tryMatchEmptyChair(io).catch((err) => console.error('Empty chair matching error:', err));
    });

    socket.on('emptychair:cancel', () => {
      if (!rateLimitSocket(socket, 'emptychair')) return;
      removeFromEmptyChairQueue(user.id);
      socket.emit('emptychair:cancelled');
    });

    socket.on('emptychair:message', ({ text } = {}) => {
      if (!rateLimitSocket(socket, 'emptychair')) return;
      const messageText = typeof text === 'string' ? text.trim() : '';
      if (!messageText) return;
      if (messageText.length > 500) {
        socket.emit('emptychair:error', { message: 'Message too long' });
        return;
      }

      if (rejectUnsafeText(socket, 'emptychair', messageText, { maxLinks: 1, maxInviteLinks: 0, errorEvent: 'emptychair:error' })) {
        return;
      }

      const sessionId = userEmptyChairSession.get(user.id);
      if (!sessionId) return;
      const session = emptyChairSessions.get(sessionId);
      if (!session) return;

      io.to(session.roomName).emit('emptychair:message', {
        text: messageText,
        senderId: user.id,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('emptychair:reveal', () => {
      if (!rateLimitSocket(socket, 'emptychair')) return;
      const sessionId = userEmptyChairSession.get(user.id);
      if (!sessionId) return;
      const session = emptyChairSessions.get(sessionId);
      if (!session) return;

      session.revealed.add(user.id);
      const partner = session.user1.userId === user.id ? session.user2 : session.user1;
      const partnerSocket = io.sockets.sockets.get(partner.socketId);
      if (partnerSocket) {
        partnerSocket.emit('emptychair:revealed', {
          userId: user.id,
          username: user.username,
        });
      }
    });

    // Mutual "+5 minutes" — session extends only when both people ask for it
    socket.on('emptychair:extend', () => {
      if (!rateLimitSocket(socket, 'emptychair')) return;
      const sessionId = userEmptyChairSession.get(user.id);
      if (!sessionId) return;
      const session = emptyChairSessions.get(sessionId);
      if (!session) return;

      if (session.extendVotes.has(user.id)) return; // already asked
      session.extendVotes.add(user.id);

      if (session.extendVotes.size >= 2) {
        // Both agreed — fresh 5 minutes from now
        clearTimeout(session.timer);
        session.timer = setTimeout(() => {
          endEmptyChairSession(io, sessionId, 'timeout');
        }, 5 * 60 * 1000);
        session.extendVotes.clear();
        io.to(session.roomName).emit('emptychair:extended', { duration: 300 });
      } else {
        const partner = session.user1.userId === user.id ? session.user2 : session.user1;
        const partnerSocket = io.sockets.sockets.get(partner.socketId);
        if (partnerSocket) partnerSocket.emit('emptychair:extend:requested');
        socket.emit('emptychair:extend:waiting');
      }
    });

    socket.on('emptychair:leave', () => {
      if (!rateLimitSocket(socket, 'emptychair')) return;
      const sessionId = userEmptyChairSession.get(user.id);
      if (sessionId) {
        endEmptyChairSession(io, sessionId, 'left');
      } else {
        removeFromEmptyChairQueue(user.id);
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      // Clean up empty chair
      removeFromEmptyChairQueue(user.id);
      const ecSessionId = userEmptyChairSession.get(user.id);
      if (ecSessionId) {
        endEmptyChairSession(io, ecSessionId, 'disconnected');
      }

      leaveRoom(socket, io, { silent: true });

      // End any active or pending DM calls this user is in
      for (const [callId, call] of activeDMCalls.entries()) {
        if (call.callerId === user.id || call.receiverId === user.id) {
          activeDMCalls.delete(callId);
          const duration = Math.floor((Date.now() - call.startTime) / 1000);
          saveCallMessage(call.callerId, call.receiverId, call.callType, 'ended', duration);
          const otherUserId = call.callerId === user.id ? call.receiverId : call.callerId;
          io.to(`user:${otherUserId}`).emit('dm:call:ended', { endedBy: user.id });
        }
      }
      for (const [callId, call] of pendingDMCalls.entries()) {
        if (call.callerId === user.id || call.receiverId === user.id) {
          pendingDMCalls.delete(callId);
          saveCallMessage(call.callerId, call.receiverId, call.callType, 'cancelled', 0);
          const otherUserId = call.callerId === user.id ? call.receiverId : call.callerId;
          io.to(`user:${otherUserId}`).emit('dm:call:ended', { endedBy: user.id });
        }
      }

      // Update global online presence
      const userSockets = globalOnlineUsers.get(user.id);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          globalOnlineUsers.delete(user.id);
          // Notify friends that this user went offline
          if (socket.friendIds) {
            for (const friendId of socket.friendIds) {
              io.to(`user:${friendId}`).emit('friend:offline', { userId: user.id });
            }
          }
        }
      }

      console.log(`${user.username} disconnected`);
    });
  });
}

function leaveVoice(socket, io, roomIdOverride) {
  const roomId = roomIdOverride || socket.currentRoom;
  if (!roomId || !roomVoiceUsers.has(roomId)) return;

  const voiceUsers = roomVoiceUsers.get(roomId);
  if (!voiceUsers.has(socket.id)) return;

  voiceUsers.delete(socket.id);

  // Tell others to close the peer connection for this user
  io.to(roomId).emit('voice:user-left', { socketId: socket.id });

  if (voiceUsers.size > 0) {
    io.to(roomId).emit('voice:users-updated', {
      users: Array.from(voiceUsers.values()),
    });
  } else {
    roomVoiceUsers.delete(roomId);
    io.to(roomId).emit('voice:users-updated', { users: [] });
  }
}

function leaveRoom(socket, io, { silent = false, reason } = {}) {
  const roomId = socket.currentRoom;
  if (!roomId) return;

  // Leave voice channel if in it
  leaveVoice(socket, io, roomId);

  socket.leave(roomId);

  // Release anonymous name — unless another socket of the same user (second
  // tab) is still in the room using it.
  if (socket.anonymousName) {
    const stillUsed = Array.from(roomUsers.get(roomId)?.values() || []).some(
      (u) => u.socketId !== socket.id && u.userId === socket.user.id && u.anonymousName === socket.anonymousName
    );
    if (!stillUsed) {
      releaseAnonymousName(roomId, socket.anonymousName);
    }
  }

  // Remove user from room tracking
  if (roomUsers.has(roomId)) {
    const roomUser = roomUsers.get(roomId).get(socket.id);
    const displayName = roomUser?.isAnonymous ? roomUser.anonymousName : socket.user.username;

    roomUsers.get(roomId).delete(socket.id);

    if (!silent) {
      // Only broadcast "user left" when they intentionally leave
      io.to(roomId).emit('user:left', {
        user: {
          id: roomUser?.isAnonymous ? socket.id : socket.user.id,
          username: displayName
        },
        onlineCount: roomUsers.get(roomId).size,
        reason: reason || null,
      });
    }

    // Always update online users list so the user disappears from the sidebar
    if (roomUsers.get(roomId).size > 0) {
      const onlineUsers = Array.from(roomUsers.get(roomId).values()).map((u) => ({
        id: u.isAnonymous ? u.socketId : u.userId,
        username: u.username,
        avatar: u.avatar,
        isAnonymous: u.isAnonymous,
      }));
      io.to(roomId).emit('room:users:updated', { onlineUsers });
    }

    // Clean up empty rooms
    if (roomUsers.get(roomId).size === 0) {
      roomUsers.delete(roomId);
      roomAnonymousNames.delete(roomId);
    }
  }

  socket.currentRoom = null;
  socket.anonymousName = null;
}
