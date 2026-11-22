import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from '@/context/ThemeContext';
import { TILES } from './mapConfig';
import { DriverMarker } from './DriverMarker';

const numberIcon = (n, active) =>
  L.divIcon({
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `<div style="width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font:700 13px 'JetBrains Mono Variable',monospace;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);background:${active ? '#FF6B2C' : '#0B1220'};color:${active ? '#0B1220' : '#fff'}">${n}</div>`,
  });

function Fit({ points }) {
  const map = useMap();
  const key = points.map((p) => p.join(',')).join('|');
  useEffect(() => {
    map.invalidateSize();
    if (points.length === 1) map.setView(points[0], 14, { animate: false });
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [40, 40], animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

/** Driver route: numbered stops in visiting order, joined by a line, with the driver's position. */
export default function StopsMap({ stops, driver, className }) {
  const { theme } = useTheme();
  const path = useMemo(() => [...(driver ? [[driver.lat, driver.lng]] : []), ...stops.map((s) => [s.lat, s.lng])], [driver, stops]);
  const fitPath = useMemo(() => [...(driver ? [[driver.lat, driver.lng]] : []), ...stops.map((s) => [s.lat, s.lng])], [!!driver, stops]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <MapContainer center={path[0] ?? [12.97, 77.59]} zoom={12} className={className} scrollWheelZoom={false} zoomControl={false}>
      <ZoomControl position="bottomright" />
      <TileLayer key={theme} url={TILES[theme]} attribution={TILES.attribution} subdomains={TILES.subdomains} className={theme === 'dark' ? TILES.darkClass : undefined} maxZoom={19} />
      <Fit points={fitPath} />
      {path.length > 1 && <Polyline positions={path} pathOptions={{ color: '#FF6B2C', weight: 4, opacity: 0.8, dashArray: '2 9', lineCap: 'round' }} />}
      {stops.map((s, i) => <Marker key={`${s.shipment.id}-${s.kind}`} position={[s.lat, s.lng]} icon={numberIcon(s.sequence, i === 0)} keyboard={false} />)}
      {driver && <DriverMarker lat={driver.lat} lng={driver.lng} heading={driver.heading} />}
    </MapContainer>
  );
}
