import React from 'react';
import { AlertTriangle, ArrowRight, ArrowUp, ArrowDown, ChevronsUpDown, FileWarning, Gauge, Link2Off, ListChecks, Search, Smartphone, Monitor, Zap, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDashboard } from '../data';
import { KpiCard, LoadingState, PageHeading, PanelHeader } from '../components';
import type { KpiDelta } from '../components';
import { AuditIssuesDonut, CoreWebVitalsTrend } from '../charts';
import { formatter, shortUrl } from '../lib';
import type { TechnicalAudit, TechnicalAuditIssue, PageSpeedResult } from '../types';

const ISSUE_LABELS: Record<string, string> = {
  'thin-content': 'Thin content',
  'stale-content': 'Stale content',
  'orphan-post': 'Orphan posts',
  'weak-outbound-links': 'Weak links out',
  'low-health': 'Low health',
  'link-gap': 'Link gaps',
  'short-title': 'Short titles',
  'long-title': 'Long titles',
  'thin-meta-summary': 'Weak summaries',
  'weak-heading-structure': 'Heading structure',
  'image-alt-missing': 'Missing alt text',
  'schema-opportunity': 'Schema opportunities',
  'broken-internal-link': 'Broken internal links',
};

export function AuditPage() {
  const { technicalAudit, snapshot, isLoading, saveActionItem, pageSpeed, runPageSpeed } = useDashboard();
  const [type, setType] = React.useState('all');
  const [query, setQuery] = React.useState('');
  const [sort, setSort] = React.useState<{ key: 'title' | 'pageTitle' | 'cluster' | 'priorityScore'; dir: 'asc' | 'desc' }>({ key: 'priorityScore', dir: 'desc' });

  if (isLoading && !snapshot) return <LoadingState label="Running technical audit" />;
  const issues = technicalAudit?.issues || [];
  const filtered = issues
    .filter((issue) => type === 'all' || issue.type === type)
    .filter((issue) => !query || `${issue.title} ${issue.pageTitle} ${issue.detail}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sort.dir === 'asc' ? cmp : -cmp;
    });

  function toggleSort(key: typeof sort.key) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'priorityScore' ? 'desc' : 'asc' }));
  }
  const topActions = issues.slice(0, 3);
  const issueTypes = Object.keys(technicalAudit?.summary.byType || {});

  return (
    <>
      <PageHeading
        title="Technical Audit"
        description="Fix crawl, link, freshness, and content-quality problems before they become ranking problems."
      />

      <div className="dash-stack">
        <section className="kpi-grid kpi-grid-3">
          <KpiCard icon={<Gauge />} label="Audit Health" value={technicalAudit?.healthScore ?? '—'} note={technicalAudit?.trend?.length ? `${technicalAudit.trend.length} saved snapshots` : 'saved to Neon'} tone={(technicalAudit?.healthScore || 0) >= 75 ? 'success' : 'warning'} delta={healthDelta(technicalAudit?.trend)} />
          <KpiCard icon={<FileWarning />} label="Issues" value={technicalAudit?.summary.total || 0} note="from latest crawl" tone="warning" />
          <KpiCard icon={<AlertTriangle />} label="High Priority" value={technicalAudit?.summary.high || 0} note="fix first" tone="danger" />
          <KpiCard icon={<Link2Off />} label="Broken + Gaps" value={(technicalAudit?.summary.byType?.['broken-internal-link'] || 0) + (technicalAudit?.summary.byType?.['link-gap'] || 0)} note="internal links to repair" />
        </section>

        {technicalAudit?.trend?.length ? (
          <section className="panel">
            <PanelHeader icon={<Gauge />} title="Audit Health Trend" action="Neon history" />
            <AuditTrend trend={technicalAudit.trend} />
          </section>
        ) : null}

        {Object.keys(technicalAudit?.summary.byType || {}).length ? (
          <section className="panel">
            <PanelHeader icon={<FileWarning />} title="Issues by type" action="current crawl" />
            <AuditIssuesDonut byType={technicalAudit?.summary.byType || {}} labels={ISSUE_LABELS} />
          </section>
        ) : null}

        <PageSpeedPanel pageSpeed={pageSpeed} runPageSpeed={runPageSpeed} />

        {(pageSpeed?.history?.length || 0) >= 2 ? (
          <section className="panel">
            <PanelHeader icon={<Zap />} title="Core Web Vitals over time" action="weekly check" />
            <CoreWebVitalsTrend history={pageSpeed?.history || []} />
          </section>
        ) : null}

        {topActions.length ? (
          <section className="next-action-grid">
            {topActions.map((issue) => (
              <article className="next-action-card" key={issue.id}>
                <div className="next-action-icon">
                  {issue.type === 'link-gap' ? <Link2Off /> : <AlertTriangle />}
                </div>
                <div>
                  <span>{issue.severity} priority</span>
                  <strong>{issue.title}</strong>
                  <p>{issue.detail}</p>
                  <button
                    type="button"
                    className="next-action-link"
                    onClick={() => void saveActionItem(actionFromIssue(issue))}
                  >
                    Fix now <ArrowRight size={22} />
                  </button>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="panel">
            <PanelHeader icon={<FileWarning />} title="No audit issues found" action="clean" />
            <p className="panel-note">The latest crawl did not find major technical issues in the current rule set.</p>
          </section>
        )}

        <section className="panel">
          <PanelHeader icon={<ListChecks />} title="Issue Queue" action={`${filtered.length} visible`} />
          <div className="filter-bar">
            <div className="search-field">
              <Search size={15} />
              <input value={query} placeholder="Filter issues or pages..." onChange={(event) => setQuery(event.target.value)} />
            </div>
            <select value={type} onChange={(event) => setType(event.target.value)}>
              <option value="all">All issue types</option>
              {issueTypes.map((issueType) => (
                <option key={issueType} value={issueType}>
                  {ISSUE_LABELS[issueType] || issueType} ({formatter.format(technicalAudit?.summary.byType?.[issueType] || 0)})
                </option>
              ))}
            </select>
          </div>
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th><SortTh label="Issue" col="title" sort={sort} onSort={toggleSort} /></th>
                  <th><SortTh label="Page" col="pageTitle" sort={sort} onSort={toggleSort} /></th>
                  <th><SortTh label="Cluster" col="cluster" sort={sort} onSort={toggleSort} /></th>
                  <th className="num"><SortTh label="Priority" col="priorityScore" sort={sort} onSort={toggleSort} /></th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 120).map((issue) => (
                  <tr key={issue.id}>
                    <td>
                      <strong>{issue.title}</strong>
                      <small>{issue.detail}</small>
                    </td>
                    <td>
                      <Link to={`/pages/${encodeURIComponent(slugFromUrl(issue.pageUrl))}`}>{issue.pageTitle}</Link>
                      <small>{shortUrl(issue.pageUrl)}</small>
                    </td>
                    <td>{issue.cluster}</td>
                    <td className="num">{issue.priorityScore}</td>
                    <td>
                      <button type="button" className="chip-button" onClick={() => void saveActionItem(actionFromIssue(issue))}>
                        <ListChecks size={13} />
                        Add
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

function AuditTrend({ trend }: { trend: NonNullable<ReturnType<typeof useDashboard>['technicalAudit']>['trend'] }) {
  const rows = (trend || []).slice(-12);
  const maxIssues = Math.max(1, ...rows.map((row) => row.total || 0));
  return (
    <div className="audit-trend-grid">
      {rows.map((row) => (
        <article key={row.createdAt}>
          <div className="audit-trend-bars">
            <i className="health" style={{ height: `${Math.max(8, row.healthScore)}%` }} />
            <i className="issues" style={{ height: `${Math.max(8, (row.total / maxIssues) * 100)}%` }} />
          </div>
          <strong>{row.healthScore}</strong>
          <span>{formatter.format(row.total)} issues</span>
          <small>{new Date(row.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small>
        </article>
      ))}
    </div>
  );
}

type RunPageSpeed = ReturnType<typeof useDashboard>['runPageSpeed'];

function PageSpeedPanel({
  pageSpeed,
  runPageSpeed,
}: {
  pageSpeed: ReturnType<typeof useDashboard>['pageSpeed'];
  runPageSpeed: RunPageSpeed;
}) {
  const [strategy, setStrategy] = React.useState<'mobile' | 'desktop'>('mobile');
  const [busyUrl, setBusyUrl] = React.useState<string | null>(null);

  const candidates = pageSpeed?.candidates || [];
  const resultByUrl = React.useMemo(() => {
    const map = new Map<string, PageSpeedResult>();
    for (const result of pageSpeed?.results || []) {
      if (result.strategy === strategy) map.set(stripUrl(result.url), result);
    }
    return map;
  }, [pageSpeed, strategy]);

  async function test(url: string) {
    setBusyUrl(url);
    try {
      await runPageSpeed(url, strategy);
    } finally {
      setBusyUrl(null);
    }
  }

  if (!pageSpeed?.configured) {
    return (
      <section className="panel">
        <PanelHeader icon={<Zap />} title="Core Web Vitals" action="PageSpeed Insights" />
        <p className="panel-note">
          Add <code>PAGESPEED_API_KEY</code> in Netlify environment variables to pull Lighthouse scores and Core Web Vitals
          (LCP, CLS, INP) for your key pages — free from Google.
        </p>
      </section>
    );
  }

  const rows = candidates.length
    ? candidates
    : Array.from(resultByUrl.values()).map((r) => ({ url: r.url, title: shortUrl(r.url) }));

  return (
    <section className="panel">
      <PanelHeader icon={<Zap />} title="Core Web Vitals" action="PageSpeed Insights · Google" />
      <div className="filter-bar">
        <div className="seg-toggle">
          <button type="button" className={strategy === 'mobile' ? 'active' : ''} onClick={() => setStrategy('mobile')}>
            <Smartphone size={14} /> Mobile
          </button>
          <button type="button" className={strategy === 'desktop' ? 'active' : ''} onClick={() => setStrategy('desktop')}>
            <Monitor size={14} /> Desktop
          </button>
        </div>
        <span className="panel-note" style={{ margin: 0 }}>Lab scores + real-user field data (CrUX) when available.</span>
      </div>
      <div className="dash-table-wrap">
        <table className="dash-table">
          <thead>
            <tr>
              <th>Page</th>
              <th className="num">Perf</th>
              <th className="num">SEO</th>
              <th className="num">A11y</th>
              <th className="num">Best</th>
              <th className="num">LCP</th>
              <th className="num">CLS</th>
              <th className="num">INP</th>
              <th>Test</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((page) => {
              const result = resultByUrl.get(stripUrl(page.url));
              const lcp = result?.fieldLcpMs ?? result?.lcpMs ?? null;
              const cls = result?.fieldClsX1000 ?? result?.clsX1000 ?? null;
              const inp = result?.fieldInpMs ?? null;
              return (
                <tr key={page.url}>
                  <td>
                    <strong>{page.title}</strong>
                    <small>{shortUrl(page.url)}</small>
                  </td>
                  <td className="num"><ScoreDot value={result?.performance} /></td>
                  <td className="num"><ScoreDot value={result?.seo} /></td>
                  <td className="num"><ScoreDot value={result?.accessibility} /></td>
                  <td className="num"><ScoreDot value={result?.bestPractices} /></td>
                  <td className="num">{lcp != null ? `${(lcp / 1000).toFixed(1)}s` : '—'}</td>
                  <td className="num">{cls != null ? (cls / 1000).toFixed(2) : '—'}</td>
                  <td className="num">{inp != null ? `${inp}ms` : '—'}</td>
                  <td>
                    <button type="button" className="chip-button" disabled={busyUrl === page.url} onClick={() => void test(page.url)}>
                      <RefreshCw size={13} className={busyUrl === page.url ? 'spin' : ''} />
                      {result ? 'Re-test' : 'Test'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ScoreDot({ value }: { value?: number | null }) {
  if (value == null) return <span className="muted">—</span>;
  const tone = value >= 90 ? 'success' : value >= 50 ? 'warning' : 'danger';
  return <span className={`score-dot score-${tone}`}>{value}</span>;
}

function stripUrl(url: string) {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname.replace(/\/$/, '')}`.toLowerCase();
  } catch {
    return url.toLowerCase().replace(/\/$/, '');
  }
}

function SortTh<T extends string>({ label, col, sort, onSort }: { label: string; col: T; sort: { key: T; dir: 'asc' | 'desc' }; onSort: (col: T) => void }) {
  const active = sort.key === col;
  return (
    <button type="button" className={`sort-th${active ? ' active' : ''}`} onClick={() => onSort(col)}>
      {label}
      {active ? (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ChevronsUpDown size={12} />}
    </button>
  );
}

function healthDelta(trend?: TechnicalAudit['trend']): KpiDelta | undefined {
  if (!trend || trend.length < 2) return undefined;
  const change = (trend[trend.length - 1].healthScore || 0) - (trend[trend.length - 2].healthScore || 0);
  if (!change) return undefined;
  return { display: `${change > 0 ? '+' : ''}${change}`, good: change > 0 };
}

function actionFromIssue(issue: TechnicalAuditIssue) {
  return {
    fingerprint: `audit:${issue.id}`,
    type: issue.type,
    source: 'technical-audit',
    title: issue.title,
    detail: issue.detail,
    pageUrl: issue.pageUrl,
    cluster: issue.cluster,
    priorityScore: issue.priorityScore,
  };
}

function slugFromUrl(url: string) {
  try {
    return new URL(url).pathname.split('/').filter(Boolean).pop() || encodeURIComponent(url);
  } catch {
    return encodeURIComponent(url);
  }
}
