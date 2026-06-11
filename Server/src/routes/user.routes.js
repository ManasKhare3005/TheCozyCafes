import { Router } from 'express';
import {
  updateMood,
  updateStatus,
  updateProfile,
  getProfile,
  exportMyData,
  deleteMyAccount,
} from '../controllers/user.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authMiddleware);

router.patch('/mood', updateMood);
router.patch('/status', updateStatus);
router.patch('/profile', updateProfile);
router.get('/me/export', exportMyData);
router.delete('/me', deleteMyAccount);
router.get('/:userId/profile', getProfile);

export default router;
