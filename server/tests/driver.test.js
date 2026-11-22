import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { env } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { Shipment } from '../src/models/Shipment.js';
import { User } from '../src/models/User.js';
import { assignShipment } from '../src/services/assignment.js';
import { currentOtp, deliveryOtp } from '../src/services/otp.js';
import { orderStops } from '../src/services/routing.js';
import { sniffImage } from '../src/services/storage.js';
import { istPeriodStarts } from '../src/controllers/driverController.js';
import { seedDemoAccounts, seedDemoShipments } from '../src/utils/seedDemo.js';
import { clearDb, markPaid, startDb, stopDb } from './setup.js';

process.env.AI_SERVICE_URL = 'http://127.0.0.1:1';
env.UPLOAD_DIR = path.join(os.tmpdir(), `shiptrack-test-uploads-${process.pid}`);
const app = createApp();

// Smallest valid PNG (1×1)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const login = async (email, password) => (await request(app).post('/api/auth/login').send({ email, password })).body.accessToken;
const booking = {
  pickup: { address: '100 Feet Road, Indiranagar', city: 'Bengaluru', lat: 12.9719, lng: 77.6412, contactName: 'Chetan', contactPhone: '+91 90000 00003' },
  drop: { address: '5th Block, Koramangala', city: 'Bengaluru', lat: 12.9352, lng: 77.6245, contactName: 'Ben', contactPhone: '+91 99887 66554' },
  package: { weightKg: 2, type: 'parcel' },
  speed: 'standard',
};

let tokens;
let driverUser;
async function bookAndAssign() {
  const { body } = await request(app).post('/api/shipments').set(auth(tokens.customer)).send(booking);
  await markPaid(body.shipment.id);
  const s = await Shipment.findById(body.shipment.id);
  await assignShipment(s, driverUser._id, { role: 'admin' });
  return body.shipment.id;
}
const setStatus = (id, status, extra = {}) =>
  request(app).patch(`/api/driver/shipments/${id}/status`).set(auth(tokens.driver)).send({ status, ...extra });
const goOnDuty = () => request(app).patch('/api/driver/duty').set(auth(tokens.driver)).send({ isOnDuty: true, lat: 12.97, lng: 77.64 });
const deliver = (id, otp, { photo = true } = {}) => {
  const r = request(app).post(`/api/driver/shipments/${id}/deliver`).set(auth(tokens.driver)).field('otp', otp);
  return photo ? r.attach('photo', PNG, { filename: 'p.png', contentType: 'image/png' }) : r;
};

beforeAll(startDb);
afterAll(async () => {
  await stopDb();
  await rm(env.UPLOAD_DIR, { recursive: true, force: true });
});
beforeEach(async () => {
  await seedDemoAccounts();
  driverUser = await User.findOne({ email: 'driver1@shiptrack.dev' });
  tokens = {
    driver: await login('driver1@shiptrack.dev', 'Driver@123'),
    customer: await login('customer@shiptrack.dev', 'Customer@123'),
  };
});
afterEach(clearDb);

describe('helpers', () => {
  it('orders stops nearest-first from the start point', () => {
    const start = { lat: 0, lng: 0 };
    const stops = [{ id: 'far', lat: 0, lng: 3 }, { id: 'near', lat: 0, lng: 1 }, { id: 'mid', lat: 0, lng: 2 }];
    expect(orderStops(start, stops).map((s) => s.id)).toEqual(['near', 'mid', 'far']);
  });

  it('never visits a drop before its pickup in the fallback order', () => {
    const start = { lat: 0, lng: 0 };
    const stops = [
      { id: 'a-drop', lat: 0, lng: 0.1, kind: 'drop', shipmentId: 'a' }, // nearest, but its pickup is far
      { id: 'a-pickup', lat: 0, lng: 3, kind: 'pickup', shipmentId: 'a' },
      { id: 'b-drop', lat: 0, lng: 1, kind: 'drop', shipmentId: 'b' },
    ];
    expect(orderStops(start, stops).map((s) => s.id)).toEqual(['b-drop', 'a-pickup', 'a-drop']);
  });

  it('derives stable 4-digit OTPs that change per version', () => {
    expect(deliveryOtp('abc', 1)).toMatch(/^\d{4}$/);
    expect(deliveryOtp('abc', 1)).toBe(deliveryOtp('abc', 1));
    expect(deliveryOtp('abc', 1)).not.toBe(deliveryOtp('abc', 2));
  });

  it('sniffs image types from content', () => {
    expect(sniffImage(PNG)?.ext).toBe('png');
    expect(sniffImage(Buffer.from('<?php echo 1; ?>'))).toBeNull();
  });

  it('computes IST period starts', () => {
    const p = istPeriodStarts(new Date('2026-11-25T20:00:00Z')); // Thu 26 Nov 01:30 IST
    expect(p.today.toISOString()).toBe('2026-11-25T18:30:00.000Z');
    expect(p.week.toISOString()).toBe('2026-11-22T18:30:00.000Z'); // Mon 23 Nov 00:00 IST
    expect(p.month.toISOString()).toBe('2026-10-31T18:30:00.000Z');
  });
});

describe('driver API', () => {
  it('only drivers can use it', async () => {
    expect((await request(app).get('/api/driver/me').set(auth(tokens.customer))).status).toBe(403);
    expect((await request(app).get('/api/driver/me').set(auth(tokens.driver))).body.driver.vehicle.number).toBe('KA-01-AB-4821');
  });

  it('toggles duty and stores location', async () => {
    const res = await goOnDuty();
    expect(res.body.driver).toMatchObject({ isOnDuty: true, location: { lat: 12.97, lng: 77.64 } });
    const off = await request(app).patch('/api/driver/duty').set(auth(tokens.driver)).send({ isOnDuty: false });
    expect(off.body.driver.isOnDuty).toBe(false);
  });

  it('lists today’s stops in order with the right next stop', async () => {
    const a = await bookAndAssign();
    const b = await bookAndAssign();
    await goOnDuty();
    await setStatus(b, 'PICKED_UP');
    const { body } = await request(app).get('/api/driver/shipments/today').set(auth(tokens.driver));
    // a is uncollected → pickup + drop; b is collected → drop only.
    expect(body.stops).toHaveLength(3);
    expect(body.stops.map((s) => s.sequence)).toEqual([1, 2, 3]);
    const keys = body.stops.map((s) => `${s.shipment.id}:${s.kind}`);
    expect(keys.indexOf(`${a}:pickup`)).toBeLessThan(keys.indexOf(`${a}:drop`));
    expect(keys).toContain(`${b}:drop`);
    expect(body.stops.find((s) => s.shipment.id === a && s.kind === 'drop').afterPickup).toBe(true);
    expect(body.route).toMatchObject({ solver: 'greedy', stops: 3 });
    expect(body.stops[0].shipment.price).toBeUndefined(); // drivers don't see what the customer paid
  });

  it('requires being on duty and being the assigned driver', async () => {
    const id = await bookAndAssign();
    expect((await setStatus(id, 'PICKED_UP')).status).toBe(409);
    await goOnDuty();
    const other = await User.create({ name: 'Other Driver', email: 'd2@x.com', role: 'driver', passwordHash: 'x' });
    await Shipment.updateOne({ _id: id }, { driverId: other._id });
    expect((await setStatus(id, 'PICKED_UP')).status).toBe(404);
  });

  it('enforces the lifecycle and won’t mark delivered without proof', async () => {
    const id = await bookAndAssign();
    await goOnDuty();
    expect((await setStatus(id, 'OUT_FOR_DELIVERY')).status).toBe(400); // skip
    expect((await setStatus(id, 'DELIVERED')).status).toBe(400); // not allowed via /status
    expect((await setStatus(id, 'PICKED_UP', { lat: 12.97, lng: 77.64 })).status).toBe(200);
    const s = await Shipment.findById(id);
    expect(s.statusHistory.at(-1)).toMatchObject({ status: 'PICKED_UP', byRole: 'driver' });
    expect(s.statusHistory.at(-1).location.coordinates).toEqual([77.64, 12.97]);
  });

  it('full delivery: OTP to customer, wrong code rejected, proof stored, earnings counted', async () => {
    const id = await bookAndAssign();
    await goOnDuty();
    await setStatus(id, 'PICKED_UP');
    await setStatus(id, 'IN_TRANSIT');
    await setStatus(id, 'OUT_FOR_DELIVERY');

    // Customer sees the code; the driver doesn't.
    const cust = await request(app).get(`/api/shipments/${id}`).set(auth(tokens.customer));
    const otp = cust.body.shipment.deliveryOtp;
    expect(otp).toMatch(/^\d{4}$/);
    expect(otp).toBe(currentOtp(await Shipment.findById(id)));
    const drv = await request(app).get(`/api/shipments/${id}`).set(auth(tokens.driver));
    expect(drv.body.shipment.deliveryOtp).toBeUndefined();
    expect(JSON.stringify((await Shipment.findById(id).select('+deliveryOtpHash')).toObject())).not.toContain(`"${otp}"`);

    const wrong = otp === '0000' ? '1111' : '0000';
    const bad = await deliver(id, wrong);
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/4 tries left/);
    expect((await deliver(id, otp, { photo: false })).status).toBe(400); // proof required

    const ok = await deliver(id, otp);
    expect(ok.status).toBe(200);
    expect(ok.body.shipment.status).toBe('DELIVERED');
    const photoUrl = ok.body.shipment.proofOfDelivery.photoUrl;
    expect(photoUrl).toMatch(/\/uploads\/proof\/[0-9a-f-]+\.png$/);
    const img = await request(app).get(new URL(photoUrl).pathname);
    expect(img.status).toBe(200);
    expect(img.headers['cross-origin-resource-policy']).toBe('cross-origin');

    const hist = await request(app).get('/api/driver/history').set(auth(tokens.driver));
    expect(hist.body.summary.today.deliveries).toBe(1);
    expect(hist.body.summary.today.earnings).toBe(ok.body.shipment.driverEarning);
    expect(hist.body.summary.totalDeliveries).toBe(1);
    expect(hist.body.items[0].id).toBe(id);
  });

  it('locks after 5 wrong codes; a failed attempt + retry issues a new code', async () => {
    const id = await bookAndAssign();
    await goOnDuty();
    for (const s of ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY']) await setStatus(id, s);
    const first = currentOtp(await Shipment.findById(id));
    const wrong = first === '0000' ? '1111' : '0000';
    for (let i = 0; i < 5; i++) await deliver(id, wrong);
    expect((await deliver(id, first)).status).toBe(423);

    expect((await setStatus(id, 'FAILED_ATTEMPT')).status).toBe(400); // reason required
    const failed = await setStatus(id, 'FAILED_ATTEMPT', { reason: 'CUSTOMER_UNAVAILABLE', note: 'No answer at door' });
    expect(failed.body.shipment.statusHistory.at(-1).note).toBe('Customer not available — No answer at door');
    await setStatus(id, 'OUT_FOR_DELIVERY');
    const second = currentOtp(await Shipment.findById(id));
    expect(second).not.toBe(first === second ? null : first);
    expect((await deliver(id, second)).status).toBe(200);
  });

  it('rejects non-image uploads even with an image content type', async () => {
    const id = await bookAndAssign();
    await goOnDuty();
    for (const s of ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY']) await setStatus(id, s);
    const otp = currentOtp(await Shipment.findById(id));
    const res = await request(app).post(`/api/driver/shipments/${id}/deliver`).set(auth(tokens.driver))
      .field('otp', otp).attach('photo', Buffer.from('not really a png'), { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect((await Shipment.findById(id)).status).toBe('OUT_FOR_DELIVERY');
  });

  it('can return a parcel to sender after a failed attempt', async () => {
    const id = await bookAndAssign();
    await goOnDuty();
    for (const s of ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY']) await setStatus(id, s);
    await setStatus(id, 'FAILED_ATTEMPT', { reason: 'REFUSED' });
    expect((await setStatus(id, 'RETURNED')).body.shipment.status).toBe('RETURNED');
  });
});

describe('demo seed', () => {
  it('creates assigned demo shipments once', async () => {
    expect(await seedDemoShipments()).toBe(3);
    expect(await seedDemoShipments()).toBe(0);
    const { body } = await request(app).get('/api/driver/shipments/today').set(auth(tokens.driver));
    expect(body.stops).toHaveLength(5); // 2 uncollected (pickup + drop) + 1 collected (drop)
  });
});
