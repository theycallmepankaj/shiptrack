import request from 'supertest';
import { createApp } from '../src/app.js';
import { startDb, stopDb } from './setup.js';

describe('GET /api/health', () => {
  it('reports 503 while the database is down', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', db: 'disconnected' });
  });

  it('returns ok with a request id once connected', async () => {
    await startDb();
    try {
      const res = await request(createApp()).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'ok', db: 'connected' });
      expect(res.headers['x-request-id']).toBeDefined();
    } finally {
      await stopDb();
    }
  });

  it('returns 404 json for unknown routes', async () => {
    const res = await request(createApp()).get('/api/nope');
    expect(res.status).toBe(404);
  });
});
