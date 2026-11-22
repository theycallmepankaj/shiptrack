import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { Shipment } from '../models/Shipment.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { bookingConfirmationEmail, sendEmail } from './email.js';
import { invoiceNumber, renderInvoice } from './invoice.js';
import { notify } from './notifications.js';
import { changeStatus } from './shipmentStatus.js';

// Razorpay in test mode (FR-13/14). Without keys, development uses a mock checkout that
// behaves the same way (order → pay → verify) but moves no money. Production requires keys.

const RZP = 'https://api.razorpay.com/v1';
export const paymentProvider = () => (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET ? 'razorpay' : 'mock');

async function razorpay(path, body) {
  const res = await fetch(`${RZP}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(502, `Payment provider error: ${data?.error?.description ?? res.status}`);
  return data;
}

const safeEqualHex = (a, b) => {
  const x = Buffer.from(String(a ?? ''), 'utf8');
  const y = Buffer.from(String(b ?? ''), 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
};
const hmac = (secret, data) => createHmac('sha256', secret).update(data).digest('hex');

export const canPay = (s) => s.status === 'BOOKED' && ['pending', 'failed'].includes(s.payment?.status);

/** POST /create-order: one provider order per attempt; amount always comes from the server's price. */
export async function createOrder(shipment) {
  if (!canPay(shipment)) throw ApiError.badRequest(shipment.payment?.status === 'paid' ? 'This shipment is already paid' : 'This shipment can’t be paid any more');
  const provider = paymentProvider();
  const amount = shipment.price.total;
  let orderId;
  if (provider === 'razorpay') {
    const order = await razorpay('/orders', { amount: Math.round(amount * 100), currency: 'INR', receipt: shipment.trackingId, notes: { shipmentId: shipment._id.toString() } });
    orderId = order.id;
  } else {
    orderId = `order_mock_${randomBytes(9).toString('hex')}`;
  }
  shipment.payment = { provider, orderId, status: 'pending', amount };
  await shipment.save();
  return { provider, orderId, amount, currency: 'INR', keyId: provider === 'razorpay' ? env.RAZORPAY_KEY_ID : null };
}

/** Checkout callback signature: HMAC-SHA256(order_id|payment_id, key secret). The mock accepts its own marker. */
export function verifyCheckoutSignature(provider, orderId, paymentId, signature) {
  if (provider === 'mock') return env.NODE_ENV !== 'production' && signature === 'mock' && /^pay_mock_[a-z0-9]+$/i.test(paymentId);
  return safeEqualHex(hmac(env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`), signature);
}

/** Webhook signature: HMAC-SHA256(raw body, webhook secret). */
export const verifyWebhookSignature = (raw, signature) => !!env.RAZORPAY_WEBHOOK_SECRET && safeEqualHex(hmac(env.RAZORPAY_WEBHOOK_SECRET, raw), signature);

/**
 * Marks a shipment paid — from the checkout callback or the webhook, whichever arrives first.
 * Atomic and idempotent: only the first caller sends the confirmation email + invoice.
 */
export async function markPaid(orderId, { paymentId, method } = {}) {
  const s = await Shipment.findOneAndUpdate(
    { 'payment.orderId': orderId, 'payment.status': { $in: ['pending', 'failed'] } },
    { $set: { 'payment.status': 'paid', 'payment.paymentId': paymentId, 'payment.method': method ?? null, 'payment.paidAt': new Date(), 'payment.failureReason': null } },
    { new: true },
  );
  if (!s) return { shipment: await Shipment.findOne({ 'payment.orderId': orderId }), first: false };
  afterPayment(s);
  return { shipment: s, first: true };
}

/** FR-14/38: confirmation email with the PDF invoice attached, plus an in-app notification. Never throws. */
function afterPayment(s) {
  notify(s.customerId, { type: 'payment', title: 'Payment received — booking confirmed', message: `₹${s.price.total} paid for ${s.trackingId}. Your invoice is ready to download.`, shipmentId: s._id, link: `/app/shipments/${s._id}` });
  (async () => {
    const user = await User.findById(s.customerId);
    if (!user) return;
    const pdf = await renderInvoice(s, user);
    const mail = bookingConfirmationEmail(user.name, s, `${env.CLIENT_URL.split(',')[0]}/track/${s.trackingId}`);
    await sendEmail({ to: user.email, ...mail, attachments: [{ filename: `${invoiceNumber(s)}.pdf`, content: pdf, contentType: 'application/pdf' }] });
  })().catch((err) => logger.error('Confirmation email failed:', err.message));
}

export async function markFailed(orderId, reason) {
  const s = await Shipment.findOneAndUpdate(
    { 'payment.orderId': orderId, 'payment.status': 'pending' },
    { $set: { 'payment.status': 'failed', 'payment.failureReason': String(reason ?? 'Payment failed').slice(0, 200) } },
    { new: true },
  );
  if (s) notify(s.customerId, { type: 'payment', title: 'Payment didn’t go through', message: `Your booking ${s.trackingId} is saved — try paying again within ${env.PAYMENT_TIMEOUT_MIN} minutes.`, shipmentId: s._id, link: `/app/shipments/${s._id}` });
  return s;
}

/** Full refund (FR-15 cancel before pickup). Razorpay refunds asynchronously; we record it as started. */
export async function refund(s) {
  if (s.payment?.status !== 'paid') return s;
  if (s.payment.provider === 'razorpay') {
    const r = await razorpay(`/payments/${s.payment.paymentId}/refund`, { notes: { trackingId: s.trackingId } });
    s.payment.refundId = r.id;
  } else {
    s.payment.refundId = `rfnd_mock_${randomBytes(6).toString('hex')}`;
  }
  s.payment.status = 'refunded';
  s.payment.refundedAt = new Date();
  return s;
}

/** Cancels bookings nobody paid for within PAYMENT_TIMEOUT_MIN, so they never reach a driver. */
export async function expireUnpaid(now = Date.now()) {
  const cutoff = new Date(now - env.PAYMENT_TIMEOUT_MIN * 60_000);
  const stale = await Shipment.find({ status: 'BOOKED', 'payment.status': { $in: ['pending', 'failed'] }, createdAt: { $lt: cutoff } }).limit(200);
  for (const s of stale) {
    s.payment.status = 'cancelled';
    s.cancelledAt = new Date();
    await changeStatus(s, 'CANCELLED', { role: 'system', note: `Not paid within ${env.PAYMENT_TIMEOUT_MIN} minutes` }).catch((err) => logger.warn(`expire ${s.trackingId}: ${err.message}`));
  }
  return stale.length;
}
