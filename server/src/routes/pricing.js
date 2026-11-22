import { Router } from 'express';
import { getActiveRule } from '../services/pricing.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';

// Public: the current rates, so the landing-page calculator matches real quotes.
const router = Router();
router.get('/', h(async (_req, res) => {
  const r = await getActiveRule();
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ baseFare: r.baseFare, perKm: r.perKm, perKg: r.perKg, expressMultiplier: r.expressMultiplier });
}));
export default router;
