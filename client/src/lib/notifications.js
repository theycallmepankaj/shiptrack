import { AlertTriangle, CreditCard, LifeBuoy, Package, Truck } from 'lucide-react';

export const NOTIFICATION_ICON = { status: Package, assignment: Truck, payment: CreditCard, support: LifeBuoy, system: AlertTriangle };

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
/** "just now", "5 min ago", "yesterday", then a date. */
export function timeAgo(d, now = Date.now()) {
  const s = Math.round((new Date(d).getTime() - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 45) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute').replace(' minutes', ' min').replace(' minute', ' min');
  if (abs < 86_400) return rtf.format(Math.round(s / 3600), 'hour');
  if (abs < 7 * 86_400) return rtf.format(Math.round(s / 86_400), 'day');
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

/** Where "View all" goes for each role. */
export const notificationsPath = (role) => ({ customer: '/app/notifications', driver: '/driver/notifications', admin: '/admin/notifications' })[role] ?? '/';
