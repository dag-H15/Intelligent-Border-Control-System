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
  startDate: string;
  endDate: string;
  createdAt: string;
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
    name: report.reportType.split('_').join(' '),
    type: report.reportType.split('_').join(' '),
    generatedBy: report.generatedByUser?.name ?? 'System',
    date: new Date(report.createdAt).toLocaleString(),
    /** Store the original UTC dates so handleDownloadPrevious can use them. */
    startDate: report.startDate,
    endDate: report.endDate,
    status: 'Generated',
  };
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

  /** Get a specific generated report by ID */
  getReportById: async (id: number) => {
    const { data } = await api.get(`/reports/${id}`);
    return data.report;
  },
};
