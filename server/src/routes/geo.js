import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as c from '../controllers/geoController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { geoReverseSchema, geoSearchSchema } from '../validators/shipment.js';

const router = Router();
const geoLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, skip: () => process.env.NODE_ENV === 'test' });

router.use(requireAuth, geoLimiter);
router.get('/search', validate(geoSearchSchema, 'query'), h(c.search));
router.get('/reverse', validate(geoReverseSchema, 'query'), h(c.reverse));

export default router;
