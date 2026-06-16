import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Gauge, Star } from 'lucide-react';
import { useDashboard } from '../data';
import { LoadingState, DashCard, DashMetric, PageHeading, SearchPeriodNav } from '../components';
import {
  ClusterDonut,
  ChartLegend,
  MiniRing,
  RankBreakdown,
  ScoreGauge,
  SearchClicksChart,
  SearchTrendChart,
  Sparkbars,
} from '../charts';
import {
  buildFocusActions,
  computeSeoHealth,
  formatCompact,
  formatDate,
  formatDateRange,
  formatPercent,
  formatPosition,
  formatter,
  normalizeUrl,
  periodDelta,
  positionBuckets,
  trendClicks,
  trendCtrPercent,
  trendKeywords,
  trendPositions,
} from '../lib';
import type { Pillar, SearchOpportunities, SearchOpportunity } from '../types';

export function OverviewPage() {
  const { snapshot, searchOpportunities, isLoading } = useDashboard();
  const [searchData, setSearchData] = useState<SearchOpportunities | null>(null);
  const [loadingPeriod, setLoadingPeriod] = useState(false);

  useEffect(() => {
    if (searchOpportunities) setSearchData(searchOpportunities);
  }, [searchOpportunities]);

  const loadPeriod = useCallback(async (startDate: string, endDate: string) => {
    setLoadingPeriod(true);
    try {
      const response = await fetch(
        `/api/search-opportunities?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
        { credentials: 'include' },
      );
      if (response.ok) setSearchData((await response.json()) as SearchOpportunities);
    } finally {
      setLoadingPeriod(false);
    }
  }, []);

  const topPillars = useMemo(
    () => [...(snapshot?.pillars || [])].sort((a, b) => b.inboundCount - a.inboundCount),
    [snapshot?.pillars],
  );
  const leadPillar = topPillars[0] || null;
  const relatedPosts = useMemo(() => {
    if (!leadPillar || !snapshot) return [];
    const pillarUrl = normalizeUrl(leadPillar.url);
    return (snapshot.allPosts || [])
      .filter((post) => post.cluster === leadPillar.cluster && normalizeUrl(post.url) !== pillarUrl)
      .sort((a, b) => b.inboundCount - a.inboundCount)
      .slice(0, 8);
  }, [leadPillar, snapshot]);

  if (isLoading && !snapshot) return <LoadingState label="Building your content map" />;
  if (!snapshot) return null;

  const health = computeSeoHealth(snapshot);
  const actions = buildFocusActions(snapshot, searchData).slice(0, 3);
  const confirmed = snapshot.kpis.confirmedPillars || 0;
  const suggested = snapshot.kpis.suggestedPillars ?? Math.max(0, (snapshot.pillars?.length || 0) - confirmed);
  const gscReady = Boolean(searchData?.available);
  const buckets = positionBuckets(searchData);
  const hasRankings = buckets.some((bucket) => bucket.value > 0);
  const rankedTotal = buckets.reduce((sum, bucket) => sum + bucket.value, 0);
  const dateLabel = gscReady ? formatDateRange(searchData?.startDate, searchData?.endDate) : '';
  const crawlDate = formatDate(snapshot.generatedAt);
  const trend = searchData?.trend || [];
  const periods = searchData?.periods || [];
  const periodIndex = searchData?.periodIndex ?? 0;
  const clicksDelta = periodDelta(trend, periodIndex);

  const topQueries = (searchData?.topQueries?.length
    ? searchData.topQueries
    : searchData?.queryOpportunities) || [];

  const postsByCluster = snapshot.clusters.slice(0, 10).map((cluster) => cluster.posts);
  const linkMix = [snapshot.kpis.linkGaps, snapshot.kpis.internalLinks, snapshot.kpis.orphanPosts];

  return (
    <>
      <PageHeading
        title="Overview"
        description="Search and content performance for codakid.com"
        badges={
          <>
            <span className="dash-badge">Crawl · {crawlDate}</span>
            {gscReady ? <span className="dash-badge live">Search · {dateLabel}</span> : null}
          </>
        }
      />

      {!gscReady && (
        <DashCard soft>
          <div className="dash-connect">
            <Gauge size={20} />
            <div>
              <strong>Connect Google Search Console</strong>
              <p>Add clicks, impressions, and keyword data to this dashboard.</p>
            </div>
            <Link className="dash-link" to="/settings">
              Settings <ArrowRight size={14} />
            </Link>
          </div>
        </DashCard>
      )}

      {gscReady && searchData && (
        <section className="dash-section dash-search-section">
          <div className="dash-section-head">
            <h2>Search performance</h2>
            <Link className="dash-link" to="/keywords">
              Keywords <ArrowUpRight size={14} />
            </Link>
          </div>

          <SearchPeriodNav
            label={dateLabel}
            note={
              periods.length > 1
                ? `Period ${periodIndex + 1} of ${periods.length}${clicksDelta ? ` · ${clicksDelta}` : ''}`
                : 'Latest imported snapshot'
            }
            canPrevious={periodIndex < periods.length - 1}
            canNext={periodIndex > 0}
            loading={loadingPeriod}
            onPrevious={() => {
              const period = periods[periodIndex + 1];
              if (period) void loadPeriod(period.startDate, period.endDate);
            }}
            onNext={() => {
              const period = periods[periodIndex - 1];
              if (period) void loadPeriod(period.startDate, period.endDate);
            }}
          />

          <DashCard title="Weekly trend" subtitle="Clicks and impressions across imported reporting periods">
            <SearchTrendChart
              trend={trend}
              activeStart={searchData.startDate}
              activeEnd={searchData.endDate}
            />
          </DashCard>

          <div className="dash-metrics dash-metrics-search">
            <DashMetric
              label="Organic clicks"
              value={searchData.summary?.totalClicks || 0}
              detail={`${formatCompact(searchData.summary?.totalImpressions || 0)} impressions`}
              chart={<Sparkbars data={trendClicks(trend)} color="var(--tertiary)" />}
              to="/keywords"
            />
            <DashMetric
              label="Avg. position"
              value={formatPosition(searchData.summary?.averagePosition || 0)}
              detail="Lower is better · trend inverted"
              chart={<Sparkbars data={trendPositions(trend)} color="var(--green)" />}
              to="/keywords"
            />
            <DashMetric
              label="Click rate"
              value={formatPercent(searchData.summary?.averageCtr || 0)}
              detail="Clicks ÷ impressions"
              chart={<Sparkbars data={trendCtrPercent(trend)} color="var(--amber)" />}
              to="/keywords"
            />
            <DashMetric
              label="Tracked keywords"
              value={rankedTotal}
              detail="Queries with position data"
              chart={<Sparkbars data={trendKeywords(trend)} color="var(--green)" />}
              to="/keywords"
            />
          </div>

          <div className="dash-grid dash-grid-search">
            <DashCard title="Top pages" subtitle="Clicks in this reporting period">
              {searchData.topPages?.length ? (
                <SearchClicksChart pages={searchData.topPages} />
              ) : (
                <p className="dash-empty">No page clicks in this period.</p>
              )}
            </DashCard>
            <DashCard title="Where you rank" subtitle={`${rankedTotal} keywords by position bucket`}>
              {hasRankings ? <RankBreakdown buckets={buckets} /> : <p className="dash-empty">No ranking data yet.</p>}
            </DashCard>
          </div>

          <DashCard title="Top queries" subtitle="Click column headers to sort">
            <TopQueriesTable queries={topQueries} />
          </DashCard>
        </section>
      )}

      <section className="dash-section">
        <div className="dash-section-head">
          <h2>Content health</h2>
          <Link className="dash-link" to="/pillars">
            Pillars <ArrowUpRight size={14} />
          </Link>
        </div>
        <p className="dash-section-note">Live crawl · {crawlDate}</p>

        <div className="dash-grid dash-grid-health">
          <DashCard className="dash-health-card">
            <div className="dash-health">
              <ScoreGauge score={health.score} tone={health.band.tone} size={120} />
              <div>
                <span className={`dash-status ${health.band.tone}`}>{health.band.label}</span>
                <h3>Site health</h3>
                <p className="dash-health-copy">
                  Weighted score from internal links, content freshness, and confirmed pillars.
                </p>
                <ul className="dash-factor-list">
                  {health.factors.map((factor) => (
                    <li key={factor.label}>
                      <span>{factor.label}</span>
                      <div className="dash-factor-score">
                        <Sparkbars
                          data={[factor.score, 100 - factor.score]}
                          color={factor.score >= 70 ? 'var(--green)' : factor.score >= 50 ? 'var(--amber)' : 'var(--red)'}
                        />
                        <strong>{factor.score}</strong>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </DashCard>

          <div className="dash-metrics dash-metrics-stack">
            <DashMetric
              label="Blog posts"
              value={snapshot.kpis.postsCrawled}
              detail={`${snapshot.kpis.categories} topic clusters`}
              chart={<Sparkbars data={postsByCluster} color="var(--tertiary)" />}
              to="/pillars"
            />
            <DashMetric
              label="Confirmed pillars"
              value={confirmed}
              detail={`${suggested} candidates to review`}
              chart={<MiniRing value={confirmed} total={Math.max(1, confirmed + suggested)} color="var(--green)" />}
              to="/pillars"
            />
            <DashMetric
              label="Link gaps"
              value={snapshot.kpis.linkGaps}
              detail="Posts missing links to pillars"
              chart={<Sparkbars data={linkMix} color="var(--amber)" />}
              to="/links"
            />
          </div>
        </div>

        <div className="dash-grid dash-grid-2">
          {leadPillar && (
            <DashCard
              title="Pillar cluster"
              subtitle={`${leadPillar.cluster} · posts linking into your lead pillar`}
              action={
                <Link className="dash-link" to="/links">
                  Link map <ArrowUpRight size={14} />
                </Link>
              }
            >
              <div className="dash-pillar-focus">
                <div className="dash-pillar-main">
                  <Star size={14} />
                  <div>
                    <a href={leadPillar.url} target="_blank" rel="noreferrer">
                      {leadPillar.title}
                    </a>
                    <span>
                      {formatter.format(leadPillar.inboundCount)} inbound · health {leadPillar.health}
                    </span>
                  </div>
                </div>
                {relatedPosts.length > 0 ? (
                  <ul className="dash-related-list">
                    {relatedPosts.map((post) => (
                      <li key={post.url}>
                        <a href={post.url} target="_blank" rel="noreferrer">
                          {post.title}
                        </a>
                        <span>{post.inboundCount} in · {post.health} health</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="dash-empty">No related posts in this cluster yet.</p>
                )}
              </div>
            </DashCard>
          )}

          <DashCard title="Topic mix" subtitle="Share of posts by cluster">
            <div className="dash-topic-mix">
              <ClusterDonut clusters={snapshot.clusters} />
              <ChartLegend clusters={snapshot.clusters} />
            </div>
          </DashCard>
        </div>

        {topPillars.length > 0 && (
          <DashCard
            title="All pillars"
            action={
              <Link className="dash-link" to="/pillars">
                Manage <ArrowUpRight size={14} />
              </Link>
            }
          >
            <PillarTable pillars={topPillars.slice(0, 5)} />
          </DashCard>
        )}
      </section>

      {actions.length > 0 && (
        <section className="dash-section">
          <div className="dash-section-head">
            <h2>Next actions</h2>
            <Link className="dash-link" to="/gameplan">
              Gameplan <ArrowUpRight size={14} />
            </Link>
          </div>
          <ul className="dash-actions">
            {actions.map((action, index) => (
              <li key={`${action.label}-${action.title}`}>
                <span>{index + 1}</span>
                <div>
                  <small>{action.label}</small>
                  <strong>{action.title}</strong>
                  <p>{action.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

type SortKey = 'clicks' | 'impressions' | 'ctr' | 'position';

function TopQueriesTable({ queries }: { queries: SearchOpportunity[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'clicks', dir: 'desc' });

  const rows = useMemo(() => {
    const copy = [...queries];
    copy.sort((a, b) => {
      const av = Number(a[sort.key]) || 0;
      const bv = Number(b[sort.key]) || 0;
      return sort.dir === 'asc' ? av - bv : bv - av;
    });
    return copy.slice(0, 10);
  }, [queries, sort]);

  if (!queries.length) {
    return <p className="dash-empty">Sync Search Console to populate queries.</p>;
  }

  const toggle = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'position' ? 'asc' : 'desc' },
    );

  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '');

  return (
    <div className="dash-table-wrap">
      <table className="dash-table">
        <thead>
          <tr>
            <th>Query</th>
            <th className="num sortable" onClick={() => toggle('clicks')}>
              Clicks{arrow('clicks')}
            </th>
            <th className="num sortable" onClick={() => toggle('impressions')}>
              Impr.{arrow('impressions')}
            </th>
            <th className="num sortable" onClick={() => toggle('ctr')}>
              CTR{arrow('ctr')}
            </th>
            <th className="num sortable" onClick={() => toggle('position')}>
              Pos.{arrow('position')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.query || row.label}-${index}`}>
              <td className="query">{row.query || row.label}</td>
              <td className="num">{formatter.format(row.clicks)}</td>
              <td className="num">{formatCompact(row.impressions)}</td>
              <td className="num">{formatPercent(row.ctr)}</td>
              <td className="num">
                <span className={`dash-pos ${positionTone(row.position)}`}>{formatPosition(row.position)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PillarTable({ pillars }: { pillars: Pillar[] }) {
  return (
    <div className="dash-table-wrap">
      <table className="dash-table">
        <thead>
          <tr>
            <th>Pillar</th>
            <th>Status</th>
            <th className="num">Health</th>
            <th className="num">Inbound</th>
            <th className="num">Updated</th>
          </tr>
        </thead>
        <tbody>
          {pillars.map((pillar) => (
            <tr key={pillar.url}>
              <td className="query">
                <a href={pillar.url} target="_blank" rel="noreferrer">
                  {pillar.title}
                </a>
              </td>
              <td>
                <span className={`dash-status ${healthTone(pillar.health)}`}>{healthLabel(pillar.health)}</span>
              </td>
              <td className="num">{pillar.health}</td>
              <td className="num">{formatter.format(pillar.inboundCount)}</td>
              <td className="num muted">{formatDate(pillar.modified) || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function healthTone(score: number) {
  if (score >= 78) return 'success';
  if (score >= 58) return 'warning';
  return 'danger';
}

function healthLabel(score: number) {
  if (score >= 78) return 'Strong';
  if (score >= 58) return 'Fair';
  return 'Weak';
}

function positionTone(position: number) {
  if (!Number.isFinite(position) || position <= 0) return 'muted';
  if (position <= 3) return 'success';
  if (position <= 10) return 'default';
  if (position <= 20) return 'warning';
  return 'danger';
}
