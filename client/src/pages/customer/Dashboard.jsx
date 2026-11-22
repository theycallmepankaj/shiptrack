import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, IndianRupee, PackagePlus, Truck } from 'lucide-react';
import { api } from '@/api/client';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/EmptyState';
import { KpiCard } from '@/components/KpiCard';
import { useAuth } from '@/context/AuthContext';
import { formatEta } from '@/lib/format';
import { formatINR, greeting } from '@/lib/utils';
import { PageHeader } from '../shared/PageHeader';

export default function CustomerDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/shipments/mine', { params: { limit: 5 } }).then(({ data }) => setData(data)).catch(() => setData({ items: [], summary: { active: 0, delivered: 0, spent: 0 } }));
  }, []);

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user.name.split(' ')[0]}`}
        subtitle="Here’s what’s happening with your shipments."
        actions={<Button asChild><Link to="/app/book"><PackagePlus /> Book shipment</Link></Button>}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        {data ? (
          <>
            <KpiCard label="Active shipments" value={data.summary.active} icon={Truck} />
            <KpiCard label="Delivered" value={data.summary.delivered} icon={CheckCircle2} />
            <KpiCard label="Total spent" value={formatINR(data.summary.spent)} icon={IndianRupee} />
          </>
        ) : (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[118px]" />)
        )}
      </div>

      <div className="mb-4 mt-10 flex items-center justify-between">
        <h2 className="text-lg font-bold">Recent shipments</h2>
        {data?.items.length > 0 && <Link to="/app/shipments" className="text-sm font-semibold text-primary-text hover:underline">View all</Link>}
      </div>
      {!data && <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>}
      {data && data.items.length === 0 && (
        <EmptyState title="No shipments yet" text="Book your first shipment to get an instant quote and track it live on the map." action={{ to: '/app/book', label: 'Book a shipment', icon: PackagePlus }} />
      )}
      {data && data.items.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface shadow-soft">
          {data.items.map((s) => (
            <li key={s.id}>
              <Link to={`/app/shipments/${s.id}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-background">
                <div className="min-w-0 flex-1">
                  <p className="font-mono font-semibold">{s.trackingId}</p>
                  <p className="truncate text-sm text-muted">{s.from} → {s.to}</p>
                </div>
                <div className="hidden text-right text-sm sm:block">
                  <p className="text-muted">{['DELIVERED', 'CANCELLED', 'RETURNED'].includes(s.status) ? '' : formatEta(s.estimatedDeliveryAt)}</p>
                </div>
                <StatusBadge status={s.status} />
                <ArrowRight className="h-4 w-4 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
