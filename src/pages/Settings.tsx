import React from 'react';
import { Activity, BarChart3, Database, RefreshCw, Settings, ShieldCheck, UserPlus } from 'lucide-react';
import { useDashboard } from '../data';
import { PageHeading, PanelHeader } from '../components';
import { GoogleSearchConsolePanel, InvitePanel } from '../auth';
import { formatDate, formatDateRange, formatter } from '../lib';
import type { Diagnostics } from '../types';

export function SettingsPage() {
  const { user, googleStatus, ga4, isSyncingGsc, syncSearchConsole, syncGa4 } = useDashboard();
  const [syncingGa4, setSyncingGa4] = React.useState(false);
  const [diagnostics, setDiagnostics] = React.useState<Diagnostics | null>(null);
  const [diagnosticsError, setDiagnosticsError] = React.useState('');

  React.useEffect(() => {
    if (user?.role !== 'admin') return;
    let active = true;
    fetch('/api/diagnostics', { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Diagnostics failed to load.');
        if (active) setDiagnostics(data as Diagnostics);
      })
      .catch((error) => {
        if (active) setDiagnosticsError(error instanceof Error ? error.message : 'Diagnostics failed to load.');
      });
    return () => {
      active = false;
    };
  }, [user?.role]);

  return (
    <>
      <PageHeading title="Settings" description="Integrations and team access." />

      <div className="dash-stack">
      {user?.role === 'admin' ? (
        <>
        <div className="dashboard-grid">
          <div className="panel">
            <PanelHeader icon={<Settings />} title="Integrations" action="admin only" />
            <GoogleSearchConsolePanel
              status={googleStatus}
              isSyncing={isSyncingGsc}
              onSync={() => void syncSearchConsole()}
            />
            <div className="integration-subpanel">
              <div className="integration-subpanel-copy">
                <BarChart3 size={18} />
                <div><strong>Google Analytics 4</strong><span>{ga4?.latest ? `Latest period ${formatDateRange(ga4.latest.startDate, ga4.latest.endDate)}` : ga4?.analyticsScopeReady ? `Automatic ${googleStatus?.authenticationMode === 'service-account' ? 'service account' : 'Google'} connection · waiting for first sync` : 'Analytics authorization required'}</span></div>
              </div>
              <button
                type="button"
                className="secondary-button"
                disabled={syncingGa4 || !ga4?.analyticsScopeReady}
                onClick={() => {
                  setSyncingGa4(true);
                  void syncGa4().finally(() => setSyncingGa4(false));
                }}
              >
                <RefreshCw size={14} className={syncingGa4 ? 'spin' : ''} />
                {syncingGa4 ? 'Syncing GA4…' : 'Sync GA4 now'}
              </button>
            </div>
          </div>
          <div className="panel">
            <PanelHeader icon={<UserPlus />} title="Invite Access" action="team" />
            <InvitePanel />
          </div>
        </div>
        <section className="panel">
          <PanelHeader icon={<ShieldCheck />} title="System Health" action="private diagnostics" />
          {diagnosticsError ? (
            <p className="panel-note">{diagnosticsError}</p>
          ) : diagnostics ? (
            <DiagnosticsGrid diagnostics={diagnostics} />
          ) : (
            <p className="panel-note">Loading environment and data health.</p>
          )}
        </section>
        </>
      ) : (
        <section className="panel">
          <PanelHeader icon={<Settings />} title="Account" action="viewer" />
          <p className="panel-note">
            You are signed in as {user?.email}. Ask an admin for invite management access.
          </p>
        </section>
      )}
      </div>
    </>
  );
}

function DiagnosticsGrid({ diagnostics }: { diagnostics: Diagnostics }) {
  const latestGsc = diagnostics.searchConsole[0];
  const gscSync = diagnostics.sourceSyncs?.find((run) => run.source === 'search-console');
  const ga4Sync = diagnostics.sourceSyncs?.find((run) => run.source === 'ga4');
  return (
    <div className="diagnostics-grid">
      <DiagnosticCard
        icon={<Database />}
        label="Neon"
        value={diagnostics.database.configured ? 'Connected' : 'Missing'}
        detail={`${diagnostics.actions.open} open actions · ${diagnostics.users.active} active users`}
        ok={diagnostics.database.configured}
      />
      <DiagnosticCard
        icon={<Activity />}
        label="WordPress Crawl"
        value={diagnostics.wordpress ? `${formatter.format(diagnostics.wordpress.post_count)} posts` : 'No cache yet'}
        detail={diagnostics.wordpress ? `Saved ${formatDate(diagnostics.wordpress.created_at)}` : 'A successful crawl will save here'}
        ok={Boolean(diagnostics.wordpress?.ok)}
      />
      <DiagnosticCard
        icon={<Settings />}
        label="Search Console"
        value={latestGsc ? `${formatter.format(latestGsc.rowCount)} ${latestGsc.dimensions} rows` : 'No import yet'}
        detail={gscSync ? `${gscSync.authMode === 'service-account' ? 'Automatic service account' : gscSync.authMode} · ${gscSync.status} ${formatDate(gscSync.completedAt || gscSync.startedAt)}` : latestGsc ? `Latest import ${formatDate(latestGsc.createdAt)}` : 'Waiting for the first automatic sync'}
        ok={Boolean(latestGsc)}
      />
      <DiagnosticCard
        icon={<ShieldCheck />}
        label="Serper"
        value={diagnostics.env.serperConfigured ? 'Ready' : 'Missing key'}
        detail={`${formatter.format(diagnostics.serp.total || 0)} SERP snapshots saved`}
        ok={diagnostics.env.serperConfigured}
      />
      <DiagnosticCard
        icon={<BarChart3 />}
        label="PageSpeed"
        value={diagnostics.pageSpeed.total ? `${formatter.format(diagnostics.pageSpeed.total)} tests saved` : 'No tests yet'}
        detail={diagnostics.pageSpeed.latest ? `Avg mobile score ${diagnostics.pageSpeed.averagePerformance ?? '—'} · tested ${formatDate(diagnostics.pageSpeed.latest)}` : 'Run Core Web Vitals from the Audit page'}
        ok={Boolean(diagnostics.pageSpeed.latest)}
      />
      <DiagnosticCard
        icon={<Activity />}
        label="GA4"
        value={diagnostics.env.ga4PropertyConfigured ? 'Property set' : 'Missing ID'}
        detail={ga4Sync ? `${ga4Sync.authMode === 'service-account' ? 'Automatic service account' : ga4Sync.authMode} · ${ga4Sync.status} ${formatDate(ga4Sync.completedAt || ga4Sync.startedAt)}` : diagnostics.env.googleServiceAccountConfigured ? 'Automatic service account ready' : 'Analytics authorization required'}
        ok={diagnostics.env.ga4PropertyConfigured && diagnostics.env.googleServiceAccountConfigured}
      />
      <DiagnosticCard
        icon={<Activity />}
        label="Cannibalization"
        value={`${formatter.format(diagnostics.cannibalization.active || 0)} active conflicts`}
        detail={diagnostics.cannibalization.latest ? `${diagnostics.cannibalization.high || 0} high priority · scanned ${formatDate(diagnostics.cannibalization.latest)}` : 'Waiting for the first intent scan'}
        ok={Boolean(diagnostics.cannibalization.latest)}
      />
    </div>
  );
}

function DiagnosticCard({
  icon,
  label,
  value,
  detail,
  ok,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  ok: boolean;
}) {
  return (
    <article className="diagnostic-card">
      <div className={ok ? 'diagnostic-icon ok' : 'diagnostic-icon'}>
        {icon}
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
