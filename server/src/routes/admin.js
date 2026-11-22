import { Router } from 'express';
import * as c from '../controllers/adminController.js';
import * as d from '../controllers/documentController.js';
import { documentUpload } from '../middleware/upload.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { fleetSnapshot } from '../services/liveTracking.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { documentSchema, ticketUpdateSchema } from '../validators/chat.js';
import { assignSchema, createDriverSchema, listDriversSchema, listShipmentsSchema, pricingSchema, updateDriverSchema } from '../validators/admin.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/fleet', h(async (_req, res) => res.json({ drivers: await fleetSnapshot() }))); // FR-36
router.get('/drivers', validate(listDriversSchema, 'query'), h(c.listDrivers));
router.post('/drivers', validate(createDriverSchema), h(c.createDriver));
router.patch('/drivers/:id', validate(updateDriverSchema), h(c.updateDriver));
router.get('/shipments', validate(listShipmentsSchema, 'query'), h(c.listShipments));
router.get('/shipments/:id/candidates', h(c.candidates));
router.patch('/shipments/:id/assign', validate(assignSchema), h(c.assign));
router.post('/shipments/:id/auto-assign', h(c.autoAssignOne));
router.get('/stats', h(c.stats));
router.get('/pricing', h(c.getPricing));
router.put('/pricing', validate(pricingSchema), h(c.updatePricing));
router.get('/forecast', h(c.demandForecast));
router.get('/ml/model', h(c.modelInfo));
router.post('/ml/train', h(c.retrainModel));
// FR-35: chatbot knowledge base; FR-50/52: tickets and ratings
router.get('/documents', h(d.listDocuments));
router.post('/documents', documentUpload, validate(documentSchema), h(d.uploadDocument));
router.post('/documents/:id/reindex', h(d.reindexDocument));
router.delete('/documents/:id', h(d.deleteDocument));
router.get('/chat/overview', h(d.chatOverview));
router.patch('/tickets/:id', validate(ticketUpdateSchema), h(d.updateTicket));

export default router;
