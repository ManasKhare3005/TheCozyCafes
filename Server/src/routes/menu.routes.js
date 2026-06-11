import { Router } from 'express';
import { getTodaysMenu } from '../controllers/menu.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/today', authMiddleware, getTodaysMenu);

export default router;
