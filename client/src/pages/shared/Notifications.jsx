import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck, ChevronRight, Loader2 } from 'lucide-react';
import { api, parseApiError } from '@/api/client';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useNotifications } from '@/context/NotificationContext';
import { formatTime } from '@/lib/format';
import { NOTIFICATION_ICON } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import { PageHeader } from './PageHeader';

const dayLabel = (d) => {
  const key = (x) => new Date(x).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const today = key(Date.now());
  const yesterday = key(Date.now() - 86_400_000);
  const k = key(d);
  if (k === today) return 'Today';
  if (k === yesterday) return 'Yesterday';
  return new Date(d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });
};

/** FR-39: every notification, newest first, grouped by day, with read/unread state. */
export default function Notifications() {
  const { unread, recent, markRead, markAllRead } = useNotifications();
  const [filter, setFilter] = useState('all');
  const [items, setItems] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (p, f) => {
    const { data } = await api.get('/notifications', { params: { filter: f, page: p, limit: 20 } });
    setItems((prev) => (p === 1 ? data.items : [...(prev ?? []), ...data.items]));
    setPage(p);
    setPages(data.pages);
  }, []);
  useEffect(() => {
    setItems(null);
    load(1, filter).catch((e) => setError(parseApiError(e).message));
  }, [filter, load]);
  // New ones arriving live (via the provider) appear at the top.
  const newest = recent[0]?.id;
  useEffect(() => {
    if (!newest) return;
    setItems((list) => (list && !list.some((n) => n.id === newest) ? [recent[0], ...list] : list));
  }, [newest, recent]);

  const read = (n) => {
    if (n.isRead) return;
    markRead(n.id);
    setItems((list) => list.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
  };
  const readAll = async () => {
    await markAllRead();
    setItems((list) => (filter === 'unread' ? [] : list.map((x) => ({ ...x, isRead: true }))));
  };

  if (error) return <EmptyState title="Couldn’t load notifications" text={error} />;
  const groups = [];
  for (const n of items ?? []) {
    const label = dayLabel(n.createdAt);
    if (groups.at(-1)?.label !== label) groups.push({ label, items: [] });
    groups.at(-1).items.push(n);
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={unread ? `${unread} unread` : 'You’re all caught up'}
        actions={<Button variant="outline" size="sm" onClick={readAll} disabled={!unread}><CheckCheck /> Mark all read</Button>}
      />
      <div role="tablist" aria-label="Filter notifications" className="mb-5 inline-flex rounded-xl border border-border bg-surface p-1">
        {[['all', 'All'], ['unread', `Unread${unread ? ` (${unread})` : ''}`]].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}
            className={cn('rounded-lg px-4 py-1.5 text-sm font-medium transition-colors', filter === id ? 'bg-ink text-background' : 'text-muted hover:text-ink')}>
            {label}
          </button>
        ))}
      </div>

      {!items ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center rounded-card border border-dashed border-border bg-surface px-6 py-14 text-center">
          <Bell className="h-8 w-8 text-muted" aria-hidden />
          <h2 className="mt-3 font-bold">{filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}</h2>
          <p className="mt-1 text-sm text-muted">Bookings, payments and delivery updates will show up here.</p>
        </div>
      ) : (
        <div className="max-w-3xl space-y-6">
          {groups.map((g) => (
            <section key={g.label} aria-labelledby={`g-${g.label}`}>
              <h2 id={`g-${g.label}`} className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{g.label}</h2>
              <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface shadow-soft">
                {g.items.map((n) => {
                  const Icon = NOTIFICATION_ICON[n.type] ?? Bell;
                  const body = (
                    <>
                      <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full', n.isRead ? 'bg-ink/5 text-muted' : 'bg-primary/15 text-primary-text')}>
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block text-sm', !n.isRead && 'font-semibold')}>{n.title}</span>
                        <span className="block text-sm text-muted">{n.message}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1.5">
                        <span className="text-xs text-muted">{formatTime(n.createdAt)}</span>
                        {!n.isRead && <span className="h-2 w-2 rounded-full bg-primary" aria-label="Unread" />}
                      </span>
                      {n.link && <ChevronRight className="h-4 w-4 shrink-0 self-center text-muted" aria-hidden />}
                    </>
                  );
                  const cls = cn('flex items-start gap-3 px-4 py-3.5 transition-colors', !n.isRead && 'bg-primary/[0.04]', n.link && 'hover:bg-ink/[0.03]');
                  return (
                    <li key={n.id}>
                      {n.link ? (
                        <Link to={n.link} onClick={() => read(n)} className={cls}>{body}</Link>
                      ) : (
                        <button type="button" onClick={() => read(n)} className={cn(cls, 'w-full text-left')}>{body}</button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {page < pages && (
            <Button variant="outline" className="w-full" disabled={loadingMore} onClick={async () => { setLoadingMore(true); await load(page + 1, filter).catch(() => {}); setLoadingMore(false); }}>
              {loadingMore && <Loader2 className="animate-spin" />} Load older
            </Button>
          )}
        </div>
      )}
    </>
  );
}
