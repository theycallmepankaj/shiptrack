import { useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, Moon, Sun, User } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { ROLE_HOME, ROLE_LABEL } from '@/lib/roles';
import { initials } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function UserMenu() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    toast.success('You’ve been logged out');
    navigate('/login', { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full p-1 pr-2 transition-colors hover:bg-ink/5" aria-label="Account menu">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{initials(user.name)}</span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-[9rem] truncate text-sm font-semibold leading-tight">{user.name}</span>
          <span className="block text-[11px] leading-tight text-muted">{ROLE_LABEL[user.role]}</span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-muted sm:block" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <p className="text-sm font-semibold">{user.name}</p>
          <p className="truncate text-xs text-muted">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate(`${ROLE_HOME[user.role]}/profile`)}><User /> Profile</DropdownMenuItem>
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); toggle(); }}>
          {theme === 'dark' ? <Sun /> : <Moon />} {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onLogout} className="text-status-failed [&_svg]:text-status-failed"><LogOut /> Log out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
