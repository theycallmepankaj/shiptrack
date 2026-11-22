import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function LogoMark({ className }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-8 w-8', className)} aria-hidden>
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path d="M16 6.5c-4.1 0-7.5 3.2-7.5 7.3 0 5.4 7.5 11.7 7.5 11.7s7.5-6.3 7.5-11.7c0-4.1-3.4-7.3-7.5-7.3z" fill="#0B1220" />
      <path d="M12.8 14.2l2.4 2.3 4.2-4.6" stroke="#FF6B2C" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className, light = false }) {
  return (
    <Link to="/" className={cn('flex items-center gap-2', className)} aria-label="ShipTrack home">
      <LogoMark />
      <span className={cn('font-display text-lg font-extrabold tracking-tight', light ? 'text-white' : 'text-ink')}>
        {/* Brand orange; logotypes are exempt from WCAG 1.4.3 contrast. */}
        Ship<span className="text-primary" data-logotype>Track</span>
      </span>
    </Link>
  );
}
