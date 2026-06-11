import { Router } from 'express';
import { chat, getHistory, clearHistory } from '../controllers/barista.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/chat', authMiddleware, chat);
router.get('/history', authMiddleware, getHistory);
router.delete('/history', authMiddleware, clearHistory);

export default router;
