import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSession } from './hooks/useSession';
import LoginPage from './pages/auth/LoginPage';
import SignupPage from './pages/auth/SignupPage';
import PendingApprovalPage from './pages/auth/PendingApprovalPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import NotificationToast from './components/shared/NotificationToast';
import ErrorBoundary from './components/shared/ErrorBoundary';

// One shell per role, and a user only ever reaches their own. Loading them
// eagerly meant every trainee downloaded the admin and supervisor pages
// before seeing their own dashboard. Auth pages stay eager: they are the
// first thing a signed-out visitor needs, so deferring them would trade a
// smaller bundle for a slower login.
const TraineeShell    = lazy(() => import('./pages/trainee/TraineeShell'));
const TrainerShell    = lazy(() => import('./pages/trainer/TrainerShell'));
const SupervisorShell = lazy(() => import('./pages/supervisor/SupervisorShell'));
const AdminShell      = lazy(() => import('./pages/admin/AdminShell'));

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
      <Suspense fallback={<div className="page-body" role="status">Loading…</div>}>
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
      </Suspense>
    </ErrorBoundary>
  );
}
