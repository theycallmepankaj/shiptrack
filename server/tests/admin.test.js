import request from 'supertest';
import { createApp } from '../src/app.js';
import { Driver } from '../src/models/Driver.js';
import { Shipment } from '../src/models/Shipment.js';
import { User } from '../src/models/User.js';
import { seedDemoAccounts } from '../src/utils/seedDemo.js';
import { seedHistory } from '../src/utils/seedHistory.js';
import { clearDb, markPaid, startDb, stopDb } from './setup.js';

process.env.AI_SERVICE_URL = 'http://127.0.0.1:1';
const app = createApp();
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const login = async (email, password) => (await request(app).post('/api/auth/login').send({ email, password })).body.accessToken;
const booking = (weightKg = 2) => ({
  pickup: { address: '100 Feet Road, Indiranagar', city: 'Bengaluru', lat: 12.9719, lng: 77.6412, contactName: 'Chetan', contactPhone: '+91 90000 00003' },
  drop: { address: '5th Block, Koramangala', city: 'Bengaluru', lat: 12.9352, lng: 77.6245, contactName: 'Ben', contactPhone: '+91 99887 66554' },
  package: { weightKg, type: 'parcel' },
  speed: 'standard',
});
const newDriver = (n, extra = {}) => ({
  name: `Driver ${n}`, email: `d${n}@x.com`, phone: '+91 98000 0000' + n, password: 'Secret123',
  vehicle: { type: 'bike', number: `KA-01-ZZ-00${n}0`, capacityKg: 20 }, ...extra,
});

let admin;
let customer;
beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await seedDemoAccounts();
  admin = await login('admin@shiptrack.dev', 'Admin@123');
  customer = await login('customer@shiptrack.dev', 'Customer@123');
});
afterEach(clearDb);

async function book(weightKg) {
  return markPaid((await request(app).post('/api/shipments').set(auth(customer)).send(booking(weightKg))).body.shipment.id);
}
async function placeDriver(email, { lat, lng, onDuty = true }) {
  const u = await User.findOne({ email });
  await Driver.updateOne({ userId: u._id }, { isOnDuty: onDuty, currentLocation: { type: 'Point', coordinates: [lng, lat] }, lastLocationAt: new Date() });
  return u._id.toString();
}

describe('admin access', () => {
  it('is admin-only', async () => {
    for (const path of ['/api/admin/drivers', '/api/admin/shipments', '/api/admin/stats', '/api/admin/pricing']) {
      expect((await request(app).get(path).set(auth(customer))).status).toBe(403);
    }
  });
});

describe('admin team (FR-2)', () => {
  it('admins create, deactivate and reactivate other admins — never themselves', async () => {
    const auth = { Authorization: `Bearer ${admin}` };
    const created = await request(app).post('/api/admin/admins').set(auth).send({ name: 'Second Admin', email: 'ops@shiptrack.dev', phone: '+91 90000 00009', password: 'Second@123' });
    expect(created.status).toBe(201);
    expect((await request(app).post('/api/admin/admins').set(auth).send({ name: 'Dup', email: 'ops@shiptrack.dev', phone: '+91 90000 00009', password: 'Second@123' })).status).toBe(400);
    const second = await login('ops@shiptrack.dev', 'Second@123');
    expect(second).toBeDefined();
    expect((await request(app).get('/api/admin/admins').set(auth)).body.admins).toHaveLength(2);

    const me = (await request(app).get('/api/auth/me').set(auth)).body.user;
    expect((await request(app).patch(`/api/admin/admins/${me.id}`).set(auth).send({ isActive: false })).body.error).toMatch(/your own/);
    const off = await request(app).patch(`/api/admin/admins/${created.body.admin.id}`).set(auth).send({ isActive: false });
    expect(off.body.admin.isActive).toBe(false);
    expect((await request(app).post('/api/auth/login').send({ email: 'ops@shiptrack.dev', password: 'Second@123' })).status).toBe(403);
    // The remaining admin can't be deactivated by the other one either: always one active admin.
    expect((await request(app).patch(`/api/admin/admins/${created.body.admin.id}`).set(auth).send({ isActive: true })).body.admin.isActive).toBe(true);
    expect((await request(app).post('/api/admin/admins').set({ Authorization: `Bearer ${customer}` }).send({})).status).toBe(403);
  });
});

describe('drivers (FR-30)', () => {
  it('creates a driver who can log in, and rejects duplicates', async () => {
    const res = await request(app).post('/api/admin/drivers').set(auth(admin)).send(newDriver(1));
    expect(res.status).toBe(201);
    expect(res.body.driver).toMatchObject({ name: 'Driver 1', isActive: true, vehicle: { number: 'KA-01-ZZ-0010' } });
    expect(await login('d1@x.com', 'Secret123')).toBeDefined();
    expect((await request(app).post('/api/admin/drivers').set(auth(admin)).send(newDriver(1))).status).toBe(400);
    const sameVehicle = await request(app).post('/api/admin/drivers').set(auth(admin)).send({ ...newDriver(2), vehicle: newDriver(1).vehicle });
    expect(sameVehicle.status).toBe(400);
  });

  it('lists and filters drivers', async () => {
    await request(app).post('/api/admin/drivers').set(auth(admin)).send(newDriver(1));
    await placeDriver('driver1@shiptrack.dev', { lat: 12.97, lng: 77.64 });
    const all = await request(app).get('/api/admin/drivers').set(auth(admin));
    expect(all.body.drivers).toHaveLength(2);
    const onDuty = await request(app).get('/api/admin/drivers?status=on-duty').set(auth(admin));
    expect(onDuty.body.drivers.map((d) => d.name)).toEqual(['Ravi Kumar']);
    expect((await request(app).get('/api/admin/drivers?q=driver%201').set(auth(admin))).body.drivers).toHaveLength(1);
  });

  it('edits vehicles and deactivates — but not with active shipments', async () => {
    const { body } = await request(app).post('/api/admin/drivers').set(auth(admin)).send(newDriver(1));
    const id = body.driver.id;
    const edit = await request(app).patch(`/api/admin/drivers/${id}`).set(auth(admin)).send({ vehicle: { capacityKg: 300, type: 'van' } });
    expect(edit.body.driver.vehicle).toMatchObject({ type: 'van', capacityKg: 300, number: 'KA-01-ZZ-0010' });

    const shipmentId = await book();
    await request(app).patch(`/api/admin/shipments/${shipmentId}/assign`).set(auth(admin)).send({ driverId: id });
    expect((await request(app).patch(`/api/admin/drivers/${id}`).set(auth(admin)).send({ isActive: false })).status).toBe(409);
    await Shipment.updateOne({ _id: shipmentId }, { status: 'DELIVERED' });
    const off = await request(app).patch(`/api/admin/drivers/${id}`).set(auth(admin)).send({ isActive: false });
    expect(off.body.driver).toMatchObject({ isActive: false, isOnDuty: false });
    expect((await request(app).post('/api/auth/login').send({ email: 'd1@x.com', password: 'Secret123' })).status).toBe(403);
  });
});

describe('assignment (FR-31)', () => {
  it('assigns, reassigns, and refuses after pickup', async () => {
    const id = await book();
    const ravi = (await User.findOne({ email: 'driver1@shiptrack.dev' }))._id.toString();
    const other = (await request(app).post('/api/admin/drivers').set(auth(admin)).send(newDriver(1))).body.driver.id;

    expect((await request(app).patch(`/api/admin/shipments/${id}/assign`).set(auth(admin)).send({ driverId: ravi })).body.shipment.status).toBe('ASSIGNED');
    const re = await request(app).patch(`/api/admin/shipments/${id}/assign`).set(auth(admin)).send({ driverId: other });
    expect(re.body.shipment.driverId).toBe(other);
    const s = await Shipment.findById(id);
    expect(s.statusHistory.at(-1).note).toBe('Reassigned to Driver');
    await Shipment.updateOne({ _id: id }, { status: 'PICKED_UP' });
    expect((await request(app).patch(`/api/admin/shipments/${id}/assign`).set(auth(admin)).send({ driverId: ravi })).status).toBe(400);
  });

  it('ranks candidates and auto-assigns the nearest on-duty driver with space', async () => {
    const near = (await request(app).post('/api/admin/drivers').set(auth(admin)).send(newDriver(1))).body.driver.id;
    const far = (await request(app).post('/api/admin/drivers').set(auth(admin)).send(newDriver(2))).body.driver.id;
    await placeDriver('d1@x.com', { lat: 12.972, lng: 77.641 }); // ~0.1 km from pickup
    await placeDriver('d2@x.com', { lat: 12.93, lng: 77.62 }); // ~5 km
    await placeDriver('driver1@shiptrack.dev', { lat: 12.9719, lng: 77.6412, onDuty: false }); // nearest but off duty

    const id = await book(2);
    const ranked = (await request(app).get(`/api/admin/shipments/${id}/candidates`).set(auth(admin))).body.candidates;
    expect(ranked.map((c) => c.driverId).slice(0, 2)).toEqual([near, far]);
    expect(ranked.at(-1)).toMatchObject({ name: 'Ravi Kumar', isOnDuty: false });

    // Fill the near driver's bike so it can't take a 15 kg parcel.
    await Shipment.create({ ...(await Shipment.findById(id)).toObject(), _id: undefined, trackingId: 'SHP-FULL01', driverId: near, status: 'ASSIGNED', package: { weightKg: 18, type: 'parcel' } });
    const heavy = await book(15);
    const res = await request(app).post(`/api/admin/shipments/${heavy}/auto-assign`).set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.driver.id).toBe(far);
    expect((await Shipment.findById(heavy)).statusHistory.at(-1).note).toMatch(/Auto-assigned/);
  });

  it('returns 409 when nobody is available', async () => {
    const id = await book();
    expect((await request(app).post(`/api/admin/shipments/${id}/auto-assign`).set(auth(admin))).status).toBe(409);
  });
});

describe('shipments table (FR-32)', () => {
  it('filters by status, driver, city, date and tracking ID', async () => {
    const a = await book();
    const b = await book();
    const ravi = (await User.findOne({ email: 'driver1@shiptrack.dev' }))._id.toString();
    await request(app).patch(`/api/admin/shipments/${a}/assign`).set(auth(admin)).send({ driverId: ravi });
    const get = (qs) => request(app).get(`/api/admin/shipments?${qs}`).set(auth(admin)).then((r) => r.body);

    expect((await get('')).total).toBe(2);
    expect((await get('status=ASSIGNED')).items.map((i) => i.id)).toEqual([a]);
    expect((await get(`driver=${ravi}`)).items[0].driver.name).toBe('Ravi Kumar');
    expect((await get('driver=unassigned')).items.map((i) => i.id)).toEqual([b]);
    expect((await get('city=bengaluru')).total).toBe(2);
    expect((await get('city=Mumbai')).total).toBe(0);
    expect((await get(`from=${new Date(Date.now() + 86_400_000).toISOString()}`)).total).toBe(0);
    const tid = (await Shipment.findById(b)).trackingId;
    expect((await get(`q=${tid}`)).items.map((i) => i.id)).toEqual([b]);
    const first = await get('');
    expect(first.items[0]).toMatchObject({ customer: 'Chetan Customer' });
    expect(first.cities).toEqual(['Bengaluru']);
  });
});

describe('pricing (FR-34)', () => {
  it('updates the active rule, keeps history, and quotes use it', async () => {
    expect((await request(app).get('/api/admin/pricing').set(auth(admin))).body.active.isDefault).toBe(true);
    const bad = await request(app).put('/api/admin/pricing').set(auth(admin)).send({ baseFare: 10, perKm: 1, perKg: 1, expressMultiplier: 0.5 });
    expect(bad.status).toBe(400);
    await request(app).put('/api/admin/pricing').set(auth(admin)).send({ baseFare: 100, perKm: 0, perKg: 0, expressMultiplier: 2 });
    await request(app).put('/api/admin/pricing').set(auth(admin)).send({ baseFare: 50, perKm: 0, perKg: 0, expressMultiplier: 2 });
    const pricing = (await request(app).get('/api/admin/pricing').set(auth(admin))).body;
    expect(pricing.active.baseFare).toBe(50);
    expect(pricing.history.map((h) => h.baseFare)).toEqual([100]);
    expect((await request(app).get('/api/pricing')).body).toEqual({ baseFare: 50, perKm: 0, perKg: 0, expressMultiplier: 2 });
    const q = await request(app).post('/api/shipments/quote').set(auth(customer)).send({ pickup: booking().pickup, drop: booking().drop, package: { weightKg: 1 } });
    expect(q.body.options.standard.price.total).toBe(50);
  });
});

describe('stats (FR-33) on seeded history', () => {
  it('summarises 90 days of realistic data', async () => {
    const n = await seedHistory({ days: 90 });
    expect(n).toBeGreaterThan(700);
    expect(await seedHistory()).toBe(0); // idempotent

    const { body } = await request(app).get('/api/admin/stats').set(auth(admin));
    expect(body.series.daily).toHaveLength(30);
    expect(body.series.weekly).toHaveLength(12);
    expect(body.series.monthly).toHaveLength(12);
    expect(body.kpis.onTimeRate).toBeGreaterThan(75);
    expect(body.kpis.onTimeRate).toBeLessThan(97);
    expect(body.kpis.revenue.month).toBeGreaterThan(0);
    expect(body.kpis.drivers.total).toBe(8);
    expect(body.topDrivers.length).toBe(5);
    expect(body.topDrivers[0].deliveries).toBeGreaterThanOrEqual(body.topDrivers[1].deliveries);
    expect(body.statusBreakdown.find((s) => s.status === 'DELIVERED').count).toBeGreaterThan(100);
    const sum30 = body.series.daily.reduce((t, d) => t + d.shipments, 0);
    expect(body.statusBreakdown.reduce((t, s) => t + s.count, 0)).toBe(sum30);
    console.log('seeded', n, 'on-time', body.kpis.onTimeRate, 'delayed', body.kpis.delayed, 'today', body.kpis.shipmentsToday);
  }, 60_000);
});
