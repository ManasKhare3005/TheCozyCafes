import { Router } from 'express';
import { getBookmarks, createBookmark, deleteBookmark } from '../controllers/bookmark.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/rooms/:roomId/bookmarks', getBookmarks);
router.post('/rooms/:roomId/bookmarks', createBookmark);
router.delete('/rooms/:roomId/bookmarks/:bookmarkId', deleteBookmark);

export default router;
