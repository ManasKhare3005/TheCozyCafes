import { Router } from 'express';
import { createScheduledMessage, getScheduledMessages, cancelScheduledMessage } from '../controllers/scheduled.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/', authMiddleware, createScheduledMessage);
router.get('/', authMiddleware, getScheduledMessages);
router.post('/:id/cancel', authMiddleware, cancelScheduledMessage);

export default router;
