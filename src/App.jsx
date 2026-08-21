import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSession } from './hooks/useSession';
import LoginPage from './pages/auth/LoginPage';
import SignupPage from './pages/auth/SignupPage';
import PendingApprovalPage from './pages/auth/PendingApprovalPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import TraineeShell from './pages/trainee/TraineeShell';
import TrainerShell from './pages/trainer/TrainerShell';
import SupervisorShell from './pages/supervisor/SupervisorShell';
import AdminShell from './pages/admin/AdminShell';
import NotificationToast from './components/shared/NotificationToast';
import ErrorBoundary from './components/shared/ErrorBoundary';

export default function App() {
  return (
    <BrowserRouter>
      <NotificationToast />
      <AppRoutes />
    </BrowserRouter>
  );
}

function AppRoutes() {
  const { status, profile } = useSession();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div role="status" className="page-body" style={{ textAlign: 'center', padding: '4rem' }}>
        Loading…
      </div>
    );
  }

  // An account that exists but is not active gets no route into the app at
  // all, rather than a route that renders an empty or broken shell.
  if (status === 'pending' || status === 'suspended') {
    return <PendingApprovalPage status={status} />;
  }

  const signedIn = status === 'active';
  const home = signedIn ? `/${profile.role}` : '/login';

  return (
    <ErrorBoundary key={location.pathname}>
      <Routes>
        <Route path="/login" element={signedIn ? <Navigate to={home} replace /> : <LoginPage />} />
        <Route path="/signup" element={signedIn ? <Navigate to={home} replace /> : <SignupPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/trainee/*"    element={profile?.role === 'trainee'    ? <TraineeShell />    : <Navigate to={home} replace />} />
        <Route path="/trainer/*"    element={profile?.role === 'trainer'    ? <TrainerShell />    : <Navigate to={home} replace />} />
        <Route path="/supervisor/*" element={profile?.role === 'supervisor' ? <SupervisorShell /> : <Navigate to={home} replace />} />
        <Route path="/admin/*"      element={profile?.role === 'admin'      ? <AdminShell />      : <Navigate to={home} replace />} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
