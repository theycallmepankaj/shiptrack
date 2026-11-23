import http from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { io as connect } from 'socket.io-client';
import { env } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { ChatMessage } from '../src/models/ChatMessage.js';
import { Document } from '../src/models/Document.js';
import { Shipment } from '../src/models/Shipment.js';
import { SupportTicket } from '../src/models/SupportTicket.js';
import { User } from '../src/models/User.js';
import { uploadRoot } from '../src/services/storage.js';
import { initSockets } from '../src/sockets/index.js';
import { _resetChatLimits, CHAT_LIMIT } from '../src/sockets/chat.js';
import { seedDemoAccounts, seedDemoShipments } from '../src/utils/seedDemo.js';
import { clearDb, startDb, stopDb } from './setup.js';

// Stub of the Python service's /rag endpoints.
let mode = 'ok';
const calls = [];
const stub = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    calls.push({ method: req.method, path: req.url, key: req.headers['x-internal-key'], body });
    if (mode === 'down') return res.writeHead(500).end();
    const json = (o, status = 200) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(o));
    if (req.url === '/rag/ingest') {
      if (mode === 'unreadable') return json({ detail: 'No text found in the PDF' }, 422);
      return json({ chunk_count: 4, pages: 1, embedder: 'stub' });
    }
    if (req.url.startsWith('/rag/documents/')) return json({ deleted: 4 });
    if (req.url === '/rag/status') return json({ embedder: 'stub', llm: false, model: null, vector_search: 'local', chunks: 4 });
    if (req.url === '/rag/chat') {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      const send = (o) => res.write(JSON.stringify(o) + '\n');
      send({ type: 'meta', intent: 'policy' });
      for (const t of ['Power ', 'banks ', "can't ", 'ship [1].']) send({ type: 'token', text: t });
      send({ type: 'done', intent: 'policy', confident: true, sources: [{ documentId: 'd1', title: 'Prohibited items', section: 'Prohibited', page: null, refs: [1] }] });
      return res.end();
    }
    res.writeHead(404).end();
  });
});

const app = createApp();
const server = http.createServer(app);
initSockets(server);
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const login = async (email, password) => (await request(app).post('/api/auth/login').send({ email, password })).body.accessToken;
const internal = { 'x-internal-key': env.INTERNAL_API_KEY };
const waitFor = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
};
let tokens;
let original;
let port;

beforeAll(async () => {
  await startDb();
  await new Promise((r) => stub.listen(0, r));
  await new Promise((r) => server.listen(0, r));
  port = server.address().port;
  original = env.AI_SERVICE_URL;
  env.AI_SERVICE_URL = `http://127.0.0.1:${stub.address().port}`;
});
afterAll(async () => {
  env.AI_SERVICE_URL = original;
  await new Promise((r) => stub.close(r));
  await new Promise((r) => server.close(r));
  await stopDb();
});
beforeEach(async () => {
  mode = 'ok';
  calls.length = 0;
  _resetChatLimits();
  await seedDemoAccounts();
  await seedDemoShipments();
  await request(app).post('/api/auth/register').send({ name: 'Other Person', email: 'other@example.com', phone: '+91 98888 77777', password: 'Other@1234' });
  tokens = {
    admin: await login('admin@shiptrack.dev', 'Admin@123'),
    customer: await login('customer@shiptrack.dev', 'Customer@123'),
    other: await login('other@example.com', 'Other@1234'),
  };
});
afterEach(clearDb);

describe('internal shipment lookup for the chatbot (FR-47/48)', () => {
  it('requires the internal key', async () => {
    expect((await request(app).get('/api/internal/chat/shipment?trackingId=SHP-AAAAAA')).status).toBe(401);
    expect((await request(app).get('/api/internal/chat/shipment?trackingId=SHP-AAAAAA').set('x-internal-key', 'wrong')).status).toBe(401);
  });

  it('gives the owner details but only public info to anyone else', async () => {
    const customer = await User.findOne({ email: 'customer@shiptrack.dev' });
    const other = await User.findOne({ email: 'other@example.com' });
    const s = await Shipment.findOne({ customerId: customer._id });
    s.statusHistory.at(-1).note = 'Left with security';
    await s.save();

    const own = await request(app).get(`/api/internal/chat/shipment?trackingId=${s.trackingId.toLowerCase()}&userId=${customer._id}`).set(internal);
    expect(own.status).toBe(200);
    expect(own.body.access).toBe('owner');
    expect(own.body.shipment.from.address).toBe(s.pickup.address);
    expect(own.body.shipment.lastUpdate.note).toBe('Left with security');
    expect(own.body.shipment.id).toBe(s._id.toString());

    for (const userId of [other._id, '']) {
      const pub = await request(app).get(`/api/internal/chat/shipment?trackingId=${s.trackingId}&userId=${userId}`).set(internal);
      expect(pub.body.access).toBe('public');
      expect(pub.body.shipment.from).toEqual({ city: s.pickup.city });
      expect(pub.body.shipment).not.toHaveProperty('driverName');
      expect(pub.body.shipment).not.toHaveProperty('id');
      expect(pub.body.shipment.lastUpdate).not.toHaveProperty('note');
    }
  });

  it('is also reachable at the spec path /internal/shipments/:trackingId', async () => {
    const customer = await User.findOne({ email: 'customer@shiptrack.dev' });
    const s = await Shipment.findOne({ customerId: customer._id });
    const res = await request(app).get(`/api/internal/shipments/${s.trackingId}?userId=${customer._id}`).set(internal);
    expect(res.body).toMatchObject({ access: 'owner', shipment: { trackingId: s.trackingId } });
    expect((await request(app).get(`/api/internal/shipments/${s.trackingId}`)).status).toBe(401);
  });

  it('finds the latest parcel for a signed-in user only', async () => {
    const customer = await User.findOne({ email: 'customer@shiptrack.dev' });
    const latest = await Shipment.findOne({ customerId: customer._id }).sort({ createdAt: -1 });
    const res = await request(app).get(`/api/internal/chat/shipment?latest=1&userId=${customer._id}`).set(internal);
    expect(res.body.shipment.trackingId).toBe(latest.trackingId);
    expect((await request(app).get('/api/internal/chat/shipment?latest=1').set(internal)).status).toBe(404);
    expect((await request(app).get('/api/internal/chat/shipment?trackingId=SHP-ZZZZZZ').set(internal)).status).toBe(404);
  });
});

describe('admin chatbot documents (FR-35)', () => {
  const upload = (token, name, content, title) => {
    const r = request(app).post('/api/admin/documents').set(auth(token)).attach('file', Buffer.from(content), name);
    return title ? r.field('title', title) : r;
  };

  it('uploads, indexes in the background, re-indexes and deletes', async () => {
    const res = await upload(tokens.admin, 'refund-policy.md', '# Refunds\n\nFull refund before pickup.');
    expect(res.status).toBe(201);
    expect(res.body.document).toMatchObject({ title: 'Refund policy', status: 'processing', mimeType: 'text/markdown' });
    const id = res.body.document.id;
    const doc = await waitFor(async () => {
      const d = await Document.findById(id);
      return d.status === 'ready' && d;
    });
    expect(doc.chunkCount).toBe(4);
    const ingest = calls.find((c) => c.path === '/rag/ingest');
    expect(ingest.key).toBe(env.INTERNAL_API_KEY);
    expect(Buffer.from(ingest.body.content_b64, 'base64').toString()).toContain('Full refund');
    const file = path.join(uploadRoot(), 'documents', path.basename(doc.fileUrl));
    expect(existsSync(file)).toBe(true);

    // Reindex reads the stored file back.
    calls.length = 0;
    expect((await request(app).post(`/api/admin/documents/${id}/reindex`).set(auth(tokens.admin))).body.document.status).toBe('processing');
    await waitFor(async () => (await Document.findById(id)).status === 'ready');
    expect(Buffer.from(calls.find((c) => c.path === '/rag/ingest').body.content_b64, 'base64').toString()).toContain('Full refund');

    const list = await request(app).get('/api/admin/documents').set(auth(tokens.admin));
    expect(list.body.documents).toHaveLength(1);

    expect((await request(app).delete(`/api/admin/documents/${id}`).set(auth(tokens.admin))).status).toBe(204);
    expect(calls.some((c) => c.method === 'DELETE' && c.path === `/rag/documents/${id}`)).toBe(true);
    expect(await Document.exists({ _id: id })).toBeNull();
    expect(existsSync(file)).toBe(false);
  });

  it('records why an ingest failed', async () => {
    mode = 'unreadable';
    const res = await upload(tokens.admin, 'scan.pdf', '%PDF-1.4 scanned', 'Scanned policy');
    const d = await waitFor(async () => {
      const x = await Document.findById(res.body.document.id);
      return x.status === 'failed' && x;
    });
    expect(d.error).toBe('No text found in the PDF');
    expect(d.title).toBe('Scanned policy');
  });

  it('validates files and requires admin', async () => {
    expect((await upload(tokens.admin, 'fake.pdf', 'hello')).body.error).toMatch(/valid PDF/);
    expect((await upload(tokens.admin, 'doc.docx', 'hello')).body.error).toMatch(/Choose a PDF/);
    expect((await upload(tokens.admin, 'bin.txt', Buffer.from([0xff, 0xfe, 0xfa]))).body.error).toMatch(/UTF-8/);
    expect((await upload(tokens.customer, 'a.md', '# Hi')).status).toBe(403);
  });

  it("keeps the document when the AI service can't remove its chunks", async () => {
    const res = await upload(tokens.admin, 'a.md', '# A\n\ntext');
    await waitFor(async () => (await Document.findById(res.body.document.id)).status === 'ready');
    mode = 'down';
    expect((await request(app).delete(`/api/admin/documents/${res.body.document.id}`).set(auth(tokens.admin))).status).toBe(503);
    expect(await Document.exists({ _id: res.body.document.id })).not.toBeNull();
  });
});

describe('chat over Socket.io (FR-49/51)', () => {
  const open = (token) =>
    new Promise((resolve, reject) => {
      const s = connect(`http://127.0.0.1:${port}/chat`, { auth: token ? { token } : {}, transports: ['websocket'], forceNew: true });
      s.on('connect', () => resolve(s));
      s.on('connect_error', (e) => reject(e));
    });
  const ask = (socket, sessionId, message) =>
    new Promise((resolve) => {
      const tokensOut = [];
      const onToken = (e) => tokensOut.push(e.token);
      const finish = (result) => {
        socket.off('chat:token', onToken);
        socket.off('chat:done');
        socket.off('chat:error');
        resolve(result);
      };
      socket.on('chat:token', onToken);
      socket.once('chat:done', (e) => finish({ text: tokensOut.join(''), done: e }));
      socket.once('chat:error', (e) => finish({ error: e.error }));
      socket.emit('chat:message', { sessionId, message }, (ack) => !ack.ok && finish({ rejected: ack.error }));
    });

  it('streams an answer to a guest, saves both messages and sends history next time', async () => {
    const s = await open();
    const sessionId = 'guest-session-0001';
    const first = await ask(s, sessionId, 'Can I ship a power bank?');
    expect(first.text).toBe("Power banks can't ship [1].");
    expect(first.done.sources[0].title).toBe('Prohibited items');
    const saved = await ChatMessage.find({ sessionId }).sort({ createdAt: 1 });
    expect(saved.map((m) => [m.role, m.userId])).toEqual([['user', null], ['assistant', null]]);
    expect(saved[1].id).toBe(first.done.messageId);

    await ask(s, sessionId, 'And fireworks?');
    const chatCall = calls.filter((c) => c.path === '/rag/chat').at(-1);
    expect(chatCall.body.history.map((h) => h.role)).toEqual(['user', 'assistant']);
    expect(chatCall.body.user_id).toBeNull();
    s.disconnect();
  });

  it('passes the signed-in user and keeps sessions private', async () => {
    const guest = await open();
    await ask(guest, 'shared-session-01', 'hello');
    const user = await open(tokens.customer);
    expect((await ask(user, 'shared-session-01', 'hi')).rejected).toMatch(/someone else/);
    await ask(user, 'user-session-0001', 'where is my latest parcel');
    const customer = await User.findOne({ email: 'customer@shiptrack.dev' });
    expect(calls.filter((c) => c.path === '/rag/chat').at(-1).body.user_id).toBe(customer.id);
    guest.disconnect();
    user.disconnect();
  });

  it('rejects bad tokens, invalid input and floods; reports an unavailable AI service', async () => {
    await expect(open('garbage')).rejects.toThrow('unauthorized');
    const s = await open();
    expect((await ask(s, 'bad id!', 'hi')).rejected).toMatch(/session/);
    expect((await ask(s, 'guest-session-0002', '   ')).rejected).toMatch(/Type a message/);
    mode = 'down';
    expect((await ask(s, 'guest-session-0002', 'hi')).error).toMatch(/unavailable/);
    mode = 'ok';
    for (let i = 1; i < CHAT_LIMIT.max; i++) await ask(s, 'guest-session-0002', `q${i}`);
    expect((await ask(s, 'guest-session-0002', 'one more')).rejected).toMatch(/too quickly/);
    s.disconnect();
  });
});

describe('chat history, ratings and tickets (FR-50/51/52)', () => {
  async function seedChat(userId, sessionId) {
    await ChatMessage.create({ userId, sessionId, role: 'user', content: 'q' });
    return ChatMessage.create({ userId, sessionId, role: 'assistant', content: 'a', confident: false });
  }

  it('returns history to its owner only', async () => {
    const customer = await User.findOne({ email: 'customer@shiptrack.dev' });
    await seedChat(customer._id, 'cust-session-001');
    await seedChat(null, 'guest-session-01');
    const mine = await request(app).get('/api/chat/history').set(auth(tokens.customer));
    expect(mine.body.sessionId).toBe('cust-session-001');
    expect(mine.body.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect((await request(app).get('/api/chat/history?sessionId=cust-session-001')).body.messages).toEqual([]);
    expect((await request(app).get('/api/chat/history?sessionId=cust-session-001').set(auth(tokens.other))).body.messages).toEqual([]);
    expect((await request(app).get('/api/chat/history?sessionId=guest-session-01')).body.messages).toHaveLength(2);
    expect((await request(app).get('/api/chat/history').set(auth('bad'))).status).toBe(401);
  });

  it('lets only the owner rate a reply, and admins see the totals', async () => {
    const customer = await User.findOne({ email: 'customer@shiptrack.dev' });
    const reply = await seedChat(customer._id, 'cust-session-001');
    const url = `/api/chat/messages/${reply.id}/rating`;
    expect((await request(app).patch(url).set(auth(tokens.other)).send({ rating: 'up' })).status).toBe(404);
    expect((await request(app).patch(url).send({ rating: 'up', sessionId: 'cust-session-001' })).status).toBe(404);
    expect((await request(app).patch(url).set(auth(tokens.customer)).send({ rating: 'down' })).body.message.rating).toBe('down');

    const guestReply = await seedChat(null, 'guest-session-01');
    expect((await request(app).patch(`/api/chat/messages/${guestReply.id}/rating`).send({ rating: 'up' })).status).toBe(404);
    expect((await request(app).patch(`/api/chat/messages/${guestReply.id}/rating`).send({ rating: 'up', sessionId: 'guest-session-01' })).body.message.rating).toBe('up');

    const overview = await request(app).get('/api/admin/chat/overview').set(auth(tokens.admin));
    expect(overview.body.ratings).toEqual({ up: 1, down: 1 });
    expect(overview.body.recentDown[0]).toMatchObject({ question: 'q', answer: 'a' });
    expect(overview.body.assistant).toMatchObject({ embedder: 'stub', chunks: 4 });
  });

  it('raises support tickets (guests must give an email)', async () => {
    const body = { sessionId: 'guest-session-01', question: 'Can you ship a sofa to Goa?' };
    expect((await request(app).post('/api/chat/tickets').send(body)).body.details.email).toBeDefined();
    expect((await request(app).post('/api/chat/tickets').send({ ...body, email: 'g@example.com' })).status).toBe(201);
    expect((await request(app).post('/api/chat/tickets').set(auth(tokens.customer)).send(body)).status).toBe(201);
    const tickets = await SupportTicket.find().sort({ createdAt: 1 });
    expect(tickets.map((t) => t.email)).toEqual(['g@example.com', 'customer@shiptrack.dev']);

    const res = await request(app).patch(`/api/admin/tickets/${tickets[0].id}`).set(auth(tokens.admin)).send({ status: 'resolved' });
    expect(res.body.ticket.status).toBe('resolved');
    expect((await request(app).patch(`/api/admin/tickets/${tickets[0].id}`).set(auth(tokens.customer)).send({ status: 'open' })).status).toBe(403);
  });
});
