import api from './api';
import { normalizeVerificationResult, type VerificationRecord } from '../types';

export type { VerificationRecord } from '../types';

export type CaptureMode = 'SIMULATION' | 'SCANNER';

export interface VerificationPayload {
  travelerId: number;
  captureMode: CaptureMode;
  fingerprintImage?: string;
  irisImage?: string;
  fingerprintData?: string;
  irisData?: string;
  threshold?: number;
  direction?: 'ENTRY' | 'EXIT';
  checkpointId?: number;
}

interface BackendTraveler {
  id: number;
  fan: string;
  fullName: string;
  nationality: string;
  dateOfBirth: string;
  gender: 'MALE' | 'FEMALE';
  enrollmentStatus: 'DRAFT' | 'COMPLETED';
  photo?: string;
}

interface BackendVerificationLog {
  id: number;
  officerId?: number;
  fingerprintScore: number;
  irisScore: number;
  finalScore: number;
  finalDecision: string;
  systemDecision?: string;
  timestamp: string;
}

interface VerifyResponse {
  verificationLog: BackendVerificationLog;
  traveler: BackendTraveler;
}

interface MyActivityResponse {
  verificationLogs: Array<BackendVerificationLog & {
    traveler: BackendTraveler;
  }>;
}

function mapVerificationLog(log: any, traveler: BackendTraveler, officerName?: string): VerificationRecord {
  return {
    id: String(log.id),
    verificationId: log.id,
    travelerName: traveler.fullName,
    fiydaId: traveler.fan,
    officer: officerName ?? (log.officerId ? `Officer #${log.officerId}` : 'Unknown'),
    date: new Date(log.timestamp).toLocaleString(),
    result: normalizeVerificationResult(log.finalDecision),
    fingerprintScore: log.fingerprintScore,
    irisScore: log.irisScore,
    finalScore: log.finalScore,
    threshold: log.threshold,
    direction: log.direction,
    checkpointName: log.checkpoint?.name,
    alertStatusAtVerification: log.alertStatusAtVerification,
    alertReasonAtVerification: log.alertReasonAtVerification,
  };
}

export const verificationService = {
  verify: async (payload: VerificationPayload) => {
    const { data } = await api.post<VerifyResponse>('/verification', payload);
    return mapVerificationLog(data.verificationLog, data.traveler);
  },

  getMyActivity: async () => {
    const { data } = await api.get<MyActivityResponse>('/verification/my-activity');
    return data.verificationLogs.map((log) => mapVerificationLog(log, log.traveler));
  },

  checkQuality: async (payload: { biometricType: 'fingerprint' | 'iris'; image?: string; imageData?: string }) => {
    const { data } = await api.post<{ score: number; acceptable: boolean; details?: any }>('/verification/quality', payload);
    return data;
  },

  getStats: async () => {
    const { data } = await api.get<{
      todayCrossings: number;
      todayEntries: number;
      todayExits: number;
      todayAccepted: number;
      todayRejected: number;
      todayReviews: number;
    }>('/verification/stats');
    return data;
  },
};
