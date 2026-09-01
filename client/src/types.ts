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

export type AlertStatus = 'NONE' | 'WARNING' | 'CRITICAL';

export interface Traveler {
  id: number;
  fan: string;
  fullName: string;
  dateOfBirth: string;
  gender: 'MALE' | 'FEMALE';
  nationality: string;
  enrollmentStatus: 'DRAFT' | 'COMPLETED';
  photo: string | null;
  alertStatus: AlertStatus;
  alertReason: string | null;
}

export type ManualReviewReason =
  | 'FINGERPRINT_INJURY'
  | 'IRIS_INJURY'
  | 'BIOMETRIC_UNAVAILABLE'
  | 'THRESHOLD_BREACH'
  | 'ALERT_WARNING'
  | 'QUALITY_ISSUE';
export type ManualReviewDecision = 'APPROVED_OVERRIDE' | 'REJECTED' | 'REQUEST_RE_ENROLLMENT';
export type ManualReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'RE_ENROLLMENT_REQUESTED';

export interface ManualReviewAttachment {
  originalName: string;
  mimeType: string;
  size: number;
  data: string;
}

export interface ManualReviewRecord {
  id: number;
  travelerId: number;
  officerId: number;
  verificationId?: number | null;
  reason: ManualReviewReason;
  officerNotes: string;
  attachments: ManualReviewAttachment[];
  decision?: ManualReviewDecision | null;
  status: ManualReviewStatus;
  supervisorId?: number | null;
  supervisorNotes?: string | null;
  createdAt: string;
  updatedAt: string;
  traveler?: {
    fan: string;
    fullName: string;
    enrollmentStatus: 'DRAFT' | 'COMPLETED';
  };
  officer?: {
    id: number;
    name: string;
  };
  supervisor?: {
    id: number;
    name: string;
  };
  verification?: {
    id: number;
    fingerprintScore: number;
    irisScore: number;
    finalScore: number;
    finalDecision: string;
    threshold?: number | null;
    decisionReason?: string | null;
    direction?: 'ENTRY' | 'EXIT' | null;
    checkpoint?: { id: number; name: string } | null;
    alertStatusAtVerification?: string | null;
    alertReasonAtVerification?: string | null;
  };
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
  threshold?: number;
  decisionReason?: string | null;
  direction?: 'ENTRY' | 'EXIT';
  checkpointName?: string;
  alertStatusAtVerification?: string | null;
  alertReasonAtVerification?: string | null;
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
  /** ISO date string of the report's original start date (stored by the backend). */
  startDate?: string;
  /** ISO date string of the report's original end date (stored by the backend). */
  endDate?: string;
  /** Number of verification records captured in the report snapshot. */
  recordCount?: number;
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

export interface BiometricQualityResult {
  score: number;
  acceptable: boolean;
  biometricType?: string;
  biometricValid?: boolean;
  qualityStatus?: 'GOOD' | 'ACCEPTABLE' | 'POOR' | 'INVALID_BIOMETRIC' | string;
  issues?: string[];
  details?: {
    sharpness?: number;
    contrast?: number;
    brightness?: number;
    laplacianVariance?: number;
    usableAreaRatio?: number;
    specularRatio?: number;
    [key: string]: any;
  };
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
