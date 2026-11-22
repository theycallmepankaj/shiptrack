import http from 'node:http';
import request from 'supertest';
import { io as connect } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { initSockets } from '../src/sockets/index.js';
import { Shipment } from '../src/models/Shipment.js';
import { Driver } from '../src/models/Driver.js';
import { User } from '../src/models/User.js';
import { assignShipment } from '../src/services/assignment.js';
import { _resetEtaCache, computeEta, liveEta } from '../src/services/liveTracking.js';
import { seedDemoAccounts } from '../src/utils/seedDemo.js';
import { clearDb, markPaid, startDb, stopDb } from './setup.js';

process.env.AI_SERVICE_URL = 'http://127.0.0.1:1';
const app = createApp();
const server = http.createServer(app);
initSockets(server);
let url;

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const login = async (email, password) => (await request(app).post('/api/auth/login').send({ email, password })).body.accessToken;
const booking = {
  pickup: { address: '100 Feet Road, Indiranagar', city: 'Bengaluru', lat: 12.9719, lng: 77.6412, contactName: 'Chetan', contactPhone: '+91 90000 00003' },
  drop: { address: '5th Block, Koramangala', city: 'Bengaluru', lat: 12.9352, lng: 77.6245, contactName: 'Ben', contactPhone: '+91 99887 66554' },
  package: { weightKg: 2, type: 'parcel' },
  speed: 'standard',
};
const open = (token) =>
  new Promise((resolve, reject) => {
    const s = connect(url, { auth: { token }, transports: ['websocket'], reconnection: false });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
const once = (socket, event, ms = 2000) =>
  new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    socket.once(event, (data) => { clearTimeout(t); resolve(data); });
  });
const emitAck = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));

let tokens;
let sockets = [];
beforeAll(async () => {
  await startDb();
  await new Promise((r) => server.listen(0, r));
  url = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
  await stopDb();
});
beforeEach(async () => {
  _resetEtaCache();
  await seedDemoAccounts();
  tokens = {
    driver: await login('driver1@shiptrack.dev', 'Driver@123'),
    customer: await login('customer@shiptrack.dev', 'Customer@123'),
    admin: await login('admin@shiptrack.dev', 'Admin@123'),
  };
});
afterEach(async () => {
  sockets.forEach((s) => s.close());
  sockets = [];
  await clearDb();
});

async function bookAssigned(status = 'OUT_FOR_DELIVERY') {
  const { body } = await request(app).post('/api/shipments').set(auth(tokens.customer)).send(booking);
  await markPaid(body.shipment.id);
  const s = await Shipment.findById(body.shipment.id);
  const driver = await User.findOne({ email: 'driver1@shiptrack.dev' });
  await assignShipment(s, driver._id, { role: 'admin' });
  if (status !== 'ASSIGNED') await Shipment.updateOne({ _id: s._id }, { status });
  return body.shipment.id;
}

describe('live ETA (FR-23)', () => {
  const ship = { _id: 'x1', status: 'OUT_FOR_DELIVERY', pickup: { location: { coordinates: [77.6412, 12.9719] } }, drop: { location: { coordinates: [77.6245, 12.9352] } } };

  it('estimates minutes to the drop (or the pickup before collection)', () => {
    const toDrop = computeEta(ship, { lat: 12.9719, lng: 77.6412 }, 0);
    expect(toDrop.target).toBe('drop');
    expect(toDrop.minutes).toBeGreaterThan(10);
    expect(computeEta({ ...ship, status: 'ASSIGNED' }, { lat: 12.9719, lng: 77.6412 }, 0)).toMatchObject({ target: 'pickup', minutes: 2 });
  });

  it('only recomputes after > 500 m or 2 minutes', () => {
    const t0 = 1_000_000;
    expect(liveEta(ship, { lat: 12.96, lng: 77.635 }, t0).recomputed).toBe(true);
    const small = liveEta(ship, { lat: 12.9602, lng: 77.635 }, t0 + 30_000); // ~22 m, 30 s
    expect(small.recomputed).toBe(false);
    expect(liveEta(ship, { lat: 12.955, lng: 77.635 }, t0 + 40_000).recomputed).toBe(true); // ~560 m
    expect(liveEta(ship, { lat: 12.955, lng: 77.635 }, t0 + 40_000 + 121_000).recomputed).toBe(true); // 2 min
  });
});

describe('Socket.io live tracking (FR-20–24)', () => {
  it('streams the driver to the owner and admin fleet within 2 s, and not to others', async () => {
    const id = await bookAssigned();
    await request(app).patch('/api/driver/duty').set(auth(tokens.driver)).send({ isOnDuty: true });
    const stranger = (await request(app).post('/api/auth/register').send({ name: 'Eve', email: 'eve@x.com', phone: '+91 91111 22222', password: 'Secret123' })).body.accessToken;

    const [driver, owner, admin, eve] = await Promise.all([open(tokens.driver), open(tokens.customer), open(tokens.admin), open(stranger)]);
    sockets.push(driver, owner, admin, eve);
    expect(await emitAck(owner, 'shipment:join', { shipmentId: id })).toEqual({ ok: true });
    expect(await emitAck(eve, 'shipment:join', { shipmentId: id })).toEqual({ ok: false });

    const started = Date.now();
    const [ownerGot, fleetGot, eveGot, ack] = await Promise.all([
      once(owner, 'shipment:location'),
      once(admin, 'fleet:update'),
      once(eve, 'shipment:location', 800),
      emitAck(driver, 'driver:location', { lat: 12.96, lng: 77.635, heading: 200, speed: 6 }),
    ]);
    expect(ack).toEqual({ ok: true, shipments: 1 });
    expect(Date.now() - started).toBeLessThan(2000); // NFR-1
    expect(ownerGot).toMatchObject({ shipmentId: id, lat: 12.96, lng: 77.635, heading: 200, speedKmh: 22 });
    expect(ownerGot.eta.target).toBe('drop');
    expect(ownerGot.eta.minutes).toBeGreaterThan(0);
    expect(fleetGot).toMatchObject({ lat: 12.96, lng: 77.635, isOnDuty: true, activeShipments: 1 });
    expect(eveGot).toBeNull();

    const d = await Driver.findOne();
    expect(d.currentLocation.coordinates).toEqual([77.635, 12.96]);
    // Out for delivery → the live ETA becomes the delivery estimate.
    const s = await Shipment.findById(id);
    expect(Math.abs(new Date(s.estimatedDeliveryAt) - new Date(ownerGot.eta.arriveAt))).toBeLessThan(1000);
  });

  it('rejects off-duty drivers, non-drivers, bad payloads and bursts', async () => {
    await bookAssigned();
    const [driver, customer] = await Promise.all([open(tokens.driver), open(tokens.customer)]);
    sockets.push(driver, customer);
    expect((await emitAck(driver, 'driver:location', { lat: 12.96, lng: 77.635 })).error).toMatch(/on duty/);
    await request(app).patch('/api/driver/duty').set(auth(tokens.driver)).send({ isOnDuty: true });
    await new Promise((r) => setTimeout(r, 2100));
    expect((await emitAck(driver, 'driver:location', { lat: 'x', lng: 77 })).error).toBe('Invalid location');
    await new Promise((r) => setTimeout(r, 2100));
    expect((await emitAck(driver, 'driver:location', { lat: 12.96, lng: 77.635 })).ok).toBe(true);
    expect((await emitAck(driver, 'driver:location', { lat: 12.96, lng: 77.635 })).error).toBe('Too frequent');
    expect((await emitAck(customer, 'driver:location', { lat: 12.96, lng: 77.635 })).error).toMatch(/Only drivers/);
  });

  it('shows the owner the driver card and last position; public tracking stays private', async () => {
    const id = await bookAssigned('IN_TRANSIT');
    await request(app).patch('/api/driver/duty').set(auth(tokens.driver)).send({ isOnDuty: true, lat: 12.95, lng: 77.63 });
    const { body } = await request(app).get(`/api/shipments/${id}`).set(auth(tokens.customer));
    expect(body.shipment.driver).toMatchObject({ name: 'Ravi Kumar', vehicle: { number: 'KA-01-AB-4821' } });
    expect(body.shipment.live).toMatchObject({ lat: 12.95, lng: 77.63, eta: { target: 'drop' } });

    const pub = await request(app).get(`/api/shipments/track/${body.shipment.trackingId}`);
    expect(pub.body.shipment.live).toBeUndefined();
    expect(JSON.stringify(pub.body)).not.toContain('Ravi');
  });

  it('serves the fleet snapshot to admins only', async () => {
    await bookAssigned();
    await request(app).patch('/api/driver/duty').set(auth(tokens.driver)).send({ isOnDuty: true, lat: 12.95, lng: 77.63 });
    const res = await request(app).get('/api/admin/fleet').set(auth(tokens.admin));
    expect(res.body.drivers).toEqual([expect.objectContaining({ name: 'Ravi Kumar', isOnDuty: true, lat: 12.95, activeShipments: 1 })]);
    expect((await request(app).get('/api/admin/fleet').set(auth(tokens.customer))).status).toBe(403);
  });
});
