import mongoose from 'mongoose';
import { Driver } from '../models/Driver.js';
import { PricingRule } from '../models/PricingRule.js';
import { Shipment, STATUSES } from '../models/Shipment.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { emitFleetUpdate } from '../sockets/index.js';
import { assignShipment, autoAssign, LOAD_STATUSES, rankCandidates } from '../services/assignment.js';
import { DEFAULT_RULE } from '../services/pricing.js';
import { callAi } from '../services/aiClient.js';
import { istPeriodStarts } from './driverController.js';

const { ObjectId } = mongoose.Types;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TZ = 'Asia/Kolkata';

/* ───────────── Drivers (FR-30) ───────────── */

function driverRow(d, user, load) {
  const has = d.currentLocation?.coordinates?.some(Boolean);
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone,
    isActive: user.isActive,
    isOnDuty: d.isOnDuty,
    vehicle: d.vehicle,
    rating: d.rating,
    totalDeliveries: d.totalDeliveries,
    activeShipments: load?.count ?? 0,
    lastLocationAt: d.lastLocationAt ?? null,
    location: has ? { lat: d.currentLocation.coordinates[1], lng: d.currentLocation.coordinates[0] } : null,
    createdAt: user.createdAt,
  };
}

async function loads() {
  const rows = await Shipment.aggregate([
    { $match: { status: { $in: LOAD_STATUSES }, driverId: { $ne: null } } },
    { $group: { _id: '$driverId', count: { $sum: 1 } } },
  ]);
  return Object.fromEntries(rows.map((r) => [r._id.toString(), r]));
}

export async function listDrivers(req, res) {
  const { q, status } = req.query;
  const userFilter = { role: 'driver' };
  if (status === 'active' || status === 'on-duty') userFilter.isActive = true;
  if (status === 'inactive') userFilter.isActive = false;
  if (q) userFilter.$or = [{ name: new RegExp(escapeRegex(q), 'i') }, { email: new RegExp(escapeRegex(q), 'i') }];
  const users = await User.find(userFilter).sort({ name: 1 });
  const [profiles, load] = await Promise.all([Driver.find({ userId: { $in: users.map((u) => u._id) } }).lean(), loads()]);
  const byUser = Object.fromEntries(profiles.map((p) => [p.userId.toString(), p]));
  let rows = users.filter((u) => byUser[u._id]).map((u) => driverRow(byUser[u._id], u, load[u._id.toString()]));
  if (status === 'on-duty') rows = rows.filter((r) => r.isOnDuty);
  res.json({ drivers: rows });
}

// FR-2/30: drivers are created by an admin, never by public sign-up.
export async function createDriver(req, res) {
  const { name, email, phone, password, vehicle } = req.body;
  if (await User.exists({ email })) throw ApiError.badRequest('An account with this email already exists', { email: ['Email already registered'] });
  if (await Driver.exists({ 'vehicle.number': vehicle.number })) throw ApiError.badRequest('That vehicle is already registered', { 'vehicle.number': ['Vehicle already registered'] });
  const user = new User({ name, email, phone, role: 'driver' });
  await user.setPassword(password);
  await user.save();
  const driver = await Driver.create({ userId: user._id, vehicle });
  res.status(201).json({ driver: driverRow(driver.toObject(), user) });
}

async function findDriver(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Driver not found');
  const [user, driver] = await Promise.all([User.findOne({ _id: id, role: 'driver' }), Driver.findOne({ userId: id })]);
  if (!user || !driver) throw ApiError.notFound('Driver not found');
  return { user, driver };
}

export async function updateDriver(req, res) {
  const { user, driver } = await findDriver(req.params.id);
  const { name, phone, isActive, vehicle } = req.body;

  if (isActive === false && user.isActive) {
    const active = await Shipment.countDocuments({ driverId: user._id, status: { $in: LOAD_STATUSES } });
    if (active) throw new ApiError(409, `Reassign their ${active} active shipment${active > 1 ? 's' : ''} before deactivating`);
    user.sessions = []; // sign them out everywhere
    driver.isOnDuty = false;
  }
  if (vehicle?.number && vehicle.number !== driver.vehicle.number && (await Driver.exists({ 'vehicle.number': vehicle.number, _id: { $ne: driver._id } }))) {
    throw ApiError.badRequest('That vehicle is already registered', { 'vehicle.number': ['Vehicle already registered'] });
  }
  if (name !== undefined) user.name = name;
  if (phone !== undefined) user.phone = phone;
  if (isActive !== undefined) user.isActive = isActive;
  if (vehicle) driver.vehicle = { ...driver.vehicle.toObject?.() ?? driver.vehicle, ...vehicle };
  await Promise.all([user.save(), driver.save()]);
  if (isActive === false) emitFleetUpdate({ driverId: user._id.toString(), isOnDuty: false });
  const load = await loads();
  res.json({ driver: driverRow(driver.toObject(), user, load[user._id.toString()]) });
}

/* ───────────── Shipments (FR-31/32) ───────────── */

export async function listShipments(req, res) {
  const { status, driver, city, from, to, q, sort, page, limit } = req.query;
  const filter = {};
  if (status === 'active') filter.status = { $in: LOAD_STATUSES.concat('BOOKED') };
  else if (status === 'delayed') Object.assign(filter, { status: { $in: LOAD_STATUSES.concat('BOOKED') }, promisedDeliveryAt: { $lt: new Date() } });
  else if (status && STATUSES.includes(status)) filter.status = status;
  if (driver === 'unassigned') filter.driverId = null;
  else if (driver) filter.driverId = new ObjectId(driver);
  if (city) {
    const re = new RegExp(`^${escapeRegex(city)}$`, 'i');
    filter.$or = [{ 'pickup.city': re }, { 'drop.city': re }];
  }
  if (from || to) filter.createdAt = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  if (q) filter.trackingId = { $regex: `^${q.toUpperCase().replace(/[^A-Z0-9-]/g, '')}` };

  const sortField = { createdAt: 'createdAt', price: 'price.total', promisedDeliveryAt: 'promisedDeliveryAt' }[sort.replace('-', '')];
  const [items, total, cities] = await Promise.all([
    Shipment.find(filter)
      .sort({ [sortField]: sort.startsWith('-') ? -1 : 1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('customerId', 'name')
      .populate('driverId', 'name')
      .lean(),
    Shipment.countDocuments(filter),
    Shipment.distinct('pickup.city'),
  ]);
  const now = Date.now();
  res.json({
    items: items.map((s) => ({
      id: s._id.toString(),
      trackingId: s.trackingId,
      status: s.status,
      customer: s.customerId?.name ?? '—',
      driver: s.driverId ? { id: s.driverId._id.toString(), name: s.driverId.name } : null,
      from: s.pickup.city || s.pickup.address,
      to: s.drop.city || s.drop.address,
      speed: s.speed,
      total: s.price.total,
      paymentStatus: s.payment?.status ?? 'pending',
      createdAt: s.createdAt,
      promisedDeliveryAt: s.promisedDeliveryAt ?? s.estimatedDeliveryAt,
      delayed: ![...['DELIVERED', 'RETURNED', 'CANCELLED']].includes(s.status) && new Date(s.promisedDeliveryAt ?? s.estimatedDeliveryAt) < now,
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    cities: cities.filter(Boolean).sort(),
  });
}

async function loadShipment(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Shipment not found');
  const s = await Shipment.findById(id);
  if (!s) throw ApiError.notFound('Shipment not found');
  return s;
}

export async function candidates(req, res) {
  res.json({ candidates: await rankCandidates(await loadShipment(req.params.id)) });
}

export async function assign(req, res) {
  const s = await assignShipment(await loadShipment(req.params.id), req.body.driverId, { by: req.user.id });
  res.json({ shipment: { id: s._id.toString(), status: s.status, driverId: s.driverId.toString() } });
}

export async function autoAssignOne(req, res) {
  const s = await autoAssign(await loadShipment(req.params.id), { by: req.user.id });
  const driver = await User.findById(s.driverId).select('name');
  res.json({ shipment: { id: s._id.toString(), status: s.status, driverId: s.driverId.toString() }, driver: { id: driver._id.toString(), name: driver.name } });
}

/* ───────────── Stats (FR-33) ───────────── */

const notCancelled = { $ne: ['$status', 'CANCELLED'] };
const deliveredAt = { $ifNull: ['$proofOfDelivery.deliveredAt', '$updatedAt'] };
const promised = { $ifNull: ['$promisedDeliveryAt', '$estimatedDeliveryAt'] };

export async function stats(_req, res) {
  const now = new Date();
  const p = istPeriodStarts(now);
  const day = 86_400_000;
  const since30 = new Date(p.today.getTime() - 29 * day);
  const since12w = new Date(p.week.getTime() - 11 * 7 * day);
  const monthStart = new Date(p.month);
  const since12m = new Date(Date.UTC(new Date(monthStart.getTime() + 5.5 * 3600_000).getUTCFullYear(), new Date(monthStart.getTime() + 5.5 * 3600_000).getUTCMonth() - 11, 1) - 5.5 * 3600_000);
  const bucket = (unit) => ({ $dateTrunc: { date: '$createdAt', unit, timezone: TZ, ...(unit === 'week' && { startOfWeek: 'monday' }) } });
  const series = (since, unit) =>
    Shipment.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: bucket(unit),
          shipments: { $sum: 1 },
          revenue: { $sum: { $cond: [notCancelled, '$price.total', 0] } },
          delivered: { $sum: { $cond: [{ $eq: ['$status', 'DELIVERED'] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

  const [daily, weekly, monthly, statusRows, onTimeRows, delayedRows, delayedCount, topRows, fleet] = await Promise.all([
    series(since30, 'day'),
    series(since12w, 'week'),
    series(since12m, 'month'),
    Shipment.aggregate([{ $match: { createdAt: { $gte: since30 } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Shipment.aggregate([
      { $match: { status: 'DELIVERED', 'proofOfDelivery.deliveredAt': { $gte: since30 } } },
      { $group: { _id: null, total: { $sum: 1 }, onTime: { $sum: { $cond: [{ $lte: [deliveredAt, promised] }, 1, 0] } } } },
    ]),
    Shipment.find({ status: { $in: LOAD_STATUSES.concat('BOOKED') }, promisedDeliveryAt: { $lt: now } })
      .sort({ promisedDeliveryAt: 1 })
      .limit(5)
      .populate('driverId', 'name')
      .lean(),
    Shipment.countDocuments({ status: { $in: LOAD_STATUSES.concat('BOOKED') }, promisedDeliveryAt: { $lt: now } }),
    Shipment.aggregate([
      { $match: { status: 'DELIVERED', driverId: { $ne: null }, 'proofOfDelivery.deliveredAt': { $gte: since30 } } },
      {
        $group: {
          _id: '$driverId',
          deliveries: { $sum: 1 },
          onTime: { $sum: { $cond: [{ $lte: [deliveredAt, promised] }, 1, 0] } },
          earnings: { $sum: { $ifNull: ['$driverEarning', 0] } },
        },
      },
      { $sort: { deliveries: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $lookup: { from: 'drivers', localField: '_id', foreignField: 'userId', as: 'driver' } },
    ]),
    Driver.aggregate([
      { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'u' } },
      { $match: { 'u.isActive': true } },
      { $group: { _id: null, total: { $sum: 1 }, onDuty: { $sum: { $cond: ['$isOnDuty', 1, 0] } } } },
    ]),
  ]);

  // Fill gaps so charts get one point per day/week/month.
  const fill = (rows, start, count, step) => {
    const byKey = Object.fromEntries(rows.map((r) => [new Date(r._id).getTime(), r]));
    return Array.from({ length: count }, (_, i) => {
      const t = step(start, i).getTime();
      const r = byKey[t];
      return { date: new Date(t).toISOString(), shipments: r?.shipments ?? 0, revenue: r?.revenue ?? 0, delivered: r?.delivered ?? 0 };
    });
  };
  const addDays = (d, n) => new Date(d.getTime() + n * day);
  const addMonths = (d, n) => {
    const ist = new Date(d.getTime() + 5.5 * 3600_000);
    return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() + n, 1) - 5.5 * 3600_000);
  };
  const dailySeries = fill(daily, since30, 30, (s, i) => addDays(s, i));
  const sumSince = (from, key) => dailySeries.filter((d) => new Date(d.date) >= from).reduce((t, d) => t + d[key], 0);

  const onTime = onTimeRows[0];
  res.json({
    kpis: {
      shipmentsToday: dailySeries.at(-1).shipments,
      shipmentsYesterday: dailySeries.at(-2).shipments,
      deliveredToday: dailySeries.at(-1).delivered,
      onTimeRate: onTime?.total ? Math.round((onTime.onTime / onTime.total) * 1000) / 10 : null,
      deliveredLast30: onTime?.total ?? 0,
      delayed: delayedCount,
      revenue: {
        today: dailySeries.at(-1).revenue,
        week: sumSince(p.week, 'revenue'),
        month: (monthly.find((m) => new Date(m._id).getTime() === monthStart.getTime())?.revenue) ?? 0,
      },
      drivers: { total: fleet[0]?.total ?? 0, onDuty: fleet[0]?.onDuty ?? 0 },
    },
    series: {
      daily: dailySeries,
      weekly: fill(weekly, since12w, 12, (s, i) => addDays(s, i * 7)),
      monthly: fill(monthly, since12m, 12, (s, i) => addMonths(s, i)),
    },
    statusBreakdown: STATUSES.map((s) => ({ status: s, count: statusRows.find((r) => r._id === s)?.count ?? 0 })).filter((r) => r.count > 0),
    delayed: delayedRows.map((s) => ({
      id: s._id.toString(),
      trackingId: s.trackingId,
      status: s.status,
      driver: s.driverId?.name ?? null,
      promisedDeliveryAt: s.promisedDeliveryAt,
      overdueMinutes: Math.round((now - s.promisedDeliveryAt) / 60_000),
    })),
    topDrivers: topRows.map((r) => ({
      id: r._id.toString(),
      name: r.user[0]?.name ?? 'Unknown',
      deliveries: r.deliveries,
      onTimeRate: Math.round((r.onTime / r.deliveries) * 1000) / 10,
      earnings: r.earnings,
      rating: r.driver[0]?.rating ?? null,
    })),
  });
}

/* ───────────── Pricing (FR-34) ───────────── */

const ruleView = (r) => ({ id: r._id?.toString() ?? null, baseFare: r.baseFare, perKm: r.perKm, perKg: r.perKg, expressMultiplier: r.expressMultiplier, updatedAt: r.updatedAt ?? null });

export async function getPricing(_req, res) {
  const rules = await PricingRule.find().sort({ createdAt: -1 }).limit(6).lean();
  const active = rules.find((r) => r.isActive);
  res.json({ active: active ? ruleView(active) : { ...ruleView(DEFAULT_RULE), isDefault: true }, history: rules.filter((r) => !r.isActive).map(ruleView) });
}

/** Saves a new active rule and keeps the old ones as history (quotes always use the latest). */
export async function updatePricing(req, res) {
  await PricingRule.updateMany({ isActive: true }, { isActive: false });
  const rule = await PricingRule.create({ ...req.body, isActive: true });
  res.json({ active: ruleView(rule) });
}

/* ───────────── Demand forecast (FR-44, stretch) ───────────── */

export async function demandForecast(_req, res) {
  try {
    res.json(await callAi('/forecast/demand', { days: 7 }, { timeoutMs: 5000 }));
  } catch {
    throw new ApiError(503, 'Forecast unavailable — the AI service is not reachable');
  }
}

export async function modelInfo(_req, res) {
  try {
    res.json(await callAi('/ml/model', undefined, { method: 'GET', timeoutMs: 3000 }));
  } catch {
    res.json({ loaded: false, unreachable: true });
  }
}

/** Retrains the ETA model on delivered shipments (takes a few seconds). */
export async function retrainModel(_req, res) {
  try {
    res.json(await callAi('/ml/train', {}, { timeoutMs: 120_000 }));
  } catch (err) {
    throw new ApiError(503, `Training failed: ${err.message}`);
  }
}

// FR-2: admins are created by an admin (no public sign-up for staff).
const adminRow = (u) => ({ id: u._id.toString(), name: u.name, email: u.email, phone: u.phone, isActive: u.isActive, createdAt: u.createdAt });

// GET /api/admin/admins
export async function listAdmins(_req, res) {
  const admins = await User.find({ role: 'admin' }).sort({ name: 1 });
  res.json({ admins: admins.map(adminRow) });
}

// POST /api/admin/admins
export async function createAdmin(req, res) {
  const { name, email, phone, password } = req.body;
  if (await User.exists({ email })) throw ApiError.badRequest('An account with this email already exists', { email: ['Email already registered'] });
  const user = new User({ name, email, phone, role: 'admin' });
  await user.setPassword(password);
  await user.save();
  res.status(201).json({ admin: adminRow(user) });
}

// PATCH /api/admin/admins/:id — deactivate/reactivate (never yourself, never the last active admin)
export async function updateAdmin(req, res) {
  const user = mongoose.isValidObjectId(req.params.id) && (await User.findOne({ _id: req.params.id, role: 'admin' }));
  if (!user) throw ApiError.notFound('Admin not found');
  if (req.body.isActive === false) {
    if (user._id.equals(req.user.id)) throw ApiError.badRequest('You can’t deactivate your own account');
    if ((await User.countDocuments({ role: 'admin', isActive: true })) <= 1) throw ApiError.badRequest('Keep at least one active admin');
    user.sessions = []; // sign them out everywhere
  }
  user.isActive = req.body.isActive;
  await user.save();
  res.json({ admin: adminRow(user) });
}
