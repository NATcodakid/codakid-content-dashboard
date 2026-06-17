import React from 'react';
import { AlertTriangle, ArrowRight, FileWarning, Gauge, Link2Off, ListChecks, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDashboard } from '../data';
import { KpiCard, LoadingState, PageHeading, PanelHeader } from '../components';
import { formatter, shortUrl } from '../lib';
import type { TechnicalAuditIssue } from '../types';

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
  const { technicalAudit, snapshot, isLoading, saveActionItem } = useDashboard();
  const [type, setType] = React.useState('all');
  const [query, setQuery] = React.useState('');

  if (isLoading && !snapshot) return <LoadingState label="Running technical audit" />;
  const issues = technicalAudit?.issues || [];
  const filtered = issues
    .filter((issue) => type === 'all' || issue.type === type)
    .filter((issue) => !query || `${issue.title} ${issue.pageTitle} ${issue.detail}`.toLowerCase().includes(query.toLowerCase()));
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
          <KpiCard icon={<Gauge />} label="Audit Health" value={technicalAudit?.healthScore ?? '—'} note={technicalAudit?.trend?.length ? `${technicalAudit.trend.length} saved snapshots` : 'saved to Neon'} tone={(technicalAudit?.healthScore || 0) >= 75 ? 'success' : 'warning'} />
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
                  <th>Issue</th>
                  <th>Page</th>
                  <th>Cluster</th>
                  <th className="num">Priority</th>
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
