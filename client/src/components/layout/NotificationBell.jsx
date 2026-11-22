import { Bell, CheckCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { NOTIFICATION_ICON, notificationsPath, timeAgo } from '@/lib/notifications';
import { cn } from '@/lib/utils';

/** FR-37: bell with unread count and the latest notifications, updated live. */
export function NotificationBell() {
  const { user } = useAuth();
  const { recent, unread, loaded, markRead, markAllRead } = useNotifications();
  const navigate = useNavigate();
  const open = (n) => {
    if (!n.isRead) markRead(n.id);
    if (n.link) navigate(n.link);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="relative grid h-10 w-10 place-items-center rounded-full text-ink transition-colors hover:bg-ink/5" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 font-mono text-[10px] font-bold text-primary-foreground ring-2 ring-surface" aria-hidden>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between px-3.5 pb-2 pt-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <button type="button" onClick={(e) => { e.preventDefault(); markAllRead(); }} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-primary-text hover:bg-primary/10">
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          )}
        </div>
        {loaded && recent.length === 0 ? (
          <div className="mx-1.5 mb-1.5 flex flex-col items-center rounded-lg bg-background px-4 py-8 text-center">
            <Bell className="h-6 w-6 text-muted" aria-hidden />
            <p className="mt-2 text-sm font-medium">You’re all caught up</p>
            <p className="text-xs text-muted">Shipment updates will show up here.</p>
          </div>
        ) : (
          <div className="max-h-[min(26rem,70vh)] overflow-y-auto px-1.5 pb-1.5">
            {recent.map((n) => {
              const Icon = NOTIFICATION_ICON[n.type] ?? Bell;
              return (
                <DropdownMenuItem key={n.id} onSelect={() => open(n)} className="items-start gap-3 px-2 py-2.5">
                  <span className={cn('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full [&_svg]:!text-current', n.isRead ? 'bg-ink/5 text-muted' : 'bg-primary/15 text-primary-text')}>
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-sm', !n.isRead && 'font-semibold')}>{n.title}</span>
                    <span className="line-clamp-2 text-xs text-muted">{n.message}</span>
                    <span className="mt-0.5 block text-[11px] text-muted">{timeAgo(n.createdAt)}</span>
                  </span>
                  {!n.isRead && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                </DropdownMenuItem>
              );
            })}
          </div>
        )}
        <DropdownMenuSeparator className="mx-0 my-0" />
        <DropdownMenuItem asChild className="justify-center rounded-none py-2.5 text-sm font-medium text-primary-text">
          <Link to={notificationsPath(user?.role)}>View all notifications</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
