import { useEffect, useMemo, useState } from 'react';
import { api } from '@/api/client';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, ArrowUpDown, Clock3, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Reveal } from '@/components/Reveal';
import { CITIES, DEFAULT_RULE, quote } from '@/lib/pricing';
import { cn, formatINR } from '@/lib/utils';

const selectCls =
  'h-11 w-full appearance-none rounded-[10px] border border-border bg-surface px-3.5 text-sm text-ink focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-0';

function formatEta(hours) {
  if (hours < 12) return 'Same day';
  const days = Math.max(1, Math.round(hours / 24));
  return `${days}–${days + 1} days`;
}

export function PriceCalculator() {
  const [from, setFrom] = useState('Mumbai');
  const [to, setTo] = useState('Pune');
  const [weight, setWeight] = useState(2);
  const [speed, setSpeed] = useState('standard');
  const [rule, setRule] = useState(DEFAULT_RULE);

  // Use the admin-configured rates when the API is reachable; defaults otherwise.
  useEffect(() => {
    api.get('/pricing').then(({ data }) => setRule(data)).catch(() => {});
  }, []);

  const q = useMemo(() => {
    const a = CITIES.find((c) => c.name === from);
    const b = CITIES.find((c) => c.name === to);
    return quote({ from: a, to: b, weightKg: Number(weight) || 0.5, speed }, rule);
  }, [from, to, weight, speed, rule]);

  return (
    <section id="pricing" className="section scroll-mt-24 bg-surface" aria-labelledby="pricing-title">
      <div className="container grid items-center gap-12 lg:grid-cols-2">
        <Reveal>
          <span className="eyebrow">Instant quote</span>
          <h2 id="pricing-title" className="section-title mt-4">Transparent pricing. No surprises at checkout.</h2>
          <p className="mt-4 max-w-lg text-muted">
            One simple formula: a base fare, plus distance and weight. Express is {rule.expressMultiplier}× for priority handling and the fastest driver.
          </p>
          <dl className="mt-8 grid max-w-md grid-cols-3 gap-3 text-center">
            {[
              ['Base fare', formatINR(rule.baseFare)],
              ['Per km', `₹${rule.perKm}`],
              ['Per kg', formatINR(rule.perKg)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-card border border-border bg-background px-3 py-4">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="mt-1 font-mono text-lg font-bold">{v}</dd>
              </div>
            ))}
          </dl>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="rounded-[24px] border border-border bg-background p-5 shadow-lift sm:p-7">
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="calc-from">From</Label>
                <select id="calc-from" value={from} onChange={(e) => setFrom(e.target.value)} className={selectCls}>
                  {CITIES.map((c) => <option key={c.name}>{c.name}</option>)}
                </select>
              </div>
              <button
                type="button"
                aria-label="Swap origin and destination"
                onClick={() => { setFrom(to); setTo(from); }}
                className="mb-0.5 grid h-10 w-10 place-items-center rounded-full border border-border bg-surface transition-transform hover:rotate-180"
              >
                <ArrowUpDown className="h-4 w-4 rotate-90" />
              </button>
              <div className="space-y-1.5">
                <Label htmlFor="calc-to">To</Label>
                <select id="calc-to" value={to} onChange={(e) => setTo(e.target.value)} className={selectCls}>
                  {CITIES.map((c) => <option key={c.name}>{c.name}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="calc-weight">Weight</Label>
                <span className="font-mono text-sm font-semibold">{weight} kg</span>
              </div>
              <input
                id="calc-weight"
                type="range"
                min={0.5}
                max={30}
                step={0.5}
                value={weight}
                onChange={(e) => setWeight(Number(e.target.value))}
                className="w-full accent-[rgb(var(--primary))]"
              />
            </div>

            <fieldset className="mt-5">
              <legend className="text-xs font-medium text-muted">Speed</legend>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {[
                  { id: 'standard', label: 'Standard', icon: Clock3 },
                  { id: 'express', label: 'Express', icon: Zap },
                ].map((o) => (
                  <label
                    key={o.id}
                    className={cn(
                      'flex cursor-pointer items-center justify-center gap-2 rounded-[10px] border px-3 py-2.5 text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary',
                      speed === o.id ? 'border-primary bg-primary/10 text-ink' : 'border-border bg-surface text-muted hover:text-ink',
                    )}
                  >
                    <input type="radio" name="speed" value={o.id} checked={speed === o.id} onChange={() => setSpeed(o.id)} className="sr-only" />
                    <o.icon className="h-4 w-4" aria-hidden /> {o.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="mt-6 rounded-2xl bg-navy-900 p-5 text-white dark:bg-[#0D1526]">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-white/60">Estimated price</p>
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.p
                      key={q.total}
                      initial={{ y: 12, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -12, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="font-mono text-4xl font-bold"
                      aria-live="polite"
                    >
                      {formatINR(q.total)}
                    </motion.p>
                  </AnimatePresence>
                </div>
                <div className="text-right text-sm">
                  <p className="text-white/60">Delivery</p>
                  <p className="font-semibold">{from === to ? 'Same day' : formatEta(q.etaHours)}</p>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-4 text-xs">
                <div><dt className="text-white/55">Distance</dt><dd className="mt-0.5 font-mono font-semibold">{q.distanceKm} km</dd></div>
                <div><dt className="text-white/55">Distance fee</dt><dd className="mt-0.5 font-mono font-semibold">{formatINR(q.distanceCharge)}</dd></div>
                <div><dt className="text-white/55">Weight fee</dt><dd className="mt-0.5 font-mono font-semibold">{formatINR(q.weightCharge)}</dd></div>
              </dl>
            </div>

            <Button asChild size="lg" className="mt-5 w-full">
              <Link to="/register">Book this shipment <ArrowRight /></Link>
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
