import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from '@/context/ThemeContext';
import { driverIcon, dropIcon, pickupIcon, TILES } from './mapConfig';

/** Precompute cumulative distances so a 0–1 progress can be turned into a position along the route. */
function useRouteGeometry(route) {
  return useMemo(() => {
    const cum = [0];
    for (let i = 1; i < route.length; i++) {
      cum.push(cum[i - 1] + L.latLng(route[i - 1]).distanceTo(L.latLng(route[i])));
    }
    return { cum, total: cum[cum.length - 1] };
  }, [route]);
}

function pointAt(route, { cum, total }, t) {
  const d = Math.min(Math.max(t, 0), 1) * total;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const segLen = cum[i] - cum[i - 1] || 1;
  const f = (d - cum[i - 1]) / segLen;
  const [aLat, aLng] = route[i - 1];
  const [bLat, bLng] = route[i];
  const pos = [aLat + (bLat - aLat) * f, aLng + (bLng - aLng) * f];
  const heading = (Math.atan2((bLng - aLng) * Math.cos((aLat * Math.PI) / 180), bLat - aLat) * 180) / Math.PI;
  return { pos, heading, index: i };
}

function FitBounds({ route }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(L.latLngBounds(route), { padding: [40, 40] });
  }, [map, route]);
  return null;
}

/**
 * Map with a route, pickup/drop markers and a driver marker.
 * `progress` (0–1) positions the driver; it's read from a ref each frame so the
 * marker glides without React re-renders.
 */
export default function LiveRouteMap({ route, progressRef, className, interactive = true }) {
  const { theme } = useTheme();
  const geom = useRouteGeometry(route);
  const driverRef = useRef(null);
  const doneRef = useRef(null);
  const todoRef = useRef(null);

  useEffect(() => {
    let raf;
    let lastT = -1;
    const tick = () => {
      const t = progressRef.current ?? 0;
      if (t !== lastT && driverRef.current) {
        lastT = t;
        const { pos, heading, index } = pointAt(route, geom, t);
        driverRef.current.setLatLng(pos);
        const el = driverRef.current.getElement()?.querySelector('.drv');
        if (el) el.style.transform = `rotate(${heading}deg)`;
        doneRef.current?.setLatLngs([...route.slice(0, index), pos]);
        todoRef.current?.setLatLngs([pos, ...route.slice(index)]);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [route, geom, progressRef]);

  return (
    <MapContainer
      center={route[0]}
      zoom={13}
      className={className}
      zoomControl={interactive}
      scrollWheelZoom={false}
      dragging={interactive}
      attributionControl
    >
      <TileLayer
        key={theme}
        url={TILES[theme]}
        attribution={TILES.attribution}
        subdomains={TILES.subdomains}
        className={theme === 'dark' ? TILES.darkClass : undefined}
        maxZoom={19}
      />
      <FitBounds route={route} />
      <Polyline ref={todoRef} positions={route} pathOptions={{ color: '#FF6B2C', weight: 5, opacity: 0.7, dashArray: '2 10', lineCap: 'round' }} />
      <Polyline ref={doneRef} positions={[route[0]]} pathOptions={{ color: '#FF6B2C', weight: 6, lineCap: 'round' }} />
      <Marker position={route[0]} icon={pickupIcon} keyboard={false} />
      <Marker position={route[route.length - 1]} icon={dropIcon} keyboard={false} />
      <Marker ref={driverRef} position={route[0]} icon={driverIcon} keyboard={false} zIndexOffset={1000} />
    </MapContainer>
  );
}
