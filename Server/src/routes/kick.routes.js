import { Router } from 'express';
import {
  adminKick,
  startVoteKick,
  castVote,
  getActiveVotes,
  getRoomMembers,
} from '../controllers/kick.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Admin kick
router.post('/rooms/:roomId/kick', adminKick);

// Vote kick
router.post('/rooms/:roomId/vote-kick', startVoteKick);
router.get('/rooms/:roomId/votes', getActiveVotes);
router.get('/rooms/:roomId/members', getRoomMembers);
router.post('/votes/:voteId/cast', castVote);

export default router;
