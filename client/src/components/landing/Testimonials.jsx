import { Quote, Star } from 'lucide-react';
import { Reveal } from '@/components/Reveal';

// Sample testimonials for the demo landing page — replace with real customer quotes.
const items = [
  { name: 'Ananya Rao', role: 'Founder, handmade ceramics store', text: 'My customers stopped emailing “where is my order?” — they just open the link and watch the bike come round the corner.' },
  { name: 'Farhan Sheikh', role: 'Ops lead, D2C electronics', text: 'Auto-assign plus optimised routes cut our average delivery time by a third in the first month.' },
  { name: 'Meera Iyer', role: 'Sends documents weekly', text: 'The quote is upfront, the OTP handover gives me peace of mind, and the chatbot actually answers with the policy page.' },
];

export function Testimonials() {
  return (
    <section className="section container" aria-labelledby="t-title">
      <Reveal className="mx-auto max-w-2xl text-center">
        <span className="eyebrow">Testimonials</span>
        <h2 id="t-title" className="section-title mt-4">Loved by senders and receivers</h2>
      </Reveal>
      <ul className="mt-14 grid gap-4 md:grid-cols-3">
        {items.map((t, i) => (
          <Reveal as="li" key={t.name} delay={i * 0.08}>
            <figure className="flex h-full flex-col rounded-card border border-border bg-surface p-7 shadow-soft transition-shadow hover:shadow-lift">
              <Quote className="h-8 w-8 text-primary" aria-hidden />
              <div className="mt-4 flex gap-0.5" role="img" aria-label="5 out of 5 stars">
                {Array.from({ length: 5 }).map((_, s) => <Star key={s} className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />)}
              </div>
              <blockquote className="mt-3 flex-1 leading-relaxed">{t.text}</blockquote>
              <figcaption className="mt-6 flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/15 font-semibold text-primary-text">
                  {t.name.split(' ').map((n) => n[0]).join('')}
                </span>
                <span>
                  <span className="block text-sm font-semibold">{t.name}</span>
                  <span className="block text-xs text-muted">{t.role}</span>
                </span>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
