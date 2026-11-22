import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from '@/context/ThemeContext';
import { arcBetween, dropIcon, pickupIcon, TILES } from './mapConfig';
import { DriverMarker } from './DriverMarker';

function FitBounds({ points, fit }) {
  const map = useMap();
  const key = points.map((p) => p.join(',')).join('|');
  useEffect(() => {
    map.invalidateSize();
    if (points.length === 1) map.setView(points[0], 14, { animate: false });
    else map.fitBounds(L.latLngBounds(points), { ...fit, animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

/**
 * Pickup (circle) → drop (pin) with the route line (§11.5): the completed share
 * (`progress`, 0–1) is solid, the rest dashed. `fit` takes Leaflet fitBounds padding options
 * so floating cards don't cover the markers.
 */
export default function ShipmentMap({ pickup, drop, progress = 0, className, fit = { padding: [48, 48] }, interactive = true, driver, trail = [], collected = false }) {
  const { theme } = useTheme();
  const pts = [pickup, drop].filter((p) => p?.lat != null).map((p) => [p.lat, p.lng]);
  const arc = useMemo(() => (pts.length === 2 ? arcBetween(pts[0], pts[1]) : []), [pts.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const split = Math.round(arc.length * Math.min(Math.max(progress, 0), 1));
  const hasDriver = driver?.lat != null;
  // Fit once when the driver first appears, not on every GPS fix (that would make the map jump).
  const fitPoints = hasDriver ? [...pts, [driver.lat, driver.lng]] : pts;
  const fitKey = `${pts.join('|')}|${hasDriver}`;

  return (
    <MapContainer center={pts[0] ?? [20.59, 78.96]} zoom={pts.length ? 12 : 4} className={className} scrollWheelZoom={false} zoomControl={false} dragging={interactive}>
      {interactive && <ZoomControl position="bottomright" />}
      <TileLayer key={theme} url={TILES[theme]} attribution={TILES.attribution} subdomains={TILES.subdomains} className={theme === 'dark' ? TILES.darkClass : undefined} maxZoom={19} />
      {pts.length > 0 && <FitBounds key={fitKey} points={fitPoints} fit={fit} />}
      {hasDriver && pts.length === 2 ? (
        collected ? (
          <>
            {/* Travelled: pickup → breadcrumbs → driver (solid). Remaining: driver → drop (dashed). */}
            <Polyline positions={[pts[0], ...trail.map((p) => [p.lat, p.lng]), [driver.lat, driver.lng]]} pathOptions={{ color: '#FF6B2C', weight: 6, lineCap: 'round', lineJoin: 'round' }} />
            <Polyline positions={[[driver.lat, driver.lng], pts[1]]} pathOptions={{ color: '#FF6B2C', weight: 5, opacity: 0.75, dashArray: '2 10', lineCap: 'round' }} />
          </>
        ) : (
          <>
            <Polyline positions={[[driver.lat, driver.lng], pts[0]]} pathOptions={{ color: '#64748B', weight: 4, opacity: 0.8, dashArray: '2 9', lineCap: 'round' }} />
            <Polyline positions={arc} pathOptions={{ color: '#FF6B2C', weight: 5, opacity: 0.75, dashArray: '2 10', lineCap: 'round' }} />
          </>
        )
      ) : arc.length > 0 && (
        <>
          <Polyline positions={arc.slice(Math.max(split - 1, 0))} pathOptions={{ color: '#FF6B2C', weight: 5, opacity: 0.75, dashArray: '2 10', lineCap: 'round' }} />
          {split > 1 && <Polyline positions={arc.slice(0, split)} pathOptions={{ color: '#FF6B2C', weight: 6, lineCap: 'round' }} />}
        </>
      )}
      {pickup?.lat != null && <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon} keyboard={false} />}
      {drop?.lat != null && <Marker position={[drop.lat, drop.lng]} icon={dropIcon} keyboard={false} />}
      {hasDriver && <DriverMarker lat={driver.lat} lng={driver.lng} heading={driver.heading} />}
    </MapContainer>
  );
}
