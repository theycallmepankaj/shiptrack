import { z } from 'zod';
import { Driver } from '../models/Driver.js';
import { Shipment } from '../models/Shipment.js';
import { User } from '../models/User.js';
import { haversineKm, ROAD_FACTOR } from './pricing.js';

// Statuses where the driver is moving towards the pickup or the drop.
export const MOVING = ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'];
export const CITY_KMH = 22; // average urban courier speed
export const RECOMPUTE_KM = 0.5; // FR-23: recalc after moving > 500 m…
export const RECOMPUTE_MS = 2 * 60_000; // …or every 2 minutes
export const FRESH_MS = 10 * 60_000; // older positions aren't shown as "live"
export const MIN_INTERVAL_MS = 2000; // ignore bursts; clients send every 5 s

export const locationSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  heading: z.number().finite().min(0).max(360).nullable().optional(),
  speed: z.number().finite().min(0).max(100).nullable().optional(), // m/s, as from the Geolocation API
});

const point = (loc) => ({ lat: loc.coordinates[1], lng: loc.coordinates[0] });
const targetOf = (s) => (s.status === 'ASSIGNED' ? 'pickup' : 'drop');

export function computeEta(shipment, pos, now = Date.now()) {
  const target = targetOf(shipment);
  const km = haversineKm(pos, point(shipment[target].location)) * ROAD_FACTOR;
  const minutes = Math.max(1, Math.ceil((km / CITY_KMH) * 60 + 2)); // +2 min to park and hand over
  return { target, km: Math.round(km * 10) / 10, minutes, arriveAt: new Date(now + minutes * 60_000) };
}

const etaCache = new Map(); // shipmentId → { target, from, computedAt, arriveAt, km }

/** Live ETA with FR-23 throttling: reuse the last estimate unless the driver moved > 500 m or 2 min passed. */
export function liveEta(shipment, pos, now = Date.now()) {
  const id = shipment._id.toString();
  const cached = etaCache.get(id);
  if (
    cached &&
    cached.target === targetOf(shipment) &&
    haversineKm(cached.from, pos) < RECOMPUTE_KM &&
    now - cached.computedAt < RECOMPUTE_MS
  ) {
    const minutes = Math.max(1, Math.ceil((cached.arriveAt - now) / 60_000));
    return { target: cached.target, km: cached.km, minutes, arriveAt: cached.arriveAt, recomputed: false };
  }
  const eta = computeEta(shipment, pos, now);
  if (etaCache.size > 5000) etaCache.clear();
  etaCache.set(id, { ...eta, from: pos, computedAt: now });
  return { ...eta, recomputed: true };
}

export const _resetEtaCache = () => etaCache.clear();

/**
 * FR-20/21/23/24: stores a driver's GPS fix, then fans it out to every active shipment room
 * (with a live ETA) and to the admin fleet room. Returns { ok } or { ok: false, error }.
 */
export async function handleDriverLocation(io, user, payload, now = Date.now()) {
  const parsed = locationSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: 'Invalid location' };
  const { lat, lng, heading, speed } = parsed.data;

  const driver = await Driver.findOne({ userId: user.id });
  if (!driver) return { ok: false, error: 'No driver profile' };
  if (!driver.isOnDuty) return { ok: false, error: 'Go on duty to share your location' };

  const at = new Date(now);
  const speedKmh = speed != null ? Math.round(speed * 3.6) : null;
  await Driver.updateOne(
    { _id: driver._id },
    { currentLocation: { type: 'Point', coordinates: [lng, lat] }, lastLocationAt: at, heading: heading ?? driver.heading, speedKmh },
  );

  const pos = { lat, lng };
  const shipments = await Shipment.find({ driverId: user.id, status: { $in: MOVING } }).select('status pickup.location drop.location customerId');
  const etaWrites = [];
  for (const s of shipments) {
    const eta = liveEta(s, pos, now);
    // Out for delivery: the live ETA *is* the delivery estimate, so persist it.
    if (eta.recomputed && s.status === 'OUT_FOR_DELIVERY') {
      etaWrites.push({ updateOne: { filter: { _id: s._id }, update: { estimatedDeliveryAt: eta.arriveAt } } });
    }
    io?.to(`shipment:${s._id}`).emit('shipment:location', {
      shipmentId: s._id.toString(),
      lat,
      lng,
      heading: heading ?? null,
      speedKmh,
      at,
      eta: { target: eta.target, minutes: eta.minutes, arriveAt: eta.arriveAt, km: eta.km },
    });
  }
  if (etaWrites.length) await Shipment.bulkWrite(etaWrites);

  io?.to('admin:fleet').emit('fleet:update', { driverId: user.id, lat, lng, heading: heading ?? null, speedKmh, isOnDuty: true, at, activeShipments: shipments.length });
  return { ok: true, shipments: shipments.length };
}

/** Driver card + last known position for a shipment's owner/admin view (FR-19/22). */
export async function liveInfoFor(shipment, now = Date.now()) {
  if (!shipment.driverId) return { driver: null, live: null };
  const [user, d] = await Promise.all([User.findById(shipment.driverId).select('name phone'), Driver.findOne({ userId: shipment.driverId })]);
  if (!user || !d) return { driver: null, live: null };
  const driver = { name: user.name, phone: user.phone, vehicle: { type: d.vehicle?.type, number: d.vehicle?.number }, rating: d.rating };
  const fresh = d.lastLocationAt && now - d.lastLocationAt.getTime() < FRESH_MS && d.currentLocation?.coordinates?.some(Boolean);
  if (!MOVING.includes(shipment.status) || !fresh) return { driver, live: null };
  const pos = point(d.currentLocation);
  const eta = liveEta(shipment, pos, now);
  return {
    driver,
    live: { ...pos, heading: d.heading ?? null, speedKmh: d.speedKmh ?? null, at: d.lastLocationAt, eta: { target: eta.target, minutes: eta.minutes, arriveAt: eta.arriveAt, km: eta.km } },
  };
}

/** FR-24/36: every driver with position, duty state and active load, for the admin fleet map. */
export async function fleetSnapshot() {
  const [drivers, loads] = await Promise.all([
    Driver.find().populate('userId', 'name phone isActive').lean(),
    Shipment.aggregate([{ $match: { status: { $in: MOVING }, driverId: { $ne: null } } }, { $group: { _id: '$driverId', count: { $sum: 1 } } }]),
  ]);
  const loadBy = Object.fromEntries(loads.map((l) => [l._id.toString(), l.count]));
  return drivers
    .filter((d) => d.userId?.isActive)
    .map((d) => {
      const has = d.currentLocation?.coordinates?.some(Boolean);
      return {
        driverId: d.userId._id.toString(),
        name: d.userId.name,
        phone: d.userId.phone,
        vehicle: d.vehicle,
        isOnDuty: d.isOnDuty,
        lat: has ? d.currentLocation.coordinates[1] : null,
        lng: has ? d.currentLocation.coordinates[0] : null,
        heading: d.heading ?? null,
        speedKmh: d.speedKmh ?? null,
        at: d.lastLocationAt ?? null,
        activeShipments: loadBy[d.userId._id.toString()] ?? 0,
        rating: d.rating,
      };
    });
}
