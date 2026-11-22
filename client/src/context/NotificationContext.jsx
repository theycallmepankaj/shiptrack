import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/api/client';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';

const NotificationContext = createContext(null);
const RECENT = 8;

/**
 * FR-37/39: the signed-in user's notifications — unread count + latest few for the bell,
 * kept live by `notification:new` and shared with the Notifications page.
 */
export function NotificationProvider({ children }) {
  const { status } = useAuth();
  const socket = useSocket();
  const [recent, setRecent] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const { data } = await api.get('/notifications', { params: { limit: RECENT } });
    setRecent(data.items);
    setUnread(data.unreadCount);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') {
      setRecent([]);
      setUnread(0);
      setLoaded(false);
      return;
    }
    refresh().catch(() => {});
  }, [status, refresh]);

  useEffect(() => {
    if (!socket) return undefined;
    const onNew = (n) => {
      setRecent((list) => [n, ...list.filter((x) => x.id !== n.id)].slice(0, RECENT));
      setUnread((u) => u + 1);
      // Pages that already show the change live (e.g. the shipment you're looking at) don't need a toast too.
      if (n.link !== window.location.pathname) toast(n.title, { description: n.message });
    };
    // Catch up on anything sent while the socket was reconnecting.
    const onReconnect = () => refresh().catch(() => {});
    socket.on('notification:new', onNew);
    socket.io.on('reconnect', onReconnect);
    return () => {
      socket.off('notification:new', onNew);
      socket.io.off('reconnect', onReconnect);
    };
  }, [socket, refresh]);

  const markRead = useCallback(async (id) => {
    let wasUnread = false;
    setRecent((list) => list.map((n) => {
      if (n.id !== id) return n;
      wasUnread = !n.isRead;
      return { ...n, isRead: true };
    }));
    try {
      const { data } = await api.patch(`/notifications/${id}/read`);
      setUnread(data.unreadCount);
    } catch {
      if (wasUnread) refresh().catch(() => {});
    }
  }, [refresh]);

  const markAllRead = useCallback(async () => {
    setRecent((list) => list.map((n) => ({ ...n, isRead: true })));
    setUnread(0);
    await api.patch('/notifications/read-all').catch(() => refresh().catch(() => {}));
  }, [refresh]);

  const value = useMemo(() => ({ recent, unread, loaded, refresh, markRead, markAllRead }), [recent, unread, loaded, refresh, markRead, markAllRead]);
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useNotifications = () => useContext(NotificationContext);
