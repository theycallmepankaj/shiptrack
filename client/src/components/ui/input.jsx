import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

const Input = forwardRef(({ className, type = 'text', ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'flex h-11 w-full rounded-[10px] border border-border bg-surface px-3.5 text-sm text-ink transition-colors placeholder:text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export { Input };
