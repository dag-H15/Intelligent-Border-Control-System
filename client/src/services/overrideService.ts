import api from './api';
import type { PendingCase } from '../types';

export type { PendingCase } from '../types';

interface BackendPendingVerification {
  id: number;
  traveler?: {
    fan: string;
    fullName: string;
  };
  officer?: {
    id: number;
    name: string;
  };
  fingerprintScore: number;
  irisScore: number;
  finalScore: number;
  finalDecision: string;
  timestamp: string;
}

function mapPendingCase(log: BackendPendingVerification): PendingCase {
  return {
    id: String(log.id),
    verificationId: String(log.id),
    travelerName: log.traveler?.fullName ?? 'Unknown traveler',
    fiydaId: log.traveler?.fan ?? '—',
    nationality: '—',
    officer: log.officer?.name ?? 'Unknown officer',
    time: new Date(log.timestamp).toLocaleString(),
    fingerprintScore: log.fingerprintScore,
    irisScore: log.irisScore,
    finalScore: log.finalScore,
    gender: '—',
    dob: '—',
    passportNo: '—',
    status: log.finalDecision,
  };
}

export interface OverridePayload {
  decision: 'VERIFIED' | 'REJECTED';
  reason: string;
}

export const overrideService = {
  getPending: async () => {
    const { data } = await api.get<{ pendingVerifications: BackendPendingVerification[] }>('/override/pending');
    return data.pendingVerifications.map(mapPendingCase);
  },

  submitOverride: (verificationId: string, payload: OverridePayload) =>
    api.post(`/override/${verificationId}`, payload).then((r) => r.data),
};
