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
                <div><strong>Google Analytics 4</strong><span>{ga4?.latest ? `Latest period ${formatDateRange(ga4.latest.startDate, ga4.latest.endDate)}` : ga4?.analyticsScopeReady ? 'Connected, waiting for first sync' : 'Analytics authorization required'}</span></div>
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
        detail={latestGsc ? `Latest import ${formatDate(latestGsc.createdAt)}` : 'Apps Script or OAuth needs to import rows'}
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
        icon={<Activity />}
        label="GA4"
        value={diagnostics.env.ga4PropertyConfigured ? 'Property set' : 'Missing ID'}
        detail="Analytics data syncs after Google is reconnected with GA4 scope"
        ok={diagnostics.env.ga4PropertyConfigured}
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
