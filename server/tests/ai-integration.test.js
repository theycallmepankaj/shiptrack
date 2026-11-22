import http from 'node:http';
import request from 'supertest';
import { env } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { Driver } from '../src/models/Driver.js';
import { Shipment } from '../src/models/Shipment.js';
import { User } from '../src/models/User.js';
import { assignShipment } from '../src/services/assignment.js';
import { seedDemoAccounts } from '../src/utils/seedDemo.js';
import { clearDb, markPaid, startDb, stopDb } from './setup.js';

// A stub of the Python service, so we can check Node uses its answers — and falls back when it fails.
let mode = 'ok';
const calls = [];
const stub = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    calls.push({ path: req.url, key: req.headers['x-internal-key'], body });
    if (mode === 'down') return res.writeHead(500).end();
    const json = (o) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(o));
    if (req.url === '/eta') return json({ eta_hours: 5, p50_hours: 4, source: 'model' });
    if (req.url === '/route/optimize') return json({ order: body.stops.map((s) => s.id).reverse(), total_km: 12.3, solver: 'ortools' });
    if (req.url === '/assign/suggest') return json({ driver_id: body.candidates.find((c) => c.on_duty)?.driver_id ?? null, ranked: [], reason: 'stub' });
    if (req.url === '/forecast/demand') return json({ start: '2026-11-23', days: 7, cities: [], total_daily: [1, 2, 3, 4, 5, 6, 7] });
    res.writeHead(404).end();
  });
});

const app = createApp();
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const login = async (email, password) => (await request(app).post('/api/auth/login').send({ email, password })).body.accessToken;
const booking = {
  pickup: { address: '100 Feet Road, Indiranagar', city: 'Bengaluru', lat: 12.9719, lng: 77.6412, contactName: 'Chetan', contactPhone: '+91 90000 00003' },
  drop: { address: '5th Block, Koramangala', city: 'Bengaluru', lat: 12.9352, lng: 77.6245, contactName: 'Ben', contactPhone: '+91 99887 66554' },
  package: { weightKg: 2, type: 'parcel' },
  speed: 'standard',
};
let tokens;
let original;

beforeAll(async () => {
  await startDb();
  await new Promise((r) => stub.listen(0, r));
  original = env.AI_SERVICE_URL;
  env.AI_SERVICE_URL = `http://127.0.0.1:${stub.address().port}`;
});
afterAll(async () => {
  env.AI_SERVICE_URL = original;
  await new Promise((r) => stub.close(r));
  await stopDb();
});
beforeEach(async () => {
  mode = 'ok';
  calls.length = 0;
  await seedDemoAccounts();
  tokens = {
    customer: await login('customer@shiptrack.dev', 'Customer@123'),
    driver: await login('driver1@shiptrack.dev', 'Driver@123'),
    admin: await login('admin@shiptrack.dev', 'Admin@123'),
  };
});
afterEach(clearDb);

describe('Node ↔ Python integration (with fallbacks)', () => {
  it('uses the model ETA, sends city info and the internal key', async () => {
    const { body } = await request(app).post('/api/shipments').set(auth(tokens.customer)).send(booking);
    const s = await Shipment.findById(body.shipment.id);
    expect(s.etaSource).toBe('model');
    const eta = calls.find((c) => c.path === '/eta');
    expect(eta.key).toBe(env.INTERNAL_API_KEY);
    expect(eta.body).toMatchObject({ city: 'Bengaluru', drop_city: 'Bengaluru', speed: 'standard' });

    mode = 'down';
    const fb = await request(app).post('/api/shipments').set(auth(tokens.customer)).send(booking);
    expect((await Shipment.findById(fb.body.shipment.id)).etaSource).toBe('fallback');
  });

  it('orders the driver’s route with the optimiser, or greedily if it’s down', async () => {
    const driverUser = await User.findOne({ email: 'driver1@shiptrack.dev' });
    for (let i = 0; i < 2; i++) {
      const { body } = await request(app).post('/api/shipments').set(auth(tokens.customer)).send(booking);
      await markPaid(body.shipment.id);
      await assignShipment(await Shipment.findById(body.shipment.id), driverUser._id);
    }
    await Driver.updateOne({ userId: driverUser._id }, { currentLocation: { type: 'Point', coordinates: [77.64, 12.97] } });
    const ok = await request(app).get('/api/driver/shipments/today').set(auth(tokens.driver));
    expect(ok.body.route).toEqual({ totalKm: 12.3, solver: 'ortools', stops: 4 });
    const sent = calls.find((c) => c.path === '/route/optimize').body;
    expect(sent.stops.filter((s) => s.kind === 'pickup')).toHaveLength(2);
    expect(sent.stops.every((s) => s.shipment_id)).toBe(true);

    mode = 'down';
    const fb = await request(app).get('/api/driver/shipments/today').set(auth(tokens.driver));
    expect(fb.body.route.solver).toBe('greedy');
    expect(fb.body.stops).toHaveLength(4);
  });

  it('auto-assigns with the AI suggestion, falling back to $near', async () => {
    const driverUser = await User.findOne({ email: 'driver1@shiptrack.dev' });
    await Driver.updateOne({ userId: driverUser._id }, { isOnDuty: true, currentLocation: { type: 'Point', coordinates: [77.64, 12.97] } });
    const a = await markPaid((await request(app).post('/api/shipments').set(auth(tokens.customer)).send(booking)).body.shipment.id);
    const res = await request(app).post(`/api/admin/shipments/${a}/auto-assign`).set(auth(tokens.admin));
    expect(res.body.driver.name).toBe('Ravi Kumar');
    expect((await Shipment.findById(a)).statusHistory.at(-1).note).toMatch(/best score/);

    mode = 'down';
    const b = await markPaid((await request(app).post('/api/shipments').set(auth(tokens.customer)).send(booking)).body.shipment.id);
    await request(app).post(`/api/admin/shipments/${b}/auto-assign`).set(auth(tokens.admin));
    expect((await Shipment.findById(b)).statusHistory.at(-1).note).toMatch(/nearest available/);
  });

  it('proxies the demand forecast, 503 when the service is down', async () => {
    expect((await request(app).get('/api/admin/forecast').set(auth(tokens.admin))).body.total_daily).toHaveLength(7);
    mode = 'down';
    expect((await request(app).get('/api/admin/forecast').set(auth(tokens.admin))).status).toBe(503);
  });
});
