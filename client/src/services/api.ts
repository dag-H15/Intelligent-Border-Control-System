import axios from 'axios';
import type { ApiErrorResponse } from '../types';

const BASE_URL = 'http://localhost:5000/api';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('iabc_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-logout on 401
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('iabc_token');
      localStorage.removeItem('iabc_user');
    }
    return Promise.reject(error);
  }
);

export function getApiErrorMessage(error: unknown, fallback = 'Request failed.') {
  const response = (error as { response?: { data?: ApiErrorResponse } })?.response?.data;
  return response?.message ?? response?.error ?? fallback;
}

export default api;
