import { useState, useEffect } from 'react';
import { auditService, formatAuditTimestamp, type AuditEvent } from '../services/auditService';
import { Search, Filter, Info, ShieldAlert, AlertTriangle, Calendar, Loader2, AlertCircle, LogIn, Gavel, UserPlus, Fingerprint } from 'lucide-react';

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState<'all' | 'INFO' | 'WARNING' | 'CRITICAL'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7d' | '30d'>('all');

  useEffect(() => {
    auditService
      .getLogs({ limit: 100 })
      .then((data) => { setLogs(data.auditLogs); setLoading(false); })
      .catch(() => { setError('Failed to load audit logs.'); setLoading(false); });
  }, []);

  const filtered = logs.filter((l) => {
    const mq =
      !query ||
      l.action.toLowerCase().includes(query.toLowerCase()) ||
      (l.user?.name || 'System').toLowerCase().includes(query.toLowerCase()) ||
      l.ipAddress.includes(query);
    const ms = severity === 'all' || l.level === severity;
    const recDate = new Date(l.timestamp);
    const now = new Date();
    let md = true;
    if (dateFilter === 'today') md = (now.getTime() - recDate.getTime()) < 24 * 3600000;
    else if (dateFilter === '7d') md = (now.getTime() - recDate.getTime()) < 7 * 86400000;
    else if (dateFilter === '30d') md = (now.getTime() - recDate.getTime()) < 30 * 86400000;
    return mq && ms && md;
  });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todaysLogs = logs.filter((entry) => new Date(entry.timestamp) >= startOfToday);

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="card p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-navy-800">Audit Logs</h2>
          <p className="text-sm text-navy-400">Immutable record of all system actions and security events</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative md:w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-300" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search user, action, IP..." className="input pl-10" />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={15} className="text-navy-400" />
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as 'all' | 'INFO' | 'WARNING' | 'CRITICAL')}
              className="rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm text-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-200"
            >
              <option value="all">All Events</option>
              <option value="INFO">INFO</option>
              <option value="WARNING">WARNING</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Calendar size={15} className="text-navy-400" />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as 'all' | 'today' | '7d' | '30d')}
              className="rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm text-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-200"
            >
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </div>
        </div>
      </div>

      {/* Severity summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <SevCard label="Audit Events Today" count={todaysLogs.length} icon={Info} tone="navy" />
        <SevCard label="Logins Today" count={todaysLogs.filter((l) => /logged in/i.test(l.action)).length} icon={LogIn} tone="amber" />
        <SevCard label="Overrides Today" count={todaysLogs.filter((l) => /override/i.test(l.action)).length} icon={Gavel} tone="red" />
        <SevCard label="Enrollments Today" count={todaysLogs.filter((l) => /enrolled|enrollment started/i.test(l.action)).length} icon={UserPlus} tone="navy" />
        <SevCard label="Verifications Today" count={todaysLogs.filter((l) => /verification completed|verification attempt/i.test(l.action)).length} icon={Fingerprint} tone="amber" />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-navy-400">
              <Loader2 size={20} className="animate-spin mr-2" /> Loading...
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12 text-accent-red">
              <AlertCircle size={18} className="mr-2" /> {error}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-navy-400 text-sm">No logs match your filters.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-navy-50">
                <tr>
                  <th className="table-header px-5 py-3">Log ID</th>
                  <th className="table-header px-5 py-3">User</th>
                  <th className="table-header px-5 py-3">Action</th>
                  <th className="table-header px-5 py-3">Time</th>
                  <th className="table-header px-5 py-3">IP Address</th>
                  <th className="table-header px-5 py-3">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {filtered.map((l) => (
                  <tr key={l.id} className="hover:bg-navy-50/60 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-navy-600">{l.id}</td>
                    <td className="px-5 py-3">
                      <div className="font-medium text-navy-800">{l.user?.name ?? 'System'}</div>
                    </td>
                    <td className="px-5 py-3 text-navy-600">{l.action}</td>
                    <td className="px-5 py-3 text-navy-600 whitespace-nowrap font-mono text-xs">{formatAuditTimestamp(l.timestamp)}</td>
                    <td className="px-5 py-3 font-mono text-xs text-navy-600">{l.ipAddress}</td>
                    <td className="px-5 py-3">
                      {l.level === 'CRITICAL' ? (
                        <span className="badge-rejected"><ShieldAlert size={12} /> CRITICAL</span>
                      ) : l.level === 'WARNING' ? (
                        <span className="badge-pending"><AlertTriangle size={12} /> WARNING</span>
                      ) : (
                        <span className="badge-neutral"><Info size={12} /> INFO</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {!loading && !error && (
          <div className="px-5 py-4 border-t border-navy-100 text-xs text-navy-400">
            {filtered.length} entries · Logs retained for 365 days per compliance policy
          </div>
        )}
      </div>
    </div>
  );
}

function SevCard({
  label,
  count,
  icon: Icon,
  tone,
}: {
  label: string;
  count: number;
  icon: typeof Info;
  tone: 'navy' | 'amber' | 'red';
}) {
  const map = {
    navy: { bg: 'bg-navy-100', text: 'text-navy-700' },
    amber: { bg: 'bg-accent-amber-soft', text: 'text-accent-amber' },
    red: { bg: 'bg-accent-red-soft', text: 'text-accent-red' },
  };
  const t = map[tone];
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={`h-11 w-11 rounded-lg ${t.bg} ${t.text} flex items-center justify-center`}>
        <Icon size={20} />
      </div>
      <div>
        <div className="text-xs text-navy-400 uppercase tracking-wide font-medium">{label} Events</div>
        <div className="text-2xl font-bold text-navy-800">{count}</div>
      </div>
    </div>
  );
}
