import { Router } from 'express';
import { chatShipment } from '../controllers/internalController.js';
import { requireInternalKey } from '../middleware/internalKey.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';

const router = Router();
router.use(requireInternalKey);
router.get('/chat/shipment', h(chatShipment));

export default router;
