import type { ReactNode } from 'react';
import React from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Clock,
  Download,
  GitBranch,
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
} from 'lucide-react';
import { useDashboard } from '../data';
import { KpiCard, LoadingState, MetricPill, PageHeading, PanelHeader } from '../components';
import { SearchClicksChart } from '../charts';
import { formatDate, formatDateRange, formatPercent, formatPosition, formatter, shortUrl } from '../lib';
import type { CannibalizationOpportunity, ContentDecayOpportunity, Ga4Report, KeywordIdeas, PostSummary, SearchOpportunity, TrackedKeyword } from '../types';

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

  if (isLoading && !snapshot) return <LoadingState label="Loading search opportunities" />;

  if (!searchOpportunities?.available) {
    return (
      <>
        <PageHeading
          title="Keywords"
          description="Tracked keywords, SERP movement, GA4 traffic, and Search Console opportunities."
        />
        <div className="dash-stack">
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
        <KeywordIdeasPanel
          fetchKeywordIdeas={fetchKeywordIdeas}
          onTrack={(keyword) => void saveTrackedKeyword({ keyword, source: 'keyword-ideas' })}
        />
        <Ga4Panel report={ga4} onSync={() => void syncGa4()} />
        <section className="panel">
          <div className="empty-compact">
            <PanelTop size={22} />
            <strong>Waiting on Search Console data</strong>
            <p>
              {searchOpportunities?.message ||
                'Once the daily import runs, this page will show low-CTR pages and keywords close to page one.'}
            </p>
          </div>
        </section>
        </div>
      </>
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
    <>
      <PageHeading
        title="Keywords"
        description={`Search opportunities · ${formatDateRange(opportunities.startDate, opportunities.endDate)}`}
        badges={<span className="dash-badge live">Search Console</span>}
      />

      <div className="dash-stack">
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
      <KeywordIdeasPanel
        fetchKeywordIdeas={fetchKeywordIdeas}
        onTrack={(keyword) => void saveTrackedKeyword({ keyword, source: 'keyword-ideas' })}
      />
      <Ga4Panel report={ga4} onSync={() => void syncGa4()} />

      <section className="kpi-grid" aria-label="Search KPIs">
        <KpiCard icon={<MousePointerClick />} label="Clicks" value={opportunities.summary?.totalClicks || 0} note="total in range" />
        <KpiCard icon={<BarChart3 />} label="Impressions" value={opportunities.summary?.totalImpressions || 0} note="total in range" />
        <KpiCard icon={<ArrowUpRight />} label="Avg Position" value={Math.round(opportunities.summary?.averagePosition || 0)} note="weighted by impressions" />
        <KpiCard icon={<ListChecks />} label="Avg CTR" value={`${Math.round((opportunities.summary?.averageCtr || 0) * 100)}%`} note="clicks ÷ impressions" />
      </section>

      <section className="panel">
        <PanelHeader icon={<Search />} title="Keyword Explorer" action={`${filteredRows.length} matches`} />
        <div className="filter-bar keyword-filter-bar">
          <div className="search-field">
            <Search size={15} />
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
          <button className="secondary-button" onClick={() => downloadKeywordCsv(filteredRows)}>
            <Download size={15} />
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

      <section className="panel">
        <PanelHeader
          icon={<BarChart3 />}
          title="SERP Tracker"
          action={serpTracker?.configured ? 'Serper cached in Neon' : 'SERPER_API_KEY needed'}
        />
        <p className="panel-note">
          Use sparingly. Each uncached keyword check can use one Serper search; cached results are reused for about 7 days.
        </p>
        <div className="filter-bar keyword-filter-bar">
          <div className="search-field">
            <Search size={15} />
            <input
              value={serpKeyword}
              placeholder="coding for kids"
              onChange={(event) => setSerpKeyword(event.target.value)}
            />
          </div>
          <button
            className="secondary-button"
            disabled={!serpKeyword.trim() || !serpTracker?.configured}
            onClick={() => void trackSerpKeywords([serpKeyword])}
          >
            Track cached SERP
          </button>
        </div>
        <div className="serp-list">
          {(serpTracker?.snapshots || []).slice(0, 5).map((snapshot) => (
            <article key={snapshot.id} className="serp-item">
              <div>
                <strong>{snapshot.keyword}</strong>
                <span>{snapshot.cached ? 'cached' : 'fresh'} · {snapshot.codakidPosition ? `CodaKid #${snapshot.codakidPosition}` : 'CodaKid not top 10'}</span>
              </div>
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
        </div>
      </section>

      <section className="dashboard-grid lower-grid">
        <div className="panel">
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
        </div>
        <div className="panel">
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
        </div>
      </section>

      <section className="panel">
        <PanelHeader icon={<BarChart3 />} title="Top Pages by Clicks" action="Search Console" />
        {opportunities.topPages?.length ? (
          <SearchClicksChart pages={opportunities.topPages} />
        ) : (
          <p className="panel-note">No page-level click data in this snapshot yet.</p>
        )}
      </section>

      <section className="dashboard-grid lower-grid">
        <div className="panel">
          <OpportunityList
            title="Low CTR Pages"
            icon={<MousePointerClick />}
            emptyText="No low-CTR pages crossed the current threshold."
            opportunities={opportunities.pageOpportunities.slice(0, 6)}
            onSave={(row) => void saveActionItem(actionFromOpportunity(row, 'low-ctr-page'))}
          />
        </div>
        <div className="panel">
          <OpportunityList
            title="Striking Distance Queries"
            icon={<ArrowUpRight />}
            emptyText="No keywords are sitting in positions 6-20 yet."
            opportunities={opportunities.queryOpportunities.slice(0, 6)}
            onSave={(row) => void saveActionItem(actionFromOpportunity(row, 'striking-distance'))}
          />
        </div>
        <div className="panel">
          <OpportunityList
            title="Page + Query Work"
            icon={<ListChecks />}
            emptyText="No page-query fixes are available yet."
            opportunities={opportunities.pageQueryOpportunities.slice(0, 6)}
            showPage
            onSave={(row) => void saveActionItem(actionFromOpportunity(row, 'page-query'))}
          />
        </div>
        <div className="panel">
          <PanelHeader icon={<ArrowUpRight />} title="Top Queries" action="driving impressions" />
          <div className="keyword-metrics">
            <MetricPill label="Clicks" value={opportunities.summary?.totalClicks || 0} />
            <MetricPill label="Impressions" value={opportunities.summary?.totalImpressions || 0} />
          </div>
          <OpportunityList
            title="Highest Visibility"
            icon={<BarChart3 />}
            emptyText="No query-level data yet."
            opportunities={opportunities.topQueries.slice(0, 5)}
          />
        </div>
      </section>
      </div>
    </>
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
    <section className="panel">
      <PanelHeader
        icon={<Clock />}
        title="Tracked Keywords"
        action={`${active.length} active · ${tracked.length} with SERP history`}
      />
      <div className="keyword-tracker-top">
        <MetricPill label="Active" value={active.length} />
        <MetricPill label="Avg Rank" value={averagePosition ? formatPosition(averagePosition) : '-'} />
        <MetricPill label="Weekly Cap" value="30" />
        <button className="secondary-button" disabled={!serpConfigured} onClick={onWeeklySync}>
          <RefreshCw size={15} />
          Run due keywords
        </button>
      </div>
      <form className="keyword-add-form" onSubmit={submit}>
        <div className="search-field">
          <Search size={15} />
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
        <button className="primary-button">
          <Plus size={15} />
          Add
        </button>
      </form>
      <div className="dash-table-wrap">
        <table className="dash-table tracked-keyword-table">
          <thead>
            <tr>
              <th>Keyword</th>
              <th>Target</th>
              <th className="num">Rank</th>
              <th>Movement</th>
              <th>Competitors</th>
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
      <td>
        <div className="target-map-control">
          <input
            list="keyword-target-pages"
            value={targetUrl}
            placeholder="Unknown target"
            onChange={(event) => setTargetUrl(event.target.value)}
            onBlur={() => {
              if (targetUrl !== item.targetUrl) void onUpdate({ id: item.id, targetUrl });
            }}
          />
          {targetUrl && (
            <a href={targetUrl} target="_blank" rel="noreferrer" aria-label="Open target page">
              <Link2 size={14} />
            </a>
          )}
        </div>
      </td>
      <td className="num">{item.latestSerp?.position ? `#${formatPosition(item.latestSerp.position)}` : '-'}</td>
      <td>
        <span className={movementClass(movement)}>
          {movement === null || movement === undefined
            ? item.lastTrackedAt
              ? 'flat'
              : 'not tracked'
            : `${movement > 0 ? '+' : ''}${movement.toFixed(0)}`}
        </span>
        {item.latestSerp?.fetchedAt && <small className="table-subtle"> {formatDate(item.latestSerp.fetchedAt)}</small>}
      </td>
      <td>
        <div className="competitor-chip-row">
          {(item.latestSerp?.competitors || []).slice(0, 3).map((competitor) => (
            <span key={`${item.id}-${competitor.domain}-${competitor.position}`}>
              #{competitor.position} {competitor.domain}
            </span>
          ))}
          {!item.latestSerp?.competitors?.length && <span>Waiting</span>}
        </div>
      </td>
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
    <section className="panel">
      <PanelHeader icon={<Lightbulb />} title="Keyword Ideas" action="Google Autocomplete · free" />
      <form className="filter-bar" onSubmit={run}>
        <div className="search-field" style={{ flex: 1 }}>
          <Search size={15} />
          <input
            value={seed}
            placeholder="Enter a seed topic, e.g. coding for kids"
            onChange={(event) => setSeed(event.target.value)}
          />
        </div>
        <button type="submit" className="primary-button" disabled={isLoading || !seed.trim()}>
          {isLoading ? <RefreshCw size={15} className="spin" /> : <Lightbulb size={15} />}
          {isLoading ? 'Finding ideas…' : 'Get ideas'}
        </button>
      </form>

      {!ideas && !isLoading ? (
        <p className="panel-note">
          Expand any topic into real Google searches — questions, comparisons, and long-tail variants — then track the
          ones worth ranking for. No API key or credits required.
        </p>
      ) : null}

      {ideas ? (
        <>
          <p className="panel-note">
            {ideas.total} ideas for <strong>“{ideas.seed}”</strong>. Click a phrase to add it to tracked keywords.
          </p>
          <div className="idea-groups">
            {groups.map(({ key, label, hint }) => {
              const items = ideas.groups[key] || [];
              if (!items.length) return null;
              return (
                <div key={key} className="idea-group">
                  <header>
                    <strong>{label}</strong>
                    <small>{items.length} · {hint}</small>
                  </header>
                  <div className="idea-chips">
                    {items.map((keyword) => (
                      <button
                        key={keyword}
                        type="button"
                        className={`idea-chip${added.has(keyword) ? ' added' : ''}`}
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
    <section className="panel">
      <PanelHeader
        icon={<BarChart3 />}
        title="GA4 Blog Traffic"
        action={report?.configured ? report.analyticsScopeReady ? 'ready' : 'reconnect Google' : 'property id needed'}
      />
      {!report?.configured ? (
        <p className="panel-note">GA4_PROPERTY_ID is not configured yet.</p>
      ) : !report.analyticsScopeReady ? (
        <p className="panel-note">Google needs to be reconnected once after deploy so the dashboard can read Analytics data.</p>
      ) : latest ? (
        <>
          <div className="keyword-tracker-top">
            <MetricPill label="Sessions" value={formatter.format(latest.summary.sessions)} />
            <MetricPill label="Users" value={formatter.format(latest.summary.totalUsers)} />
            <MetricPill label="Views" value={formatter.format(latest.summary.screenPageViews)} />
            <MetricPill label="Engagement" value={formatPercent(latest.summary.engagementRate)} />
            <button className="secondary-button" onClick={onSync}>
              <RefreshCw size={15} />
              Sync GA4
            </button>
          </div>
          <div className="ga4-page-list">
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
          <p className="panel-note">GA4 is configured. Run a sync to save the first Analytics snapshot into Neon.</p>
          <button className="secondary-button" onClick={onSync}>
            <RefreshCw size={15} />
            Sync GA4
          </button>
        </>
      )}
    </section>
  );
}

function movementClass(value?: number | null) {
  if (!value) return 'movement-chip';
  if (value > 0) return 'movement-chip up';
  return 'movement-chip down';
}

function ContentDecayList({
  rows,
  onSave,
}: {
  rows: ContentDecayOpportunity[];
  onSave: (row: ContentDecayOpportunity) => void;
}) {
  return (
    <div className="opportunity-block">
      <div className="opportunity-title">
        <AlertTriangle />
        <strong>Content Decay</strong>
      </div>
      {rows.length ? (
        rows.slice(0, 6).map((row) => (
          <article className="opportunity-item" key={row.page}>
            <div>
              <strong>{shortUrl(row.page)}</strong>
              <small>
                {formatter.format(Math.max(0, row.lostClicks))} clicks down · {formatPercent(row.clickChange)}
              </small>
            </div>
            <p>{row.recommendation}</p>
            <button className="secondary-button mini-button" onClick={() => onSave(row)}>
              <ListChecks size={14} />
              Add action
            </button>
          </article>
        ))
      ) : (
        <p className="panel-note">No meaningful page decay detected between the latest two imported periods.</p>
      )}
    </div>
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
    <div className="opportunity-block">
      <div className="opportunity-title">
        <GitBranch />
        <strong>Query Cannibalization</strong>
      </div>
      {rows.length ? (
        rows.slice(0, 6).map((row) => (
          <article className="opportunity-item" key={row.query}>
            <div>
              <strong>{row.query}</strong>
              <small>
                {row.pageCount} pages · {formatter.format(row.totalImpressions)} impressions
              </small>
            </div>
            <div className="cannibal-pages">
              {row.pages.slice(0, 3).map((page) => (
                <span key={page.page}>
                  {shortUrl(page.page)} <b>#{formatPosition(page.position)}</b>
                </span>
              ))}
            </div>
            <p>{row.recommendation}</p>
            <button className="secondary-button mini-button" onClick={() => onSave(row)}>
              <ListChecks size={14} />
              Add action
            </button>
          </article>
        ))
      ) : (
        <p className="panel-note">No overlapping page/query conflicts crossed the current threshold.</p>
      )}
    </div>
  );
}

function OpportunityList({
  title,
  icon,
  opportunities,
  emptyText,
  showPage = false,
  onSave,
}: {
  title: string;
  icon: ReactNode;
  opportunities: SearchOpportunity[];
  emptyText: string;
  showPage?: boolean;
  onSave?: (opportunity: SearchOpportunity) => void;
}) {
  return (
    <div className="opportunity-block">
      <div className="opportunity-title">
        {icon}
        <strong>{title}</strong>
      </div>
      {opportunities.length ? (
        opportunities.map((opportunity) => (
          <article className="opportunity-item" key={`${title}-${opportunity.label}-${opportunity.page || ''}`}>
            <div>
              <strong>{opportunity.label}</strong>
              {showPage && opportunity.page && <small>{shortUrl(opportunity.page)}</small>}
            </div>
            <div className="opportunity-stats">
              <span>{formatter.format(opportunity.impressions)} imp.</span>
              <span>{formatPercent(opportunity.ctr)} CTR</span>
              <span>#{formatPosition(opportunity.position)}</span>
            </div>
            <p>{opportunity.recommendation}</p>
            {onSave && (
              <button className="secondary-button mini-button" onClick={() => onSave(opportunity)}>
                <ListChecks size={14} />
                Add action
              </button>
            )}
          </article>
        ))
      ) : (
        <p className="panel-note">{emptyText}</p>
      )}
    </div>
  );
}

function KeywordExplorerTable({ rows, onSave }: { rows: SearchOpportunity[]; onSave: (row: SearchOpportunity) => void }) {
  if (!rows.length) return <p className="panel-note">No keyword rows match these filters.</p>;
  return (
    <div className="dash-table-wrap">
      <table className="dash-table">
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
                <button className="chip-button" onClick={() => onSave(row)}>
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
