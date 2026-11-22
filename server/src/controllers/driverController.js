import mongoose from 'mongoose';
import { Driver } from '../models/Driver.js';
import { Shipment } from '../models/Shipment.js';
import { ApiError } from '../utils/ApiError.js';
import { emitFleetUpdate } from '../sockets/index.js';
import { changeStatus } from '../services/shipmentStatus.js';
import { issueOtp, MAX_WRONG_TRIES, otpMatches } from '../services/otp.js';
import { optimizeRoute } from '../services/routing.js';
import { driverView } from '../services/shipmentViews.js';
import { storeImage } from '../services/storage.js';
import { FAILURE_REASONS } from '../validators/driver.js';

export const DRIVER_SHARE = 0.7; // driver payout per delivered shipment (placeholder until admin-configurable)
const ACTIVE = ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'FAILED_ATTEMPT'];
const DONE = ['DELIVERED', 'RETURNED'];
const IST_MS = 5.5 * 3600_000;

/** Start of today / this week (Mon) / this month in IST, as UTC Dates. */
export function istPeriodStarts(now = new Date()) {
  const ist = new Date(now.getTime() + IST_MS);
  const day = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_MS;
  const weekday = (ist.getUTCDay() + 6) % 7; // Monday = 0
  return {
    today: new Date(day),
    week: new Date(day - weekday * 86_400_000),
    month: new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST_MS),
  };
}

async function driverProfile(userId) {
  const d = await Driver.findOne({ userId });
  if (!d) throw ApiError.forbidden('Your driver profile isn’t set up yet. Contact an admin.');
  return d;
}

const toPoint = (loc) => (loc?.coordinates && (loc.coordinates[0] || loc.coordinates[1]) ? { lat: loc.coordinates[1], lng: loc.coordinates[0] } : null);
const profileView = (d) => ({
  isOnDuty: d.isOnDuty,
  vehicle: d.vehicle,
  rating: d.rating,
  totalDeliveries: d.totalDeliveries,
  location: toPoint(d.currentLocation),
  lastLocationAt: d.lastLocationAt,
});

async function myShipment(id, userId) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Shipment not found');
  const s = await Shipment.findOne({ _id: id, driverId: userId }).select('+deliveryOtpHash');
  if (!s) throw ApiError.notFound('Shipment not found');
  return s;
}

// GET /api/driver/me
export async function me(req, res) {
  res.json({ driver: profileView(await driverProfile(req.user.id)) });
}

// PATCH /api/driver/duty — FR-25
export async function setDuty(req, res) {
  const d = await driverProfile(req.user.id);
  d.isOnDuty = req.body.isOnDuty;
  if (req.body.lat != null && req.body.lng != null) {
    d.currentLocation = { type: 'Point', coordinates: [req.body.lng, req.body.lat] };
    d.lastLocationAt = new Date();
  }
  await d.save();
  const loc = toPoint(d.currentLocation);
  emitFleetUpdate({ driverId: req.user.id, lat: loc?.lat, lng: loc?.lng, isOnDuty: d.isOnDuty });
  res.json({ driver: profileView(d) });
}

// GET /api/driver/shipments/today — FR-26: active stops in visiting order + today's completed.
export async function today(req, res) {
  const d = await driverProfile(req.user.id);
  const { today: since } = istPeriodStarts();
  const [active, completed] = await Promise.all([
    Shipment.find({ driverId: req.user.id, status: { $in: ACTIVE } }),
    Shipment.find({ driverId: req.user.id, status: { $in: DONE }, updatedAt: { $gte: since } }).sort({ updatedAt: -1 }),
  ]);
  // Every stop still to visit: pickup + drop for uncollected parcels, the drop for the rest.
  const stops = active.flatMap((s) => {
    const kinds = s.status === 'ASSIGNED' ? ['pickup', 'drop'] : ['drop'];
    return kinds.map((kind) => {
      const stop = s[kind].toObject?.() ?? s[kind];
      return { id: `${s._id}:${kind}`, shipmentId: s._id.toString(), kind, lat: stop.location.coordinates[1], lng: stop.location.coordinates[0], s, stop };
    });
  });
  const route = await optimizeRoute(toPoint(d.currentLocation), stops);
  res.json({
    driver: profileView(d),
    route: { totalKm: route.totalKm, solver: route.solver, stops: route.ordered.length },
    stops: route.ordered.map((o, i) => ({
      sequence: i + 1,
      kind: o.kind,
      // A drop whose pickup is still ahead in this route.
      afterPickup: o.kind === 'drop' && o.s.status === 'ASSIGNED',
      address: o.stop.address,
      city: o.stop.city,
      lat: o.lat,
      lng: o.lng,
      contactName: o.stop.contactName,
      contactPhone: o.stop.contactPhone,
      shipment: driverView(o.s),
    })),
    completed: completed.map(driverView),
  });
}

function requireOnDuty(d) {
  if (!d.isOnDuty) throw new ApiError(409, 'Go on duty to update shipments');
}

// PATCH /api/driver/shipments/:id/status — FR-27 (delivery itself goes through /deliver)
export async function updateStatus(req, res) {
  const d = await driverProfile(req.user.id);
  requireOnDuty(d);
  const s = await myShipment(req.params.id, req.user.id);
  const { status, reason, note, lat, lng } = req.body;
  const location = lat != null && lng != null ? { lat, lng } : undefined;

  let historyNote = note;
  if (status === 'FAILED_ATTEMPT') {
    historyNote = reason === 'OTHER' ? note : [FAILURE_REASONS[reason], note].filter(Boolean).join(' — ');
    s.deliveryAttempts += 1;
  }
  if (status === 'OUT_FOR_DELIVERY') issueOtp(s); // new code on every (re)attempt
  if (status === 'RETURNED') s.deliveryOtpHash = undefined;

  await changeStatus(s, status, { by: req.user.id, role: 'driver', location, note: historyNote });
  res.json({ shipment: driverView(s) });
}

// POST /api/driver/shipments/:id/deliver — FR-28: OTP + photo and/or signature.
export async function deliver(req, res) {
  const d = await driverProfile(req.user.id);
  requireOnDuty(d);
  const s = await myShipment(req.params.id, req.user.id);
  if (s.status !== 'OUT_FOR_DELIVERY') throw ApiError.badRequest('Mark the shipment out for delivery first');
  if (s.otpWrongTries >= MAX_WRONG_TRIES) throw new ApiError(423, 'Too many wrong codes. Record a failed attempt and retry to issue a new code.');

  const photo = req.files?.photo?.[0];
  const signature = req.files?.signature?.[0];
  if (!photo && !signature) throw ApiError.badRequest('Add a photo or the recipient’s signature');

  if (!otpMatches(s, req.body.otp)) {
    s.otpWrongTries += 1;
    await s.save();
    const left = MAX_WRONG_TRIES - s.otpWrongTries;
    throw ApiError.badRequest(left > 0 ? `Wrong code — ${left} ${left === 1 ? 'try' : 'tries'} left` : 'Wrong code. Too many attempts — record a failed attempt.', { otp: ['Wrong code'] });
  }

  const [photoUrl, signatureUrl] = await Promise.all([
    photo ? storeImage(photo.buffer, 'proof') : undefined,
    signature ? storeImage(signature.buffer, 'signatures') : undefined,
  ]);
  const deliveredAt = new Date();
  s.proofOfDelivery = { photoUrl, signatureUrl, deliveredAt };
  s.deliveryOtpHash = undefined;
  s.driverEarning = Math.round(s.price.total * DRIVER_SHARE);
  const { lat, lng } = req.body;
  await changeStatus(s, 'DELIVERED', {
    by: req.user.id,
    role: 'driver',
    note: 'Delivered — code verified',
    location: lat != null && lng != null ? { lat, lng } : undefined,
  });
  await Driver.updateOne({ _id: d._id }, { $inc: { totalDeliveries: 1 } });
  res.json({ shipment: driverView(s) });
}

// GET /api/driver/history — FR-29
export async function history(req, res) {
  const { page, limit } = req.query;
  const driverId = new mongoose.Types.ObjectId(req.user.id);
  const filter = { driverId, status: { $in: ['DELIVERED', 'RETURNED', 'FAILED_ATTEMPT'] } };
  const periods = istPeriodStarts();
  const since = new Date(Math.min(periods.week, periods.month));

  const [items, total, recent, d] = await Promise.all([
    Shipment.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit),
    Shipment.countDocuments(filter),
    Shipment.find({ driverId, status: 'DELIVERED', 'proofOfDelivery.deliveredAt': { $gte: since } }).select('driverEarning proofOfDelivery.deliveredAt').lean(),
    driverProfile(req.user.id),
  ]);

  const sum = (from) => {
    const rows = recent.filter((r) => r.proofOfDelivery.deliveredAt >= from);
    return { deliveries: rows.length, earnings: rows.reduce((t, r) => t + (r.driverEarning ?? 0), 0) };
  };
  res.json({
    summary: { today: sum(periods.today), week: sum(periods.week), month: sum(periods.month), totalDeliveries: d.totalDeliveries, rating: d.rating },
    items: items.map(driverView),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
}
