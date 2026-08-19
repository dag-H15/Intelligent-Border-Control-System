import type { Role } from '../types';
import type { PageKey } from './AppShell';

// Which pages each role is allowed to access
export const allowedPages: Record<Role, PageKey[]> = {
  officer: ['dashboard', 'enrollment', 'verify', 'officer_manual_review', 'history'],
  supervisor: ['supervisor', 'pending', 'supervisor_manual_review', 'reports'],
  admin: ['admin', 'users', 'audit', 'settings', 'reports'],
};

// Default landing page per role
export function defaultPageForRole(role: Role): PageKey {
  if (role === 'officer') return 'dashboard';
  if (role === 'supervisor') return 'supervisor';
  return 'admin';
}

export function isPageAllowed(role: Role, page: PageKey): boolean {
  return allowedPages[role].includes(page);
}
