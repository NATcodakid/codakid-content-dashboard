import React from 'react';
import { NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import {
  BarChart3,
  ClipboardList,
  FileWarning,
  FileText,
  GitBranch,
  Globe2,
  Sparkles,
  LogOut,
  RefreshCw,
  Settings,
  ShieldCheck,
  TrendingUp,
  ListChecks,
  ScrollText,
} from 'lucide-react';
import { useDashboard } from './data';

const NAV_GROUPS = [
  {
    label: 'Performance',
    items: [
      { to: '/', label: 'Overview', icon: <BarChart3 />, end: true },
      { to: '/keywords', label: 'Keywords', icon: <TrendingUp /> },
      { to: '/reports', label: 'Reports', icon: <ScrollText /> },
    ],
  },
  {
    label: 'Content',
    items: [
      { to: '/pillars', label: 'Pillars', icon: <FileText /> },
      { to: '/audit', label: 'Audit', icon: <FileWarning /> },
      { to: '/links', label: 'Links', icon: <GitBranch /> },
    ],
  },
  {
    label: 'Strategy',
    items: [
      { to: '/actions', label: 'Actions', icon: <ListChecks /> },
      { to: '/gameplan', label: 'Gameplan', icon: <ClipboardList /> },
      { to: '/intelligence', label: 'AI Lab', icon: <Sparkles /> },
    ],
  },
  {
    label: 'Market',
    items: [{ to: '/competitors', label: 'Competitors', icon: <Globe2 /> }],
  },
  {
    label: 'Workspace',
    items: [{ to: '/settings', label: 'Settings', icon: <Settings /> }],
  },
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
          {NAV_GROUPS.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-group-label">{group.label}</span>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={'end' in item ? item.end : undefined}
                  className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
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
            <button className="primary-button" onClick={() => void refresh({ forceCrawl: true })} disabled={isLoading}>
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
