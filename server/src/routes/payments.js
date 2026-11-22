import { Router } from 'express';
import * as c from '../controllers/paymentController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { createOrderSchema, failedSchema, verifySchema } from '../validators/payments.js';

const router = Router();
const customer = [requireAuth, requireRole('customer')];

router.post('/webhook', h(c.webhook)); // provider → us; authenticated by signature, not a user token
router.get('/config', requireAuth, c.config);
router.post('/create-order', ...customer, validate(createOrderSchema), h(c.create));
router.post('/verify', ...customer, validate(verifySchema), h(c.verify));
router.post('/failed', ...customer, validate(failedSchema), h(c.failed));

export default router;
