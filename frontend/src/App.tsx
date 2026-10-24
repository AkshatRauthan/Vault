import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppShell, PageNotFound } from './components/AppShell';
import { ToastHost } from './components/ToastHost';
import { LoadingBlock } from './components/Feedback';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { UploadPage } from './pages/UploadPage';
import { DocumentDetailPage } from './pages/DocumentDetailPage';
import { VerifyPage } from './pages/VerifyPage';
import { SecurityPage } from './pages/SecurityPage';
import { SettingsPage } from './pages/SettingsPage';

function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="app-loading-screen"><LoadingBlock label="Restoring secure session…" /></div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <Outlet />;
}

function AuthRoutes() {
  return <BrowserRouter>
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="documents/:documentId" element={<DocumentDetailPage />} />
            <Route path="upload" element={<UploadPage />} />
            <Route path="verify" element={<VerifyPage />} />
            <Route path="security" element={<SecurityPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<PageNotFound />} />
          </Route>
        </Route>
      </Routes>
      <ToastHost />
    </AuthProvider>
  </BrowserRouter>;
}

export default function App() {
  return <AuthRoutes />;
}
