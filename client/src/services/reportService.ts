import api from './api';
import type { ReportRecord, ReportSummary } from '../types';

export type { ReportRecord } from '../types';

export interface ReportParams {
  startDate?: string;
  endDate?: string;
  officerId?: string;
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

function mapReportRecord(report: BackendReportRecord): ReportRecord {
  return {
    id: String(report.id),
    name: report.reportType.split('_').join(' '),
    type: report.reportType.split('_').join(' '),
    generatedBy: report.generatedByUser?.name ?? 'System',
    date: new Date(report.createdAt).toLocaleString(),
    status: 'Generated',
  };
}

export const reportService = {
  verificationSummary: async (params: ReportParams) => {
    const { data } = await api.post<VerificationSummaryResponse>('/reports/verification-summary', params);
    return data;
  },

  overrideSummary: async (params: ReportParams) => {
    const { data } = await api.post<OverrideSummaryResponse>('/reports/override-summary', params);
    return data;
  },

  officerActivity: async (params: ReportParams) => {
    const { data } = await api.post<OfficerActivitySummaryResponse>('/reports/officer-activity', params);
    return data;
  },

  getReports: async () => {
    const { data } = await api.get<{ reports: BackendReportRecord[] }>('/reports');
    return data.reports.map(mapReportRecord);
  },
};
