import { Router } from 'express';
import { getLinkPreview } from '../controllers/linkpreview.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', authMiddleware, getLinkPreview);

export default router;
