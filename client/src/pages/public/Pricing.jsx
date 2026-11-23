import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Box, Check, Clock3, MapPin, Scale, Zap } from 'lucide-react';
import { api } from '@/api/client';
import { Footer } from '@/components/Footer';
import { Navbar } from '@/components/Navbar';
import { Reveal } from '@/components/Reveal';
import { PriceCalculator } from '@/components/landing/PriceCalculator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { DEFAULT_RULE, priceFor } from '@/lib/pricing';
import { formatINR } from '@/lib/utils';

const EXAMPLES = [
  { label: 'Documents across town', km: 8, kg: 0.5 },
  { label: 'Shoebox parcel, same city', km: 15, kg: 2 },
  { label: 'Laptop box, other side of the city', km: 30, kg: 4 },
  { label: 'Mumbai → Pune', km: 190, kg: 3 },
  { label: 'Bengaluru → Hyderabad', km: 740, kg: 5 },
];

const INCLUDED = ['Live tracking on the map', 'Delivery code (OTP) at handover', 'Photo or signature proof of delivery', 'Email and in-app updates', 'Taxes — the price you see is the price you pay', 'Free cancellation before pickup'];

const FAQ = [
  ['Why does my box cost more than its weight suggests?', 'Light but bulky parcels are charged by volumetric weight: length × width × height in cm, divided by 5000. We charge whichever is higher, actual or volumetric, with a 0.5 kg minimum.'],
  ['When is express worth it?', 'Express goes to the fastest available driver with priority handling — usually within a few hours in the same city, next day between cities. Standard is same or next day in the city, 1–2 days between cities.'],
  ['Are there extra charges for Sundays or fuel?', 'No. Drivers deliver every day from 9 AM to 9 PM IST at the same rates.'],
  ['What if I cancel?', 'Cancel any time before pickup for a full refund to your original payment method, usually within 5–7 working days.'],
  ['Where do you deliver?', 'Bengaluru, Mumbai, Delhi, Pune and Hyderabad — within each city and between any two of them.'],
];

/** Public pricing page (§10): the live rate card, the formula, examples and a calculator. */
export default function Pricing() {
  const [rule, setRule] = useState(DEFAULT_RULE);
  useEffect(() => {
    api.get('/pricing').then(({ data }) => setRule(data)).catch(() => {});
  }, []);
  const expressPct = Math.round((rule.expressMultiplier - 1) * 100);

  return (
    <>
      <Navbar />
      <main id="main" className="pt-28">
        <section className="container text-center" aria-labelledby="pricing-heading">
          <span className="eyebrow">Pricing</span>
          <h1 id="pricing-heading" className="section-title mx-auto mt-4 max-w-3xl">Simple, honest pricing for every parcel</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">A base fare, plus distance and weight. Taxes included, no surge, no hidden fees — you see the full breakdown before you pay.</p>
        </section>

        {/* Rate card */}
        <section className="container mt-12" aria-label="Current rates">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [Box, 'Base fare', formatINR(rule.baseFare), 'per parcel'],
              [MapPin, 'Distance', `₹${rule.perKm}`, 'per km of road distance'],
              [Scale, 'Weight', formatINR(rule.perKg), 'per chargeable kg'],
              [Zap, 'Express', `${rule.expressMultiplier}×`, `+${expressPct}% for priority delivery`],
            ].map(([Icon, k, v, note]) => (
              <Reveal key={k} className="rounded-card border border-border bg-surface p-6 text-left shadow-soft">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary-text"><Icon className="h-5 w-5" aria-hidden /></span>
                <p className="mt-4 text-sm text-muted">{k}</p>
                <p className="mt-1 font-mono text-3xl font-bold">{v}</p>
                <p className="mt-1 text-xs text-muted">{note}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Standard vs express */}
        <section className="container mt-16 grid grid-cols-1 gap-6 lg:grid-cols-2" aria-label="Delivery speeds">
          {[
            { name: 'Standard', icon: Clock3, price: '1×', points: ['Same or next day within a city', '1–2 days between cities', 'Best value for everyday parcels'] },
            { name: 'Express', icon: Zap, price: `${rule.expressMultiplier}×`, points: ['Usually within hours in the same city', 'Next day between cities', 'Fastest available driver, priority handling'], featured: true },
          ].map((p) => (
            <Reveal key={p.name} className={`rounded-card border p-7 shadow-soft ${p.featured ? 'border-primary/40 bg-navy-900 text-white' : 'border-border bg-surface'}`}>
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-xl font-bold"><p.icon className="h-5 w-5 text-primary" aria-hidden /> {p.name}</h2>
                <span className="font-mono text-2xl font-bold">{p.price}</span>
              </div>
              <ul className="mt-5 space-y-2.5">
                {p.points.map((t) => (
                  <li key={t} className={`flex items-start gap-2 text-sm ${p.featured ? 'text-white/85' : 'text-muted'}`}><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /> {t}</li>
                ))}
              </ul>
            </Reveal>
          ))}
        </section>

        {/* Examples */}
        <section className="container mt-16" aria-labelledby="examples-heading">
          <h2 id="examples-heading" className="text-2xl font-extrabold">What typical parcels cost</h2>
          <p className="mt-1 text-sm text-muted">With today’s rates. Your exact price depends on the addresses and is shown before you pay.</p>
          <div className="relative mt-5 overflow-x-auto rounded-card border border-border bg-surface shadow-soft">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-border">
                  <th scope="col" className="px-5 py-3 font-medium">Shipment</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Distance</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Weight</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Standard</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Express</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {EXAMPLES.map((e) => (
                  <tr key={e.label}>
                    <th scope="row" className="px-5 py-3.5 text-left font-medium">{e.label}</th>
                    <td className="px-5 py-3.5 text-right font-mono text-muted">{e.km} km</td>
                    <td className="px-5 py-3.5 text-right font-mono text-muted">{e.kg} kg</td>
                    <td className="px-5 py-3.5 text-right font-mono">{formatINR(priceFor({ km: e.km, weightKg: e.kg, speed: 'standard' }, rule))}</td>
                    <td className="px-5 py-3.5 text-right font-mono font-semibold">{formatINR(priceFor({ km: e.km, weightKg: e.kg, speed: 'express' }, rule))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <PriceCalculator />

      <section className="container grid grid-cols-1 gap-10 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div>
          <h2 className="text-2xl font-extrabold">Every delivery includes</h2>
          <ul className="mt-5 space-y-3">
            {INCLUDED.map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-status-delivered" aria-hidden /> {t}</li>
            ))}
          </ul>
          <Button asChild size="lg" className="mt-8">
            <Link to="/register">Book your first parcel <ArrowRight /></Link>
          </Button>
        </div>
        <div>
          <h2 className="text-2xl font-extrabold">Pricing questions</h2>
          <Accordion type="single" collapsible className="mt-4">
            {FAQ.map(([q, a]) => (
              <AccordionItem key={q} value={q}>
                <AccordionTrigger>{q}</AccordionTrigger>
                <AccordionContent>{a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
      <Footer />
    </>
  );
}
