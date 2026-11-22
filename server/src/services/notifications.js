import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { emitToUser } from '../sockets/index.js';
import { logger } from '../utils/logger.js';

export const notificationView = (n) => ({
  id: n._id.toString(),
  type: n.type,
  title: n.title,
  message: n.message,
  shipmentId: n.shipmentId?.toString() ?? null,
  link: n.link,
  isRead: n.isRead,
  createdAt: n.createdAt,
});

/** FR-37/39: stores a notification and pushes it live (`notification:new`). Never throws. */
export async function notify(userId, { type, title, message, shipmentId = null, link = null }) {
  if (!userId) return null;
  try {
    const n = await Notification.create({ userId, type, title, message: message.slice(0, 500), shipmentId, link });
    emitToUser(userId.toString(), 'notification:new', notificationView(n));
    return n;
  } catch (err) {
    logger.error('Notification failed:', err.message);
    return null;
  }
}

/** Sends the same notification to every active admin (support tickets, failed document indexing). */
export async function notifyAdmins(payload) {
  const admins = await User.find({ role: 'admin', isActive: true }).select('_id').lean();
  await Promise.all(admins.map((a) => notify(a._id, payload)));
}

const customerLink = (s) => `/app/shipments/${s._id}`;
const driverLink = (s) => `/driver/shipments/${s._id}`;
const place = (stop) => stop.city || stop.address;

// What the customer sees in the bell for each status (BOOKED → unassigned by an admin: nothing to tell).
const CUSTOMER_COPY = {
  ASSIGNED: (s) => ['Driver assigned', `A driver will pick up ${s.trackingId} from ${place(s.pickup)} soon.`],
  PICKED_UP: (s) => ['Parcel picked up', `${s.trackingId} has been collected and is on its way.`],
  IN_TRANSIT: (s) => ['In transit', `${s.trackingId} is heading to ${place(s.drop)}.`],
  OUT_FOR_DELIVERY: (s) => ['Out for delivery', `${s.trackingId} arrives today. Your delivery code is on the shipment page.`],
  DELIVERED: (s) => ['Delivered', `${s.trackingId} was delivered. Thanks for shipping with ShipTrack!`],
  FAILED_ATTEMPT: (s, note) => ['Delivery attempt failed', `We couldn’t deliver ${s.trackingId}${note ? ` (${note})` : ''}. We’ll try again.`],
  RETURNED: (s) => ['Returned to sender', `${s.trackingId} is being returned to ${place(s.pickup)}.`],
  CANCELLED: (s) => ['Shipment cancelled', `${s.trackingId} was cancelled.${s.payment?.status === 'refunded' ? ` A refund of ₹${s.payment.amount ?? s.price.total} is on its way.` : ''}`],
};

/** In-app side of a status change (emails are in notify.js). */
export async function notifyStatusInApp(s, status, note, { previousDriverId } = {}) {
  const copy = CUSTOMER_COPY[status];
  const jobs = [];
  if (copy) {
    const [title, message] = copy(s, note);
    jobs.push(notify(s.customerId, { type: 'status', title, message, shipmentId: s._id, link: customerLink(s) }));
  }
  if (status === 'ASSIGNED' && s.driverId) {
    jobs.push(notify(s.driverId, { type: 'assignment', title: `New pickup · ${s.trackingId}`, message: `Collect from ${s.pickup.address}${s.speed === 'express' ? ' — express' : ''}.`, shipmentId: s._id, link: driverLink(s) }));
  }
  if (previousDriverId && !previousDriverId.equals?.(s.driverId)) {
    jobs.push(notify(previousDriverId, { type: 'assignment', title: `${s.trackingId} reassigned`, message: 'This pickup was moved to another driver. No action needed.', shipmentId: s._id, link: null }));
  }
  if (status === 'CANCELLED' && s.driverId) {
    jobs.push(notify(s.driverId, { type: 'assignment', title: `Pickup cancelled · ${s.trackingId}`, message: 'The customer cancelled this shipment. Skip this pickup.', shipmentId: s._id, link: null }));
  }
  await Promise.all(jobs);
}
