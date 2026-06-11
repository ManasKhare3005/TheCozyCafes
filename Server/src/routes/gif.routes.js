import { Router } from 'express';
import { searchGifs, trendingGifs } from '../controllers/gif.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/search', authMiddleware, searchGifs);
router.get('/trending', authMiddleware, trendingGifs);

export default router;
