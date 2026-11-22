import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, parseApiError } from '@/api/client';
import { getPosition } from '@/lib/geo';
import { useSocket } from './SocketContext';

const DriverContext = createContext(null);
const SEND_EVERY_MS = 5000; // FR-20

const toRad = (d) => (d * Math.PI) / 180;
function distanceM(a, b) {
  const R = 6_371_000;
  const h = Math.sin(toRad(b.lat - a.lat) / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function bearing(a, b) {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Driver session state shared across the driver panel: duty status and live GPS sharing.
 * While on duty, the browser watches the position and sends it every 5 s over Socket.io.
 */
export function DriverProvider({ children }) {
  const socket = useSocket();
  const [profile, setProfile] = useState(null);
  const [dutyLoading, setDutyLoading] = useState(false);
  const [gps, setGps] = useState({ status: 'idle', lastSentAt: null, position: null });
  const onDuty = !!profile?.isOnDuty;

  useEffect(() => {
    api.get('/driver/me').then(({ data }) => setProfile(data.driver)).catch(() => setProfile({ isOnDuty: false }));
  }, []);

  const setOnDuty = useCallback(async (isOnDuty) => {
    setDutyLoading(true);
    const pos = isOnDuty ? await getPosition() : null;
    try {
      const { data } = await api.patch('/driver/duty', { isOnDuty, ...(pos ?? {}) });
      setProfile(data.driver);
      toast.success(isOnDuty ? 'You’re on duty — sharing your location' : 'You’re off duty — location sharing stopped');
      return data.driver;
    } catch (e) {
      toast.error(parseApiError(e).message);
      return null;
    } finally {
      setDutyLoading(false);
    }
  }, []);

  // Stream GPS while on duty.
  const latest = useRef(null);
  const lastSent = useRef(null);
  useEffect(() => {
    if (!onDuty || !socket) {
      setGps((g) => ({ ...g, status: 'idle' }));
      return undefined;
    }
    if (!('geolocation' in navigator)) {
      setGps((g) => ({ ...g, status: 'unavailable' }));
      return undefined;
    }

    let heading = null;
    const send = () => {
      const p = latest.current;
      if (!p || !socket.connected) return;
      const prev = lastSent.current;
      if (p.heading != null && p.speed > 0.5) heading = p.heading;
      else if (prev && distanceM(prev, p) > 10) heading = bearing(prev, p);
      socket.emit('driver:location', { lat: p.lat, lng: p.lng, heading, speed: p.speed }, (ack) => {
        if (ack?.ok) setGps({ status: 'active', lastSentAt: new Date(), position: { lat: p.lat, lng: p.lng, heading } });
      });
      lastSent.current = p;
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const first = !latest.current;
        latest.current = { lat: pos.coords.latitude, lng: pos.coords.longitude, heading: pos.coords.heading, speed: pos.coords.speed };
        if (first) send();
      },
      (err) => setGps((g) => ({ ...g, status: err.code === 1 ? 'denied' : 'unavailable' })),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20_000 },
    );
    const timer = setInterval(send, SEND_EVERY_MS);

    // Keep the screen awake while on duty (background tabs throttle GPS).
    let wakeLock = null;
    navigator.wakeLock?.request('screen').then((l) => (wakeLock = l)).catch(() => {});

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(timer);
      wakeLock?.release().catch(() => {});
      latest.current = null;
      lastSent.current = null;
    };
  }, [onDuty, socket]);

  return (
    <DriverContext.Provider value={{ profile, setProfile, onDuty, setOnDuty, dutyLoading, gps }}>
      {children}
    </DriverContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useDriver = () => useContext(DriverContext);
