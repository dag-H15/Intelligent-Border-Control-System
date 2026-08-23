import api from './api';

/** Audit severity levels — mirrors the backend AuditLevel enum. */
export type AuditLevelValue = 'INFO' | 'WARNING' | 'CRITICAL';

/** Canonical result values written by the backend. */
export type AuditResultValue =
  | 'SUCCESS'
  | 'FAILED'
  | 'VERIFIED'
  | 'REJECTED'
  | 'PENDING'
  | 'APPROVED'
  | 'DENIED';

export interface AuditLogUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

/** Raw audit event as returned by the API (timestamp is an ISO string). */
export interface AuditEvent {
  id: number;
  userId: number | null;
  action: string;
  level: AuditLevelValue;
  ipAddress: string;
  timestamp: string;
  resourceType: string | null;
  resourceId: string | null;
  result: string | null;
  description: string | null;
  metadata: {
    changes?: Array<{ field: string; previous: unknown; new: unknown }>;
    [key: string]: unknown;
  } | null;
  user: AuditLogUser | null;
}

export interface AuditPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AuditQueryParams {
  q?: string;
  userId?: number;
  role?: string;
  actionType?: string;
  level?: string;
  result?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface AuditStats {
  eventsToday: number;
  loginsToday: number;
  overridesToday: number;
  enrollmentsToday: number;
  verificationsToday: number;
}

function toSearchParams(params: AuditQueryParams): Record<string, string> {
  const sp: Record<string, string> = {};
  if (params.q) sp.q = params.q;
  if (params.userId !== undefined) sp.userId = String(params.userId);
  if (params.role && params.role !== 'all') sp.role = params.role;
  if (params.actionType && params.actionType !== 'all') sp.actionType = params.actionType;
  if (params.level && params.level !== 'all') sp.level = params.level;
  if (params.result && params.result !== 'all') sp.result = params.result;
  if (params.startDate) sp.startDate = params.startDate;
  if (params.endDate) sp.endDate = params.endDate;
  return sp;
}

export const auditService = {
  /** Filtered + paginated audit events straight from the database. */
  getLogs: async (params: AuditQueryParams = {}) => {
    const { data } = await api.get<{ auditLogs: AuditEvent[]; pagination: AuditPagination }>(
      '/audit-logs',
      { params: { ...toSearchParams(params), page: params.page ?? 1, limit: params.limit ?? 20 } }
    );
    return data;
  },

  /** Today's summary-card counts, aggregated in the database. */
  getStats: async (): Promise<AuditStats> => {
    const { data } = await api.get<AuditStats>('/audit-logs/stats');
    return data;
  },

  /** Single event for the detail drawer. */
  getLogDetail: async (id: number): Promise<AuditEvent> => {
    const { data } = await api.get<AuditEvent>(`/audit-logs/${id}`);
    return data;
  },

  /**
   * Download a CSV of all events matching the current filters.
   * The backend streams the file; we hand it to the browser as a download.
   */
  exportCsv: async (params: AuditQueryParams = {}) => {
    const response = await api.get('/audit-logs/export', {
      params: toSearchParams(params),
      responseType: 'blob',
    });

    const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },
};

/**
 * Professional timestamp rendering, e.g. "24 Aug 2026, 10:32:15 AM".
 * The API returns UTC ISO strings; Date parses them and this renders
 * them in the viewer's local timezone.
 */
export function formatAuditTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let hours = d.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${hours}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${ampm}`;
}
