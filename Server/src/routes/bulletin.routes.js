import { Router } from 'express';
import {
  getActiveBulletins,
  createBulletin,
  deleteBulletin,
  toggleStar,
} from '../controllers/bulletin.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/', getActiveBulletins);
router.post('/', createBulletin);
router.delete('/:bulletinId', deleteBulletin);
router.post('/:bulletinId/star', toggleStar);

export default router;
