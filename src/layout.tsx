import React from 'react';
import { NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import {
  BarChart3,
  ClipboardList,
  FileText,
  GitBranch,
  Globe2,
  LogOut,
  RefreshCw,
  Settings,
  ShieldCheck,
  TrendingUp,
  ListChecks,
} from 'lucide-react';
import { useDashboard } from './data';

const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: <BarChart3 />, end: true },
  { to: '/pillars', label: 'Pillars', icon: <FileText /> },
  { to: '/keywords', label: 'Keywords', icon: <TrendingUp /> },
  { to: '/actions', label: 'Actions', icon: <ListChecks /> },
  { to: '/gameplan', label: 'Gameplan', icon: <ClipboardList /> },
  { to: '/links', label: 'Links', icon: <GitBranch /> },
  { to: '/competitors', label: 'Competitors', icon: <Globe2 /> },
  { to: '/settings', label: 'Settings', icon: <Settings /> },
];

export function DashboardLayout() {
  const { user, isLoading, error, refresh, onLogout } = useDashboard();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const googleMessage = React.useMemo(() => {
    if (searchParams.get('google') === 'connected') {
      return 'Google Search Console connected. Run a sync to import the latest rows.';
    }
    if (searchParams.get('google') === 'error') {
      return searchParams.get('message') || 'Google connection failed.';
    }
    return '';
  }, [searchParams]);

  function dismissGoogleMessage() {
    const next = new URLSearchParams(searchParams);
    next.delete('google');
    next.delete('message');
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">CK</span>
          <span>
            <strong>CodaKid</strong>
            <small>Blog SEO</small>
          </span>
        </div>
        <nav className="nav-list" aria-label="Dashboard navigation">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={18} />
          <span>Private dashboard. Search Console import, WordPress crawl, and planning data stay behind login.</span>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-actions">
            {user && (
              <span className="user-chip">
                {user.name || user.email}
                <small>{user.role}</small>
              </span>
            )}
            <button className="primary-button" onClick={() => void refresh()} disabled={isLoading}>
              <RefreshCw size={16} className={isLoading ? 'spin' : ''} />
              Refresh crawl
            </button>
            <button className="icon-button" onClick={onLogout} aria-label="Log out" title="Log out">
              <LogOut size={17} />
            </button>
          </div>
        </header>

        {googleMessage && (
          <div className="success-banner" onClick={dismissGoogleMessage} role="status">
            {googleMessage}
          </div>
        )}
        {error && <div className="error-banner inline">{error}</div>}

        <div className="dash-page" key={location.pathname}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
