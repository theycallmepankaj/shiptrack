import { Router } from 'express';
import * as c from '../controllers/chatController.js';
import { optionalAuth } from '../middleware/optionalAuth.js';
import { chatLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { historySchema, ratingSchema, ticketSchema } from '../validators/chat.js';

// Messages themselves go over Socket.io (`/chat` namespace, FR-49); these are the REST helpers.
const router = Router();
router.use(chatLimiter, optionalAuth);
router.get('/history', validate(historySchema, 'query'), h(c.history));
router.patch('/messages/:id/rating', validate(ratingSchema), h(c.rate));
router.post('/tickets', validate(ticketSchema), h(c.createTicket));

export default router;
