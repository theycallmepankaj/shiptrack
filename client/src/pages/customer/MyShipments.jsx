import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight, PackagePlus, Search } from 'lucide-react';
import { api, parseApiError } from '@/api/client';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge, UnpaidBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSocket } from '@/context/SocketContext';
import { formatDate, formatEta } from '@/lib/format';
import { cn, formatINR } from '@/lib/utils';
import { PageHeader } from '../shared/PageHeader';

const TABS = [['all', 'All'], ['active', 'Active'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']];

export default function MyShipments() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'all';
  const page = Number(params.get('page') ?? 1);
  const [q, setQ] = useState(params.get('q') ?? '');
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [reload, setReload] = useState(0);
  const navigate = useNavigate();
  const socket = useSocket();

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    api
      .get('/shipments/mine', { params: { status, page, q: params.get('q') || undefined, limit: 10 } })
      .then(({ data }) => alive && setState({ loading: false, data, error: '' }))
      .catch((err) => alive && setState({ loading: false, data: null, error: parseApiError(err).message }));
    return () => { alive = false; };
  }, [status, page, params, reload]);

  // Status changes arrive on the user's personal room — refresh the list.
  useEffect(() => {
    if (!socket) return undefined;
    const onStatus = () => setReload((r) => r + 1);
    socket.on('shipment:status', onStatus);
    return () => socket.off('shipment:status', onStatus);
  }, [socket]);

  const update = (next) => {
    const p = new URLSearchParams(params);
    Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    setParams(p, { replace: true });
  };

  const items = state.data?.items ?? [];
  return (
    <>
      <PageHeader title="My shipments" subtitle="Track and manage everything you’ve sent." actions={<Button asChild><Link to="/app/book"><PackagePlus /> Book shipment</Link></Button>} />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Filter by status" className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={status === id} onClick={() => update({ status: id === 'all' ? '' : id, page: '' })}
              className={cn('whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors', status === id ? 'bg-ink text-background' : 'text-muted hover:text-ink')}>
              {label}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); update({ q: q.trim(), page: '' }); }} className="relative sm:w-64" role="search">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <label htmlFor="ship-search" className="sr-only">Search by tracking ID</label>
          <input id="ship-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tracking ID" className="h-10 w-full rounded-[10px] border border-border bg-surface pl-9 pr-3 font-mono text-sm uppercase placeholder:font-sans placeholder:normal-case placeholder:text-muted" />
        </form>
      </div>

      {state.error && <p className="text-status-failed">{state.error}</p>}
      {state.loading && !state.data && <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>}

      {state.data && items.length === 0 && (
        <EmptyState
          title={status === 'all' && !params.get('q') ? 'No shipments yet' : 'Nothing here'}
          text={status === 'all' && !params.get('q') ? 'Book your first shipment and track it live.' : 'No shipments match this filter.'}
          action={{ to: '/app/book', label: 'Book a shipment', icon: PackagePlus }}
        />
      )}

      {items.length > 0 && (
        <div className={cn('transition-opacity', state.loading && 'opacity-60')}>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-card border border-border bg-surface shadow-soft md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-background text-left text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Tracking ID</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Route</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Est. delivery</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((s) => (
                  <tr key={s.id} onClick={() => navigate(`/app/shipments/${s.id}`)} className="cursor-pointer transition-colors hover:bg-background">
                    <td className="px-5 py-4"><Link to={`/app/shipments/${s.id}`} className="font-mono font-semibold hover:text-primary-text" onClick={(e) => e.stopPropagation()}>{s.trackingId}</Link><p className="text-xs text-muted">{formatDate(s.createdAt)}</p></td>
                    <td className="px-5 py-4"><span className="line-clamp-1">{s.from} <ArrowRight className="inline h-3 w-3 text-muted" aria-label="to" /> {s.to}</span></td>
                    <td className="px-5 py-4"><span className="flex flex-wrap items-center gap-1.5"><StatusBadge status={s.status} /><UnpaidBadge payment={s.paymentStatus} status={s.status} /></span></td>
                    <td className="px-5 py-4 text-muted">{['DELIVERED', 'CANCELLED', 'RETURNED'].includes(s.status) ? '—' : formatEta(s.estimatedDeliveryAt)}</td>
                    <td className="px-5 py-4 text-right font-mono font-semibold">{formatINR(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {items.map((s) => (
              <li key={s.id}>
                <Link to={`/app/shipments/${s.id}`} className="block rounded-card border border-border bg-surface p-4 shadow-soft">
                  <div className="flex items-center justify-between"><span className="font-mono font-semibold">{s.trackingId}</span><span className="flex items-center gap-1.5"><UnpaidBadge payment={s.paymentStatus} status={s.status} /><StatusBadge status={s.status} /></span></div>
                  <p className="mt-2 text-sm">{s.from} → {s.to}</p>
                  <div className="mt-2 flex justify-between text-xs text-muted"><span>{formatDate(s.createdAt)}</span><span className="font-mono font-semibold text-ink">{formatINR(s.total)}</span></div>
                </Link>
              </li>
            ))}
          </ul>

          {state.data.pages > 1 && (
            <nav aria-label="Pagination" className="mt-5 flex items-center justify-between text-sm">
              <span className="text-muted">Page {page} of {state.data.pages}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}><ChevronLeft /> Prev</Button>
                <Button variant="outline" size="sm" disabled={page >= state.data.pages} onClick={() => update({ page: String(page + 1) })}>Next <ChevronRight /></Button>
              </div>
            </nav>
          )}
        </div>
      )}
    </>
  );
}
