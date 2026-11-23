// Client-side mirror of the default pricing rule, used for the landing-page calculator.
// The authoritative quote comes from POST /api/shipments/quote (Milestone 3).
export const DEFAULT_RULE = { baseFare: 40, perKm: 1.2, perKg: 15, expressMultiplier: 1.6 };

// Areas in the five cities ShipTrack serves (server/seed-docs/delivery-areas.md), for the
// home-page and pricing-page calculator. Approximate area centres.
const AREA_LIST = {
  Bengaluru: [['Indiranagar', 12.9719, 77.6412], ['Koramangala', 12.9352, 77.6245], ['MG Road', 12.9756, 77.6066], ['HSR Layout', 12.9116, 77.6474], ['Jayanagar', 12.925, 77.5938], ['Malleshwaram', 13.0035, 77.571], ['Hebbal', 13.0358, 77.597], ['Whitefield', 12.9698, 77.75], ['Electronic City', 12.8452, 77.6602]],
  Mumbai: [['Colaba', 18.9067, 72.8147], ['Dadar', 19.0178, 72.8478], ['Bandra West', 19.0596, 72.8295], ['Andheri East', 19.1136, 72.8697], ['Powai', 19.1176, 72.906], ['Chembur', 19.0522, 72.9005], ['Goregaon', 19.1663, 72.8526], ['Vashi', 19.0771, 72.9986], ['Thane', 19.2183, 72.9781]],
  Delhi: [['Connaught Place', 28.6315, 77.2167], ['Karol Bagh', 28.6519, 77.1909], ['Lajpat Nagar', 28.5677, 77.2433], ['Saket', 28.5245, 77.2066], ['Vasant Kunj', 28.52, 77.159], ['Dwarka', 28.5921, 77.046], ['Rohini', 28.7495, 77.0565], ['Mayur Vihar', 28.609, 77.294]],
  Pune: [['Shivajinagar', 18.5308, 73.8475], ['Koregaon Park', 18.5362, 73.894], ['Kothrud', 18.5074, 73.8077], ['Baner', 18.559, 73.7868], ['Viman Nagar', 18.5679, 73.9143], ['Hadapsar', 18.5089, 73.926], ['Wakad', 18.5975, 73.77], ['Hinjewadi', 18.5913, 73.7389]],
  Hyderabad: [['Banjara Hills', 17.4156, 78.4347], ['Begumpet', 17.4447, 78.4664], ['Secunderabad', 17.4399, 78.4983], ['Madhapur', 17.4483, 78.3915], ['HITEC City', 17.4435, 78.3772], ['Gachibowli', 17.4401, 78.3489], ['Kondapur', 17.46, 78.36], ['Kukatpally', 17.4948, 78.3996]],
};

/** [{ city, areas: [{ id, city, name, label, lat, lng }] }] */
export const SERVICE_AREAS = Object.entries(AREA_LIST).map(([city, areas]) => ({
  city,
  areas: areas.map(([name, lat, lng]) => ({ id: `${city}/${name}`, city, name, label: `${name}, ${city}`, lat, lng })),
}));
export const AREAS = SERVICE_AREAS.flatMap((g) => g.areas);
export const areaById = (id) => AREAS.find((a) => a.id === id);

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

/** Same formula as the server (services/pricing.js) for a given road distance — used for examples. */
export function priceFor({ km, weightKg, speed }, rule = DEFAULT_RULE) {
  const sub = rule.baseFare + km * rule.perKm + Math.max(0.5, weightKg) * rule.perKg;
  return Math.round(speed === 'express' ? sub * rule.expressMultiplier : sub);
}
