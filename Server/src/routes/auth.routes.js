import { Router } from 'express';
import {
  register,
  login,
  getMe,
  requestPasswordReset,
  confirmPasswordReset,
  verifyEmail,
  resendVerification,
  completeOnboarding,
} from '../controllers/auth.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/password-reset/request', requestPasswordReset);
router.post('/password-reset/confirm', confirmPasswordReset);
router.post('/email/verify', verifyEmail);
router.get('/email/verify', verifyEmail);
router.post('/email/resend', resendVerification);
router.get('/me', authMiddleware, getMe);
router.post('/onboarding/complete', authMiddleware, completeOnboarding);

export default router;
