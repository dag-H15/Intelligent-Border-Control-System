import type { ReactNode } from 'react';
import { SystemMark } from './Logo';
import {
  LayoutDashboard, Fingerprint, History, LogOut, Users, ScrollText, Shield,
  Settings, ClipboardCheck, FileBarChart, ChevronDown, UserPlus,
} from 'lucide-react';
import type { Role } from '../types';

export type PageKey =
  | 'dashboard'
  | 'enrollment'
  | 'verify'
  | 'history'
  | 'supervisor'
  | 'pending'
  | 'reports'
  | 'admin'
  | 'users'
  | 'audit'
  | 'settings';

interface NavItem { key: PageKey; label: string; icon: typeof LayoutDashboard; }

const navByRole: Record<Role, NavItem[]> = {
  officer: [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'enrollment', label: 'Enrollment', icon: UserPlus },
    { key: 'verify', label: 'Verify Traveler', icon: Fingerprint },
    { key: 'history', label: 'Verification History', icon: History },
  ],
  supervisor: [
    { key: 'supervisor', label: 'Supervisor Dashboard', icon: LayoutDashboard },
    { key: 'pending', label: 'Pending Review', icon: ClipboardCheck },
    { key: 'reports', label: 'Reports', icon: FileBarChart },
  ],
  admin: [
    { key: 'admin', label: 'Admin Dashboard', icon: LayoutDashboard },
    { key: 'users', label: 'User Management', icon: Users },
    { key: 'audit', label: 'Audit Logs', icon: ScrollText },
    { key: 'settings', label: 'System Settings', icon: Settings },
  ],
};

const roleLabel: Record<Role, string> = {
  officer: 'Border Officer',
  supervisor: 'Supervisor',
  admin: 'Administrator',
};

interface ShellProps {
  role: Role;
  userName: string;
  active: PageKey;
  onNavigate: (page: PageKey) => void;
  onLogout: () => void;
  children: ReactNode;
}

export function AppShell({ role, userName, active, onNavigate, onLogout, children }: ShellProps) {
  const items = navByRole[role];
  return (
    <div className="flex h-screen overflow-hidden bg-navy-50">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-navy-900 flex flex-col">
        <div className="px-5 py-5 border-b border-navy-800">
          <SystemMark />
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.key;
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className={`sidebar-link w-full ${isActive ? 'sidebar-link-active' : ''}`}
              >
                <Icon size={18} strokeWidth={2} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="px-3 pb-3">
          <div className="rounded-lg bg-navy-800/60 px-3 py-2.5">
            <div className="flex items-center gap-2 text-navy-300 text-[11px] font-medium uppercase tracking-wide">
              <Shield size={12} />
              Secure Session
            </div>
            <div className="mt-1 text-navy-200 text-[11px]">TLS 1.3 · Session Active</div>
          </div>
        </div>
        <div className="border-t border-navy-800 p-3">
          <button onClick={onLogout} className="sidebar-link w-full text-navy-300 hover:text-accent-red">
            <LogOut size={18} strokeWidth={2} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-16 shrink-0 bg-white border-b border-navy-100 flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <h1 className="text-navy-800 font-semibold text-base">
              {items.find((i) => i.key === active)?.label ?? 'Dashboard'}
            </h1>
            <span className="badge-neutral ml-2">{roleLabel[role]}</span>
          </div>
          <div className="flex items-center gap-2.5 pl-2 border-l border-navy-100">
            <div className="h-9 w-9 rounded-full bg-navy-700 text-white flex items-center justify-center text-xs font-semibold">
              {userName.split(' ').slice(-1)[0].slice(0, 2).toUpperCase()}
            </div>
            <div className="hidden md:block leading-tight">
              <div className="text-sm font-semibold text-navy-800">{userName}</div>
              <div className="text-[11px] text-navy-400">{roleLabel[role]}</div>
            </div>
            <ChevronDown size={14} className="text-navy-300 hidden md:block" />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1600px] px-6 py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
