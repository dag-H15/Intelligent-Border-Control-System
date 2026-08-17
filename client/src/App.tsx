import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppShell, type PageKey } from './components/AppShell';
import { defaultPageForRole, isPageAllowed } from './components/permissions';
import { LoginPage } from './pages/LoginPage';
import { OfficerDashboard } from './pages/OfficerDashboard';
import { EnrollmentPage } from './pages/EnrollmentPage';
import { VerifyTravelerPage } from './pages/VerifyTravelerPage';
import { OfficerManualReviewPage } from './pages/OfficerManualReviewPage';
import { HistoryPage } from './pages/HistoryPage';
import { SupervisorDashboard } from './pages/SupervisorDashboard';
import { PendingReviewPage } from './pages/PendingReviewPage';
import { SupervisorManualReviewPage } from './pages/SupervisorManualReviewPage';
import { ReportsDashboard } from './pages/ReportsDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { UserManagementPage } from './pages/UserManagementPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { SystemSettingsPage } from './pages/SystemSettingsPage';

function AuthenticatedApp() {
  const { user, logout } = useAuth();
  const [page, setPage] = useState<PageKey>(user ? defaultPageForRole(user.role) : 'dashboard');

  // If role changes (e.g. different user logs in), reset to their default page
  useEffect(() => {
    if (user) {
      setPage(defaultPageForRole(user.role));
    }
  }, [user]);

  if (!user) return <LoginPage />;

  const role = user.role;

  // Guard: if current page isn't allowed for this role, redirect to default
  const safePage = isPageAllowed(role, page) ? page : defaultPageForRole(role);

  const handleNavigate = (p: PageKey) => {
    if (isPageAllowed(role, p)) setPage(p);
  };

  return (
    <AppShell
      role={role}
      userName={user.name}
      active={safePage}
      onNavigate={handleNavigate}
      onLogout={logout}
    >
      {role === 'officer' && safePage === 'dashboard' && <OfficerDashboard onGoVerify={() => setPage('verify')} onGoHistory={() => setPage('history')} />}
      {role === 'officer' && safePage === 'enrollment' && <EnrollmentPage />}
      {role === 'officer' && safePage === 'verify' && <VerifyTravelerPage />}
      {role === 'officer' && safePage === 'officer_manual_review' && <OfficerManualReviewPage />}
      {role === 'officer' && safePage === 'history' && <HistoryPage />}

      {role === 'supervisor' && safePage === 'supervisor' && <SupervisorDashboard onGoPending={() => setPage('pending')} />}
      {role === 'supervisor' && safePage === 'pending' && <PendingReviewPage />}
      {role === 'supervisor' && safePage === 'supervisor_manual_review' && <SupervisorManualReviewPage />}
      {role === 'supervisor' && safePage === 'reports' && <ReportsDashboard />}

      {role === 'admin' && safePage === 'admin' && (
        <AdminDashboard
          onGoUsers={() => setPage('users')}
          onGoAudit={() => setPage('audit')}
          onGoSettings={() => setPage('settings')}
        />
      )}
      {role === 'admin' && safePage === 'users' && <UserManagementPage />}
      {role === 'admin' && safePage === 'audit' && <AuditLogsPage />}
      {role === 'admin' && safePage === 'settings' && <SystemSettingsPage />}
    </AppShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}
