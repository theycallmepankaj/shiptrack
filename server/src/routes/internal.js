import { Router } from 'express';
import { chatShipment } from '../controllers/internalController.js';
import { requireInternalKey } from '../middleware/internalKey.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';

const router = Router();
router.use(requireInternalKey);
router.get('/chat/shipment', h(chatShipment));
// Spec path (§7): GET /internal/shipments/:trackingId?userId=
router.get('/shipments/:trackingId', (req, _res, next) => {
  req.query = { ...req.query, trackingId: req.params.trackingId };
  next();
}, h(chatShipment));

export default router;
