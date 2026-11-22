import { Router } from 'express';
import mongoose from 'mongoose';

const router = Router();
const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];

// 503 while the database is unreachable, so the host's health check notices.
router.get('/', (_req, res) => {
  const db = states[mongoose.connection.readyState] ?? 'unknown';
  res.status(db === 'connected' ? 200 : 503).json({ status: db === 'connected' ? 'ok' : 'degraded', db, uptime: process.uptime() });
});

export default router;
