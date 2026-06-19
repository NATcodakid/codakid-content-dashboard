import type { ReactNode } from 'react';
import React from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Clock,
  Download,
  GitBranch,
  KeyRound,
  Lightbulb,
  Link2,
  ListChecks,
  MousePointerClick,
  PanelTop,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { useDashboard } from '../data';
import { ConnectCard, LoadingState } from '../components';
import type { KpiDelta } from '../components';
import { SearchClicksChart, CtrPositionScatter, RankTrendChart, RankSparkline, PositionBucketTrend } from '../charts';
import { formatCompact, formatDate, formatDateRange, formatPercent, formatPosition, formatter, shortUrl } from '../lib';
import type { CannibalizationOpportunity, ContentDecayOpportunity, Ga4Report, KeywordIdeas, PostSummary, SearchOpportunity, SearchTrendPoint, TrackedKeyword } from '../types';

type KeywordTab = 'opportunities' | 'tracking' | 'research' | 'traffic';

const KEYWORD_TABS: Array<{ id: KeywordTab; label: string }> = [
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'tracking', label: 'Tracking' },
  { id: 'research', label: 'Research' },
  { id: 'traffic', label: 'Traffic' },
];

function KeywordsHero({
  periodLabel,
  gscLive,
  clicks,
  impressions,
  avgPosition,
  avgCtr,
  clicksDelta,
  impressionsDelta,
  positionDelta,
  ctrDeltaValue,
  trackedCount,
}: {
  periodLabel: string;
  gscLive: boolean;
  clicks?: number;
  impressions?: number;
  avgPosition?: number;
  avgCtr?: number;
  clicksDelta?: KpiDelta;
  impressionsDelta?: KpiDelta;
  positionDelta?: KpiDelta;
  ctrDeltaValue?: KpiDelta;
  trackedCount: number;
}) {
  return (
    <header className="keywords-hero">
      <div className="keywords-hero-glow" aria-hidden />
      <div className="keywords-hero-inner">
        <div className="keywords-hero-copy">
          <span className="keywords-eyebrow">
            <KeyRound size={14} />
            Keywords
          </span>
          <h1>Search intelligence</h1>
          <p>Opportunities from Search Console, rank tracking, keyword research, and GA4 blog traffic.</p>
        </div>
        <div className="keywords-hero-aside">
          <span className={`keywords-status${gscLive ? ' live' : ''}`}>
            <i aria-hidden />
            {gscLive ? 'Search Console live' : 'GSC pending'}
          </span>
          <p className="keywords-period">{periodLabel}</p>
          <dl className="keywords-stats">
            {gscLive ? (
              <>
                <div>
                  <dt>Clicks</dt>
                  <dd>{formatter.format(clicks || 0)}</dd>
                  {clicksDelta ? <small className={deltaClass(clicksDelta)}>{clicksDelta.display}</small> : null}
                </div>
                <div>
                  <dt>Impressions</dt>
                  <dd>{formatter.format(impressions || 0)}</dd>
                  {impressionsDelta ? <small className={deltaClass(impressionsDelta)}>{impressionsDelta.display}</small> : null}
                </div>
                <div>
                  <dt>Avg position</dt>
                  <dd>{Math.round(avgPosition || 0)}</dd>
                  {positionDelta ? <small className={deltaClass(positionDelta)}>{positionDelta.display}</small> : null}
                </div>
                <div>
                  <dt>CTR</dt>
                  <dd>{formatPercent(avgCtr || 0)}</dd>
                  {ctrDeltaValue ? <small className={deltaClass(ctrDeltaValue)}>{ctrDeltaValue.display}</small> : null}
                </div>
              </>
            ) : (
              <>
                <div>
                  <dt>Tracked</dt>
                  <dd>{trackedCount}</dd>
                </div>
                <div>
                  <dt>GSC</dt>
                  <dd>—</dd>
                </div>
                <div>
                  <dt>Period</dt>
                  <dd>—</dd>
                </div>
                <div>
                  <dt>CTR</dt>
                  <dd>—</dd>
                </div>
              </>
            )}
          </dl>
        </div>
      </div>
    </header>
  );
}

function KeywordsTabs({ tab, onChange }: { tab: KeywordTab; onChange: (tab: KeywordTab) => void }) {
  return (
    <nav className="keywords-tabs" role="tablist" aria-label="Keywords sections">
      {KEYWORD_TABS.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={tab === item.id}
          className={tab === item.id ? 'active' : ''}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

function deltaClass(delta: KpiDelta) {
  if (delta.good === true) return 'up';
  if (delta.good === false) return 'down';
  return '';
}

export function KeywordsPage() {
  const {
    searchOpportunities,
    ga4,
    isLoading,
    snapshot,
    saveActionItem,
    serpTracker,
    trackedKeywords,
    trackSerpKeywords,
    saveTrackedKeyword,
    updateTrackedKeyword,
    archiveTrackedKeyword,
    syncTrackedKeywords,
    syncGa4,
    fetchKeywordIdeas,
  } = useDashboard();
  const [query, setQuery] = React.useState('');
  const [bucket, setBucket] = React.useState('all');
  const [minImpressions, setMinImpressions] = React.useState(0);
  const [serpKeyword, setSerpKeyword] = React.useState('');
  const [tab, setTab] = React.useState<KeywordTab>('opportunities');

  if (isLoading && !snapshot) return <LoadingState label="Loading search opportunities" />;

  if (!searchOpportunities?.available) {
    return (
      <div className="keywords-page">
        <KeywordsHero
          periodLabel="Waiting on Search Console import"
          gscLive={false}
          trackedCount={trackedKeywords.filter((item) => item.status === 'active').length}
        />
        <KeywordsTabs tab={tab} onChange={setTab} />
        <div className="keywords-tab-panel">
          {tab === 'tracking' && (
            <KeywordTrackingPanel
              keywords={trackedKeywords}
              posts={snapshot?.allPosts || []}
              serpConfigured={Boolean(serpTracker?.configured)}
              onSave={saveTrackedKeyword}
              onUpdate={updateTrackedKeyword}
              onArchive={archiveTrackedKeyword}
              onTrack={(keyword) => void trackSerpKeywords([keyword])}
              onWeeklySync={() => void syncTrackedKeywords()}
            />
          )}
          {tab === 'research' && (
            <KeywordIdeasPanel
              fetchKeywordIdeas={fetchKeywordIdeas}
              onTrack={(keyword) => void saveTrackedKeyword({ keyword, source: 'keyword-ideas' })}
            />
          )}
          {tab === 'traffic' && <Ga4Panel report={ga4} onSync={() => void syncGa4()} />}
          {tab === 'opportunities' && (
            <section className="keywords-empty-gsc">
              <PanelTop size={26} strokeWidth={1.5} />
              <strong>Waiting on Search Console data</strong>
              <p>
                {searchOpportunities?.message ||
                  'Once the daily import runs, this tab will show low-CTR pages and keywords close to page one.'}
              </p>
            </section>
          )}
        </div>
      </div>
    );
  }

  const opportunities = searchOpportunities;
  const allKeywordRows = [
    ...opportunities.queryOpportunities,
    ...opportunities.pageQueryOpportunities,
    ...opportunities.topQueries,
  ];
  const filteredRows = dedupeOpportunities(allKeywordRows)
    .filter((row) => !query || `${row.label} ${row.query || ''} ${row.page || ''}`.toLowerCase().includes(query.toLowerCase()))
    .filter((row) => row.impressions >= minImpressions)
    .filter((row) => bucket === 'all' || bucketFor(row.position) === bucket)
    .sort((a, b) => b.priorityScore - a.priorityScore || b.impressions - a.impressions);

  return (
    <div className="keywords-page">
      <KeywordsHero
        periodLabel={formatDateRange(opportunities.startDate, opportunities.endDate)}
        gscLive
        clicks={opportunities.summary?.totalClicks}
        impressions={opportunities.summary?.totalImpressions}
        avgPosition={opportunities.summary?.averagePosition}
        avgCtr={opportunities.summary?.averageCtr}
        clicksDelta={pctDelta(opportunities.trend, 'totalClicks', true)}
        impressionsDelta={pctDelta(opportunities.trend, 'totalImpressions', true)}
        positionDelta={positionDelta(opportunities.trend)}
        ctrDeltaValue={ctrDelta(opportunities.trend)}
        trackedCount={trackedKeywords.filter((item) => item.status === 'active').length}
      />

      <KeywordsTabs tab={tab} onChange={setTab} />

      <div className="keywords-tab-panel">
      {tab === 'opportunities' && (
        <>
          <section className="keywords-panel chart-panel">
            <div className="keywords-section-head">
              <MousePointerClick size={18} />
              <div>
                <h2>Click-through vs. ranking</h2>
                <p>Low-left dots rank well but under-click — title/meta fixes. Bubble size = impressions.</p>
              </div>
            </div>
            <CtrPositionScatter rows={[...opportunities.topQueries, ...opportunities.queryOpportunities]} />
          </section>

          <section className="keywords-opp-grid">
            <OpportunityList
              title="Almost on page 1"
              icon={<ArrowUpRight />}
              hint="Positions 6–20. A refresh or internal links can push these onto page one."
              emptyText="No keywords are sitting in positions 6-20 yet."
              opportunities={opportunities.queryOpportunities.slice(0, 6)}
              onSave={(row) => void saveActionItem(actionFromOpportunity(row, 'striking-distance'))}
            />
            <OpportunityList
              title="High impressions, low clicks"
              icon={<MousePointerClick />}
              hint="Seen often but not clicked — rewrite title and meta."
              emptyText="No low-CTR pages crossed the current threshold."
              opportunities={opportunities.pageOpportunities.slice(0, 6)}
              onSave={(row) => void saveActionItem(actionFromOpportunity(row, 'low-ctr-page'))}
            />
            <OpportunityList
              title="Page + keyword fixes"
              icon={<ListChecks />}
              hint="Specific pages underperforming for specific queries."
              emptyText="No page-query fixes are available yet."
              opportunities={opportunities.pageQueryOpportunities.slice(0, 6)}
              showPage
              onSave={(row) => void saveActionItem(actionFromOpportunity(row, 'page-query'))}
            />
            <ContentDecayList
              rows={opportunities.contentDecay || []}
              onSave={(row) =>
                void saveActionItem({
                  fingerprint: `decay:${row.page}`,
                  type: 'content-decay',
                  source: 'search-console',
                  title: shortUrl(row.page),
                  detail: row.recommendation,
                  pageUrl: row.page,
                  priorityScore: row.priorityScore,
                })
              }
            />
            <CannibalizationList
              rows={opportunities.cannibalization || []}
              onSave={(row) =>
                void saveActionItem({
                  fingerprint: `cannibalization:${row.query}`,
                  type: 'cannibalization',
                  source: 'search-console',
                  title: row.query,
                  detail: row.recommendation,
                  keyword: row.query,
                  pageUrl: row.pages[0]?.page || '',
                  priorityScore: row.totalImpressions,
                })
              }
            />
            <OpportunityList
              title="Top queries by visibility"
              icon={<BarChart3 />}
              hint="Most-seen queries — protect and expand these."
              emptyText="No query-level data yet."
              opportunities={opportunities.topQueries.slice(0, 6)}
            />
          </section>

          <section className="keywords-panel">
            <div className="keywords-section-head">
              <BarChart3 size={18} />
              <div>
                <h2>Top pages by clicks</h2>
                <p>Search Console page performance in this period</p>
              </div>
            </div>
            {opportunities.topPages?.length ? (
              <SearchClicksChart pages={opportunities.topPages} />
            ) : (
              <p className="keywords-panel-note">No page-level click data in this snapshot yet.</p>
            )}
          </section>
        </>
      )}

      {tab === 'tracking' && (
        <>
          <RankMovementSummary keywords={trackedKeywords} />
          <section className="keywords-charts-grid">
            <div className="keywords-panel">
              <div className="keywords-section-head">
                <TrendingUp size={18} />
                <div>
                  <h2>Average rank over time</h2>
                  <p>Tracked keywords</p>
                </div>
              </div>
              <RankTrendChart keywords={trackedKeywords} />
            </div>
            <div className="keywords-panel">
              <div className="keywords-section-head">
                <BarChart3 size={18} />
                <div>
                  <h2>Position buckets</h2>
                  <p>How rankings shift week to week</p>
                </div>
              </div>
              <PositionBucketTrend keywords={trackedKeywords} />
            </div>
          </section>

          <KeywordTrackingPanel
            keywords={trackedKeywords}
            posts={snapshot?.allPosts || []}
            serpConfigured={Boolean(serpTracker?.configured)}
            onSave={saveTrackedKeyword}
            onUpdate={updateTrackedKeyword}
            onArchive={archiveTrackedKeyword}
            onTrack={(keyword) => void trackSerpKeywords([keyword])}
            onWeeklySync={() => void syncTrackedKeywords()}
          />

          <section className="keywords-panel keywords-serp-panel">
            <div className="keywords-section-head">
              <Search size={18} />
              <div>
                <h2>SERP checker</h2>
                <p>
                  Live top 10 · {serpTracker?.configured ? 'Serper cached in Neon' : 'SERPER_API_KEY needed'}
                </p>
              </div>
            </div>
            <div className="keywords-serp-bar">
              <Search size={16} />
              <input
                value={serpKeyword}
                placeholder="coding for kids"
                onChange={(event) => setSerpKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && serpKeyword.trim() && serpTracker?.configured) {
                    void trackSerpKeywords([serpKeyword]);
                  }
                }}
              />
              <button
                type="button"
                className="keywords-run-btn"
                disabled={!serpKeyword.trim() || !serpTracker?.configured}
                onClick={() => void trackSerpKeywords([serpKeyword])}
              >
                Check SERP
              </button>
            </div>
            <div className="keywords-serp-feed">
              {(serpTracker?.snapshots || []).slice(0, 5).map((snapshot) => (
                <article key={snapshot.id} className="keywords-serp-card">
                  <header>
                    <strong>{snapshot.keyword}</strong>
                    <span>{snapshot.cached ? 'cached' : 'fresh'}</span>
                    <em>{snapshot.codakidPosition ? `CodaKid #${snapshot.codakidPosition}` : 'Not in top 10'}</em>
                  </header>
                  <ol>
                    {snapshot.organic.slice(0, 5).map((result) => (
                      <li key={`${snapshot.id}-${result.position}-${result.link}`}>
                        <span>{result.position}</span>
                        <a href={result.link} target="_blank" rel="noreferrer">{result.domain}</a>
                        <small>{result.title}</small>
                      </li>
                    ))}
                  </ol>
                </article>
              ))}
              {!(serpTracker?.snapshots || []).length ? (
                <p className="keywords-panel-note">No SERP checks yet — search a keyword above.</p>
              ) : null}
            </div>
          </section>
        </>
      )}

      {tab === 'research' && (
        <>
          <KeywordIdeasPanel
            fetchKeywordIdeas={fetchKeywordIdeas}
            onTrack={(keyword) => void saveTrackedKeyword({ keyword, source: 'keyword-ideas' })}
          />

          <section className="keywords-panel keywords-explorer-panel">
            <div className="keywords-section-head">
              <Search size={18} />
              <div>
                <h2>Keyword explorer</h2>
                <p>{filteredRows.length} matches · search, filter, export</p>
              </div>
            </div>
            <div className="keywords-explorer-filters">
              <div className="keywords-search">
                <Search size={16} />
                <input
                  type="search"
                  placeholder="Filter keyword or page…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <select value={bucket} onChange={(event) => setBucket(event.target.value)}>
                <option value="all">All positions</option>
                <option value="top3">Top 3</option>
                <option value="page1">Page 1</option>
                <option value="page2">Page 2</option>
                <option value="page3">21+</option>
              </select>
              <select value={minImpressions} onChange={(event) => setMinImpressions(Number(event.target.value))}>
                <option value={0}>Any impressions</option>
                <option value={100}>100+ impressions</option>
                <option value={500}>500+ impressions</option>
                <option value={1000}>1,000+ impressions</option>
              </select>
              <button type="button" className="keywords-text-btn" onClick={() => downloadKeywordCsv(filteredRows)}>
                <Download size={14} />
                Export CSV
              </button>
            </div>
            <KeywordExplorerTable
              rows={filteredRows.slice(0, 80)}
              onSave={(row) =>
                void saveActionItem({
                  fingerprint: `keyword:${row.page || ''}:${row.query || row.label}`,
                  type: 'keyword',
                  source: 'search-console',
                  title: row.query || row.label,
                  detail: row.recommendation,
                  pageUrl: row.page || '',
                  keyword: row.query || row.label,
                  priorityScore: row.priorityScore,
                })
              }
            />
          </section>
        </>
      )}

      {tab === 'traffic' && <Ga4Panel report={ga4} onSync={() => void syncGa4()} />}
      </div>
    </div>
  );
}

function RankMovementSummary({ keywords }: { keywords: TrackedKeyword[] }) {
  const comparable = keywords.filter((keyword) => keyword.latestSerp?.position && keyword.previousPosition);
  const winners = comparable.filter((keyword) => Number(keyword.positionChange || 0) > 0).sort((a, b) => Number(b.positionChange || 0) - Number(a.positionChange || 0));
  const losers = comparable.filter((keyword) => Number(keyword.positionChange || 0) < 0).sort((a, b) => Number(a.positionChange || 0) - Number(b.positionChange || 0));
  return (
    <section className="rank-movement-summary">
      <header><div><h2>Weekly movement</h2><p>Serper positions compared with the previous saved run</p></div><span>{comparable.length} comparable keywords</span></header>
      <div>
        <article><span>Winners</span><strong>{winners.length}</strong><p>{winners[0] ? `${winners[0].keyword} gained ${winners[0].positionChange} positions` : 'A second weekly run creates this comparison.'}</p></article>
        <article><span>Losers</span><strong>{losers.length}</strong><p>{losers[0] ? `${losers[0].keyword} lost ${Math.abs(Number(losers[0].positionChange))} positions` : 'No measured ranking losses yet.'}</p></article>
        <article><span>Stable</span><strong>{Math.max(0, comparable.length - winners.length - losers.length)}</strong><p>Keywords with no position change between saved runs.</p></article>
      </div>
    </section>
  );
}

function KeywordTrackingPanel({
  keywords,
  posts,
  serpConfigured,
  onSave,
  onUpdate,
  onArchive,
  onTrack,
  onWeeklySync,
}: {
  keywords: TrackedKeyword[];
  posts: PostSummary[];
  serpConfigured: boolean;
  onSave: (item: {
    keyword: string;
    cluster: string;
    targetUrl: string;
    intent: string;
    priority: number;
    cadence: string;
    status: string;
  }) => Promise<TrackedKeyword | null>;
  onUpdate: (item: Partial<TrackedKeyword> & { id: string; targetUrl?: string }) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
  onTrack: (keyword: string) => void;
  onWeeklySync: () => void;
}) {
  const [keyword, setKeyword] = React.useState('');
  const [cluster, setCluster] = React.useState('Coding for Kids');
  const [targetUrl, setTargetUrl] = React.useState('');
  const [intent, setIntent] = React.useState('commercial');
  const active = keywords.filter((item) => item.status === 'active');
  const tracked = keywords.filter((item) => item.latestSerp);
  const averagePosition = tracked.length
    ? tracked.reduce((sum, item) => sum + Number(item.latestSerp?.position || 0), 0) / tracked.length
    : 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const saved = await onSave({
      keyword,
      cluster,
      targetUrl,
      intent,
      priority: 70,
      cadence: 'weekly',
      status: 'active',
    });
    if (saved) {
      setKeyword('');
      setTargetUrl('');
    }
  }

  return (
    <section className="keywords-panel keywords-tracking-panel">
      <div className="keywords-section-head">
        <Clock size={18} />
        <div>
          <h2>Tracked keywords</h2>
          <p>{active.length} active · {tracked.length} with SERP history</p>
        </div>
      </div>
      <div className="keywords-tracker-bar">
        <div className="keywords-mini-stat">
          <span>Active</span>
          <strong>{active.length}</strong>
        </div>
        <div className="keywords-mini-stat">
          <span>Avg rank</span>
          <strong>{averagePosition ? formatPosition(averagePosition) : '—'}</strong>
        </div>
        <div className="keywords-mini-stat">
          <span>Weekly cap</span>
          <strong>30</strong>
        </div>
        <button type="button" className="keywords-text-btn" disabled={!serpConfigured} onClick={onWeeklySync}>
          <RefreshCw size={14} />
          Run due keywords
        </button>
      </div>
      <form className="keywords-add-form" onSubmit={submit}>
        <div className="keywords-search">
          <Search size={16} />
          <input
            value={keyword}
            placeholder="Add keyword, e.g. best coding classes for kids"
            onChange={(event) => setKeyword(event.target.value)}
            required
          />
        </div>
        <select value={cluster} onChange={(event) => setCluster(event.target.value)}>
          {['Coding for Kids', 'Python', 'Minecraft', 'Roblox', 'AI', 'Camps', 'Homeschool', 'Scratch', 'Game Development'].map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <select value={intent} onChange={(event) => setIntent(event.target.value)}>
          <option value="commercial">Commercial</option>
          <option value="informational">Informational</option>
          <option value="pillar">Pillar</option>
        </select>
        <input
          list="keyword-target-pages"
          value={targetUrl}
          placeholder="Target page URL optional"
          onChange={(event) => setTargetUrl(event.target.value)}
        />
        <datalist id="keyword-target-pages">
          {posts.slice(0, 80).map((post) => (
            <option key={post.url} value={post.url}>{post.title}</option>
          ))}
        </datalist>
        <button type="submit" className="keywords-run-btn">
          <Plus size={14} />
          Add
        </button>
      </form>
      <div className="keywords-table-wrap">
        <table className="keywords-table tracked-keyword-table">
          <thead>
            <tr>
              <th>Keyword</th>
              <th>Demand</th>
              <th>Opportunity</th>
              <th>Rank trend</th>
              <th>Target</th>
              <th>SERP features</th>
              <th>Controls</th>
            </tr>
          </thead>
          <tbody>
            {keywords.slice(0, 80).map((item) => (
              <TrackedKeywordRow
                key={item.id}
                item={item}
                serpConfigured={serpConfigured}
                onUpdate={onUpdate}
                onArchive={onArchive}
                onTrack={onTrack}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TrackedKeywordRow({
  item,
  serpConfigured,
  onUpdate,
  onArchive,
  onTrack,
}: {
  item: TrackedKeyword;
  serpConfigured: boolean;
  onUpdate: (item: Partial<TrackedKeyword> & { id: string; targetUrl?: string }) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
  onTrack: (keyword: string) => void;
}) {
  const [targetUrl, setTargetUrl] = React.useState(item.targetUrl || '');
  const movement = item.positionChange;
  return (
    <tr>
      <td>
        <div className="tracked-keyword-name">
          <strong>{item.keyword}</strong>
          <small>{item.cluster} · {item.intent} · {item.status}</small>
        </div>
      </td>
      <td><div className="keyword-score-cell"><strong>{item.demand.score || '—'}</strong><span><i style={{ width: `${item.demand.score || 0}%` }} /></span><small>{item.demand.impressions ? `${formatCompact(item.demand.impressions)} GSC impressions` : 'No exact GSC query'}</small></div></td>
      <td><div className="keyword-opportunity-cell"><strong>{item.opportunityScore || '—'}</strong><span className={`difficulty-badge ${item.difficulty.label.toLowerCase()}`}>{item.difficulty.label}</span><small title={item.difficulty.basis}>estimated from live signals</small></div></td>
      <td><div className="rank-trend-cell"><div><strong>{item.latestSerp?.position ? `#${formatPosition(item.latestSerp.position)}` : '—'}</strong><span className={movementClass(movement)}>{movement == null ? (item.lastTrackedAt ? 'flat' : 'not tracked') : `${movement > 0 ? '+' : ''}${movement.toFixed(0)}`}</span></div><RankSparkline trend={item.trend} /></div></td>
      <td>
        <div className="target-map-control">
          <input list="keyword-target-pages" value={targetUrl} placeholder="Unknown target" onChange={(event) => setTargetUrl(event.target.value)} onBlur={() => { if (targetUrl !== item.targetUrl) void onUpdate({ id: item.id, targetUrl }); }} />
          {targetUrl ? <a href={targetUrl} target="_blank" rel="noreferrer" aria-label="Open target page"><Link2 size={14} /></a> : null}
        </div>
      </td>
      <td><div className="serp-feature-counts"><span>PAA {item.serpFeatures.peopleAlsoAsk}</span><span>Related {item.serpFeatures.relatedSearches}</span></div></td>
      <td>
        <div className="table-controls">
          <button className="icon-button small-icon-button" disabled={!serpConfigured} onClick={() => onTrack(item.keyword)} title="Track SERP">
            <RefreshCw size={14} />
          </button>
          <button
            className="icon-button small-icon-button"
            onClick={() => void onUpdate({ id: item.id, status: item.status === 'active' ? 'paused' : 'active' })}
            title={item.status === 'active' ? 'Pause keyword' : 'Resume keyword'}
          >
            {item.status === 'active' ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button className="icon-button small-icon-button" onClick={() => void onArchive(item.id)} title="Archive keyword">
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function KeywordIdeasPanel({
  fetchKeywordIdeas,
  onTrack,
}: {
  fetchKeywordIdeas: (seed: string) => Promise<KeywordIdeas | null>;
  onTrack: (keyword: string) => void;
}) {
  const [seed, setSeed] = React.useState('');
  const [ideas, setIdeas] = React.useState<KeywordIdeas | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [added, setAdded] = React.useState<Set<string>>(new Set());

  async function run(event?: React.FormEvent) {
    event?.preventDefault();
    const term = seed.trim();
    if (!term || isLoading) return;
    setIsLoading(true);
    const result = await fetchKeywordIdeas(term);
    setIdeas(result);
    setIsLoading(false);
  }

  function track(keyword: string) {
    onTrack(keyword);
    setAdded((prev) => new Set(prev).add(keyword));
  }

  const groups: Array<{ key: keyof KeywordIdeas['groups']; label: string; hint: string }> = [
    { key: 'questions', label: 'Questions', hint: 'great for FAQ + blog headers' },
    { key: 'comparisons', label: 'Comparisons', hint: '“vs / alternative” intent' },
    { key: 'modifiers', label: 'Modifiers', hint: 'best / free / for kids…' },
    { key: 'related', label: 'Related terms', hint: 'broaden the cluster' },
  ];

  return (
    <section className="keywords-panel keywords-ideas-panel">
      <div className="keywords-section-head">
        <Lightbulb size={18} />
        <div>
          <h2>Keyword ideas</h2>
          <p>Google Autocomplete · free</p>
        </div>
      </div>
      <form className="keywords-ideas-form" onSubmit={run}>
        <div className="keywords-search grow">
          <Search size={16} />
          <input
            value={seed}
            placeholder="Enter a seed topic, e.g. coding for kids"
            onChange={(event) => setSeed(event.target.value)}
          />
        </div>
        <button type="submit" className="keywords-run-btn" disabled={isLoading || !seed.trim()}>
          {isLoading ? <RefreshCw size={14} className="spin" /> : <Lightbulb size={14} />}
          {isLoading ? 'Finding ideas…' : 'Get ideas'}
        </button>
      </form>

      {!ideas && !isLoading ? (
        <p className="keywords-panel-note">
          Expand any topic into real Google searches — questions, comparisons, and long-tail variants — then track the
          ones worth ranking for. No API key or credits required.
        </p>
      ) : null}

      {ideas ? (
        <>
          <p className="keywords-panel-note">
            {ideas.total} ideas for <strong>“{ideas.seed}”</strong>. Click a phrase to add it to tracked keywords.
          </p>
          <div className="keywords-idea-groups">
            {groups.map(({ key, label, hint }) => {
              const items = ideas.groups[key] || [];
              if (!items.length) return null;
              return (
                <div key={key} className="keywords-idea-group">
                  <header>
                    <strong>{label}</strong>
                    <small>{items.length} · {hint}</small>
                  </header>
                  <div className="keywords-idea-chips">
                    {items.map((keyword) => (
                      <button
                        key={keyword}
                        type="button"
                        className={`keywords-idea-chip${added.has(keyword) ? ' added' : ''}`}
                        title={added.has(keyword) ? 'Added to tracked keywords' : 'Add to tracked keywords'}
                        onClick={() => track(keyword)}
                      >
                        {added.has(keyword) ? <ListChecks size={12} /> : <Plus size={12} />}
                        {keyword}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </section>
  );
}

function Ga4Panel({ report, onSync }: { report: Ga4Report | null; onSync: () => void }) {
  const latest = report?.latest;
  return (
    <section className="keywords-panel keywords-ga4-panel">
      <div className="keywords-section-head">
        <BarChart3 size={18} />
        <div>
          <h2>GA4 blog traffic</h2>
          <p>{report?.configured ? report.analyticsScopeReady ? 'ready' : 'reconnect Google' : 'property id needed'}</p>
        </div>
      </div>
      {!report?.configured ? (
        <ConnectCard
          icon={<BarChart3 />}
          title="Connect Google Analytics 4"
          body="See sessions, users, and top blog pages alongside your search data."
          steps={[
            'Add GA4_PROPERTY_ID in Netlify → Site configuration → Environment variables',
            'Redeploy, then reconnect Google so the dashboard can read Analytics',
          ]}
          hint="Free with your existing Google account."
        />
      ) : !report.analyticsScopeReady ? (
        <ConnectCard
          icon={<RefreshCw />}
          title="Reconnect Google for Analytics"
          body="Google needs to be reconnected once after deploy so the dashboard can read GA4 data."
          hint="Uses read-only Analytics access."
          action={(
            <a className="secondary-button" href="/api/google/oauth/start">
              Connect Google Analytics
            </a>
          )}
        />
      ) : latest ? (
        <>
          <div className="keywords-tracker-bar">
            <div className="keywords-mini-stat">
              <span>Sessions</span>
              <strong>{formatter.format(latest.summary.sessions)}</strong>
            </div>
            <div className="keywords-mini-stat">
              <span>Users</span>
              <strong>{formatter.format(latest.summary.totalUsers)}</strong>
            </div>
            <div className="keywords-mini-stat">
              <span>Views</span>
              <strong>{formatter.format(latest.summary.screenPageViews)}</strong>
            </div>
            <div className="keywords-mini-stat">
              <span>Engagement</span>
              <strong>{formatPercent(latest.summary.engagementRate)}</strong>
            </div>
            <button type="button" className="keywords-text-btn" onClick={onSync}>
              <RefreshCw size={14} />
              Sync GA4
            </button>
          </div>
          <div className="keywords-ga4-list">
            {latest.topPages.slice(0, 5).map((page) => (
              <article key={page.path}>
                <div>
                  <strong>{page.title || page.path}</strong>
                  <small>{page.path}</small>
                </div>
                <span>{formatter.format(page.views)} views</span>
              </article>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="keywords-panel-note">GA4 is configured. Run a sync to save the first Analytics snapshot into Neon.</p>
          <button type="button" className="keywords-text-btn" onClick={onSync}>
            <RefreshCw size={14} />
            Sync GA4
          </button>
        </>
      )}
    </section>
  );
}

function movementClass(value?: number | null) {
  if (!value) return 'keywords-movement flat';
  if (value > 0) return 'keywords-movement up';
  return 'keywords-movement down';
}

function ContentDecayList({
  rows,
  onSave,
}: {
  rows: ContentDecayOpportunity[];
  onSave: (row: ContentDecayOpportunity) => void;
}) {
  return (
    <section className="keywords-opp-card">
      <header className="keywords-opp-head">
        <AlertTriangle size={16} />
        <div>
          <h3>Content decay</h3>
          <p>Pages losing clicks between periods</p>
        </div>
      </header>
      {rows.length ? (
        <ul className="keywords-opp-list">
          {rows.slice(0, 6).map((row) => (
            <li key={row.page}>
              <div className="keywords-opp-row-top">
                <strong>{shortUrl(row.page)}</strong>
                <span className="keywords-opp-metrics">
                  {formatter.format(Math.max(0, row.lostClicks))} clicks down · {formatPercent(row.clickChange)}
                </span>
              </div>
              <p>{row.recommendation}</p>
              <button type="button" className="keywords-action-btn" onClick={() => onSave(row)}>
                <ListChecks size={13} />
                Add action
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="keywords-opp-empty">No meaningful page decay detected between the latest two imported periods.</p>
      )}
    </section>
  );
}

function CannibalizationList({
  rows,
  onSave,
}: {
  rows: CannibalizationOpportunity[];
  onSave: (row: CannibalizationOpportunity) => void;
}) {
  return (
    <section className="keywords-opp-card">
      <header className="keywords-opp-head">
        <GitBranch size={16} />
        <div>
          <h3>Query cannibalization</h3>
          <p>Multiple pages competing for the same query</p>
        </div>
      </header>
      {rows.length ? (
        <ul className="keywords-opp-list">
          {rows.slice(0, 6).map((row) => (
            <li key={row.query}>
              <div className="keywords-opp-row-top">
                <strong>{row.query}</strong>
                <span className="keywords-opp-metrics">
                  {row.pageCount} pages · {formatter.format(row.totalImpressions)} impressions
                </span>
              </div>
              <div className="keywords-cannibal-pages">
                {row.pages.slice(0, 3).map((page) => (
                  <span key={page.page}>
                    {shortUrl(page.page)} <b>#{formatPosition(page.position)}</b>
                  </span>
                ))}
              </div>
              <p>{row.recommendation}</p>
              <button type="button" className="keywords-action-btn" onClick={() => onSave(row)}>
                <ListChecks size={13} />
                Add action
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="keywords-opp-empty">No overlapping page/query conflicts crossed the current threshold.</p>
      )}
    </section>
  );
}

function OpportunityList({
  title,
  icon,
  opportunities,
  emptyText,
  hint,
  showPage = false,
  onSave,
}: {
  title: string;
  icon: ReactNode;
  opportunities: SearchOpportunity[];
  emptyText: string;
  hint?: string;
  showPage?: boolean;
  onSave?: (opportunity: SearchOpportunity) => void;
}) {
  return (
    <section className="keywords-opp-card">
      <header className="keywords-opp-head">
        {icon}
        <div>
          <h3>{title}</h3>
          {hint ? <p>{hint}</p> : null}
        </div>
      </header>
      {opportunities.length ? (
        <ul className="keywords-opp-list">
          {opportunities.map((opportunity) => (
            <li key={`${title}-${opportunity.label}-${opportunity.page || ''}`}>
              <div className="keywords-opp-row-top">
                <div>
                  <strong>{opportunity.label}</strong>
                  {showPage && opportunity.page ? <small>{shortUrl(opportunity.page)}</small> : null}
                </div>
                <span className="keywords-opp-metrics">
                  {formatter.format(opportunity.impressions)} imp. · {formatPercent(opportunity.ctr)} CTR · #{formatPosition(opportunity.position)}
                </span>
              </div>
              <p>{opportunity.recommendation}</p>
              {onSave ? (
                <button type="button" className="keywords-action-btn" onClick={() => onSave(opportunity)}>
                  <ListChecks size={13} />
                  Add action
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="keywords-opp-empty">{emptyText}</p>
      )}
    </section>
  );
}

function KeywordExplorerTable({ rows, onSave }: { rows: SearchOpportunity[]; onSave: (row: SearchOpportunity) => void }) {
  if (!rows.length) return <p className="keywords-panel-note">No keyword rows match these filters.</p>;
  return (
    <div className="keywords-table-wrap">
      <table className="keywords-table">
        <thead>
          <tr>
            <th>Keyword</th>
            <th>Page</th>
            <th className="num">Clicks</th>
            <th className="num">Impr.</th>
            <th className="num">CTR</th>
            <th className="num">Pos.</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.page || ''}-${row.query || row.label}`}>
              <td className="query">{row.query || row.label}</td>
              <td>{row.page ? shortUrl(row.page) : '—'}</td>
              <td className="num">{formatter.format(row.clicks)}</td>
              <td className="num">{formatter.format(row.impressions)}</td>
              <td className="num">{formatPercent(row.ctr)}</td>
              <td className="num">{formatPosition(row.position)}</td>
              <td>
                <button type="button" className="keywords-action-btn compact" onClick={() => onSave(row)}>
                  <ListChecks size={13} />
                  Add
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function lastTwo(trend?: SearchTrendPoint[]) {
  if (!trend || trend.length < 2) return null;
  return { current: trend[trend.length - 1], previous: trend[trend.length - 2] };
}

function pctDelta(trend: SearchTrendPoint[] | undefined, key: 'totalClicks' | 'totalImpressions', goodWhenUp: boolean): KpiDelta | undefined {
  const pair = lastTwo(trend);
  if (!pair) return undefined;
  const curr = pair.current[key] || 0;
  const prev = pair.previous[key] || 0;
  if (!prev) return undefined;
  const change = Math.round(((curr - prev) / prev) * 100);
  return { display: `${change > 0 ? '+' : ''}${change}%`, good: change === 0 ? undefined : goodWhenUp ? change > 0 : change < 0 };
}

function ctrDelta(trend?: SearchTrendPoint[]): KpiDelta | undefined {
  const pair = lastTwo(trend);
  if (!pair) return undefined;
  const change = Math.round(((pair.current.averageCtr || 0) - (pair.previous.averageCtr || 0)) * 1000) / 10;
  if (!change) return undefined;
  return { display: `${change > 0 ? '+' : ''}${change}pt`, good: change > 0 };
}

function positionDelta(trend?: SearchTrendPoint[]): KpiDelta | undefined {
  const pair = lastTwo(trend);
  if (!pair) return undefined;
  const change = Math.round(((pair.current.averagePosition || 0) - (pair.previous.averagePosition || 0)) * 10) / 10;
  if (!change) return undefined;
  // Lower position is better, so a decrease (negative change) is good.
  return { display: `${change > 0 ? '+' : ''}${change}`, good: change < 0, direction: change < 0 ? 'up' : 'down' };
}

function dedupeOpportunities(rows: SearchOpportunity[]) {
  const map = new Map<string, SearchOpportunity>();
  for (const row of rows) {
    const key = `${row.page || ''}|${row.query || row.label}`.toLowerCase();
    const existing = map.get(key);
    if (!existing || row.priorityScore > existing.priorityScore) map.set(key, row);
  }
  return [...map.values()];
}

function bucketFor(position: number) {
  if (position <= 3) return 'top3';
  if (position <= 10) return 'page1';
  if (position <= 20) return 'page2';
  return 'page3';
}

function actionFromOpportunity(row: SearchOpportunity, type: string) {
  return {
    fingerprint: `${type}:${row.page || ''}:${row.query || row.label}`,
    type,
    source: 'search-console',
    title: row.query || row.label,
    detail: row.recommendation,
    pageUrl: row.page || '',
    keyword: row.query || row.label,
    priorityScore: row.priorityScore,
  };
}

function downloadKeywordCsv(rows: SearchOpportunity[]) {
  const header = ['keyword', 'page', 'clicks', 'impressions', 'ctr', 'position', 'priority_score', 'recommendation'];
  const csv = [
    header.join(','),
    ...rows.map((row) =>
      [
        row.query || row.label,
        row.page || '',
        row.clicks,
        row.impressions,
        row.ctr,
        row.position,
        row.priorityScore,
        row.recommendation,
      ]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(','),
    ),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'codakid-keyword-opportunities.csv';
  link.click();
  URL.revokeObjectURL(url);
}
