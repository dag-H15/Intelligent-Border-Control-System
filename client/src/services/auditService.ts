import api from './api';
import type { AuditEntry } from '../types';

export type { AuditEntry } from '../types';

interface BackendAuditEntry {
  id: number;
  action: string;
  timestamp: string;
  ipAddress: string;
  level: 'INFO' | 'WARNING' | 'CRITICAL';
  user?: {
    name: string;
    role: string;
    email: string;
  } | null;
}

function mapAuditLevel(level: BackendAuditEntry['level']): AuditEntry['severity'] {
  if (level === 'WARNING') return 'warning';
  if (level === 'CRITICAL') return 'critical';
  return 'info';
}

export const auditService = {
  getLogs: async () => {
    const { data } = await api.get<{ auditLogs: BackendAuditEntry[] }>('/audit-logs');
    return data.auditLogs.map((entry) => ({
      id: String(entry.id),
      user: entry.user?.name ?? 'System',
      action: entry.action,
      time: new Date(entry.timestamp).toLocaleString(),
      ip: entry.ipAddress,
      severity: mapAuditLevel(entry.level),
    }));
  },
};
