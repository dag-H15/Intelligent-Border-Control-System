import { useState, useEffect } from 'react';
import { userService, type UserRecord } from '../services/userService';
import { auditService, formatAuditTimestamp, type AuditEvent } from '../services/auditService';
import api from '../services/api';
import { Users, Shield, ScrollText, Lock, AlertTriangle, ShieldAlert, Loader2, AlertCircle } from 'lucide-react';

interface Props {
  onGoUsers: () => void;
  onGoAudit: () => void;
  onGoSettings: () => void;
}

export function AdminDashboard({ onGoUsers, onGoAudit, onGoSettings }: Props) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [logs, setLogs] = useState<AuditEvent[]>([]);
  const [settings, setSettings] = useState({
    approvalThreshold: 95,
    reviewRangeMin: 85,
    reviewRangeMax: 94,
    sessionTimeout: 30,
    maxLoginAttempts: 5,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      userService.getUsers().catch(() => []),
      auditService.getLogs({ limit: 50 }).then((d) => d.auditLogs).catch(() => []),
      api.get('/settings').then((r) => r.data).catch(() => null),
    ])
      .then(([u, l, s]) => {
        setUsers(u);
        setLogs(l);
        if (s) {
          setSettings(s);
        }
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load dashboard data.');
        setLoading(false);
      });
  }, []);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todaysLogs = logs.filter((entry) => new Date(entry.timestamp) >= startOfToday);
  const officers = users.filter((u) => u.role === 'OFFICER').length;
  const supervisors = users.filter((u) => u.role === 'SUPERVISOR').length;
  const infoCount = todaysLogs.filter((l) => l.level === 'INFO').length;
  const warningCount = todaysLogs.filter((l) => l.level === 'WARNING').length;
  const criticalCount = todaysLogs.filter((l) => l.level === 'CRITICAL').length;
  const lockedAccounts = users.filter((u) => (u as any).isLocked).length;

  return (
    <div className="space-y-6">
      <div className="card bg-navy-800 text-white border-navy-700 p-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Administrator Console</h2>
          <p className="text-navy-300 text-sm mt-1">System administration · Security · Configuration</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-navy-300">
          <span className="h-2 w-2 rounded-full bg-accent-green animate-pulse" />
          All systems operational
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <AdminCard label="Total Users" value={users.length} icon={Users} tone="navy" onClick={onGoUsers} />
        <AdminCard label="Officers" value={officers} icon={Shield} tone="green" />
        <AdminCard label="Supervisors" value={supervisors} icon={Users} tone="blue" />
        <AdminCard label="Warning Events" value={warningCount} icon={AlertTriangle} tone="amber" onClick={onGoAudit} />
        <AdminCard label="Critical Events" value={criticalCount} icon={ShieldAlert} tone="red" onClick={onGoAudit} />
      </div>

      {lockedAccounts > 0 && (
        <div className="card bg-accent-red-soft border-red-200 p-4 flex items-center justify-between gap-3 text-sm text-accent-red">
          <div className="flex items-center gap-2 font-medium">
            <Lock size={16} /> Attention: {lockedAccounts} account(s) currently locked due to failed login attempts.
          </div>
          <button onClick={onGoUsers} className="btn-secondary text-xs border-red-300 text-accent-red hover:bg-red-100">
            View Users
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-navy-400">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading...
        </div>
      ) : error ? (
        <div className="flex items-center justify-center py-12 text-accent-red">
          <AlertCircle size={18} className="mr-2" /> {error}
        </div>
      ) : (
        <>
          {/* Quick actions + recent audit */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-navy-800 mb-4">Quick Actions</h3>
              <div className="space-y-2">
                <QuickAction icon={Users} label="Manage Users" onClick={onGoUsers} />
                <QuickAction icon={ScrollText} label="View Audit Logs" onClick={onGoAudit} />
                <QuickAction icon={Lock} label="Configure Threshold" onClick={onGoSettings} />
                <QuickAction icon={Shield} label="Security Settings" onClick={onGoSettings} />
              </div>
              <div className="mt-4 pt-4 border-t border-navy-100 space-y-2">
                <div className="text-xs text-navy-500 font-semibold uppercase tracking-wide">Audit Breakdown</div>
                <div className="flex justify-between text-xs text-navy-600">
                  <span>INFO Events:</span>
                  <span className="font-semibold text-navy-800">{infoCount}</span>
                </div>
                <div className="flex justify-between text-xs text-accent-amber font-medium">
                  <span>WARNING Events:</span>
                  <span className="font-semibold">{warningCount}</span>
                </div>
                <div className="flex justify-between text-xs text-accent-red font-medium">
                  <span>CRITICAL Events:</span>
                  <span className="font-semibold">{criticalCount}</span>
                </div>
              </div>
            </div>

            <div className="card p-5 lg:col-span-2">
              <h3 className="text-sm font-semibold text-navy-800 mb-4">Recent Audit Events</h3>
              <div className="space-y-3">
                {logs.slice(0, 7).map((l) => (
                  <div key={l.id} className="flex items-start gap-3">
                    <span
                      className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                        l.level === 'CRITICAL'
                          ? 'bg-accent-red'
                          : l.level === 'WARNING'
                          ? 'bg-accent-amber'
                          : 'bg-navy-400'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-navy-800 truncate">{l.action}</div>
                      <div className="text-xs text-navy-400">
                        {l.user?.name ?? 'System'} · {formatAuditTimestamp(l.timestamp)} · {l.ipAddress}
                      </div>
                    </div>
                  </div>
                ))}
                {logs.length === 0 && <div className="text-sm text-navy-400">No audit events.</div>}
              </div>
            </div>
          </div>

          {/* Threshold summary */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-navy-800 mb-4">Current Decision Thresholds</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ThresholdBox label="Auto Approval" value={`≥ ${settings.approvalThreshold}%`} tone="green" />
              <ThresholdBox
                label="Supervisor Review"
                value={`${settings.reviewRangeMin}–${settings.reviewRangeMax}%`}
                tone="amber"
              />
              <ThresholdBox label="Auto Rejection" value={`< ${settings.reviewRangeMin}%`} tone="red" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AdminCard({
  label,
  value,
  icon: Icon,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  icon: typeof Users;
  tone: 'navy' | 'green' | 'red' | 'blue' | 'amber';
  onClick?: () => void;
}) {
  const map = {
    navy: { bg: 'bg-navy-100', text: 'text-navy-700' },
    green: { bg: 'bg-accent-green-soft', text: 'text-accent-green' },
    amber: { bg: 'bg-accent-amber-soft', text: 'text-accent-amber' },
    red: { bg: 'bg-accent-red-soft', text: 'text-accent-red' },
    blue: { bg: 'bg-accent-blue-soft', text: 'text-accent-blue' },
  };
  const t = map[tone];
  return (
    <button onClick={onClick} className="card p-5 text-left hover:shadow-card-hover transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium text-navy-400 uppercase tracking-wide">{label}</div>
          <div className="mt-2 text-2xl font-bold text-navy-800">{value}</div>
        </div>
        <div className={`h-10 w-10 rounded-lg ${t.bg} ${t.text} flex items-center justify-center`}>
          <Icon size={20} />
        </div>
      </div>
    </button>
  );
}

function QuickAction({ icon: Icon, label, onClick }: { icon: typeof Users; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 rounded-lg border border-navy-100 px-3 py-2.5 text-sm text-navy-700 hover:bg-navy-50 transition-colors">
      <Icon size={16} className="text-navy-500" />
      {label}
    </button>
  );
}

function ThresholdBox({ label, value, tone }: { label: string; value: string; tone: 'green' | 'amber' | 'red' }) {
  const map = {
    green: 'border-green-200 bg-accent-green-soft text-accent-green',
    amber: 'border-amber-200 bg-accent-amber-soft text-accent-amber',
    red: 'border-red-200 bg-accent-red-soft text-accent-red',
  };
  return (
    <div className={`rounded-xl border p-4 ${map[tone]}`}>
      <div className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}
