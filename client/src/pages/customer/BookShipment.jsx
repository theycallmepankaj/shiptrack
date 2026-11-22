import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Clock3, Copy, CreditCard, Download, FileText, Loader2, MapPinned, Package, PackageCheck, Wine, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { api, parseApiError } from '@/api/client';
import { FormAlert, FormField } from '@/components/auth/FormField';
import { AddressSearch } from '@/components/booking/AddressSearch';
import { QuotePanel } from '@/components/booking/QuotePanel';
import { Button } from '@/components/ui/button';
import { usePayment } from '@/components/payments/usePayment';
import { downloadInvoice } from '@/lib/invoice';
import { useAuth } from '@/context/AuthContext';
import { useQuote } from '@/hooks/useQuote';
import { formatEta } from '@/lib/format';
import { cn, formatINR } from '@/lib/utils';
import { PageHeader } from '../shared/PageHeader';

const STEPS = ['Addresses', 'Package', 'Speed', 'Review & pay'];
const TYPES = [
  { id: 'document', label: 'Document', icon: FileText, text: 'Papers, envelopes' },
  { id: 'parcel', label: 'Parcel', icon: Package, text: 'Boxes and packets' },
  { id: 'fragile', label: 'Fragile', icon: Wine, text: 'Handle with care' },
];
const PHONE_RE = /^\+?[0-9\s-]{7,16}$/;

export default function BookShipment() {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [pickup, setPickup] = useState({ place: null, contactName: user.name, contactPhone: user.phone ?? '' });
  const [drop, setDrop] = useState({ place: null, contactName: '', contactPhone: '' });
  const [pkg, setPkg] = useState({ type: 'parcel', weightKg: '1', l: '', w: '', h: '', description: '' });
  const [speed, setSpeed] = useState('standard');
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [booked, setBooked] = useState(null); // paid → success screen
  const [unpaid, setUnpaid] = useState(null); // booked but not paid yet: retry pays this one, no duplicate booking
  const payment = usePayment();

  const weightKg = Number(pkg.weightKg);
  const dimensions = useMemo(() => {
    const d = { l: Number(pkg.l), w: Number(pkg.w), h: Number(pkg.h) };
    return d.l > 0 && d.w > 0 && d.h > 0 ? d : undefined;
  }, [pkg.l, pkg.w, pkg.h]);
  const quote = useQuote({ pickup: pickup.place, drop: drop.place, weightKg, dimensions });

  const validate = (s) => {
    const e = {};
    if (s === 0) {
      if (!pickup.place) e.pickup = 'Choose a pickup address';
      if (!drop.place) e.drop = 'Choose a drop address';
      if (pickup.contactName.trim().length < 2) e.pickupName = 'Enter a contact name';
      if (!PHONE_RE.test(pickup.contactPhone.trim())) e.pickupPhone = 'Enter a valid phone number';
      if (drop.contactName.trim().length < 2) e.dropName = 'Enter the recipient’s name';
      if (!PHONE_RE.test(drop.contactPhone.trim())) e.dropPhone = 'Enter a valid phone number';
    }
    if (s === 1) {
      if (!(weightKg >= 0.1 && weightKg <= 50)) e.weight = 'Between 0.1 and 50 kg';
      const dims = [pkg.l, pkg.w, pkg.h].filter((v) => v !== '');
      if (dims.length && (dims.length < 3 || dims.some((v) => !(Number(v) > 0 && Number(v) <= 150)))) e.dims = 'Enter all three sides, up to 150 cm each';
    }
    if (s === 2 && !quote.data) e.speed = quote.error || 'Waiting for a quote…';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // Once errors are showing, re-check as the user edits so fixed fields clear immediately.
  const hasErrors = Object.keys(errors).length > 0;
  useEffect(() => {
    if (hasErrors) validate(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup, drop, pkg, quote.data]);

  const go = (to) => {
    if (to > step && !validate(step)) return;
    // Editing after an unpaid attempt starts a fresh booking (the unpaid one expires on its own).
    if (to < 3 && unpaid) {
      setUnpaid(null);
      setSubmitError('');
    }
    setDir(to > step ? 1 : -1);
    setStep(to);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // FR-13: "Review & pay" books the shipment (price fixed by the server), then opens checkout.
  const submit = async () => {
    setSubmitting(true);
    setSubmitError('');
    const stop = (s) => ({ address: s.place.label, city: s.place.city, lat: s.place.lat, lng: s.place.lng, contactName: s.contactName.trim(), contactPhone: s.contactPhone.trim() });
    try {
      let shipment = unpaid;
      if (!shipment) {
        const { data } = await api.post('/shipments', {
          pickup: stop(pickup),
          drop: stop(drop),
          package: { type: pkg.type, weightKg, ...(dimensions && { dimensions }), ...(pkg.description.trim() && { description: pkg.description.trim() }) },
          speed,
        });
        shipment = data.shipment;
        setUnpaid(shipment);
      }
      const result = await payment.pay(shipment);
      if (result.status === 'paid') {
        setBooked(result.shipment);
        toast.success('Payment received — shipment booked!');
      } else {
        setSubmitError(
          `${result.status === 'dismissed' ? 'Payment not completed.' : result.error} Your booking ${shipment.trackingId} is saved — pay within 30 minutes to confirm it.`,
        );
      }
    } catch (err) {
      setSubmitError(parseApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (booked) return <BookingSuccess shipment={booked} />;

  const option = quote.data?.options?.[speed];
  return (
    <>
      <PageHeader title="Book a shipment" subtitle="Get an instant quote, then confirm in a few taps." />
      <Progress step={step} onStep={(i) => i < step && go(i)} />

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 overflow-x-clip">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.section
              key={step}
              custom={dir}
              initial={{ opacity: 0, x: dir * 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -24 }}
              transition={{ duration: 0.22 }}
              className="rounded-card border border-border bg-surface p-5 shadow-soft sm:p-7"
              aria-labelledby="step-title"
            >
              <h2 id="step-title" className="text-lg font-bold">{STEPS[step]}</h2>

              {step === 0 && (
                <div className="mt-6 space-y-8">
                  <fieldset className="space-y-4">
                    <legend className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted"><span className="h-2.5 w-2.5 rounded-full border-2 border-ink" /> Pickup</legend>
                    <AddressSearch label="Pickup address" value={pickup.place} onChange={(place) => setPickup((p) => ({ ...p, place }))} error={errors.pickup} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField label="Contact name" value={pickup.contactName} onChange={(e) => setPickup((p) => ({ ...p, contactName: e.target.value }))} error={errors.pickupName} autoComplete="name" />
                      <FormField label="Contact phone" type="tel" value={pickup.contactPhone} onChange={(e) => setPickup((p) => ({ ...p, contactPhone: e.target.value }))} error={errors.pickupPhone} autoComplete="tel" />
                    </div>
                  </fieldset>
                  <fieldset className="space-y-4">
                    <legend className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted"><MapPinned className="h-3.5 w-3.5 text-primary" /> Drop</legend>
                    <AddressSearch label="Drop address" value={drop.place} onChange={(place) => setDrop((d) => ({ ...d, place }))} error={errors.drop} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField label="Recipient name" value={drop.contactName} onChange={(e) => setDrop((d) => ({ ...d, contactName: e.target.value }))} error={errors.dropName} />
                      <FormField label="Recipient phone" type="tel" value={drop.contactPhone} onChange={(e) => setDrop((d) => ({ ...d, contactPhone: e.target.value }))} error={errors.dropPhone} placeholder="+91 98765 43210" />
                    </div>
                  </fieldset>
                </div>
              )}

              {step === 1 && (
                <div className="mt-6 space-y-6">
                  <fieldset>
                    <legend className="text-sm font-medium">Package type</legend>
                    <div className="mt-2 grid gap-3 sm:grid-cols-3">
                      {TYPES.map((t) => (
                        <OptionCard key={t.id} name="type" checked={pkg.type === t.id} onChange={() => setPkg((p) => ({ ...p, type: t.id }))}>
                          <t.icon className="h-5 w-5 text-primary-text" aria-hidden />
                          <span className="mt-3 block font-semibold">{t.label}</span>
                          <span className="block text-xs text-muted">{t.text}</span>
                        </OptionCard>
                      ))}
                    </div>
                  </fieldset>
                  <FormField label="Weight (kg)" type="number" inputMode="decimal" min="0.1" max="50" step="0.1" value={pkg.weightKg} onChange={(e) => setPkg((p) => ({ ...p, weightKg: e.target.value }))} error={errors.weight} className="max-w-[200px]" />
                  <div>
                    <p className="text-sm font-medium">Dimensions (cm) <span className="font-normal text-muted">— optional</span></p>
                    <div className="mt-1.5 grid max-w-md grid-cols-3 gap-3">
                      {[['l', 'Length'], ['w', 'Width'], ['h', 'Height']].map(([k, label]) => (
                        <FormField key={k} label={label} type="number" inputMode="numeric" min="1" max="150" value={pkg[k]} onChange={(e) => setPkg((p) => ({ ...p, [k]: e.target.value }))} className="[&_label]:text-xs [&_label]:text-muted" />
                      ))}
                    </div>
                    {errors.dims ? <p role="alert" className="mt-1.5 text-xs font-medium text-status-failed">{errors.dims}</p> : <p className="mt-1.5 text-xs text-muted">Large, light boxes are charged by volume (L×W×H ÷ 5000).</p>}
                  </div>
                  <FormField label="What’s inside? (optional)" maxLength={200} value={pkg.description} onChange={(e) => setPkg((p) => ({ ...p, description: e.target.value }))} placeholder="e.g. Books, 2 shirts" />
                </div>
              )}

              {step === 2 && (
                <fieldset className="mt-6">
                  <legend className="sr-only">Delivery speed</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      { id: 'standard', label: 'Standard', icon: Clock3, text: 'Reliable, best value' },
                      { id: 'express', label: 'Express', icon: Zap, text: 'Priority handling, fastest driver' },
                    ].map((o) => {
                      const q = quote.data?.options?.[o.id];
                      return (
                        <OptionCard key={o.id} name="speed" checked={speed === o.id} onChange={() => setSpeed(o.id)}>
                          <span className="flex items-center justify-between">
                            <o.icon className="h-5 w-5 text-primary-text" aria-hidden />
                            <span className="font-mono text-lg font-bold">{q ? formatINR(q.price.total) : '—'}</span>
                          </span>
                          <span className="mt-3 block font-semibold">{o.label}</span>
                          <span className="block text-xs text-muted">{o.text}</span>
                          <span className="mt-3 block text-sm">Arrives <span className="font-semibold">{q ? formatEta(q.estimatedDeliveryAt) : '…'}</span></span>
                        </OptionCard>
                      );
                    })}
                  </div>
                  {errors.speed && <p role="alert" className="mt-3 text-sm text-status-failed">{errors.speed}</p>}
                  <p className="mt-4 text-xs text-muted">Delivery times are predicted from distance, weight and time of day.</p>
                </fieldset>
              )}

              {step === 3 && (
                <div className="mt-6 space-y-5">
                  <FormAlert>{submitError}</FormAlert>
                  <Summary title="Pickup" onEdit={() => go(0)} lines={[pickup.place.label, `${pickup.contactName} · ${pickup.contactPhone}`]} />
                  <Summary title="Drop" onEdit={() => go(0)} lines={[drop.place.label, `${drop.contactName} · ${drop.contactPhone}`]} />
                  <Summary title="Package" onEdit={() => go(1)} lines={[`${TYPES.find((t) => t.id === pkg.type).label} · ${weightKg} kg${dimensions ? ` · ${dimensions.l}×${dimensions.w}×${dimensions.h} cm` : ''}`, pkg.description].filter(Boolean)} />
                  <Summary title="Speed" onEdit={() => go(2)} lines={[`${speed === 'express' ? 'Express' : 'Standard'} · arrives ${option ? formatEta(option.estimatedDeliveryAt) : '—'}`]} />
                  <div className="flex items-center justify-between rounded-xl bg-background p-4">
                    <span className="font-semibold">Total</span>
                    <span className="font-mono text-2xl font-bold">{option ? formatINR(option.price.total) : '—'}</span>
                  </div>
                  <p className="text-xs text-muted">Secure payment by Razorpay (test mode). Your booking is confirmed — and handed to a driver — once it’s paid. Prices include all taxes.</p>
                </div>
              )}
            </motion.section>
          </AnimatePresence>

          <div className="mt-5 flex items-center justify-between gap-3">
            <Button variant="outline" onClick={() => go(step - 1)} disabled={step === 0} className={cn(step === 0 && 'invisible')}>
              <ArrowLeft /> Back
            </Button>
            {step < 3 ? (
              <Button onClick={() => go(step + 1)}>Continue <ArrowRight /></Button>
            ) : (
              <Button size="lg" onClick={submit} disabled={submitting || !option}>
                {submitting ? <Loader2 className="animate-spin" /> : <CreditCard />} {unpaid ? 'Try payment again' : 'Pay'}{option ? ` · ${formatINR(unpaid?.price.total ?? option.price.total)}` : ''}
              </Button>
            )}
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start" aria-label="Quote">
          <QuotePanel pickup={pickup.place} drop={drop.place} quote={quote} speed={speed} />
        </aside>
      </div>
      {payment.ui}
    </>
  );
}

function Progress({ step, onStep }) {
  return (
    <nav aria-label="Booking progress">
      <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
        <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }} transition={{ duration: 0.35 }} />
      </div>
      <ol className="mt-3 grid grid-cols-4 gap-2 text-xs sm:text-sm">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => onStep(i)}
              disabled={i >= step}
              aria-current={i === step ? 'step' : undefined}
              className={cn('flex items-center gap-1.5 font-medium disabled:cursor-default', i <= step ? 'text-ink' : 'text-muted')}
            >
              <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold', i < step ? 'bg-primary text-primary-foreground' : i === step ? 'bg-ink text-background' : 'bg-ink/10')}>
                {i < step ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className="hidden truncate sm:inline">{label}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function OptionCard({ name, checked, onChange, children }) {
  return (
    <label
      className={cn(
        'block cursor-pointer rounded-xl border-2 p-4 transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary hover:-translate-y-0.5',
        checked ? 'border-primary bg-primary/5' : 'border-border bg-surface hover:border-ink/20',
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      {children}
    </label>
  );
}

function Summary({ title, lines, onEdit }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</p>
        {lines.map((l, i) => <p key={i} className={cn('mt-1 text-sm', i > 0 && 'text-muted')}>{l}</p>)}
      </div>
      <button type="button" onClick={onEdit} className="text-sm font-semibold text-primary-text hover:underline">Edit</button>
    </div>
  );
}

function BookingSuccess({ shipment }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shipment.trackingId);
      toast.success('Tracking ID copied');
    } catch {
      toast.error('Couldn’t copy — select it manually');
    }
  };
  return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="mx-auto max-w-lg py-10 text-center">
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }} className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-status-delivered/15 text-status-delivered">
        <PackageCheck className="h-10 w-10" aria-hidden />
      </motion.div>
      <h1 className="mt-6 text-3xl font-extrabold">Paid & booked!</h1>
      <p className="mt-2 text-muted">We’ve emailed your confirmation with the invoice. Share this tracking ID with the recipient.</p>
      <div className="mx-auto mt-6 flex w-fit items-center gap-3 rounded-2xl border border-border bg-surface px-5 py-4 shadow-soft">
        <span className="font-mono text-2xl font-bold tracking-wider">{shipment.trackingId}</span>
        <button type="button" onClick={copy} className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink" aria-label="Copy tracking ID"><Copy className="h-4 w-4" /></button>
      </div>
      <p className="mt-4 text-sm text-muted">Estimated delivery: <span className="font-semibold text-ink">{formatEta(shipment.estimatedDeliveryAt)}</span></p>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <Button asChild><Link to={`/app/shipments/${shipment.id}`}>View shipment <ArrowRight /></Link></Button>
        <Button variant="outline" onClick={async () => { const e = await downloadInvoice(shipment); if (e) toast.error(e); }}><Download /> Invoice (PDF)</Button>
      </div>
      <Link to="/app/shipments" className="mt-4 inline-block text-sm text-muted underline-offset-4 hover:text-ink hover:underline">All shipments</Link>
    </motion.div>
  );
}
