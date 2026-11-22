import { cn } from '@/lib/utils';

export const Card = ({ className, ...props }) => (
  <div className={cn('rounded-card border border-border bg-surface shadow-soft', className)} {...props} />
);
export const CardHeader = ({ className, ...props }) => <div className={cn('p-6 pb-0', className)} {...props} />;
export const CardTitle = ({ className, ...props }) => (
  <h3 className={cn('font-display text-lg font-bold', className)} {...props} />
);
export const CardDescription = ({ className, ...props }) => (
  <p className={cn('text-sm text-muted', className)} {...props} />
);
export const CardContent = ({ className, ...props }) => <div className={cn('p-6', className)} {...props} />;
