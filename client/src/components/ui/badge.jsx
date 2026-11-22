import { cn } from '@/lib/utils';
import { STATUS } from '@/lib/status';

export function Badge({ className, ...props }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', className)}
      {...props}
    />
  );
}

export function StatusBadge({ status, className }) {
  const s = STATUS[status] ?? { label: status, color: '#64748B' };
  return (
    // Text is the status colour mixed with ink (darker in light mode, lighter in dark) so it
    // stays ≥ 4.8:1 on the tinted background; the dot keeps the pure status colour.
    <Badge className={className} style={{ color: `color-mix(in srgb, ${s.color} 60%, rgb(var(--ink)))`, backgroundColor: `${s.color}1a` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
      {s.label}
    </Badge>
  );
}

/** Shown next to the status while a booking waits for payment (FR-13). */
export function UnpaidBadge({ payment, status }) {
  if (status !== 'BOOKED' || !['pending', 'failed'].includes(payment)) return null;
  return <Badge className="bg-amber-500/15 text-amber-800 dark:text-amber-200">{payment === 'failed' ? 'Payment failed' : 'Unpaid'}</Badge>;
}
