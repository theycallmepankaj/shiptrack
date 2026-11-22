import { Router } from 'express';
import * as c from '../controllers/notificationController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { listNotificationsSchema } from '../validators/payments.js';

const router = Router();
router.use(requireAuth);
router.get('/', validate(listNotificationsSchema, 'query'), h(c.list));
router.patch('/read-all', h(c.markAllRead));
router.patch('/:id/read', h(c.markRead));

export default router;
