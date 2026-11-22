import express from 'express';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { requireAuth, requireRole } from '../src/middleware/auth.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { seedDemoAccounts } from '../src/utils/seedDemo.js';
import { signAccessToken, sha256 } from '../src/utils/tokens.js';
import { clearDb, startDb, stopDb } from './setup.js';

const app = createApp();
const customer = { name: 'Test User', email: 'Test@Example.com', phone: '+91 98765 43210', password: 'Secret123' };
const cookieOf = (res) => res.headers['set-cookie']?.find((c) => c.startsWith('st_refresh='));

beforeAll(startDb);
afterAll(stopDb);
afterEach(clearDb);

describe('register', () => {
  it('creates a customer, returns an access token and sets an httpOnly refresh cookie', async () => {
    const res = await request(app).post('/api/auth/register').send(customer);
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user).toMatchObject({ email: 'test@example.com', role: 'customer' });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(cookieOf(res)).toMatch(/HttpOnly/);
    expect(cookieOf(res)).toMatch(/Path=\/api\/auth/);
  });

  it('ignores a role in the body (no public driver/admin sign-up)', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...customer, role: 'admin' });
    expect(res.body.user.role).toBe('customer');
  });

  it('stores a bcrypt hash, not the password', async () => {
    await request(app).post('/api/auth/register').send(customer);
    const u = await User.findOne({ email: 'test@example.com' }).select('+passwordHash');
    expect(u.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });

  it('rejects duplicate emails and weak passwords', async () => {
    await request(app).post('/api/auth/register').send(customer);
    expect((await request(app).post('/api/auth/register').send(customer)).status).toBe(400);
    const weak = await request(app).post('/api/auth/register').send({ ...customer, email: 'b@x.com', password: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body.details.password).toBeDefined();
  });
});

describe('login / me / refresh / logout', () => {
  beforeEach(() => request(app).post('/api/auth/register').send(customer));

  it('logs in with correct credentials and rejects wrong ones', async () => {
    const ok = await request(app).post('/api/auth/login').send({ email: customer.email, password: customer.password });
    expect(ok.status).toBe(200);
    const bad = await request(app).post('/api/auth/login').send({ email: customer.email, password: 'Wrong1234' });
    expect(bad.status).toBe(401);
    const unknown = await request(app).post('/api/auth/login').send({ email: 'no@one.com', password: 'Wrong1234' });
    expect(unknown.body.error).toBe(bad.body.error);
  });

  it('GET /me requires a valid token', async () => {
    const { body } = await request(app).post('/api/auth/login').send(customer);
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${body.accessToken}`);
    expect(me.body.user.email).toBe('test@example.com');
  });

  it('refresh rotates the token and rejects reuse of the old one', async () => {
    const login = await request(app).post('/api/auth/login').send(customer);
    const oldCookie = cookieOf(login).split(';')[0];
    const r1 = await request(app).post('/api/auth/refresh').set('Cookie', oldCookie);
    expect(r1.status).toBe(200);
    expect(r1.body.accessToken).toBeDefined();
    const newCookie = cookieOf(r1).split(';')[0];
    expect(newCookie).not.toBe(oldCookie);
    // Within the grace window (parallel tabs) the old token still yields an access token, without a new cookie.
    const parallel = await request(app).post('/api/auth/refresh').set('Cookie', oldCookie);
    expect(parallel.status).toBe(200);
    expect(cookieOf(parallel)).toBeUndefined();
    // After the grace window, reusing it revokes the session entirely.
    await User.updateOne({ email: 'test@example.com' }, { $set: { 'sessions.$[].rotatedAt': new Date(Date.now() - 60_000) } });
    expect((await request(app).post('/api/auth/refresh').set('Cookie', oldCookie)).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', newCookie)).status).toBe(401);
  });

  it('handles two tabs refreshing at the same moment', async () => {
    const login = await request(app).post('/api/auth/login').send(customer);
    const cookie = cookieOf(login).split(';')[0];
    const [a, b] = await Promise.all([
      request(app).post('/api/auth/refresh').set('Cookie', cookie),
      request(app).post('/api/auth/refresh').set('Cookie', cookie),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
  });

  it('logout invalidates the refresh token', async () => {
    const login = await request(app).post('/api/auth/login').send(customer);
    const cookie = cookieOf(login).split(';')[0];
    const out = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(out.status).toBe(204);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookie)).status).toBe(401);
  });

  it('keeps several devices signed in independently', async () => {
    const laptop = await request(app).post('/api/auth/login').send(customer);
    const phone = await request(app).post('/api/auth/login').send(customer);
    const laptopCookie = cookieOf(laptop).split(';')[0];
    const phoneCookie = cookieOf(phone).split(';')[0];
    // Signing in on the phone doesn't sign the laptop out.
    const r = await request(app).post('/api/auth/refresh').set('Cookie', laptopCookie);
    expect(r.status).toBe(200);
    // Logging out on the laptop leaves the phone signed in.
    await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${r.body.accessToken}`);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookieOf(r).split(';')[0])).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', phoneCookie)).status).toBe(200);
  });

  it('reuse of a rotated token revokes only that device', async () => {
    const a = await request(app).post('/api/auth/login').send(customer);
    const b = await request(app).post('/api/auth/login').send(customer);
    const stolen = cookieOf(a).split(';')[0];
    await request(app).post('/api/auth/refresh').set('Cookie', stolen);
    const count = async () => (await User.findOne({ email: 'test@example.com' }).select('+sessions')).sessions.length;
    const before = await count();
    await User.updateOne({ email: 'test@example.com' }, { $set: { 'sessions.$[].rotatedAt': new Date(Date.now() - 60_000) } });
    expect((await request(app).post('/api/auth/refresh').set('Cookie', stolen)).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookieOf(b).split(';')[0])).status).toBe(200);
    expect(await count()).toBe(before - 1); // only the replayed token's session is gone
  });

  it('caps sessions per user, dropping the oldest sign-in', async () => {
    const first = cookieOf(await request(app).post('/api/auth/login').send(customer)).split(';')[0];
    for (let i = 0; i < 10; i++) await request(app).post('/api/auth/login').send(customer);
    const u = await User.findOne({ email: 'test@example.com' }).select('+sessions');
    expect(u.sessions).toHaveLength(10);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', first)).status).toBe(401);
  });

  it('blocks deactivated users', async () => {
    await User.updateOne({ email: 'test@example.com' }, { isActive: false });
    expect((await request(app).post('/api/auth/login').send(customer)).status).toBe(403);
  });
});

describe('forgot / reset password', () => {
  it('resets the password with a valid token, and only once', async () => {
    const reg = await request(app).post('/api/auth/register').send(customer);
    const device = (await request(app).post('/api/auth/login').send(customer)).headers['set-cookie'].find((c) => c.startsWith('st_refresh=')).split(';')[0];
    const res = await request(app).post('/api/auth/forgot-password').send({ email: customer.email });
    expect(res.status).toBe(200);
    // Simulate the emailed token: set a known one directly.
    const token = 'a'.repeat(64);
    await User.updateOne({ email: 'test@example.com' }, { passwordResetTokenHash: sha256(token) });
    const reset = await request(app).post(`/api/auth/reset-password/${token}`).send({ password: 'NewPass123' });
    expect(reset.status).toBe(200);
    // Every device is signed out.
    for (const c of [device, reg.headers['set-cookie'].find((x) => x.startsWith('st_refresh=')).split(';')[0]]) {
      expect((await request(app).post('/api/auth/refresh').set('Cookie', c)).status).toBe(401);
    }
    expect((await request(app).post('/api/auth/login').send({ email: customer.email, password: 'NewPass123' })).status).toBe(200);
    expect((await request(app).post(`/api/auth/reset-password/${token}`).send({ password: 'Other1234' })).status).toBe(400);
  });

  it('does not reveal unknown emails', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@nowhere.com' });
    expect(res.status).toBe(200);
  });

  it('rejects expired tokens', async () => {
    await request(app).post('/api/auth/register').send(customer);
    const token = 'b'.repeat(64);
    await User.updateOne(
      { email: 'test@example.com' },
      { passwordResetTokenHash: sha256(token), passwordResetExpiresAt: new Date(Date.now() - 1000) },
    );
    expect((await request(app).post(`/api/auth/reset-password/${token}`).send({ password: 'NewPass123' })).status).toBe(400);
  });
});

describe('requireRole', () => {
  const guarded = express();
  guarded.get('/admin-only', requireAuth, requireRole('admin'), (_req, res) => res.json({ ok: true }));
  guarded.use(errorHandler);
  const tokenFor = (role) => signAccessToken({ _id: '507f1f77bcf86cd799439011', role, name: 'x' });

  it('allows the role and forbids others', async () => {
    expect((await request(guarded).get('/admin-only').set('Authorization', `Bearer ${tokenFor('admin')}`)).status).toBe(200);
    expect((await request(guarded).get('/admin-only').set('Authorization', `Bearer ${tokenFor('customer')}`)).status).toBe(403);
    expect((await request(guarded).get('/admin-only')).status).toBe(401);
  });
});

describe('demo seed', () => {
  it('creates the three demo accounts idempotently', async () => {
    expect(await seedDemoAccounts()).toBe(3);
    expect(await seedDemoAccounts()).toBe(0);
    const login = await request(app).post('/api/auth/login').send({ email: 'driver1@shiptrack.dev', password: 'Driver@123' });
    expect(login.body.user.role).toBe('driver');
  });
});
