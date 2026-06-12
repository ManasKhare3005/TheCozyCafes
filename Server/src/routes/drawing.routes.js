import { Router } from 'express';
import {
  createDrawingGalleryItem,
  deleteDrawingGalleryItem,
  getDrawingGallery,
  getDrawingState,
} from '../controllers/drawing.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/rooms/:roomId/drawing', getDrawingState);
router.get('/rooms/:roomId/drawings', getDrawingGallery);
router.post('/rooms/:roomId/drawings', createDrawingGalleryItem);
router.delete('/rooms/:roomId/drawings/:drawingId', deleteDrawingGalleryItem);

export default router;
