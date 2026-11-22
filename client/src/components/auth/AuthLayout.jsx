import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { RouteIllustration } from '@/components/landing/RouteIllustration';

export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Logo />
          <ThemeToggle className="text-ink hover:bg-ink/5" />
        </div>
        <main className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">
          <h1 className="text-3xl font-extrabold">{title}</h1>
          {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-center text-sm text-muted">{footer}</div>}
        </main>
        <Link to="/" className="inline-flex items-center gap-1.5 self-center text-sm text-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>
      </div>

      <aside className="relative hidden overflow-hidden p-3 lg:block" aria-hidden>
        <div className="relative isolate flex h-full flex-col justify-between overflow-hidden rounded-[28px] bg-[#0A1A33] p-10 text-white">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_50%_0%,#1D4E89_0%,#0E2A52_45%,#0A1A33_100%)]" />
          <div className="bg-grid absolute inset-0 -z-10 [mask-image:radial-gradient(70%_60%_at_50%_50%,#000,transparent)]" />
          <p className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/85">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Secure sign-in · encrypted sessions
          </p>
          <RouteIllustration className="h-auto w-full" />
          <div>
            <p className="max-w-md font-display text-3xl font-extrabold leading-tight">
              “Every parcel, every kilometre — visible in real time.”
            </p>
            <dl className="mt-8 grid grid-cols-3 gap-4 border-t border-white/10 pt-6 text-sm">
              {[['2.4M+', 'Parcels delivered'], ['98.6%', 'On-time'], ['180+', 'Cities']].map(([v, k]) => (
                <div key={k}>
                  <dd className="font-mono text-xl font-bold">{v}</dd>
                  <dt className="text-white/60">{k}</dt>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </aside>
    </div>
  );
}
