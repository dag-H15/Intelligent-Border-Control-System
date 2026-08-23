import api from './api';
import type { ReportRecord, ReportSummary } from '../types';

export type { ReportRecord } from '../types';

export interface ReportParams {
  startDate?: string;
  endDate?: string;
  /** Numeric database ID of the officer. Omit (or leave undefined) for all officers. */
  officerId?: number;
}

interface BackendReportRecord {
  id: number;
  reportType: string;
  reportTitle: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  recordCount?: number;
  generatedByUser?: {
    name: string;
    role: string;
  };
}

export interface VerificationSummaryResponse {
  report: BackendReportRecord;
  summary: ReportSummary;
}

export interface OverrideSummaryResponse {
  report: BackendReportRecord;
  summary: ReportSummary;
}

export interface OfficerActivitySummaryResponse {
  report: BackendReportRecord;
  summary: Array<{ officerId: number; officerName: string; verifications: number }>;
}

export interface ManualReviewSummaryResponse {
  report: BackendReportRecord;
  summary: Array<{
    id: number;
    travelerName: string;
    passportNo: string;
    manualReviewType: string;
    officer: string;
    supervisor: string;
    decision: string;
    submissionDate: string;
    reviewDate: string;
  }>;
}

/** An officer entry returned by GET /api/reports/officers */
export interface OfficerOption {
  id: number;
  name: string;
}

function mapReportRecord(report: BackendReportRecord): ReportRecord {
  return {
    id: String(report.id),
    name: report.reportTitle || report.reportType.split('_').join(' '),
    type: report.reportType.split('_').join(' '),
    generatedBy: report.generatedByUser?.name ?? 'System',
    date: new Date(report.createdAt).toLocaleString(),
    /** Store the original UTC dates so handleDownloadPrevious can use them. */
    startDate: report.startDate,
    endDate: report.endDate,
    recordCount: report.recordCount,
    status: 'Generated',
  };
}

/** A saved BORDER_CROSSING report snapshot as returned by the backend. */
export interface GeneratedReportSnapshot {
  id: number;
  reportType: string;
  reportTitle: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  recordCount: number;
  generatedByUser?: { id: number; name: string; email: string; role: string };
  filters: {
    officerId?: number;
    checkpointId?: number;
    direction?: string;
    decision?: string;
    alertStatus?: string;
    labels?: {
      officer: string;
      checkpoint: string;
      direction: string;
      decision: string;
      watchlistStatus: string;
    };
  };
  summaryData?: {
    totalCrossings: number;
    verified: number;
    rejected: number;
    pendingReview: number;
    entries: number;
    exits: number;
    manualReviews: number;
    watchlistWarnings: number;
    watchlistCritical: number;
  } | null;
  chartData?: {
    decisions: { verified: number; pending: number; rejected: number };
    directionBreakdown: { entry: number; exit: number };
    watchlistBreakdown?: { none: number; warning: number; critical: number };
    byCheckpoint: Array<{ name: string; count: number }>;
    overTime: Array<{ date: string; count: number }>;
  } | null;
  recordsData?: Array<{
    verificationId: number;
    timestamp: string;
    direction: string;
    fingerprintScore: number;
    irisScore: number;
    finalScore: number;
    threshold: number;
    systemDecision: string;
    finalDecision: string;
    decisionReason: string | null;
    alertStatusAtVerification: string;
    alertReasonAtVerification: string | null;
    checkpointName: string | null;
    checkpointLocation: string | null;
    officerName: string | null;
    travelerName: string | null;
    travelerFan: string | null;
    travelerNationality: string | null;
    manualReview: {
      status: string;
      reason: string;
      decision?: string | null;
      supervisorNotes: string | null;
      supervisorName: string | null;
      decidedAt: string;
    } | null;
  }> | null;
}

export const reportService = {
  verificationSummary: async (params: ReportParams) => {
    const { data } = await api.post<VerificationSummaryResponse>(
      '/reports/verification-summary',
      params,
    );
    return data;
  },

  overrideSummary: async (params: ReportParams) => {
    const { data } = await api.post<OverrideSummaryResponse>(
      '/reports/override-summary',
      params,
    );
    return data;
  },

  officerActivity: async (params: ReportParams) => {
    const { data } = await api.post<OfficerActivitySummaryResponse>(
      '/reports/officer-activity',
      // Only include officerId in the payload when it has a real value so the
      // backend treats an absent key as "all officers" rather than erroring on 0.
      {
        startDate: params.startDate,
        endDate: params.endDate,
        ...(params.officerId !== undefined ? { officerId: params.officerId } : {}),
      },
    );
    return data;
  },

  manualReviewSummary: async (params: ReportParams) => {
    const { data } = await api.post<ManualReviewSummaryResponse>(
      '/reports/manual-review-summary',
      params,
    );
    return data;
  },

  getReports: async () => {
    const { data } = await api.get<{ reports: BackendReportRecord[] }>('/reports');
    return data.reports.map(mapReportRecord);
  },

  /** Fetch all users with the OFFICER role for the dropdown. */
  getOfficers: async (): Promise<OfficerOption[]> => {
    const { data } = await api.get<{ officers: OfficerOption[] }>('/reports/officers');
    return data.officers;
  },

  /** New comprehensive API endpoints */

  getDetailedRecords: async (filters: {
    startDate: string;
    endDate: string;
    officerId?: number;
    checkpointId?: number;
    direction?: 'ENTRY' | 'EXIT';
    decision?: 'VERIFIED' | 'PENDING_SUPERVISOR_REVIEW' | 'REJECTED';
    alertStatus?: 'NONE' | 'WARNING' | 'CRITICAL';
    page?: number;
    limit?: number;
  }) => {
    const { data } = await api.post('/reports/detailed-records', filters);
    return data;
  },

  getStatistics: async (filters: {
    startDate: string;
    endDate: string;
    officerId?: number;
    checkpointId?: number;
    direction?: 'ENTRY' | 'EXIT';
    decision?: 'VERIFIED' | 'PENDING_SUPERVISOR_REVIEW' | 'REJECTED';
    alertStatus?: 'NONE' | 'WARNING' | 'CRITICAL';
  }) => {
    const { data } = await api.post('/reports/statistics', filters);
    return data;
  },

  getChartData: async (filters: {
    startDate: string;
    endDate: string;
    officerId?: number;
    checkpointId?: number;
    direction?: 'ENTRY' | 'EXIT';
    alertStatus?: 'NONE' | 'WARNING' | 'CRITICAL';
  }) => {
    const { data } = await api.post('/reports/chart-data', filters);
    return data;
  },

  getVerificationDetail: async (id: number) => {
    const { data } = await api.get(`/reports/verification-detail/${id}`);
    return data;
  },

  /** Save a generated report with metadata */
  saveGeneratedReport: async (reportData: {
    reportType: string;
    reportTitle: string;
    startDate: string;
    endDate: string;
    filters: any;
    summaryData: any;
    recordCount: number;
  }) => {
    const { data } = await api.post('/reports/save', reportData);
    return data.report;
  },

  /**
   * Supervisor action: generate a full BORDER_CROSSING report snapshot from the
   * current filters. The backend computes statistics, chart aggregations and
   * detailed records from a single authoritative query and stores them so the
   * report stays historically accurate.
   */
  generateReport: async (payload: {
    reportTitle: string;
    startDate: string;
    endDate: string;
    officerId?: number;
    checkpointId?: number;
    direction?: 'ENTRY' | 'EXIT';
    decision?: 'VERIFIED' | 'PENDING_SUPERVISOR_REVIEW' | 'REJECTED';
    alertStatus?: 'NONE' | 'WARNING' | 'CRITICAL';
  }): Promise<GeneratedReportSnapshot> => {
    const { data } = await api.post<{ report: GeneratedReportSnapshot }>('/reports/generate', payload);
    return data.report;
  },

  /** Get a specific generated report (including its stored snapshot) by ID */
  getReportById: async (id: number): Promise<GeneratedReportSnapshot> => {
    const { data } = await api.get<{ report: GeneratedReportSnapshot }>(`/reports/${id}`);
    return data.report;
  },
};
