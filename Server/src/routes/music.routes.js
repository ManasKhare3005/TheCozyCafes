import { Router } from 'express';
import { getQueue, addTrack, skipTrack, trackEnded, removeTrack } from '../controllers/music.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/rooms/:roomId/music', getQueue);
router.post('/rooms/:roomId/music', addTrack);
router.post('/rooms/:roomId/music/skip', skipTrack);
router.post('/rooms/:roomId/music/ended', trackEnded);
router.delete('/rooms/:roomId/music/:trackId', removeTrack);

export default router;
