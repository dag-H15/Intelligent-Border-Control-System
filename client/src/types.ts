export type Role = 'officer' | 'supervisor' | 'admin';
export type BackendRole = 'OFFICER' | 'SUPERVISOR' | 'ADMIN';

export type VerificationResult = 'verified' | 'pending' | 'rejected';
export type VerificationDecision = 'VERIFIED' | 'PENDING_SUPERVISOR_REVIEW' | 'REJECTED';
export type AuditLevel = 'INFO' | 'WARNING' | 'CRITICAL';
export type ReportType = 'VERIFICATION_SUMMARY' | 'OVERRIDE_SUMMARY' | 'OFFICER_ACTIVITY';

export interface ApiErrorResponse {
  message?: string;
  error?: string;
}

export interface ApiResponse<T> {
  data?: T;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: BackendRole;
  createdDate: string;
}

export interface Traveler {
  id: number;
  fan: string;
  fullName: string;
  dateOfBirth: string;
  gender: 'MALE' | 'FEMALE';
  nationality: string;
  enrollmentStatus: 'PENDING' | 'ENROLLED';
  photo: string | null;
}

export interface VerificationRecord {
  id: string;
  verificationId?: number;
  travelerName: string;
  fiydaId: string;
  officer: string;
  date: string;
  result: VerificationResult;
  fingerprintScore: number;
  irisScore: number;
  finalScore: number;
}

export interface PendingCase {
  id: string;
  verificationId: string;
  travelerName: string;
  fiydaId: string;
  nationality: string;
  officer: string;
  time: string;
  fingerprintScore: number;
  irisScore: number;
  finalScore: number;
  gender: string;
  dob: string;
  passportNo: string;
  status: string;
}

export interface ReportRecord {
  id: string;
  name: string;
  type: string;
  generatedBy: string;
  date: string;
  status: string;
}

export interface ReportSummary {
  total: number;
  verified?: number;
  rejected?: number;
  pendingSupervisorReview?: number;
  approvedToVerified?: number;
  approvedToRejected?: number;
  officerId?: number;
  officerName?: string;
  verifications?: number;
}

export interface AuditEntry {
  id: string;
  user: string;
  action: string;
  time: string;
  ip: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface SystemSettings {
  approvalThreshold: number;
  reviewRangeMin: number;
  reviewRangeMax: number;
  rejectBelow: number;
  sessionTimeout: number;
  maxLoginAttempts: number;
}

// Backend returns uppercase roles; normalize to lowercase for the UI.
export function normalizeRole(role: string): Role {
  return role.toLowerCase() as Role;
}

export function normalizeVerificationResult(decision: string): VerificationResult {
  if (decision === 'VERIFIED') return 'verified';
  if (decision === 'PENDING_SUPERVISOR_REVIEW') return 'pending';
  return 'rejected';
}
