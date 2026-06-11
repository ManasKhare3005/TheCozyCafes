import { Router } from 'express';
import { getMyBadges, getUserBadges, getAllBadges } from '../controllers/badge.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/me', getMyBadges);
router.get('/all', getAllBadges);
router.get('/user/:userId', getUserBadges);

export default router;
