import request from 'supertest';
import { createApp } from '../src/app.js';
import { Shipment } from '../src/models/Shipment.js';
import { PricingRule } from '../src/models/PricingRule.js';
import { canJoinShipment } from '../src/sockets/index.js';
import { signAccessToken } from '../src/utils/tokens.js';
import { clearDb, startDb, stopDb } from './setup.js';

process.env.AI_SERVICE_URL = 'http://127.0.0.1:1'; // force the ETA fallback (nothing listens there)
const app = createApp();

const KORAMANGALA = { lat: 12.9352, lng: 77.6245 };
const INDIRANAGAR = { lat: 12.9719, lng: 77.6412 };
const stop = (p, city, name) => ({ address: `12 Main Road, ${city}`, city, ...p, contactName: name, contactPhone: '+91 98765 43210' });
const booking = {
  pickup: stop(INDIRANAGAR, 'Bengaluru', 'Asha'),
  drop: stop(KORAMANGALA, 'Bengaluru', 'Ben'),
  package: { weightKg: 2, dimensions: { l: 30, w: 20, h: 10 }, type: 'parcel' },
  speed: 'standard',
};

async function registerCustomer(email) {
  const res = await request(app).post('/api/auth/register').send({ name: 'Cust', email, phone: '+91 90000 11111', password: 'Secret123' });
  return { token: res.body.accessToken, id: res.body.user.id };
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });

beforeAll(startDb);
afterAll(stopDb);
afterEach(clearDb);

describe('POST /quote', () => {
  it('returns both speeds with price and ETA', async () => {
    const { token } = await registerCustomer('q@x.com');
    const res = await request(app).post('/api/shipments/quote').set(auth(token))
      .send({ pickup: INDIRANAGAR, drop: KORAMANGALA, package: { weightKg: 2 } });
    expect(res.status).toBe(200);
    expect(res.body.distanceKm).toBeGreaterThan(4);
    const { standard, express } = res.body.options;
    expect(express.price.total).toBeGreaterThan(standard.price.total);
    expect(new Date(express.estimatedDeliveryAt) < new Date(standard.estimatedDeliveryAt)).toBe(true);
  });

  it('uses the active pricing rule from the database', async () => {
    await PricingRule.create({ baseFare: 1000, perKm: 0, perKg: 0, expressMultiplier: 2 });
    const { token } = await registerCustomer('q2@x.com');
    const res = await request(app).post('/api/shipments/quote').set(auth(token))
      .send({ pickup: INDIRANAGAR, drop: KORAMANGALA, package: { weightKg: 1 } });
    expect(res.body.options.standard.price.total).toBe(1000);
    expect(res.body.options.express.price.total).toBe(2000);
  });

  it('rejects points outside India and identical points', async () => {
    const { token } = await registerCustomer('q3@x.com');
    const london = await request(app).post('/api/shipments/quote').set(auth(token)).send({ pickup: { lat: 51.5, lng: -0.12 }, drop: KORAMANGALA, package: { weightKg: 1 } });
    expect(london.status).toBe(400);
    const same = await request(app).post('/api/shipments/quote').set(auth(token)).send({ pickup: KORAMANGALA, drop: KORAMANGALA, package: { weightKg: 1 } });
    expect(same.status).toBe(400);
  });

  it('requires a customer', async () => {
    expect((await request(app).post('/api/shipments/quote').send({})).status).toBe(401);
    const driver = signAccessToken({ _id: '507f1f77bcf86cd799439011', role: 'driver', name: 'D' });
    expect((await request(app).post('/api/shipments/quote').set(auth(driver)).send({})).status).toBe(403);
  });
});

describe('booking & tracking', () => {
  it('creates a shipment with a tracking ID, server-side price and BOOKED history', async () => {
    const { token } = await registerCustomer('b@x.com');
    const res = await request(app).post('/api/shipments').set(auth(token)).send({ ...booking, price: { total: 1 } });
    expect(res.status).toBe(201);
    const s = res.body.shipment;
    expect(s.trackingId).toMatch(/^SHP-[A-Z0-9]{6}$/);
    expect(s.status).toBe('BOOKED');
    expect(s.price.total).toBeGreaterThan(40); // client-sent price ignored
    expect(s.statusHistory).toHaveLength(1);
    expect(s.statusHistory[0]).toMatchObject({ status: 'BOOKED', byRole: 'customer' });
    expect(s.estimatedDeliveryAt).toBeDefined();
  });

  it('validates the booking payload', async () => {
    const { token } = await registerCustomer('v@x.com');
    const bad = { ...booking, package: { ...booking.package, weightKg: 500, type: 'pizza' }, drop: { ...booking.drop, contactPhone: 'x' } };
    const res = await request(app).post('/api/shipments').set(auth(token)).send(bad);
    expect(res.status).toBe(400);
  });

  it('public tracking shows status and timeline but no personal data', async () => {
    const { token } = await registerCustomer('t@x.com');
    const { body } = await request(app).post('/api/shipments').set(auth(token)).send(booking);
    const res = await request(app).get(`/api/shipments/track/${body.shipment.trackingId.toLowerCase()}`);
    expect(res.status).toBe(200);
    const pub = res.body.shipment;
    expect(pub).toMatchObject({ trackingId: body.shipment.trackingId, status: 'BOOKED' });
    const json = JSON.stringify(pub);
    for (const secret of ['Asha', '98765', 'Main Road', 'customerId', 'price']) expect(json).not.toContain(secret);
    expect(pub.from.lat).toBe(12.97); // coarse location only
    expect((await request(app).get('/api/shipments/track/SHP-ZZZZZZ')).status).toBe(404);
  });

  it('lists my shipments with filters and a summary', async () => {
    const a = await registerCustomer('a@x.com');
    const b = await registerCustomer('c@x.com');
    await request(app).post('/api/shipments').set(auth(a.token)).send(booking);
    const second = await request(app).post('/api/shipments').set(auth(a.token)).send({ ...booking, speed: 'express' });
    await request(app).post('/api/shipments').set(auth(b.token)).send(booking);
    await request(app).patch(`/api/shipments/${second.body.shipment.id}/cancel`).set(auth(a.token));

    const all = await request(app).get('/api/shipments/mine').set(auth(a.token));
    expect(all.body.total).toBe(2);
    expect(all.body.summary.active).toBe(1);
    const cancelled = await request(app).get('/api/shipments/mine?status=cancelled').set(auth(a.token));
    expect(cancelled.body.items).toHaveLength(1);
    const search = await request(app).get(`/api/shipments/mine?q=${second.body.shipment.trackingId.slice(0, 6)}`).set(auth(a.token));
    expect(search.body.items.map((i) => i.id)).toContain(second.body.shipment.id);
  });

  it('hides other customers’ shipments (404)', async () => {
    const a = await registerCustomer('o1@x.com');
    const b = await registerCustomer('o2@x.com');
    const { body } = await request(app).post('/api/shipments').set(auth(a.token)).send(booking);
    expect((await request(app).get(`/api/shipments/${body.shipment.id}`).set(auth(a.token))).status).toBe(200);
    expect((await request(app).get(`/api/shipments/${body.shipment.id}`).set(auth(b.token))).status).toBe(404);
    expect((await request(app).patch(`/api/shipments/${body.shipment.id}/cancel`).set(auth(b.token))).status).toBe(404);
    expect((await request(app).get('/api/shipments/not-an-id').set(auth(a.token))).status).toBe(404);
    const admin = signAccessToken({ _id: '507f1f77bcf86cd799439011', role: 'admin', name: 'A' });
    expect((await request(app).get(`/api/shipments/${body.shipment.id}`).set(auth(admin))).status).toBe(200);
  });

  it('cancels before pickup only, recording history and refund status', async () => {
    const { token } = await registerCustomer('cx@x.com');
    const { body } = await request(app).post('/api/shipments').set(auth(token)).send(booking);
    const res = await request(app).patch(`/api/shipments/${body.shipment.id}/cancel`).set(auth(token)).send({ reason: 'Changed my mind' });
    expect(res.status).toBe(200);
    expect(res.body.shipment.status).toBe('CANCELLED');
    expect(res.body.shipment.payment.status).toBe('cancelled');
    expect(res.body.shipment.statusHistory.at(-1).note).toMatch(/Changed my mind/);
    expect((await request(app).patch(`/api/shipments/${body.shipment.id}/cancel`).set(auth(token))).status).toBe(400);

    const other = await request(app).post('/api/shipments').set(auth(token)).send(booking);
    await Shipment.updateOne({ _id: other.body.shipment.id }, { status: 'PICKED_UP', 'payment.status': 'paid' });
    const late = await request(app).patch(`/api/shipments/${other.body.shipment.id}/cancel`).set(auth(token));
    expect(late.status).toBe(400);
  });

  it('only lets the owner, assigned driver or admin join a shipment room', async () => {
    const a = await registerCustomer('s1@x.com');
    const b = await registerCustomer('s2@x.com');
    const { body } = await request(app).post('/api/shipments').set(auth(a.token)).send(booking);
    const id = body.shipment.id;
    expect(await canJoinShipment({ id: a.id, role: 'customer' }, id)).toBe(true);
    expect(await canJoinShipment({ id: b.id, role: 'customer' }, id)).toBe(false);
    expect(await canJoinShipment({ id: a.id, role: 'driver' }, id)).toBe(false);
    expect(await canJoinShipment({ id: a.id, role: 'admin' }, id)).toBe(true);
    expect(await canJoinShipment({ id: a.id, role: 'customer' }, 'nope')).toBe(false);
  });
});
