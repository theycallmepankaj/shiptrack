import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, CheckCircle2, ImagePlus, Loader2, PenLine, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, parseApiError } from '@/api/client';
import { OtpInput } from '@/components/driver/OtpInput';
import { SignaturePad } from '@/components/driver/SignaturePad';
import { FormAlert } from '@/components/auth/FormField';
import { Button } from '@/components/ui/button';
import { getPosition } from '@/lib/geo';
import { resizeImage } from '@/lib/image';
import { cn } from '@/lib/utils';

/** FR-28 proof of delivery: customer's 4-digit code + a photo and/or signature. */
export default function Deliver() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [trackingId, setTrackingId] = useState('');
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [tab, setTab] = useState('photo');
  const [photo, setPhoto] = useState(null); // { blob, url }
  const [signed, setSigned] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const sigRef = useRef(null);

  useEffect(() => {
    api.get(`/shipments/${id}`).then(({ data }) => {
      if (data.shipment.status !== 'OUT_FOR_DELIVERY') navigate(`/driver/shipments/${id}`, { replace: true });
      setTrackingId(data.shipment.trackingId);
    }).catch(() => navigate('/driver', { replace: true }));
  }, [id, navigate]);

  useEffect(() => () => photo && URL.revokeObjectURL(photo.url), [photo]);

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const blob = await resizeImage(file);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
      setError('');
    } catch {
      toast.error('That image couldn’t be read — try another photo');
    }
  };

  const submit = async () => {
    setError('');
    setOtpError('');
    if (otp.length !== 4) return setOtpError('Enter the 4-digit code from the customer');
    if (!photo && !signed) return setError('Add a photo of the parcel or the recipient’s signature');
    setSubmitting(true);
    try {
      const form = new FormData();
      form.set('otp', otp);
      if (photo) form.set('photo', photo.blob, photo.blob.type === 'image/webp' ? 'proof.webp' : 'proof.jpg');
      if (signed) form.set('signature', await sigRef.current.toBlob(), 'signature.png');
      const pos = await getPosition({ timeout: 3000 });
      if (pos) { form.set('lat', pos.lat); form.set('lng', pos.lng); }
      await api.post(`/driver/shipments/${id}/deliver`, form);
      setDone(true);
      setTimeout(() => navigate('/driver', { replace: true }), 1800);
    } catch (e) {
      const { message, fields } = parseApiError(e);
      if (fields.otp || /code/i.test(message)) { setOtpError(message); setOtp(''); } else setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-center">
        <div>
          <CheckCircle2 className="mx-auto h-20 w-20 text-status-delivered" aria-hidden />
          <h1 className="mt-4 text-2xl font-extrabold">Delivered!</h1>
          <p className="mt-1 text-muted">Nice work. Heading back to your route…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <Link to={`/driver/shipments/${id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Back</Link>
      <h1 className="text-2xl font-extrabold">Proof of delivery</h1>
      <p className="mt-1 text-muted">{trackingId && <span className="font-mono">{trackingId}</span>}</p>

      <section className="mt-8 text-center" aria-labelledby="otp-title">
        <h2 id="otp-title" className="font-bold">Ask the customer for their code</h2>
        <p className="mb-4 mt-1 text-sm text-muted">It’s in their ShipTrack app and email.</p>
        <OtpInput value={otp} onChange={(v) => { setOtp(v); setOtpError(''); }} error={otpError} autoFocus />
        {otpError && <p role="alert" className="mt-3 text-sm font-medium text-status-failed">{otpError}</p>}
      </section>

      <section className="mt-10" aria-label="Photo or signature">
        <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface p-1">
          {[['photo', 'Photo', Camera, !!photo], ['signature', 'Signature', PenLine, signed]].map(([key, label, Icon, has]) => (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
              className={cn('flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold', tab === key ? 'bg-ink text-background' : 'text-muted')}>
              <Icon className="h-4 w-4" /> {label} {has && <CheckCircle2 className="h-4 w-4 text-status-delivered" aria-label="added" />}
            </button>
          ))}
        </div>

        <div className="mt-4" hidden={tab !== 'photo'}>
          {photo ? (
            <div className="relative">
              <img src={photo.url} alt="Parcel at delivery" className="max-h-80 w-full rounded-2xl object-cover" />
              <button type="button" onClick={() => setPhoto(null)} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white" aria-label="Remove photo"><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <label className="flex h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-surface text-muted transition-colors hover:border-primary hover:text-ink has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary">
              <ImagePlus className="h-8 w-8" aria-hidden />
              <span className="font-semibold">Take a photo of the parcel</span>
              <span className="text-xs">At the door or with the recipient</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={onPhoto} className="sr-only" />
            </label>
          )}
        </div>
        <div className="mt-4" hidden={tab !== 'signature'}>
          <SignaturePad ref={sigRef} onChange={setSigned} />
        </div>
      </section>

      <div className="mt-6"><FormAlert>{error}</FormAlert></div>
      <Button size="lg" className="mt-4 h-16 w-full rounded-2xl text-base" onClick={submit} disabled={submitting}>
        {submitting ? <Loader2 className="animate-spin" /> : <CheckCircle2 className="!h-5 !w-5" />} Confirm delivery
      </Button>
    </div>
  );
}
