import mongoose from 'mongoose';
import { Shipment } from '../models/Shipment.js';
import { User } from '../models/User.js';
import { liveInfoFor } from '../services/liveTracking.js';
import { ApiError } from '../utils/ApiError.js';
import { TRACKING_ID_RE } from '../utils/trackingId.js';

const stop = (s, full) => (full ? { address: s.address, city: s.city } : { city: s.city });

/**
 * GET /api/internal/chat/shipment?trackingId=&userId=&latest=1 — called by the Python chatbot (FR-47/48).
 * The owner (or an admin) gets their shipment's details; anyone else only what public tracking shows.
 */
export async function chatShipment(req, res) {
  const { trackingId = '', userId = '', latest = '' } = req.query;
  const user = mongoose.isValidObjectId(userId) ? await User.findById(userId).select('role isActive').lean() : null;
  let s = null;
  if (trackingId) {
    const id = String(trackingId).toUpperCase();
    if (TRACKING_ID_RE.test(id)) s = await Shipment.findOne({ trackingId: id });
  } else if (latest && user) {
    s = await Shipment.findOne({ customerId: user._id }).sort({ createdAt: -1 });
  }
  if (!s) throw ApiError.notFound('No shipment');

  const owner = !!user?.isActive && (user.role === 'admin' || s.customerId.equals(user._id));
  const last = s.statusHistory.at(-1);
  const delivered = s.statusHistory.findLast?.((h) => h.status === 'DELIVERED');
  const shipment = {
    trackingId: s.trackingId,
    status: s.status,
    from: stop(s.pickup, owner),
    to: stop(s.drop, owner),
    speed: s.speed,
    estimatedDeliveryAt: s.estimatedDeliveryAt,
    etaSource: 'estimate',
    deliveredAt: delivered?.at ?? null,
    lastUpdate: last ? { status: last.status, at: last.at, ...(owner && last.note ? { note: last.note } : {}) } : null,
  };
  if (owner) {
    const { driver, live } = await liveInfoFor(s);
    Object.assign(shipment, {
      id: s._id.toString(),
      driverName: driver?.name?.split(' ')[0] ?? null,
      driverLastSeenAt: live?.at ?? null,
      paymentStatus: s.payment?.status ?? null,
    });
    if (live?.eta?.target === 'drop' && live.eta.arriveAt) Object.assign(shipment, { estimatedDeliveryAt: live.eta.arriveAt, etaSource: 'live' });
  }
  res.json({ access: owner ? 'owner' : 'public', shipment });
}
