import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { Driver } from '../models/Driver.js';
import { Shipment } from '../models/Shipment.js';
import { User } from '../models/User.js';
import { alignToDeliveryWindow, fallbackEtaHours } from '../services/eta.js';
import { issueOtp } from '../services/otp.js';
import { computePrice, roadDistanceKm } from '../services/pricing.js';
import { logger } from './logger.js';
import { generateTrackingId } from './trackingId.js';

/**
 * ~90 days of realistic shipment history across five cities, for the admin dashboard (M6)
 * and for training the ETA model (M7). Delivery times depend on distance, weight, speed,
 * time of day, weekday and city, plus noise — so there is real signal to learn.
 * Deterministic (seeded PRNG) so every developer gets the same data.
 */

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CITIES = {
  Bengaluru: { lat: 12.9716, lng: 77.5946, r: 9, weight: 0.38, slow: 0.06, localities: ['Indiranagar', 'Koramangala', 'HSR Layout', 'Jayanagar', 'Whitefield', 'Malleshwaram', 'BTM Layout', 'Hebbal'] },
  Mumbai: { lat: 19.09, lng: 72.88, r: 8, weight: 0.25, slow: 0.12, localities: ['Andheri East', 'Bandra West', 'Powai', 'Dadar', 'Chembur', 'Goregaon', 'Kurla', 'Santacruz'] },
  Delhi: { lat: 28.6139, lng: 77.209, r: 11, weight: 0.17, slow: 0.09, localities: ['Connaught Place', 'Saket', 'Dwarka', 'Rohini', 'Lajpat Nagar', 'Karol Bagh', 'Vasant Kunj', 'Mayur Vihar'] },
  Pune: { lat: 18.5204, lng: 73.8567, r: 7, weight: 0.1, slow: 0, localities: ['Kothrud', 'Baner', 'Viman Nagar', 'Hadapsar', 'Aundh', 'Shivajinagar', 'Wakad', 'Kalyani Nagar'] },
  Hyderabad: { lat: 17.385, lng: 78.4867, r: 9, weight: 0.1, slow: 0.03, localities: ['Banjara Hills', 'Gachibowli', 'Madhapur', 'Kukatpally', 'Begumpet', 'Secunderabad', 'Kondapur', 'Ameerpet'] },
};

const NEW_DRIVERS = [
  { name: 'Priya Nair', city: 'Bengaluru', vehicle: { type: 'scooter', number: 'KA-05-MN-2290', capacityKg: 25 }, onDuty: true },
  { name: 'Suresh Gowda', city: 'Bengaluru', vehicle: { type: 'van', number: 'KA-03-VX-7781', capacityKg: 400 }, onDuty: true },
  { name: 'Amit Patil', city: 'Mumbai', vehicle: { type: 'bike', number: 'MH-02-EF-6612', capacityKg: 20 }, onDuty: true },
  { name: 'Farah Shaikh', city: 'Mumbai', vehicle: { type: 'van', number: 'MH-04-KL-3307', capacityKg: 350 }, onDuty: false },
  { name: 'Rohit Sharma', city: 'Delhi', vehicle: { type: 'bike', number: 'DL-8C-AB-1144', capacityKg: 20 }, onDuty: false },
  { name: 'Sneha Kulkarni', city: 'Pune', vehicle: { type: 'scooter', number: 'MH-12-QR-5521', capacityKg: 25 }, onDuty: false },
  { name: 'Arjun Reddy', city: 'Hyderabad', vehicle: { type: 'bike', number: 'TS-09-GH-8834', capacityKg: 20 }, onDuty: false },
];
const FIRST = ['Aarav', 'Diya', 'Kabir', 'Isha', 'Vihaan', 'Ananya', 'Rohan', 'Meera', 'Arnav', 'Sara', 'Dev', 'Nisha', 'Kiran', 'Zoya', 'Yash', 'Tara', 'Neel', 'Riya', 'Aditya', 'Pooja'];
const LAST = ['Sharma', 'Iyer', 'Menon', 'Gupta', 'Reddy', 'Das', 'Joshi', 'Khan', 'Bose', 'Pillai', 'Kapoor', 'Rao', 'Singh', 'Mehta', 'Naidu'];

export const SEED_MARKER_EMAIL = 'seed-customer-1@shiptrack.dev';

export async function seedHistory({ days = 90, now = new Date(), seed = 42 } = {}) {
  if (await User.exists({ email: SEED_MARKER_EMAIL })) return 0;
  const ravi = await User.findOne({ email: 'driver1@shiptrack.dev' });
  if (!ravi) return 0;
  const rnd = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const between = (a, b) => a + rnd() * (b - a);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
  const phone = () => `+91 9${Math.floor(between(100000000, 999999999))}`.replace(/(\d{5})(\d{5})$/, '$1 $2');
  const pointIn = (c) => {
    const ang = rnd() * 2 * Math.PI;
    const dist = Math.sqrt(rnd()) * c.r;
    return { lat: c.lat + (dist / 111) * Math.cos(ang), lng: c.lng + (dist / (111 * Math.cos((c.lat * Math.PI) / 180))) * Math.sin(ang) };
  };
  const stopAt = (cityName, name, ph) => {
    const c = CITIES[cityName];
    const p = pointIn(c);
    return {
      address: `${Math.floor(between(1, 250))}, ${pick(['Main Road', 'Cross Road', '1st Block', '2nd Stage', 'Link Road'])}, ${pick(c.localities)}, ${cityName}`,
      city: cityName,
      location: { type: 'Point', coordinates: [p.lng, p.lat] },
      contactName: name,
      contactPhone: ph,
    };
  };

  // Drivers (driver2…driver8, password Driver@123) and customers (no usable password).
  const driverHash = await bcrypt.hash('Driver@123', 12);
  const driversByCity = { Bengaluru: [], Mumbai: [], Delhi: [], Pune: [], Hyderabad: [] };
  driversByCity.Bengaluru.push(ravi._id);
  for (const [i, d] of NEW_DRIVERS.entries()) {
    const email = `driver${i + 2}@shiptrack.dev`;
    let u = await User.findOne({ email });
    if (!u) u = await User.create({ name: d.name, email, phone: phone(), role: 'driver', passwordHash: driverHash });
    if (!(await Driver.exists({ userId: u._id }))) {
      const p = pointIn({ ...CITIES[d.city], r: 3 });
      await Driver.create({
        userId: u._id,
        vehicle: d.vehicle,
        isOnDuty: d.onDuty,
        currentLocation: { type: 'Point', coordinates: [p.lng, p.lat] },
        lastLocationAt: new Date(now.getTime() - (d.onDuty ? between(0.2, 3) : between(3, 30)) * 3600_000),
        rating: Math.round(between(4.4, 5) * 10) / 10,
      });
    }
    driversByCity[d.city].push(u._id);
  }
  const noLogin = await bcrypt.hash(randomBytes(16).toString('hex'), 10);
  const customers = await User.insertMany(
    Array.from({ length: 30 }, (_, i) => ({
      name: `${pick(FIRST)} ${pick(LAST)}`,
      email: i === 0 ? SEED_MARKER_EMAIL : `seed-customer-${i + 1}@shiptrack.dev`,
      phone: phone(),
      role: 'customer',
      passwordHash: noLogin,
      createdAt: new Date(now.getTime() - between(days, days + 60) * 86_400_000),
    })),
  );

  const cityNames = Object.keys(CITIES);
  const cityPick = () => {
    let x = rnd();
    for (const c of cityNames) if ((x -= CITIES[c].weight) <= 0) return c;
    return 'Bengaluru';
  };
  const hourPick = () => Math.min(20, Math.max(8, Math.round(13 + gauss() * 3))); // most bookings around midday

  const docs = [];
  const istMidnight = (d) => {
    const ist = new Date(d.getTime() + 5.5 * 3600_000);
    return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 5.5 * 3600_000;
  };
  const today0 = istMidnight(now);

  for (let back = days - 1; back >= 0; back--) {
    const day0 = today0 - back * 86_400_000;
    const weekday = (new Date(day0 + 5.5 * 3600_000).getUTCDay() + 6) % 7; // Mon=0
    const volume = Math.max(2, Math.round((8 + (days - back) * 0.06) * [1, 1.05, 1.05, 1.1, 1.15, 0.85, 0.6][weekday] * (1 + gauss() * 0.15)));
    for (let k = 0; k < volume; k++) {
      const created = new Date(day0 + (hourPick() + rnd()) * 3600_000);
      if (created > now) continue;
      const fromCity = cityPick();
      const intercity = rnd() < 0.06;
      const toCity = intercity ? (fromCity === 'Mumbai' ? 'Pune' : fromCity === 'Pune' ? 'Mumbai' : pick(cityNames.filter((c) => c !== fromCity))) : fromCity;
      const customer = pick(customers);
      const pickup = stopAt(fromCity, customer.name, customer.phone);
      const drop = stopAt(toCity, `${pick(FIRST)} ${pick(LAST)}`, phone());
      const from = { lat: pickup.location.coordinates[1], lng: pickup.location.coordinates[0] };
      const to = { lat: drop.location.coordinates[1], lng: drop.location.coordinates[0] };
      const distanceKm = Math.max(1, roadDistanceKm(from, to));
      const weightKg = Math.round(Math.min(45, Math.max(0.2, Math.exp(gauss() * 0.9 + 0.6))) * 10) / 10;
      const type = rnd() < 0.2 ? 'document' : rnd() < 0.15 ? 'fragile' : 'parcel';
      const speed = rnd() < 0.25 ? 'express' : 'standard';
      const etaH = fallbackEtaHours(distanceKm, speed);
      const promised = alignToDeliveryWindow(new Date(created.getTime() + etaH * 3600_000));

      // "True" delivery time: formula × factors the ETA model can learn.
      const hour = created.getUTCHours() + 5.5;
      const rush = (hour >= 17 && hour <= 20) || (hour >= 8 && hour <= 10) ? 0.14 : 0;
      const factor = Math.max(0.35, 0.6 + rush + (weekday >= 5 ? -0.06 : 0) + (weightKg > 10 ? 0.1 : 0) + CITIES[fromCity].slow + (intercity ? 0.08 : 0) + gauss() * 0.14);
      const actual = alignToDeliveryWindow(new Date(created.getTime() + etaH * factor * 3600_000));

      const driverPool = driversByCity[fromCity];
      const r = rnd();
      let status;
      if (actual <= now) status = r < 0.065 ? 'CANCELLED' : r < 0.09 ? 'RETURNED' : 'DELIVERED';
      else {
        const frac = (now - created) / (actual - created);
        status = frac < 0.08 ? 'BOOKED' : frac < 0.3 ? 'ASSIGNED' : frac < 0.6 ? 'PICKED_UP' : frac < 0.85 ? 'IN_TRANSIT' : 'OUT_FOR_DELIVERY';
      }
      // Keep the demo driver's "today" list to his three demo shipments.
      const pool = status === 'DELIVERED' || status === 'RETURNED' || status === 'CANCELLED' ? driverPool : driverPool.filter((d) => !d.equals(ravi._id));
      const driverId = status === 'BOOKED' || (status === 'CANCELLED' && rnd() < 0.7) ? null : pick(pool.length ? pool : driverPool);

      const t = (ms) => new Date(Math.min(ms, now.getTime()));
      const assignedAt = created.getTime() + between(5, 30) * 60_000;
      const pickedAt = assignedAt + between(30, 120) * 60_000;
      const transitAt = pickedAt + between(5, 20) * 60_000;
      const outAt = Math.max(transitAt + 5 * 60_000, actual.getTime() - between(30, 90) * 60_000);
      const history = [{ status: 'BOOKED', at: created, by: customer._id, byRole: 'customer', note: 'Shipment booked' }];
      const steps = { ASSIGNED: 1, PICKED_UP: 2, IN_TRANSIT: 3, OUT_FOR_DELIVERY: 4, DELIVERED: 5, RETURNED: 5 }[status] ?? 0;
      if (status === 'CANCELLED') {
        if (driverId) history.push({ status: 'ASSIGNED', at: t(assignedAt), byRole: 'system', note: 'Assigned' });
        history.push({ status: 'CANCELLED', at: t(assignedAt + between(5, 60) * 60_000), by: customer._id, byRole: 'customer', note: 'Cancelled by customer' });
      }
      if (steps >= 1) history.push({ status: 'ASSIGNED', at: t(assignedAt), byRole: 'system', note: 'Assigned' });
      if (steps >= 2) history.push({ status: 'PICKED_UP', at: t(pickedAt), by: driverId, byRole: 'driver' });
      if (steps >= 3) history.push({ status: 'IN_TRANSIT', at: t(transitAt), by: driverId, byRole: 'driver' });
      if (steps >= 4) history.push({ status: 'OUT_FOR_DELIVERY', at: t(outAt), by: driverId, byRole: 'driver' });
      if (status === 'DELIVERED') history.push({ status: 'DELIVERED', at: actual, by: driverId, byRole: 'driver', note: 'Delivered — code verified' });
      if (status === 'RETURNED') {
        history.push({ status: 'FAILED_ATTEMPT', at: actual, by: driverId, byRole: 'driver', note: 'Customer not available' });
        history.push({ status: 'RETURNED', at: new Date(actual.getTime() + 3 * 3600_000), by: driverId, byRole: 'driver' });
      }

      const price = computePrice({ distanceKm, weightKg, speed });
      const doc = new Shipment({
        trackingId: generateTrackingId(),
        customerId: customer._id,
        driverId,
        pickup,
        drop,
        package: { weightKg, type },
        speed,
        price,
        distanceKm,
        estimatedDeliveryAt: status === 'DELIVERED' ? promised : status === 'OUT_FOR_DELIVERY' ? actual : promised,
        promisedDeliveryAt: promised,
        etaSource: 'formula',
        status,
        statusHistory: history,
        payment: { provider: 'seed', status: status === 'CANCELLED' ? 'refunded' : 'paid' },
        ...(status === 'DELIVERED' && { proofOfDelivery: { deliveredAt: actual }, driverEarning: Math.round(price.total * 0.7) }),
        ...(status === 'CANCELLED' && { cancelledAt: history.at(-1).at }),
        deliveryAttempts: status === 'RETURNED' ? 1 : 0,
        createdAt: created,
        updatedAt: history.at(-1).at,
      });
      if (status === 'OUT_FOR_DELIVERY') issueOtp(doc);
      docs.push(doc.toObject());
    }
  }

  // Unique tracking IDs within the batch (collisions are astronomically rare, but be safe).
  const seen = new Set();
  for (const d of docs) while (seen.has(d.trackingId)) d.trackingId = generateTrackingId();
  docs.forEach((d) => seen.add(d.trackingId));
  await Shipment.collection.insertMany(docs, { ordered: false }); // bypass timestamps so createdAt is kept

  // Driver delivery counts.
  const counts = await Shipment.aggregate([{ $match: { status: 'DELIVERED', driverId: { $ne: null } } }, { $group: { _id: '$driverId', n: { $sum: 1 } } }]);
  await Promise.all(counts.map((c) => Driver.updateOne({ userId: c._id }, { totalDeliveries: c.n })));
  logger.info(`Seeded ${NEW_DRIVERS.length} drivers, ${customers.length} customers and ${docs.length} historical shipments`);
  return docs.length;
}
