import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { authService } from '../services/authService';
import api, { getApiErrorMessage } from '../services/api';
import { normalizeRole, type AuthUser, type Role } from '../types';

function clearAuthArtifacts() {
  const keys = ['iabc_token', 'iabc_user', 'iabc_last_active', 'iabc_session_timeout'];
  for (const key of keys) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }

  if (typeof document !== 'undefined') {
    document.cookie
      .split(';')
      .map((cookie) => cookie.trim().split('=')[0])
      .filter((name) => name.startsWith('iabc_'))
      .forEach((name) => {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      });
  }
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  sessionExpiredMessage: string | null;
  login: (email: string, password: string) => Promise<Role>;
  logout: (expiredReason?: string) => void;
  clearError: () => void;
  clearSessionExpiredMessage: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string | null>(null);

  useEffect(() => {
    clearAuthArtifacts();
    setUser(null);
    setError(null);
    setSessionExpiredMessage(null);
  }, []);

  const logout = useCallback((expiredReason?: string) => {
    clearAuthArtifacts();
    setUser(null);
    setError(null);
    if (expiredReason) {
      setSessionExpiredMessage(expiredReason);
    } else {
      setSessionExpiredMessage(null);
    }
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<Role> => {
    setLoading(true);
    setError(null);
    setSessionExpiredMessage(null);
    try {
      const data = await authService.login(email, password);
      const role = normalizeRole(data.role);
      const authUser: AuthUser = {
        id: String(data.id),
        name: data.name,
        email,
        role,
      };
      localStorage.setItem('iabc_token', data.token);
      localStorage.setItem('iabc_user', JSON.stringify(authUser));
      localStorage.setItem('iabc_last_active', String(Date.now()));

      // Fetch dynamic session timeout setting from server
      try {
        const settingsRes = await api.get('/settings');
        if (settingsRes.data?.sessionTimeout) {
          localStorage.setItem('iabc_session_timeout', String(settingsRes.data.sessionTimeout));
        }
      } catch {
        // Fallback default timeout 30 mins
        localStorage.setItem('iabc_session_timeout', '30');
      }

      setUser(authUser);
      return role;
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Login failed. Check your credentials.');
      setError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const clearSessionExpiredMessage = useCallback(() => setSessionExpiredMessage(null), []);

  // Periodic check for session timeout
  useEffect(() => {
    if (!user) return;

    const checkTimeout = () => {
      const lastActive = Number(localStorage.getItem('iabc_last_active') || 0);
      const timeoutMins = Number(localStorage.getItem('iabc_session_timeout') || 30);
      const maxInactiveMs = timeoutMins * 60 * 1000;

      if (lastActive && Date.now() - lastActive > maxInactiveMs) {
        logout('Your session has expired. Please log in again.');
      }
    };

    const interval = setInterval(checkTimeout, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, [user, logout]);

  // Track user activity (mousemove, keydown, click) to extend active session
  useEffect(() => {
    if (!user) return;

    const updateLastActive = () => {
      const now = Date.now();
      const last = Number(localStorage.getItem('iabc_last_active') || 0);
      // Throttle updates to once per 10 seconds
      if (now - last > 10000) {
        localStorage.setItem('iabc_last_active', String(now));
      }
    };

    window.addEventListener('mousemove', updateLastActive);
    window.addEventListener('keydown', updateLastActive);
    window.addEventListener('click', updateLastActive);

    return () => {
      window.removeEventListener('mousemove', updateLastActive);
      window.removeEventListener('keydown', updateLastActive);
      window.removeEventListener('click', updateLastActive);
    };
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        sessionExpiredMessage,
        login,
        logout,
        clearError,
        clearSessionExpiredMessage,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
