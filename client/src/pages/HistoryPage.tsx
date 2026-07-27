import { useState, useEffect } from 'react';
import { verificationService, type VerificationRecord } from '../services/verificationService';
import { StatusBadge } from '../components/StatusBadge';
import { Search, Filter, ChevronLeft, ChevronRight, Download, Calendar, Loader2, AlertCircle } from 'lucide-react';
import type { VerificationResult } from '../types';

export function HistoryPage() {
  const [records, setRecords] = useState<VerificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | VerificationResult>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7d' | '30d'>('all');
  const [page, setPage] = useState(1);
  const perPage = 8;

  useEffect(() => {
    verificationService
      .getMyActivity()
      .then((data) => { setRecords(data); setLoading(false); })
      .catch(() => { setError('Failed to load verification history.'); setLoading(false); });
  }, []);

  const filtered = records.filter((r) => {
    const matchesQuery = r.travelerName.toLowerCase().includes(query.toLowerCase()) || r.fiydaId.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === 'all' || r.result === filter;
    const recordDate = new Date(r.date);
    const now = new Date();
    let matchesDate = true;
    if (dateFilter === 'today') matchesDate = (now.getTime() - recordDate.getTime()) < 24 * 3600 * 1000;
    else if (dateFilter === '7d') matchesDate = (now.getTime() - recordDate.getTime()) < 7 * 24 * 3600 * 1000;
    else if (dateFilter === '30d') matchesDate = (now.getTime() - recordDate.getTime()) < 30 * 24 * 3600 * 1000;
    return matchesQuery && matchesFilter && matchesDate;
  });

  const totalPages = Math.ceil(filtered.length / perPage) || 1;
  const pageItems = filtered.slice((page - 1) * perPage, page * perPage);

  const verified = records.filter((r) => r.result === 'verified').length;
  const pending = records.filter((r) => r.result === 'pending').length;
  const rejected = records.filter((r) => r.result === 'rejected').length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-navy-800">My Verification History</h2>
        <p className="text-sm text-navy-400 mt-0.5">A record of verifications you have performed.</p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MiniStat label="Total Records" value={records.length.toString()} tone="navy" />
        <MiniStat label="Verified" value={verified.toString()} tone="green" />
        <MiniStat label="Pending" value={pending.toString()} tone="amber" />
        <MiniStat label="Rejected" value={rejected.toString()} tone="red" />
      </div>

      <div className="card overflow-hidden">
        {/* Toolbar */}
        <div className="px-5 py-4 border-b border-navy-100 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="relative lg:w-80">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-300" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              placeholder="Search by name or Fiyda ID..."
              className="input pl-10"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter size={15} className="text-navy-400" />
              <select
                value={filter}
                onChange={(e) => { setFilter(e.target.value as 'all' | VerificationResult); setPage(1); }}
                className="rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm text-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-200"
              >
                <option value="all">All Results</option>
                <option value="verified">Verified</option>
                <option value="pending">Pending Review</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Calendar size={15} className="text-navy-400" />
              <select
                value={dateFilter}
                onChange={(e) => { setDateFilter(e.target.value as 'all' | 'today' | '7d' | '30d'); setPage(1); }}
                className="rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm text-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-200"
              >
                <option value="all">All Dates</option>
                <option value="today">Today</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
              </select>
            </div>
            <button className="btn-secondary">
              <Download size={15} /> Export
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-navy-400">
              <Loader2 size={20} className="animate-spin mr-2" /> Loading...
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12 text-accent-red">
              <AlertCircle size={18} className="mr-2" /> {error}
            </div>
          ) : pageItems.length === 0 ? (
            <div className="py-12 text-center text-navy-400 text-sm">No records match your filters.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-navy-50">
                <tr>
                  <th className="table-header px-5 py-3">Traveler</th>
                  <th className="table-header px-5 py-3">Fiyda ID</th>
                  <th className="table-header px-5 py-3">Date / Time</th>
                  <th className="table-header px-5 py-3">Fingerprint</th>
                  <th className="table-header px-5 py-3">Iris</th>
                  <th className="table-header px-5 py-3">Confidence</th>
                  <th className="table-header px-5 py-3">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {pageItems.map((r) => (
                  <tr key={r.id} className="hover:bg-navy-50/60 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-medium text-navy-800">{r.travelerName}</div>
                      <div className="text-xs text-navy-400 font-mono">{r.id}</div>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-navy-600">{r.fiydaId}</td>
                    <td className="px-5 py-3 text-navy-600 whitespace-nowrap">{r.date}</td>
                    <td className="px-5 py-3"><ScoreCell value={r.fingerprintScore} /></td>
                    <td className="px-5 py-3"><ScoreCell value={r.irisScore} /></td>
                    <td className="px-5 py-3"><ScoreCell value={r.finalScore} bold /></td>
                    <td className="px-5 py-3"><StatusBadge status={r.result} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && !error && filtered.length > 0 && (
          <div className="px-5 py-4 border-t border-navy-100 flex items-center justify-between">
            <span className="text-xs text-navy-400">
              Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-8 w-8 rounded-lg border border-navy-200 flex items-center justify-center text-navy-500 disabled:opacity-40 hover:bg-navy-50"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm text-navy-600 font-medium">Page {page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="h-8 w-8 rounded-lg border border-navy-200 flex items-center justify-center text-navy-500 disabled:opacity-40 hover:bg-navy-50"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ScoreCell({ value, bold }: { value: number; bold?: boolean }) {
  const color = value >= 95 ? '#16a34a' : value >= 90 ? '#d97706' : '#dc2626';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-12 rounded-full bg-navy-100 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className={`text-xs ${bold ? 'font-bold' : 'font-semibold'} text-navy-700`}>{value}%</span>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: 'navy' | 'green' | 'amber' | 'red' }) {
  const map = {
    navy: 'text-navy-700', green: 'text-accent-green', amber: 'text-accent-amber', red: 'text-accent-red',
  };
  return (
    <div className="card p-4">
      <div className="text-xs text-navy-400 uppercase tracking-wide font-medium">{label}</div>
      <div className={`mt-1.5 text-2xl font-bold ${map[tone]}`}>{value}</div>
    </div>
  );
}
