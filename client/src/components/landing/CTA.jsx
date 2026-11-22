import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/Reveal';

export function CTA() {
  return (
    <section className="container pb-20 sm:pb-28" aria-labelledby="cta-title">
      <Reveal>
        <div className="relative isolate overflow-hidden rounded-[28px] bg-[#0A1A33] px-6 py-14 text-center text-white sm:px-12 sm:py-20">
          <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(80%_120%_at_50%_120%,rgba(255,107,44,0.45),transparent_60%)]" />
          <div aria-hidden className="bg-grid absolute inset-0 -z-10 opacity-60" />
          <h2 id="cta-title" className="mx-auto max-w-2xl text-balance text-3xl font-extrabold sm:text-5xl">
            Your next parcel could be on its way in minutes
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-white/75">Create a free account, get an instant quote and book a pickup today.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg"><Link to="/register">Get started free <ArrowRight /></Link></Button>
            <Button asChild size="lg" variant="glass"><Link to="/track">Track a parcel</Link></Button>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
