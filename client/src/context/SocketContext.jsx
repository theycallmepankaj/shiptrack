import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { getAccessToken, refreshSession } from '@/api/client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);
const URL = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:5000';

/** One authenticated Socket.io connection per signed-in user (FR-7). */
export function SocketProvider({ children }) {
  const { status } = useAuth();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (status !== 'authenticated') return undefined;
    let s;
    let cancelled = false;
    // socket.io-client loads only once someone signs in, keeping it out of the landing page's bundle.
    import('socket.io-client').then(({ io }) => {
      if (cancelled) return;
      // `auth` as a function re-reads the (possibly refreshed) token on every (re)connect.
      s = io(URL, { auth: (cb) => cb({ token: getAccessToken() }), withCredentials: true });
      wire(s);
      setSocket(s);
    });
    return () => {
      cancelled = true;
      s?.disconnect();
      setSocket(null);
    };
  }, [status]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

/** On an expired token, refresh it once and reconnect. */
function wire(s) {
  let refreshing = false;
  s.on('connect_error', async (err) => {
    if (err.message !== 'unauthorized' || refreshing) return;
    refreshing = true;
    try {
      await refreshSession();
      s.connect();
    } catch {
      /* the HTTP interceptor will log the user out */
    } finally {
      refreshing = false;
    }
  });
}

// eslint-disable-next-line react-refresh/only-export-components
export const useSocket = () => useContext(SocketContext);

/** Joins `shipment:<id>` (re-joining after reconnects) and forwards its status and location events. */
// eslint-disable-next-line react-refresh/only-export-components
export function useShipmentRoom(shipmentId, onStatus, onLocation) {
  const socket = useSocket();
  const handler = useRef(onStatus);
  const locHandler = useRef(onLocation);
  handler.current = onStatus;
  locHandler.current = onLocation;

  useEffect(() => {
    if (!socket || !shipmentId) return undefined;
    const join = () => socket.emit('shipment:join', { shipmentId });
    const onEvent = (e) => e.shipmentId === shipmentId && handler.current?.(e);
    const onLoc = (e) => e.shipmentId === shipmentId && locHandler.current?.(e);
    if (socket.connected) join();
    socket.on('connect', join);
    socket.on('shipment:status', onEvent);
    socket.on('shipment:location', onLoc);
    return () => {
      socket.emit('shipment:leave', { shipmentId });
      socket.off('connect', join);
      socket.off('shipment:status', onEvent);
      socket.off('shipment:location', onLoc);
    };
  }, [socket, shipmentId]);
}
