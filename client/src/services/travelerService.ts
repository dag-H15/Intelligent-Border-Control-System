import api from './api';
import type { Traveler } from '../types';

export const travelerService = {
  lookup: async (fan: string) => {
    const { data } = await api.get<Traveler>(`/travelers/${encodeURIComponent(fan)}`);
    return data;
  },
};
