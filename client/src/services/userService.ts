import api from './api';
import type { BackendRole } from '../types';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: BackendRole;
  failedAttempts?: number;
  lockedUntil?: string | null;
  isLocked?: boolean;
  createdDate: string;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  role: BackendRole;
}

export interface UpdateUserPayload {
  name?: string;
  email?: string;
  role?: BackendRole;
}

export const userService = {
  getUsers: async () => {
    const { data } = await api.get<{ users: UserRecord[] }>('/users');
    return data.users;
  },

  createUser: async (payload: CreateUserPayload) => {
    const { data } = await api.post<{ user: UserRecord }>('/users', payload);
    return data.user;
  },

  updateUser: async (userId: string, payload: UpdateUserPayload) => {
    const { data } = await api.put<{ user: UserRecord }>(`/users/${userId}`, payload);
    return data.user;
  },

  resetPassword: async (userId: string, password: string) => {
    const { data } = await api.patch<{ user: UserRecord }>(`/users/${userId}/password`, { password });
    return data.user;
  },

  unlockUser: async (userId: string) => {
    const { data } = await api.patch<{ user: UserRecord }>(`/users/${userId}/unlock`);
    return data.user;
  },

  deleteUser: async (userId: string) => {
    const { data } = await api.delete<{ success: boolean }>(`/users/${userId}`);
    return data;
  },
};
