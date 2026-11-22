import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from '@/context/ThemeContext';
import { DriverMarker } from './DriverMarker';
import { driverIcon, offDutyDriverIcon, TILES } from './mapConfig';

function Controller({ drivers, focus }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    const pts = drivers.filter((d) => d.lat != null).map((d) => [d.lat, d.lng]);
    if (fitted.current || !pts.length) return;
    fitted.current = true;
    if (pts.length === 1) map.setView(pts[0], 13, { animate: false });
    else map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], animate: false });
  }, [drivers, map]);
  useEffect(() => {
    if (focus?.lat != null) map.flyTo([focus.lat, focus.lng], Math.max(map.getZoom(), 14), { duration: 0.8 });
  }, [focus, map]);
  return null;
}

/** FR-24/36: every driver on one map; on-duty drivers glide as `fleet:update` events arrive. */
export default function FleetMap({ drivers, focus, onSelect, className }) {
  const { theme } = useTheme();
  return (
    <MapContainer center={[12.97, 77.6]} zoom={11} className={className} zoomControl={false}>
      <ZoomControl position="bottomright" />
      <TileLayer key={theme} url={TILES[theme]} attribution={TILES.attribution} subdomains={TILES.subdomains} className={theme === 'dark' ? TILES.darkClass : undefined} maxZoom={19} />
      <Controller drivers={drivers} focus={focus} />
      {drivers
        .filter((d) => d.lat != null)
        .map((d) => (
          <DriverMarker
            key={`${d.driverId}-${d.isOnDuty}`}
            lat={d.lat}
            lng={d.lng}
            heading={d.heading}
            icon={d.isOnDuty ? driverIcon : offDutyDriverIcon}
            label={`${d.name}${d.isOnDuty ? '' : ' (off duty)'}`}
            onClick={() => onSelect?.(d)}
          />
        ))}
    </MapContainer>
  );
}
