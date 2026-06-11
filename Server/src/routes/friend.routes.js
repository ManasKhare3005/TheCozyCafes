import { Router } from 'express';
import {
  getFriends,
  getPendingRequests,
  sendFriendRequest,
  respondToRequest,
  removeFriend,
  searchUsers,
  getConversation,
  getConversationsList,
} from '../controllers/friend.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/', getFriends);
router.get('/requests', getPendingRequests);
router.get('/search', searchUsers);
router.get('/conversations', getConversationsList);
router.get('/dm/:friendId', getConversation);
router.post('/request', sendFriendRequest);
router.post('/request/:friendshipId/respond', respondToRequest);
router.delete('/:friendshipId', removeFriend);

export default router;
