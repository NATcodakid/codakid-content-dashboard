import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  ExternalLink,
  FileText,
  GitBranch,
  Globe2,
  KeyRound,
  Link2,
  LogOut,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import './styles.css';

type Status = 'connected' | 'pending' | 'sampled' | 'needs review' | string;

type Snapshot = {
  generatedAt: string;
  mode: string;
  kpis: {
    postsCrawled: number;
    categories: number;
    inferredPillars: number;
    internalLinks: number;
    orphanPosts: number;
    linkGaps: number;
    postsUpdatedRecently: number;
  };
  clusters: Cluster[];
  pillars: Pillar[];
  underlinkedPillars: Array<{ title: string; url: string; cluster: string; inboundCount: number; opportunity: string }>;
  linkGaps: LinkGap[];
  orphanPosts: Array<{ title: string; url: string; cluster: string; date: string; inboundCount: number; outboundCount: number }>;
  recommendations: Array<{ priority: string; title: string; detail: string }>;
  integrationStatus: Array<{ name: string; status: Status; detail: string }>;
};

type Pillar = {
  title: string;
  url: string;
  cluster: string;
  date: string;
  modified: string;
  inboundCount: number;
  outboundCount: number;
  relatedPostCount: number;
  missingRelatedLinks: Array<{ title: string; url: string; cluster: string; date: string }>;
  pillarScore: number;
  health: number;
  status: string;
};

type Cluster = {
  cluster: string;
  posts: number;
  pillars: number;
  internalLinks: number;
  averageInbound: number;
};

type LinkGap = {
  pillarTitle: string;
  pillarUrl: string;
  sourceTitle: string;
  sourceUrl: string;
  cluster: string;
  suggestedAnchor: string;
};

type CompetitorSnapshot = {
  generatedAt: string;
  mode: string;
  competitors: Array<{
    domain: string;
    source: string;
    urlsSampled: number;
    blogUrls: number;
    visibleTopics: Array<{ topic: string; count: number }>;
    opportunities: string[];
    status: Status;
  }>;
};

type AiResponse = {
  mode: string;
  message?: string;
  insights: string[];
};

type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'viewer' | string;
  status: string;
};

const formatter = new Intl.NumberFormat('en-US');

function App() {
  const [authStatus, setAuthStatus] = React.useState<'checking' | 'authenticated' | 'unauthenticated'>('checking');
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null);
  const [competitors, setCompetitors] = React.useState<CompetitorSnapshot | null>(null);
  const [ai, setAi] = React.useState<AiResponse | null>(null);
  const [activeCluster, setActiveCluster] = React.useState('All');
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshingAi, setIsRefreshingAi] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
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

  const loadData = React.useCallback(async () => {
    if (authStatus !== 'authenticated') return;
    setIsLoading(true);
    setError(null);

    try {
      const [contentResponse, competitorResponse] = await Promise.all([
        fetch('/api/content-snapshot', { credentials: 'include' }),
        fetch('/api/competitors', { credentials: 'include' }),
      ]);

      if (contentResponse.status === 401) {
        setAuthStatus('unauthenticated');
        setUser(null);
        return;
      }
      if (!contentResponse.ok) throw new Error('Content snapshot failed to load.');
      const content = (await contentResponse.json()) as Snapshot;
      const competitorData = competitorResponse.ok ? ((await competitorResponse.json()) as CompetitorSnapshot) : null;

      setSnapshot(content);
      setCompetitors(competitorData);
      await loadAi(content);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Dashboard failed to load.');
    } finally {
      setIsLoading(false);
    }
  }, [authStatus]);

  React.useEffect(() => {
    if (authStatus === 'authenticated') void loadData();
  }, [authStatus, loadData]);

  async function loadAi(content = snapshot) {
    if (!content) return;
    setIsRefreshingAi(true);
    try {
      const response = await fetch('/api/ai-insights', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(content),
      });
      if (response.ok) setAi((await response.json()) as AiResponse);
    } finally {
      setIsRefreshingAi(false);
    }
  }

  const clusters = React.useMemo(() => ['All', ...(snapshot?.clusters.map((cluster) => cluster.cluster) || [])], [snapshot]);
  const filteredPillars = React.useMemo(() => {
    if (!snapshot) return [];
    if (activeCluster === 'All') return snapshot.pillars;
    return snapshot.pillars.filter((pillar) => pillar.cluster === activeCluster);
  }, [snapshot, activeCluster]);

  async function handleAuthenticated(nextUser: AuthUser) {
    setUser(nextUser);
    setAuthStatus('authenticated');
    window.history.replaceState({}, '', '/');
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
    setSnapshot(null);
    setCompetitors(null);
    setAi(null);
    setAuthStatus('unauthenticated');
  }

  if (authStatus === 'checking') {
    return <AuthLoadingState />;
  }

  if (authStatus === 'unauthenticated' && inviteToken) {
    return <AcceptInviteScreen token={inviteToken} onAuthenticated={handleAuthenticated} />;
  }

  if (authStatus === 'unauthenticated') {
    return <LoginScreen onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">CK</span>
          <span>
            <strong>CodaKid</strong>
            <small>Content OS</small>
          </span>
        </div>
        <nav className="nav-list" aria-label="Dashboard navigation">
          <NavItem icon={<BarChart3 />} label="Overview" active />
          <NavItem icon={<FileText />} label="Pillars" />
          <NavItem icon={<GitBranch />} label="Links" />
          <NavItem icon={<Globe2 />} label="Competitors" />
          <NavItem icon={<Bot />} label="AI Insights" />
          <NavItem icon={<Settings />} label="Settings" />
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={18} />
          <span>WordPress-only mode is active. GSC, GA4, OpenAI, and Meta Ads can connect next.</span>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>Content Intelligence Dashboard</h1>
            <p>
              CodaKid blog pillars, internal linking, content gaps, and AI-ready SEO recommendations.
            </p>
          </div>
          <div className="topbar-actions">
            {user && (
              <span className="user-chip">
                {user.name || user.email}
                <small>{user.role}</small>
              </span>
            )}
            <button className="primary-button" onClick={loadData} disabled={isLoading}>
              <RefreshCw size={16} className={isLoading ? 'spin' : ''} />
              Refresh crawl
            </button>
            <button className="icon-button" onClick={handleLogout} aria-label="Log out" title="Log out">
              <LogOut size={17} />
            </button>
          </div>
        </header>

        {error && <div className="error-banner">{error}</div>}

        {isLoading && !snapshot ? (
          <LoadingState />
        ) : snapshot ? (
          <>
            <section className="status-strip" aria-label="Integration status">
              {snapshot.integrationStatus.map((item) => (
                <StatusPill key={item.name} {...item} />
              ))}
            </section>

            <section className="kpi-grid" aria-label="Dashboard KPIs">
              <KpiCard icon={<FileText />} label="Posts Crawled" value={snapshot.kpis.postsCrawled} note="from WordPress REST" />
              <KpiCard icon={<Search />} label="Inferred Pillars" value={snapshot.kpis.inferredPillars} note="starter watchlist" />
              <KpiCard icon={<Link2 />} label="Internal Links" value={snapshot.kpis.internalLinks} note={`${snapshot.kpis.linkGaps} link gaps queued`} />
              <KpiCard icon={<AlertTriangle />} label="Orphan Risks" value={snapshot.kpis.orphanPosts} note="weak link signals" tone="warning" />
            </section>

            <section className="dashboard-grid">
              <div className="panel large-panel">
                <PanelHeader
                  icon={<Activity />}
                  title="Pillar Health"
                  action={`${filteredPillars.length} pages`}
                />
                <div className="cluster-tabs" role="tablist" aria-label="Filter pillars by cluster">
                  {clusters.slice(0, 9).map((cluster) => (
                    <button
                      key={cluster}
                      className={cluster === activeCluster ? 'active' : ''}
                      onClick={() => setActiveCluster(cluster)}
                    >
                      {cluster}
                    </button>
                  ))}
                </div>
                <PillarTable pillars={filteredPillars} />
              </div>

              <div className="panel ai-panel">
                <PanelHeader
                  icon={<Sparkles />}
                  title="AI Recommendations"
                  action={ai?.mode === 'openai' ? 'OpenAI' : 'Fallback'}
                />
                {ai?.message && <p className="panel-note">{ai.message}</p>}
                <div className="insight-list">
                  {(ai?.insights || snapshot.recommendations.map((item) => item.detail)).slice(0, 6).map((insight, index) => (
                    <div className="insight" key={`${insight}-${index}`}>
                      <span>{index + 1}</span>
                      <p>{insight}</p>
                    </div>
                  ))}
                </div>
                <button className="secondary-button full-width" onClick={() => loadAi()} disabled={isRefreshingAi}>
                  <Bot size={16} />
                  {isRefreshingAi ? 'Refreshing insights' : 'Regenerate insights'}
                </button>
              </div>
            </section>

            <section className="dashboard-grid lower-grid">
              <div className="panel">
                <PanelHeader icon={<GitBranch />} title="Internal Link Gaps" action={`${snapshot.linkGaps.length} suggestions`} />
                <LinkGapList gaps={snapshot.linkGaps.slice(0, 9)} />
              </div>

              <div className="panel">
                <PanelHeader icon={<BarChart3 />} title="Cluster Strength" action="WordPress crawl" />
                <ClusterBars clusters={snapshot.clusters.slice(0, 8)} />
              </div>

              <div className="panel">
                <PanelHeader icon={<Globe2 />} title="Competitor Watchlist" action={competitors?.mode || 'loading'} />
                <CompetitorList competitors={competitors} />
              </div>

              {user?.role === 'admin' && (
                <div className="panel">
                  <PanelHeader icon={<UserPlus />} title="Invite Access" action="admin only" />
                  <InvitePanel />
                </div>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}

function AuthLoadingState() {
  return (
    <div className="auth-page">
      <div className="auth-card compact">
        <span className="brand-mark">CK</span>
        <RefreshCw className="spin" size={22} />
        <h1>Checking secure access</h1>
        <p>One moment while the dashboard verifies your session.</p>
      </div>
    </div>
  );
}

function LoginScreen({ onAuthenticated }: { onAuthenticated: (user: AuthUser) => void }) {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Login failed.');
      onAuthenticated(data.user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Login failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <span className="brand-mark">CK</span>
          <span>
            <strong>CodaKid Content OS</strong>
            <small>Private dashboard</small>
          </span>
        </div>
        <div>
          <h1>Sign in to continue</h1>
          <p>Access is invite-only. Ask an admin for an account if you do not have one yet.</p>
        </div>
        <label>
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button full-width" disabled={isSubmitting}>
          <KeyRound size={16} />
          {isSubmitting ? 'Signing in' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

function AcceptInviteScreen({ token, onAuthenticated }: { token: string; onAuthenticated: (user: AuthUser) => void }) {
  const [name, setName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/auth/accept-invite', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, name, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Invite could not be accepted.');
      onAuthenticated(data.user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Invite could not be accepted.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <span className="brand-mark">CK</span>
          <span>
            <strong>CodaKid Content OS</strong>
            <small>Invite setup</small>
          </span>
        </div>
        <div>
          <h1>Create your dashboard login</h1>
          <p>This invite link is private. Set a password to activate your account.</p>
        </div>
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            minLength={12}
            required
          />
        </label>
        <p className="form-hint">Use at least 12 characters. The dashboard will keep you logged in for 30 days.</p>
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button full-width" disabled={isSubmitting}>
          <KeyRound size={16} />
          {isSubmitting ? 'Activating account' : 'Activate account'}
        </button>
      </form>
    </div>
  );
}

function InvitePanel() {
  const [email, setEmail] = React.useState('');
  const [name, setName] = React.useState('');
  const [role, setRole] = React.useState<'viewer' | 'admin'>('viewer');
  const [inviteUrl, setInviteUrl] = React.useState('');
  const [error, setError] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');
    setInviteUrl('');

    try {
      const response = await fetch('/api/auth/invite', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, name, role }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Invite failed.');
      setInviteUrl(data.inviteUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Invite failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
  }

  return (
    <form className="invite-form" onSubmit={submit}>
      <label>
        Email
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </label>
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        Role
        <select value={role} onChange={(event) => setRole(event.target.value as 'viewer' | 'admin')}>
          <option value="viewer">Viewer</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      {error && <div className="form-error">{error}</div>}
      <button className="secondary-button full-width" disabled={isSubmitting}>
        <UserPlus size={16} />
        {isSubmitting ? 'Creating invite' : 'Create invite link'}
      </button>
      {inviteUrl && (
        <div className="invite-result">
          <strong>Invite link</strong>
          <p>{inviteUrl}</p>
          <button type="button" className="secondary-button full-width" onClick={copyInvite}>
            Copy link
          </button>
        </div>
      )}
    </form>
  );
}

function NavItem({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <a className={active ? 'nav-item active' : 'nav-item'} href={`#${label.toLowerCase().replace(/\s+/g, '-')}`}>
      {icon}
      <span>{label}</span>
    </a>
  );
}

function StatusPill({ name, status, detail }: { name: string; status: Status; detail: string }) {
  return (
    <div className={`status-pill ${status === 'connected' ? 'connected' : ''}`}>
      <span>{status}</span>
      <strong>{name}</strong>
      <small>{detail}</small>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  note,
  tone = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  note: string;
  tone?: 'default' | 'warning';
}) {
  return (
    <article className={`kpi-card ${tone}`}>
      <div className="kpi-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{formatter.format(value)}</strong>
        <small>{note}</small>
      </div>
    </article>
  );
}

function PanelHeader({ icon, title, action }: { icon: React.ReactNode; title: string; action: string }) {
  return (
    <div className="panel-header">
      <div>
        {icon}
        <h2>{title}</h2>
      </div>
      <span>{action}</span>
    </div>
  );
}

function PillarTable({ pillars }: { pillars: Pillar[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Pillar</th>
            <th>Cluster</th>
            <th>Inbound</th>
            <th>Opportunity</th>
            <th>Health</th>
          </tr>
        </thead>
        <tbody>
          {pillars.map((pillar) => (
            <tr key={pillar.url}>
              <td>
                <a className="table-link" href={pillar.url} target="_blank" rel="noreferrer">
                  {pillar.title}
                  <ExternalLink size={13} />
                </a>
                <small>Updated {pillar.modified || pillar.date}</small>
              </td>
              <td>{pillar.cluster}</td>
              <td>{pillar.inboundCount}</td>
              <td>{pillar.missingRelatedLinks.length} supporting posts</td>
              <td>
                <HealthMeter value={pillar.health} status={pillar.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HealthMeter({ value, status }: { value: number; status: string }) {
  return (
    <div className="health-meter">
      <span>{value}</span>
      <div>
        <i style={{ width: `${value}%` }} />
      </div>
      <small>{status}</small>
    </div>
  );
}

function LinkGapList({ gaps }: { gaps: LinkGap[] }) {
  return (
    <div className="gap-list">
      {gaps.map((gap) => (
        <article className="gap-item" key={`${gap.pillarUrl}-${gap.sourceUrl}`}>
          <span>{gap.cluster}</span>
          <a href={gap.sourceUrl} target="_blank" rel="noreferrer">
            {gap.sourceTitle}
          </a>
          <p>
            Link to <strong>{gap.pillarTitle}</strong>
          </p>
          <small>Anchor: {gap.suggestedAnchor}</small>
        </article>
      ))}
    </div>
  );
}

function ClusterBars({ clusters }: { clusters: Cluster[] }) {
  const maxPosts = Math.max(...clusters.map((cluster) => cluster.posts), 1);

  return (
    <div className="cluster-bars">
      {clusters.map((cluster) => (
        <div className="cluster-row" key={cluster.cluster}>
          <div>
            <strong>{cluster.cluster}</strong>
            <small>
              {cluster.posts} posts · {cluster.pillars} pillars · {cluster.internalLinks} links
            </small>
          </div>
          <span>
            <i style={{ width: `${Math.max(8, (cluster.posts / maxPosts) * 100)}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

function CompetitorList({ competitors }: { competitors: CompetitorSnapshot | null }) {
  if (!competitors) {
    return <p className="panel-note">Loading public sitemap samples.</p>;
  }

  return (
    <div className="competitor-list">
      {competitors.competitors.map((competitor) => (
        <article key={competitor.domain} className="competitor-card">
          <div>
            <strong>{competitor.domain}</strong>
            <span>{competitor.status}</span>
          </div>
          <small>
            {competitor.blogUrls} blog/resource URLs from {competitor.urlsSampled} sitemap URLs
          </small>
          <p>{competitor.opportunities[0]}</p>
          <div className="topic-tags">
            {competitor.visibleTopics.slice(0, 4).map((topic) => (
              <span key={topic.topic}>
                {topic.topic} {topic.count}
              </span>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="loading-state">
      <RefreshCw size={22} className="spin" />
      <strong>Crawling WordPress and building the first content map</strong>
      <span>This usually takes a few seconds because the app reads post content and links.</span>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
