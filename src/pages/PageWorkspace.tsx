import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { Activity, ArrowUpRight, Bot, ClipboardList, Download, Eye, GitBranch, Plus, RefreshCw, Search, Star, TrendingUp } from 'lucide-react';
import { HealthMeter, KpiCard, LoadingState, PageHeading, PanelHeader } from '../components';
import { useDashboard } from '../data';
import { downloadMarkdown, pageBriefMarkdown } from '../export';
import { formatPercent, formatPosition, formatter, normalizeUrl, shortUrl } from '../lib';
import type { ActionInput, PageBrief, SearchOpportunity, TechnicalAuditIssue } from '../types';

export function PageWorkspacePage() {
  const { slug } = useParams();
  const {
    snapshot,
    searchOpportunities,
    ga4,
    trackedKeywords,
    technicalAudit,
    competitors,
    isLoading,
    isPillar,
    markPillar,
    saveActionItem,
    runAiWorkbench,
  } = useDashboard();
  const [pageBrief, setPageBrief] = React.useState<PageBrief | null>(null);
  const [briefLoading, setBriefLoading] = React.useState(false);

  if (isLoading && !snapshot) return <LoadingState label="Loading page workspace" />;
  if (!snapshot) return null;

  const decoded = decodeURIComponent(slug || '');
  const post = (snapshot.allPosts || []).find((item) => item.slug === decoded || slugFromUrl(item.url) === decoded);

  if (!post) {
    return (
      <>
        <PageHeading title="Page not found" description="The selected URL was not part of the latest WordPress crawl." />
        <Link className="dash-link" to="/pillars">Back to pillars</Link>
      </>
    );
  }

  const page = post;
  const normalized = normalizeUrl(page.url);
  const pagePath = safePath(page.url);
  const confirmed = isPillar(page.url);
  const relatedPosts = (snapshot.allPosts || [])
    .filter((item) => item.cluster === page.cluster && normalizeUrl(item.url) !== normalized)
    .sort((a, b) => b.health - a.health)
    .slice(0, 10);
  const linkGaps = snapshot.linkGaps
    .filter((gap) => normalizeUrl(gap.pillarUrl) === normalized || normalizeUrl(gap.sourceUrl) === normalized)
    .slice(0, 12);
  const issues = (technicalAudit?.issues || []).filter((issue) => normalizeUrl(issue.pageUrl) === normalized);
  const pageQueries = (searchOpportunities?.pageQueryOpportunities || [])
    .filter((row) => matchesPage(row, page.url))
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 12);
  const pageSearch = (searchOpportunities?.topPages || []).find((row) => matchesPage(row, page.url));
  const ga4Page = ga4?.latest?.topPages.find((row) => normalizeUrl(row.url || row.path) === normalized || row.path === pagePath);
  const keywordRows = trackedKeywords
    .filter((keyword) => normalizeUrl(keyword.targetUrl) === normalized || keyword.cluster === page.cluster)
    .slice(0, 8);
  const competitorAngles = competitors?.competitors
    .flatMap((competitor) => (competitor.contentAngles || []).map((angle) => ({ domain: competitor.domain, angle })))
    .slice(0, 8) || [];

  async function saveRefreshAction() {
    await saveActionItem({
      title: `Refresh ${page.title}`,
      detail: `Update this page for ${page.cluster}, improve top-query copy, and add missing internal links from supporting posts.`,
      type: 'content-refresh',
      source: 'page-workspace',
      pageUrl: page.url,
      cluster: page.cluster,
      priorityScore: issues.some((issue) => issue.severity === 'High') ? 90 : 65,
    });
  }

  async function generatePageBrief() {
    setBriefLoading(true);
    const result = await runAiWorkbench('page-brief', {
      page,
      pageQueries,
      pageIssues: issues,
      relatedPosts,
      linkGaps,
      ga4Page,
    });
    if (result && 'titleIdeas' in (result as PageBrief)) setPageBrief(result as PageBrief);
    setBriefLoading(false);
  }

  return (
    <>
      <PageHeading
        title={page.title}
        description={`${page.cluster} · ${shortUrl(page.url)}`}
        badges={
          <>
            <a className="dash-badge" href={page.url} target="_blank" rel="noreferrer">
              Open live page
            </a>
            {!confirmed && (
              <button
                type="button"
                className="dash-badge button-badge"
                onClick={() => void markPillar({ url: page.url, title: page.title, cluster: page.cluster })}
              >
                Make pillar
              </button>
            )}
          </>
        }
      />

      <div className="dash-stack">
        <section className="kpi-grid kpi-grid-3">
          <KpiCard icon={<Activity />} label="SEO Health" value={page.health} note={page.status} tone={page.health >= 70 ? 'success' : 'warning'} />
          <KpiCard icon={<GitBranch />} label="Internal Links" value={`${page.inboundCount}/${page.outboundCount}`} note="inbound / outbound" />
          <KpiCard icon={<Eye />} label="Views" value={ga4Page?.views ?? '—'} note={ga4Page ? `${formatter.format(ga4Page.sessions)} sessions` : 'GA4 page match pending'} />
        </section>

        <section className="page-workspace-grid">
          <div className="panel page-focus-panel">
            <PanelHeader icon={<Star />} title="Page Control" action={confirmed ? 'pillar' : 'blog page'} />
            <div className="page-focus-score">
              <HealthMeter value={page.health} status={page.status} />
            </div>
            <dl className="mini-definition-grid">
              <div>
                <dt>Word count</dt>
                <dd>{page.wordCount ? formatter.format(page.wordCount) : 'Not measured'}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{page.modified || page.date || 'Unknown'}</dd>
              </div>
              <div>
                <dt>Cluster</dt>
                <dd>{page.cluster}</dd>
              </div>
              <div>
                <dt>Search clicks</dt>
                <dd>{pageSearch ? formatter.format(pageSearch.clicks) : 'No row yet'}</dd>
              </div>
              <div>
                <dt>Title length</dt>
                <dd>{page.titleLength ? `${page.titleLength} chars` : 'Not measured'}</dd>
              </div>
              <div>
                <dt>Headings</dt>
                <dd>{page.h2Count ?? 0} H2 · {page.h3Count ?? 0} H3</dd>
              </div>
              <div>
                <dt>Images</dt>
                <dd>{page.imageCount ?? 0} total · {page.imagesMissingAlt ?? 0} missing alt</dd>
              </div>
              <div>
                <dt>Schema hints</dt>
                <dd>{page.schemaHintCount ?? 0}</dd>
              </div>
            </dl>
            <button type="button" className="primary-button full-width" onClick={() => void saveRefreshAction()}>
              <Plus size={16} />
              Add refresh action
            </button>
          </div>

          <div className="panel">
            <PanelHeader icon={<ClipboardList />} title="Next Best Fixes" action={`${issues.length + linkGaps.length} signals`} />
            <div className="signal-list">
              {issues.slice(0, 5).map((issue) => (
                <SignalItem key={issue.id} issue={issue} onSave={() => saveActionItem(actionFromIssue(issue))} />
              ))}
              {!issues.length && linkGaps.slice(0, 4).map((gap) => (
                <article className="signal-item" key={`${gap.sourceUrl}-${gap.pillarUrl}`}>
                  <span className="severity-chip medium">Link</span>
                  <div>
                    <strong>Add a support link</strong>
                    <p>{gap.sourceTitle} should link here using “{gap.suggestedAnchor}”.</p>
                  </div>
                </article>
              ))}
              {!issues.length && !linkGaps.length && <p className="panel-note">No urgent issues were found for this page in the latest crawl.</p>}
            </div>
          </div>
        </section>

        <section className="dashboard-grid">
          <div className="panel page-ai-brief-panel">
            <PanelHeader icon={<Bot />} title="AI Rewrite Brief" action="OpenAI" />
            <p className="panel-note">
              Generates title/meta/FAQ/internal-link suggestions for this exact page using crawl, GSC, GA4, and competitor context.
            </p>
            <button className="secondary-button" onClick={() => void generatePageBrief()} disabled={briefLoading}>
              <RefreshCw size={15} className={briefLoading ? 'spin' : ''} />
              Generate rewrite brief
            </button>
            {pageBrief && (
              <>
                <div className="page-brief-toolbar">
                  <span>Brief generated from page, audit, search, links, and competitor context.</span>
                  <button
                    type="button"
                    className="chip-button"
                    onClick={() => downloadMarkdown(`${slugFromUrl(page.url) || 'codakid-page'}-rewrite-brief.md`, pageBriefMarkdown(page, pageBrief))}
                  >
                    <Download size={13} />
                    Export brief
                  </button>
                </div>
                <div className="page-brief-grid">
                  <BriefList title="Title ideas" rows={pageBrief.titleIdeas} />
                  <BriefList title="Meta descriptions" rows={pageBrief.metaDescriptions} />
                  <BriefList title="FAQ questions" rows={pageBrief.faqQuestions} />
                  <BriefList title="Missing sections" rows={pageBrief.missingSections} />
                  <BriefList title="Internal link anchors" rows={pageBrief.internalLinkAnchors} />
                  <BriefList title="Rewrite notes" rows={pageBrief.rewriteNotes} />
                </div>
              </>
            )}
          </div>

          <div className="panel">
            <PanelHeader icon={<Search />} title="Search Console Query Wins" action={searchOpportunities?.available ? 'live import' : 'pending'} />
            {pageQueries.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Query</th>
                      <th>Clicks</th>
                      <th>CTR</th>
                      <th>Position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageQueries.map((row) => (
                      <tr key={`${row.query}-${row.page}`}>
                        <td>
                          <strong>{row.query || row.label}</strong>
                          <small>{row.recommendation}</small>
                        </td>
                        <td>{formatter.format(row.clicks)}</td>
                        <td>{formatPercent(row.ctr || 0)}</td>
                        <td>{formatPosition(row.position)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="panel-note">No Search Console query rows matched this exact page yet.</p>
            )}
          </div>

          <div className="panel">
            <PanelHeader icon={<TrendingUp />} title="Tracked Keywords" action={`${keywordRows.length} linked`} />
            {keywordRows.length ? (
              <div className="keyword-mini-list">
                {keywordRows.map((keyword) => (
                  <article key={keyword.id}>
                    <div>
                      <strong>{keyword.keyword}</strong>
                      <small>{keyword.cluster}</small>
                    </div>
                    <span>{keyword.latestSerp?.position ? `#${keyword.latestSerp.position}` : 'not tracked'}</span>
                  </article>
                ))}
              </div>
            ) : (
              <p className="panel-note">Add this page as the target URL for tracked keywords to see SERP history here.</p>
            )}
          </div>
        </section>

        <section className="dashboard-grid">
          <div className="panel">
            <PanelHeader icon={<GitBranch />} title="Internal Link Targets" action={`${relatedPosts.length} support posts`} />
            <div className="gap-list">
              {relatedPosts.slice(0, 8).map((item) => (
                <article className="gap-item" key={item.url}>
                  <span>{item.cluster}</span>
                  <Link to={`/pages/${encodeURIComponent(item.slug || slugFromUrl(item.url))}`}>{item.title}</Link>
                  <small>{item.health} health · {item.inboundCount} inbound links</small>
                </article>
              ))}
            </div>
          </div>

          <div className="panel">
            <PanelHeader icon={<ArrowUpRight />} title="Competitor Angles" action="watchlist sample" />
            {competitorAngles.length ? (
              <div className="angle-list">
                {competitorAngles.map((item) => (
                  <article key={`${item.domain}-${item.angle}`}>
                    <strong>{item.angle}</strong>
                    <span>{item.domain}</span>
                  </article>
                ))}
              </div>
            ) : (
              <p className="panel-note">Competitor sitemap sampling will surface topic angles here.</p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function SignalItem({ issue, onSave }: { issue: TechnicalAuditIssue; onSave: () => Promise<unknown> }) {
  return (
    <article className="signal-item">
      <span className={`severity-chip ${issue.severity.toLowerCase()}`}>{issue.severity}</span>
      <div>
        <strong>{issue.title}</strong>
        <p>{issue.detail}</p>
      </div>
      <button type="button" className="chip-button" onClick={() => void onSave()}>
        Add
      </button>
    </article>
  );
}

function BriefList({ title, rows }: { title: string; rows?: string[] }) {
  const visibleRows = Array.isArray(rows) ? rows.filter(Boolean).slice(0, 5) : [];
  if (!visibleRows.length) return null;
  return (
    <article className="brief-list-card">
      <strong>{title}</strong>
      <ul>
        {visibleRows.map((row) => <li key={row}>{row}</li>)}
      </ul>
    </article>
  );
}

function actionFromIssue(issue: TechnicalAuditIssue): ActionInput {
  return {
    title: issue.title,
    detail: issue.detail,
    type: issue.type,
    source: 'technical-audit',
    pageUrl: issue.pageUrl,
    cluster: issue.cluster,
    priorityScore: issue.priorityScore,
  };
}

function matchesPage(row: SearchOpportunity, url: string) {
  if (!row.page) return false;
  return normalizeUrl(row.page) === normalizeUrl(url) || safePath(row.page) === safePath(url);
}

function safePath(url: string) {
  try {
    return new URL(url, 'https://codakid.com').pathname.replace(/\/$/, '') || '/';
  } catch {
    return url.replace(/^https?:\/\/[^/]+/i, '').replace(/\/$/, '') || '/';
  }
}

function slugFromUrl(url: string) {
  try {
    return new URL(url).pathname.split('/').filter(Boolean).pop() || '';
  } catch {
    return url.split('/').filter(Boolean).pop() || '';
  }
}
