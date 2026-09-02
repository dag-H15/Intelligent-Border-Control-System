import { ReactNode, useState, useEffect } from 'react';
import { SystemMark } from './Logo';
import api from '../services/api';
import {
  LayoutDashboard, Fingerprint, History, LogOut, Users, ScrollText, Shield,
  Settings, ClipboardCheck, FileBarChart, ChevronDown, UserPlus, Gavel, Bell,
} from 'lucide-react';
import type { Role } from '../types';

export type PageKey =
  | 'dashboard'
  | 'enrollment'
  | 'verify'
  | 'officer_manual_review'
  | 'history'
  | 'supervisor'
  | 'pending'
  | 'supervisor_manual_review'
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
    { key: 'officer_manual_review', label: 'Manual Review', icon: ClipboardCheck },
    { key: 'history', label: 'Verification History', icon: History },
  ],
  supervisor: [
    { key: 'supervisor', label: 'Supervisor Dashboard', icon: LayoutDashboard },
    { key: 'pending', label: 'Pending Review', icon: ClipboardCheck },
    { key: 'supervisor_manual_review', label: 'Manual Review', icon: Gavel },
    { key: 'reports', label: 'Reports', icon: FileBarChart },
  ],
  admin: [
    { key: 'admin', label: 'Admin Dashboard', icon: LayoutDashboard },
    { key: 'users', label: 'User Management', icon: Users },
    { key: 'reports', label: 'Reports', icon: FileBarChart },
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
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications');
      if (res.data?.notifications) {
        setNotifications(res.data.notifications);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  };

  useEffect(() => {
    if (role !== 'supervisor') return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000);
    return () => clearInterval(interval);
  }, [role]);

  const handleMarkRead = async (id: number) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (err) {
      console.error(err);
    }
  };
  return (
    <div className="flex h-screen overflow-hidden bg-navy-50">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 flex flex-col" style={{ backgroundColor: '#00301e' }}>
        <div className="px-5 py-5" style={{ borderBottom: '1px solid #0e5136' }}>
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
          <div className="rounded-lg px-3 py-2.5" style={{ backgroundColor: 'rgba(14,81,54,0.5)' }}>
            <div className="flex items-center gap-2 text-navy-300 text-[11px] font-medium uppercase tracking-wide">
              <Shield size={12} />
              Secure Session
            </div>
            <div className="mt-1 text-navy-200 text-[11px]">TLS 1.3 · Session Active</div>
          </div>
        </div>
        <div className="p-3" style={{ borderTop: '1px solid #0e5136' }}>
          <button onClick={onLogout} className="sidebar-link w-full text-navy-300 hover:text-[#ffdad6]">
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
          <div className="flex items-center gap-4">
            {role === 'supervisor' && (
              <div className="relative">
                <button
                  onClick={() => setNotifOpen(!notifOpen)}
                  className="relative p-2 text-navy-400 hover:text-navy-600 rounded-lg hover:bg-navy-50"
                >
                  <Bell size={20} />
                  {notifications.filter(n => !n.isRead).length > 0 && (
                    <span className="absolute top-1.5 right-1.5 h-4 w-4 rounded-full bg-accent-red text-[9px] font-bold text-white flex items-center justify-center">
                      {notifications.filter(n => !n.isRead).length}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-80 rounded-xl bg-white border border-navy-100 shadow-card py-2 z-50 max-h-96 overflow-y-auto">
                    <div className="flex items-center justify-between px-4 pb-2 border-b border-navy-50">
                      <span className="text-xs font-bold text-navy-800">Notifications</span>
                      {notifications.filter(n => !n.isRead).length > 0 && (
                        <button
                          onClick={handleMarkAllRead}
                          className="text-[10px] font-semibold text-accent-blue hover:text-accent-blue/80"
                        >
                          Mark all as read
                        </button>
                      )}
                    </div>
                    <div className="divide-y divide-navy-50">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-6 text-center text-xs text-navy-400">No notifications</div>
                      ) : (
                        notifications.map((n) => (
                          <button
                            key={n.id}
                            onClick={() => {
                              handleMarkRead(n.id);
                              setNotifOpen(false);
                              onNavigate('pending');
                            }}
                            className={`w-full p-3 text-left transition-colors hover:bg-navy-50/50 flex gap-2.5 items-start ${
                              !n.isRead ? 'bg-navy-50/20' : ''
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1.5">
                                <span className={`text-xs font-bold ${!n.isRead ? 'text-navy-800' : 'text-navy-500'}`}>
                                  {n.title}
                                </span>
                              </div>
                              <p className="text-[11px] text-navy-500 mt-0.5 leading-tight">{n.message}</p>
                              <span className="text-[9px] text-navy-400 mt-1 block">
                                {new Date(n.createdAt).toLocaleTimeString()}
                              </span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

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
