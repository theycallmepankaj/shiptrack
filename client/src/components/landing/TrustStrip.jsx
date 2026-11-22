import { Boxes, Box, Hexagon, Layers, Leaf, Orbit, Ship, Store } from 'lucide-react';
import { CountUp } from '@/components/CountUp';
import { Reveal } from '@/components/Reveal';

const stats = [
  { to: 2.4, decimals: 1, suffix: 'M+', label: 'Parcels delivered' },
  { to: 180, suffix: '+', label: 'Cities covered' },
  { to: 98.6, decimals: 1, suffix: '%', label: 'Delivered on time' },
  { to: 4.9, decimals: 1, suffix: '/5', label: 'Average rating' },
];

// Placeholder partner wordmarks — swap for real customer logos.
const partners = [
  [Leaf, 'Greenleaf'], [Boxes, 'Cartly'], [Orbit, 'Orbitmart'], [Ship, 'Tidewater'],
  [Hexagon, 'Hexacraft'], [Store, 'Bazaarly'], [Layers, 'Stackhouse'], [Box, 'Parcelio'],
];

export function TrustStrip() {
  return (
    <section aria-label="ShipTrack in numbers" className="container pt-16 sm:pt-20">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border lg:grid-cols-4">
        {stats.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.06} className="bg-surface px-6 py-7 text-center">
            <dt className="text-sm text-muted">{s.label}</dt>
            <dd className="mt-1 font-display text-3xl font-extrabold sm:text-4xl">
              <CountUp to={s.to} decimals={s.decimals} suffix={s.suffix} />
            </dd>
          </Reveal>
        ))}
      </dl>

      <div className="mt-14 text-center">
        <h2 className="font-display text-xl font-bold sm:text-2xl">Brands &amp; businesses shipping with us</h2>
        <div className="relative mt-7 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
          <ul className="flex w-max animate-marquee gap-12 hover:[animation-play-state:paused]">
            {[...partners, ...partners].map(([Icon, name], i) => (
              <li key={i} aria-hidden={i >= partners.length} className="flex items-center gap-2 text-lg font-semibold text-muted">
                <Icon className="h-6 w-6" aria-hidden /> {name}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
