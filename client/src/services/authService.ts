import api from './api';
import type { BackendRole } from '../types';

export interface LoginResponse {
  token: string;
  id: string | number;
  name: string;
  role: BackendRole;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  role: BackendRole;
}

export const authService = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>('/auth/login', { email, password }).then((r) => r.data),

  register: (payload: RegisterPayload) =>
    api.post<LoginResponse>('/auth/register', payload).then((r) => r.data),
};
