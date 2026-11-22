import { lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock3, Route } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatEta } from '@/lib/format';
import { formatINR } from '@/lib/utils';

const ShipmentMap = lazy(() => import('@/components/map/ShipmentMap'));

/** Sticky live quote with a map preview of the route (§11.4 booking flow). */
export function QuotePanel({ pickup, drop, quote, speed }) {
  const option = quote.data?.options?.[speed];
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface shadow-soft">
      <div className="relative h-56 bg-background">
        {pickup || drop ? (
          <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
            <ShipmentMap pickup={pickup} drop={drop} className="h-full w-full" fit={{ padding: [36, 36] }} interactive={false} />
          </Suspense>
        ) : (
          <div className="grid h-full place-items-center px-6 text-center text-sm text-muted">Choose pickup and drop addresses to preview the route.</div>
        )}
      </div>
      <div className="bg-navy-900 p-5 text-white dark:bg-[#0D1526]">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-white/60">Live quote · {speed === 'express' ? 'Express' : 'Standard'}</p>
            {quote.loading && !option ? (
              <Skeleton className="mt-2 h-9 w-28 bg-white/10" />
            ) : (
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.p key={option?.price.total ?? 'none'} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }} className="font-mono text-3xl font-bold" aria-live="polite">
                  {option ? formatINR(option.price.total) : '—'}
                </motion.p>
              </AnimatePresence>
            )}
          </div>
          {quote.loading && <span className="mt-1 text-xs text-white/50">Updating…</span>}
        </div>
        {quote.error && <p className="mt-2 text-sm text-red-300">{quote.error}</p>}
        {option && (
          <dl className="mt-4 space-y-2 border-t border-white/10 pt-4 text-sm">
            <Row label={<><Route className="h-3.5 w-3.5" /> Distance</>} value={`${quote.data.distanceKm} km`} />
            <Row label={<><Clock3 className="h-3.5 w-3.5" /> Est. delivery</>} value={formatEta(option.estimatedDeliveryAt)} />
            <Row label="Base fare" value={formatINR(option.price.base)} />
            <Row label="Distance charge" value={formatINR(option.price.distanceCharge)} />
            <Row label={`Weight (${option.price.chargeableWeightKg} kg)`} value={formatINR(option.price.weightCharge)} />
            {option.price.speedCharge > 0 && <Row label="Express" value={formatINR(option.price.speedCharge)} />}
          </dl>
        )}
        {!option && !quote.error && !quote.loading && <p className="mt-2 text-sm text-white/60">Add addresses and weight to see your price.</p>}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-1.5 text-white/60">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}
