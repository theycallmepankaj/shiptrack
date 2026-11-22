import { ApiError } from '../utils/ApiError.js';
import { emitShipmentStatus } from '../sockets/index.js';
import { notifyStatusChange } from './notify.js';

/** Allowed lifecycle moves (requirements §4.3). */
export const TRANSITIONS = Object.freeze({
  BOOKED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['PICKED_UP', 'CANCELLED', 'BOOKED'], // BOOKED = unassigned by admin
  PICKED_UP: ['IN_TRANSIT'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED_ATTEMPT'],
  FAILED_ATTEMPT: ['OUT_FOR_DELIVERY', 'RETURNED'], // retry or return to sender
  DELIVERED: [],
  RETURNED: [],
  CANCELLED: [],
});

/** Which target statuses each role may set. */
export const ROLE_TARGETS = Object.freeze({
  customer: ['CANCELLED'],
  driver: ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED_ATTEMPT', 'RETURNED'],
  admin: Object.keys(TRANSITIONS),
  system: Object.keys(TRANSITIONS),
});

export const ACTIVE_STATUSES = ['BOOKED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'FAILED_ATTEMPT'];
export const isTerminal = (status) => TRANSITIONS[status]?.length === 0;
export const canTransition = (from, to) => TRANSITIONS[from]?.includes(to) ?? false;

export function assertTransition(from, to, role) {
  if (!canTransition(from, to)) throw ApiError.badRequest(`Can’t change status from ${from} to ${to}`);
  if (!ROLE_TARGETS[role]?.includes(to)) throw ApiError.forbidden(`A ${role} can’t set status ${to}`);
}

/**
 * FR-16/17: validates the move, appends to status history (time, location, who), saves,
 * and pushes the change to everyone watching the shipment.
 */
export async function changeStatus(shipment, to, { by, role, location, note } = {}) {
  assertTransition(shipment.status, to, role);
  const at = new Date();
  shipment.status = to;
  shipment.statusHistory.push({
    status: to,
    at,
    by,
    byRole: role,
    note,
    ...(location && { location: { type: 'Point', coordinates: [location.lng, location.lat] } }),
  });
  await shipment.save();
  emitShipmentStatus(shipment, { status: to, at, note });
  notifyStatusChange(shipment, to, note);
  return shipment;
}
