import { Router } from 'express';
import {
  getMyRooms,
  getPublicRooms,
  getRoom,
  createRoom,
  joinRoomSecure as joinRoom,
  joinByCodeSecure as joinByCode,
  leaveRoom,
  deleteRoom,
  toggleAnonymous,
} from '../controllers/room.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

router.get('/', getMyRooms);
router.get('/public', getPublicRooms);
router.post('/', createRoom);
router.post('/join-by-code', joinByCode);
router.get('/:roomId', getRoom);
router.post('/:roomId/join', joinRoom);
router.post('/:roomId/leave', leaveRoom);
router.post('/:roomId/anonymous', toggleAnonymous);
router.delete('/:roomId', deleteRoom);

export default router;
