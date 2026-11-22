import mongoose from 'mongoose';
import { Shipment } from '../models/Shipment.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { generateTrackingId, TRACKING_ID_RE } from '../utils/trackingId.js';
import { computePrice, getActiveRule, roadDistanceKm } from '../services/pricing.js';
import { predictEta } from '../services/eta.js';
import { ACTIVE_STATUSES, changeStatus } from '../services/shipmentStatus.js';
import { driverView, listItemView, ownerView, publicView } from '../services/shipmentViews.js';
import { currentOtp } from '../services/otp.js';
import { liveInfoFor } from '../services/liveTracking.js';
import { invoiceNumber, renderInvoice } from '../services/invoice.js';
import { refund } from '../services/payments.js';

const MIN_DISTANCE_KM = 0.3;

async function buildQuote(pickup, drop, pkg, city, dropCity) {
  const distanceKm = roadDistanceKm(pickup, drop);
  if (distanceKm < MIN_DISTANCE_KM) throw ApiError.badRequest('Pickup and drop are the same place');
  const rule = await getActiveRule();
  const [standard, express] = await Promise.all(
    ['standard', 'express'].map(async (speed) => {
      const eta = await predictEta({ distanceKm, weightKg: pkg.weightKg, speed, city, dropCity });
      return { price: computePrice({ distanceKm, weightKg: pkg.weightKg, dimensions: pkg.dimensions, speed }, rule), eta };
    }),
  );
  return { distanceKm, standard, express };
}

const quoteOption = ({ price, eta }) => ({ price, etaHours: eta.hours, estimatedDeliveryAt: eta.estimatedDeliveryAt });

// POST /api/shipments/quote — FR-11/12: both speeds at once so the UI can compare them.
export async function quote(req, res) {
  const { pickup, drop, package: pkg } = req.body;
  const q = await buildQuote(pickup, drop, pkg, req.body.pickup.city, req.body.drop.city);
  res.json({ distanceKm: q.distanceKm, options: { standard: quoteOption(q.standard), express: quoteOption(q.express) } });
}

const toStop = (s) => ({
  address: s.address,
  city: s.city,
  location: { type: 'Point', coordinates: [s.lng, s.lat] },
  contactName: s.contactName,
  contactPhone: s.contactPhone,
});

// POST /api/shipments — prices are recomputed server-side; the client's numbers are never trusted.
export async function create(req, res) {
  const { pickup, drop, package: pkg, speed } = req.body;
  const q = await buildQuote(pickup, drop, pkg, pickup.city, drop.city);
  const chosen = q[speed];

  let shipment;
  for (let attempt = 0; attempt < 5 && !shipment; attempt++) {
    try {
      shipment = await Shipment.create({
        trackingId: generateTrackingId(),
        customerId: req.user.id,
        pickup: toStop(pickup),
        drop: toStop(drop),
        package: pkg,
        speed,
        price: chosen.price,
        distanceKm: q.distanceKm,
        estimatedDeliveryAt: chosen.eta.estimatedDeliveryAt,
        promisedDeliveryAt: chosen.eta.estimatedDeliveryAt,
        etaSource: chosen.eta.source,
        status: 'BOOKED',
        statusHistory: [{ status: 'BOOKED', at: new Date(), by: req.user.id, byRole: 'customer', note: 'Shipment booked' }],
        payment: { provider: 'none', status: 'pending', amount: chosen.price.total }, // paid via /api/payments
      });
    } catch (err) {
      if (err?.code !== 11000) throw err; // retry only on tracking-ID collision
    }
  }
  if (!shipment) throw new Error('Could not generate a unique tracking ID');

  // The confirmation email + invoice go out once it's paid (services/payments.js).
  res.status(201).json({ shipment: ownerView(shipment) });
}

const STATUS_GROUPS = {
  active: ACTIVE_STATUSES,
  delivered: ['DELIVERED'],
  cancelled: ['CANCELLED', 'RETURNED'],
};

// GET /api/shipments/mine
export async function listMine(req, res) {
  const { status, q, page, limit } = req.query;
  const customerId = new mongoose.Types.ObjectId(req.user.id);
  const filter = { customerId };
  if (status !== 'all') filter.status = { $in: STATUS_GROUPS[status] };
  if (q) filter.trackingId = { $regex: `^${q.toUpperCase().replace(/[^A-Z0-9-]/g, '')}` };

  const [items, total, [summary]] = await Promise.all([
    Shipment.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Shipment.countDocuments(filter),
    Shipment.aggregate([
      { $match: { customerId } },
      {
        $group: {
          _id: null,
          active: { $sum: { $cond: [{ $in: ['$status', ACTIVE_STATUSES] }, 1, 0] } },
          delivered: { $sum: { $cond: [{ $eq: ['$status', 'DELIVERED'] }, 1, 0] } },
          spent: { $sum: { $cond: [{ $in: ['$status', ['CANCELLED']] }, 0, '$price.total'] } },
        },
      },
    ]),
  ]);

  res.json({
    items: items.map(listItemView),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    summary: { active: summary?.active ?? 0, delivered: summary?.delivered ?? 0, spent: summary?.spent ?? 0 },
  });
}

/** Loads a shipment the current user may see; 404 (not 403) otherwise, so IDs can't be probed. */
export async function findAccessible(id, user) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Shipment not found');
  const s = await Shipment.findById(id);
  const allowed =
    s &&
    (user.role === 'admin' ||
      (user.role === 'customer' && s.customerId.equals(user.id)) ||
      (user.role === 'driver' && s.driverId?.equals(user.id)));
  if (!allowed) throw ApiError.notFound('Shipment not found');
  return s;
}

// GET /api/shipments/:id
export async function getOne(req, res) {
  const s = await findAccessible(req.params.id, req.user);
  if (req.user.role === 'driver') return res.json({ shipment: driverView(s) });
  const view = { ...ownerView(s), ...(await liveInfoFor(s)) }; // FR-19/22: driver + live position, owner/admin only
  // FR-28: the owner sees the handover code while the parcel is out for delivery.
  if (req.user.role === 'customer' && s.status === 'OUT_FOR_DELIVERY') view.deliveryOtp = currentOtp(s);
  res.json({ shipment: view });
}

// PATCH /api/shipments/:id/cancel — FR-15: only before pickup; refund status recorded.
export async function cancel(req, res) {
  const s = await findAccessible(req.params.id, req.user);
  if (!s.customerId.equals(req.user.id)) throw ApiError.notFound('Shipment not found');
  if (!['BOOKED', 'ASSIGNED'].includes(s.status)) throw ApiError.badRequest('This shipment has already been picked up and can’t be cancelled');
  if (s.payment.status === 'paid') await refund(s); // full refund before pickup (throws if the provider refuses)
  else s.payment.status = 'cancelled';
  s.cancelledAt = new Date();
  const reason = req.body?.reason?.toString().slice(0, 200);
  await changeStatus(s, 'CANCELLED', { by: req.user.id, role: 'customer', note: reason ? `Cancelled by customer: ${reason}` : 'Cancelled by customer' });
  res.json({ shipment: ownerView(s) });
}

// GET /api/shipments/track/:trackingId — FR-18: public, limited data.
export async function track(req, res) {
  const trackingId = req.params.trackingId.toUpperCase();
  if (!TRACKING_ID_RE.test(trackingId)) throw ApiError.notFound('No shipment found with that tracking ID');
  const s = await Shipment.findOne({ trackingId });
  if (!s) throw ApiError.notFound('No shipment found with that tracking ID');
  res.json({ shipment: publicView(s) });
}

// GET /api/shipments/:id/invoice — FR-14: PDF for the owner or an admin, once paid.
export async function invoice(req, res) {
  const s = await findAccessible(req.params.id, req.user);
  if (!['paid', 'refunded'].includes(s.payment?.status)) throw ApiError.badRequest('The invoice is available once the shipment is paid');
  const customer = await User.findById(s.customerId).select('name email phone');
  const pdf = await renderInvoice(s, customer);
  res.set({
    'content-type': 'application/pdf',
    'content-disposition': `attachment; filename="${invoiceNumber(s)}.pdf"`,
    'cache-control': 'private, no-store',
  });
  res.send(pdf);
}
