import mongoose from 'mongoose';
import { Driver } from '../models/Driver.js';
import { Shipment } from '../models/Shipment.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { emitShipmentStatus } from '../sockets/index.js';
import { notify, notifyStatusInApp } from './notifications.js';
import { haversineKm } from './pricing.js';
import { aiFallback, callAi } from './aiClient.js';
import { changeStatus } from './shipmentStatus.js';

export const LOAD_STATUSES = ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'FAILED_ATTEMPT'];
export const AUTO_ASSIGN_RADIUS_KM = 25;

async function activeDriver(driverUserId) {
  if (!mongoose.isValidObjectId(driverUserId)) throw ApiError.badRequest('That driver is not available');
  const [user, driver] = await Promise.all([User.findById(driverUserId), Driver.findOne({ userId: driverUserId })]);
  if (!user || user.role !== 'driver' || !user.isActive || !driver) throw ApiError.badRequest('That driver is not available');
  return { user, driver };
}

/**
 * FR-31: assigns (BOOKED → ASSIGNED) or reassigns (ASSIGNED → ASSIGNED, new driver) a shipment.
 * Reassigning keeps the status but records who it moved to in the history.
 */
export async function assignShipment(shipment, driverUserId, { by, role = 'admin', note } = {}) {
  // FR-13: only paid bookings go to drivers.
  if (shipment.payment?.status !== 'paid') throw ApiError.badRequest('Waiting for the customer to pay — only paid shipments can be assigned');
  const { user } = await activeDriver(driverUserId);
  const first = user.name.split(' ')[0];
  if (shipment.status === 'BOOKED') {
    shipment.driverId = user._id;
    return changeStatus(shipment, 'ASSIGNED', { by, role, note: note ?? `Assigned to ${first}` });
  }
  if (shipment.status === 'ASSIGNED') {
    if (shipment.driverId?.equals(user._id)) throw ApiError.badRequest(`Already assigned to ${first}`);
    const at = new Date();
    const previousDriverId = shipment.driverId;
    shipment.driverId = user._id;
    shipment.statusHistory.push({ status: 'ASSIGNED', at, by, byRole: role, note: `Reassigned to ${first}` });
    await shipment.save();
    emitShipmentStatus(shipment, { status: 'ASSIGNED', at, note: `Reassigned to ${first}` });
    // New driver gets the job, the old one is told it moved; the customer already knows a driver is coming.
    notifyStatusInApp(shipment, 'REASSIGNED', null, { previousDriverId }).catch(() => {});
    notify(user._id, { type: 'assignment', title: `New pickup · ${shipment.trackingId}`, message: `Collect from ${shipment.pickup.address}.`, shipmentId: shipment._id, link: `/driver/shipments/${shipment._id}` });
    return shipment;
  }
  throw ApiError.badRequest('Only booked or assigned shipments can be (re)assigned');
}

/** Active load per driver: shipments in progress and their total weight. */
async function loadsByDriver() {
  const rows = await Shipment.aggregate([
    { $match: { status: { $in: LOAD_STATUSES }, driverId: { $ne: null } } },
    { $group: { _id: '$driverId', count: { $sum: 1 }, weightKg: { $sum: '$package.weightKg' } } },
  ]);
  return Object.fromEntries(rows.map((r) => [r._id.toString(), r]));
}

const pickupPoint = (s) => ({ lat: s.pickup.location.coordinates[1], lng: s.pickup.location.coordinates[0] });

/** Every active driver ranked for a shipment: on duty, has room, then nearest to the pickup. */
export async function rankCandidates(shipment) {
  const [drivers, loads] = await Promise.all([Driver.find().populate('userId', 'name isActive role').lean(), loadsByDriver()]);
  const pickup = pickupPoint(shipment);
  return drivers
    .filter((d) => d.userId?.isActive && d.userId.role === 'driver')
    .map((d) => {
      const id = d.userId._id.toString();
      const load = loads[id] ?? { count: 0, weightKg: 0 };
      const loc = d.currentLocation?.coordinates?.some(Boolean) ? { lat: d.currentLocation.coordinates[1], lng: d.currentLocation.coordinates[0] } : null;
      const capacityLeftKg = Math.round(((d.vehicle?.capacityKg ?? 0) - load.weightKg) * 10) / 10;
      return {
        driverId: id,
        name: d.userId.name,
        location: loc,
        vehicle: d.vehicle,
        isOnDuty: d.isOnDuty,
        distanceKm: loc ? Math.round(haversineKm(loc, pickup) * 10) / 10 : null,
        activeShipments: load.count,
        capacityLeftKg,
        fits: capacityLeftKg >= shipment.package.weightKg,
        rating: d.rating,
        isCurrent: shipment.driverId?.toString() === id,
      };
    })
    .sort(
      (a, b) =>
        Number(b.isOnDuty) - Number(a.isOnDuty) ||
        Number(b.fits) - Number(a.fits) ||
        (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity),
    );
}

/**
 * FR-31/43: nearest on-duty driver with spare capacity within 25 km, using the 2dsphere index.
 * (Milestone 7 lets the Python service rank candidates; this stays as the fallback.)
 */
export async function suggestDriver(shipment) {
  const nearby = await Driver.find({
    isOnDuty: true,
    currentLocation: {
      $near: { $geometry: { type: 'Point', coordinates: shipment.pickup.location.coordinates }, $maxDistance: AUTO_ASSIGN_RADIUS_KM * 1000 },
    },
  })
    .limit(25)
    .populate('userId', 'name isActive role')
    .lean();
  const loads = await loadsByDriver();
  return (
    nearby.find((d) => {
      if (!d.userId?.isActive || d.userId.role !== 'driver' || shipment.driverId?.equals(d.userId._id)) return false;
      const used = loads[d.userId._id.toString()]?.weightKg ?? 0;
      return (d.vehicle?.capacityKg ?? 0) - used >= shipment.package.weightKg;
    }) ?? null
  );
}

/** FR-43: asks the Python service to score candidates (distance, load, rating); null if it can't. */
async function suggestViaAi(shipment) {
  const candidates = (await rankCandidates(shipment)).filter((c) => !c.isCurrent);
  const [lng, lat] = shipment.pickup.location.coordinates;
  const data = await callAi('/assign/suggest', {
    pickup_lat: lat,
    pickup_lng: lng,
    weight_kg: shipment.package.weightKg,
    max_km: AUTO_ASSIGN_RADIUS_KM,
    candidates: candidates.map((c) => ({
      driver_id: c.driverId,
      lat: c.location?.lat ?? null,
      lng: c.location?.lng ?? null,
      on_duty: c.isOnDuty,
      capacity_left_kg: c.capacityLeftKg,
      active_shipments: c.activeShipments,
      rating: c.rating ?? 5,
    })),
  });
  return data.driver_id ? { driverId: data.driver_id, reason: data.reason } : { driverId: null };
}

export async function autoAssign(shipment, { by } = {}) {
  let driverId = null;
  let how = 'nearest available';
  try {
    const ai = await suggestViaAi(shipment);
    driverId = ai.driverId;
    if (driverId) how = 'best score: distance, load, rating';
  } catch (err) {
    aiFallback('Auto-assign', err);
    const pick = await suggestDriver(shipment);
    driverId = pick?.userId._id.toString() ?? null;
  }
  if (!driverId) throw new ApiError(409, `No on-duty driver with space within ${AUTO_ASSIGN_RADIUS_KM} km of the pickup`);
  const user = await User.findById(driverId).select('name');
  return assignShipment(shipment, driverId, { by, role: 'admin', note: `Auto-assigned to ${user.name.split(' ')[0]} (${how})` });
}
