import React from 'react';
import { NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import {
  ArrowsClockwise,
  ChartLineUp,
  FileMagnifyingGlass,
  GearSix,
  GlobeHemisphereWest,
  Graph,
  Lightning,
  MapTrifold,
  NewspaperClipping,
  ShareNetwork,
  SignOut,
  Sparkle,
  Stack,
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
  end?: boolean;
  badge?: BadgeKey;
};

const NAV_GROUPS: { label: string; items: NavItemDef[] }[] = [
  {
    label: 'Performance',
    items: [
      { to: '/', label: 'Overview', icon: ChartLineUp, end: true },
      { to: '/keywords', label: 'Keywords', icon: FileMagnifyingGlass },
      { to: '/reports', label: 'Reports', icon: NewspaperClipping },
    ],
  },
  {
    label: 'Content',
    items: [
      { to: '/pillars', label: 'Pillars', icon: Stack },
      { to: '/audit', label: 'Audit', icon: Graph, badge: 'audit' },
      { to: '/links', label: 'Links', icon: ShareNetwork },
    ],
  },
  {
    label: 'Strategy',
    items: [
      { to: '/actions', label: 'Actions', icon: Lightning, badge: 'actions' },
      { to: '/gameplan', label: 'Gameplan', icon: MapTrifold },
      { to: '/intelligence', label: 'AI Lab', icon: Sparkle },
      { to: '/competitors', label: 'Competitors', icon: GlobeHemisphereWest },
    ],
  },
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
    isLoading,
    error,
    refresh,
    onLogout,
  } = useDashboard();
  const [searchParams, setSearchParams] = useSearchParams();
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
          {NAV_GROUPS.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-group-label">{group.label}</span>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
                >
                  {({ isActive }) => (
                    <>
                      <NavItemIcon icon={item.icon} active={isActive} />
                      <span className="nav-item-label">{item.label}</span>
                      {item.badge ? (
                        <NavBadge
                          count={badgeCounts[item.badge]}
                          tone={item.badge === 'audit' && auditHigh > 0 ? 'danger' : 'default'}
                        />
                      ) : null}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
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
            <h1>{pageTitle}</h1>
            {crawlUpdated ? <span className="topbar-meta">Crawl updated {crawlUpdated}</span> : null}
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
