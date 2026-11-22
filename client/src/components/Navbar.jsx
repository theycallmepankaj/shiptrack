import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { ROLE_HOME } from '@/lib/roles';

const links = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#features', label: 'Features' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/track', label: 'Track parcel' },
];

// Sticky glass navbar (§11.4). `overHero` renders light text while it floats over the dark hero.
export function Navbar({ overHero = false }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const light = overHero && !scrolled && !open;
  const { user } = useAuth();
  const home = user ? ROLE_HOME[user.role] : null;

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
      <nav
        aria-label="Main"
        className={cn(
          'mx-auto flex h-16 max-w-7xl items-center justify-between rounded-2xl px-4 transition-all duration-300 sm:px-5',
          light
            ? 'border border-white/10 bg-white/5 backdrop-blur-md'
            : 'border border-border bg-surface/75 shadow-soft backdrop-blur-xl',
        )}
      >
        <Logo light={light} />

        <ul className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <li key={l.href}>
              <NavItem link={l} light={light} />
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-1.5">
          <ThemeToggle className={light ? 'text-white hover:bg-white/10' : 'text-ink hover:bg-ink/5'} />
          {user ? (
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link to={home}>Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className={cn('hidden sm:inline-flex', light && 'text-white hover:bg-white/10')}>
                <Link to="/login">Log in</Link>
              </Button>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link to="/register">Get started</Link>
              </Button>
            </>
          )}
          <button
            type="button"
            className={cn('grid h-10 w-10 place-items-center rounded-full md:hidden', light ? 'text-white' : 'text-ink')}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="mx-auto mt-2 max-w-7xl rounded-2xl border border-border bg-surface p-3 shadow-lift md:hidden"
          >
            <ul className="flex flex-col">
              {links.map((l) => (
                <li key={l.href}>
                  <a href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-3 font-medium hover:bg-ink/5">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
            {user ? (
              <Button asChild className="mt-2 w-full"><Link to={home}>Go to dashboard</Link></Button>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button asChild variant="outline"><Link to="/login">Log in</Link></Button>
                <Button asChild><Link to="/register">Get started</Link></Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function NavItem({ link, light }) {
  const cls = cn(
    'rounded-full px-3.5 py-2 text-sm font-medium transition-colors',
    light ? 'text-white/80 hover:bg-white/10 hover:text-white' : 'text-muted hover:bg-ink/5 hover:text-ink',
  );
  if (link.href.startsWith('/#')) return <a href={link.href} className={cls}>{link.label}</a>;
  return <NavLink to={link.href} className={cls}>{link.label}</NavLink>;
}
