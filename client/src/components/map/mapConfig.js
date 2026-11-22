import L from 'leaflet';

// Carto Positron (light) / Dark Matter (dark) per §11.5. Carto now requires an API key; without
// VITE_CARTO_API_KEY we fall back to standard OSM tiles (darkened with a CSS filter in dark mode).
const CARTO_KEY = import.meta.env.VITE_CARTO_API_KEY;
export const TILES = CARTO_KEY
  ? {
      light: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`,
      dark: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`,
      subdomains: 'abcd',
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }
  : {
      light: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      dark: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      subdomains: 'abc',
      darkClass: 'osm-dark',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    };

// Custom SVG markers (§11.5): pickup = circle, drop = pin, driver = vehicle that rotates with heading.
export const pickupIcon = L.divIcon({
  className: '',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html: '<div style="width:22px;height:22px;border-radius:50%;background:#0B1220;border:4px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);display:grid;place-items:center"><div style="width:6px;height:6px;border-radius:50%;background:#FF6B2C"></div></div>',
});
export const dropIcon = L.divIcon({
  className: '',
  iconSize: [30, 40],
  iconAnchor: [15, 40],
  html: '<svg width="30" height="40" viewBox="0 0 30 40"><path d="M15 39C15 39 2 24 2 15a13 13 0 1 1 26 0c0 9-13 24-13 24z" fill="#FF6B2C" stroke="#fff" stroke-width="2.5"/><circle cx="15" cy="15" r="5" fill="#fff"/></svg>',
});
/** Driver marker: a vehicle arrow that rotates with heading (`.drv` is rotated by DriverMarker). */
export function makeDriverIcon(active = true) {
  const bg = active ? '#0B1220' : '#94A3B8';
  const halo = active ? 'rgba(255,107,44,.25)' : 'rgba(148,163,184,.25)';
  const arrow = active ? '#FF6B2C' : '#fff';
  return L.divIcon({
    className: '',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    html: `<div style="position:relative;width:40px;height:40px;display:grid;place-items:center">
    <span style="position:absolute;inset:0;border-radius:50%;background:${halo}"></span>
    <div class="drv" style="width:30px;height:30px;border-radius:50%;background:${bg};border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.35);display:grid;place-items:center;transition:transform .6s ease-out">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="${arrow}"><path d="M12 2 20 21 12 17 4 21z"/></svg>
    </div></div>`,
  });
}
export const driverIcon = makeDriverIcon(true);
export const offDutyDriverIcon = makeDriverIcon(false);


/** Points along a gentle arc between two [lat, lng] points — reads as a route without road routing. */
export function arcBetween(a, b, segments = 48) {
  const [lat1, lng1] = a;
  const [lat2, lng2] = b;
  const mid = [(lat1 + lat2) / 2, (lng1 + lng2) / 2];
  const bend = 0.18;
  const ctrl = [mid[0] - (lng2 - lng1) * bend, mid[1] + (lat2 - lat1) * bend];
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const u = 1 - t;
    pts.push([u * u * lat1 + 2 * u * t * ctrl[0] + t * t * lat2, u * u * lng1 + 2 * u * t * ctrl[1] + t * t * lng2]);
  }
  return pts;
}
