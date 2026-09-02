import api from './api';
import type { Traveler } from '../types';

export interface TravelerIdentifyResponse extends Traveler {
  matchScore?: number;
}

export const travelerService = {
  lookup: async (fan: string) => {
    const { data } = await api.get<Traveler>(`/travelers/${encodeURIComponent(fan)}`);
    return data;
  },
  identifyByFingerprint: async (source: File | string) => {
    if (source instanceof File) {
      const formData = new FormData();
      formData.append('fingerprintImage', source);
      const { data } = await api.post<TravelerIdentifyResponse>('/travelers/identify', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    } else {
      const { data } = await api.post<TravelerIdentifyResponse>('/travelers/identify', {
        fingerprintData: source,
      });
      return data;
    }
  },
};

