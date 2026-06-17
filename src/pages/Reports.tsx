import { ArrowRight, BarChart3, Download, FileText, ListChecks, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDashboard } from '../data';
import { KpiCard, LoadingState, PageHeading, PanelHeader } from '../components';
import { buildFocusActions, formatDate, formatPercent, formatter, shortUrl } from '../lib';

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

  if (isLoading && !snapshot) return <LoadingState label="Preparing boss report" />;
  if (!snapshot) return null;

  const openActions = actionItems.filter((item) => item.status !== 'done' && item.status !== 'dismissed');
  const doneActions = actionItems.filter((item) => item.status === 'done');
  const ranked = trackedKeywords.filter((keyword) => keyword.latestSerp?.position);
  const topActions = buildFocusActions(snapshot, searchOpportunities).slice(0, 5);
  const traffic = ga4?.latest?.summary;
  const strongestCompetitors = competitors?.competitors?.slice(0, 4) || [];

  return (
    <>
      <PageHeading
        title="Boss Report"
        description={`Executive SEO summary generated ${formatDate(new Date().toISOString())}`}
        badges={<button className="secondary-button report-print-button" onClick={() => window.print()}><Download size={15} /> Export / print</button>}
      />

      <div className="dash-stack boss-report">
        <section className="report-hero panel">
          <div>
            <span>Weekly SEO readout</span>
            <h2>CodaKid blog is tracking {formatter.format(snapshot.kpis.postsCrawled)} posts across {formatter.format(snapshot.clusters.length)} content clusters.</h2>
            <p>
              The biggest opportunity is still focused execution: fix high-priority audit issues, map target keywords to pillar pages,
              and keep internal links flowing into the strongest evergreen guides.
            </p>
          </div>
          <Link className="next-action-link" to="/actions">
            Open work queue <ArrowRight size={22} />
          </Link>
        </section>

        <section className="kpi-grid">
          <KpiCard icon={<BarChart3 />} label="GA4 Sessions" value={traffic ? formatter.format(traffic.sessions) : '-'} note={ga4?.latest ? `${ga4.latest.startDate} to ${ga4.latest.endDate}` : 'waiting on GA4'} />
          <KpiCard icon={<TrendingUp />} label="Tracked Ranks" value={ranked.length} note={`${trackedKeywords.length} keywords in watchlist`} />
          <KpiCard icon={<ListChecks />} label="Open Actions" value={openActions.length} note={`${doneActions.length} completed`} tone="warning" />
          <KpiCard icon={<FileText />} label="Audit Issues" value={technicalAudit?.summary.total || 0} note={`${technicalAudit?.summary.high || 0} high priority`} tone="danger" />
        </section>

        <section className="dashboard-grid lower-grid">
          <div className="panel">
            <PanelHeader icon={<ListChecks />} title="Next Actions" action="this week" />
            <div className="report-list">
              {topActions.map((action) => (
                <article key={`${action.label}-${action.title}`}>
                  <strong>{action.title}</strong>
                  <p>{action.detail}</p>
                  <small>{action.label} · {action.meta}</small>
                </article>
              ))}
            </div>
          </div>
          <div className="panel">
            <PanelHeader icon={<TrendingUp />} title="Keyword Movement" action="Serper" />
            <div className="report-list">
              {trackedKeywords.slice(0, 6).map((keyword) => (
                <article key={keyword.id}>
                  <strong>{keyword.keyword}</strong>
                  <p>{keyword.latestSerp?.position ? `CodaKid ranks #${keyword.latestSerp.position}` : 'Waiting on first SERP pull'}</p>
                  <small>{keyword.cluster} · {keyword.targetUrl ? shortUrl(keyword.targetUrl) : 'target unmapped'}</small>
                </article>
              ))}
            </div>
          </div>
          <div className="panel">
            <PanelHeader icon={<BarChart3 />} title="Traffic Notes" action="GA4" />
            {ga4?.latest ? (
              <div className="report-list">
                <article>
                  <strong>{formatter.format(ga4.latest.summary.screenPageViews)} page views</strong>
                  <p>{formatPercent(ga4.latest.summary.engagementRate)} engagement rate across the latest GA4 window.</p>
                </article>
                {ga4.latest.topPages.slice(0, 4).map((page) => (
                  <article key={page.path}>
                    <strong>{page.title || page.path}</strong>
                    <p>{formatter.format(page.views)} views · {formatPercent(page.engagementRate)} engagement</p>
                    <small>{page.path}</small>
                  </article>
                ))}
              </div>
            ) : (
              <p className="panel-note">GA4 sync will fill this section after Google Analytics access is approved.</p>
            )}
          </div>
          <div className="panel">
            <PanelHeader icon={<FileText />} title="Competitor Notes" action="watchlist" />
            <div className="report-list">
              {strongestCompetitors.map((competitor) => (
                <article key={competitor.domain}>
                  <strong>{competitor.label || competitor.domain}</strong>
                  <p>{competitor.opportunities[0] || 'Review sampled content angles.'}</p>
                  <small>{competitor.blogUrls} URLs sampled · {competitor.status}</small>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
