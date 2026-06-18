import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AcceptInviteScreen, AuthLoadingState, LoginScreen } from './auth';
import { LoadingState } from './components';
import { DashboardProvider } from './data';
import { DashboardLayout } from './layout';
import { apiFetch } from './lib';
import type { AuthUser } from './types';
import './styles.css';

const OverviewPage = React.lazy(() => import('./pages/Overview').then((module) => ({ default: module.OverviewPage })));
const PillarsPage = React.lazy(() => import('./pages/Pillars').then((module) => ({ default: module.PillarsPage })));
const PillarDetailPage = React.lazy(() => import('./pages/Pillars').then((module) => ({ default: module.PillarDetailPage })));
const KeywordsPage = React.lazy(() => import('./pages/Keywords').then((module) => ({ default: module.KeywordsPage })));
const ActionsPage = React.lazy(() => import('./pages/Actions').then((module) => ({ default: module.ActionsPage })));
const AuditPage = React.lazy(() => import('./pages/Audit').then((module) => ({ default: module.AuditPage })));
const ReportsPage = React.lazy(() => import('./pages/Reports').then((module) => ({ default: module.ReportsPage })));
const PageWorkspacePage = React.lazy(() => import('./pages/PageWorkspace').then((module) => ({ default: module.PageWorkspacePage })));
const IntelligencePage = React.lazy(() => import('./pages/Intelligence').then((module) => ({ default: module.IntelligencePage })));
const GameplanPage = React.lazy(() => import('./pages/Gameplan').then((module) => ({ default: module.GameplanPage })));
const LinksPage = React.lazy(() => import('./pages/Links').then((module) => ({ default: module.LinksPage })));
const CompetitorsPage = React.lazy(() => import('./pages/Competitors').then((module) => ({ default: module.CompetitorsPage })));
const SettingsPage = React.lazy(() => import('./pages/Settings').then((module) => ({ default: module.SettingsPage })));
const ChangesPage = React.lazy(() => import('./pages/Changes').then((module) => ({ default: module.ChangesPage })));

function App() {
  const [authStatus, setAuthStatus] = React.useState<'checking' | 'authenticated' | 'unauthenticated'>('checking');
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const inviteToken = React.useMemo(() => new URLSearchParams(window.location.search).get('token'), []);

  const checkAuth = React.useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include' });
      const data = await response.json();
      if (response.ok && data.authenticated) {
        setUser(data.user);
        setAuthStatus('authenticated');
      } else {
        setUser(null);
        setAuthStatus('unauthenticated');
      }
    } catch {
      setUser(null);
      setAuthStatus('unauthenticated');
    }
  }, []);

  React.useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  function handleAuthenticated(nextUser: AuthUser) {
    setUser(nextUser);
    setAuthStatus('authenticated');
    window.history.replaceState({}, '', '/');
  }

  async function handleLogout() {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setAuthStatus('unauthenticated');
  }

  function handleUnauthorized() {
    setUser(null);
    setAuthStatus('unauthenticated');
  }

  if (authStatus === 'checking') return <AuthLoadingState />;
  if (authStatus === 'unauthenticated' && inviteToken) {
    return <AcceptInviteScreen token={inviteToken} onAuthenticated={handleAuthenticated} />;
  }
  if (authStatus === 'unauthenticated' || !user) {
    return <LoginScreen onAuthenticated={handleAuthenticated} />;
  }

  return (
    <DashboardProvider user={user} onUnauthorized={handleUnauthorized} onLogout={handleLogout}>
      <Routes>
        <Route element={<DashboardLayout />}>
          <Route index element={<RouteFallback><OverviewPage /></RouteFallback>} />
          <Route path="pillars" element={<RouteFallback><PillarsPage /></RouteFallback>} />
          <Route path="pillars/:slug" element={<RouteFallback><PillarDetailPage /></RouteFallback>} />
          <Route path="keywords" element={<RouteFallback><KeywordsPage /></RouteFallback>} />
          <Route path="actions" element={<RouteFallback><ActionsPage /></RouteFallback>} />
          <Route path="audit" element={<RouteFallback><AuditPage /></RouteFallback>} />
          <Route path="reports" element={<RouteFallback><ReportsPage /></RouteFallback>} />
          <Route path="intelligence" element={<RouteFallback><IntelligencePage /></RouteFallback>} />
          <Route path="pages/:slug" element={<RouteFallback><PageWorkspacePage /></RouteFallback>} />
          <Route path="gameplan" element={<RouteFallback><GameplanPage /></RouteFallback>} />
          <Route path="links" element={<RouteFallback><LinksPage /></RouteFallback>} />
          <Route path="changes" element={<RouteFallback><ChangesPage /></RouteFallback>} />
          <Route path="competitors" element={<RouteFallback><CompetitorsPage /></RouteFallback>} />
          <Route path="settings" element={<RouteFallback><SettingsPage /></RouteFallback>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </DashboardProvider>
  );
}

function RouteFallback({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingState label="Loading section" />}>{children}</Suspense>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
