import { useState, useEffect } from 'react';
import { verificationService, type VerificationRecord } from '../services/verificationService';
import { StatusBadge } from '../components/StatusBadge';
import { CheckCircle2, XCircle, Clock, Fingerprint, ArrowUpRight, Loader2, AlertCircle } from 'lucide-react';

interface Props {
  onGoVerify: () => void;
  onGoHistory: () => void;
}

export function OfficerDashboard({ onGoVerify, onGoHistory }: Props) {
  const [records, setRecords] = useState<VerificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    verificationService
      .getMyActivity()
      .then((data) => { setRecords(data); setLoading(false); })
      .catch(() => { setError('Failed to load your verification activity.'); setLoading(false); });
  }, []);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todaysRecords = records.filter((record) => new Date(record.date) >= startOfToday);
  const recent = records.slice(0, 6);
  const verified = todaysRecords.filter((r) => r.result === 'verified').length;
  const pending = todaysRecords.filter((r) => r.result === 'pending').length;
  const rejected = todaysRecords.filter((r) => r.result === 'rejected').length;

  return (
    <div className="space-y-6">
      {/* Action banner */}
      <div className="card bg-navy-800 text-white border-navy-700 p-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Border Officer Dashboard</h2>
          <p className="text-navy-300 text-sm mt-1">Start a new traveler verification</p>
        </div>
        <button onClick={onGoVerify} className="btn bg-white text-navy-800 hover:bg-navy-50 px-5 py-2.5 text-sm font-semibold">
          <Fingerprint size={16} />
          Start Verification
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Verifications Today" value={todaysRecords.length} icon={Fingerprint} tone="navy" />
        <StatCard label="Verified Today" value={verified} icon={CheckCircle2} tone="green" />
        <StatCard label="Pending Review Today" value={pending} icon={Clock} tone="amber" />
        <StatCard label="Rejected Today" value={rejected} icon={XCircle} tone="red" />
      </div>

      {/* Recent verifications */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-navy-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-navy-800">Recent Verifications</h3>
          <button onClick={onGoHistory} className="text-xs font-medium text-accent-blue hover:underline flex items-center gap-1">
            View all <ArrowUpRight size={12} />
          </button>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-navy-400">
              <Loader2 size={20} className="animate-spin mr-2" /> Loading...
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12 text-accent-red">
              <AlertCircle size={18} className="mr-2" /> {error}
            </div>
          ) : recent.length === 0 ? (
            <div className="py-12 text-center text-navy-400 text-sm">No verifications yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-navy-50">
                <tr>
                  <th className="table-header px-5 py-3">Traveler</th>
                  <th className="table-header px-5 py-3">Fiyda ID</th>
                  <th className="table-header px-5 py-3">Date / Time</th>
                  <th className="table-header px-5 py-3">Confidence</th>
                  <th className="table-header px-5 py-3">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {recent.map((r) => (
                  <tr key={r.id} className="hover:bg-navy-50/60 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-medium text-navy-800">{r.travelerName}</div>
                      <div className="text-xs text-navy-400">{r.id}</div>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-navy-600">{r.fiydaId}</td>
                    <td className="px-5 py-3 text-navy-600">{r.date}</td>
                    <td className="px-5 py-3">
                      <ScoreBar value={r.finalScore} />
                    </td>
                    <td className="px-5 py-3"><StatusBadge status={r.result} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

type Tone = 'navy' | 'green' | 'amber' | 'red';
const toneMap: Record<Tone, { bg: string; text: string }> = {
  navy: { bg: 'bg-navy-100', text: 'text-navy-700' },
  green: { bg: 'bg-accent-green-soft', text: 'text-accent-green' },
  amber: { bg: 'bg-accent-amber-soft', text: 'text-accent-amber' },
  red: { bg: 'bg-accent-red-soft', text: 'text-accent-red' },
};

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Fingerprint; tone: Tone }) {
  const t = toneMap[tone];
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium text-navy-400 uppercase tracking-wide">{label}</div>
          <div className="mt-2 text-2xl font-bold text-navy-800">{value}</div>
        </div>
        <div className={`h-10 w-10 rounded-lg ${t.bg} ${t.text} flex items-center justify-center`}>
          <Icon size={20} strokeWidth={2} />
        </div>
      </div>
    </div>
  );
}

function ScoreBar({ value }: { value: number }) {
  const color = value >= 95 ? '#16a34a' : value >= 90 ? '#d97706' : '#dc2626';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-navy-100 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="text-xs font-semibold text-navy-700">{value}%</span>
    </div>
  );
}
