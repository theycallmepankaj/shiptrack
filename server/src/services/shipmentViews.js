// Shapes a shipment for each audience. Public tracking (FR-18) shows status, timeline and ETA
// only — no names, phones, full addresses or exact coordinates.

const toLatLng = (loc) => (loc?.coordinates ? { lat: loc.coordinates[1], lng: loc.coordinates[0] } : null);
const coarse = (loc) => {
  const p = toLatLng(loc);
  return p && { lat: Math.round(p.lat * 100) / 100, lng: Math.round(p.lng * 100) / 100 }; // ≈1 km
};

const stopView = (s) => ({
  address: s.address,
  city: s.city,
  ...toLatLng(s.location),
  contactName: s.contactName,
  contactPhone: s.contactPhone,
});

export function ownerView(s) {
  return {
    id: s._id.toString(),
    trackingId: s.trackingId,
    status: s.status,
    pickup: stopView(s.pickup),
    drop: stopView(s.drop),
    package: s.package,
    speed: s.speed,
    price: s.price,
    distanceKm: s.distanceKm,
    estimatedDeliveryAt: s.estimatedDeliveryAt,
    driverId: s.driverId?.toString() ?? null,
    statusHistory: s.statusHistory.map((h) => ({ status: h.status, at: h.at, note: h.note, byRole: h.byRole, location: toLatLng(h.location) })),
    payment: {
      status: s.payment?.status,
      provider: s.payment?.provider,
      amount: s.payment?.amount ?? s.price?.total,
      method: s.payment?.method ?? null,
      paymentId: s.payment?.paymentId ?? null,
      paidAt: s.payment?.paidAt ?? null,
      refundedAt: s.payment?.refundedAt ?? null,
      failureReason: s.payment?.failureReason ?? null,
    },
    proofOfDelivery: s.proofOfDelivery,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

export function listItemView(s) {
  return {
    id: s._id.toString(),
    trackingId: s.trackingId,
    status: s.status,
    from: s.pickup.city || s.pickup.address,
    to: s.drop.city || s.drop.address,
    speed: s.speed,
    total: s.price.total,
    paymentStatus: s.payment?.status ?? 'pending',
    estimatedDeliveryAt: s.estimatedDeliveryAt,
    createdAt: s.createdAt,
  };
}

export function publicView(s) {
  return {
    trackingId: s.trackingId,
    status: s.status,
    speed: s.speed,
    packageType: s.package.type,
    from: { city: s.pickup.city, ...coarse(s.pickup.location) },
    to: { city: s.drop.city, ...coarse(s.drop.location) },
    distanceKm: s.distanceKm,
    estimatedDeliveryAt: s.estimatedDeliveryAt,
    statusHistory: s.statusHistory.map((h) => ({ status: h.status, at: h.at })),
    createdAt: s.createdAt,
  };
}

/** What a driver sees: stops, contacts and package — no price paid, payment or delivery code. */
export function driverView(s) {
  const { price: _p, payment: _pay, ...rest } = ownerView(s);
  return { ...rest, driverEarning: s.driverEarning ?? null, deliveryAttempts: s.deliveryAttempts ?? 0 };
}
