import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { reportService } from '../services/reportService';
import { checkpointService } from '../services/checkpointService';
import { DonutChart, ChartLabels } from '../components/Charts';
import { StatusBadge } from '../components/StatusBadge';
import {
  FileBarChart, Download, Calendar, Filter, Loader2, AlertCircle, X,
  User, MapPin, ArrowRight, ArrowLeft, CheckCircle2, XCircle, Clock,
  Fingerprint, ScanEye, Shield, ShieldAlert, AlertTriangle, Building,
} from 'lucide-react';

type Direction = 'ENTRY' | 'EXIT' | 'all';
type Decision = 'VERIFIED' | 'PENDING_SUPERVISOR_REVIEW' | 'REJECTED' | 'all';
type AlertStatus = 'NONE' | 'WARNING' | 'CRITICAL' | 'all';

export function ProfessionalReportsDashboard() {
  const { user } = useAuth();

  // Filter state
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [officerId, setOfficerId] = useState<number | undefined>(undefined);
  const [checkpointId, setCheckpointId] = useState<number | undefined>(undefined);
  const [direction, setDirection] = useState<Direction>('all');
  const [decision, setDecision] = useState<Decision>('all');
  const [alertStatus, setAlertStatus] = useState<AlertStatus>('all');

  // Data state
  const [statistics, setStatistics] = useState<any>(null);
  const [chartData, setChartData] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Loading/error state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Dropdown options
  const [officers, setOfficers] = useState<any[]>([]);
  const [checkpoints, setCheckpoints] = useState<any[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  // Detail drawer
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<any>(null);

  // Previous reports list
  const [showReportsList, setShowReportsList] = useState(false);
  const [previousReports, setPreviousReports] = useState<any[]>([]);
  const [loadingPreviousReports, setLoadingPreviousReports] = useState(false);

  // Load dropdown options
  useEffect(() => {
    Promise.all([
      reportService.getOfficers(),
      checkpointService.getActive(),
    ])
      .then(([offs, cps]) => {
        setOfficers(offs);
        setCheckpoints(cps);
        setLoadingOptions(false);
      })
      .catch(() => setLoadingOptions(false));
    
    // Load initial report data
    loadReportData();
  }, []);

  // Load report data
  const loadReportData = async () => {
    setLoading(true);
    setError('');

    const filters: any = {
      startDate: dateFrom,
      endDate: dateTo,
    };

    if (officerId !== undefined) filters.officerId = officerId;
    if (checkpointId !== undefined) filters.checkpointId = checkpointId;
    if (direction !== 'all') filters.direction = direction;
    if (decision !== 'all') filters.decision = decision;
    if (alertStatus !== 'all') filters.alertStatus = alertStatus;

    try {
      const [stats, charts, recsData] = await Promise.all([
        reportService.getStatistics(filters),
        reportService.getChartData(filters),
        reportService.getDetailedRecords({ ...filters, page: currentPage, limit: 20 }),
      ]);

      setStatistics(stats);
      setChartData(charts);
      setRecords(recsData.records);
      setPagination(recsData.pagination);
    } catch (err: any) {
      console.error('Report data load error:', err);
      console.error('Error response:', err.response);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to load report data.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!loadingOptions) {
      loadReportData();
    }
  }, [loadingOptions, dateFrom, dateTo, officerId, checkpointId, direction, decision, alertStatus, currentPage]);

  const openDetail = async (recordId: number) => {
    setSelectedRecord(recordId);
    setDetailLoading(true);
    try {
      const detail = await reportService.getVerificationDetail(recordId);
      setDetailData(detail);
    } catch (err) {
      console.error('Failed to load detail:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedRecord(null);
    setDetailData(null);
  };

  // Export to CSV with comprehensive report structure
  const handleExport = async () => {
    if (!statistics) {
      alert('No report data available. Please wait for the report to load.');
      return;
    }

    setLoading(true);
    try {
      // Fetch ALL filtered records (not just current page)
      const filters: any = {
        startDate: dateFrom,
        endDate: dateTo,
        page: 1,
        limit: 999999, // Get all records
      };

      if (officerId !== undefined) filters.officerId = officerId;
      if (checkpointId !== undefined) filters.checkpointId = checkpointId;
      if (direction !== 'all') filters.direction = direction;
      if (decision !== 'all') filters.decision = decision;
      if (alertStatus !== 'all') filters.alertStatus = alertStatus;

      const allRecordsData = await reportService.getDetailedRecords(filters);
      const allRecords = allRecordsData.records;

      if (!allRecords || allRecords.length === 0) {
        alert('No records to export');
        setLoading(false);
        return;
      }

      // Build comprehensive CSV report
      const csvSections: string[] = [];

      // SECTION 1: Report Header
      csvSections.push('BORDER CROSSING REPORT');
      csvSections.push('');
      
      // SECTION 2: Report Metadata
      csvSections.push('REPORT INFORMATION');
      csvSections.push(`Generated By,${user?.name || 'System'}`);
      csvSections.push(`Generated Date,${new Date().toLocaleString()}`);
      csvSections.push(`Date Range,"${dateFrom} to ${dateTo}"`);
      csvSections.push('');

      // SECTION 3: Applied Filters
      csvSections.push('APPLIED FILTERS');
      csvSections.push(`Officer,${officerId ? officers.find(o => o.id === officerId)?.name || 'Unknown' : 'All Officers'}`);
      csvSections.push(`Checkpoint,${checkpointId ? checkpoints.find(c => c.id === checkpointId)?.name || 'Unknown' : 'All Checkpoints'}`);
      csvSections.push(`Direction,${direction === 'all' ? 'All' : direction}`);
      csvSections.push(`Decision,${decision === 'all' ? 'All' : decision}`);
      csvSections.push(`Watchlist Status,${alertStatus === 'all' ? 'All' : alertStatus}`);
      csvSections.push('');

      // SECTION 4: Summary Statistics
      csvSections.push('SUMMARY STATISTICS');
      csvSections.push(`Total Crossings,${statistics.totalCrossings}`);
      csvSections.push(`Verified,${statistics.verified}`);
      csvSections.push(`Rejected,${statistics.rejected}`);
      csvSections.push(`Pending Review,${statistics.pendingReview}`);
      csvSections.push(`Manual Reviews,${statistics.manualReviews}`);
      csvSections.push(`Entries,${statistics.entries}`);
      csvSections.push(`Exits,${statistics.exits}`);
      csvSections.push(`Watchlist Warnings,${statistics.watchlistWarnings}`);
      csvSections.push(`Watchlist Critical,${statistics.watchlistCritical}`);
      csvSections.push('');

      // SECTION 5: Chart/Analysis Data
      if (chartData) {
        csvSections.push('VERIFICATION RESULTS BREAKDOWN');
        csvSections.push(`Verified,${chartData.decisions.verified}`);
        csvSections.push(`Pending Review,${chartData.decisions.pending}`);
        csvSections.push(`Rejected,${chartData.decisions.rejected}`);
        csvSections.push('');

        csvSections.push('ENTRY VS EXIT BREAKDOWN');
        csvSections.push(`Entry,${chartData.directionBreakdown.entry}`);
        csvSections.push(`Exit,${chartData.directionBreakdown.exit}`);
        csvSections.push('');

        if (chartData.checkpointBreakdown && chartData.checkpointBreakdown.length > 0) {
          csvSections.push('CROSSINGS BY CHECKPOINT');
          chartData.checkpointBreakdown.forEach((cp: any) => {
            csvSections.push(`${cp.checkpointName || 'Unknown'},${cp.count}`);
          });
          csvSections.push('');
        }
      }

      // SECTION 6: Detailed Records Table
      csvSections.push('DETAILED CROSSING RECORDS');
      csvSections.push(`Total Records: ${allRecords.length}`);
      csvSections.push('');

      const headers = [
        'Date/Time',
        'Traveler Name',
        'FAN',
        'Nationality',
        'Officer',
        'Checkpoint',
        'Direction',
        'Fingerprint Score',
        'Iris Score',
        'Overall Score',
        'Threshold',
        'Watchlist Status',
        'Decision',
        'Manual Review Status',
      ];

      csvSections.push(headers.join(','));

      // Map actual data from nested objects
      allRecords.forEach((record: any) => {
        const row = [
          new Date(record.timestamp).toLocaleString(),
          record.traveler?.fullName || 'N/A',
          record.traveler?.fan || 'N/A',
          record.traveler?.nationality || 'N/A',
          record.officer?.name || 'N/A',
          record.checkpoint?.name || 'N/A',
          record.direction || 'N/A',
          record.fingerprintScore?.toFixed(2) || 'N/A',
          record.irisScore?.toFixed(2) || 'N/A',
          record.finalScore?.toFixed(2) || 'N/A',
          record.threshold?.toFixed(2) || 'N/A',
          record.alertStatusAtVerification || 'NONE',
          record.finalDecision || 'N/A',
          record.manualReviewRequest?.status || 'None',
        ];
        csvSections.push(row.map(cell => `"${cell}"`).join(','));
      });

      const csvContent = csvSections.join('\n');

      // Download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `Border_Crossing_Report_${dateFrom}_to_${dateTo}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Save the generated report to history
      try {
        await reportService.saveGeneratedReport({
          reportType: 'BORDER_CROSSING',
          reportTitle: 'Border Crossing Report',
          startDate: dateFrom,
          endDate: dateTo,
          filters: {
            officerId,
            officer: officerId ? officers.find(o => o.id === officerId)?.name : 'All',
            checkpointId,
            checkpoint: checkpointId ? checkpoints.find(c => c.id === checkpointId)?.name : 'All',
            direction: direction === 'all' ? 'All' : direction,
            decision: decision === 'all' ? 'All' : decision,
            alertStatus: alertStatus === 'all' ? 'All' : alertStatus,
          },
          summaryData: statistics,
          recordCount: allRecords.length,
        });
      } catch (saveErr) {
        console.error('Failed to save report to history:', saveErr);
        // Don't block the download if saving fails
      }
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Load previous reports
  const loadPreviousReports = async () => {
    setLoadingPreviousReports(true);
    try {
      const reports = await reportService.getReports();
      setPreviousReports(reports);
      setShowReportsList(true);
    } catch (err) {
      console.error('Failed to load previous reports:', err);
    } finally {
      setLoadingPreviousReports(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-navy-800">Professional Reports Dashboard</h2>
        <p className="text-sm text-navy-400 mt-0.5">
          Comprehensive border crossing analytics with detailed filtering and drill-down capabilities
        </p>
      </div>

      {/* Filters Panel */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={18} className="text-navy-700" />
          <h3 className="text-sm font-semibold text-navy-800">Report Filters</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Date From */}
          <div>
            <label className="label">Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="input"
            />
          </div>

          {/* Date To */}
          <div>
            <label className="label">Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="input"
            />
          </div>

          {/* Officer */}
          <div>
            <label className="label">Officer</label>
            <select
              value={officerId ?? ''}
              onChange={(e) => setOfficerId(e.target.value ? Number(e.target.value) : undefined)}
              className="input"
            >
              <option value="">All Officers</option>
              {officers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          {/* Checkpoint */}
          <div>
            <label className="label">Checkpoint</label>
            <select
              value={checkpointId ?? ''}
              onChange={(e) => setCheckpointId(e.target.value ? Number(e.target.value) : undefined)}
              className="input"
            >
              <option value="">All Checkpoints</option>
              {checkpoints.map((cp) => (
                <option key={cp.id} value={cp.id}>
                  {cp.name}
                </option>
              ))}
            </select>
          </div>

          {/* Direction */}
          <div>
            <label className="label">Direction</label>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as Direction)}
              className="input"
            >
              <option value="all">All Directions</option>
              <option value="ENTRY">Entry</option>
              <option value="EXIT">Exit</option>
            </select>
          </div>

          {/* Decision */}
          <div>
            <label className="label">Decision</label>
            <select
              value={decision}
              onChange={(e) => setDecision(e.target.value as Decision)}
              className="input"
            >
              <option value="all">All Decisions</option>
              <option value="VERIFIED">Verified</option>
              <option value="PENDING_SUPERVISOR_REVIEW">Pending Review</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          {/* Watchlist Status */}
          <div>
            <label className="label">Watchlist Status</label>
            <select
              value={alertStatus}
              onChange={(e) => setAlertStatus(e.target.value as AlertStatus)}
              className="input"
            >
              <option value="all">All Statuses</option>
              <option value="NONE">None</option>
              <option value="WARNING">Warning</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>

          {/* Reset Button */}
          <div className="flex items-end">
            <button
              onClick={() => {
                setOfficerId(undefined);
                setCheckpointId(undefined);
                setDirection('all');
                setDecision('all');
                setAlertStatus('all');
                setCurrentPage(1);
              }}
              className="btn-secondary w-full"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="card bg-accent-red-soft border-red-200 p-4 flex items-center gap-2 text-sm text-accent-red">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {loading && !statistics ? (
        <div className="card p-12 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-navy-400 mr-3" />
          <span className="text-navy-600">Loading report data...</span>
        </div>
      ) : statistics ? (
        <>
          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleExport}
              disabled={!records || records.length === 0}
              className="btn-primary flex items-center gap-2"
            >
              <Download size={16} /> Export to CSV
            </button>
            <button
              onClick={loadPreviousReports}
              disabled={loadingPreviousReports}
              className="btn-secondary flex items-center gap-2"
            >
              {loadingPreviousReports ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <FileBarChart size={16} />
              )}
              Previous Reports
            </button>
          </div>

          {/* Summary Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard label="Total Crossings" value={statistics.totalCrossings} icon={Building} tone="navy" />
            <StatCard label="Verified" value={statistics.verified} icon={CheckCircle2} tone="green" />
            <StatCard label="Rejected" value={statistics.rejected} icon={XCircle} tone="red" />
            <StatCard label="Pending Review" value={statistics.pendingReview} icon={Clock} tone="amber" />
            <StatCard label="Manual Reviews" value={statistics.manualReviews} icon={Shield} tone="navy" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Entries" value={statistics.entries} icon={ArrowRight} tone="blue" />
            <StatCard label="Exits" value={statistics.exits} icon={ArrowLeft} tone="purple" />
            <StatCard label="Watchlist Warnings" value={statistics.watchlistWarnings} icon={AlertTriangle} tone="amber" />
            <StatCard label="Watchlist Critical" value={statistics.watchlistCritical} icon={ShieldAlert} tone="red" />
          </div>

          {/* Charts */}
          {chartData && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Verification Results Chart */}
              <div className="card p-6">
                <h3 className="text-sm font-semibold text-navy-800 mb-4">Verification Results</h3>
                {chartData.decisions.verified + chartData.decisions.pending + chartData.decisions.rejected > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-6 items-center">
                    <DonutChart
                      data={[
                        { label: 'Verified', value: chartData.decisions.verified, color: '#16a34a' },
                        { label: 'Pending', value: chartData.decisions.pending, color: '#d97706' },
                        { label: 'Rejected', value: chartData.decisions.rejected, color: '#dc2626' },
                      ]}
                      size={180}
                    />
                    <ChartLabels
                      data={[
                        { label: 'Verified', value: chartData.decisions.verified, color: '#16a34a' },
                        { label: 'Pending', value: chartData.decisions.pending, color: '#d97706' },
                        { label: 'Rejected', value: chartData.decisions.rejected, color: '#dc2626' },
                      ]}
                    />
                  </div>
                ) : (
                  <div className="py-8 text-center text-navy-400 text-sm">No data available</div>
                )}
              </div>

              {/* Entry vs Exit Chart */}
              <div className="card p-6">
                <h3 className="text-sm font-semibold text-navy-800 mb-4">Entry vs Exit</h3>
                {chartData.directionBreakdown.entry + chartData.directionBreakdown.exit > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-6 items-center">
                    <DonutChart
                      data={[
                        { label: 'Entry', value: chartData.directionBreakdown.entry, color: '#0ea5e9' },
                        { label: 'Exit', value: chartData.directionBreakdown.exit, color: '#8b5cf6' },
                      ]}
                      size={180}
                    />
                    <ChartLabels
                      data={[
                        { label: 'Entry', value: chartData.directionBreakdown.entry, color: '#0ea5e9' },
                        { label: 'Exit', value: chartData.directionBreakdown.exit, color: '#8b5cf6' },
                      ]}
                    />
                  </div>
                ) : (
                  <div className="py-8 text-center text-navy-400 text-sm">No data available</div>
                )}
              </div>
            </div>
          )}

          {/* Detailed Records Table */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-navy-100">
              <h3 className="text-sm font-semibold text-navy-800">Detailed Verification Records</h3>
              <p className="text-xs text-navy-400 mt-0.5">Click any row to view complete verification details</p>
            </div>

            <div className="overflow-x-auto">
              {records.length === 0 ? (
                <div className="py-12 text-center text-navy-400 text-sm">
                  No verification records match the selected filters.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-navy-50">
                    <tr>
                      <th className="table-header px-4 py-3">Date/Time</th>
                      <th className="table-header px-4 py-3">Traveler</th>
                      <th className="table-header px-4 py-3">FAN</th>
                      <th className="table-header px-4 py-3">Officer</th>
                      <th className="table-header px-4 py-3">Checkpoint</th>
                      <th className="table-header px-4 py-3">Direction</th>
                      <th className="table-header px-4 py-3">FP Score</th>
                      <th className="table-header px-4 py-3">Iris Score</th>
                      <th className="table-header px-4 py-3">Overall</th>
                      <th className="table-header px-4 py-3">Watchlist</th>
                      <th className="table-header px-4 py-3">Decision</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-100">
                    {records.map((record) => (
                      <tr
                        key={record.id}
                        onClick={() => openDetail(record.id)}
                        className="hover:bg-navy-50/60 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-navy-600">
                          {new Date(record.timestamp).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-navy-800">{record.traveler.fullName}</div>
                          <div className="text-xs text-navy-400">{record.traveler.nationality}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-navy-600">{record.traveler.fan}</td>
                        <td className="px-4 py-3 text-navy-600 text-xs">{record.officer.name}</td>
                        <td className="px-4 py-3 text-navy-600 text-xs">{record.checkpoint?.name || '—'}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs font-semibold px-2 py-1 rounded ${
                              record.direction === 'ENTRY'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-purple-100 text-purple-700'
                            }`}
                          >
                            {record.direction}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <ScorePill score={record.fingerprintScore} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <ScorePill score={record.irisScore} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <ScorePill score={record.finalScore} bold />
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs font-bold ${
                              record.alertStatusAtVerification === 'CRITICAL'
                                ? 'text-accent-red'
                                : record.alertStatusAtVerification === 'WARNING'
                                ? 'text-accent-amber'
                                : 'text-accent-green'
                            }`}
                          >
                            {record.alertStatusAtVerification || 'NONE'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            status={
                              record.finalDecision === 'VERIFIED'
                                ? 'verified'
                                : record.finalDecision === 'REJECTED'
                                ? 'rejected'
                                : 'pending'
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="px-5 py-4 border-t border-navy-100 flex items-center justify-between">
                <span className="text-xs text-navy-400">
                  Showing {(pagination.page - 1) * pagination.limit + 1}–
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-navy-600 font-medium px-3">
                    Page {currentPage} of {pagination.totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
                    disabled={currentPage === pagination.totalPages}
                    className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : null}

      {/* Detail Drawer */}
      {selectedRecord && (
        <DetailDrawer
          isOpen={!!selectedRecord}
          onClose={closeDetail}
          loading={detailLoading}
          data={detailData}
        />
      )}

      {/* Previous Reports Modal */}
      {showReportsList && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-navy-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-navy-800">Generated Reports History</h2>
                <p className="text-xs text-navy-400 mt-0.5">Click any report to view details</p>
              </div>
              <button onClick={() => setShowReportsList(false)} className="btn-secondary">
                <X size={16} /> Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {previousReports.length === 0 ? (
                <div className="text-center py-12 text-navy-400">No previous reports found</div>
              ) : (
                <div className="space-y-3">
                  {previousReports.map((report) => (
                    <div
                      key={report.id}
                      onClick={async () => {
                        try {
                          const fullReport = await reportService.getReportById(Number(report.id));
                          // Show report details in a modal
                          alert(`Report: ${fullReport.reportTitle}\n\nGenerated: ${new Date(fullReport.createdAt).toLocaleString()}\nDate Range: ${new Date(fullReport.startDate).toLocaleDateString()} - ${new Date(fullReport.endDate).toLocaleDateString()}\nRecords: ${fullReport.recordCount}\n\nFilters:\n${JSON.stringify(fullReport.filters, null, 2)}\n\nSummary:\n${JSON.stringify(fullReport.summaryData, null, 2)}`);
                        } catch (err) {
                          console.error('Failed to load report:', err);
                          alert('Failed to load report details');
                        }
                      }}
                      className="card p-4 hover:bg-navy-50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <FileBarChart size={18} className="text-navy-600" />
                            <div>
                              <div className="font-semibold text-navy-800">{report.name}</div>
                              <div className="text-xs text-navy-400 mt-1 space-y-0.5">
                                <div>Generated by {report.generatedBy} on {report.date}</div>
                                {report.type && <div className="text-navy-500">Type: {report.type}</div>}
                              </div>
                            </div>
                          </div>
                        </div>
                        <span className="badge-neutral text-xs">{report.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: any;
  tone: 'navy' | 'green' | 'red' | 'amber' | 'blue' | 'purple';
}) {
  const toneMap = {
    navy: { bg: 'bg-navy-100', text: 'text-navy-700' },
    green: { bg: 'bg-accent-green-soft', text: 'text-accent-green' },
    red: { bg: 'bg-accent-red-soft', text: 'text-accent-red' },
    amber: { bg: 'bg-accent-amber-soft', text: 'text-accent-amber' },
    blue: { bg: 'bg-blue-100', text: 'text-blue-700' },
    purple: { bg: 'bg-purple-100', text: 'text-purple-700' },
  };
  const t = toneMap[tone];
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="text-xs font-medium text-navy-400 uppercase tracking-wide">{label}</div>
          <div className="mt-2 text-2xl font-bold text-navy-800">{value.toLocaleString()}</div>
        </div>
        <div className={`h-10 w-10 rounded-lg ${t.bg} ${t.text} flex items-center justify-center shrink-0`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

function ScorePill({ score, bold }: { score: number; bold?: boolean }) {
  const color = score >= 95 ? '#16a34a' : score >= 85 ? '#d97706' : '#dc2626';
  return (
    <span
      className={`text-xs ${bold ? 'font-bold' : 'font-semibold'} px-2 py-1 rounded`}
      style={{ color, backgroundColor: `${color}20` }}
    >
      {score}%
    </span>
  );
}

function DetailDrawer({
  isOpen,
  onClose,
  loading,
  data,
}: {
  isOpen: boolean;
  onClose: () => void;
  loading: boolean;
  data: any;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
      <div className="bg-white w-full max-w-3xl h-full overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-navy-100 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-semibold text-navy-800">Verification Detail</h2>
            <p className="text-xs text-navy-400 mt-0.5">Complete border crossing information</p>
          </div>
          <button onClick={onClose} className="btn-secondary">
            <X size={16} /> Close
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-navy-400 mr-3" />
              <span className="text-navy-600">Loading details...</span>
            </div>
          ) : data ? (
            <div className="space-y-6">
              {/* Traveler Section */}
              <DetailSection title="Traveler Information">
                <div className="grid grid-cols-2 gap-4">
                  <DetailField label="Full Name" value={data.traveler.fullName} />
                  <DetailField label="FAN" value={data.traveler.fan} mono />
                  <DetailField label="Nationality" value={data.traveler.nationality} />
                  <DetailField
                    label="Date of Birth"
                    value={new Date(data.traveler.dateOfBirth).toLocaleDateString()}
                  />
                  <DetailField label="Gender" value={data.traveler.gender} />
                  <DetailField label="Enrollment Status" value={data.traveler.enrollmentStatus} />
                </div>
              </DetailSection>

              {/* Border Crossing Section */}
              <DetailSection title="Border Crossing">
                <div className="grid grid-cols-2 gap-4">
                  <DetailField
                    label="Date/Time"
                    value={new Date(data.timestamp).toLocaleString()}
                  />
                  <DetailField label="Checkpoint" value={data.checkpoint?.name || 'N/A'} />
                  <DetailField label="Location" value={data.checkpoint?.location || 'N/A'} />
                  <DetailField label="Direction" value={data.direction || 'N/A'} />
                  <DetailField label="Officer" value={data.officer.name} />
                  <DetailField
                    label="Final Decision"
                    value={
                      data.finalDecision === 'VERIFIED'
                        ? 'VERIFIED'
                        : data.finalDecision === 'REJECTED'
                        ? 'REJECTED'
                        : 'PENDING REVIEW'
                    }
                  />
                </div>
              </DetailSection>

              {/* Watchlist Information */}
              <DetailSection title="Watchlist Information">
                <div className="grid grid-cols-2 gap-4">
                  <DetailField
                    label="Alert Status at Verification"
                    value={data.alertStatusAtVerification || 'NONE'}
                    badge
                    badgeColor={
                      data.alertStatusAtVerification === 'CRITICAL'
                        ? 'red'
                        : data.alertStatusAtVerification === 'WARNING'
                        ? 'amber'
                        : 'green'
                    }
                  />
                  <DetailField
                    label="Alert Reason"
                    value={data.alertReasonAtVerification || 'None'}
                  />
                </div>
                {data.alertStatusAtVerification && data.alertStatusAtVerification !== 'NONE' && (
                  <div className="mt-3 p-3 bg-accent-amber-soft rounded-lg border border-amber-200">
                    <p className="text-xs text-amber-800">
                      <strong>Note:</strong> This is the watchlist status at the time of verification. The
                      traveler's current status may differ.
                    </p>
                  </div>
                )}
              </DetailSection>

              {/* Biometric Verification */}
              <DetailSection title="Biometric Verification">
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="card p-4">
                      <div className="flex items-center gap-2 text-navy-500 mb-2">
                        <Fingerprint size={16} />
                        <span className="text-xs font-semibold uppercase">Fingerprint</span>
                      </div>
                      <div className="text-2xl font-bold text-navy-800">{data.fingerprintScore}%</div>
                      <div className="text-xs text-navy-400 mt-1">Match Score</div>
                    </div>

                    <div className="card p-4">
                      <div className="flex items-center gap-2 text-navy-500 mb-2">
                        <ScanEye size={16} />
                        <span className="text-xs font-semibold uppercase">Iris</span>
                      </div>
                      <div className="text-2xl font-bold text-navy-800">{data.irisScore}%</div>
                      <div className="text-xs text-navy-400 mt-1">Match Score</div>
                    </div>

                    <div className="card p-4 bg-navy-50">
                      <div className="flex items-center gap-2 text-navy-700 mb-2">
                        <Shield size={16} />
                        <span className="text-xs font-semibold uppercase">Overall</span>
                      </div>
                      <div className="text-2xl font-bold text-navy-800">{data.finalScore}%</div>
                      <div className="text-xs text-navy-600 mt-1">Final Confidence</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <DetailField label="Threshold Used" value={`${data.threshold}%`} />
                    <DetailField
                      label="System Decision"
                      value={data.systemDecision || data.finalDecision}
                    />
                  </div>
                </div>
              </DetailSection>

              {/* Decision Section */}
              {data.decisionReason && (
                <DetailSection title="Decision">
                  <DetailField label="Decision Reason" value={data.decisionReason} />
                </DetailSection>
              )}

              {/* Manual Review Section */}
              {data.manualReviewRequest && (
                <DetailSection title="Manual Review">
                  <div className="grid grid-cols-2 gap-4">
                    <DetailField label="Reason" value={data.manualReviewRequest.reason.replace(/_/g, ' ')} />
                    <DetailField label="Status" value={data.manualReviewRequest.status} />
                    {data.manualReviewRequest.decision && (
                      <DetailField label="Supervisor Decision" value={data.manualReviewRequest.decision} />
                    )}
                    {data.manualReviewRequest.supervisor && (
                      <DetailField label="Supervisor" value={data.manualReviewRequest.supervisor.name} />
                    )}
                  </div>
                  {data.manualReviewRequest.supervisorNotes && (
                    <div className="mt-3">
                      <DetailField label="Supervisor Notes" value={data.manualReviewRequest.supervisorNotes} />
                    </div>
                  )}
                </DetailSection>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-navy-400">No data available</div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-navy-800 mb-4 pb-2 border-b border-navy-100">{title}</h3>
      {children}
    </div>
  );
}

function DetailField({
  label,
  value,
  mono,
  badge,
  badgeColor,
}: {
  label: string;
  value: string;
  mono?: boolean;
  badge?: boolean;
  badgeColor?: 'green' | 'amber' | 'red';
}) {
  return (
    <div>
      <div className="text-xs text-navy-400 uppercase tracking-wide font-medium mb-1">{label}</div>
      {badge ? (
        <span
          className={`inline-block text-xs font-bold px-2 py-1 rounded ${
            badgeColor === 'red'
              ? 'bg-accent-red-soft text-accent-red'
              : badgeColor === 'amber'
              ? 'bg-accent-amber-soft text-accent-amber'
              : 'bg-accent-green-soft text-accent-green'
          }`}
        >
          {value}
        </span>
      ) : (
        <div className={`text-sm font-medium text-navy-800 ${mono ? 'font-mono' : ''}`}>{value}</div>
      )}
    </div>
  );
}
