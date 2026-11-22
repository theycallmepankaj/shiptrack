import { User } from '../models/User.js';
import { Driver } from '../models/Driver.js';
import { logger } from './logger.js';
import { Shipment } from '../models/Shipment.js';
import { computePrice, roadDistanceKm } from '../services/pricing.js';
import { alignToDeliveryWindow, fallbackEtaHours } from '../services/eta.js';
import { generateTrackingId } from './trackingId.js';

// Demo accounts from requirements §16.
export const DEMO_ACCOUNTS = [
  { name: 'Asha Admin', email: 'admin@shiptrack.dev', password: 'Admin@123', role: 'admin', phone: '+91 90000 00001' },
  {
    name: 'Ravi Kumar', email: 'driver1@shiptrack.dev', password: 'Driver@123', role: 'driver', phone: '+91 90000 00002',
    driver: { vehicle: { type: 'bike', number: 'KA-01-AB-4821', capacityKg: 20 }, location: [77.6408, 12.9784] },
  },
  { name: 'Chetan Customer', email: 'customer@shiptrack.dev', password: 'Customer@123', role: 'customer', phone: '+91 90000 00003' },
];

/** Creates the demo accounts if they don't exist. Safe to run repeatedly. */
export async function seedDemoAccounts() {
  let created = 0;
  for (const acc of DEMO_ACCOUNTS) {
    let user = await User.findOne({ email: acc.email });
    if (!user) {
      user = new User({ name: acc.name, email: acc.email, phone: acc.phone, role: acc.role });
      await user.setPassword(acc.password);
      await user.save();
      created++;
    }
    if (acc.driver && !(await Driver.exists({ userId: user._id }))) {
      await Driver.create({
        userId: user._id,
        vehicle: acc.driver.vehicle,
        currentLocation: { type: 'Point', coordinates: acc.driver.location },
      });
    }
  }
  if (created) logger.info(`Seeded ${created} demo account(s)`);
  return created;
}

// Bengaluru demo stops so the driver panel has a route to show.
const PLACES = {
  indiranagar: { address: '100 Feet Road, Indiranagar, Bengaluru 560038', city: 'Bengaluru', lat: 12.9719, lng: 77.6412 },
  koramangala: { address: '5th Block, Koramangala, Bengaluru 560095', city: 'Bengaluru', lat: 12.9352, lng: 77.6245 },
  hsr: { address: '27th Main, HSR Layout Sector 1, Bengaluru 560102', city: 'Bengaluru', lat: 12.9121, lng: 77.6446 },
  mgroad: { address: 'MG Road Metro, Bengaluru 560001', city: 'Bengaluru', lat: 12.9756, lng: 77.6066 },
  jayanagar: { address: '4th Block, Jayanagar, Bengaluru 560011', city: 'Bengaluru', lat: 12.925, lng: 77.5938 },
  whitefield: { address: 'ITPL Main Road, Whitefield, Bengaluru 560066', city: 'Bengaluru', lat: 12.9698, lng: 77.75 },
};
const DEMO_SHIPMENTS = [
  { from: 'indiranagar', to: 'koramangala', status: 'ASSIGNED', weightKg: 2, type: 'parcel', speed: 'standard', recipient: ['Ben Thomas', '+91 99887 66554'] },
  { from: 'mgroad', to: 'jayanagar', status: 'ASSIGNED', weightKg: 0.5, type: 'document', speed: 'express', recipient: ['Kavya Rao', '+91 99001 22334'] },
  { from: 'whitefield', to: 'hsr', status: 'PICKED_UP', weightKg: 4, type: 'fragile', speed: 'standard', recipient: ['Imran Khan', '+91 98450 11223'] },
];

const stop = (p, name, phone) => ({ address: p.address, city: p.city, location: { type: 'Point', coordinates: [p.lng, p.lat] }, contactName: name, contactPhone: phone });

/** Creates a few shipments for the demo customer, assigned to the demo driver (only if they have none). */
export async function seedDemoShipments() {
  const [customer, driver] = await Promise.all([
    User.findOne({ email: 'customer@shiptrack.dev' }),
    User.findOne({ email: 'driver1@shiptrack.dev' }),
  ]);
  if (!customer || !driver || (await Shipment.exists({ customerId: customer._id }))) return 0;
  const now = Date.now();
  for (const [i, d] of DEMO_SHIPMENTS.entries()) {
    const from = PLACES[d.from];
    const to = PLACES[d.to];
    const distanceKm = roadDistanceKm(from, to);
    const bookedAt = new Date(now - (90 - i * 20) * 60_000);
    const history = [
      { status: 'BOOKED', at: bookedAt, by: customer._id, byRole: 'customer', note: 'Shipment booked' },
      { status: 'ASSIGNED', at: new Date(bookedAt.getTime() + 10 * 60_000), byRole: 'system', note: 'Assigned to Ravi' },
    ];
    if (d.status === 'PICKED_UP') history.push({ status: 'PICKED_UP', at: new Date(bookedAt.getTime() + 35 * 60_000), by: driver._id, byRole: 'driver' });
    const price = computePrice({ distanceKm, weightKg: d.weightKg, speed: d.speed });
    await Shipment.create({
      trackingId: generateTrackingId(),
      customerId: customer._id,
      driverId: driver._id,
      pickup: stop(from, customer.name, customer.phone),
      drop: stop(to, ...d.recipient),
      package: { weightKg: d.weightKg, type: d.type },
      speed: d.speed,
      price,
      distanceKm,
      estimatedDeliveryAt: alignToDeliveryWindow(new Date(bookedAt.getTime() + fallbackEtaHours(distanceKm, d.speed) * 3600_000)),
      promisedDeliveryAt: alignToDeliveryWindow(new Date(bookedAt.getTime() + fallbackEtaHours(distanceKm, d.speed) * 3600_000)),
      etaSource: 'fallback',
      status: d.status,
      statusHistory: history,
      payment: { provider: 'seed', status: 'paid', amount: price.total, paymentId: `pay_seed_${i}`, paidAt: new Date(bookedAt.getTime() + 60_000) },
      createdAt: bookedAt,
    });
  }
  logger.info(`Seeded ${DEMO_SHIPMENTS.length} demo shipments for the demo driver`);
  return DEMO_SHIPMENTS.length;
}
