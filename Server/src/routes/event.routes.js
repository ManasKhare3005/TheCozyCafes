import { Router } from 'express';
import { getEvents, createEvent, rsvpEvent, deleteEvent } from '../controllers/event.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/rooms/:roomId/events', getEvents);
router.post('/rooms/:roomId/events', createEvent);
router.post('/rooms/:roomId/events/:eventId/rsvp', rsvpEvent);
router.delete('/rooms/:roomId/events/:eventId', deleteEvent);

export default router;
