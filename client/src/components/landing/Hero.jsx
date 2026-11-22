import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Clock3, MapPin, PackageSearch, Search, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { RouteIllustration } from './RouteIllustration';

const TRACKING_RE = /^SHP-[A-Z0-9]{6}$/;

function useLocalTime(timeZone = 'Asia/Kolkata') {
  const fmt = () => new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date());
  // Filled in after hydration: the prerendered page can't know the visitor's time.
  const [time, setTime] = useState('—');
  useEffect(() => {
    setTime(fmt());
    const id = setInterval(() => setTime(fmt()), 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return time;
}

export function Hero() {
  const navigate = useNavigate();
  const [trackingId, setTrackingId] = useState('');
  const time = useLocalTime();

  const onSubmit = (e) => {
    e.preventDefault();
    const id = trackingId.trim().toUpperCase();
    if (!id) return toast.error('Enter a tracking ID to continue');
    if (!TRACKING_RE.test(id)) return toast.error('Tracking IDs look like SHP-7X4K2P');
    navigate(`/track/${id}`);
  };

  return (
    <section className="px-2 pt-2 sm:px-3 sm:pt-3" aria-labelledby="hero-title">
      <div className="relative isolate overflow-hidden rounded-[28px] bg-[#0A1A33] text-white">
        {/* Backdrop: deep ocean-blue gradient, glows and grid */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_50%_0%,#1D4E89_0%,#0E2A52_45%,#0A1A33_100%)]" />
        <div aria-hidden className="bg-grid absolute inset-0 -z-10 [mask-image:radial-gradient(70%_60%_at_50%_40%,#000,transparent)]" />
        <div aria-hidden className="absolute -right-24 top-24 -z-10 h-80 w-80 rounded-full bg-primary/25 blur-[100px]" />

        {/* Giant wordmark (decorative) */}
        <motion.p
          aria-hidden
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none select-none pt-28 text-center font-display text-[17vw] font-extrabold leading-[0.85] tracking-[-0.04em] sm:pt-32 xl:text-[15rem]"
          style={{
            backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.55) 55%, rgba(255,255,255,0) 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          SHIPTRACK
        </motion.p>

        {/* Route illustration overlapping the wordmark */}
        <div className="relative mx-auto -mt-[9vw] max-w-6xl px-2 xl:-mt-32">
          <RouteIllustration className="h-auto w-full" />
          <FloatingChip className="left-[6%] top-[62%] hidden sm:flex" delay={0.6} icon={<MapPin className="h-4 w-4 text-primary" />}>
            <span className="text-white/60">Picked up</span> Indiranagar · 09:42
          </FloatingChip>
          <FloatingChip className="right-[4%] top-[2%] hidden sm:flex" delay={0.8} icon={<Clock3 className="h-4 w-4 text-primary" />}>
            <span className="text-white/60">ETA</span> <span className="font-mono">14 min</span>
          </FloatingChip>
        </div>

        {/* Glass panel: headline + tracking CTA */}
        <div className="relative px-3 pb-3 sm:px-6 sm:pb-6">
          {/* Slides in but is visible from the first frame: the headline is the page's largest
              paint, and fading it in from 0 would delay LCP until the animation ends. */}
          <motion.div
            initial={{ y: 24 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="glass mx-auto grid max-w-6xl gap-6 rounded-3xl p-5 sm:p-7 lg:grid-cols-[1.1fr_1fr] lg:items-end"
          >
            <div>
              <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/85">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping2 rounded-full bg-emerald-400" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                Bengaluru (IST) · {time} · <span className="font-mono">1,284</span> parcels moving now
              </p>
              <h1 id="hero-title" className="text-balance text-3xl font-extrabold leading-[1.05] sm:text-4xl lg:text-5xl">
                Ship smarter. Watch every parcel move, live.
              </h1>
              <p className="mt-3 max-w-xl text-pretty text-white/75 sm:text-lg">
                Instant quotes, AI-predicted delivery times and a live driver map — from pickup to the doorstep.
              </p>
            </div>

            <div>
              <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded-2xl bg-white p-2 shadow-lift sm:flex-row" role="search">
                <label htmlFor="hero-tracking" className="sr-only">Tracking ID</label>
                <div className="flex flex-1 items-center gap-2 px-3">
                  <PackageSearch className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
                  <input
                    id="hero-tracking"
                    value={trackingId}
                    onChange={(e) => setTrackingId(e.target.value)}
                    placeholder="Enter tracking ID, e.g. SHP-7X4K2P"
                    autoComplete="off"
                    spellCheck={false}
                    className="h-12 w-full bg-transparent font-mono text-sm uppercase text-navy-900 placeholder:font-sans placeholder:normal-case placeholder:text-slate-500 focus:outline-none"
                  />
                </div>
                <Button type="submit" size="lg" className="shadow-none">
                  <Search /> Track parcel
                </Button>
              </form>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-sm text-white/75">
                <Link to="/register" className="inline-flex items-center gap-1.5 font-semibold text-white hover:text-primary">
                  Book a shipment <ArrowRight className="h-4 w-4" />
                </Link>
                <a href="#pricing" className="inline-flex items-center gap-1.5 hover:text-white">
                  <Sparkles className="h-4 w-4 text-primary" /> Get an instant quote
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function FloatingChip({ children, icon, className, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className={`glass absolute items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-white shadow-lift ${className}`}
    >
      {icon}
      {children}
    </motion.div>
  );
}
