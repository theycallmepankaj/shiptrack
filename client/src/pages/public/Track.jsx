import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Clock3, PackageSearch, Search } from 'lucide-react';
import { toast } from 'sonner';
import { api, parseApiError } from '@/api/client';
import { Navbar } from '@/components/Navbar';
import { ChatWidget } from '@/components/chat/ChatWidget';
import { StatusTimeline } from '@/components/StatusTimeline';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import { useCountdown } from '@/hooks/useCountdown';
import { formatDateTime, formatDuration, formatEta } from '@/lib/format';
import { progressOf, STATUS, TERMINAL } from '@/lib/status';

const ShipmentMap = lazy(() => import('@/components/map/ShipmentMap'));
const TRACKING_RE = /^SHP-[A-Z0-9]{6}$/;
const POLL_MS = 60_000;

export default function Track() {
  const { trackingId } = useParams();
  return trackingId ? <TrackResult trackingId={trackingId.toUpperCase()} /> : <TrackSearch />;
}

function TrackForm({ initial = '', compact = false }) {
  const navigate = useNavigate();
  const [value, setValue] = useState(initial);
  const submit = (e) => {
    e.preventDefault();
    const id = value.trim().toUpperCase();
    if (!TRACKING_RE.test(id)) return toast.error('Tracking IDs look like SHP-7X4K2P');
    navigate(`/track/${id}`);
  };
  return (
    <form onSubmit={submit} role="search" className={`flex gap-2 rounded-2xl border border-border bg-surface p-2 shadow-soft ${compact ? '' : 'shadow-lift'}`}>
      <label htmlFor="track-id" className="sr-only">Tracking ID</label>
      <div className="flex flex-1 items-center gap-2 px-2">
        <PackageSearch className="h-5 w-5 shrink-0 text-muted" aria-hidden />
        <input id="track-id" value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. SHP-7X4K2P" autoComplete="off" spellCheck={false}
          className={`w-full bg-transparent font-mono uppercase outline-none placeholder:font-sans placeholder:normal-case placeholder:text-muted focus-visible:ring-0 focus-visible:ring-offset-0 ${compact ? 'h-9 text-sm' : 'h-12'}`} />
      </div>
      <Button type="submit" size={compact ? 'sm' : 'lg'}><Search /> Track</Button>
    </form>
  );
}

function TrackSearch() {
  return (
    <>
      <Navbar />
      <main className="container grid min-h-screen place-items-center pt-24">
        <div className="w-full max-w-xl text-center">
          <span className="eyebrow">Track parcel</span>
          <h1 className="section-title mt-4">Where’s my parcel?</h1>
          <p className="mt-3 text-muted">Enter the tracking ID from your confirmation email or SMS.</p>
          <div className="mt-8"><TrackForm /></div>
        </div>
      </main>
      <ChatWidget />
    </>
  );
}

function TrackResult({ trackingId }) {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, shipment: null, error: '' });

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/shipments/track/${trackingId}`);
      setState({ loading: false, shipment: data.shipment, error: '' });
    } catch (err) {
      setState({ loading: false, shipment: null, error: parseApiError(err).message });
    }
  }, [trackingId]);

  useEffect(() => {
    setState({ loading: true, shipment: null, error: '' });
    load();
    const id = setInterval(load, POLL_MS); // public page: polling; owners get live sockets on their detail page
    return () => clearInterval(id);
  }, [load]);

  const s = state.shipment;
  const wide = useMediaQuery('(min-width: 1024px)');
  // On desktop the card floats over the left of the map; keep the route clear of it.
  const fit = wide ? { paddingTopLeft: [500, 140], paddingBottomRight: [80, 80] } : { padding: [40, 40] };
  return (
    <>
      <Navbar />
      <main className="relative min-h-screen pt-[88px] lg:pt-0">
        {/* Full-width map */}
        <div className="h-[45vh] lg:fixed lg:inset-0 lg:h-auto">
          {s ? (
            <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
              <ShipmentMap pickup={s.from} drop={s.to} progress={progressOf(s.status)} className="h-full w-full" fit={fit} />
            </Suspense>
          ) : (
            <div className="h-full w-full bg-[radial-gradient(circle_at_50%_40%,rgb(var(--primary)/0.08),transparent_60%)]" />
          )}
        </div>

        {/* Floating glass card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-[500] px-3 pb-10 lg:absolute lg:left-6 lg:top-28 lg:w-[420px] lg:px-0"
        >
          <div className="-mt-10 rounded-[20px] border border-border bg-surface/90 p-5 shadow-lift backdrop-blur-xl lg:mt-0 lg:max-h-[calc(100vh-8.5rem)] lg:overflow-y-auto sm:p-6">
            <TrackForm initial={trackingId} compact />
            {state.loading && <div className="mt-6 space-y-3"><Skeleton className="h-8 w-40" /><Skeleton className="h-20" /><Skeleton className="h-48" /></div>}
            {state.error && (
              <div className="mt-6 text-center">
                <p className="font-semibold">{state.error}</p>
                <p className="mt-1 text-sm text-muted">Check the ID in your confirmation email and try again.</p>
              </div>
            )}
            {s && <TrackDetails s={s} isLoggedIn={!!user} />}
          </div>
        </motion.div>
      </main>
      <ChatWidget trackingId={trackingId} />
    </>
  );
}

function TrackDetails({ s, isLoggedIn }) {
  const hours = useCountdown(s.estimatedDeliveryAt);
  const terminal = TERMINAL.includes(s.status);
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-lg font-bold">{s.trackingId}</p>
        <StatusBadge status={s.status} />
      </div>
      <p className="mt-1 text-sm text-muted">{s.from.city || 'Pickup'} → {s.to.city || 'Drop'} · {s.distanceKm} km · <span className="capitalize">{s.speed}</span></p>

      <div className="mt-5 rounded-xl bg-background p-4">
        {terminal ? (
          <>
            <p className="text-xs text-muted">{STATUS[s.status].label}</p>
            <p className="font-display text-2xl font-extrabold">{formatDateTime(s.statusHistory.at(-1)?.at)}</p>
          </>
        ) : (
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-muted">Estimated delivery</p>
              <p className="font-display text-2xl font-extrabold">{formatEta(s.estimatedDeliveryAt)}</p>
              <p className="text-sm text-muted">{hours > 0 ? <>in <span className="font-mono font-semibold text-ink">{formatDuration(hours)}</span></> : 'Arriving soon'}</p>
            </div>
            <Clock3 className="h-8 w-8 text-primary" aria-hidden />
          </div>
        )}
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-label="Delivery progress" aria-valuenow={Math.round(progressOf(s.status) * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${progressOf(s.status) * 100}%` }} />
        </div>
      </div>

      <h2 className="mb-4 mt-6 text-sm font-bold">Timeline</h2>
      <StatusTimeline history={s.statusHistory} status={s.status} />

      <p className="mt-6 rounded-xl border border-dashed border-border p-3 text-xs text-muted">
        {isLoggedIn ? (
          <>If you sent this parcel, open it from <Link to="/app/shipments" className="font-semibold text-primary-text hover:underline">My shipments <ArrowRight className="inline h-3 w-3" /></Link> for live updates and full details.</>
        ) : (
          <>Sent this parcel? <Link to="/login" className="font-semibold text-primary-text hover:underline">Log in</Link> to see the live driver map and full details.</>
        )}
      </p>
    </div>
  );
}
