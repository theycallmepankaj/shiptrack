import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { allowedOrigins } from '../config/env.js';
import { Shipment } from '../models/Shipment.js';
import { logger } from '../utils/logger.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { handleDriverLocation, MIN_INTERVAL_MS } from '../services/liveTracking.js';
import { onDocumentStatus } from '../services/rag.js';
import { initChat } from './chat.js';

let io = null;

/** FR-7: every socket must present a valid access token in the handshake (`auth: { token }`). */
export function socketAuth(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('unauthorized'));
  try {
    const p = verifyAccessToken(token);
    socket.user = { id: p.sub, role: p.role, name: p.name };
    next();
  } catch {
    next(new Error('unauthorized'));
  }
}

/** Owner, assigned driver or admin may join `shipment:<id>`. */
export async function canJoinShipment(user, shipmentId) {
  if (!mongoose.isValidObjectId(shipmentId)) return false;
  if (user.role === 'admin') return !!(await Shipment.exists({ _id: shipmentId }));
  const field = user.role === 'customer' ? 'customerId' : user.role === 'driver' ? 'driverId' : null;
  return !!field && !!(await Shipment.exists({ _id: shipmentId, [field]: user.id }));
}

export function initSockets(httpServer) {
  io = new Server(httpServer, { cors: { origin: allowedOrigins, credentials: true } });
  io.use(socketAuth);

  io.on('connection', (socket) => {
    const { id, role } = socket.user;
    socket.join(`user:${id}`);
    if (role === 'admin') socket.join(['admin', 'admin:fleet']);
    logger.info(`socket connected ${socket.id} user=${id} role=${role}`);

    socket.on('shipment:join', async ({ shipmentId } = {}, ack) => {
      const ok = await canJoinShipment(socket.user, shipmentId).catch(() => false);
      if (ok) socket.join(`shipment:${shipmentId}`);
      if (typeof ack === 'function') ack({ ok });
    });
    socket.on('shipment:leave', ({ shipmentId } = {}) => socket.leave(`shipment:${shipmentId}`));

    // FR-20/21: drivers stream GPS every ~5 s while on duty.
    socket.on('driver:location', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (role !== 'driver') return reply({ ok: false, error: 'Only drivers can share location' });
      const now = Date.now();
      if (now - (socket.data.lastLocationAt ?? 0) < MIN_INTERVAL_MS) return reply({ ok: false, error: 'Too frequent' });
      socket.data.lastLocationAt = now;
      try {
        reply(await handleDriverLocation(io, socket.user, payload, now));
      } catch (err) {
        logger.error('driver:location failed', err.message);
        reply({ ok: false, error: 'Server error' });
      }
    });
    socket.on('disconnect', () => logger.info(`socket disconnected ${socket.id}`));
  });

  initChat(io); // `/chat` namespace: guests allowed (FR-45)
  onDocumentStatus((payload) => io.to('admin').emit('document:status', payload)); // ingestion progress
  return io;
}

/** FR-17: push a status change to the shipment room and the customer's personal room. */
export function emitShipmentStatus(shipment, { status, at, note }) {
  if (!io) return;
  const id = shipment._id.toString();
  const rooms = [`shipment:${id}`, `user:${shipment.customerId}`];
  if (shipment.driverId) rooms.push(`user:${shipment.driverId}`);
  io.to(rooms).emit('shipment:status', { shipmentId: id, trackingId: shipment.trackingId, status, at, note });
}

/** FR-24: admins watching the fleet room see duty/location changes. */
export function emitFleetUpdate(payload) {
  io?.to('admin:fleet').emit('fleet:update', payload);
}

/** FR-37: pushes a stored notification to every tab the user has open. */
export function emitToUser(userId, event, payload) {
  io?.to(`user:${userId}`).emit(event, payload);
}
