import api from './api';
import type { ManualReviewDecision, ManualReviewReason, ManualReviewRecord } from '../types';

export interface ManualReviewAttachmentInput {
  file: File;
}

export interface CreateManualReviewPayload {
  travelerId: number;
  reason: ManualReviewReason;
  officerNotes: string;
  verificationId?: number;
  attachments?: File[];
}

export interface DecideManualReviewPayload {
  decision: ManualReviewDecision;
  notes: string;
}

function formDataFromPayload(payload: CreateManualReviewPayload) {
  const formData = new FormData();
  formData.append('travelerId', String(payload.travelerId));
  formData.append('reason', payload.reason);
  formData.append('officerNotes', payload.officerNotes);
  if (payload.verificationId !== undefined) formData.append('verificationId', String(payload.verificationId));
  (payload.attachments ?? []).forEach((file) => formData.append('attachments', file));
  return formData;
}

export const manualReviewService = {
  create: async (payload: CreateManualReviewPayload) => {
    const { data } = await api.post<{ manualReviewRequest: ManualReviewRecord }>('/manual-reviews', formDataFromPayload(payload), {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.manualReviewRequest;
  },

  getPending: async () => {
    const { data } = await api.get<{ manualReviewRequests: ManualReviewRecord[] }>('/manual-reviews/pending');
    return data.manualReviewRequests;
  },

  getHistory: async () => {
    const { data } = await api.get<{ manualReviewRequests: ManualReviewRecord[] }>('/manual-reviews/history');
    return data.manualReviewRequests;
  },

  decide: async (requestId: number, payload: DecideManualReviewPayload) => {
    const { data } = await api.patch<{ manualReviewRequest: ManualReviewRecord }>(`/manual-reviews/${requestId}`, payload);
    return data.manualReviewRequest;
  },
};