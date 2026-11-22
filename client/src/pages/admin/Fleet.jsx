import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Package, Search, Truck } from 'lucide-react';
import { api, parseApiError } from '@/api/client';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { useSocket } from '@/context/SocketContext';
import { cn } from '@/lib/utils';

const FleetMap = lazy(() => import('@/components/map/FleetMap'));
const MOVING_MS = 60_000; // "moving" = a GPS fix in the last minute

function ago(at, now) {
  if (!at) return 'never';
  const s = Math.max(0, Math.round((now - new Date(at)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

/** FR-36 live fleet map (admin). Initial snapshot over REST, then `fleet:update` over Socket.io. */
export default function Fleet() {
  const socket = useSocket();
  const [drivers, setDrivers] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [onlyOnDuty, setOnlyOnDuty] = useState(false);
  const [focus, setFocus] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    api.get('/admin/fleet').then(({ data }) => setDrivers(data.drivers)).catch((e) => setError(parseApiError(e).message));
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!socket) return undefined;
    const onUpdate = (u) =>
      setDrivers((list) =>
        list?.map((d) =>
          d.driverId === u.driverId
            ? {
                ...d,
                isOnDuty: u.isOnDuty,
                ...(u.lat != null && { lat: u.lat, lng: u.lng }),
                ...(u.heading != null && { heading: u.heading }),
                ...(u.speedKmh != null && { speedKmh: u.speedKmh }),
                ...(u.activeShipments != null && { activeShipments: u.activeShipments }),
                ...(u.at && { at: u.at }),
              }
            : d,
        ),
      );
    socket.on('fleet:update', onUpdate);
    return () => socket.off('fleet:update', onUpdate);
  }, [socket]);

  const shown = useMemo(
    () =>
      (drivers ?? [])
        .filter((d) => (!onlyOnDuty || d.isOnDuty) && d.name.toLowerCase().includes(query.trim().toLowerCase()))
        .sort((a, b) => Number(b.isOnDuty) - Number(a.isOnDuty) || a.name.localeCompare(b.name)),
    [drivers, onlyOnDuty, query],
  );
  const stats = useMemo(() => {
    const list = drivers ?? [];
    return {
      onDuty: list.filter((d) => d.isOnDuty).length,
      moving: list.filter((d) => d.isOnDuty && d.at && now - new Date(d.at) < MOVING_MS).length,
      active: list.reduce((t, d) => t + (d.activeShipments ?? 0), 0),
    };
  }, [drivers, now]);

  if (error) return <EmptyState title="Couldn’t load the fleet" text={error} />;
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col lg:flex-row">
      <aside className="order-2 flex max-h-[45vh] flex-col border-t border-border bg-surface lg:order-1 lg:max-h-none lg:w-80 lg:border-r lg:border-t-0" aria-label="Drivers">
        <div className="border-b border-border p-4">
          <h1 className="text-xl font-extrabold">Live fleet</h1>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[['On duty', stats.onDuty], ['Moving', stats.moving], ['Active jobs', stats.active]].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-background px-2 py-2">
                <dd className="font-mono text-lg font-bold">{drivers ? v : '–'}</dd>
                <dt className="text-[11px] text-muted">{k}</dt>
              </div>
            ))}
          </dl>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <label htmlFor="fleet-search" className="sr-only">Search drivers</label>
            <input id="fleet-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search drivers" className="h-10 w-full rounded-[10px] border border-border bg-background pl-9 pr-3 text-sm" />
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={onlyOnDuty} onChange={(e) => setOnlyOnDuty(e.target.checked)} className="accent-[rgb(var(--primary))]" /> On duty only
          </label>
        </div>
        <ul className="flex-1 divide-y divide-border overflow-y-auto">
          {!drivers && Array.from({ length: 4 }).map((_, i) => <li key={i} className="p-4"><Skeleton className="h-10" /></li>)}
          {drivers && shown.length === 0 && <li className="p-6 text-center text-sm text-muted">No drivers match.</li>}
          {shown.map((d) => {
            const moving = d.isOnDuty && d.at && now - new Date(d.at) < MOVING_MS;
            return (
              <li key={d.driverId}>
                <button
                  type="button"
                  onClick={() => d.lat != null && setFocus({ lat: d.lat, lng: d.lng, t: Date.now() })}
                  disabled={d.lat == null}
                  className={cn('flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-background disabled:cursor-default', focus && d.lat === focus.lat && 'bg-primary/5')}
                >
                  <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-full', d.isOnDuty ? 'bg-navy-900 text-white' : 'bg-ink/10 text-muted')}>
                    <Truck className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{d.name}</span>
                    <span className="block truncate text-xs text-muted">{d.vehicle?.number} · {d.lat == null ? 'no location yet' : `seen ${ago(d.at, now)}`}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', moving ? 'bg-status-delivered/10 text-status-delivered' : d.isOnDuty ? 'bg-status-transit/10 text-status-transit' : 'bg-ink/5 text-muted')}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', moving ? 'bg-status-delivered' : d.isOnDuty ? 'bg-status-transit' : 'bg-status-cancelled')} />
                      {moving ? 'Moving' : d.isOnDuty ? 'On duty' : 'Off duty'}
                    </span>
                    {d.activeShipments > 0 && <span className="flex items-center gap-1 text-[11px] text-muted"><Package className="h-3 w-3" aria-hidden /> {d.activeShipments}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
      <div className="order-1 min-h-[50vh] flex-1 lg:order-2">
        {drivers ? (
          <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
            <FleetMap drivers={shown} focus={focus} onSelect={(d) => setFocus({ lat: d.lat, lng: d.lng, t: Date.now() })} className="h-full w-full" />
          </Suspense>
        ) : (
          <Skeleton className="h-full w-full rounded-none" />
        )}
      </div>
    </div>
  );
}
