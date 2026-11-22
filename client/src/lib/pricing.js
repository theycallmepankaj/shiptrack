// Client-side mirror of the default pricing rule, used for the landing-page calculator.
// The authoritative quote comes from POST /api/shipments/quote (Milestone 3).
export const DEFAULT_RULE = { baseFare: 40, perKm: 1.2, perKg: 15, expressMultiplier: 1.6 };

export const CITIES = [
  { name: 'Mumbai', lat: 19.076, lng: 72.8777 },
  { name: 'Pune', lat: 18.5204, lng: 73.8567 },
  { name: 'Delhi', lat: 28.6139, lng: 77.209 },
  { name: 'Bengaluru', lat: 12.9716, lng: 77.5946 },
  { name: 'Hyderabad', lat: 17.385, lng: 78.4867 },
  { name: 'Chennai', lat: 13.0827, lng: 80.2707 },
  { name: 'Kolkata', lat: 22.5726, lng: 88.3639 },
  { name: 'Ahmedabad', lat: 23.0225, lng: 72.5714 },
  { name: 'Jaipur', lat: 26.9124, lng: 75.7873 },
];

const ROAD_FACTOR = 1.3; // straight-line → road distance; keep in sync with server/src/services/pricing.js

export function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function quote({ from, to, weightKg, speed }, rule = DEFAULT_RULE) {
  const distanceKm = Math.max(5, haversineKm(from, to) * ROAD_FACTOR);
  const distanceCharge = distanceKm * rule.perKm;
  const weightCharge = Math.max(0.5, weightKg) * rule.perKg;
  const subtotal = rule.baseFare + distanceCharge + weightCharge;
  const total = speed === 'express' ? subtotal * rule.expressMultiplier : subtotal;
  // Distance-based ETA fallback (same formula the Python service falls back to, FR-41).
  const hours = speed === 'express' ? 4 + distanceKm / 55 : 18 + distanceKm / 35;
  return {
    distanceKm: Math.round(distanceKm),
    base: rule.baseFare,
    distanceCharge: Math.round(distanceCharge),
    weightCharge: Math.round(weightCharge),
    total: Math.round(total),
    etaHours: Math.round(hours),
  };
}
