import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as c from '../controllers/shipmentController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { createShipmentSchema, listMineSchema, quoteSchema } from '../validators/shipment.js';

const router = Router();
const trackLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false, skip: () => process.env.NODE_ENV === 'test' });
const customer = [requireAuth, requireRole('customer')];

// Literal paths first so they aren't captured by /:id.
router.get('/track/:trackingId', trackLimiter, h(c.track));
router.post('/quote', ...customer, validate(quoteSchema), h(c.quote));
router.get('/mine', ...customer, validate(listMineSchema, 'query'), h(c.listMine));
router.post('/', ...customer, validate(createShipmentSchema), h(c.create));
router.get('/:id', requireAuth, h(c.getOne));
router.patch('/:id/cancel', ...customer, h(c.cancel));
router.get('/:id/invoice', requireAuth, requireRole('customer', 'admin'), h(c.invoice)); // FR-14

export default router;
