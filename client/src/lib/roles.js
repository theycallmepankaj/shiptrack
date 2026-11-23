import { Bell, Boxes, FileText, History, LayoutDashboard, Map, Package, PackagePlus, Route, ShieldCheck, Truck, User, Users, Wallet } from 'lucide-react';

export const ROLE_HOME = { customer: '/app', driver: '/driver', admin: '/admin' };
export const ROLE_LABEL = { customer: 'Customer', driver: 'Driver', admin: 'Admin' };

export const NAV = {
  customer: [
    { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/app/book', label: 'Book shipment', icon: PackagePlus },
    { to: '/app/shipments', label: 'My shipments', icon: Package },
    { to: '/app/notifications', label: 'Notifications', icon: Bell },
    { to: '/app/profile', label: 'Profile', icon: User },
  ],
  driver: [
    { to: '/driver', label: 'Today', icon: Route, end: true },
    { to: '/driver/history', label: 'History', icon: History },
    { to: '/driver/profile', label: 'Profile', icon: User },
  ],
  admin: [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/fleet', label: 'Live fleet', icon: Map },
    { to: '/admin/shipments', label: 'Shipments', icon: Boxes },
    { to: '/admin/drivers', label: 'Drivers', icon: Truck },
    { to: '/admin/pricing', label: 'Pricing', icon: Wallet },
    { to: '/admin/documents', label: 'Chatbot docs', icon: FileText },
    { to: '/admin/team', label: 'Team', icon: ShieldCheck },
    { to: '/admin/profile', label: 'Profile', icon: Users },
  ],
};

/** Only follow a post-login redirect if it belongs to the user's own area. */
export function safeRedirect(from, role) {
  const home = ROLE_HOME[role] ?? '/';
  return typeof from === 'string' && (from === home || from.startsWith(`${home}/`)) ? from : home;
}
