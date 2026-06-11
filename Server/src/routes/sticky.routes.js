import { Router } from 'express';
import {
  getStickyNotes,
  createStickyNote,
  deleteStickyNote,
  reportStickyNote,
  getCooldownStatus,
} from '../controllers/sticky.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/', getStickyNotes);
router.post('/', createStickyNote);
router.get('/cooldown', getCooldownStatus);
router.delete('/:noteId', deleteStickyNote);
router.post('/:noteId/report', reportStickyNote);

export default router;
