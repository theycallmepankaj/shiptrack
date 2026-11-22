import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Navigation, PackageCheck, Truck, Undo2, UserCheck, XCircle } from 'lucide-react';
import { STATUS, STEPS, TERMINAL } from '@/lib/status';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const ICONS = {
  BOOKED: ClipboardCheck, ASSIGNED: UserCheck, PICKED_UP: PackageCheck, IN_TRANSIT: Truck,
  OUT_FOR_DELIVERY: Navigation, DELIVERED: CheckCircle2, FAILED_ATTEMPT: AlertTriangle, RETURNED: Undo2, CANCELLED: XCircle,
};

/**
 * Vertical timeline: every recorded event (with time and note), followed by the
 * remaining happy-path steps as muted "pending" items. New events animate in.
 */
export function StatusTimeline({ history = [], status, className }) {
  const events = [...history].sort((a, b) => new Date(a.at) - new Date(b.at));
  const reached = new Set(events.map((e) => e.status));
  const lastStepIdx = Math.max(...events.map((e) => STEPS.indexOf(e.status)), 0);
  const upcoming = TERMINAL.includes(status) ? [] : STEPS.slice(lastStepIdx + 1).filter((s) => !reached.has(s));
  const items = [
    ...events.map((e, i) => ({ ...e, key: `${e.status}-${e.at}`, done: true, current: i === events.length - 1 })),
    ...upcoming.map((s) => ({ status: s, key: s, done: false })),
  ];

  return (
    <ol className={cn('relative', className)} aria-label="Shipment timeline">
      {items.map((item, i) => {
        const Icon = ICONS[item.status] ?? ClipboardCheck;
        const color = STATUS[item.status]?.color ?? '#64748B';
        const last = i === items.length - 1;
        return (
          <motion.li
            key={item.key}
            layout
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.3) }}
            className="relative flex gap-4 pb-6 last:pb-0"
          >
            {!last && (
              <span aria-hidden className="absolute left-[17px] top-9 h-[calc(100%-2.25rem)] w-0.5 overflow-hidden rounded-full bg-border">
                {item.done && items[i + 1]?.done && (
                  <motion.span className="block h-full w-full bg-primary" initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} style={{ originY: 0 }} transition={{ duration: 0.5 }} />
                )}
              </span>
            )}
            <span
              className={cn('relative grid h-9 w-9 shrink-0 place-items-center rounded-full border-2', item.done ? 'text-white' : 'border-dashed border-border bg-surface text-muted')}
              style={item.done ? { backgroundColor: color, borderColor: color } : undefined}
            >
              {item.current && !TERMINAL.includes(item.status) && (
                <span aria-hidden className="absolute inset-0 animate-ping2 rounded-full" style={{ backgroundColor: `${color}55` }} />
              )}
              <Icon className="relative h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className={cn('text-sm font-semibold', !item.done && 'text-muted')}>{STATUS[item.status]?.label ?? item.status}</p>
                <p className="font-mono text-xs text-muted">{item.done ? formatDateTime(item.at) : 'Pending'}</p>
              </div>
              {item.note && <p className="mt-0.5 text-sm text-muted">{item.note}</p>}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
