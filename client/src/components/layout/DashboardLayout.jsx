import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react';
import { Logo, LogoMark } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { NAV } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { CommandPalette } from './CommandPalette';
import { NotificationBell } from './NotificationBell';
import { UserMenu } from './UserMenu';
import { ChatWidget } from '@/components/chat/ChatWidget';

function readCollapsed() {
  try { return localStorage.getItem('sidebar-collapsed') === '1'; } catch { return false; }
}

export function DashboardLayout({ role }) {
  const items = NAV[role];
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();
  const isDriver = role === 'driver';
  const fullBleed = location.pathname.endsWith('/fleet'); // map pages fill the content area

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => {
    try { localStorage.setItem('sidebar-collapsed', collapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [collapsed]);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border bg-surface transition-[width] duration-300 lg:flex',
          collapsed ? 'w-[76px]' : 'w-64',
        )}
      >
        <div className={cn('flex h-16 items-center border-b border-border', collapsed ? 'justify-center' : 'px-5')}>
          {collapsed ? <LogoMark /> : <Logo />}
        </div>
        <SidebarNav items={items} collapsed={collapsed} />
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="m-3 flex items-center justify-center gap-2 rounded-[10px] px-3 py-2 text-sm text-muted transition-colors hover:bg-ink/5 hover:text-ink"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <><PanelLeftClose className="h-4 w-4" /> <span className="flex-1 text-left">Collapse</span></>}
        </button>
      </aside>

      {/* Mobile drawer (customer/admin; drivers use the bottom nav) */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-navy-900/40 backdrop-blur-sm lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-surface shadow-lift lg:hidden"
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              aria-label="Navigation"
            >
              <div className="flex h-16 items-center justify-between border-b border-border px-5">
                <Logo />
                <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu" className="grid h-9 w-9 place-items-center rounded-full hover:bg-ink/5"><X className="h-5 w-5" /></button>
              </div>
              <SidebarNav items={items} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className={cn('transition-[padding] duration-300', collapsed ? 'lg:pl-[76px]' : 'lg:pl-64')}>
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur-xl sm:px-6">
          {!isDriver && (
            <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open menu" className="grid h-10 w-10 place-items-center rounded-full hover:bg-ink/5 lg:hidden">
              <Menu className="h-5 w-5" />
            </button>
          )}
          {isDriver && <span className="lg:hidden"><LogoMark /></span>}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-10 flex-1 items-center gap-2 rounded-[10px] border border-border bg-background px-3 text-sm text-muted transition-colors hover:border-ink/20 sm:max-w-sm"
          >
            <Search className="h-4 w-4" aria-hidden />
            <span className="flex-1 truncate text-left">Search pages…</span>
            <kbd className="hidden rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] sm:inline">⌘K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle className="hidden text-ink hover:bg-ink/5 sm:grid" />
            <NotificationBell />
            <UserMenu />
          </div>
        </header>

        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className={cn(fullBleed ? '' : 'mx-auto max-w-7xl p-4 sm:p-6 lg:p-8', isDriver && 'pb-28 lg:pb-8')}
        >
          <Outlet />
        </motion.main>
      </div>

      {/* Driver bottom navigation (mobile-first, §11.4) */}
      {isDriver && (
        <nav aria-label="Driver" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
          <ul className="grid grid-cols-3">
            {items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => cn('flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium', isActive ? 'text-primary-text' : 'text-muted')}
                >
                  <item.icon className="h-5 w-5" aria-hidden /> {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <CommandPalette items={items} open={paletteOpen} onOpenChange={setPaletteOpen} />
      {role === 'customer' && <ChatWidget />}
    </div>
  );
}

function SidebarNav({ items, collapsed = false }) {
  return (
    <nav className="flex-1 overflow-y-auto p-3" aria-label="Sidebar">
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-colors',
                  collapsed && 'justify-center px-0',
                  isActive ? 'bg-primary/10 text-ink' : 'text-muted hover:bg-ink/5 hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="nav-active" className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-primary" />}
                  <item.icon className={cn('h-[18px] w-[18px] shrink-0', isActive && 'text-primary-text')} aria-hidden />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {collapsed && <span className="sr-only">{item.label}</span>}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
