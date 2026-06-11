import { Router } from 'express';
import { getConfessions, createConfession } from '../controllers/confession.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/rooms/:roomId/confessions', getConfessions);
router.post('/rooms/:roomId/confessions', createConfession);

export default router;
