import { Router } from 'express';
import { getNotifications, markAllRead, markRead } from '../controllers/notification.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/', getNotifications);
router.post('/read-all', markAllRead);
router.post('/:id/read', markRead);

export default router;
