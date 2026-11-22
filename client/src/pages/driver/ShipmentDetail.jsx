import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Loader2, MapPin, Navigation, Package, PackageCheck, Phone, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, parseApiError } from '@/api/client';
import { SwipeToConfirm } from '@/components/driver/SwipeToConfirm';
import { EmptyState } from '@/components/EmptyState';
import { StatusTimeline } from '@/components/StatusTimeline';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useShipmentRoom } from '@/context/SocketContext';
import { FAILURE_REASONS, NEXT_ACTION } from '@/lib/driverActions';
import { directionsUrl, getPosition, telUrl } from '@/lib/geo';
import { cn } from '@/lib/utils';

export default function DriverShipmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [failOpen, setFailOpen] = useState(false);

  const load = useCallback(() => api.get(`/shipments/${id}`).then(({ data }) => setS(data.shipment)).catch((e) => setError(parseApiError(e).message)), [id]);
  useEffect(() => { load(); }, [load]);
  useShipmentRoom(s?.id, load);

  const update = async (status, extra = {}, doneMsg) => {
    setBusy(true);
    const pos = await getPosition();
    try {
      const { data } = await api.patch(`/driver/shipments/${id}/status`, { status, ...extra, ...(pos ?? {}) });
      setS(data.shipment);
      toast.success(doneMsg);
      return true;
    } catch (e) {
      toast.error(parseApiError(e).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (error) return <EmptyState title="Shipment not found" text={error} action={{ to: '/driver', label: 'Back to today' }} />;
  if (!s) return <div aria-busy="true"><Skeleton className="mb-4 h-8 w-48" /><Skeleton className="h-48" /><Skeleton className="mt-4 h-16" /></div>;

  const action = NEXT_ACTION[s.status];
  const target = s.status === 'ASSIGNED' ? { kind: 'Pickup', ...s.pickup } : { kind: 'Drop-off', ...s.drop };
  const terminal = ['DELIVERED', 'RETURNED', 'CANCELLED'].includes(s.status);

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/driver" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Today</Link>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="font-mono text-2xl font-bold">{s.trackingId}</h1>
        <StatusBadge status={s.status} className="text-sm" />
      </div>

      {!terminal && (
        <section className="rounded-card border border-border bg-surface p-5 shadow-soft" aria-label={`${target.kind} details`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{target.kind}</p>
          <p className="mt-1.5 flex items-start gap-2 text-lg font-bold"><MapPin className="mt-1 h-4 w-4 shrink-0 text-primary-text" /> {target.address}</p>
          <p className="mt-1 text-sm text-muted">{target.contactName} · {target.contactPhone}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button asChild variant="outline" size="lg"><a href={directionsUrl(target)} target="_blank" rel="noreferrer"><Navigation /> Navigate</a></Button>
            <Button asChild variant="outline" size="lg"><a href={telUrl(target.contactPhone)}><Phone /> Call</a></Button>
          </div>
        </section>
      )}

      {/* Actions */}
      <div className="mt-5 space-y-3">
        {action && (
          <SwipeToConfirm key={s.status} label={action.label} loading={busy} onConfirm={() => update(action.to, {}, action.done)} />
        )}
        {s.status === 'OUT_FOR_DELIVERY' && (
          <>
            <Button size="lg" className="h-16 w-full rounded-2xl text-base" onClick={() => navigate(`/driver/shipments/${id}/deliver`)}>
              <PackageCheck className="!h-5 !w-5" /> Deliver — enter code &amp; proof
            </Button>
            <Button variant="outline" size="lg" className="h-14 w-full rounded-2xl text-status-failed" onClick={() => setFailOpen(true)}>
              <AlertTriangle /> Couldn’t deliver
            </Button>
          </>
        )}
        {s.status === 'FAILED_ATTEMPT' && (
          <Button variant="outline" size="lg" className="h-14 w-full rounded-2xl" disabled={busy} onClick={() => update('RETURNED', {}, 'Marked as returned to sender')}>
            <Undo2 /> Return to sender
          </Button>
        )}
        {s.status === 'DELIVERED' && s.proofOfDelivery?.photoUrl && (
          <img src={s.proofOfDelivery.photoUrl} alt="Proof of delivery" className="max-h-72 w-full rounded-card object-cover" loading="lazy" />
        )}
      </div>

      <section className="mt-6 rounded-card border border-border bg-surface p-5 shadow-soft" aria-labelledby="pkg">
        <h2 id="pkg" className="flex items-center gap-2 font-bold"><Package className="h-4 w-4 text-primary-text" /> Package</h2>
        <p className="mt-2 text-sm"><span className="capitalize">{s.package.type}</span> · {s.package.weightKg} kg{s.package.dimensions?.l ? ` · ${s.package.dimensions.l}×${s.package.dimensions.w}×${s.package.dimensions.h} cm` : ''} · <span className="capitalize">{s.speed}</span></p>
        {s.package.description && <p className="mt-1 text-sm text-muted">“{s.package.description}”</p>}
        {s.package.type === 'fragile' && <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-800 dark:text-amber-300">Fragile — handle with care</p>}
      </section>

      <section className="mt-6 rounded-card border border-border bg-surface p-5 shadow-soft" aria-labelledby="tl">
        <h2 id="tl" className="mb-5 font-bold">Timeline</h2>
        <StatusTimeline history={s.statusHistory} status={s.status} />
      </section>

      <FailedDialog open={failOpen} onOpenChange={setFailOpen} busy={busy} onSubmit={async (reason, note) => {
        if (await update('FAILED_ATTEMPT', { reason, note: note || undefined }, 'Failed attempt recorded')) setFailOpen(false);
      }} />
    </div>
  );
}

function FailedDialog({ open, onOpenChange, onSubmit, busy }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const needsNote = reason === 'OTHER';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Why couldn’t you deliver?</DialogTitle>
        <DialogDescription>The customer is notified. You can retry later or return the parcel.</DialogDescription>
        <fieldset className="mt-5 space-y-2">
          <legend className="sr-only">Reason</legend>
          {FAILURE_REASONS.map(([id, label]) => (
            <label key={id} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 text-sm font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary', reason === id ? 'border-primary bg-primary/5' : 'border-border')}>
              <input type="radio" name="reason" value={id} checked={reason === id} onChange={() => setReason(id)} className="accent-[rgb(var(--primary))]" />
              {label}
            </label>
          ))}
        </fieldset>
        <label htmlFor="fail-note" className="mt-4 block text-sm font-medium">Note {needsNote ? '' : <span className="font-normal text-muted">(optional)</span>}</label>
        <textarea id="fail-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1.5 w-full rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-sm" placeholder="e.g. Gate locked, no answer on phone" />
        <Button className="mt-5 w-full bg-status-failed text-white shadow-none" size="lg" disabled={!reason || (needsNote && !note.trim()) || busy} onClick={() => onSubmit(reason, note.trim())}>
          {busy && <Loader2 className="animate-spin" />} Record failed attempt
        </Button>
      </DialogContent>
    </Dialog>
  );
}
