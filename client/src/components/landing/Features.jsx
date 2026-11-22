import { motion } from 'framer-motion';
import { Bot, Camera, IndianRupee, MapPin, MessageCircle, Navigation, Phone, Route, Star, TrendingUp } from 'lucide-react';
import { Reveal } from '@/components/Reveal';
import { cn } from '@/lib/utils';

export function Features() {
  return (
    <section id="features" className="section scroll-mt-24 bg-surface" aria-labelledby="features-title">
      <div className="container">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">Features</span>
          <h2 id="features-title" className="section-title mt-4">Everything you need to ship with confidence</h2>
          <p className="mt-4 text-muted">One platform for customers, drivers and dispatch — with live data and AI where it actually helps.</p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-6 lg:grid-cols-12">
          <Tile className="md:col-span-6 lg:col-span-5 lg:row-span-2" eyebrow="Live tracking" title="Real-time shipment tracking" text="Watch the driver glide across the map with a live ETA countdown.">
            <PhoneMock />
          </Tile>
          <Tile className="md:col-span-3 lg:col-span-4" eyebrow="AI assistant" title="Answers with sources" text="Ask “Where is my parcel?” or what you can’t ship — cited from our policies.">
            <ChatMock />
          </Tile>
          <Tile className="md:col-span-3 lg:col-span-3" eyebrow="Proof of delivery" title="OTP + photo proof" text="Handed over only with your one-time code.">
            <OtpMock />
          </Tile>
          <Tile className="md:col-span-3 lg:col-span-3" eyebrow="Smart routing" title="Optimised stop order" text="OR-Tools plans the fastest route for every driver.">
            <RouteMock />
          </Tile>
          <Tile className="md:col-span-3 lg:col-span-4" eyebrow="Instant quotes" title="Price before you pay" text="Distance, weight and speed — priced in under a second.">
            <QuoteMock />
          </Tile>
        </div>
      </div>
    </section>
  );
}

function Tile({ className, eyebrow, title, text, children }) {
  return (
    <Reveal className={cn('group', className)}>
      <article className="relative flex h-full flex-col overflow-hidden rounded-card bg-navy-900 p-6 text-white shadow-lift ring-1 ring-white/5 transition-transform duration-300 hover:-translate-y-1 dark:bg-[#0D1526]">
        <div aria-hidden className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl transition-opacity group-hover:opacity-100 lg:opacity-60" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/55">{eyebrow}</p>
        <h3 className="mt-1.5 text-xl font-extrabold sm:text-2xl">{title}</h3>
        <p className="mt-1.5 max-w-sm text-sm text-white/65">{text}</p>
        <div className="mt-6 flex flex-1 items-end">{children}</div>
      </article>
    </Reveal>
  );
}

function PhoneMock() {
  return (
    <div className="mx-auto w-full max-w-[300px] rounded-[2.2rem] border-[6px] border-[#1c2436] bg-[#1c2436] shadow-2xl">
      <div className="overflow-hidden rounded-[1.8rem] bg-slate-100 text-navy-900">
        <div className="flex items-center justify-between px-5 pt-3 text-[11px] font-semibold">
          <span>9:41</span>
          <span className="h-5 w-20 rounded-full bg-navy-900" />
          <span className="font-mono">5G</span>
        </div>
        <p className="px-5 pt-3 text-center text-sm font-bold">Order <span className="font-mono">#SHP-7X4K2P</span></p>
        <div className="relative mx-3 mt-3 h-56 overflow-hidden rounded-2xl bg-[#eef1f5]">
          <svg viewBox="0 0 260 220" className="absolute inset-0 h-full w-full" aria-hidden>
            <g stroke="#fff" strokeWidth="9" fill="none">
              <path d="M0 60 H260" /><path d="M0 150 H260" /><path d="M70 0 V220" /><path d="M190 0 V220" />
              <path d="M0 210 L260 20" strokeWidth="6" />
            </g>
            <path d="M40 40 C 90 40, 120 80, 150 110 S 190 170, 200 200" fill="none" stroke="#FF6B2C" strokeWidth="3" strokeDasharray="5 5" />
            <motion.path
              d="M40 40 C 90 40, 120 80, 150 110 S 190 170, 200 200"
              fill="none" stroke="#FF6B2C" strokeWidth="4" strokeLinecap="round"
              initial={{ pathLength: 0 }} whileInView={{ pathLength: 0.55 }} viewport={{ once: true }}
              transition={{ duration: 1.6, ease: 'easeInOut' }}
            />
            <circle cx="40" cy="40" r="7" fill="#fff" stroke="#FF6B2C" strokeWidth="4" />
            <circle cx="200" cy="200" r="6" fill="#0B1220" />
          </svg>
          <div className="absolute left-[54%] top-[46%] grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-navy-900 text-white shadow-lg ring-4 ring-white">
            <Navigation className="h-3.5 w-3.5 rotate-45" aria-hidden />
          </div>
        </div>
        <div className="m-3 flex items-center gap-3 rounded-2xl bg-navy-900 p-3 text-white">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-primary font-bold text-navy-900">RK</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Ravi K. · KA-01-AB-4821</p>
            <p className="flex items-center gap-1 text-[11px] text-white/60"><Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden /> 4.9 · ETA <span className="font-mono">14 min</span></p>
          </div>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10" aria-hidden><MessageCircle className="h-4 w-4" /></span>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10" aria-hidden><Phone className="h-4 w-4" /></span>
        </div>
      </div>
    </div>
  );
}

function ChatMock() {
  return (
    <div className="w-full space-y-2.5 text-sm">
      <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-navy-900">Can I ship a power bank?</p>
      <div className="flex gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10" aria-hidden><Bot className="h-4 w-4" /></span>
        <div className="rounded-2xl rounded-tl-md bg-white/10 px-3.5 py-2 text-white/90">
          Yes — lithium batteries under 100 Wh are allowed if packed in the device or separately insulated.
          <span className="mt-2 flex w-fit items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/70">📄 Prohibited items · p.2</span>
        </div>
      </div>
    </div>
  );
}

function OtpMock() {
  return (
    <div className="w-full">
      <div className="flex gap-2">
        {['4', '8', '1', '7'].map((d, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 * i }}
            className="grid h-12 flex-1 place-items-center rounded-xl border border-white/15 bg-white/5 font-mono text-xl font-bold"
          >
            {d}
          </motion.span>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-2 text-xs text-white/60"><Camera className="h-4 w-4 text-primary" aria-hidden /> Photo attached · Delivered 14:06</p>
    </div>
  );
}

function RouteMock() {
  const stops = ['Indiranagar', 'Domlur', 'Koramangala 5th Blk', 'HSR Layout'];
  return (
    <ol className="w-full space-y-2">
      {stops.map((s, i) => (
        <li key={s} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2 text-sm">
          <span className={cn('grid h-6 w-6 place-items-center rounded-full font-mono text-xs font-bold', i === 0 ? 'bg-primary text-navy-900' : 'bg-white/10')}>{i + 1}</span>
          <span className="flex-1 truncate">{s}</span>
          {i === 0 ? <Route className="h-4 w-4 text-primary" aria-hidden /> : <MapPin className="h-4 w-4 text-white/40" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

function QuoteMock() {
  const bars = [38, 52, 44, 66, 58, 80, 72];
  return (
    <div className="w-full">
      <div className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-navy-900" aria-hidden><IndianRupee className="h-4 w-4" /></span>
          <div>
            <p className="text-sm font-semibold">Mumbai → Pune · 2 kg</p>
            <p className="text-[11px] text-white/55">Express · same day</p>
          </div>
        </div>
        <p className="font-mono text-lg font-bold">₹400</p>
      </div>
      <div className="mt-4 flex h-20 items-end gap-2" aria-hidden>
        {bars.map((h, i) => (
          <motion.span
            key={i}
            className="flex-1 rounded-t-md bg-gradient-to-t from-white/10 to-white/40"
            initial={{ height: 0 }}
            whileInView={{ height: `${h}%` }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: i * 0.05 }}
          />
        ))}
      </div>
      <p className="mt-2 flex items-center gap-1 text-[11px] text-emerald-400"><TrendingUp className="h-3 w-3" aria-hidden /> 15.3% faster deliveries this week</p>
    </div>
  );
}
