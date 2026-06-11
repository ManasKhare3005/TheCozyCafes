import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import {
  createReport,
  getReports,
  updateReport,
  deleteReportedMessage,
  banReportedUser,
  setReportedRoomLock,
  banReportIp,
  listIpBans,
  createIpBan,
  deleteIpBan,
  blockUser,
  unblockUser,
  getBlockedUsers,
} from '../controllers/moderation.controller.js';

const router = Router();

router.use(authMiddleware);

router.post('/reports', createReport);
router.get('/reports', getReports);
router.patch('/reports/:reportId', updateReport);
router.post('/reports/:reportId/delete-message', deleteReportedMessage);
router.post('/reports/:reportId/ban-user', banReportedUser);
router.post('/reports/:reportId/room-lock', setReportedRoomLock);
router.post('/reports/:reportId/ip-ban', banReportIp);

router.get('/ip-bans', listIpBans);
router.post('/ip-bans', createIpBan);
router.delete('/ip-bans/:banId', deleteIpBan);

router.get('/blocks', getBlockedUsers);
router.post('/blocks', blockUser);
router.delete('/blocks/:blockedUserId', unblockUser);

export default router;
