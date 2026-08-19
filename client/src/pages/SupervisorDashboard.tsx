import { useState, useEffect } from 'react';
import { overrideService, type PendingCase } from '../services/overrideService';
import { verificationService } from '../services/verificationService';
import { StatusBadge } from '../components/StatusBadge';
import { ClipboardCheck, Gavel, FileBarChart, XCircle, ArrowUpRight, Loader2, AlertCircle } from 'lucide-react';

interface Props {
  onGoPending: () => void;
}

export function SupervisorDashboard({ onGoPending }: Props) {
  const [pendingCases, setPendingCases] = useState<PendingCase[]>([]);
  const [stats, setStats] = useState({
    todayCrossings: 0,
    todayEntries: 0,
    todayExits: 0,
    todayAccepted: 0,
    todayRejected: 0,
    todayReviews: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      overrideService.getPending().catch(() => []),
      verificationService.getStats().catch(() => ({
        todayCrossings: 0,
        todayEntries: 0,
        todayExits: 0,
        todayAccepted: 0,
        todayRejected: 0,
        todayReviews: 0,
      })),
    ]).then(([pending, dbStats]) => {
      setPendingCases(pending);
      setStats(dbStats);
      setLoading(false);
    }).catch(() => {
      setError('Failed to load dashboard data.');
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-6">
      <div className="card bg-navy-800 text-white border-navy-700 p-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Supervisor Console</h2>
          <p className="text-navy-300 text-sm mt-1">Border Operations Center · Real-time oversight</p>
        </div>
        <button onClick={onGoPending} className="btn bg-accent-amber text-white hover:bg-amber-600 px-5 py-2.5 text-sm font-semibold">
          <ClipboardCheck size={16} /> Review Pending ({pendingCases.length})
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <SupCard label="Pending Reviews" value={pendingCases.length} icon={ClipboardCheck} tone="amber" />
        <SupCard label="Today Crossings" value={stats.todayCrossings} icon={Gavel} tone="navy" />
        <SupCard label="Entries" value={stats.todayEntries} icon={FileBarChart} tone="green" />
        <SupCard label="Exits" value={stats.todayExits} icon={FileBarChart} tone="navy" />
        <SupCard label="Accepted" value={stats.todayAccepted} icon={FileBarChart} tone="green" />
        <SupCard label="Rejected" value={stats.todayRejected} icon={XCircle} tone="red" />
      </div>

      {/* Pending queue */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-navy-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-navy-800">Pending Review Queue</h3>
          <button onClick={onGoPending} className="text-xs font-medium text-accent-blue hover:underline flex items-center gap-1">
            Open queue <ArrowUpRight size={12} />
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-navy-400">
            <Loader2 size={20} className="animate-spin mr-2" /> Loading...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12 text-accent-red">
            <AlertCircle size={18} className="mr-2" /> {error}
          </div>
        ) : pendingCases.length === 0 ? (
          <div className="py-12 text-center text-navy-400 text-sm">No pending cases.</div>
        ) : (
          <div className="divide-y divide-navy-100">
            {pendingCases.map((c) => (
              <button
                key={c.id}
                onClick={onGoPending}
                className="w-full px-5 py-3.5 flex items-center gap-4 hover:bg-navy-50/60 transition-colors cursor-pointer"
              >
                <div className="h-10 w-10 rounded-lg border border-navy-200 bg-navy-50 flex items-center justify-center text-navy-400">
                  <ClipboardCheck size={18} />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-sm font-medium text-navy-800 truncate">{c.travelerName}</div>
                  <div className="text-xs text-navy-400 font-mono">{c.fiydaId} · {c.nationality}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-accent-amber">{c.finalScore}%</div>
                  <div className="text-[11px] text-navy-400">Confidence</div>
                </div>
                <StatusBadge status="pending" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SupCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof ClipboardCheck; tone: 'navy' | 'green' | 'amber' | 'red' }) {
  const map = {
    navy: { bg: 'bg-navy-100', text: 'text-navy-700' },
    green: { bg: 'bg-accent-green-soft', text: 'text-accent-green' },
    amber: { bg: 'bg-accent-amber-soft', text: 'text-accent-amber' },
    red: { bg: 'bg-accent-red-soft', text: 'text-accent-red' },
  };
  const t = map[tone];
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium text-navy-400 uppercase tracking-wide">{label}</div>
          <div className="mt-2 text-2xl font-bold text-navy-800">{value}</div>
        </div>
        <div className={`h-10 w-10 rounded-lg ${t.bg} ${t.text} flex items-center justify-center`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}
