import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Boxes, BrainCircuit, Clock3, IndianRupee, Loader2, RefreshCw, Star, TrendingDown, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api, parseApiError } from '@/api/client';
import { ChartTable, TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { Sparkline } from '@/components/charts/Sparkline';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import { useSocket } from '@/context/SocketContext';
import { STATUS } from '@/lib/status';
import { cn, formatINR, greeting } from '@/lib/utils';
import { PageHeader } from '../shared/PageHeader';

const TZ = 'Asia/Kolkata';
const compactINR = (n) => (n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `₹${n}`);
const fmtDay = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: TZ });
const fmtMonth = (d) => new Date(d).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: TZ });
const PERIODS = { daily: { label: 'Daily', fmt: fmtDay, title: 'last 30 days' }, weekly: { label: 'Weekly', fmt: (d) => `w/c ${fmtDay(d)}`, title: 'last 12 weeks' }, monthly: { label: 'Monthly', fmt: fmtMonth, title: 'last 12 months' } };

/** FR-33 admin dashboard: KPIs, revenue, volume, status mix, on-time rate, top drivers, delays. */
export default function AdminDashboard() {
  const { user } = useAuth();
  const socket = useSocket();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('daily');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    api.get('/admin/stats').then(({ data }) => setData(data)).catch((e) => setError(parseApiError(e).message));
  }, [refresh]);

  // Any status change anywhere → refresh the numbers (debounced).
  useEffect(() => {
    if (!socket) return undefined;
    let t;
    const onAny = () => { clearTimeout(t); t = setTimeout(() => setRefresh((r) => r + 1), 1500); };
    socket.on('shipment:status', onAny);
    return () => { clearTimeout(t); socket.off('shipment:status', onAny); };
  }, [socket]);

  if (error) return <EmptyState title="Couldn’t load stats" text={error} />;
  const k = data?.kpis;
  const daily = data?.series.daily ?? [];
  const delta = k ? k.shipmentsToday - k.shipmentsYesterday : 0;

  return (
    <>
      <PageHeader title={`${greeting()}, ${user.name.split(' ')[0]}`} subtitle="Operations overview. Press ⌘K / Ctrl+K to jump anywhere." />

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {k ? (
          <>
            <StatTile label="Shipments today" value={k.shipmentsToday} icon={Boxes} spark={<Sparkline data={daily} dataKey="shipments" />}
              note={<Delta value={delta} suffix="vs yesterday" />} />
            <StatTile label="Revenue this month" value={formatINR(k.revenue.month)} icon={IndianRupee} spark={<Sparkline data={daily} dataKey="revenue" />}
              note={<span className="text-muted">{formatINR(k.revenue.week)} this week · {formatINR(k.revenue.today)} today</span>} />
            <StatTile label="Delivered on time" value={k.onTimeRate == null ? '—' : `${k.onTimeRate}%`} icon={Clock3}
              spark={<Meter value={k.onTimeRate ?? 0} />} note={<span className="text-muted">of {k.deliveredLast30} deliveries, last 30 days</span>} />
            <StatTile label="Delayed now" value={k.delayed} icon={AlertTriangle} tone={k.delayed ? 'warn' : undefined}
              note={<span className="text-muted">{k.drivers.onDuty} of {k.drivers.total} drivers on duty</span>}
              spark={<Link to="/admin/shipments?status=delayed" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary-text hover:underline">View delayed <ArrowRight className="h-3 w-3" /></Link>} />
          </>
        ) : Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[164px]" />)}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* Revenue */}
        <Panel
          title="Revenue"
          subtitle={`Booked revenue, excluding cancellations · ${PERIODS[period].title}`}
          action={
            <div role="tablist" aria-label="Revenue period" className="flex rounded-lg border border-border p-0.5">
              {Object.entries(PERIODS).map(([key, p]) => (
                <button key={key} role="tab" aria-selected={period === key} onClick={() => setPeriod(key)}
                  className={cn('rounded-md px-2.5 py-1 text-xs font-semibold', period === key ? 'bg-ink text-background' : 'text-muted hover:text-ink')}>{p.label}</button>
              ))}
            </div>
          }
        >
          {data ? (
            <>
              <TimeSeriesChart data={data.series[period]} dataKey="revenue" name="Revenue" formatX={PERIODS[period].fmt} formatY={compactINR} formatValue={formatINR} />
              <ChartTable caption={`Revenue, ${period}`} data={data.series[period]} columns={[{ key: 'date', label: 'Period', format: PERIODS[period].fmt }, { key: 'revenue', label: 'Revenue', format: formatINR }, { key: 'shipments', label: 'Shipments' }]} />
            </>
          ) : <Skeleton className="h-[260px]" />}
        </Panel>

        {/* Status mix */}
        <Panel title="Shipments by status" subtitle="Booked in the last 30 days">
          {data ? <StatusBars rows={data.statusBreakdown} /> : <Skeleton className="h-[260px]" />}
        </Panel>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Shipments per day" subtitle="New bookings · last 30 days">
          {data ? (
            <>
              <TimeSeriesChart kind="bar" data={daily} dataKey="shipments" name="Shipments" formatX={fmtDay} height={220} />
              <ChartTable caption="Shipments per day" data={daily} columns={[{ key: 'date', label: 'Day', format: fmtDay }, { key: 'shipments', label: 'Booked' }, { key: 'delivered', label: 'Delivered' }]} />
            </>
          ) : <Skeleton className="h-[220px]" />}
        </Panel>

        <Panel title="Top drivers" subtitle="By deliveries · last 30 days">
          {data ? (
            data.topDrivers.length ? (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr><th scope="col" className="pb-2 font-medium">Driver</th><th scope="col" className="pb-2 text-right font-medium">Deliveries</th><th scope="col" className="pb-2 text-right font-medium">On time</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.topDrivers.map((d, i) => (
                    <tr key={d.id}>
                      <td className="py-2.5">
                        <span className="flex items-center gap-2.5">
                          <span className="grid h-7 w-7 place-items-center rounded-full bg-ink/5 font-mono text-xs font-bold">{i + 1}</span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{d.name}</span>
                            <span className="flex items-center gap-1 text-xs text-muted"><Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden /> {d.rating?.toFixed(1)} · {formatINR(d.earnings)} earned</span>
                          </span>
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-mono font-semibold">{d.deliveries}</td>
                      <td className="py-2.5 text-right font-mono">{d.onTimeRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-sm text-muted">No deliveries yet.</p>
          ) : <Skeleton className="h-[220px]" />}
        </Panel>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <ForecastPanel />
        <ModelPanel />
      </div>

      {data?.delayed.length > 0 && (
        <Panel className="mt-6" title="Running late" subtitle="Past their promised delivery time">
          <ul className="divide-y divide-border">
            {data.delayed.map((s) => (
              <li key={s.id}>
                <Link to={`/admin/shipments/${s.id}`} className="flex items-center gap-3 py-3 hover:text-primary-text">
                  <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />
                  <span className="font-mono font-semibold">{s.trackingId}</span>
                  <StatusBadge status={s.status} />
                  <span className="min-w-0 flex-1 truncate text-sm text-muted">{s.driver ?? 'Unassigned'}</span>
                  <span className="text-sm font-medium">{s.overdueMinutes < 120 ? `${s.overdueMinutes} min` : `${Math.round(s.overdueMinutes / 60)} h`} late</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}

function Panel({ title, subtitle, action, children, className }) {
  return (
    <section className={cn('rounded-card border border-border bg-surface p-5 shadow-soft', className)} aria-label={title}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">{title}</h2>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatTile({ label, value, icon: Icon, note, spark, tone }) {
  return (
    <div className="flex flex-col rounded-card border border-border bg-surface p-5 shadow-soft">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{label}</p>
        <span className={cn('grid h-9 w-9 place-items-center rounded-lg', tone === 'warn' ? 'bg-amber-500/10 text-amber-600' : 'bg-primary/10 text-primary-text')}><Icon className="h-4 w-4" aria-hidden /></span>
      </div>
      <p className="mt-2 font-mono text-3xl font-bold tabular-nums">{value}</p>
      <div className="mt-1 text-xs">{note}</div>
      <div className="mt-auto pt-2">{spark}</div>
    </div>
  );
}

function Delta({ value, suffix }) {
  if (value === 0) return <span className="text-muted">Same as yesterday</span>;
  const up = value > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex items-center gap-0.5 font-medium', up ? 'text-status-delivered' : 'text-status-failed')}>
      <Icon className="h-3.5 w-3.5" aria-hidden /> {up ? '+' : ''}{value} <span className="ml-1 font-normal text-muted">{suffix}</span>
    </span>
  );
}

/** Ratio against 100 % on a same-hue track. */
function Meter({ value }) {
  return (
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#2a78d6]/15 dark:bg-[#3987e5]/20" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label="On-time rate">
      <div className="h-full rounded-full bg-[#2a78d6] dark:bg-[#3987e5]" style={{ width: `${value}%` }} />
    </div>
  );
}

/** Status mix as labelled horizontal bars — the label carries identity, color reinforces it. */
function StatusBars({ rows }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  const total = rows.reduce((t, r) => t + r.count, 0);
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.status} title={`${STATUS[r.status].label}: ${r.count} (${Math.round((r.count / total) * 100)}%)`}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: STATUS[r.status].color }} aria-hidden />{STATUS[r.status].label}</span>
            <span className="font-mono font-semibold">{r.count} <span className="font-normal text-muted">· {Math.round((r.count / total) * 100)}%</span></span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-ink/5">
            <div className="h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, backgroundColor: STATUS[r.status].color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}


const fmtWeekday = (d) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

/** FR-44 (stretch): next 7 days of expected bookings, total + per city. */
function ForecastPanel() {
  const [f, setF] = useState(undefined);
  useEffect(() => {
    api.get('/admin/forecast').then(({ data }) => setF(data)).catch(() => setF(null));
  }, []);
  if (f === null) return <Panel title="Demand forecast" subtitle="Next 7 days"><p className="text-sm text-muted">Forecast unavailable — the AI service isn’t reachable.</p></Panel>;
  const series = f?.total_daily.map((v, i) => ({ date: new Date(new Date(f.start).getTime() + i * 86_400_000).toISOString(), shipments: v }));
  return (
    <Panel title="Demand forecast" subtitle="Expected bookings · next 7 days · same-weekday average × recent trend">
      {f ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div>
            <TimeSeriesChart kind="bar" data={series} dataKey="shipments" name="Expected bookings" formatX={fmtWeekday} height={200} formatValue={(v) => v.toFixed(1)} />
            <ChartTable caption="Forecast" data={series} columns={[{ key: 'date', label: 'Day', format: fmtWeekday }, { key: 'shipments', label: 'Expected' }]} />
          </div>
          <table className="h-fit w-full text-sm">
            <thead className="text-left text-xs text-muted"><tr><th scope="col" className="pb-2 font-medium">City</th><th scope="col" className="pb-2 text-right font-medium">7-day total</th><th scope="col" className="pb-2 text-right font-medium">Trend</th></tr></thead>
            <tbody className="divide-y divide-border">
              {f.cities.map((c) => {
                const pct = Math.round((c.trend - 1) * 100);
                return (
                  <tr key={c.city}>
                    <td className="py-2">{c.city}</td>
                    <td className="py-2 text-right font-mono font-semibold">{Math.round(c.total)}</td>
                    <td className={cn('py-2 text-right font-mono text-xs', pct > 0 ? 'text-status-delivered' : pct < 0 ? 'text-status-failed' : 'text-muted')}>
                      <span className="inline-flex items-center gap-0.5">{pct > 0 ? <TrendingUp className="h-3 w-3" aria-hidden /> : pct < 0 ? <TrendingDown className="h-3 w-3" aria-hidden /> : null}{pct > 0 ? '+' : ''}{pct}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <Skeleton className="h-[200px]" />}
    </Panel>
  );
}

/** FR-41: which ETA the platform is using, and how well it does on held-out deliveries. */
function ModelPanel() {
  const [info, setInfo] = useState(null);
  const [training, setTraining] = useState(false);
  const load = () => api.get('/admin/ml/model').then(({ data }) => setInfo(data)).catch(() => setInfo({ loaded: false, unreachable: true }));
  useEffect(() => { load(); }, []);
  const retrain = async () => {
    setTraining(true);
    try {
      const { data } = await api.post('/admin/ml/train');
      toast.success(`Model retrained on ${data.metrics.samples} deliveries`);
      load();
    } catch (e) {
      toast.error(parseApiError(e).message);
    } finally {
      setTraining(false);
    }
  };
  const m = info?.metrics;
  return (
    <Panel
      title="Delivery-time model"
      subtitle={info?.loaded ? `Trained ${new Date(info.trained_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Gradient boosting on delivered shipments'}
      action={!info?.unreachable && <Button size="sm" variant="outline" onClick={retrain} disabled={training}>{training ? <Loader2 className="animate-spin" /> : <RefreshCw />} Retrain</Button>}
    >
      {!info && <Skeleton className="h-40" />}
      {info && !info.loaded && (
        <p className="flex items-start gap-2 text-sm text-muted">
          <BrainCircuit className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {info.unreachable ? 'The AI service isn’t reachable — quotes use the distance formula.' : 'Not trained yet — quotes use the distance formula. Retrain once you have 200+ deliveries.'}
        </p>
      )}
      {m && (
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-background p-3">
            <dt className="text-xs text-muted">Typical error</dt>
            <dd className="mt-1 font-mono text-xl font-bold">{m.mae_hours.gradient_boosting_p50} h</dd>
            <dd className="text-xs text-muted">formula: {m.mae_hours.formula} h</dd>
          </div>
          <div className="rounded-xl bg-background p-3">
            <dt className="text-xs text-muted">On time vs promise <span className="font-mono">(p{Math.round(m.promise_quantile * 100)})</span></dt>
            <dd className="mt-1 font-mono text-xl font-bold">{Math.round(m.on_time_if_promised.model * 100)}%</dd>
            <dd className="text-xs text-muted">formula: {Math.round(m.on_time_if_promised.formula * 100)}%</dd>
          </div>
          <div className="col-span-2 rounded-xl bg-background p-3">
            <dt className="text-xs text-muted">Average promised delivery time</dt>
            <dd className="mt-1 font-mono text-xl font-bold">{m.mean_promise_hours.model} h <span className="text-sm font-normal text-muted">vs {m.mean_promise_hours.formula} h with the formula</span></dd>
            <dd className="text-xs text-muted">Held-out test set of {m.test_samples} deliveries (of {m.samples})</dd>
          </div>
        </dl>
      )}
    </Panel>
  );
}
