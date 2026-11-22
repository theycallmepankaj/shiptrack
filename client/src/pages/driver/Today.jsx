import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, LocateFixed, LocateOff, MapPin, Navigation, PackageCheck, Phone, Route, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { api, parseApiError } from '@/api/client';
import { DutyToggle } from '@/components/driver/DutyToggle';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import { useSocket } from '@/context/SocketContext';
import { useDriver } from '@/context/DriverContext';
import { directionsUrl, telUrl } from '@/lib/geo';
import { formatTime } from '@/lib/format';
import { greeting } from '@/lib/utils';

const StopsMap = lazy(() => import('@/components/map/StopsMap'));

export default function DriverToday() {
  const { user } = useAuth();
  const socket = useSocket();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const { onDuty, setOnDuty, dutyLoading, gps } = useDriver();

  const load = useCallback(() => {
    api.get('/driver/shipments/today').then(({ data }) => setData(data)).catch((e) => setError(parseApiError(e).message));
  }, []);
  useEffect(load, [load]);

  // New assignments and status changes arrive on the driver's personal room.
  useEffect(() => {
    if (!socket) return undefined;
    const onStatus = (e) => {
      if (e.status === 'ASSIGNED') toast.info(`New shipment assigned: ${e.trackingId}`);
      load();
    };
    socket.on('shipment:status', onStatus);
    return () => socket.off('shipment:status', onStatus);
  }, [socket, load]);

  const toggleDuty = async (isOnDuty) => {
    if (await setOnDuty(isOnDuty)) load(); // re-order stops from the new position
  };

  if (error) return <EmptyState title="Couldn’t load your route" text={error} />;
  if (!data) return <TodaySkeleton />;

  const [next, ...rest] = data.stops;
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">{greeting()}, {user.name.split(' ')[0]}</h1>
          <p className="mt-1 text-muted">{data.stops.length ? `${data.stops.length} stop${data.stops.length > 1 ? 's' : ''} left · ${data.completed.length} done today` : 'No stops right now'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onDuty && <GpsPill gps={gps} />}
          <DutyToggle onDuty={onDuty} onChange={toggleDuty} loading={dutyLoading} />
        </div>
      </div>

      {!onDuty && data.stops.length > 0 && (
        <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">Go on duty to start updating your shipments.</p>
      )}

      {next ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="space-y-4">
            {data.route && <RouteSummary route={data.route} />}
            <NextStopCard stop={next} />
            {rest.length > 0 && (
              <section aria-labelledby="up-next">
                <h2 id="up-next" className="mb-3 mt-6 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted"><Route className="h-4 w-4" /> Up next</h2>
                <ol className="space-y-2">
                  {rest.map((s) => (
                    <li key={`${s.shipment.id}-${s.kind}`}>
                      <Link to={`/driver/shipments/${s.shipment.id}`} className="flex items-center gap-3 rounded-card border border-border bg-surface p-4 shadow-soft transition-colors hover:border-ink/20">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink font-mono text-sm font-bold text-background">{s.sequence}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{s.kind === 'pickup' ? 'Pickup' : s.afterPickup ? 'Drop (after pickup)' : 'Drop'} · {s.shipment.trackingId}</p>
                          <p className="truncate font-medium">{s.address}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
          <div className="h-[320px] overflow-hidden rounded-card border border-border shadow-soft lg:sticky lg:top-24 lg:h-[520px]">
            <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
              <StopsMap stops={data.stops} driver={gps.position ?? data.driver.location} className="h-full w-full" />
            </Suspense>
          </div>
        </div>
      ) : (
        <EmptyState title="Nothing on your route" text={onDuty ? 'New assignments will appear here automatically.' : 'Go on duty to receive assignments.'} />
      )}

      {data.completed.length > 0 && (
        <section className="mt-10" aria-labelledby="done-today">
          <h2 id="done-today" className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted"><CheckCircle2 className="h-4 w-4" /> Completed today</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
            {data.completed.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="font-mono font-semibold">{s.trackingId}</span>
                <span className="min-w-0 flex-1 truncate text-muted">{s.drop.city}</span>
                <span className="font-mono text-xs text-muted">{formatTime(s.statusHistory.at(-1)?.at)}</span>
                <StatusBadge status={s.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function RouteSummary({ route }) {
  const optimised = route.solver === 'ortools';
  return (
    <p className="flex items-center gap-2 text-sm text-muted">
      {optimised ? <Sparkles className="h-4 w-4 text-primary-text" aria-hidden /> : <Route className="h-4 w-4" aria-hidden />}
      {optimised ? 'Optimised route' : 'Nearest-first route'} · {route.stops} stop{route.stops === 1 ? '' : 's'} · <span className="font-mono">{route.totalKm} km</span>
    </p>
  );
}

function GpsPill({ gps }) {
  if (gps.status === 'denied' || gps.status === 'unavailable') {
    return (
      <span role="status" className="inline-flex items-center gap-1.5 rounded-full bg-status-failed/10 px-3 py-1.5 text-xs font-semibold text-status-failed">
        <LocateOff className="h-3.5 w-3.5" /> {gps.status === 'denied' ? 'Location blocked — allow it in browser settings' : 'GPS unavailable'}
      </span>
    );
  }
  return (
    <span role="status" className="inline-flex items-center gap-1.5 rounded-full bg-status-delivered/10 px-3 py-1.5 text-xs font-semibold text-status-delivered">
      {gps.status === 'active' ? (
        <><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping2 rounded-full bg-status-delivered" /><span className="relative h-2 w-2 rounded-full bg-status-delivered" /></span> Sharing live location</>
      ) : (
        <><LocateFixed className="h-3.5 w-3.5" /> Finding GPS…</>
      )}
    </span>
  );
}

function NextStopCard({ stop }) {
  const s = stop.shipment;
  return (
    <article className="overflow-hidden rounded-card bg-navy-900 text-white shadow-lift dark:bg-[#0D1526]" aria-label="Next stop">
      <div className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Next stop · {stop.kind === 'pickup' ? 'Pickup' : 'Drop-off'}</p>
          <StatusBadge status={s.status} className="bg-white/10" />
        </div>
        <p className="mt-3 flex items-start gap-2 text-xl font-extrabold leading-snug sm:text-2xl">
          <MapPin className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden /> {stop.address}
        </p>
        <p className="mt-2 text-sm text-white/70">{stop.contactName} · <span className="font-mono">{s.trackingId}</span> · {s.package.weightKg} kg <span className="capitalize">{s.package.type}</span></p>
      </div>
      <div className="grid grid-cols-3 border-t border-white/10">
        <a href={directionsUrl(stop)} target="_blank" rel="noreferrer" className="flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold hover:bg-white/5">
          <Navigation className="h-5 w-5 text-primary" aria-hidden /> Navigate
        </a>
        <a href={telUrl(stop.contactPhone)} className="flex h-16 flex-col items-center justify-center gap-1 border-x border-white/10 text-xs font-semibold hover:bg-white/5">
          <Phone className="h-5 w-5 text-primary" aria-hidden /> Call
        </a>
        <Link to={`/driver/shipments/${s.id}`} className="flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold hover:bg-white/5">
          <PackageCheck className="h-5 w-5 text-primary" aria-hidden /> Update
        </Link>
      </div>
    </article>
  );
}

function TodaySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading route">
      <div className="mb-6 flex justify-between"><Skeleton className="h-10 w-56" /><Skeleton className="h-12 w-36 rounded-full" /></div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"><Skeleton className="h-56" /><Skeleton className="h-[320px]" /></div>
    </div>
  );
}

