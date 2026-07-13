import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useApp } from './context/AppContext';
import LoginPage from './pages/LoginPage';
import TraineeShell from './pages/trainee/TraineeShell';
import TrainerShell from './pages/trainer/TrainerShell';
import SupervisorShell from './pages/supervisor/SupervisorShell';
import AdminShell from './pages/admin/AdminShell';
import NotificationToast from './components/shared/NotificationToast';

export default function App() {
  const { currentUser } = useApp();

  return (
    <BrowserRouter>
      <NotificationToast />
      <Routes>
        <Route path="/login" element={!currentUser ? <LoginPage /> : <Navigate to={`/${currentUser.role}`} replace />} />
        <Route path="/trainee/*" element={currentUser?.role === 'trainee' ? <TraineeShell /> : <Navigate to="/login" replace />} />
        <Route path="/trainer/*" element={currentUser?.role === 'trainer' ? <TrainerShell /> : <Navigate to="/login" replace />} />
        <Route path="/supervisor/*" element={currentUser?.role === 'supervisor' ? <SupervisorShell /> : <Navigate to="/login" replace />} />
        <Route path="/admin/*" element={currentUser?.role === 'admin' ? <AdminShell /> : <Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to={currentUser ? `/${currentUser.role}` : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
