import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search, UserPlus, X } from 'lucide-react';
import { api, parseApiError } from '@/api/client';
import { AssignDialog } from '@/components/admin/AssignDialog';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge, UnpaidBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSocket } from '@/context/SocketContext';
import { formatDateTime } from '@/lib/format';
import { STATUS } from '@/lib/status';
import { cn, formatINR } from '@/lib/utils';
import { PageHeader } from '../shared/PageHeader';

const selectCls = 'h-10 rounded-[10px] border border-border bg-surface px-3 text-sm text-ink';
const FILTER_KEYS = ['status', 'driver', 'city', 'from', 'to', 'q'];

/** FR-32: all shipments with filters by status, date, driver and city; sortable; assign inline. */
export default function AdminShipments() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const socket = useSocket();
  const [data, setData] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [error, setError] = useState('');
  const [q, setQ] = useState(params.get('q') ?? '');
  const [assigning, setAssigning] = useState(null);
  const [reload, setReload] = useState(0);
  const sort = params.get('sort') ?? '-createdAt';
  const page = Number(params.get('page') ?? 1);

  useEffect(() => {
    api.get('/admin/drivers').then(({ data }) => setDrivers(data.drivers)).catch(() => {});
  }, []);

  useEffect(() => {
    const query = Object.fromEntries([...params.entries()].filter(([, v]) => v));
    if (query.to) query.to = `${query.to}T23:59:59+05:30`;
    if (query.from) query.from = `${query.from}T00:00:00+05:30`;
    let alive = true;
    api.get('/admin/shipments', { params: { limit: 20, ...query } })
      .then(({ data }) => alive && setData(data))
      .catch((e) => alive && setError(parseApiError(e).message));
    return () => { alive = false; };
  }, [params, reload]);

  useEffect(() => {
    if (!socket) return undefined;
    let t;
    const onAny = () => { clearTimeout(t); t = setTimeout(() => setReload((r) => r + 1), 800); };
    socket.on('shipment:status', onAny);
    return () => { clearTimeout(t); socket.off('shipment:status', onAny); };
  }, [socket]);

  const update = (next) => {
    const p = new URLSearchParams(params);
    Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    if (!('page' in next)) p.delete('page');
    setParams(p, { replace: true });
  };
  const sortBy = (field) => update({ sort: sort === `-${field}` ? field : `-${field}` });
  const active = FILTER_KEYS.some((k) => params.get(k));

  if (error) return <EmptyState title="Couldn’t load shipments" text={error} />;
  return (
    <>
      <PageHeader title="Shipments" subtitle={data ? `${data.total.toLocaleString('en-IN')} shipment${data.total === 1 ? '' : 's'}` : 'Loading…'} />

      {/* Filters: one row */}
      <div className="mb-4 flex flex-wrap items-end gap-2" role="group" aria-label="Filters">
        <form onSubmit={(e) => { e.preventDefault(); update({ q: q.trim() }); }} className="relative" role="search">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <label htmlFor="adm-q" className="sr-only">Tracking ID</label>
          <input id="adm-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tracking ID" className={cn(selectCls, 'w-40 pl-9 font-mono uppercase placeholder:font-sans placeholder:normal-case placeholder:text-muted')} />
        </form>
        <label className="sr-only" htmlFor="adm-status">Status</label>
        <select id="adm-status" value={params.get('status') ?? ''} onChange={(e) => update({ status: e.target.value })} className={selectCls}>
          <option value="">All statuses</option>
          <option value="active">Active (not finished)</option>
          <option value="delayed">Delayed</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <label className="sr-only" htmlFor="adm-driver">Driver</label>
        <select id="adm-driver" value={params.get('driver') ?? ''} onChange={(e) => update({ driver: e.target.value })} className={selectCls}>
          <option value="">All drivers</option>
          <option value="unassigned">Unassigned</option>
          {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <label className="sr-only" htmlFor="adm-city">City</label>
        <select id="adm-city" value={params.get('city') ?? ''} onChange={(e) => update({ city: e.target.value })} className={selectCls}>
          <option value="">All cities</option>
          {(data?.cities ?? []).map((c) => <option key={c}>{c}</option>)}
        </select>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <label className="text-xs text-muted" htmlFor="adm-from">From</label>
          <input id="adm-from" type="date" value={params.get('from') ?? ''} onChange={(e) => update({ from: e.target.value })} className={cn(selectCls, 'w-[8.75rem]')} />
          <label className="text-xs text-muted" htmlFor="adm-to">to</label>
          <input id="adm-to" type="date" value={params.get('to') ?? ''} onChange={(e) => update({ to: e.target.value })} className={cn(selectCls, 'w-[8.75rem]')} />
        </div>
        {active && <Button variant="ghost" size="sm" onClick={() => { setQ(''); setParams({}, { replace: true }); }}><X /> Clear</Button>}
      </div>

      {!data && <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>}
      {data && data.items.length === 0 && <EmptyState title="No shipments match" text="Try widening the filters." />}
      {data && data.items.length > 0 && (
        <>
          <div className="relative overflow-x-auto rounded-card border border-border bg-surface shadow-soft">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="border-b border-border bg-background text-left text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Tracking ID</th>
                  <SortTh label="Booked" field="createdAt" sort={sort} onSort={sortBy} />
                  <th scope="col" className="px-4 py-3 font-semibold">Customer</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Route</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Driver</th>
                  <SortTh label="Promised by" field="promisedDeliveryAt" sort={sort} onSort={sortBy} />
                  <SortTh label="Total" field="price" sort={sort} onSort={sortBy} align="right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.items.map((s) => (
                  <tr key={s.id} onClick={() => navigate(`/admin/shipments/${s.id}`)} className="cursor-pointer hover:bg-background">
                    <td className="px-4 py-3"><Link to={`/admin/shipments/${s.id}`} onClick={(e) => e.stopPropagation()} className="font-mono font-semibold hover:text-primary-text">{s.trackingId}</Link></td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDateTime(s.createdAt)}</td>
                    <td className="max-w-[10rem] truncate px-4 py-3">{s.customer}</td>
                    <td className="px-4 py-3 text-muted">{s.from === s.to ? s.from : `${s.from} → ${s.to}`}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5"><StatusBadge status={s.status} /><UnpaidBadge payment={s.paymentStatus} status={s.status} />{s.delayed && <AlertTriangle className="h-4 w-4 text-amber-500" aria-label="Delayed" />}</span>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {s.status === 'BOOKED' && s.paymentStatus !== 'paid' ? (
                        <span className="text-xs text-muted">Waiting for payment</span>
                      ) : ['BOOKED', 'ASSIGNED'].includes(s.status) ? (
                        <button type="button" onClick={() => setAssigning(s)} className={cn('inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium hover:bg-ink/5', !s.driver && 'text-primary-text')}>
                          {s.driver ? s.driver.name : <><UserPlus className="h-4 w-4" /> Assign</>}
                        </button>
                      ) : <span className="text-muted">{s.driver?.name ?? '—'}</span>}
                    </td>
                    <td className={cn('whitespace-nowrap px-4 py-3', s.delayed ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-muted')}>{formatDateTime(s.promisedDeliveryAt)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">{formatINR(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted">Page {page} of {data.pages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}><ChevronLeft /> Prev</Button>
              <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => update({ page: String(page + 1) })}>Next <ChevronRight /></Button>
            </div>
          </nav>
        </>
      )}
      <AssignDialog shipment={assigning} open={!!assigning} onOpenChange={(o) => !o && setAssigning(null)} onAssigned={() => setReload((r) => r + 1)} />
    </>
  );
}

function SortTh({ label, field, sort, onSort, align }) {
  const dir = sort === field ? 'asc' : sort === `-${field}` ? 'desc' : null;
  return (
    <th scope="col" aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'} className={cn('px-4 py-3 font-semibold', align === 'right' && 'text-right')}>
      <button type="button" onClick={() => onSort(field)} className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-ink">
        {label} {dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : dir === 'desc' ? <ArrowDown className="h-3 w-3" /> : null}
      </button>
    </th>
  );
}
