import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Copy, CreditCard, Download, ExternalLink, Loader2, MapPin, Package, Phone, Star, UserPlus, XCircle } from 'lucide-react';
import { AssignDialog } from '@/components/admin/AssignDialog';
import { toast } from 'sonner';
import { api, parseApiError } from '@/api/client';
import { StatusTimeline } from '@/components/StatusTimeline';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useShipmentRoom } from '@/context/SocketContext';
import { useCountdown } from '@/hooks/useCountdown';
import { formatDateTime, formatDuration, formatEta, formatTime } from '@/lib/format';
import { CANCELLABLE, progressOf, STATUS, TERMINAL } from '@/lib/status';
import { formatINR, initials } from '@/lib/utils';
import { EmptyState } from '@/components/EmptyState';
import { usePayment } from '@/components/payments/usePayment';
import { downloadInvoice, PAYMENT_LABEL } from '@/lib/invoice';

const ShipmentMap = lazy(() => import('@/components/map/ShipmentMap'));

/** Shipment detail for its owner, or for admins with `variant="admin"` (assign instead of cancel). */
export default function ShipmentDetail({ variant = 'customer' }) {
  const isAdmin = variant === 'admin';
  const listPath = isAdmin ? '/admin/shipments' : '/app/shipments';
  const { id } = useParams();
  const [shipment, setShipment] = useState(null);
  const [error, setError] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [live, setLive] = useState(null); // latest driver fix + live ETA (FR-22)
  const [trail, setTrail] = useState([]);

  const load = useCallback(() => {
    return api
      .get(`/shipments/${id}`)
      .then(({ data }) => {
        setShipment(data.shipment);
        setLive(data.shipment.live ?? null);
      })
      .catch((err) => setError(parseApiError(err).message));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // FR-17: live status updates; FR-21/22: live driver position + ETA.
  useShipmentRoom(
    shipment?.id,
    (e) => {
      toast.info(`${e.trackingId}: ${STATUS[e.status]?.label ?? e.status}`);
      load();
    },
    (loc) => {
      setLive(loc);
      setTrail((t) => [...t.slice(-199), { lat: loc.lat, lng: loc.lng }]);
    },
  );

  if (error) return <EmptyState title="Shipment not found" text={error} action={{ to: listPath, label: isAdmin ? 'Back to shipments' : 'Back to my shipments' }} />;
  if (!shipment) return <DetailSkeleton />;

  const copy = () => navigator.clipboard.writeText(shipment.trackingId).then(() => toast.success('Tracking ID copied'), () => {});

  return (
    <>
      <Link to={listPath} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> {isAdmin ? 'Shipments' : 'My shipments'}</Link>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-bold sm:text-3xl">{shipment.trackingId}</h1>
          <button type="button" onClick={copy} aria-label="Copy tracking ID" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink"><Copy className="h-4 w-4" /></button>
          <StatusBadge status={shipment.status} className="text-sm" />
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link to={`/track/${shipment.trackingId}`}><ExternalLink /> Public tracking page</Link></Button>
          {isAdmin && CANCELLABLE.includes(shipment.status) && (
            <Button size="sm" onClick={() => setAssignOpen(true)} disabled={shipment.payment.status !== 'paid'} title={shipment.payment.status !== 'paid' ? 'Only paid shipments can be assigned' : undefined}>
              <UserPlus /> {shipment.status === 'ASSIGNED' ? 'Reassign' : 'Assign driver'}
            </Button>
          )}
          {!isAdmin && CANCELLABLE.includes(shipment.status) && (
            <Button variant="outline" size="sm" className="text-status-failed hover:bg-status-failed/10" onClick={() => setCancelOpen(true)}><XCircle /> Cancel</Button>
          )}
        </div>
      </div>

      {shipment.status === 'BOOKED' && ['pending', 'failed'].includes(shipment.payment.status) && (
        <PayBanner shipment={shipment} canPay={!isAdmin} onPaid={(s) => setShipment((prev) => ({ ...prev, ...s }))} />
      )}
      {shipment.deliveryOtp && <OtpBanner otp={shipment.deliveryOtp} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {shipment.status === 'DELIVERED' && (shipment.proofOfDelivery?.photoUrl || shipment.proofOfDelivery?.signatureUrl) && <ProofCard proof={shipment.proofOfDelivery} />}
          <div className="relative h-[340px] overflow-hidden rounded-card border border-border shadow-soft sm:h-[420px]">
            <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
              <ShipmentMap
                pickup={shipment.pickup}
                drop={shipment.drop}
                progress={progressOf(shipment.status)}
                driver={live}
                trail={trail}
                collected={shipment.status !== 'ASSIGNED'}
                className="h-full w-full"
                fit={{ paddingTopLeft: [48, 48], paddingBottomRight: [48, 190] }}
              />
            </Suspense>
            <EtaCard shipment={shipment} live={live} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <StopCard title="Pickup" stop={shipment.pickup} />
            <StopCard title="Drop" stop={shipment.drop} />
          </div>

          <section className="rounded-card border border-border bg-surface p-5 shadow-soft" aria-labelledby="pkg-title">
            <h2 id="pkg-title" className="flex items-center gap-2 font-bold"><Package className="h-4 w-4 text-primary-text" /> Package & price</h2>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <Item k="Type" v={<span className="capitalize">{shipment.package.type}</span>} />
              <Item k="Weight" v={`${shipment.package.weightKg} kg`} />
              <Item k="Dimensions" v={shipment.package.dimensions?.l ? `${shipment.package.dimensions.l}×${shipment.package.dimensions.w}×${shipment.package.dimensions.h} cm` : '—'} />
              <Item k="Speed" v={<span className="capitalize">{shipment.speed}</span>} />
              <Item k="Distance" v={`${shipment.distanceKm} km`} />
              <Item k="Payment" v={<PaymentValue payment={shipment.payment} />} />
            </dl>
            <dl className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
              <Line k="Base fare" v={shipment.price.base} />
              <Line k="Distance charge" v={shipment.price.distanceCharge} />
              <Line k={`Weight charge (${shipment.price.chargeableWeightKg} kg)`} v={shipment.price.weightCharge} />
              {shipment.price.speedCharge > 0 && <Line k="Express" v={shipment.price.speedCharge} />}
              <div className="flex justify-between border-t border-border pt-2 text-base font-bold"><dt>Total</dt><dd className="font-mono">{formatINR(shipment.price.total)}</dd></div>
            </dl>
            {['paid', 'refunded'].includes(shipment.payment.status) && <InvoiceButton shipment={shipment} />}
          </section>
        </div>

        <section className="h-fit rounded-card border border-border bg-surface p-5 shadow-soft lg:sticky lg:top-24" aria-labelledby="tl-title">
          <h2 id="tl-title" className="mb-5 font-bold">Timeline</h2>
          <StatusTimeline history={shipment.statusHistory} status={shipment.status} />
        </section>
      </div>

      {isAdmin && (
        <AssignDialog
          shipment={{ id: shipment.id, trackingId: shipment.trackingId, status: shipment.status, from: shipment.pickup.city, to: shipment.drop.city }}
          open={assignOpen}
          onOpenChange={setAssignOpen}
          onAssigned={load}
        />
      )}
      <CancelDialog open={cancelOpen} onOpenChange={setCancelOpen} shipment={shipment} onCancelled={setShipment} />
    </>
  );
}

/** FR-13: a booking only goes to a driver once it's paid. */
function PayBanner({ shipment, canPay, onPaid }) {
  const payment = usePayment();
  const [error, setError] = useState('');
  const failed = shipment.payment.status === 'failed';
  const pay = async () => {
    setError('');
    const r = await payment.pay(shipment);
    if (r.status === 'paid') {
      onPaid(r.shipment);
      toast.success('Payment received — your booking is confirmed');
    } else if (r.status === 'failed') setError(r.error);
  };
  return (
    <section className="mb-6 flex flex-col gap-4 rounded-card border border-amber-500/40 bg-amber-500/10 p-5 sm:flex-row sm:items-center sm:justify-between" aria-labelledby="pay-heading">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden />
        <div>
          <h2 id="pay-heading" className="font-bold">{failed ? 'Payment didn’t go through' : 'Awaiting payment'}</h2>
          <p className="text-sm text-muted">
            {canPay
              ? `Pay ${formatINR(shipment.price.total)} to confirm — unpaid bookings are cancelled 30 minutes after booking.`
              : 'The customer hasn’t paid yet, so this shipment can’t be assigned.'}
            {failed && shipment.payment.failureReason ? ` Last attempt: ${shipment.payment.failureReason}.` : ''}
          </p>
          {error && <p role="alert" className="mt-1 text-sm font-medium text-status-failed">{error}</p>}
        </div>
      </div>
      {canPay && (
        <Button onClick={pay} disabled={payment.busy} className="shrink-0">
          {payment.busy ? <Loader2 className="animate-spin" /> : <CreditCard />} Pay {formatINR(shipment.price.total)}
        </Button>
      )}
      {payment.ui}
    </section>
  );
}

function PaymentValue({ payment }) {
  const tone = { paid: 'text-status-delivered', refunded: 'text-muted', failed: 'text-status-failed', pending: 'text-amber-700 dark:text-amber-300' }[payment.status] ?? '';
  return (
    <span className={tone}>
      {PAYMENT_LABEL[payment.status] ?? payment.status}
      {payment.method && payment.status === 'paid' && <span className="text-muted"> · {payment.method.toUpperCase() === 'UPI' ? 'UPI' : payment.method}</span>}
    </span>
  );
}

function InvoiceButton({ shipment }) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    const err = await downloadInvoice(shipment);
    setBusy(false);
    if (err) toast.error(err);
  };
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-background p-3 text-sm">
      <span className="text-muted">
        {shipment.payment.status === 'refunded' ? `Refunded ${formatDateTime(shipment.payment.refundedAt)}` : `Paid ${formatDateTime(shipment.payment.paidAt)}`}
        {shipment.payment.paymentId && <span className="block font-mono text-xs">{shipment.payment.paymentId}</span>}
      </span>
      <Button variant="outline" size="sm" onClick={download} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Download />} Invoice (PDF)</Button>
    </div>
  );
}

function OtpBanner({ otp }) {
  return (
    <section className="mb-6 flex flex-col items-start gap-4 rounded-card bg-navy-900 p-5 text-white shadow-lift sm:flex-row sm:items-center sm:justify-between dark:bg-[#0D1526]" aria-labelledby="otp-heading">
      <div>
        <p id="otp-heading" className="font-bold">Your parcel is out for delivery</p>
        <p className="text-sm text-white/70">Share this code with the driver only when you receive the parcel.</p>
      </div>
      <p className="flex gap-2" aria-label={`Delivery code ${otp.split('').join(' ')}`}>
        {otp.split('').map((d, i) => (
          <span key={i} aria-hidden className="grid h-14 w-12 place-items-center rounded-xl bg-white/10 font-mono text-3xl font-bold">{d}</span>
        ))}
      </p>
    </section>
  );
}

function ProofCard({ proof }) {
  return (
    <section className="rounded-card border border-border bg-surface p-5 shadow-soft" aria-labelledby="pod-title">
      <h2 id="pod-title" className="font-bold">Proof of delivery</h2>
      <p className="text-sm text-muted">Delivered {formatDateTime(proof.deliveredAt)} · code verified</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {proof.photoUrl && <img src={proof.photoUrl} alt="Photo taken at delivery" loading="lazy" className="h-48 w-full rounded-xl object-cover" />}
        {proof.signatureUrl && <img src={proof.signatureUrl} alt="Recipient’s signature" loading="lazy" className="h-48 w-full rounded-xl border border-border bg-white object-contain" />}
      </div>
    </section>
  );
}

function EtaCard({ shipment, live }) {
  const hours = useCountdown(shipment.estimatedDeliveryAt);
  const liveMins = useLiveMinutes(live?.eta?.arriveAt);
  const terminal = TERMINAL.includes(shipment.status);
  const driver = shipment.driver;
  return (
    <div className="absolute inset-x-3 bottom-3 z-[500] rounded-2xl border border-border bg-surface/90 p-4 shadow-lift backdrop-blur-xl sm:inset-x-auto sm:left-4 sm:w-80">
      {terminal ? (
        <>
          <p className="text-xs text-muted">{STATUS[shipment.status].label}</p>
          <p className="font-display text-xl font-extrabold">{formatDateTime(shipment.statusHistory.at(-1)?.at)}</p>
        </>
      ) : live ? (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">{live.eta.target === 'pickup' ? 'Driver arriving for pickup in' : 'Arriving in'}</p>
            <LivePill at={live.at} />
          </div>
          <p className="font-display text-2xl font-extrabold" aria-live="polite"><span className="font-mono">{liveMins}</span> min</p>
          <p className="text-xs text-muted">{live.eta.km} km away · by {formatTime(live.eta.arriveAt)}</p>
        </>
      ) : (
        <>
          <p className="text-xs text-muted">Estimated delivery</p>
          <p className="font-display text-xl font-extrabold">{formatEta(shipment.estimatedDeliveryAt)}</p>
          <p className="text-sm text-muted">{hours > 0 ? <>in <span className="font-mono font-semibold text-ink">{formatDuration(hours)}</span></> : 'Arriving soon'}</p>
        </>
      )}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10">
        <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${progressOf(shipment.status) * 100}%` }} />
      </div>
      {driver && !terminal && (
        <div className="mt-3 flex items-center gap-3 border-t border-border pt-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy-900 text-xs font-bold text-white">{initials(driver.name)}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{driver.name}</p>
            <p className="flex items-center gap-1 text-xs text-muted"><Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden /> {driver.rating?.toFixed(1)} · <span className="capitalize">{driver.vehicle?.type}</span> · {driver.vehicle?.number}</p>
          </div>
          {driver.phone && (
            <a href={`tel:${driver.phone.replace(/[^\d+]/g, '')}`} aria-label={`Call ${driver.name}`} className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary-text hover:bg-primary/20"><Phone className="h-4 w-4" /></a>
          )}
        </div>
      )}
    </div>
  );
}

/** Minutes until `arriveAt`, ticking every 15 s between GPS updates. */
function useLiveMinutes(arriveAt) {
  const calc = () => (arriveAt ? Math.max(1, Math.ceil((new Date(arriveAt) - Date.now()) / 60_000)) : null);
  const [m, setM] = useState(calc);
  useEffect(() => {
    setM(calc());
    const t = setInterval(() => setM(calc()), 15_000);
    return () => clearInterval(t);
  }, [arriveAt]); // eslint-disable-line react-hooks/exhaustive-deps
  return m;
}

/** "Live" while fixes are fresh; otherwise how long ago the driver was last seen. */
function LivePill({ at }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, []);
  const ago = Math.round((Date.now() - new Date(at)) / 1000);
  if (ago < 30) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-status-delivered/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-status-delivered">
        <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping2 rounded-full bg-status-delivered" /><span className="relative h-1.5 w-1.5 rounded-full bg-status-delivered" /></span> Live
      </span>
    );
  }
  return <span className="text-[11px] text-muted">Updated {ago < 120 ? `${ago}s` : `${Math.round(ago / 60)} min`} ago</span>;
}

function StopCard({ title, stop }) {
  return (
    <section className="rounded-card border border-border bg-surface p-5 shadow-soft">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted"><MapPin className="h-3.5 w-3.5" /> {title}</h2>
      <p className="mt-2 font-semibold">{stop.city}</p>
      <p className="mt-0.5 line-clamp-3 text-sm text-muted">{stop.address}</p>
      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"><Phone className="h-3.5 w-3.5 text-muted" /> <span>{stop.contactName}</span> <a href={`tel:${stop.contactPhone.replace(/\s/g, '')}`} className="text-primary-text hover:underline">{stop.contactPhone}</a></p>
    </section>
  );
}

const Item = ({ k, v }) => <div><dt className="text-xs text-muted">{k}</dt><dd className="mt-0.5 font-medium">{v}</dd></div>;
const Line = ({ k, v }) => <div className="flex justify-between"><dt className="text-muted">{k}</dt><dd className="font-mono">{formatINR(v)}</dd></div>;

function CancelDialog({ open, onOpenChange, shipment, onCancelled }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const confirm = async () => {
    setLoading(true);
    try {
      const { data } = await api.patch(`/shipments/${shipment.id}/cancel`, { reason: reason.trim() || undefined });
      onCancelled(data.shipment);
      onOpenChange(false);
      toast.success('Shipment cancelled');
    } catch (err) {
      toast.error(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Cancel {shipment.trackingId}?</DialogTitle>
        <DialogDescription>The pickup will be called off. Any payment is refunded to the original method.</DialogDescription>
        <label htmlFor="cancel-reason" className="mt-5 block text-sm font-medium">Reason (optional)</label>
        <textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} rows={3}
          className="mt-1.5 w-full rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-sm placeholder:text-muted" placeholder="e.g. Booked the wrong address" />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Keep shipment</Button>
          <Button onClick={confirm} disabled={loading} className="bg-status-failed text-white shadow-none hover:brightness-110">
            {loading && <Loader2 className="animate-spin" />} Cancel shipment
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading shipment">
      <Skeleton className="mb-6 h-9 w-72" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6"><Skeleton className="h-[420px]" /><Skeleton className="h-40" /></div>
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}
