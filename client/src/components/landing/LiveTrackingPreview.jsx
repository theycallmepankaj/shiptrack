import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useInView } from 'framer-motion';
import { CheckCircle2, Clock3, MapPin, Package, Star, Truck } from 'lucide-react';
import { Reveal } from '@/components/Reveal';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/badge';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { cn } from '@/lib/utils';

const LiveRouteMap = lazy(() => import('@/components/map/LiveRouteMap'));

// Demo route: Indiranagar → Koramangala, Bengaluru
const ROUTE = [
  [12.9784, 77.6408], [12.9752, 77.6411], [12.9719, 77.6412], [12.9688, 77.6398], [12.9655, 77.6372],
  [12.9622, 77.6385], [12.9591, 77.6392], [12.9563, 77.6365], [12.9531, 77.6339], [12.9497, 77.6318],
  [12.9462, 77.6296], [12.9431, 77.6268], [12.9398, 77.6252], [12.9365, 77.6231], [12.9352, 77.6205],
];
const LOOP_MS = 30_000;
const TRIP_MIN = 18;

const timeline = [
  { label: 'Booked', time: '09:12', icon: Package },
  { label: 'Picked up', time: '09:42', icon: CheckCircle2 },
  { label: 'Out for delivery', time: '09:58', icon: Truck },
  { label: 'Delivered', time: '—', icon: MapPin },
];

export function LiveTrackingPreview() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '200px' });
  const reduced = usePrefersReducedMotion();
  const progressRef = useRef(reduced ? 0.55 : 0);
  const [progress, setProgress] = useState(progressRef.current);

  // Reduced motion (known only after hydration): show a still frame mid-trip.
  useEffect(() => {
    if (reduced) {
      progressRef.current = 0.55;
      setProgress(0.55);
    }
  }, [reduced]);

  // Loop the demo trip; React state is updated ~2x/s for the text, the marker reads the ref every frame.
  useEffect(() => {
    if (!inView || reduced) return;
    let raf;
    const start = performance.now();
    let lastUi = 0;
    const tick = (now) => {
      const t = ((now - start) % (LOOP_MS + 3000)) / LOOP_MS;
      progressRef.current = Math.min(t, 1);
      if (now - lastUi > 500) {
        lastUi = now;
        setProgress(progressRef.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced]);

  const delivered = progress >= 1;
  const etaMin = Math.max(0, Math.ceil(TRIP_MIN * (1 - progress)));
  const activeStep = delivered ? 3 : 2;

  return (
    <section className="section container" aria-labelledby="live-title">
      <Reveal className="mx-auto max-w-2xl text-center">
        <span className="eyebrow">Live tracking</span>
        <h2 id="live-title" className="section-title mt-4">See exactly where your parcel is — right now</h2>
        <p className="mt-4 text-muted">GPS updates every five seconds and the ETA recalculates as the driver moves.</p>
      </Reveal>

      <Reveal className="mt-12">
        <div ref={ref} className="relative overflow-hidden rounded-[24px] border border-border bg-surface shadow-lift">
          <div className="h-[460px] sm:h-[520px]">
            {inView ? (
              <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
                <LiveRouteMap route={ROUTE} progressRef={progressRef} className="h-full w-full" interactive={false} />
              </Suspense>
            ) : (
              <Skeleton className="h-full w-full rounded-none" />
            )}
          </div>

          {/* Floating glass card */}
          <div className="absolute inset-x-3 bottom-3 z-[500] sm:inset-x-auto sm:left-5 sm:top-5 sm:bottom-auto sm:w-[340px]">
            <div className="rounded-2xl border border-border bg-surface/85 p-5 shadow-lift backdrop-blur-xl">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-sm font-semibold">SHP-7X4K2P</p>
                <StatusBadge status={delivered ? 'DELIVERED' : 'OUT_FOR_DELIVERY'} />
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <p className="text-xs text-muted">Arriving in</p>
                  <p className="font-display text-3xl font-extrabold" aria-live="polite">
                    {delivered ? 'Delivered' : <><span className="font-mono">{etaMin}</span> min</>}
                  </p>
                </div>
                <Clock3 className="h-8 w-8 text-primary" aria-hidden />
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-label="Trip progress" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
              </div>

              <ol className="mt-5 hidden space-y-3 sm:block">
                {timeline.map((s, i) => (
                  <li key={s.label} className="flex items-center gap-3 text-sm">
                    <span className={cn('grid h-7 w-7 place-items-center rounded-full', i <= activeStep ? 'bg-primary text-primary-foreground' : 'bg-ink/5 text-muted')}>
                      <s.icon className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <span className={cn('flex-1', i <= activeStep ? 'font-medium' : 'text-muted')}>{s.label}</span>
                    <span className="font-mono text-xs text-muted">{i === 3 && delivered ? '10:16' : s.time}</span>
                  </li>
                ))}
              </ol>

              <div className="mt-5 hidden items-center gap-3 border-t border-border pt-4 sm:flex">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-navy-900 font-semibold text-white">RK</div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">Ravi Kumar</p>
                  <p className="flex items-center gap-1 text-xs text-muted"><Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden /> 4.9 · Bike · KA-01-AB-4821</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
