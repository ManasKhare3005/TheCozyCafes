import { Router } from 'express';
import { getMessages, getThreadMessages, searchMessages } from '../controllers/message.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/room/:roomId/search', authMiddleware, searchMessages);
router.get('/room/:roomId', authMiddleware, getMessages);
router.get('/:messageId/thread', authMiddleware, getThreadMessages);

export default router;
