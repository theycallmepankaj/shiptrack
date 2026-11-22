import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Hero } from '@/components/landing/Hero';
import { TrustStrip } from '@/components/landing/TrustStrip';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { Features } from '@/components/landing/Features';
import { PriceCalculator } from '@/components/landing/PriceCalculator';
import { LiveTrackingPreview } from '@/components/landing/LiveTrackingPreview';
import { Testimonials } from '@/components/landing/Testimonials';
import { FAQ } from '@/components/landing/FAQ';
import { CTA } from '@/components/landing/CTA';

export default function Landing() {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">
        Skip to content
      </a>
      <Navbar overHero />
      <main id="main">
        <Hero />
        <TrustStrip />
        <HowItWorks />
        <Features />
        <PriceCalculator />
        <LiveTrackingPreview />
        <Testimonials />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
