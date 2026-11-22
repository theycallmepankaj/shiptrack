import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

/** Empty state with a small route illustration and one clear next action (§11.4). */
export function EmptyState({ title, text, action }) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-border bg-surface px-6 py-14 text-center">
      <svg viewBox="0 0 160 100" className="h-24 w-40" aria-hidden>
        <path d="M20 80 C 50 80, 60 30, 90 40 S 130 70, 140 25" fill="none" className="stroke-border" strokeWidth="4" strokeDasharray="3 8" strokeLinecap="round" />
        <circle cx="20" cy="80" r="7" className="fill-surface stroke-ink" strokeWidth="3" />
        <path d="M140 30 c-2-4-8-7-8-13 a8 8 0 1 1 16 0 c0 6-6 9-8 13z" className="fill-primary" />
        <g transform="translate(72 30)">
          <rect width="34" height="28" rx="4" className="fill-primary/15 stroke-primary" strokeWidth="2.5" />
          <path d="M0 9 H34 M17 0 V9" className="stroke-primary" strokeWidth="2.5" />
        </g>
      </svg>
      <h2 className="mt-5 text-lg font-bold">{title}</h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted">{text}</p>
      {action && (
        <Button asChild className="mt-6">
          <Link to={action.to}>{action.icon && <action.icon />} {action.label}</Link>
        </Button>
      )}
    </div>
  );
}
