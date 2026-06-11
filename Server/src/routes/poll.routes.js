import { Router } from 'express';
import { createPoll, votePoll, getRoomPolls } from '../controllers/poll.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authMiddleware);

router.post('/rooms/:roomId/polls', createPoll);
router.get('/rooms/:roomId/polls', getRoomPolls);
router.post('/polls/:pollId/vote', votePoll);

export default router;
