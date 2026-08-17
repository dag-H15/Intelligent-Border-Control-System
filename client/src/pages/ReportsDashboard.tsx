import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  reportService,
  type ReportRecord,
  type ReportParams,
  type OfficerOption,
  type VerificationSummaryResponse,
  type OverrideSummaryResponse,
  type OfficerActivitySummaryResponse,
  type ManualReviewSummaryResponse,
} from '../services/reportService';
import { DonutChart, ChartLabels } from '../components/Charts';
import {
  FileBarChart, Download, Calendar, Filter, FileText,
  CheckCircle2, Loader2, AlertCircle,
} from 'lucide-react';

type ReportType = 'verification' | 'override' | 'officer' | 'manual_review';
type GeneratedReport =
  | VerificationSummaryResponse
  | OverrideSummaryResponse
  | OfficerActivitySummaryResponse
  | ManualReviewSummaryResponse;

export function ReportsDashboard() {
  const { user } = useAuth();

  // --- Generate-report state ---
  const [reportType, setReportType]   = useState<ReportType>('verification');
  const [dateRange, setDateRange]     = useState<'7d' | '30d' | '90d' | 'ytd'>('7d');
  /** Numeric DB id of the selected officer, or undefined for "all officers". */
  const [selectedOfficerId, setSelectedOfficerId] = useState<number | undefined>(undefined);
  const [generated, setGenerated]     = useState(false);
  const [generating, setGenerating]   = useState(false);
  const [reportData, setReportData]   = useState<GeneratedReport | null>(null);
  const [genError, setGenError]       = useState('');

  // --- Officer dropdown state ---
  const [officers, setOfficers]           = useState<OfficerOption[]>([]);
  const [officersLoading, setOfficersLoading] = useState(false);
  const [officersError, setOfficersError] = useState('');

  // --- Previous-reports state ---
  const [prevReports, setPrevReports]   = useState<ReportRecord[]>([]);
  const [prevLoading, setPrevLoading]   = useState(true);
  const [prevError, setPrevError]       = useState('');
  const [prevDate, setPrevDate]         = useState<'all' | '7d' | '30d' | '90d'>('all');
  const [prevBy, setPrevBy]             = useState<'all' | string>('all');
  const [prevType, setPrevType]         = useState<'all' | ReportType>('all');

  // Load previous reports on mount
  useEffect(() => {
    reportService
      .getReports()
      .then((data) => { setPrevReports(data); setPrevLoading(false); })
      .catch(() => { setPrevError('Failed to load previous reports.'); setPrevLoading(false); });
  }, []);

  // Load officer list when the officer report type is selected
  useEffect(() => {
    if (reportType !== 'officer') return;
    setOfficersLoading(true);
    setOfficersError('');
    reportService
      .getOfficers()
      .then((data) => { setOfficers(data); setOfficersLoading(false); })
      .catch(() => {
        setOfficersError('Failed to load officers.');
        setOfficersLoading(false);
      });
  }, [reportType]);

  const typeLabel: Record<ReportType, string> = {
    verification:  'Verification Summary',
    override:      'Override Summary',
    officer:       'Officer Activity',
    manual_review: 'Manual Review Summary',
  };

  /**
   * Convert a UI date-range key to { startDate, endDate } YYYY-MM-DD strings.
   * The end date is always today so the backend's toEndOfDay() will include
   * all records up to 23:59:59.999 UTC on that day.
   */
  const dateRangeToParams = (range: '7d' | '30d' | '90d' | 'ytd'): { startDate: string; endDate: string } => {
    const now = new Date();
    const end = now.toISOString().slice(0, 10);
    let start: string;
    if      (range === '7d')  start = new Date(now.getTime() - 7  * 86_400_000).toISOString().slice(0, 10);
    else if (range === '30d') start = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
    else if (range === '90d') start = new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
    else                      start = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
    return { startDate: start, endDate: end };
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerated(false);
    setGenError('');
    setReportData(null);
    try {
      const dateParams = dateRangeToParams(dateRange);
      const params: ReportParams = {
        ...dateParams,
        ...(reportType === 'officer' && selectedOfficerId !== undefined
          ? { officerId: selectedOfficerId }
          : {}),
      };

      let data: GeneratedReport;
      if      (reportType === 'verification')  data = await reportService.verificationSummary(params);
      else if (reportType === 'override')      data = await reportService.overrideSummary(params);
      else if (reportType === 'officer')       data = await reportService.officerActivity(params);
      else                                     data = await reportService.manualReviewSummary(params);

      setReportData(data);
      setGenerated(true);
      // Refresh the previous-reports list to show the new entry
      reportService.getReports().then(setPrevReports).catch(() => {});
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to generate report.';
      setGenError(msg);
    } finally {
      setGenerating(false);
    }
  };

  // --------------------------------------------------------------------------
  // CSV download for the currently generated report
  // --------------------------------------------------------------------------
  const buildCSVLines = (
    targetData: GeneratedReport,
    targetType: ReportType,
    startDate: string,
    endDate: string,
  ): string[] => {
    const nowStr    = new Date().toLocaleString();
    const userName  = user?.name || 'System Administrator';
    const officerLabel =
      targetType === 'officer' && selectedOfficerId !== undefined
        ? (officers.find((o) => o.id === selectedOfficerId)?.name ?? String(selectedOfficerId))
        : undefined;

    const lines: string[] = [];
    lines.push(`Report Type,${typeLabel[targetType]}`);
    lines.push(`Date Range,${startDate} to ${endDate}`);
    if (officerLabel) lines.push(`Officer,"${officerLabel}"`);
    lines.push(`Generated By,"${userName}"`);
    lines.push(`Generated Date,"${nowStr}"`);
    lines.push('');

    if (targetType === 'verification') {
      const s = (targetData as VerificationSummaryResponse).summary ?? { total: 0, verified: 0, pendingSupervisorReview: 0, rejected: 0 };
      lines.push('Metric,Value');
      lines.push(`Total Verifications,${s.total ?? 0}`);
      lines.push(`Verified,${s.verified ?? 0}`);
      lines.push(`Pending Supervisor Review,${s.pendingSupervisorReview ?? 0}`);
      lines.push(`Rejected,${s.rejected ?? 0}`);
    } else if (targetType === 'override') {
      const s = (targetData as OverrideSummaryResponse).summary ?? { total: 0, approvedToVerified: 0, approvedToRejected: 0 };
      lines.push('Metric,Value');
      lines.push(`Total Overrides,${s.total ?? 0}`);
      lines.push(`Approved to Verified,${s.approvedToVerified ?? 0}`);
      lines.push(`Approved to Rejected,${s.approvedToRejected ?? 0}`);
    } else if (targetType === 'officer') {
      const s = (targetData as OfficerActivitySummaryResponse).summary ?? [];
      lines.push('Officer ID,Officer Name,Verifications Count');
      s.forEach((item) => {
        lines.push(`${item.officerId},"${item.officerName.replace(/"/g, '""')}",${item.verifications}`);
      });
    } else {
      const s = (targetData as ManualReviewSummaryResponse).summary ?? [];
      lines.push('Traveler Name,Passport Number,Manual Review Type,Officer,Supervisor,Decision,Submission Date,Review Date');
      s.forEach((item) => {
        lines.push(
          `"${item.travelerName.replace(/"/g, '""')}",` +
          `"${item.passportNo.replace(/"/g, '""')}",` +
          `"${item.manualReviewType.replace(/"/g, '""')}",` +
          `"${item.officer.replace(/"/g, '""')}",` +
          `"${item.supervisor.replace(/"/g, '""')}",` +
          `"${item.decision.replace(/"/g, '""')}",` +
          `"${new Date(item.submissionDate).toLocaleString()}",` +
          `"${new Date(item.reviewDate).toLocaleString()}"`,
        );
      });
    }
    return lines;
  };

  const triggerDownload = (csvContent: string, filename: string) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCSV = () => {
    if (!reportData) return;
    const { startDate, endDate } = dateRangeToParams(dateRange);
    const todayStr = new Date().toISOString().slice(0, 10);
    const lines    = buildCSVLines(reportData, reportType, startDate, endDate);
    triggerDownload(lines.join('\n'), `${reportType}_report_${todayStr}.csv`);
  };

  /**
   * Download a previously generated report.
   * Uses the dates stored on the report record itself (not a hardcoded 30-day
   * window) so the re-query returns the same data as the original generation.
   */
  const handleDownloadPrevious = async (record: ReportRecord) => {
    let rType: ReportType = 'verification';
    const lower = record.type.toLowerCase();
    if      (lower.includes('override'))      rType = 'override';
    else if (lower.includes('officer'))       rType = 'officer';
    else if (lower.includes('manual'))        rType = 'manual_review';

    // Use the report's own stored dates; fall back to last-30-days only when
    // the backend didn't return them (old records before this fix).
    const fallback   = dateRangeToParams('30d');
    const startDate  = record.startDate
      ? record.startDate.slice(0, 10)
      : fallback.startDate;
    const endDate    = record.endDate
      ? record.endDate.slice(0, 10)
      : fallback.endDate;

    const params: ReportParams = { startDate, endDate };

    try {
      let data: GeneratedReport;
      if      (rType === 'verification')  data = await reportService.verificationSummary(params);
      else if (rType === 'override')      data = await reportService.overrideSummary(params);
      else if (rType === 'officer')       data = await reportService.officerActivity(params);
      else                               data = await reportService.manualReviewSummary(params);

      const todayStr = new Date().toISOString().slice(0, 10);
      const lines    = buildCSVLines(data, rType, startDate, endDate);
      triggerDownload(lines.join('\n'), `${rType}_report_${record.id}_${todayStr}.csv`);
    } catch {
      // Fallback: export just the metadata we already have
      const csvContent =
        `Report Type,${record.type}\nGenerated By,"${record.generatedBy}"\n` +
        `Generated Date,"${record.date}"\nStatus,${record.status}\n`;
      triggerDownload(csvContent, `${record.name.toLowerCase().replace(/\s+/g, '_')}.csv`);
    }
  };

  // --------------------------------------------------------------------------
  // Previous-reports filtering (client-side)
  // --------------------------------------------------------------------------
  const filteredPrev = prevReports.filter((r) => {
    const mType = prevType === 'all' || r.type === typeLabel[prevType];
    const mBy   = prevBy   === 'all' || r.generatedBy === prevBy;
    const recDate = new Date(r.date);
    const now     = new Date();
    let mDate = true;
    if      (prevDate === '7d')  mDate = (now.getTime() - recDate.getTime()) < 7  * 86_400_000;
    else if (prevDate === '30d') mDate = (now.getTime() - recDate.getTime()) < 30 * 86_400_000;
    else if (prevDate === '90d') mDate = (now.getTime() - recDate.getTime()) < 90 * 86_400_000;
    return mType && mBy && mDate;
  });

  const uniqueGenerators = Array.from(new Set(prevReports.map((r) => r.generatedBy)));

  // The label shown in the generated-report header for the officer filter
  const selectedOfficerLabel =
    selectedOfficerId !== undefined
      ? (officers.find((o) => o.id === selectedOfficerId)?.name ?? `Officer #${selectedOfficerId}`)
      : 'All Officers';

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-navy-800">Reports</h2>
        <p className="text-sm text-navy-400 mt-0.5">Generate operational reports and review past reports.</p>
      </div>

      {/* ── Generate Report card ─────────────────────────────────────────── */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-1">
          <FileBarChart size={18} className="text-navy-700" />
          <h3 className="text-sm font-semibold text-navy-800">Generate a Report</h3>
        </div>
        <p className="text-xs text-navy-400 mb-5">Select a report type, apply filters, then generate.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Report type */}
          <div>
            <label className="label flex items-center gap-1.5"><FileText size={12} /> Report Type</label>
            <select
              value={reportType}
              onChange={(e) => {
                setReportType(e.target.value as ReportType);
                setGenerated(false);
                setReportData(null);
                setSelectedOfficerId(undefined);
              }}
              className="input"
            >
              <option value="verification">Verification Summary</option>
              <option value="override">Override Summary</option>
              <option value="officer">Officer Activity</option>
              <option value="manual_review">Manual Review Summary</option>
            </select>
          </div>

          {/* Officer dropdown — only for Officer Activity */}
          {reportType === 'officer' && (
            <div>
              <label className="label flex items-center gap-1.5"><Filter size={12} /> Officer</label>
              {officersLoading ? (
                <div className="input flex items-center gap-2 text-navy-400 text-sm">
                  <Loader2 size={14} className="animate-spin" /> Loading officers…
                </div>
              ) : officersError ? (
                <div className="input flex items-center gap-2 text-accent-red text-sm">
                  <AlertCircle size={14} /> {officersError}
                </div>
              ) : (
                <select
                  value={selectedOfficerId ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedOfficerId(val === '' ? undefined : Number(val));
                    setGenerated(false);
                    setReportData(null);
                  }}
                  className="input"
                >
                  <option value="">All Officers</option>
                  {officers.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Date range */}
          <div className={reportType === 'officer' ? '' : 'md:col-span-2'}>
            <label className="label flex items-center gap-1.5"><Calendar size={12} /> Date Range</label>
            <select
              value={dateRange}
              onChange={(e) => {
                setDateRange(e.target.value as '7d' | '30d' | '90d' | 'ytd');
                setGenerated(false);
                setReportData(null);
              }}
              className="input"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="ytd">Year to date</option>
            </select>
          </div>
        </div>

        {genError && (
          <div className="mt-4 flex items-center gap-2 text-sm text-accent-red bg-accent-red-soft rounded-lg px-3 py-2">
            <AlertCircle size={15} /> {genError}
          </div>
        )}

        <div className="mt-5 flex items-center gap-3">
          <button onClick={handleGenerate} disabled={generating} className="btn-primary disabled:opacity-60">
            {generating
              ? <><Loader2 size={16} className="animate-spin" /> Generating…</>
              : <><FileBarChart size={16} /> Generate Report</>}
          </button>
          {generated && (
            <button onClick={handleDownloadCSV} className="btn-success">
              <Download size={16} /> Download CSV
            </button>
          )}
        </div>
      </div>

      {/* ── Generated report output ──────────────────────────────────────── */}
      {generated && reportData && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-accent-green" />
                <h3 className="text-sm font-semibold text-navy-800">
                  {typeLabel[reportType]} — Generated
                </h3>
              </div>
              <p className="text-xs text-navy-400 mt-0.5">
                {reportType === 'officer' ? `Officer: ${selectedOfficerLabel} · ` : ''}
                Range:{' '}
                {dateRange === '7d'  ? 'Last 7 days'
                : dateRange === '30d' ? 'Last 30 days'
                : dateRange === '90d' ? 'Last 90 days'
                : 'Year to date'}
              </p>
            </div>
            <span className="badge-verified"><CheckCircle2 size={12} /> Ready</span>
          </div>

          <ReportOutput reportType={reportType} data={reportData} />

          <div className="mt-5 pt-4 border-t border-navy-100 flex justify-end">
            <button onClick={handleDownloadCSV} className="btn-success">
              <Download size={16} /> Download CSV
            </button>
          </div>
        </div>
      )}

      {/* ── Previous reports ─────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-navy-100 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <h3 className="text-sm font-semibold text-navy-800">Previous Reports</h3>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Calendar size={15} className="text-navy-400" />
              <select
                value={prevDate}
                onChange={(e) => setPrevDate(e.target.value as 'all' | '7d' | '30d' | '90d')}
                className="rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm text-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-200"
              >
                <option value="all">All Dates</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Filter size={15} className="text-navy-400" />
              <select
                value={prevBy}
                onChange={(e) => setPrevBy(e.target.value)}
                className="rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm text-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-200"
              >
                <option value="all">All Generators</option>
                {uniqueGenerators.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <select
              value={prevType}
              onChange={(e) => setPrevType(e.target.value as 'all' | ReportType)}
              className="rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm text-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-200"
            >
              <option value="all">All Types</option>
              <option value="verification">Verification Summary</option>
              <option value="override">Override Summary</option>
              <option value="officer">Officer Activity</option>
              <option value="manual_review">Manual Review Summary</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          {prevLoading ? (
            <div className="flex items-center justify-center py-12 text-navy-400">
              <Loader2 size={20} className="animate-spin mr-2" /> Loading…
            </div>
          ) : prevError ? (
            <div className="flex items-center justify-center py-12 text-accent-red">
              <AlertCircle size={18} className="mr-2" /> {prevError}
            </div>
          ) : filteredPrev.length === 0 ? (
            <div className="py-12 text-center text-navy-400 text-sm">No reports match your filters.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-navy-50">
                <tr>
                  <th className="table-header px-5 py-3">Report ID</th>
                  <th className="table-header px-5 py-3">Report Name</th>
                  <th className="table-header px-5 py-3">Type</th>
                  <th className="table-header px-5 py-3">Generated By</th>
                  <th className="table-header px-5 py-3">Date</th>
                  <th className="table-header px-5 py-3">Status</th>
                  <th className="table-header px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {filteredPrev.map((r) => (
                  <tr key={r.id} className="hover:bg-navy-50/60 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-navy-600">{r.id}</td>
                    <td className="px-5 py-3 font-medium text-navy-800">{r.name}</td>
                    <td className="px-5 py-3"><span className="badge-neutral">{r.type}</span></td>
                    <td className="px-5 py-3 text-navy-600">{r.generatedBy}</td>
                    <td className="px-5 py-3 text-navy-600 whitespace-nowrap">{r.date}</td>
                    <td className="px-5 py-3">
                      <span className="badge-verified"><CheckCircle2 size={12} /> {r.status}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => handleDownloadPrevious(r)}
                        className="text-accent-blue hover:underline text-xs font-medium flex items-center gap-1 ml-auto"
                      >
                        <Download size={13} /> Download
                      </button>
                    </td>
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

// ---------------------------------------------------------------------------
// ReportOutput — renders the visual summary for the currently generated report
// ---------------------------------------------------------------------------
function ReportOutput({ reportType, data }: { reportType: ReportType; data: GeneratedReport }) {
  if (reportType === 'verification') {
    const summary = (data as VerificationSummaryResponse).summary ?? { total: 0, verified: 0, pendingSupervisorReview: 0, rejected: 0 };
    const chartData = [
      { label: 'Verified',  value: summary.verified               ?? 0, color: '#16a34a' },
      { label: 'Pending',   value: summary.pendingSupervisorReview ?? 0, color: '#d97706' },
      { label: 'Rejected',  value: summary.rejected               ?? 0, color: '#dc2626' },
    ];
    if (summary.total === 0) return <p className="text-sm text-navy-400">No data for this range.</p>;
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-6 items-center">
        <DonutChart data={chartData} size={180} />
        <div>
          <h4 className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-3">Verification Summary</h4>
          <ChartLabels data={chartData} />
          <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs">
            <StatPill label="Total"    value={summary.total} />
            <StatPill label="Verified" value={summary.verified ?? 0} />
            <StatPill label="Pending"  value={summary.pendingSupervisorReview ?? 0} />
          </div>
        </div>
      </div>
    );
  }

  if (reportType === 'override') {
    const summary = (data as OverrideSummaryResponse).summary ?? { total: 0, approvedToVerified: 0, approvedToRejected: 0 };
    const chartData = [
      { label: 'Verified', value: summary.approvedToVerified ?? 0, color: '#16a34a' },
      { label: 'Rejected', value: summary.approvedToRejected ?? 0, color: '#dc2626' },
    ];
    if (summary.total === 0) return <p className="text-sm text-navy-400">No data for this range.</p>;
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-6 items-center">
        <DonutChart data={chartData} size={180} />
        <div>
          <h4 className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-3">Override Summary</h4>
          <ChartLabels data={chartData} />
          <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs">
            <StatPill label="Total"    value={summary.total} />
            <StatPill label="Verified" value={summary.approvedToVerified ?? 0} />
            <StatPill label="Rejected" value={summary.approvedToRejected ?? 0} />
          </div>
        </div>
      </div>
    );
  }

  if (reportType === 'manual_review') {
    const summary = (data as ManualReviewSummaryResponse).summary ?? [];
    if (summary.length === 0) return <p className="text-sm text-navy-400">No data for this range.</p>;

    const approved          = summary.filter((r) => r.decision === 'APPROVED' || r.decision === 'APPROVED_OVERRIDE').length;
    const rejected          = summary.filter((r) => r.decision === 'REJECTED').length;
    const reEnrollment      = summary.filter((r) => r.decision === 'RE_ENROLLMENT_REQUESTED').length;

    // Reason breakdown
    const fingerprintInjury = summary.filter((r) => r.manualReviewType === 'FINGERPRINT_INJURY').length;
    const irisInjury        = summary.filter((r) => r.manualReviewType === 'IRIS_INJURY').length;
    const unavailable       = summary.filter((r) => r.manualReviewType === 'BIOMETRIC_UNAVAILABLE').length;

    const decisionChart = [
      { label: 'Approved',          value: approved,     color: '#16a34a' },
      { label: 'Rejected',          value: rejected,     color: '#dc2626' },
      { label: 'Re-Enrollment',     value: reEnrollment, color: '#d97706' },
    ];
    const reasonChart = [
      { label: 'Fingerprint Injury',    value: fingerprintInjury, color: '#6366f1' },
      { label: 'Iris Injury',           value: irisInjury,        color: '#0ea5e9' },
      { label: 'Biometric Unavailable', value: unavailable,       color: '#64748b' },
    ];

    return (
      <div className="space-y-6">
        {/* Decision breakdown */}
        <div>
          <h4 className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-4">Decision Breakdown</h4>
          <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-6 items-center">
            <DonutChart data={decisionChart} size={180} />
            <div>
              <ChartLabels data={decisionChart} />
              <div className="mt-4 grid grid-cols-4 gap-3 text-center text-xs">
                <StatPill label="Total"        value={summary.length} />
                <StatPill label="Approved"     value={approved} />
                <StatPill label="Rejected"     value={rejected} />
                <StatPill label="Re-Enroll"    value={reEnrollment} />
              </div>
            </div>
          </div>
        </div>

        {/* Reason breakdown */}
        <div className="border-t border-navy-100 pt-5">
          <h4 className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-4">Review Reason Breakdown</h4>
          <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-6 items-center">
            <DonutChart data={reasonChart} size={180} />
            <div>
              <ChartLabels data={reasonChart} />
              <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs">
                <StatPill label="Fingerprint Injury"    value={fingerprintInjury} />
                <StatPill label="Iris Injury"           value={irisInjury} />
                <StatPill label="Biometric Unavailable" value={unavailable} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Officer activity
  const summary = (data as OfficerActivitySummaryResponse).summary ?? [];
  if (summary.length === 0) return <p className="text-sm text-navy-400">No data for this range.</p>;

  const totalVerifications = summary.reduce((s, o) => s + o.verifications, 0);
  // Assign a distinct color per officer from a fixed palette
  const palette = ['#102a43', '#16a34a', '#0ea5e9', '#d97706', '#6366f1', '#dc2626', '#64748b', '#0f766e'];
  const officerChart = summary.map((entry, i) => ({
    label: entry.officerName,
    value: entry.verifications,
    color: palette[i % palette.length],
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-6 items-center">
      <DonutChart data={officerChart} size={180} />
      <div>
        <h4 className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-3">Officer Activity</h4>
        <ChartLabels data={officerChart} />
        <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs">
          <StatPill label="Total Verifications" value={totalVerifications} />
          <StatPill label="Officers Active"     value={summary.length} />
          <StatPill label="Avg per Officer"     value={summary.length > 0 ? Math.round(totalVerifications / summary.length) : 0} />
        </div>
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-navy-100 bg-navy-50/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-navy-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-navy-800">{value}</div>
    </div>
  );
}
