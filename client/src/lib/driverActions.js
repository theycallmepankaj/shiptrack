/** The next forward action a driver can take for each status. */
export const NEXT_ACTION = {
  ASSIGNED: { to: 'PICKED_UP', label: 'Swipe to confirm pickup', done: 'Picked up' },
  PICKED_UP: { to: 'IN_TRANSIT', label: 'Swipe to start transit', done: 'In transit' },
  IN_TRANSIT: { to: 'OUT_FOR_DELIVERY', label: 'Swipe: out for delivery', done: 'Out for delivery — customer notified' },
  FAILED_ATTEMPT: { to: 'OUT_FOR_DELIVERY', label: 'Swipe to retry delivery', done: 'Out for delivery — new code sent' },
};

export const FAILURE_REASONS = [
  ['CUSTOMER_UNAVAILABLE', 'Customer not available'],
  ['WRONG_ADDRESS', 'Address incorrect or incomplete'],
  ['REFUSED', 'Customer refused the parcel'],
  ['ACCESS_ISSUE', 'Couldn’t access the location'],
  ['OTHER', 'Other'],
];
