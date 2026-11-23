import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';

const cols = [
  { title: 'Product', links: [['Track parcel', '/track'], ['Pricing', '/pricing'], ['Book a shipment', '/register']] },
  { title: 'Company', links: [['About', '/#how-it-works'], ['Careers', '/'], ['Contact', '/']] },
  { title: 'Support', links: [['Help centre', '/#faq'], ['Prohibited items', '/#faq'], ['Refund policy', '/#faq']] },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="container grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Book a courier in a minute and follow every parcel live — from pickup to the doorstep.
          </p>
        </div>
        {cols.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h3 className="text-sm font-semibold">{c.title}</h3>
            <ul className="mt-4 space-y-2.5">
              {c.links.map(([label, href]) => (
                <li key={label}>
                  <Link to={href} className="text-sm text-muted transition-colors hover:text-ink">{label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="container flex flex-col items-center justify-between gap-2 border-t border-border py-6 text-xs text-muted sm:flex-row">
        <p>© {new Date().getFullYear()} ShipTrack. All rights reserved.</p>
        <p>Map data © OpenStreetMap contributors</p>
      </div>
    </footer>
  );
}
