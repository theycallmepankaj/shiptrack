import { useEffect, useRef, useState } from 'react';
import { Marker, Tooltip } from 'react-leaflet';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { driverIcon } from './mapConfig';

/**
 * Driver marker that glides between GPS fixes instead of jumping (§11.3) and rotates
 * with heading. `duration` ≈ the update interval, so motion looks continuous.
 */
export function DriverMarker({ lat, lng, heading, icon = driverIcon, duration = 4500, label, onClick }) {
  const ref = useRef(null);
  const shown = useRef([lat, lng]);
  const [initial] = useState([lat, lng]);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const m = ref.current;
    if (!m) return undefined;
    const from = shown.current;
    const to = [lat, lng];
    if (reduced || (from[0] === to[0] && from[1] === to[1])) {
      m.setLatLng(to);
      shown.current = to;
      return undefined;
    }
    let raf;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; // ease-in-out
      const cur = [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e];
      m.setLatLng(cur);
      shown.current = cur;
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [lat, lng, duration, reduced]);

  useEffect(() => {
    const el = ref.current?.getElement()?.querySelector('.drv');
    if (el && heading != null) el.style.transform = `rotate(${heading}deg)`;
  }, [heading, icon]);

  return (
    <Marker ref={ref} position={initial} icon={icon} zIndexOffset={1000} keyboard={false} eventHandlers={onClick ? { click: onClick } : undefined}>
      {label && <Tooltip direction="top" offset={[0, -18]}>{label}</Tooltip>}
    </Marker>
  );
}
