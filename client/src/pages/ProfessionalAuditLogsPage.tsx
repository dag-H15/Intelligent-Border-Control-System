import { useState, useEffect, useCallback } from 'react';
import { auditService, formatAuditTimestamp, type AuditEvent, type AuditPagination, type AuditStats } from '../services/auditService';
import { userService } from '../services/userService';
import {
  Search, Filter, Info, ShieldAlert, AlertTriangle, Calendar, Loader2,
  AlertCircle, LogIn, Gavel, UserPlus, Fingerprint, User, Shield, X,
  Clock, Monitor, Download, RefreshCw, ArrowRight, FileText, Database,
} from 'lucide-react';

type DateFilterKey = 'all' | 'today' | '7d' | '30d';

/** Local-timezone date range for each preset, sent to the API as ISO strings. */
function dateRangeFor(key: DateFilterKey): { startDate?: string; endDate?: string } {
  if (key === 'today') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return { startDate: start.toISOString(), endDate: new Date().toISOString() };
  }
  if (key === '7d' || key === '30d') {
    const days = key === '7d' ? 6 : 29;
    const start = new Date();
    start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);
    return { startDate: start.toISOString(), endDate: new Date().toISOString() };
  }
  return {};
}

const ACTION_TYPES: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All Actions' },
  { value: 'login', label: 'Authentication' },
  { value: 'logout', label: 'Logout' },
  { value: 'verification', label: 'Verification' },
  { value: 'enrollment', label: 'Enrollment' },
  { value: 'override', label: 'Override' },
  { value: 'manual_review', label: 'Manual Review' },
  { value: 'settings', label: 'Threshold & Settings' },
  { value: 'checkpoint', label: 'Checkpoint' },
  { value: 'user_management', label: 'User Management' },
  { value: 'report', label: 'Reports' },
  { value: 'watchlist', label: 'Watchlist / Alert' },
  { value: 'lookup', label: 'Traveler Lookup' },
];

const RESULTS: Array<{ value: string; label: string }> = [
  { value: 'SUCCESS', label: 'SUCCESS' },
  { value: 'FAILED', label: 'FAILED' },
  { value: 'VERIFIED', label: 'VERIFIED' },
  { value: 'REJECTED', label: 'REJECTED' },
  { value: 'PENDING', label: 'PENDING' },
  { value: 'APPROVED', label: 'APPROVED' },
  { value: 'DENIED', label: 'DENIED' },
];

function severityBadge(level: string) {
  if (level === 'CRITICAL') return <span className="badge-rejected"><ShieldAlert size={12} /> CRITICAL</span>;
  if (level === 'WARNING') return <span className="badge-pending"><AlertTriangle size={12} /> WARNING</span>;
  return <span className="badge-neutral"><Info size={12} /> INFO</span>;
}

function resultBadge(result: string | null) {
  if (!result) return <span className="badge-neutral">—</span>;
  const cls =
    result === 'VERIFIED' || result === 'APPROVED' || result === 'SUCCESS'
      ? 'badge-verified'
      : result === 'FAILED' || result === 'REJECTED' || result === 'DENIED'
        ? 'badge-rejected'
        : 'badge-pending';
  return <span className={cls}>{result}</span>;
}

export function ProfessionalAuditLogsPage() {
  // Filter state
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>(undefined);
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [severity, setSeverity] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [resultFilter, setResultFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<DateFilterKey>('all');
  const [page, setPage] = useState(1);

  // Data state
  const [logs, setLogs] = useState<AuditEvent[]>([]);
  const [pagination, setPagination] = useState<AuditPagination | null>(null);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [users, setUsers] = useState<Array<{ id: number; name: string; role: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  // Detail drawer state
  const [selectedLog, setSelectedLog] = useState<number | null>(null);
  const [detailData, setDetailData] = useState<AuditEvent | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Debounce the search box so typing doesn't spam the API
  useEffect(() => {
    const t = setTimeout(() => setQuery(queryInput.trim()), 350);
    return () => clearTimeout(t);
  }, [queryInput]);

  const loadAuditLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await auditService.getLogs({
        q: query || undefined,
        userId: selectedUserId,
        role: selectedRole,
        actionType: actionFilter,
        level: severity,
        result: resultFilter,
        ...dateRangeFor(dateFilter),
        page,
        limit: 20,
      });
      setLogs(data.auditLogs);
      setPagination(data.pagination);
    } catch (err) {
      setError('Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  }, [query, selectedUserId, selectedRole, severity, actionFilter, resultFilter, dateFilter, page]);

  const loadStats = useCallback(async () => {
    try {
      setStats(await auditService.getStats());
    } catch {
      // Summary cards are non-critical; leave previous values in place.
    }
  }, []);

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs]);

  useEffect(() => {
    loadStats();
    userService
      .getUsers()
      .then((us) =>
        setUsers(us.map((u) => ({ id: Number(u.id), name: u.name, role: u.role })).sort((a, b) => a.name.localeCompare(b.name)))
      )
      .catch(() => setUsers([]));
  }, [loadStats]);

  const resetPage = () => setPage(1);

  const handleExport = async () => {
    setExporting(true);
    try {
      await auditService.exportCsv({
        q: query || undefined,
        userId: selectedUserId,
        role: selectedRole,
        actionType: actionFilter,
        level: severity,
        result: resultFilter,
        ...dateRangeFor(dateFilter),
      });
    } catch {
      alert('Failed to export audit logs.');
    } finally {
      setExporting(false);
    }
  };

  const openDetail = async (logId: number) => {
    setSelectedLog(logId);
    setDetailData(null);
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

  const rangeLabel =
    pagination && pagination.total > 0
      ? `${(pagination.page - 1) * pagination.limit + 1}–${Math.min(pagination.page * pagination.limit, pagination.total)}`
      : '0';

  /** Compact page-number window for the pagination footer. */
  const pageWindow = (): number[] => {
    if (!pagination) return [];
    const total = pagination.totalPages;
    const current = pagination.page;
    const from = Math.max(1, Math.min(current - 2, total - 4));
    const to = Math.min(total, from + 4);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-navy-800">Audit Logs</h2>
        <p className="text-sm text-navy-400">Immutable record of all system actions and security events · Read-only</p>
      </div>

      {/* Filters */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-navy-700" />
            <h3 className="text-sm font-semibold text-navy-800">Filter Audit Logs</h3>
          </div>
          <button onClick={handleExport} disabled={exporting} className="btn-secondary text-sm">
            {exporting ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Exporting...
              </>
            ) : (
              <>
                <Download size={15} /> Export CSV
              </>
            )}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-2">
            <label className="label">Search</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-300" />
              <input value={queryInput} onChange={(e) => { setQueryInput(e.target.value); resetPage(); }} placeholder="Search user, action, IP..." className="input pl-10" />
            </div>
          </div>
          <div>
            <label className="label">User</label>
            <select value={selectedUserId ?? ''} onChange={(e) => { setSelectedUserId(e.target.value ? Number(e.target.value) : undefined); resetPage(); }} className="input">
              <option value="">All Users</option>
              {users.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
            </select>
          </div>
          <div>
            <label className="label">Role</label>
            <select value={selectedRole} onChange={(e) => { setSelectedRole(e.target.value); resetPage(); }} className="input">
              <option value="all">All Roles</option>
              <option value="OFFICER">Officer</option>
              <option value="SUPERVISOR">Supervisor</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div>
            <label className="label">Action Type</label>
            <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); resetPage(); }} className="input">
              {ACTION_TYPES.map((a) => (<option key={a.value} value={a.value}>{a.label}</option>))}
            </select>
          </div>
          <div>
            <label className="label">Severity</label>
            <select value={severity} onChange={(e) => { setSeverity(e.target.value); resetPage(); }} className="input">
              <option value="all">All Levels</option>
              <option value="INFO">INFO</option>
              <option value="WARNING">WARNING</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
          </div>
          <div>
            <label className="label">Result</label>
            <select value={resultFilter} onChange={(e) => { setResultFilter(e.target.value); resetPage(); }} className="input">
              <option value="all">All Results</option>
              {RESULTS.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
            </select>
          </div>
          <div>
            <label className="label">Date Range</label>
            <select value={dateFilter} onChange={(e) => { setDateFilter(e.target.value as DateFilterKey); resetPage(); }} className="input">
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={() => { setQueryInput(''); setSelectedUserId(undefined); setSelectedRole('all'); setSeverity('all'); setActionFilter('all'); setResultFilter('all'); setDateFilter('all'); setPage(1); }} className="btn-secondary w-full">
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* Summary cards — real counts from the database */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <SevCard label="Events Today" count={stats?.eventsToday ?? 0} icon={Info} tone="navy" />
        <SevCard label="Logins Today" count={stats?.loginsToday ?? 0} icon={LogIn} tone="amber" />
        <SevCard label="Overrides Today" count={stats?.overridesToday ?? 0} icon={Gavel} tone="red" />
        <SevCard label="Enrollments Today" count={stats?.enrollmentsToday ?? 0} icon={UserPlus} tone="navy" />
        <SevCard label="Verifications Today" count={stats?.verificationsToday ?? 0} icon={Fingerprint} tone="amber" />
      </div>

      {error && (<div className="card bg-accent-red-soft border-red-200 p-4 flex items-center gap-2 text-sm text-accent-red"><AlertCircle size={16} /> {error}</div>)}

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-navy-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-navy-800">Audit Event Log</h3>
            <p className="text-xs text-navy-400 mt-0.5">Click any row to view complete event details</p>
          </div>
          <button onClick={() => { loadAuditLogs(); loadStats(); }} className="btn-secondary text-xs" title="Refresh audit log">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-navy-400"><Loader2 size={20} className="animate-spin mr-2" /> Loading...</div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-navy-400 text-sm">No logs match your filters.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-navy-50">
                <tr>
                  <th className="table-header px-4 py-3">Timestamp</th>
                  <th className="table-header px-4 py-3">User</th>
                  <th className="table-header px-4 py-3">Role</th>
                  <th className="table-header px-4 py-3">Action</th>
                  <th className="table-header px-4 py-3">Result</th>
                  <th className="table-header px-4 py-3">IP Address</th>
                  <th className="table-header px-4 py-3">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {logs.map((l) => (
                  <tr key={l.id} onClick={() => openDetail(l.id)} className="hover:bg-navy-50/60 transition-colors cursor-pointer">
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-navy-600">{formatAuditTimestamp(l.timestamp)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-navy-800">{l.user?.name || 'System'}</div>
                      {l.user && <div className="text-xs text-navy-400">{l.user.email}</div>}
                    </td>
                    <td className="px-4 py-3"><span className="badge-neutral text-xs">{l.user?.role || 'SYSTEM'}</span></td>
                    <td className="px-4 py-3 text-navy-600 max-w-md truncate" title={l.description ?? l.action}>{l.action}</td>
                    <td className="px-4 py-3">{resultBadge(l.result)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-navy-600">{l.ipAddress || '-'}</td>
                    <td className="px-4 py-3">{severityBadge(l.level)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {!loading && pagination && (
          <div className="px-5 py-4 border-t border-navy-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs text-navy-400">
              Showing {rangeLabel} of {pagination.total} entries · Logs retained for 365 days per compliance policy
            </span>
            {pagination.totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pagination.page <= 1} className="btn-secondary text-xs px-2.5 py-1.5 disabled:opacity-40">Previous</button>
                {pageWindow().map((p) => (
                  <button key={p} onClick={() => setPage(p)} className={`h-7 w-7 rounded text-xs font-semibold transition-colors ${p === pagination.page ? 'bg-navy-700 text-white' : 'text-navy-600 hover:bg-navy-100'}`}>{p}</button>
                ))}
                <button onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))} disabled={pagination.page >= pagination.totalPages} className="btn-secondary text-xs px-2.5 py-1.5 disabled:opacity-40">Next</button>
              </div>
            )}
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

/** Pretty-print metadata keys like "finalScore" → "Final Score". */
function humanizeKey(key: string): string {
  const special: Record<string, string> = {
    fan: 'FAN',
    id: 'ID',
    ip: 'IP',
    fp: 'FP',
  };
  const spaced = key.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').trim();
  return spaced
    .split(' ')
    .map((word) => special[word.toLowerCase()] ?? word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function renderMetadataValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function AuditDetailDrawer({ isOpen, onClose, loading, data }: { isOpen: boolean; onClose: () => void; loading: boolean; data: AuditEvent | null }) {
  if (!isOpen) return null;

  const changes = data?.metadata?.changes ?? [];
  const otherDetails: Array<[string, unknown]> = data?.metadata
    ? Object.entries(data.metadata).filter(([key]) => key !== 'changes')
    : [];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
      <div className="bg-white w-full max-w-2xl h-full overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-navy-100 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-semibold text-navy-800">Audit Event Details</h2>
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
                  <AuditField label="Timestamp" value={formatAuditTimestamp(data.timestamp)} icon={Clock} />
                  <AuditField label="Severity" badge badgeColor={data.level === 'CRITICAL' ? 'red' : data.level === 'WARNING' ? 'amber' : 'blue'} value={data.level} />
                  <AuditField label="Result" badge badgeColor={data.result && ['FAILED', 'REJECTED', 'DENIED'].includes(data.result) ? 'red' : data.result && ['VERIFIED', 'APPROVED', 'SUCCESS'].includes(data.result) ? 'green' : 'amber'} value={data.result ?? '-'} />
                  <AuditField label="Resource" value={data.resourceType ?? '-'} icon={Database} />
                  <AuditField label="Resource ID" value={data.resourceId ? `#${data.resourceId}` : '-'} mono />
                  <AuditField label="Action" value={data.action} />
                  <AuditField label="IP Address" value={data.ipAddress || '-'} icon={Monitor} mono />
                </div>
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

              <div className="card p-5">
                <h3 className="text-sm font-semibold text-navy-800 mb-4 pb-2 border-b border-navy-100 flex items-center gap-2"><FileText size={14} /> Description</h3>
                <p className="text-sm text-navy-600 leading-relaxed">{data.description || data.action}</p>
              </div>

              {changes.length > 0 && (
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-navy-800 mb-4 pb-2 border-b border-navy-100">Change Details</h3>
                  <div className="space-y-3">
                    {changes.map((c, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg border border-navy-100 px-4 py-3">
                        <span className="text-sm font-medium text-navy-700">{humanizeKey(c.field)}</span>
                        <span className="flex items-center gap-2 text-sm">
                          <span className="px-2 py-1 rounded bg-navy-100 text-navy-600 font-mono text-xs">{renderMetadataValue(c.previous)}</span>
                          <ArrowRight size={14} className="text-navy-300" />
                          <span className={`px-2 py-1 rounded font-mono text-xs ${String(c.previous) !== String(c.new) ? 'bg-blue-100 text-blue-700 font-bold' : 'bg-navy-100 text-navy-600'}`}>{renderMetadataValue(c.new)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {otherDetails.length > 0 && (
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-navy-800 mb-4 pb-2 border-b border-navy-100">Additional Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {otherDetails.map(([key, value]) => (
                      <AuditField key={key} label={humanizeKey(key)} value={renderMetadataValue(value)} mono />
                    ))}
                  </div>
                </div>
              )}

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

function AuditField({ label, value, icon: Icon, mono, badge, badgeColor }: { label: string; value: string; icon?: any; mono?: boolean; badge?: boolean; badgeColor?: 'navy' | 'blue' | 'green' | 'amber' | 'red' }) {
  return (
    <div>
      <div className="text-xs text-navy-400 uppercase tracking-wide font-medium mb-1 flex items-center gap-1.5">{Icon && <Icon size={12} />}{label}</div>
      {badge ? (
        <span className={`inline-block text-xs font-bold px-2 py-1 rounded ${badgeColor === 'red' ? 'bg-accent-red-soft text-accent-red' : badgeColor === 'amber' ? 'bg-accent-amber-soft text-accent-amber' : badgeColor === 'green' ? 'bg-accent-green-soft text-accent-green' : badgeColor === 'navy' ? 'bg-navy-100 text-navy-700' : 'bg-blue-100 text-blue-700'}`}>{value}</span>
      ) : (<div className={`text-sm font-medium text-navy-800 break-words ${mono ? 'font-mono' : ''}`}>{value}</div>)}
    </div>
  );
}
