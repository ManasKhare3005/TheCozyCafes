import { Router } from 'express';
import {
  getPosts,
  createPost,
  getReplies,
  createReply,
  resolvePost,
} from '../controllers/lostfound.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/', getPosts);
router.post('/', createPost);
router.get('/:postId/replies', getReplies);
router.post('/:postId/replies', createReply);
router.patch('/:postId/resolve', resolvePost);

export default router;
