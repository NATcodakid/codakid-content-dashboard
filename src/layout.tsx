import React from 'react';
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import {
  ArrowsClockwise,
  Bell,
  ChartLineUp,
  Check,
  ClockCountdown,
  FileMagnifyingGlass,
  GearSix,
  GlobeHemisphereWest,
  Lightning,
  NewspaperClipping,
  SignOut,
  Stack,
  X,
  type Icon,
} from '@phosphor-icons/react';
import { useDashboard } from './data';
import { Toaster, BrandLogo } from './components';
import { formatDate } from './lib';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Overview',
  '/keywords': 'Keywords',
  '/reports': 'Reports',
  '/pillars': 'Pillars',
  '/audit': 'Audit',
  '/links': 'Links',
  '/changes': 'Change Impact',
  '/actions': 'Actions',
  '/gameplan': 'Gameplan',
  '/intelligence': 'AI Lab',
  '/competitors': 'Competitors',
  '/settings': 'Settings',
};

type BadgeKey = 'actions' | 'audit';

type NavItemDef = {
  to: string;
  label: string;
  icon: Icon;
  badge?: BadgeKey;
  routes: string[];
};

const PRIMARY_NAV: NavItemDef[] = [
  { to: '/', label: 'Overview', icon: ChartLineUp, routes: ['/'] },
  { to: '/keywords', label: 'Performance', icon: FileMagnifyingGlass, routes: ['/keywords'] },
  { to: '/pillars', label: 'Content', icon: Stack, routes: ['/pillars', '/pages', '/audit', '/links', '/changes'] },
  { to: '/competitors', label: 'Research', icon: GlobeHemisphereWest, routes: ['/competitors', '/intelligence'] },
  { to: '/actions', label: 'Roadmap', icon: Lightning, badge: 'actions', routes: ['/actions', '/gameplan'] },
  { to: '/reports', label: 'Reports', icon: NewspaperClipping, routes: ['/reports'] },
];

const WORKSPACE_TABS = [
  { routes: ['/pillars', '/pages', '/audit', '/links', '/changes'], items: [['/pillars', 'Pillars'], ['/audit', 'Site health'], ['/links', 'Internal links'], ['/changes', 'Change impact']] },
  { routes: ['/competitors', '/intelligence'], items: [['/competitors', 'Competitors'], ['/intelligence', 'AI visibility']] },
  { routes: ['/actions', '/gameplan'], items: [['/actions', 'Work queue'], ['/gameplan', 'SEO plan']] },
];

function NavItemIcon({ icon: IconComponent, active }: { icon: Icon; active: boolean }) {
  return (
    <span className={`nav-item-icon${active ? ' active' : ''}`} aria-hidden>
      <IconComponent size={17} weight={active ? 'fill' : 'regular'} />
    </span>
  );
}

function NavBadge({ count, tone = 'default' }: { count: number; tone?: 'default' | 'danger' }) {
  if (count <= 0) return null;
  return (
    <span className={`nav-badge${tone === 'danger' ? ' danger' : ''}`} aria-label={`${count} items`}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function DashboardLayout() {
  const {
    user,
    snapshot,
    googleStatus,
    technicalAudit,
    actionItems,
    alerts,
    isLoading,
    error,
    refresh,
    updateAlert,
    onLogout,
  } = useDashboard();
  const [searchParams, setSearchParams] = useSearchParams();
  const [alertsOpen, setAlertsOpen] = React.useState(false);
  const location = useLocation();

  const pageTitle = React.useMemo(() => {
    if (PAGE_TITLES[location.pathname]) return PAGE_TITLES[location.pathname];
    if (location.pathname.startsWith('/pillars/')) return 'Pillar detail';
    if (location.pathname.startsWith('/pages/')) return 'Page workspace';
    return 'Dashboard';
  }, [location.pathname]);

  const crawlUpdated = snapshot?.generatedAt ? formatDate(snapshot.generatedAt) : null;
  const openActions = actionItems.filter((item) => item.status !== 'done' && item.status !== 'dismissed').length;
  const auditHigh = technicalAudit?.summary.high || 0;
  const activeTabs = WORKSPACE_TABS.find((workspace) => workspace.routes.some((route) => routeMatches(location.pathname, route)))?.items || [];

  const badgeCounts: Record<BadgeKey, number> = {
    actions: openActions,
    audit: auditHigh,
  };

  const syncLive = Boolean(googleStatus?.connected && snapshot);
  const syncLabel = syncLive
    ? crawlUpdated
      ? `Crawl · ${crawlUpdated}`
      : 'Connected'
    : googleStatus?.connected
      ? 'Crawl pending'
      : 'GSC not connected';

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
      <Toaster />
      <aside className="sidebar">
        <div className="sidebar-brand">
          <BrandLogo variant="sidebar" subtitle="Blog dashboard" />
          <p className={`sidebar-sync${syncLive ? ' live' : ''}`}>
            <span className="sidebar-sync-dot" aria-hidden />
            {syncLabel}
          </p>
        </div>

        <nav className="nav-list" aria-label="Dashboard navigation">
          <div className="nav-group primary-workspaces">
            <span className="nav-group-label">Workspaces</span>
            {PRIMARY_NAV.map((item) => {
              const active = item.routes.some((route) => routeMatches(location.pathname, route));
              return (
                <Link key={item.to} to={item.to} className={active ? 'nav-item active' : 'nav-item'}>
                  <NavItemIcon icon={item.icon} active={active} />
                  <span className="nav-item-label">{item.label}</span>
                  {item.badge ? <NavBadge count={badgeCounts[item.badge]} tone={item.badge === 'audit' && auditHigh > 0 ? 'danger' : 'default'} /> : null}
                </Link>
              );
            })}
          </div>
        </nav>

        <footer className="sidebar-footer">
          {user ? (
            <div className="sidebar-user">
              <span className="sidebar-user-name">{user.name || user.email}</span>
              <small>{user.role}</small>
            </div>
          ) : null}
          <div className="sidebar-footer-actions">
            <button
              type="button"
              className="sidebar-footer-btn"
              onClick={() => void refresh({ forceCrawl: true })}
              disabled={isLoading}
              title="Refresh crawl"
            >
              <ArrowsClockwise size={16} className={isLoading ? 'spin' : ''} />
              <span>Refresh</span>
            </button>
            <NavLink
              to="/settings"
              className={({ isActive }) => `sidebar-footer-btn${isActive ? ' active' : ''}`}
              title="Settings"
            >
              <GearSix size={16} />
              <span>Settings</span>
            </NavLink>
            <button type="button" className="sidebar-footer-btn" onClick={onLogout} title="Log out">
              <SignOut size={16} />
              <span>Log out</span>
            </button>
          </div>
        </footer>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            {crawlUpdated ? <span className="topbar-meta">Crawl updated {crawlUpdated}</span> : null}
          </div>
          <button
            type="button"
            className="topbar-alert-button"
            onClick={() => setAlertsOpen(true)}
            aria-label={`Open alerts${alerts?.summary.unread ? `, ${alerts.summary.unread} unread` : ''}`}
          >
            <Bell size={18} weight={alerts?.summary.unread ? 'fill' : 'regular'} />
            <span>Alerts</span>
            {alerts?.summary.unread ? <b>{alerts.summary.unread > 99 ? '99+' : alerts.summary.unread}</b> : null}
          </button>
        </header>

        {activeTabs.length ? (
          <nav className="workspace-tabs" aria-label={`${pageTitle} workspace`}>
            {activeTabs.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => (
                  isActive
                  || routeMatches(location.pathname, to)
                  || (to === '/pillars' && location.pathname.startsWith('/pages'))
                    ? 'active'
                    : ''
                )}
              >
                {label}
              </NavLink>
            ))}
          </nav>
        ) : null}

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
      {alertsOpen ? (
        <div className="alert-drawer-layer" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setAlertsOpen(false);
        }}>
          <aside className="alert-drawer" aria-label="Alert inbox">
            <header>
              <div><h2>Alerts</h2><p>{alerts?.summary.unread || 0} unread · {alerts?.summary.high || 0} high priority</p></div>
              <button type="button" className="icon-button" onClick={() => setAlertsOpen(false)} title="Close alerts"><X size={17} /></button>
            </header>
            <div className="alert-drawer-list">
              {alerts?.alerts.length ? alerts.alerts.map((alert) => (
                <article key={alert.fingerprint} className={`alert-inbox-row ${alert.severity} ${alert.status}`}>
                  <i aria-hidden />
                  <div>
                    <div className="alert-inbox-meta"><span>{alert.source}</span><span>{formatDate(alert.createdAt)}</span></div>
                    <Link to={alert.to} onClick={() => { void updateAlert(alert.fingerprint, 'read'); setAlertsOpen(false); }}>{alert.title}</Link>
                    <p>{alert.detail}</p>
                    <footer>
                      {alert.status === 'unread' ? <button type="button" onClick={() => void updateAlert(alert.fingerprint, 'read')}><Check size={12} /> Read</button> : null}
                      <button type="button" onClick={() => void updateAlert(alert.fingerprint, 'snoozed', 7)}><ClockCountdown size={12} /> 7 days</button>
                      <button type="button" onClick={() => void updateAlert(alert.fingerprint, 'dismissed')}><X size={12} /> Dismiss</button>
                    </footer>
                  </div>
                </article>
              )) : (
                <div className="alert-inbox-empty"><Check size={24} /><strong>All clear</strong><p>No current performance or data-health alerts.</p></div>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function routeMatches(pathname: string, route: string) {
  if (route === '/') return pathname === '/';
  return pathname === route || pathname.startsWith(`${route}/`);
}
