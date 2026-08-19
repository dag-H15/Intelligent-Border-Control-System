import { useState, useEffect } from 'react';
import { auditService } from '../services/auditService';
import {
  Search, Filter, Info, ShieldAlert, AlertTriangle, Calendar, Loader2,
  AlertCircle, LogIn, Gavel, UserPlus, Fingerprint, User, Shield, X,
  Clock, Monitor,
} from 'lucide-react';

interface AuditEntry {
  id: number;
  userId: number | null;
  action: string;
  level: 'INFO' | 'WARNING' | 'CRITICAL';
  ipAddress: string;
  timestamp: string;
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
  } | null;
}

export function ProfessionalAuditLogsPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>(undefined);
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [severity, setSeverity] = useState<'all' | 'INFO' | 'WARNING' | 'CRITICAL'>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7d' | '30d'>('all');
  const [users, setUsers] = useState<Array<{ id: number; name: string; role: string }>>([]);
  const [selectedLog, setSelectedLog] = useState<number | null>(null);
  const [detailData, setDetailData] = useState<AuditEntry | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    loadAuditLogs();
  }, []);

  const loadAuditLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await auditService.getLogs();
      setLogs(data);
      const uniqueUsers = new Map<number, { id: number; name: string; role: string }>();
      data.forEach((log) => {
        if (log.user && !uniqueUsers.has(log.user.id)) {
          uniqueUsers.set(log.user.id, { id: log.user.id, name: log.user.name, role: log.user.role });
        }
      });
      setUsers(Array.from(uniqueUsers.values()).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      setError('Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  };

  const filtered = logs.filter((l) => {
    const searchText = query.toLowerCase();
    const matchesQuery = !searchText || l.action.toLowerCase().includes(searchText) ||
      (l.user?.name || 'System').toLowerCase().includes(searchText) || l.ipAddress.includes(searchText);
    const matchesUser = !selectedUserId || l.userId === selectedUserId;
    const matchesRole = selectedRole === 'all' || l.user?.role === selectedRole;
    const matchesSeverity = severity === 'all' || l.level === severity;
    
    const action = l.action.toLowerCase();
    const matchesAction = actionFilter === 'all' ||
      (actionFilter === 'login' && action.includes('login')) ||
      (actionFilter === 'logout' && action.includes('logout')) ||
      (actionFilter === 'verification' && action.includes('verification')) ||
      (actionFilter === 'enrollment' && action.includes('enrollment')) ||
      (actionFilter === 'override' && action.includes('override')) ||
      (actionFilter === 'manual_review' && (action.includes('manual review') || action.includes('manual_review'))) ||
      (actionFilter === 'threshold' && action.includes('threshold')) ||
      (actionFilter === 'checkpoint' && action.includes('checkpoint')) ||
      (actionFilter === 'user_management' && action.includes('user'));

    const recDate = new Date(l.timestamp);
    const now = new Date();
    let matchesDate = true;
    if (dateFilter === 'today') {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      matchesDate = recDate >= startOfToday;
    } else if (dateFilter === '7d') matchesDate = now.getTime() - recDate.getTime() < 7 * 86400000;
    else if (dateFilter === '30d') matchesDate = now.getTime() - recDate.getTime() < 30 * 86400000;

    return matchesQuery && matchesUser && matchesRole && matchesSeverity && matchesAction && matchesDate;
  });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todaysLogs = logs.filter((entry) => new Date(entry.timestamp) >= startOfToday);

  const openDetail = async (logId: number) => {
    setSelectedLog(logId);
    setDetailLoading(true);
    try {
      const detail = await auditService.getLogDetail(logId);
      setDetailData(detail);
    } catch (err) {
      console.error('Failed to load audit detail:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-navy-800">Audit Logs</h2>
        <p className="text-sm text-navy-400">Immutable record of all system actions and security events · Read-only</p>
      </div>

      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={18} className="text-navy-700" />
          <h3 className="text-sm font-semibold text-navy-800">Filter Audit Logs</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-2">
            <label className="label">Search</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-300" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search user, action, IP..." className="input pl-10" />
            </div>
          </div>
          <div>
            <label className="label">User</label>
            <select value={selectedUserId ?? ''} onChange={(e) => setSelectedUserId(e.target.value ? Number(e.target.value) : undefined)} className="input">
              <option value="">All Users</option>
              {users.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
            </select>
          </div>
          <div>
            <label className="label">Role</label>
            <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)} className="input">
              <option value="all">All Roles</option>
              <option value="OFFICER">Officer</option>
              <option value="SUPERVISOR">Supervisor</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div>
            <label className="label">Action Type</label>
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="input">
              <option value="all">All Actions</option>
              <option value="login">Login</option>
              <option value="logout">Logout</option>
              <option value="verification">Verification</option>
              <option value="enrollment">Enrollment</option>
              <option value="override">Override</option>
              <option value="manual_review">Manual Review</option>
              <option value="threshold">Threshold</option>
              <option value="checkpoint">Checkpoint</option>
              <option value="user_management">User Management</option>
            </select>
          </div>
          <div>
            <label className="label">Severity</label>
            <select value={severity} onChange={(e) => setSeverity(e.target.value as any)} className="input">
              <option value="all">All Levels</option>
              <option value="INFO">INFO</option>
              <option value="WARNING">WARNING</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
          </div>
          <div>
            <label className="label">Date Range</label>
            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value as any)} className="input">
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={() => { setQuery(''); setSelectedUserId(undefined); setSelectedRole('all'); setSeverity('all'); setActionFilter('all'); setDateFilter('all'); }} className="btn-secondary w-full">
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <SevCard label="Events Today" count={todaysLogs.length} icon={Info} tone="navy" />
        <SevCard label="Logins Today" count={todaysLogs.filter((l) => /login/i.test(l.action)).length} icon={LogIn} tone="amber" />
        <SevCard label="Overrides Today" count={todaysLogs.filter((l) => /override/i.test(l.action)).length} icon={Gavel} tone="red" />
        <SevCard label="Enrollments Today" count={todaysLogs.filter((l) => /enrollment/i.test(l.action)).length} icon={UserPlus} tone="navy" />
        <SevCard label="Verifications Today" count={todaysLogs.filter((l) => /verification/i.test(l.action)).length} icon={Fingerprint} tone="amber" />
      </div>

      {error && (<div className="card bg-accent-red-soft border-red-200 p-4 flex items-center gap-2 text-sm text-accent-red"><AlertCircle size={16} /> {error}</div>)}

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-navy-100">
          <h3 className="text-sm font-semibold text-navy-800">Audit Event Log</h3>
          <p className="text-xs text-navy-400 mt-0.5">Click any row to view complete event details</p>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-navy-400"><Loader2 size={20} className="animate-spin mr-2" /> Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-navy-400 text-sm">No logs match your filters.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-navy-50">
                <tr>
                  <th className="table-header px-4 py-3">Timestamp</th>
                  <th className="table-header px-4 py-3">User</th>
                  <th className="table-header px-4 py-3">Role</th>
                  <th className="table-header px-4 py-3">Action</th>
                  <th className="table-header px-4 py-3">IP Address</th>
                  <th className="table-header px-4 py-3">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {filtered.map((l) => (
                  <tr key={l.id} onClick={() => openDetail(l.id)} className="hover:bg-navy-50/60 transition-colors cursor-pointer">
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-navy-600">{new Date(l.timestamp).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-navy-800">{l.user?.name || 'System'}</div>
                      {l.user && <div className="text-xs text-navy-400">{l.user.email}</div>}
                    </td>
                    <td className="px-4 py-3"><span className="badge-neutral text-xs">{l.user?.role || 'SYSTEM'}</span></td>
                    <td className="px-4 py-3 text-navy-600 max-w-md truncate">{l.action}</td>
                    <td className="px-4 py-3 font-mono text-xs text-navy-600">{l.ipAddress}</td>
                    <td className="px-4 py-3">
                      {l.level === 'CRITICAL' ? (<span className="badge-rejected"><ShieldAlert size={12} /> CRITICAL</span>)
                        : l.level === 'WARNING' ? (<span className="badge-pending"><AlertTriangle size={12} /> WARNING</span>)
                        : (<span className="badge-neutral"><Info size={12} /> INFO</span>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {!loading && (
          <div className="px-5 py-4 border-t border-navy-100 flex items-center justify-between">
            <span className="text-xs text-navy-400">{filtered.length} of {logs.length} entries · Logs retained for 365 days per compliance policy</span>
            <span className="text-xs text-navy-500 font-semibold uppercase tracking-wide flex items-center gap-1.5"><Shield size={12} /> Read-Only</span>
          </div>
        )}
      </div>

      {selectedLog && (<AuditDetailDrawer isOpen={!!selectedLog} onClose={() => { setSelectedLog(null); setDetailData(null); }} loading={detailLoading} data={detailData} />)}
    </div>
  );
}

function SevCard({ label, count, icon: Icon, tone }: { label: string; count: number; icon: any; tone: 'navy' | 'amber' | 'red' }) {
  const map = { navy: { bg: 'bg-navy-100', text: 'text-navy-700' }, amber: { bg: 'bg-accent-amber-soft', text: 'text-accent-amber' }, red: { bg: 'bg-accent-red-soft', text: 'text-accent-red' } };
  const t = map[tone];
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={`h-11 w-11 rounded-lg ${t.bg} ${t.text} flex items-center justify-center shrink-0`}><Icon size={20} /></div>
      <div>
        <div className="text-xs text-navy-400 uppercase tracking-wide font-medium">{label}</div>
        <div className="text-2xl font-bold text-navy-800">{count}</div>
      </div>
    </div>
  );
}

function AuditDetailDrawer({ isOpen, onClose, loading, data }: { isOpen: boolean; onClose: () => void; loading: boolean; data: AuditEntry | null }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
      <div className="bg-white w-full max-w-2xl h-full overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-navy-100 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-semibold text-navy-800">Audit Event Detail</h2>
            <p className="text-xs text-navy-400 mt-0.5">Complete event information · Read-only record</p>
          </div>
          <button onClick={onClose} className="btn-secondary"><X size={16} /> Close</button>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-navy-400 mr-3" /><span className="text-navy-600">Loading event details...</span></div>
          ) : data ? (
            <div className="space-y-6">
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-navy-800 mb-4 pb-2 border-b border-navy-100">Event Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <AuditField label="Event ID" value={`#${data.id}`} mono />
                  <AuditField label="Timestamp" value={new Date(data.timestamp).toLocaleString()} icon={Clock} />
                  <AuditField label="Severity" value={data.level} badge badgeColor={data.level === 'CRITICAL' ? 'red' : data.level === 'WARNING' ? 'amber' : 'blue'} />
                  <AuditField label="IP Address" value={data.ipAddress} icon={Monitor} mono />
                </div>
                <div className="mt-4"><AuditField label="Action Description" value={data.action} /></div>
              </div>
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-navy-800 mb-4 pb-2 border-b border-navy-100">User Information</h3>
                {data.user ? (
                  <div className="grid grid-cols-2 gap-4">
                    <AuditField label="Name" value={data.user.name} icon={User} />
                    <AuditField label="Email" value={data.user.email} />
                    <AuditField label="Role" value={data.user.role} badge badgeColor="navy" />
                    <AuditField label="User ID" value={`#${data.user.id}`} mono />
                  </div>
                ) : (<div className="text-sm text-navy-500 py-2"><Info size={14} className="inline mr-2" />System-initiated action (no user associated)</div>)}
              </div>
              <div className="card p-5 bg-blue-50 border-blue-200">
                <div className="flex items-start gap-3">
                  <Shield size={18} className="text-blue-700 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-sm font-semibold text-blue-900">Audit Log Immutability</h4>
                    <p className="text-xs text-blue-700 mt-1">This is a read-only audit record. Audit logs cannot be modified or deleted to maintain system integrity and compliance. All events are permanently retained for 365 days per organizational policy.</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (<div className="text-center py-12 text-navy-400">No data available</div>)}
        </div>
      </div>
    </div>
  );
}

function AuditField({ label, value, icon: Icon, mono, badge, badgeColor }: { label: string; value: string; icon?: any; mono?: boolean; badge?: boolean; badgeColor?: 'navy' | 'blue' | 'amber' | 'red' }) {
  return (
    <div>
      <div className="text-xs text-navy-400 uppercase tracking-wide font-medium mb-1 flex items-center gap-1.5">{Icon && <Icon size={12} />}{label}</div>
      {badge ? (
        <span className={`inline-block text-xs font-bold px-2 py-1 rounded ${badgeColor === 'red' ? 'bg-accent-red-soft text-accent-red' : badgeColor === 'amber' ? 'bg-accent-amber-soft text-accent-amber' : badgeColor === 'navy' ? 'bg-navy-100 text-navy-700' : 'bg-blue-100 text-blue-700'}`}>{value}</span>
      ) : (<div className={`text-sm font-medium text-navy-800 ${mono ? 'font-mono' : ''}`}>{value}</div>)}
    </div>
  );
}
