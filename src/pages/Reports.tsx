import { AlertTriangle, ArrowRight, BarChart3, CheckCircle2, Download, FileText, ListChecks, MousePointerClick, Target, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDashboard } from '../data';
import { KpiCard, LoadingState, PageHeading, PanelHeader } from '../components';
import type { KpiDelta } from '../components';
import { buildFocusActions, formatCompact, formatDate, formatDateRange, formatPercent, formatPosition, formatter, shortUrl } from '../lib';
import type { SearchTrendPoint } from '../types';

export function ReportsPage() {
  const {
    snapshot,
    searchOpportunities,
    ga4,
    trackedKeywords,
    actionItems,
    competitors,
    technicalAudit,
    isLoading,
  } = useDashboard();

  if (isLoading && !snapshot) return <LoadingState label="Preparing executive report" />;
  if (!snapshot) return null;

  const openActions = actionItems.filter((item) => item.status !== 'done' && item.status !== 'dismissed');
  const doneActions = actionItems.filter((item) => item.status === 'done');
  const pageOne = trackedKeywords.filter((k) => (k.latestSerp?.position || 99) <= 10);
  const topActions = buildFocusActions(snapshot, searchOpportunities).slice(0, 3);
  const traffic = ga4?.latest?.summary;
  const strongestCompetitors = competitors?.competitors?.slice(0, 4) || [];

  const trend = searchOpportunities?.trend || [];
  const clicksDelta = pctDelta(trend, 'totalClicks');
  const imprDelta = pctDelta(trend, 'totalImpressions');
  const positionDelta = positionTrendDelta(trend);
  const healthDelta = auditHealthDelta(technicalAudit?.trend);

  const periodLabel = searchOpportunities?.available
    ? formatDateRange(searchOpportunities.startDate, searchOpportunities.endDate)
    : 'latest available data';

  const wins = buildWins({ clicksDelta, imprDelta, positionDelta, healthDelta, pageOneCount: pageOne.length });
  const risks = buildRisks({ positionDelta, technicalAudit, snapshot });

  return (
    <>
      <PageHeading
        title="Executive Report"
        description={`SEO summary for ${periodLabel} · generated ${formatDate(new Date().toISOString())}`}
        badges={<button className="secondary-button report-print-button" onClick={() => window.print()}><Download size={15} /> Export / print</button>}
      />

      <div className="dash-stack executive-report">
        <section className="report-hero panel">
          <div>
            <span>Executive summary</span>
            <h2>{headline(clicksDelta, traffic ? traffic.sessions : null)}</h2>
            <p>{narrative({ clicksDelta, positionDelta, pageOneCount: pageOne.length, openActions: openActions.length, topAction: topActions[0]?.title })}</p>
          </div>
          <Link className="next-action-link" to="/actions">
            Open work queue <ArrowRight size={22} />
          </Link>
        </section>

        <section className="kpi-grid" aria-label="Executive scorecard">
          <KpiCard icon={<MousePointerClick />} label="Organic Clicks" value={searchOpportunities?.summary?.totalClicks ?? '—'} note={periodLabel} delta={clicksDelta} />
          <KpiCard icon={<BarChart3 />} label="Impressions" value={searchOpportunities?.summary?.totalImpressions ?? '—'} note={periodLabel} delta={imprDelta} />
          <KpiCard icon={<TrendingUp />} label="Avg Position" value={searchOpportunities?.summary ? formatPosition(searchOpportunities.summary.averagePosition) : '—'} note="lower is better" delta={positionDelta} />
          <KpiCard icon={<Target />} label="Audit Health" value={technicalAudit?.healthScore ?? '—'} note={`${technicalAudit?.summary.high || 0} high-priority issues`} tone={(technicalAudit?.healthScore || 0) >= 75 ? 'success' : 'warning'} delta={healthDelta} />
          <KpiCard icon={<MousePointerClick />} label="Est. traffic value" value={searchOpportunities?.summary ? `$${formatCompact(Math.round((searchOpportunities.summary.totalClicks || 0) * 1.5))}` : '—'} note="organic clicks × ~$1.50 est." tone="success" />
        </section>

        <section className="report-triptych">
          <div className="panel report-col wins">
            <PanelHeader icon={<CheckCircle2 />} title="Wins" action="this period" />
            <ul className="report-bullets">
              {wins.length ? wins.map((w) => <li key={w}>{w}</li>) : <li className="muted">More wins appear as data accumulates.</li>}
            </ul>
          </div>
          <div className="panel report-col risks">
            <PanelHeader icon={<AlertTriangle />} title="Risks" action="watch" />
            <ul className="report-bullets">
              {risks.length ? risks.map((r) => <li key={r}>{r}</li>) : <li className="muted">No major risks flagged right now.</li>}
            </ul>
          </div>
          <div className="panel report-col next">
            <PanelHeader icon={<ListChecks />} title="What we're doing" action={`${openActions.length} open`} />
            <ul className="report-bullets">
              {topActions.length ? topActions.map((a) => <li key={a.title}><strong>{a.title}</strong><span>{a.detail}</span></li>) : <li className="muted">Queue is clear.</li>}
            </ul>
          </div>
        </section>

        <section className="dashboard-grid lower-grid">
          <div className="panel">
            <PanelHeader icon={<TrendingUp />} title="Keyword Movement" action="tracked ranks" />
            <div className="report-list">
              {trackedKeywords.slice(0, 6).map((keyword) => (
                <article key={keyword.id}>
                  <strong>{keyword.keyword}</strong>
                  <p>{keyword.latestSerp?.position ? `Ranks #${keyword.latestSerp.position}${typeof keyword.positionChange === 'number' && keyword.positionChange !== 0 ? ` (${keyword.positionChange > 0 ? '+' : ''}${keyword.positionChange})` : ''}` : 'Waiting on first SERP pull'}</p>
                  <small>{keyword.cluster} · {keyword.targetUrl ? shortUrl(keyword.targetUrl) : 'target unmapped'}</small>
                </article>
              ))}
              {!trackedKeywords.length ? <p className="panel-note">Add tracked keywords to populate ranking movement.</p> : null}
            </div>
          </div>
          <div className="panel">
            <PanelHeader icon={<BarChart3 />} title="Traffic" action="GA4" />
            {ga4?.latest ? (
              <div className="report-list">
                <article>
                  <strong>{formatter.format(traffic?.sessions || 0)} sessions</strong>
                  <p>{formatter.format(traffic?.screenPageViews || 0)} page views · {formatPercent(traffic?.engagementRate || 0)} engagement</p>
                  <small>{ga4.latest.startDate} to {ga4.latest.endDate}</small>
                </article>
                {ga4.latest.topPages.slice(0, 3).map((page) => (
                  <article key={page.path}>
                    <strong>{page.title || page.path}</strong>
                    <p>{formatter.format(page.views)} views</p>
                    <small>{page.path}</small>
                  </article>
                ))}
              </div>
            ) : (
              <p className="panel-note">GA4 traffic appears here once Analytics access is connected.</p>
            )}
          </div>
          <div className="panel">
            <PanelHeader icon={<FileText />} title="Competitive Landscape" action="watchlist" />
            <div className="report-list">
              {strongestCompetitors.map((competitor) => (
                <article key={competitor.domain}>
                  <strong>{competitor.label || competitor.domain}</strong>
                  <p>{competitor.opportunities[0] || 'Review sampled content angles.'}</p>
                  <small>{competitor.blogUrls} URLs sampled</small>
                </article>
              ))}
              {!strongestCompetitors.length ? <p className="panel-note">Add competitors to track the landscape.</p> : null}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

// ---- narrative + delta helpers ----

function headline(clicksDelta: KpiDelta | undefined, sessions: number | null) {
  const dir = clicksDelta?.good === true ? 'climbing' : clicksDelta?.good === false ? 'under pressure' : 'holding steady';
  const traffic = sessions != null ? ` with ${formatter.format(sessions)} GA4 sessions in the latest window` : '';
  return `Organic search is ${dir}${traffic}.`;
}

function narrative({
  clicksDelta,
  positionDelta,
  pageOneCount,
  openActions,
  topAction,
}: {
  clicksDelta?: KpiDelta;
  positionDelta?: KpiDelta;
  pageOneCount: number;
  openActions: number;
  topAction?: string;
}) {
  const parts: string[] = [];
  if (clicksDelta) parts.push(`Clicks are ${clicksDelta.display} versus the prior period`);
  if (positionDelta) parts.push(`average position moved ${positionDelta.display}`);
  if (pageOneCount) parts.push(`${pageOneCount} tracked keyword${pageOneCount === 1 ? '' : 's'} now rank on page one`);
  const lead = parts.length ? `${capitalize(parts.join(', '))}.` : 'Search Console data will populate this summary after the next import.';
  const focus = topAction ? ` Top priority this week: ${topAction.toLowerCase()}.` : '';
  const queue = openActions ? ` ${openActions} action${openActions === 1 ? '' : 's'} in the queue.` : '';
  return `${lead}${focus}${queue}`;
}

function buildWins({
  clicksDelta,
  imprDelta,
  positionDelta,
  healthDelta,
  pageOneCount,
}: {
  clicksDelta?: KpiDelta;
  imprDelta?: KpiDelta;
  positionDelta?: KpiDelta;
  healthDelta?: KpiDelta;
  pageOneCount: number;
}) {
  const wins: string[] = [];
  if (clicksDelta?.good) wins.push(`Organic clicks ${clicksDelta.display} vs prior period`);
  if (imprDelta?.good) wins.push(`Impressions ${imprDelta.display} vs prior period`);
  if (positionDelta?.good) wins.push(`Average position improved ${positionDelta.display}`);
  if (healthDelta?.good) wins.push(`Audit health up ${healthDelta.display} points`);
  if (pageOneCount) wins.push(`${pageOneCount} tracked keyword${pageOneCount === 1 ? '' : 's'} ranking on page one`);
  return wins;
}

function buildRisks({
  positionDelta,
  technicalAudit,
  snapshot,
}: {
  positionDelta?: KpiDelta;
  technicalAudit: ReturnType<typeof useDashboard>['technicalAudit'];
  snapshot: NonNullable<ReturnType<typeof useDashboard>['snapshot']>;
}) {
  const risks: string[] = [];
  const high = technicalAudit?.summary.high || 0;
  if (high) risks.push(`${high} high-priority audit issue${high === 1 ? '' : 's'} to fix`);
  if (positionDelta && positionDelta.good === false) risks.push(`Average position slipped ${positionDelta.display}`);
  const orphans = snapshot.kpis.orphanPosts || 0;
  if (orphans) risks.push(`${orphans} orphan post${orphans === 1 ? '' : 's'} with no internal links in`);
  const gaps = snapshot.kpis.linkGaps || 0;
  if (gaps) risks.push(`${gaps} internal-link gap${gaps === 1 ? '' : 's'} on key pages`);
  return risks.slice(0, 4);
}

function lastTwo(trend?: SearchTrendPoint[]) {
  if (!trend || trend.length < 2) return null;
  return { current: trend[trend.length - 1], previous: trend[trend.length - 2] };
}

function pctDelta(trend: SearchTrendPoint[] | undefined, key: 'totalClicks' | 'totalImpressions'): KpiDelta | undefined {
  const pair = lastTwo(trend);
  if (!pair) return undefined;
  const curr = pair.current[key] || 0;
  const prev = pair.previous[key] || 0;
  if (!prev) return undefined;
  const change = Math.round(((curr - prev) / prev) * 100);
  return { display: `${change > 0 ? '+' : ''}${change}%`, good: change === 0 ? undefined : change > 0 };
}

function positionTrendDelta(trend?: SearchTrendPoint[]): KpiDelta | undefined {
  const pair = lastTwo(trend);
  if (!pair) return undefined;
  const change = Math.round(((pair.current.averagePosition || 0) - (pair.previous.averagePosition || 0)) * 10) / 10;
  if (!change) return undefined;
  return { display: `${change > 0 ? '+' : ''}${change}`, good: change < 0, direction: change < 0 ? 'up' : 'down' };
}

function auditHealthDelta(trend?: NonNullable<ReturnType<typeof useDashboard>['technicalAudit']>['trend']): KpiDelta | undefined {
  if (!trend || trend.length < 2) return undefined;
  const change = (trend[trend.length - 1].healthScore || 0) - (trend[trend.length - 2].healthScore || 0);
  if (!change) return undefined;
  return { display: `${change > 0 ? '+' : ''}${change}`, good: change > 0 };
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
