import { forwardRef } from 'react';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';

export const DropdownMenu = Dropdown.Root;
export const DropdownMenuTrigger = Dropdown.Trigger;

export const DropdownMenuContent = forwardRef(({ className, sideOffset = 8, ...props }, ref) => (
  <Dropdown.Portal>
    <Dropdown.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-[14rem] overflow-hidden rounded-xl border border-border bg-surface p-1.5 text-ink shadow-lift data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        className,
      )}
      {...props}
    />
  </Dropdown.Portal>
));
DropdownMenuContent.displayName = 'DropdownMenuContent';

export const DropdownMenuItem = forwardRef(({ className, ...props }, ref) => (
  <Dropdown.Item
    ref={ref}
    className={cn(
      'flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors data-[highlighted]:bg-ink/5 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-muted',
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = 'DropdownMenuItem';

export const DropdownMenuLabel = ({ className, ...props }) => <Dropdown.Label className={cn('px-2.5 py-2', className)} {...props} />;
export const DropdownMenuSeparator = ({ className, ...props }) => (
  <Dropdown.Separator className={cn('-mx-1.5 my-1.5 h-px bg-border', className)} {...props} />
);
