import { passwordScore } from '@/lib/validation';
import { cn } from '@/lib/utils';

const LABELS = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
const COLORS = ['bg-status-failed', 'bg-status-failed', 'bg-amber-500', 'bg-status-transit', 'bg-status-delivered'];

export function PasswordStrength({ password }) {
  if (!password) return null;
  const score = passwordScore(password);
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn('h-1 flex-1 rounded-full transition-colors', i < score ? COLORS[score] : 'bg-ink/10')} />
        ))}
      </div>
      <p className="mt-1 text-xs text-muted">Password strength: {LABELS[score]}</p>
    </div>
  );
}
