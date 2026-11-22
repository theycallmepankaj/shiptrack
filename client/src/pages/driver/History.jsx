import { useEffect, useState } from 'react';
import { CalendarDays, CalendarRange, IndianRupee, Star } from 'lucide-react';
import { api, parseApiError } from '@/api/client';
import { EmptyState } from '@/components/EmptyState';
import { KpiCard } from '@/components/KpiCard';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/format';
import { formatINR } from '@/lib/utils';
import { PageHeader } from '../shared/PageHeader';

/** FR-29: delivery history and earnings. */
export default function DriverHistory() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/driver/history', { params: { page } }).then(({ data }) => setData(data)).catch((e) => setError(parseApiError(e).message));
  }, [page]);

  if (error) return <EmptyState title="Couldn’t load history" text={error} />;
  const sm = data?.summary;
  return (
    <>
      <PageHeader title="History & earnings" subtitle="Deliveries you’ve completed and what you’ve earned." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {sm ? (
          <>
            <KpiCard label="Today" value={formatINR(sm.today.earnings)} note={`${sm.today.deliveries} deliveries`} icon={IndianRupee} />
            <KpiCard label="This week" value={formatINR(sm.week.earnings)} note={`${sm.week.deliveries} deliveries`} icon={CalendarRange} />
            <KpiCard label="This month" value={formatINR(sm.month.earnings)} note={`${sm.month.deliveries} deliveries`} icon={CalendarDays} />
            <KpiCard label="Rating" value={sm.rating.toFixed(1)} note={`${sm.totalDeliveries} all-time deliveries`} icon={Star} />
          </>
        ) : Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[118px]" />)}
      </div>

      <h2 className="mb-4 mt-10 text-lg font-bold">Past deliveries</h2>
      {!data && <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>}
      {data && data.items.length === 0 && <EmptyState title="No deliveries yet" text="Completed deliveries and earnings will show up here." />}
      {data && data.items.length > 0 && (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface shadow-soft">
            {data.items.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="font-mono font-semibold">{s.trackingId}</p>
                  <p className="truncate text-sm text-muted">{s.pickup.city} → {s.drop.address}</p>
                </div>
                <span className="font-mono text-xs text-muted">{formatDateTime(s.statusHistory.at(-1)?.at)}</span>
                <StatusBadge status={s.status} />
                <span className="w-16 text-right font-mono font-semibold">{s.driverEarning ? formatINR(s.driverEarning) : '—'}</span>
              </li>
            ))}
          </ul>
          {data.pages > 1 && (
            <div className="mt-4 flex justify-between">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
