import { ClipboardList, MapPinned, PackageCheck } from 'lucide-react';
import { Reveal } from '@/components/Reveal';

const steps = [
  { icon: ClipboardList, title: 'Book', text: 'Enter pickup and drop addresses, package details and speed. See the price and ETA before you pay.' },
  { icon: MapPinned, title: 'Track live', text: 'Your driver’s location streams to the map every few seconds, with an ETA that updates as they move.' },
  { icon: PackageCheck, title: 'Delivered', text: 'The driver confirms with your one-time code and a photo or signature. Proof lands in your inbox.' },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="section container scroll-mt-24" aria-labelledby="hiw-title">
      <Reveal className="mx-auto max-w-2xl text-center">
        <span className="eyebrow">How it works</span>
        <h2 id="hiw-title" className="section-title mt-4">Three steps from your door to theirs</h2>
      </Reveal>

      <ol className="mt-14 grid gap-4 md:grid-cols-3">
        {steps.map((s, i) => (
          <Reveal as="li" key={s.title} delay={i * 0.08}>
            <div className="group relative flex h-full min-h-[260px] flex-col overflow-hidden rounded-card border border-border bg-surface p-7 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-lift">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary-text transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <s.icon className="h-6 w-6" aria-hidden />
              </div>
              <h3 className="mt-5 text-2xl font-extrabold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
              <span aria-hidden className="mt-auto pt-8 font-mono text-5xl font-bold text-ink/10 transition-colors group-hover:text-primary/40">
                0{i + 1}
              </span>
            </div>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}
