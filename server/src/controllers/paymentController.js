import { Shipment } from '../models/Shipment.js';
import { createOrder, markFailed, markPaid, paymentProvider, verifyCheckoutSignature, verifyWebhookSignature } from '../services/payments.js';
import { ownerView } from '../services/shipmentViews.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

async function ownShipment(id, userId) {
  const s = await Shipment.findOne({ _id: id, customerId: userId });
  if (!s) throw ApiError.notFound('Shipment not found');
  return s;
}

// GET /api/payments/config — which checkout the client should open.
export function config(_req, res) {
  res.json({ provider: paymentProvider() });
}

// POST /api/payments/create-order
export async function create(req, res) {
  const s = await ownShipment(req.body.shipmentId, req.user.id);
  res.json({ order: { ...(await createOrder(s)), trackingId: s.trackingId } });
}

// POST /api/payments/verify — checkout success callback; the signature proves the provider sent it.
export async function verify(req, res) {
  const { shipmentId, orderId, paymentId, signature, method } = req.body;
  const s = await ownShipment(shipmentId, req.user.id);
  if (s.payment?.orderId !== orderId) throw ApiError.badRequest('This payment doesn’t match the shipment’s order');
  if (!verifyCheckoutSignature(s.payment.provider, orderId, paymentId, signature)) throw ApiError.badRequest('Payment couldn’t be verified');
  const { shipment } = await markPaid(orderId, { paymentId, method });
  if (shipment.payment.status !== 'paid') throw ApiError.badRequest('This shipment can’t be marked paid');
  res.json({ shipment: ownerView(shipment) });
}

// POST /api/payments/failed — checkout reported a failure (card declined, etc.). Booking stays payable.
export async function failed(req, res) {
  const s = await ownShipment(req.body.shipmentId, req.user.id);
  if (s.payment?.orderId !== req.body.orderId) throw ApiError.badRequest('This payment doesn’t match the shipment’s order');
  const updated = (await markFailed(req.body.orderId, req.body.reason)) ?? s;
  res.json({ shipment: ownerView(updated) });
}

// POST /api/payments/webhook — Razorpay server-to-server events (backup for a closed browser).
export async function webhook(req, res) {
  if (!verifyWebhookSignature(req.rawBody ?? '', req.get('x-razorpay-signature'))) throw ApiError.unauthorized('Invalid webhook signature');
  const { event, payload } = req.body ?? {};
  const p = payload?.payment?.entity;
  try {
    if ((event === 'payment.captured' || event === 'order.paid') && p?.order_id) await markPaid(p.order_id, { paymentId: p.id, method: p.method });
    else if (event === 'payment.failed' && p?.order_id) await markFailed(p.order_id, p.error_description);
  } catch (err) {
    logger.error(`webhook ${event} failed: ${err.message}`);
    throw err; // non-2xx → Razorpay retries
  }
  res.json({ ok: true });
}
