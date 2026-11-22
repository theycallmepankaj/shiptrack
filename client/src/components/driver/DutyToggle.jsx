import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Large On duty / Off duty switch (FR-25). */
export function DutyToggle({ onDuty, onChange, loading }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={onDuty}
      aria-label={onDuty ? 'On duty — tap to go off duty' : 'Off duty — tap to go on duty'}
      onClick={() => onChange(!onDuty)}
      disabled={loading}
      className={cn(
        'flex h-12 items-center gap-3 rounded-full border-2 pl-1.5 pr-4 font-semibold transition-colors disabled:opacity-70',
        onDuty ? 'border-status-delivered bg-status-delivered/10 text-status-delivered' : 'border-border bg-surface text-muted',
      )}
    >
      <span className={cn('relative h-8 w-14 rounded-full transition-colors', onDuty ? 'bg-status-delivered' : 'bg-ink/15')}>
        <span className={cn('absolute top-1 grid h-6 w-6 place-items-center rounded-full bg-white shadow transition-all', onDuty ? 'left-7' : 'left-1')}>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />}
        </span>
      </span>
      {onDuty ? 'On duty' : 'Off duty'}
    </button>
  );
}
