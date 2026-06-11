-- Run against a staging clone with realistic data:
-- psql "$DATABASE_URL" -f scripts/query-analysis.sql

\timing on

-- Latest room messages.
EXPLAIN ANALYZE
SELECT *
FROM messages
WHERE "roomId" = :'room_id'
  AND "isEphemeral" = false
  AND "isDeleted" = false
  AND "parentId" IS NULL
ORDER BY "createdAt" DESC
LIMIT 50;

-- Thread replies.
EXPLAIN ANALYZE
SELECT *
FROM messages
WHERE "parentId" = :'message_id'
ORDER BY "createdAt" ASC;

-- User rooms and unread-count support.
EXPLAIN ANALYZE
SELECT *
FROM room_members
WHERE "userId" = :'user_id'
ORDER BY "joinedAt" DESC;

-- Public room discovery.
EXPLAIN ANALYZE
SELECT *
FROM rooms
WHERE "isPrivate" = false
  AND "isLocked" = false
ORDER BY "createdAt" DESC
LIMIT 50;

-- Friend list by status.
EXPLAIN ANALYZE
SELECT *
FROM friendships
WHERE status = 'accepted'
  AND ("requesterId" = :'user_id' OR "addresseeId" = :'user_id');

-- Direct-message history.
EXPLAIN ANALYZE
SELECT *
FROM direct_messages
WHERE "conversationId" = :'conversation_id'
ORDER BY "createdAt" DESC
LIMIT 50;

-- Open moderation queue.
EXPLAIN ANALYZE
SELECT *
FROM moderation_reports
WHERE status = 'open'
ORDER BY "createdAt" DESC
LIMIT 100;
