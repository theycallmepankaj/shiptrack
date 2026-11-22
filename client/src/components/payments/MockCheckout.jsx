import { useRef, useState } from 'react';
import { CreditCard, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { formatINR } from '@/lib/utils';

/** Development stand-in for Razorpay's window: same order/verify flow, no real money. */
export function MockCheckout({ order, onPay, onFail, onClose }) {
  const [method, setMethod] = useState('upi');
  const [working, setWorking] = useState(null);
  const closing = useRef(false);
  const run = async (kind, fn) => {
    setWorking(kind);
    closing.current = true;
    await fn();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !closing.current && onClose()}>
      <DialogContent className="max-w-sm">
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-800 dark:text-amber-200">
          Test mode — no real money moves
        </div>
        <DialogTitle>Pay {formatINR(order.amount)}</DialogTitle>
        <DialogDescription>Shipment {order.trackingId} · order <span className="font-mono">{order.orderId.slice(0, 20)}…</span></DialogDescription>
        <fieldset className="mt-5">
          <legend className="text-sm font-medium">Payment method</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[['upi', 'UPI'], ['card', 'Card'], ['netbanking', 'Net banking']].map(([id, label]) => (
              <label key={id} className={`cursor-pointer rounded-xl border px-2 py-2.5 text-center text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary ${method === id ? 'border-primary bg-primary/10' : 'border-border hover:bg-ink/5'}`}>
                <input type="radio" name="method" value={id} checked={method === id} onChange={() => setMethod(id)} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <Button className="mt-6 w-full" size="lg" disabled={!!working} onClick={() => run('pay', () => onPay(method))}>
          {working === 'pay' ? <Loader2 className="animate-spin" /> : <CreditCard />} Pay {formatINR(order.amount)}
        </Button>
        <Button variant="ghost" className="mt-2 w-full text-muted" disabled={!!working} onClick={() => run('fail', onFail)}>
          {working === 'fail' ? <Loader2 className="animate-spin" /> : <XCircle />} Simulate a declined payment
        </Button>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted"><ShieldCheck className="h-3.5 w-3.5" /> Add Razorpay test keys to use the real checkout</p>
      </DialogContent>
    </Dialog>
  );
}
