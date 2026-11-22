// Shipment status → label + color (requirements §11.2 status colors).
export const STATUS = {
  BOOKED: { label: 'Booked', color: '#64748B' },
  ASSIGNED: { label: 'Assigned', color: '#64748B' },
  PICKED_UP: { label: 'Picked up', color: '#3B82F6' },
  IN_TRANSIT: { label: 'In transit', color: '#3B82F6' },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', color: '#FF6B2C' },
  DELIVERED: { label: 'Delivered', color: '#16A34A' },
  FAILED_ATTEMPT: { label: 'Failed attempt', color: '#DC2626' },
  RETURNED: { label: 'Returned', color: '#DC2626' },
  CANCELLED: { label: 'Cancelled', color: '#9CA3AF' },
};

/** The happy path, used for progress and upcoming timeline steps. */
export const STEPS = ['BOOKED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'];
export const ACTIVE = ['BOOKED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'FAILED_ATTEMPT'];
export const TERMINAL = ['DELIVERED', 'RETURNED', 'CANCELLED'];
export const CANCELLABLE = ['BOOKED', 'ASSIGNED'];

/** 0–1 share of the journey completed, for progress bars and the route line. */
export function progressOf(status) {
  if (status === 'FAILED_ATTEMPT') return 0.8;
  const i = STEPS.indexOf(status);
  return i < 0 ? 0 : i / (STEPS.length - 1);
}
