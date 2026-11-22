import { useEffect, useState } from 'react';
import { CalendarDays, Mail, Phone, ShieldCheck } from 'lucide-react';
import { api, parseApiError } from '@/api/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { initials } from '@/lib/utils';
import { ROLE_LABEL } from '@/lib/roles';
import { PageHeader } from './PageHeader';

export default function Profile() {
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/auth/me').then(({ data }) => setUser(data.user)).catch((e) => setError(parseApiError(e).message));
  }, []);

  return (
    <>
      <PageHeader title="Profile" subtitle="Your account details." />
      {error && <p className="text-status-failed">{error}</p>}
      {!user && !error && <Skeleton className="h-64 max-w-2xl" />}
      {user && (
        <div className="max-w-2xl overflow-hidden rounded-card border border-border bg-surface shadow-soft">
          <div className="flex items-center gap-4 border-b border-border p-6">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-primary font-display text-xl font-extrabold text-primary-foreground">{initials(user.name)}</span>
            <div>
              <p className="text-xl font-bold">{user.name}</p>
              <Badge className="mt-1 bg-ink/5 text-ink"><ShieldCheck className="h-3 w-3" /> {ROLE_LABEL[user.role]}</Badge>
            </div>
          </div>
          <dl className="divide-y divide-border">
            {[
              [Mail, 'Email', user.email],
              [Phone, 'Phone', user.phone || '—'],
              [CalendarDays, 'Member since', new Date(user.createdAt).toLocaleDateString('en-IN', { dateStyle: 'long' })],
            ].map(([Icon, k, v]) => (
              <div key={k} className="flex items-center gap-4 px-6 py-4">
                <Icon className="h-4 w-4 text-muted" aria-hidden />
                <dt className="w-32 text-sm text-muted">{k}</dt>
                <dd className="min-w-0 flex-1 truncate text-sm font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </>
  );
}
