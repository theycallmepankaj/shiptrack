import { useEffect, useMemo, useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, parseApiError } from '@/api/client';
import { FormField } from '@/components/auth/FormField';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/format';
import { formatINR } from '@/lib/utils';
import { PageHeader } from '../shared/PageHeader';

const SAMPLES = [
  { label: 'Document across town', km: 8, kg: 0.5 },
  { label: 'Parcel, 25 km', km: 25, kg: 3 },
  { label: 'Heavy box, 60 km', km: 60, kg: 15 },
];
const priceOf = (r, km, kg, express) => {
  const sub = r.baseFare + km * r.perKm + Math.max(0.5, kg) * r.perKg;
  return Math.round(express ? sub * r.expressMultiplier : sub);
};

/** FR-34: pricing rules — base fare, per-km, per-kg, express multiplier — with a live preview. */
export default function AdminPricing() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => api.get('/admin/pricing').then(({ data }) => {
    setData(data);
    setForm(Object.fromEntries(['baseFare', 'perKm', 'perKg', 'expressMultiplier'].map((k) => [k, String(data.active[k])])));
  }).catch((e) => setError(parseApiError(e).message));
  useEffect(() => { load(); }, []);

  const rule = useMemo(() => form && Object.fromEntries(Object.entries(form).map(([k, v]) => [k, Number(v) || 0])), [form]);
  const dirty = data && rule && ['baseFare', 'perKm', 'perKg', 'expressMultiplier'].some((k) => rule[k] !== data.active[k]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      await api.put('/admin/pricing', rule);
      toast.success('Pricing updated — new quotes use these rates');
      load();
    } catch (err) {
      const { message, fields } = parseApiError(err);
      setErrors(fields);
      if (!Object.keys(fields).length) toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (error) return <EmptyState title="Couldn’t load pricing" text={error} />;
  if (!form) return <Skeleton className="h-96 max-w-4xl" />;
  return (
    <>
      <PageHeader title="Pricing" subtitle="Quotes = base fare + km × per-km + chargeable kg × per-kg, then × express multiplier." />
      <div className="grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form onSubmit={save} noValidate className="rounded-card border border-border bg-surface p-6 shadow-soft">
          <h2 className="font-bold">Current rates</h2>
          {data.active.isDefault && <p className="mt-1 text-xs text-muted">Using built-in defaults — saving creates your first rule.</p>}
          <div className="mt-5 grid grid-cols-2 gap-4">
            <FormField label="Base fare (₹)" type="number" min="0" step="1" value={form.baseFare} onChange={(e) => setForm({ ...form, baseFare: e.target.value })} error={errors.baseFare} />
            <FormField label="Per km (₹)" type="number" min="0" step="0.1" value={form.perKm} onChange={(e) => setForm({ ...form, perKm: e.target.value })} error={errors.perKm} />
            <FormField label="Per kg (₹)" type="number" min="0" step="0.5" value={form.perKg} onChange={(e) => setForm({ ...form, perKg: e.target.value })} error={errors.perKg} />
            <FormField label="Express multiplier (×)" type="number" min="1" max="5" step="0.1" value={form.expressMultiplier} onChange={(e) => setForm({ ...form, expressMultiplier: e.target.value })} error={errors.expressMultiplier} />
          </div>
          <Button type="submit" className="mt-6 w-full" disabled={!dirty || saving}>{saving && <Loader2 className="animate-spin" />} Save new rates</Button>
          {data.active.updatedAt && <p className="mt-3 text-center text-xs text-muted">Last changed {formatDateTime(data.active.updatedAt)}</p>}
        </form>

        <section className="rounded-card border border-border bg-surface p-6 shadow-soft" aria-labelledby="preview-title">
          <h2 id="preview-title" className="font-bold">Preview</h2>
          <p className="text-xs text-muted">Sample quotes with the rates on the left{dirty ? ' (unsaved)' : ''}.</p>
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs text-muted"><tr><th scope="col" className="pb-2 font-medium">Shipment</th><th scope="col" className="pb-2 text-right font-medium">Standard</th><th scope="col" className="pb-2 text-right font-medium">Express</th></tr></thead>
            <tbody className="divide-y divide-border">
              {SAMPLES.map((s) => (
                <tr key={s.label}>
                  <td className="py-2.5"><p className="font-medium">{s.label}</p><p className="text-xs text-muted">{s.km} km · {s.kg} kg</p></td>
                  <td className="py-2.5 text-right font-mono">{formatINR(priceOf(rule, s.km, s.kg, false))}</td>
                  <td className="py-2.5 text-right font-mono font-semibold">{formatINR(priceOf(rule, s.km, s.kg, true))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.history.length > 0 && (
            <>
              <h3 className="mt-6 flex items-center gap-1.5 text-sm font-bold"><History className="h-4 w-4 text-muted" /> Previous rates</h3>
              <ul className="mt-2 space-y-1.5 text-xs text-muted">
                {data.history.map((h) => (
                  <li key={h.id} className="flex justify-between gap-3 font-mono">
                    <span>₹{h.baseFare} + ₹{h.perKm}/km + ₹{h.perKg}/kg · {h.expressMultiplier}×</span>
                    <span className="font-sans">{formatDateTime(h.updatedAt)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </>
  );
}
