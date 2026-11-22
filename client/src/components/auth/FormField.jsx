import { forwardRef, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Labelled input with an accessible error message. */
export const FormField = forwardRef(({ label, error, hint, className, type = 'text', ...props }, ref) => {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const isPassword = type === 'password';
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <div className="relative">
        <Input
          ref={ref}
          id={id}
          type={isPassword && visible ? 'text' : type}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={cn(isPassword && 'pr-11', error && 'border-status-failed focus-visible:border-status-failed focus-visible:ring-status-failed/30')}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-ink"
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-status-failed" role="alert">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
});
FormField.displayName = 'FormField';

export function FormAlert({ children }) {
  if (!children) return null;
  return (
    <div role="alert" className="rounded-[10px] border border-status-failed/30 bg-status-failed/10 px-3.5 py-2.5 text-sm text-status-failed">
      {children}
    </div>
  );
}
