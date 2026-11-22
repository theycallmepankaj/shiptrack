import { createHmac } from 'node:crypto';
import http from 'node:http';
import { jest } from '@jest/globals';
import request from 'supertest';
import { io as connect } from 'socket.io-client';
import { env } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { Notification } from '../src/models/Notification.js';
import { Shipment } from '../src/models/Shipment.js';
import { User } from '../src/models/User.js';
import { invoiceLines } from '../src/services/invoice.js';
import { expireUnpaid } from '../src/services/payments.js';
import { initSockets } from '../src/sockets/index.js';
import { seedDemoAccounts } from '../src/utils/seedDemo.js';
import { clearDb, startDb, stopDb } from './setup.js';

const app = createApp();
const server = http.createServer(app);
initSockets(server);
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const login = async (email, password) => (await request(app).post('/api/auth/login').send({ email, password })).body.accessToken;
const booking = {
  pickup: { address: '100 Feet Road, Indiranagar', city: 'Bengaluru', lat: 12.9719, lng: 77.6412, contactName: 'Chetan', contactPhone: '+91 90000 00003' },
  drop: { address: '5th Block, Koramangala', city: 'Bengaluru', lat: 12.9352, lng: 77.6245, contactName: 'Ben', contactPhone: '+91 99887 66554' },
  package: { weightKg: 2, type: 'parcel' },
  speed: 'express',
};
const book = async (token = tokens.customer) => (await request(app).post('/api/shipments').set(auth(token)).send(booking)).body.shipment;
const pdfBody = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
const waitFor = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};
let tokens;
let port;

beforeAll(async () => {
  await startDb();
  await new Promise((r) => server.listen(0, r));
  port = server.address().port;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
  await stopDb();
});
beforeEach(async () => {
  await seedDemoAccounts();
  await request(app).post('/api/auth/register').send({ name: 'Other Person', email: 'other@example.com', phone: '+91 98888 77777', password: 'Other@1234' });
  tokens = {
    admin: await login('admin@shiptrack.dev', 'Admin@123'),
    customer: await login('customer@shiptrack.dev', 'Customer@123'),
    other: await login('other@example.com', 'Other@1234'),
  };
});
afterEach(async () => {
  jest.restoreAllMocks();
  Object.assign(env, { RAZORPAY_KEY_ID: undefined, RAZORPAY_KEY_SECRET: undefined, RAZORPAY_WEBHOOK_SECRET: undefined });
  await clearDb();
});

describe('mock checkout (development, no Razorpay keys)', () => {
  it('books unpaid, pays, sends invoice and notification; only paid shipments can be assigned', async () => {
    const s = await book();
    expect(s.payment).toMatchObject({ status: 'pending', amount: s.price.total });
    expect((await request(app).get('/api/payments/config').set(auth(tokens.customer))).body.provider).toBe('mock');

    const driver = await User.findOne({ email: 'driver1@shiptrack.dev' });
    const early = await request(app).patch(`/api/admin/shipments/${s.id}/assign`).set(auth(tokens.admin)).send({ driverId: driver.id });
    expect(early.body.error).toMatch(/Waiting for the customer to pay/);
    expect((await request(app).get(`/api/shipments/${s.id}/invoice`).set(auth(tokens.customer))).status).toBe(400);

    const order = (await request(app).post('/api/payments/create-order').set(auth(tokens.customer)).send({ shipmentId: s.id })).body.order;
    expect(order).toMatchObject({ provider: 'mock', amount: s.price.total, currency: 'INR', keyId: null, trackingId: s.trackingId });

    const pay = { shipmentId: s.id, orderId: order.orderId, paymentId: 'pay_mock_abc123', signature: 'mock', method: 'card' };
    expect((await request(app).post('/api/payments/verify').set(auth(tokens.customer)).send({ ...pay, signature: 'forged' })).status).toBe(400);
    expect((await request(app).post('/api/payments/verify').set(auth(tokens.customer)).send({ ...pay, orderId: 'order_mock_other' })).status).toBe(400);
    expect((await request(app).post('/api/payments/verify').set(auth(tokens.other)).send(pay)).status).toBe(404);
    const ok = await request(app).post('/api/payments/verify').set(auth(tokens.customer)).send(pay);
    expect(ok.body.shipment.payment).toMatchObject({ status: 'paid', paymentId: 'pay_mock_abc123', method: 'card' });
    // A repeated callback is harmless and doesn't notify twice.
    expect((await request(app).post('/api/payments/verify').set(auth(tokens.customer)).send(pay)).status).toBe(200);
    const notes = await waitFor(async () => {
      const n = await Notification.find({ type: 'payment' });
      return n.length && n;
    });
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toMatch(/Payment received/);
    expect((await request(app).post('/api/payments/create-order').set(auth(tokens.customer)).send({ shipmentId: s.id })).body.error).toMatch(/already paid/);

    for (const token of [tokens.customer, tokens.admin]) {
      const pdf = await request(app).get(`/api/shipments/${s.id}/invoice`).set(auth(token)).buffer(true).parse(pdfBody);
      expect(pdf.status).toBe(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect(pdf.headers['content-disposition']).toBe(`attachment; filename="INV-${s.trackingId.slice(4)}.pdf"`);
      expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    }
    expect((await request(app).get(`/api/shipments/${s.id}/invoice`).set(auth(tokens.other))).status).toBe(404);

    expect((await request(app).patch(`/api/admin/shipments/${s.id}/assign`).set(auth(tokens.admin)).send({ driverId: driver.id })).status).toBe(200);
  });

  it('records a failed payment and lets the customer retry', async () => {
    const s = await book();
    const { orderId } = (await request(app).post('/api/payments/create-order').set(auth(tokens.customer)).send({ shipmentId: s.id })).body.order;
    const f = await request(app).post('/api/payments/failed').set(auth(tokens.customer)).send({ shipmentId: s.id, orderId, reason: 'Card declined' });
    expect(f.body.shipment.payment).toMatchObject({ status: 'failed', failureReason: 'Card declined' });
    const retry = (await request(app).post('/api/payments/create-order').set(auth(tokens.customer)).send({ shipmentId: s.id })).body.order;
    expect(retry.orderId).not.toBe(orderId);
    const ok = await request(app).post('/api/payments/verify').set(auth(tokens.customer)).send({ shipmentId: s.id, orderId: retry.orderId, paymentId: 'pay_mock_retry1', signature: 'mock' });
    expect(ok.body.shipment.payment.status).toBe('paid');
  });

  it('invoice lines add up to the total', () => {
    const s = { distanceKm: 5.3, package: { weightKg: 2 }, price: { base: 40, distanceCharge: 6.36, weightCharge: 30, speedCharge: 45.22, chargeableWeightKg: 2, total: 122 } };
    const lines = invoiceLines(s);
    expect(lines.map((l) => l.label)).toEqual(['Base fare', 'Distance (5.3 km)', 'Weight (2 kg chargeable)', 'Express delivery', 'Rounding']);
    expect(Math.round(lines.reduce((n, l) => n + l.amount, 0) * 100) / 100).toBe(122);
  });

  it('cancels bookings left unpaid past the timeout', async () => {
    const stale = await book();
    const paid = await book();
    // Raw driver update: Mongoose treats createdAt as immutable.
    await Shipment.collection.updateMany({}, { $set: { createdAt: new Date(Date.now() - (env.PAYMENT_TIMEOUT_MIN + 1) * 60_000) } });
    await Shipment.updateOne({ _id: paid.id }, { 'payment.status': 'paid' });
    const fresh = await book();
    expect(await expireUnpaid()).toBe(1);
    const s = await Shipment.findById(stale.id);
    expect(s.status).toBe('CANCELLED');
    expect(s.payment.status).toBe('cancelled');
    expect(s.statusHistory.at(-1).note).toMatch(/Not paid within/);
    expect((await Shipment.findById(paid.id)).status).toBe('BOOKED');
    expect((await Shipment.findById(fresh.id)).status).toBe('BOOKED');
  });
});

describe('Razorpay test mode', () => {
  const KEY = 'rzp_test_key';
  const SECRET = 'rzp_test_secret';
  let rzpCalls;
  beforeEach(() => {
    Object.assign(env, { RAZORPAY_KEY_ID: KEY, RAZORPAY_KEY_SECRET: SECRET, RAZORPAY_WEBHOOK_SECRET: 'whsec' });
    rzpCalls = [];
    const realFetch = globalThis.fetch;
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, opts) => {
      if (!String(url).startsWith('https://api.razorpay.com')) return realFetch(url, opts);
      rzpCalls.push({ url: String(url), auth: opts.headers.authorization, body: JSON.parse(opts.body) });
      const body = String(url).endsWith('/orders') ? { id: 'order_RZP123', amount: JSON.parse(opts.body).amount } : { id: 'rfnd_RZP9' };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    });
  });
  const sign = (orderId, paymentId) => createHmac('sha256', SECRET).update(`${orderId}|${paymentId}`).digest('hex');

  it('creates an order in paise, verifies the checkout signature, refunds on cancel', async () => {
    const s = await book();
    const order = (await request(app).post('/api/payments/create-order').set(auth(tokens.customer)).send({ shipmentId: s.id })).body.order;
    expect(order).toMatchObject({ provider: 'razorpay', orderId: 'order_RZP123', keyId: KEY });
    expect(rzpCalls[0].body).toMatchObject({ amount: s.price.total * 100, currency: 'INR', receipt: s.trackingId });
    expect(rzpCalls[0].auth).toBe(`Basic ${Buffer.from(`${KEY}:${SECRET}`).toString('base64')}`);

    const pay = { shipmentId: s.id, orderId: 'order_RZP123', paymentId: 'pay_RZP456' };
    expect((await request(app).post('/api/payments/verify').set(auth(tokens.customer)).send({ ...pay, signature: 'mock' })).status).toBe(400);
    expect((await request(app).post('/api/payments/verify').set(auth(tokens.customer)).send({ ...pay, paymentId: 'pay_mock_x1', signature: 'mock' })).status).toBe(400);
    const ok = await request(app).post('/api/payments/verify').set(auth(tokens.customer)).send({ ...pay, signature: sign('order_RZP123', 'pay_RZP456') });
    expect(ok.body.shipment.payment.status).toBe('paid');

    const c = await request(app).patch(`/api/shipments/${s.id}/cancel`).set(auth(tokens.customer)).send({});
    expect(c.body.shipment.payment.status).toBe('refunded');
    expect(rzpCalls.at(-1).url).toBe('https://api.razorpay.com/v1/payments/pay_RZP456/refund');
    expect((await Shipment.findById(s.id)).payment.refundId).toBe('rfnd_RZP9');
    const n = await waitFor(() => Notification.findOne({ title: 'Shipment cancelled' }));
    expect(n.message).toMatch(/refund of ₹\d+ is on its way/);
  });

  it('accepts signed webhooks only, and handles them idempotently', async () => {
    const s = await book();
    await request(app).post('/api/payments/create-order').set(auth(tokens.customer)).send({ shipmentId: s.id });
    const event = (name) => JSON.stringify({ event: name, payload: { payment: { entity: { id: 'pay_W1', order_id: 'order_RZP123', method: 'upi', error_description: 'Bank declined' } } } });
    const post = (raw, sig) => request(app).post('/api/payments/webhook').set('content-type', 'application/json').set('x-razorpay-signature', sig).send(raw);
    const sig = (raw) => createHmac('sha256', 'whsec').update(raw).digest('hex');

    expect((await post(event('payment.captured'), 'bad')).status).toBe(401);
    const failed = event('payment.failed');
    expect((await post(failed, sig(failed))).status).toBe(200);
    expect((await Shipment.findById(s.id)).payment.status).toBe('failed');
    const captured = event('payment.captured');
    expect((await post(captured, sig(captured))).status).toBe(200);
    expect((await post(captured, sig(captured))).status).toBe(200);
    expect((await Shipment.findById(s.id)).payment).toMatchObject({ status: 'paid', paymentId: 'pay_W1', method: 'upi' });
    await waitFor(async () => (await Notification.countDocuments({ title: /Payment received/ })) === 1);
    // A late failure event can't un-pay it.
    expect((await post(failed, sig(failed))).status).toBe(200);
    expect((await Shipment.findById(s.id)).payment.status).toBe('paid');
  });
});

describe('notifications (FR-37/39)', () => {
  it('notifies customer and driver live on assignment, with read/unread state', async () => {
    const s = await book();
    await Shipment.updateOne({ _id: s.id }, { 'payment.status': 'paid' });
    const driver = await User.findOne({ email: 'driver1@shiptrack.dev' });
    const driverToken = await login('driver1@shiptrack.dev', 'Driver@123');
    const socket = connect(`http://127.0.0.1:${port}`, { auth: { token: tokens.customer }, transports: ['websocket'], forceNew: true });
    await new Promise((r) => socket.on('connect', r));
    const live = new Promise((r) => socket.once('notification:new', r));

    await request(app).patch(`/api/admin/shipments/${s.id}/assign`).set(auth(tokens.admin)).send({ driverId: driver.id });
    const pushed = await live;
    expect(pushed).toMatchObject({ type: 'status', title: 'Driver assigned', link: `/app/shipments/${s.id}`, isRead: false });
    socket.disconnect();

    const mine = await request(app).get('/api/notifications').set(auth(tokens.customer));
    expect(mine.body.unreadCount).toBe(1);
    const forDriver = await waitFor(async () => (await request(app).get('/api/notifications').set(auth(driverToken))).body.items[0]);
    expect(forDriver).toMatchObject({ type: 'assignment', title: `New pickup · ${s.trackingId}`, link: `/driver/shipments/${s.id}` });

    expect((await request(app).patch(`/api/notifications/${pushed.id}/read`).set(auth(tokens.other))).status).toBe(404);
    const read = await request(app).patch(`/api/notifications/${pushed.id}/read`).set(auth(tokens.customer));
    expect(read.body).toMatchObject({ notification: { isRead: true }, unreadCount: 0 });

    await request(app).patch(`/api/shipments/${s.id}/cancel`).set(auth(tokens.customer)).send({});
    await waitFor(async () => (await request(app).get('/api/notifications?filter=unread').set(auth(tokens.customer))).body.unreadCount === 1);
    const cancelledForDriver = await waitFor(() => Notification.findOne({ userId: driver._id, title: /Pickup cancelled/ }));
    expect(cancelledForDriver).toBeTruthy();
    expect((await request(app).patch('/api/notifications/read-all').set(auth(tokens.customer))).body.updated).toBe(1);
    expect((await request(app).get('/api/notifications?filter=unread').set(auth(tokens.customer))).body.items).toEqual([]);
  });

  it('tells admins about new support tickets', async () => {
    await request(app).post('/api/chat/tickets').send({ sessionId: 'guest-session-01', question: 'Can you ship a sofa?', email: 'g@example.com' });
    const n = await waitFor(async () => (await request(app).get('/api/notifications').set(auth(tokens.admin))).body.items[0]);
    expect(n).toMatchObject({ type: 'support', title: 'New support ticket', link: '/admin/documents' });
    expect(n.message).toMatch(/sofa/);
  });
});
