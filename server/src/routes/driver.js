import { Router } from 'express';
import * as c from '../controllers/driverController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { proofUpload } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { deliverSchema, dutySchema, historySchema, statusSchema } from '../validators/driver.js';

const router = Router();
router.use(requireAuth, requireRole('driver'));

router.get('/me', h(c.me));
router.patch('/duty', validate(dutySchema), h(c.setDuty));
router.get('/shipments/today', h(c.today));
router.patch('/shipments/:id/status', validate(statusSchema), h(c.updateStatus));
router.post('/shipments/:id/deliver', proofUpload, validate(deliverSchema), h(c.deliver));
router.get('/history', validate(historySchema, 'query'), h(c.history));

export default router;
