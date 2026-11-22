import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { ROLE_HOME } from '@/lib/roles';
import { Skeleton } from '@/components/ui/skeleton';

function FullPageSkeleton() {
  return (
    <div className="flex min-h-screen" aria-busy="true" aria-label="Loading">
      <div className="hidden w-64 border-r border-border bg-surface p-4 lg:block">
        <Skeleton className="h-8 w-32" />
        <div className="mt-8 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
      </div>
      <div className="flex-1 p-6">
        <Skeleton className="h-10 w-64" />
        <div className="mt-8 grid gap-4 sm:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      </div>
    </div>
  );
}

/** Protects a route by login and (optionally) role (FR-6, client side). */
export function ProtectedRoute({ roles, children }) {
  const { user, status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullPageSkeleton />;
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={ROLE_HOME[user.role]} replace />;
  return children;
}

/** For login/register: signed-in users go straight to their dashboard. */
export function GuestRoute({ children }) {
  const { user, status } = useAuth();
  if (status === 'loading') return null;
  if (status === 'authenticated') return <Navigate to={ROLE_HOME[user.role]} replace />;
  return children;
}
