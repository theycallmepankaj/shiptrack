import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, Search, Star, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { api, parseApiError } from '@/api/client';
import { FormAlert, FormField } from '@/components/auth/FormField';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { PageHeader } from '../shared/PageHeader';

const TABS = [['all', 'All'], ['on-duty', 'On duty'], ['active', 'Active'], ['inactive', 'Deactivated']];
const VEHICLES = [['bike', 'Bike', 20], ['scooter', 'Scooter', 25], ['van', 'Van', 400], ['truck', 'Truck', 2000]];

function lastSeen(at) {
  if (!at) return 'never';
  const m = Math.round((Date.now() - new Date(at)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}

/** FR-30: create, edit and deactivate drivers and their vehicles. */
export default function AdminDrivers() {
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [drivers, setDrivers] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // driver | 'new' | null

  const load = useCallback(() => {
    api.get('/admin/drivers', { params: { status, q: q.trim() || undefined } }).then(({ data }) => setDrivers(data.drivers)).catch((e) => setError(parseApiError(e).message));
  }, [status, q]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  if (error) return <EmptyState title="Couldn’t load drivers" text={error} />;
  return (
    <>
      <PageHeader title="Drivers" subtitle="Manage your delivery team and their vehicles." actions={<Button onClick={() => setEditing('new')}><Plus /> Add driver</Button>} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Filter drivers" className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={status === id} onClick={() => setStatus(id)} className={cn('whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium', status === id ? 'bg-ink text-background' : 'text-muted hover:text-ink')}>{label}</button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <label htmlFor="drv-q" className="sr-only">Search drivers</label>
          <input id="drv-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className="h-10 w-full rounded-[10px] border border-border bg-surface pl-9 pr-3 text-sm" />
        </div>
      </div>

      {!drivers && <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>}
      {drivers?.length === 0 && <EmptyState title="No drivers here" text="Add your first driver to start assigning shipments." />}
      {drivers?.length > 0 && (
        <div className="relative overflow-x-auto rounded-card border border-border bg-surface shadow-soft">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-border bg-background text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Driver</th>
                <th scope="col" className="px-4 py-3 font-semibold">Vehicle</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Active</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Delivered</th>
                <th scope="col" className="px-4 py-3 font-semibold">Last seen</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {drivers.map((d) => (
                <tr key={d.id} className={cn(!d.isActive && 'opacity-60')}>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{d.name}</p>
                    <p className="text-xs text-muted">{d.email} · {d.phone}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="flex items-center gap-1.5 font-mono"><Truck className="h-3.5 w-3.5 text-muted" aria-hidden />{d.vehicle.number}</p>
                    <p className="text-xs text-muted"><span className="capitalize">{d.vehicle.type}</span> · {d.vehicle.capacityKg} kg</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', !d.isActive ? 'bg-ink/5 text-muted' : d.isOnDuty ? 'bg-status-delivered/10 text-status-delivered' : 'bg-ink/5 text-muted')}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', !d.isActive ? 'bg-status-cancelled' : d.isOnDuty ? 'bg-status-delivered' : 'bg-status-booked')} />
                      {!d.isActive ? 'Deactivated' : d.isOnDuty ? 'On duty' : 'Off duty'}
                    </span>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted"><Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden /> {d.rating?.toFixed(1)}</p>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{d.activeShipments}</td>
                  <td className="px-4 py-3 text-right font-mono">{d.totalDeliveries}</td>
                  <td className="px-4 py-3 text-muted">{lastSeen(d.lastLocationAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(d)} aria-label={`Edit ${d.name}`}><Pencil /> Edit</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <DriverDialog driver={editing} onOpenChange={(o) => !o && setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    </>
  );
}

function DriverDialog({ driver, onOpenChange, onSaved }) {
  const isNew = driver === 'new';
  const blank = { name: '', email: '', phone: '', password: '', type: 'bike', number: '', capacityKg: '20', isActive: true };
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setErrors({});
    setFormError('');
    if (isNew) setForm(blank);
    else if (driver) setForm({ name: driver.name, email: driver.email, phone: driver.phone ?? '', password: '', type: driver.vehicle.type, number: driver.vehicle.number, capacityKg: String(driver.vehicle.capacityKg), isActive: driver.isActive });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError('');
    const vehicle = { type: form.type, number: form.number, capacityKg: Number(form.capacityKg) };
    try {
      if (isNew) await api.post('/admin/drivers', { name: form.name, email: form.email, phone: form.phone, password: form.password, vehicle });
      else await api.patch(`/admin/drivers/${driver.id}`, { name: form.name, phone: form.phone, vehicle, isActive: form.isActive });
      toast.success(isNew ? `${form.name} added — they can log in now` : 'Driver updated');
      onSaved();
    } catch (err) {
      const { message, fields } = parseApiError(err);
      const flat = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k.replace('vehicle.', ''), v]));
      setErrors(flat);
      setFormError(Object.keys(flat).length ? '' : message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!driver} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{isNew ? 'Add driver' : `Edit ${driver?.name}`}</DialogTitle>
        <DialogDescription>{isNew ? 'They’ll log in with this email and password, then can change it via “Forgot password”.' : 'Changes apply immediately.'}</DialogDescription>
        <form onSubmit={save} noValidate className="mt-5 space-y-4">
          <FormAlert>{formError}</FormAlert>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Full name" value={form.name} onChange={set('name')} error={errors.name} />
            <FormField label="Phone" type="tel" value={form.phone} onChange={set('phone')} error={errors.phone} />
          </div>
          {isNew && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Email" type="email" value={form.email} onChange={set('email')} error={errors.email} autoComplete="off" />
              <FormField label="Temporary password" type="password" value={form.password} onChange={set('password')} error={errors.password} autoComplete="new-password" hint="8+ chars, letter + number" />
            </div>
          )}
          <fieldset className="grid gap-4 sm:grid-cols-3">
            <legend className="mb-1.5 text-sm font-medium">Vehicle</legend>
            <div className="space-y-1.5">
              <label htmlFor="veh-type" className="text-xs text-muted">Type</label>
              <select id="veh-type" value={form.type} onChange={(e) => { const v = VEHICLES.find((x) => x[0] === e.target.value); setForm((f) => ({ ...f, type: v[0], capacityKg: isNew ? String(v[2]) : f.capacityKg })); }} className="h-11 w-full rounded-[10px] border border-border bg-surface px-3 text-sm">
                {VEHICLES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </div>
            <FormField label="Registration" value={form.number} onChange={set('number')} error={errors.number} className="[&_input]:uppercase [&_label]:text-xs [&_label]:font-normal [&_label]:text-muted" />
            <FormField label="Capacity (kg)" type="number" min="1" value={form.capacityKg} onChange={set('capacityKg')} error={errors.capacityKg} className="[&_label]:text-xs [&_label]:font-normal [&_label]:text-muted" />
          </fieldset>
          {!isNew && (
            <label className="flex items-center justify-between rounded-xl border border-border p-3">
              <span>
                <span className="block text-sm font-medium">Active</span>
                <span className="block text-xs text-muted">Deactivated drivers can’t log in or receive shipments.</span>
              </span>
              <input type="checkbox" checked={form.isActive} onChange={set('isActive')} className="h-5 w-5 accent-[rgb(var(--primary))]" />
            </label>
          )}
          <Button type="submit" className="w-full" disabled={saving}>{saving && <Loader2 className="animate-spin" />} {isNew ? 'Add driver' : 'Save changes'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
