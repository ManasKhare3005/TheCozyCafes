import prisma from './prisma.js';

export async function findBlockBetween(userId1, userId2, client = prisma) {
  if (!userId1 || !userId2 || userId1 === userId2) return null;

  return client.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: userId1, blockedId: userId2 },
        { blockerId: userId2, blockedId: userId1 },
      ],
    },
  });
}

export async function isBlockedBetween(userId1, userId2, client = prisma) {
  return Boolean(await findBlockBetween(userId1, userId2, client));
}
