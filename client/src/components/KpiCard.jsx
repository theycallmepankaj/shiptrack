import { cn } from '@/lib/utils';

export function KpiCard({ label, value, icon: Icon, note, className }) {
  return (
    <div className={cn('rounded-card border border-border bg-surface p-5 shadow-soft', className)}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{label}</p>
        {Icon && <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary-text"><Icon className="h-4 w-4" aria-hidden /></span>}
      </div>
      <p className="mt-3 font-mono text-3xl font-bold tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}
