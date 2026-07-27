// Centralized mock data + types for the IABC System demo.
// In production these shapes map to PostgreSQL tables via Prisma.

export type Role = 'officer' | 'supervisor' | 'admin';
export type VerificationResult = 'verified' | 'rejected' | 'pending';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: 'active' | 'inactive';
  createdDate: string;
}

export interface Traveler {
  fiydaId: string;
  name: string;
  nationality: string;
  dob: string;
  gender: 'Male' | 'Female';
  passportNo: string;
  status: 'Active' | 'Flagged' | 'Expired';
}

export interface VerificationRecord {
  id: string;
  travelerName: string;
  fiydaId: string;
  officer: string;
  date: string;
  result: VerificationResult;
  fingerprintScore: number;
  irisScore: number;
  finalScore: number;
}

export interface AuditEntry {
  id: string;
  user: string;
  action: string;
  time: string;
  ip: string;
  severity: 'info' | 'warning' | 'critical';
}

export const currentUser: User = {
  id: 'U-2041',
  name: 'Officer Abebe Bekele',
  email: 'a.bekele@border.gov',
  role: 'officer',
  status: 'active',
  createdDate: '2025-11-12',
};

export const supervisorUser: User = {
  id: 'S-0118',
  name: 'Capt. Tigist Haile',
  email: 't.haile@border.gov',
  role: 'supervisor',
  status: 'active',
  createdDate: '2025-09-03',
};

export const adminUser: User = {
  id: 'A-0007',
  name: 'Dir. Dereje Assefa',
  email: 'd.assefa@border.gov',
  role: 'admin',
  status: 'active',
  createdDate: '2025-06-21',
};

// Fiyda database simulation
export const fiydaDatabase: Record<string, Traveler> = {
  'FYD-4471-882-019': {
    fiydaId: 'FYD-4471-882-019',
    name: 'Abebe Bekele',
    nationality: 'Ethiopia',
    dob: '1989-03-14',
    gender: 'Male',
    passportNo: 'ET-7741203',
    status: 'Active',
  },
  'FYD-8821-331-447': {
    fiydaId: 'FYD-8821-331-447',
    name: 'Almaz Tadesse',
    nationality: 'Ethiopia',
    dob: '1994-11-02',
    gender: 'Female',
    passportNo: 'ET-1198745',
    status: 'Active',
  },
  'FYD-5519-204-663': {
    fiydaId: 'FYD-5519-204-663',
    name: 'Yohannes Girma',
    nationality: 'Ethiopia',
    dob: '1978-07-21',
    gender: 'Male',
    passportNo: 'ET-5093112',
    status: 'Flagged',
  },
  'FYD-7732-558-901': {
    fiydaId: 'FYD-7732-558-901',
    name: 'Meron Solomon',
    nationality: 'Ethiopia',
    dob: '1992-01-30',
    gender: 'Female',
    passportNo: 'ET-8841207',
    status: 'Active',
  },
  'FYD-3390-117-228': {
    fiydaId: 'FYD-3390-117-228',
    name: 'Bekele Nega',
    nationality: 'Ethiopia',
    dob: '1985-09-08',
    gender: 'Male',
    passportNo: 'ET-3309117',
    status: 'Active',
  },
};

export const dashboardStats = {
  todayTotal: 142,
  verified: 118,
  pending: 9,
  rejected: 15,
};

export const verificationHistory: VerificationRecord[] = [
  { id: 'V-20260720-0142', travelerName: 'Abebe Bekele', fiydaId: 'FYD-4471-882-019', officer: 'Officer Abebe Bekele', date: '2026-07-20 09:14', result: 'verified', fingerprintScore: 98, irisScore: 97, finalScore: 97.6 },
  { id: 'V-20260720-0141', travelerName: 'Almaz Tadesse', fiydaId: 'FYD-8821-331-447', officer: 'Officer Abebe Bekele', date: '2026-07-20 08:52', result: 'pending', fingerprintScore: 93, irisScore: 94, finalScore: 93.6 },
  { id: 'V-20260720-0140', travelerName: 'Yohannes Girma', fiydaId: 'FYD-5519-204-663', officer: 'Officer Abebe Bekele', date: '2026-07-20 08:31', result: 'rejected', fingerprintScore: 42, irisScore: 38, finalScore: 40.1 },
  { id: 'V-20260720-0139', travelerName: 'Meron Solomon', fiydaId: 'FYD-7732-558-901', officer: 'Officer Abebe Bekele', date: '2026-07-20 08:18', result: 'verified', fingerprintScore: 99, irisScore: 96, finalScore: 97.8 },
  { id: 'V-20260720-0138', travelerName: 'Bekele Nega', fiydaId: 'FYD-3390-117-228', officer: 'Officer Abebe Bekele', date: '2026-07-20 08:05', result: 'verified', fingerprintScore: 95, irisScore: 94, finalScore: 94.7 },
  { id: 'V-20260720-0137', travelerName: 'Selamawit Demissie', fiydaId: 'FYD-2201-449-883', officer: 'Officer Abebe Bekele', date: '2026-07-19 16:51', result: 'pending', fingerprintScore: 91, irisScore: 93, finalScore: 92.0 },
  { id: 'V-20260720-0136', travelerName: 'Tsegaye Mengistu', fiydaId: 'FYD-6610-228-557', officer: 'Officer Abebe Bekele', date: '2026-07-19 15:38', result: 'verified', fingerprintScore: 97, irisScore: 98, finalScore: 97.5 },
  { id: 'V-20260720-0135', travelerName: 'Hiwot Tesfaye', fiydaId: 'FYD-1192-337-440', officer: 'Officer Abebe Bekele', date: '2026-07-19 14:22', result: 'verified', fingerprintScore: 96, irisScore: 95, finalScore: 95.6 },
  { id: 'V-20260720-0134', travelerName: 'Getachew Alemu', fiydaId: 'FYD-9948-102-336', officer: 'Officer Abebe Bekele', date: '2026-07-19 11:09', result: 'rejected', fingerprintScore: 51, irisScore: 47, finalScore: 49.2 },
  { id: 'V-20260720-0133', travelerName: 'Bethelhem Wolde', fiydaId: 'FYD-5567-881-220', officer: 'Officer Abebe Bekele', date: '2026-07-19 09:55', result: 'verified', fingerprintScore: 98, irisScore: 97, finalScore: 97.7 },
  { id: 'V-20260720-0132', travelerName: 'Dawit Gebremedhin', fiydaId: 'FYD-7733-440-119', officer: 'Officer Abebe Bekele', date: '2026-07-18 17:41', result: 'pending', fingerprintScore: 92, irisScore: 91, finalScore: 91.6 },
  { id: 'V-20260720-0131', travelerName: 'Hanna Tesfaye', fiydaId: 'FYD-8820-663-117', officer: 'Officer Abebe Bekele', date: '2026-07-18 14:28', result: 'verified', fingerprintScore: 99, irisScore: 98, finalScore: 98.6 },
];

export const pendingCases = [
  { id: 'PC-20260720-0141', travelerName: 'Almaz Tadesse', fiydaId: 'FYD-8821-331-447', nationality: 'Ethiopia', officer: 'Officer Abebe Bekele', time: '08:52', fingerprintScore: 93, irisScore: 94, finalScore: 93.6, gender: 'Female' as const, dob: '1994-11-02', passportNo: 'ET-1198745', status: 'Active' as const },
  { id: 'PC-20260720-0137', travelerName: 'Selamawit Demissie', fiydaId: 'FYD-2201-449-883', nationality: 'Ethiopia', officer: 'Officer Abebe Bekele', time: '07:51', fingerprintScore: 91, irisScore: 93, finalScore: 92.0, gender: 'Female' as const, dob: '1991-05-18', passportNo: 'ET-2204498', status: 'Active' as const },
  { id: 'PC-20260720-0132', travelerName: 'Dawit Gebremedhin', fiydaId: 'FYD-7733-440-119', nationality: 'Ethiopia', officer: 'Officer Abebe Bekele', time: '06:41', fingerprintScore: 92, irisScore: 91, finalScore: 91.6, gender: 'Male' as const, dob: '1987-02-09', passportNo: 'ET-7733440', status: 'Active' as const },
];

export const users: User[] = [
  { id: 'U-2041', name: 'Officer Abebe Bekele', email: 'a.bekele@border.gov', role: 'officer', status: 'active', createdDate: '2025-11-12' },
  { id: 'U-2042', name: 'Officer Tigist Haile', email: 't.haile@border.gov', role: 'officer', status: 'active', createdDate: '2025-11-15' },
  { id: 'U-2043', name: 'Officer Yohannes Girma', email: 'y.girma@border.gov', role: 'officer', status: 'inactive', createdDate: '2025-12-02' },
  { id: 'S-0118', name: 'Capt. Almaz Tadesse', email: 'a.tadesse@border.gov', role: 'supervisor', status: 'active', createdDate: '2025-09-03' },
  { id: 'S-0119', name: 'Capt. Meron Solomon', email: 'm.solomon@border.gov', role: 'supervisor', status: 'active', createdDate: '2025-09-20' },
  { id: 'A-0007', name: 'Dir. Dereje Assefa', email: 'd.assefa@border.gov', role: 'admin', status: 'active', createdDate: '2025-06-21' },
  { id: 'U-2044', name: 'Officer Bekele Nega', email: 'b.nega@border.gov', role: 'officer', status: 'active', createdDate: '2026-01-08' },
  { id: 'U-2045', name: 'Officer Selamawit Demissie', email: 's.demissie@border.gov', role: 'officer', status: 'inactive', createdDate: '2026-02-14' },
];

export const officerList = users.filter((u) => u.role === 'officer');

export const auditLogs: AuditEntry[] = [
  { id: 'L-0001', user: 'Officer Abebe Bekele', action: 'Verification completed — V-20260720-0142', time: '2026-07-20 09:14:22', ip: '10.20.14.41', severity: 'info' },
  { id: 'L-0002', user: 'Capt. Almaz Tadesse', action: 'Override approved — PC-20260720-0137', time: '2026-07-20 08:10:05', ip: '10.20.14.18', severity: 'info' },
  { id: 'L-0003', user: 'unknown', action: 'Failed login attempt (3 tries) — t.haile@border.gov', time: '2026-07-20 07:58:41', ip: '10.20.14.99', severity: 'critical' },
  { id: 'L-0004', user: 'Dir. Dereje Assefa', action: 'Threshold updated — 94% → 95%', time: '2026-07-20 06:31:12', ip: '10.20.14.07', severity: 'info' },
  { id: 'L-0005', user: 'Officer Abebe Bekele', action: 'Verification completed — V-20260720-0141 (PENDING)', time: '2026-07-20 08:52:18', ip: '10.20.14.41', severity: 'info' },
  { id: 'L-0006', user: 'Officer Tigist Haile', action: 'Session started', time: '2026-07-20 07:55:03', ip: '10.20.14.42', severity: 'info' },
  { id: 'L-0007', user: 'Dir. Dereje Assefa', action: 'User deactivated — Officer Selamawit Demissie', time: '2026-07-20 06:28:50', ip: '10.20.14.07', severity: 'info' },
  { id: 'L-0008', user: 'system', action: 'AI service health check — OK (latency 412ms)', time: '2026-07-20 06:00:00', ip: '127.0.0.1', severity: 'info' },
  { id: 'L-0009', user: 'unknown', action: 'Failed login attempt — admin@border.gov', time: '2026-07-19 23:14:02', ip: '203.0.113.77', severity: 'critical' },
  { id: 'L-0010', user: 'Capt. Meron Solomon', action: 'Report generated — Weekly Summary', time: '2026-07-19 18:22:14', ip: '10.20.14.19', severity: 'info' },
];

export const systemSettings = {
  approvalThreshold: 95,
  reviewRangeMin: 90,
  reviewRangeMax: 94,
  rejectBelow: 90,
  sessionTimeout: 15,
  maxLoginAttempts: 5,
};

export const recentReports = [
  { id: 'R-2026-07-20', name: 'Daily Verification Summary', type: 'Verification Summary', generatedBy: 'system', date: '2026-07-20', status: 'Ready' },
  { id: 'R-2026-07-19', name: 'Weekly Override Summary', type: 'Override Summary', generatedBy: 'Capt. Almaz Tadesse', date: '2026-07-19', status: 'Ready' },
  { id: 'R-2026-07-15', name: 'Officer Activity — A. Bekele', type: 'Officer Activity', generatedBy: 'Dir. Dereje Assefa', date: '2026-07-15', status: 'Ready' },
  { id: 'R-2026-07-10', name: 'Monthly Verification Summary', type: 'Verification Summary', generatedBy: 'Capt. Meron Solomon', date: '2026-07-10', status: 'Ready' },
  { id: 'R-2026-07-05', name: 'Officer Activity — T. Haile', type: 'Officer Activity', generatedBy: 'Capt. Almaz Tadesse', date: '2026-07-05', status: 'Ready' },
];

// Report generation demo data
export const verificationSummaryData = [
  { label: 'Mon', verified: 124, pending: 8, rejected: 11 },
  { label: 'Tue', verified: 138, pending: 6, rejected: 9 },
  { label: 'Wed', verified: 131, pending: 11, rejected: 13 },
  { label: 'Thu', verified: 145, pending: 7, rejected: 10 },
  { label: 'Fri', verified: 152, pending: 9, rejected: 14 },
  { label: 'Sat', verified: 98, pending: 5, rejected: 7 },
  { label: 'Sun', verified: 118, pending: 9, rejected: 15 },
];

export const overrideSummaryData = [
  { label: 'Mon', approved: 6, rejected: 2 },
  { label: 'Tue', approved: 8, rejected: 1 },
  { label: 'Wed', approved: 5, rejected: 3 },
  { label: 'Thu', approved: 9, rejected: 2 },
  { label: 'Fri', approved: 7, rejected: 4 },
  { label: 'Sat', approved: 4, rejected: 1 },
  { label: 'Sun', approved: 6, rejected: 3 },
];

export const officerActivityData = [
  { label: 'Mon', value: 22 },
  { label: 'Tue', value: 28 },
  { label: 'Wed', value: 25 },
  { label: 'Thu', value: 31 },
  { label: 'Fri', value: 34 },
  { label: 'Sat', value: 18 },
  { label: 'Sun', value: 24 },
];
