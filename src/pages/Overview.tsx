import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, ArrowUpRight, Bot, Eye, FileText, Gauge, GripVertical, Lightbulb, Search, Settings2, Star, X } from 'lucide-react';
import { useDashboard } from '../data';
import { LoadingState, DashCard, DashMetric, PageHeading, SearchPeriodNav } from '../components';
import {
  RankBreakdown,
  ScoreGauge,
  SearchClicksChart,
  SearchDailyChart,
  SearchTrendChart,
  Sparkbars,
} from '../charts';
import {
  buildFocusActions,
  formatCompact,
  formatDate,
  formatDateRange,
  formatPercent,
  formatPosition,
  formatter,
  periodDayCount,
  periodDelta,
  positionBuckets,
  shortUrl,
  trendClicks,
  trendCtrPercent,
  trendKeywords,
  trendPositions,
  pillarSupportLevel,
} from '../lib';
import type {
  ActionItem,
  AnalysisOverview,
  AiWorkbench,
  CompetitorSnapshot,
  DashboardHistory,
  Ga4Report,
  HomeLayout,
  SearchOpportunities,
  SearchOpportunity,
  TechnicalAudit,
  TrackedKeyword,
} from '../types';

export function OverviewPage() {
  const {
    snapshot,
    searchOpportunities,
    ga4,
    technicalAudit,
    competitors,
    trackedKeywords,
    actionItems,
    aiWorkbench,
    dashboardHistory,
    analysisOverview,
    homeLayout,
    isLoading,
    runAiWorkbench,
    saveHomeLayout,
  } = useDashboard();
  const [searchData, setSearchData] = useState<SearchOpportunities | null>(null);
  const [loadingPeriod, setLoadingPeriod] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [overviewView, setOverviewView] = useState<'today' | 'performance' | 'shortcuts'>('today');

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

  if (isLoading && !snapshot) return <LoadingState label="Building your content map" />;
  if (!snapshot) return null;

  const health = analysisOverview?.health || { score: 0, label: 'Collecting data', components: [] };
  const actions = buildFocusActions(snapshot, searchData).slice(0, 3);
  const gscReady = Boolean(searchData?.available);
  const buckets = positionBuckets(searchData);
  const hasRankings = buckets.some((bucket) => bucket.value > 0);
  const rankedTotal = buckets.reduce((sum, bucket) => sum + bucket.value, 0);
  const dateLabel = gscReady ? formatDateRange(searchData?.startDate, searchData?.endDate) : '';
  const periodDays = gscReady ? periodDayCount(searchData?.startDate, searchData?.endDate) : null;
  const periodScope = periodDays ? `${dateLabel} (${periodDays} days)` : dateLabel;
  const crawlDate = formatDate(snapshot.generatedAt);
  const trend = searchData?.trend || [];
  const periods = searchData?.periods || [];
  const periodIndex = searchData?.periodIndex ?? 0;
  const clicksDelta = periodDelta(trend, periodIndex);

  const topQueries = (searchData?.topQueries?.length
    ? searchData.topQueries
    : searchData?.queryOpportunities) || [];

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

      <OverviewSectionTabs active={overviewView} onChange={setOverviewView} />

      <section
        id="overview-content"
        className="dash-section overview-section overview-content-lead"
        hidden={overviewView !== 'today'}
      >
        <div className="dash-section-head">
          <h2>SEO readiness</h2>
          <Link className="dash-link" to="/pillars">
            Pillars <ArrowUpRight size={14} />
          </Link>
        </div>
        <p className="dash-section-note">
          {analysisOverview ? `${analysisOverview.filters.days}-day ${analysisOverview.filters.scope} view · ${formatDateRange(analysisOverview.filters.startDate, analysisOverview.filters.endDate)}` : `Live crawl · ${crawlDate}`}
        </p>

        <div className="overview-health-compact">
          <DashCard className="dash-health-card">
            <div className="dash-health dash-health-compact">
              <ScoreGauge score={health.score} tone={health.score >= 80 ? 'success' : health.score >= 60 ? 'default' : health.score >= 40 ? 'warning' : 'danger'} size={120} />
              <div>
                <span className={`dash-status ${health.score >= 80 ? 'success' : health.score >= 60 ? 'default' : health.score >= 40 ? 'warning' : 'danger'}`}>{health.label}</span>
                <h3>Unified readiness</h3>
                <p className="dash-health-copy">One documented score across technical, content, links, and search.</p>
                <div className="overview-health-components">
                  {health.components.map((component) => (
                    <div key={component.id} title={`${component.weight}% weight · ${component.source}`}>
                      <span>{component.label}</span><i><b style={{ width: `${component.score}%` }} /></i><strong>{component.score}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </DashCard>

          {leadPillar ? (
            <DashCard
              title="Strongest pillar"
              subtitle={leadPillar.cluster}
            >
              <div className="dash-pillar-focus dash-pillar-focus-compact">
                <div className="dash-pillar-main">
                  <Star size={14} />
                  <div>
                    <a href={leadPillar.url} target="_blank" rel="noreferrer">
                      {leadPillar.title}
                    </a>
                    <span>
                      {formatter.format(leadPillar.inboundCount)} inbound · {pillarSupportLevel(leadPillar.inboundCount).label.toLowerCase()}
                    </span>
                  </div>
                </div>
                <Link className="dash-link" to="/pillars">
                  View all pillars <ArrowUpRight size={14} />
                </Link>
              </div>
            </DashCard>
          ) : null}
        </div>
      </section>

      {overviewView === 'today' && analysisOverview ? <AnalysisPerformanceStrip analysis={analysisOverview} /> : null}

      {overviewView === 'today' && actions.length > 0 ? <NextActionsBlock actions={actions} /> : null}

      <section
        id="overview-performance"
        className="dash-section overview-section"
        hidden={overviewView !== 'performance'}
      >
        {analysisOverview ? <PageMovementPanel winners={analysisOverview.winners} losers={analysisOverview.losers} days={analysisOverview.filters.days} /> : null}
        {gscReady && searchData ? (
          <div className="overview-hero">
            <p className="overview-hero-summary">
              Google Search Console totals for {periodScope}
              {clicksDelta ? ` · ${clicksDelta}` : ''}
            </p>

            <SearchPeriodNav
              label={dateLabel}
              note={
                periods.length > 1
                  ? `Period ${periodIndex + 1} of ${periods.length}${periodDays ? ` · ${periodDays} days` : ''}${clicksDelta ? ` · ${clicksDelta}` : ''}`
                  : periodDays
                    ? `Showing all clicks and impressions in this ${periodDays}-day window`
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

            <div className="dash-metrics dash-metrics-search">
              <DashMetric
                label="Organic clicks"
                period={dateLabel}
                value={searchData.summary?.totalClicks || 0}
                valueNote="clicks in this range"
                detail={`${formatCompact(searchData.summary?.totalImpressions || 0)} impressions in this range`}
                chart={<Sparkbars data={trendClicks(trend)} color="var(--tertiary)" />}
                to="/keywords"
              />
              <DashMetric
                label="Avg. position"
                period={dateLabel}
                value={formatPosition(searchData.summary?.averagePosition || 0)}
                valueNote="in this range"
                detail="Weighted by impressions in the same window"
                chart={<Sparkbars data={trendPositions(trend)} color="var(--green)" />}
                to="/keywords"
              />
              <DashMetric
                label="Click rate"
                period={dateLabel}
                value={formatPercent(searchData.summary?.averageCtr || 0)}
                valueNote="in this range"
                detail="Clicks ÷ impressions for this date range"
                chart={<Sparkbars data={trendCtrPercent(trend)} color="var(--amber)" />}
                to="/keywords"
              />
              <DashMetric
                label="Tracked keywords"
                period={dateLabel}
                value={rankedTotal}
                valueNote="in this range"
                detail="Queries with position data in this window"
                chart={<Sparkbars data={trendKeywords(trend)} color="var(--green)" />}
                to="/keywords"
              />
            </div>

            <DashCard
              title="Search trend"
              subtitle={`Search Console clicks and impressions by day · ${dateLabel}`}
            >
              {(searchData.dailyTrend?.length || 0) >= 2 ? (
                <SearchDailyChart daily={searchData.dailyTrend || []} />
              ) : (
                <SearchTrendChart
                  trend={trend}
                  activeStart={searchData.startDate}
                  activeEnd={searchData.endDate}
                />
              )}
            </DashCard>
          </div>
        ) : null}

        {gscReady && searchData ? (
          <>
            <div className="dash-section-head">
              <h2>Search details</h2>
              <Link className="dash-link" to="/keywords">
                Keywords <ArrowUpRight size={14} />
              </Link>
            </div>

            <div className="dash-grid dash-grid-search">
              <DashCard title="Top pages" subtitle={`Page clicks in ${dateLabel}`}>
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

            <DashCard title="Top queries" subtitle={`Query clicks in ${dateLabel}`}>
              <TopQueriesTable queries={topQueries} />
            </DashCard>
          </>
        ) : null}
      </section>

      <section
        id="overview-shortcuts"
        className="dash-section overview-section"
        hidden={overviewView !== 'shortcuts'}
      >
        <HomeShortcuts
          layout={homeLayout}
          onLayoutChange={saveHomeLayout}
          customizing={customizing}
          onToggleCustomize={() => setCustomizing((value) => !value)}
          searchData={searchData}
          ga4={ga4}
          technicalAudit={technicalAudit}
          competitors={competitors}
          trackedKeywords={trackedKeywords}
          actionItems={actionItems}
          aiWorkbench={aiWorkbench}
          dashboardHistory={dashboardHistory}
          onRunIdeas={() => runAiWorkbench('content-ideas')}
          onRunVisibility={() => runAiWorkbench('ai-visibility')}
        />
      </section>
    </>
  );
}

type HomeCard = {
  id: string;
  title: string;
  value: string;
  detail: string;
  source: string;
  period: string;
  to: string;
  icon: ReactNode;
  tone?: 'default' | 'warning' | 'danger' | 'success';
  action?: ReactNode;
};

function OverviewSectionTabs({
  active,
  onChange,
}: {
  active: 'today' | 'performance' | 'shortcuts';
  onChange: (view: 'today' | 'performance' | 'shortcuts') => void;
}) {
  const tabs = [
    { id: 'today' as const, label: 'Today' },
    { id: 'performance' as const, label: 'Performance' },
    { id: 'shortcuts' as const, label: 'Tools' },
  ];

  return (
    <nav className="overview-section-tabs" aria-label="Overview sections">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={active === tab.id ? 'active' : ''}
          aria-pressed={active === tab.id}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

function NextActionsBlock({ actions }: { actions: ReturnType<typeof buildFocusActions> }) {
  return (
    <div className="overview-next-actions">
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
    </div>
  );
}

function AnalysisPerformanceStrip({ analysis }: { analysis: AnalysisOverview }) {
  const current = analysis.performance.current;
  const deltas = analysis.performance.deltas;
  const items = [
    { label: 'Organic clicks', value: formatter.format(current.clicks), delta: deltas.clicks, source: 'Search Console' },
    { label: 'Impressions', value: formatCompact(current.impressions), delta: deltas.impressions, source: 'Search Console' },
    { label: 'Sessions', value: formatter.format(current.sessions), delta: deltas.sessions, source: 'Google Analytics' },
    { label: 'Key events', value: formatter.format(Math.round(current.keyEvents)), delta: deltas.keyEvents, source: 'Google Analytics' },
  ];
  return (
    <section className="analysis-pulse" aria-label="Aligned performance pulse">
      <header>
        <div><h2>Performance pulse</h2><p>{formatDateRange(analysis.filters.startDate, analysis.filters.endDate)} compared with the preceding {analysis.filters.days} days</p></div>
        <span>{analysis.confidence.label} · {analysis.confidence.score}/100</span>
      </header>
      <div className="analysis-pulse-grid">
        {items.map((item) => (
          <article key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small className={Number(item.delta) > 0.001 ? 'up' : Number(item.delta) < -0.001 ? 'down' : ''}>{item.delta == null ? 'Prior coverage incomplete' : `${formatAnalysisDelta(item.delta)} vs prior`}</small>
            <em>{item.source} · measured</em>
          </article>
        ))}
      </div>
    </section>
  );
}

function PageMovementPanel({
  winners,
  losers,
  days,
}: {
  winners: AnalysisOverview['winners'];
  losers: AnalysisOverview['losers'];
  days: number;
}) {
  const groups = [{ title: 'Pages gaining clicks', rows: winners, tone: 'up' }, { title: 'Pages losing clicks', rows: losers, tone: 'down' }];
  return (
    <section className="movement-panel">
      <div className="dash-section-head"><div><h2>Page movement</h2><p>Measured Search Console change against the preceding {days} days</p></div><Link className="dash-link" to="/changes">Change impact <ArrowUpRight size={14} /></Link></div>
      <div className="movement-columns">
        {groups.map((group) => (
          <div key={group.title}>
            <h3>{group.title}</h3>
            {group.rows.length ? group.rows.slice(0, 5).map((row) => (
              <article key={row.url}>
                <div><strong>{shortUrl(row.url)}</strong><span>{row.clicks} clicks · was {row.previousClicks}</span></div>
                <b className={group.tone}>{formatAnalysisDelta(row.clickChange)}</b>
              </article>
            )) : <p className="dash-empty">Not enough comparable movement yet.</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

function formatAnalysisDelta(value: number | null) {
  if (value == null || !Number.isFinite(value) || Math.abs(value) < 0.001) return '0%';
  const amount = Math.round(value * 100);
  return `${amount > 0 ? '+' : ''}${amount}%`;
}

function HomeShortcuts({
  layout,
  onLayoutChange,
  customizing,
  onToggleCustomize,
  searchData,
  ga4,
  technicalAudit,
  competitors,
  trackedKeywords,
  actionItems,
  aiWorkbench,
  dashboardHistory,
  onRunIdeas,
  onRunVisibility,
}: {
  layout: HomeLayout;
  onLayoutChange: (layout: HomeLayout) => Promise<void>;
  customizing: boolean;
  onToggleCustomize: () => void;
  searchData: SearchOpportunities | null;
  ga4: Ga4Report | null;
  technicalAudit: TechnicalAudit | null;
  competitors: CompetitorSnapshot | null;
  trackedKeywords: TrackedKeyword[];
  actionItems: ActionItem[];
  aiWorkbench: AiWorkbench | null;
  dashboardHistory: DashboardHistory | null;
  onRunIdeas: () => Promise<unknown>;
  onRunVisibility: () => Promise<unknown>;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<HomeCard | null>(null);
  const cards = buildHomeCards({
    searchData,
    ga4,
    technicalAudit,
    competitors,
    trackedKeywords,
    actionItems,
    aiWorkbench,
    onRunIdeas,
    onRunVisibility,
  });
  const cardMap = new Map(cards.map((card) => [card.id, card]));
  const ordered = layout.cards.map((id) => cardMap.get(id)).filter(Boolean) as HomeCard[];
  const visible = ordered.filter((card) => !layout.hidden.includes(card.id));
  const hidden = ordered.filter((card) => layout.hidden.includes(card.id));

  function moveCard(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const next = [...layout.cards];
    const from = next.indexOf(sourceId);
    const to = next.indexOf(targetId);
    if (from < 0 || to < 0) return;
    next.splice(from, 1);
    next.splice(to, 0, sourceId);
    void onLayoutChange({ ...layout, cards: next });
  }

  function toggleHidden(id: string) {
    const hiddenSet = new Set(layout.hidden);
    if (hiddenSet.has(id)) hiddenSet.delete(id);
    else hiddenSet.add(id);
    void onLayoutChange({ ...layout, hidden: [...hiddenSet] });
  }

  return (
    <section className="home-command">
      <div className="home-command-head">
        <div>
          <h2>Shortcuts</h2>
          {customizing ? (
            <p>Drag cards to reorder. Hide cards you don&apos;t need on the homepage.</p>
          ) : null}
        </div>
        <button type="button" className="secondary-button" onClick={onToggleCustomize}>
          <Settings2 size={15} />
          {customizing ? 'Done' : 'Customize'}
        </button>
      </div>

      <div className="home-card-grid">
        {visible.map((card) => (
          <article
            key={card.id}
            className={`home-command-card ${card.tone || 'default'} ${customizing ? 'customizing' : ''}`}
            draggable={customizing}
            onDragStart={() => setDragging(card.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragging) moveCard(dragging, card.id);
              setDragging(null);
            }}
          >
            <div className="home-card-top">
              <span>{card.icon}</span>
              {customizing ? (
                <div className="home-card-tools">
                  <GripVertical size={15} />
                  <button className="icon-button small-icon-button" onClick={() => toggleHidden(card.id)} title="Hide card">
                    <X size={14} />
                  </button>
                </div>
              ) : null}
            </div>
            <strong>{card.value}</strong>
            <h3>{card.title}</h3>
            <p>{card.detail}</p>
            <div className="metric-context">
              <span>{card.source}</span>
              <span>{card.period}</span>
            </div>
            <div className="home-card-footer">
              <Link to={card.to}>
                Open <ArrowUpRight size={14} />
              </Link>
              <button type="button" className="micro-action" onClick={() => setSelectedCard(card)}>
                Details
              </button>
              {card.action}
            </div>
          </article>
        ))}
      </div>

      {customizing && hidden.length ? (
        <div className="hidden-card-row">
          <span>Hidden cards</span>
          {hidden.map((card) => (
            <button key={card.id} type="button" className="chip-button" onClick={() => toggleHidden(card.id)}>
              <PlusIcon />
              {card.title}
            </button>
          ))}
        </div>
      ) : null}

      {selectedCard ? (
        <CommandDrilldownDrawer
          card={selectedCard}
          searchData={searchData}
          ga4={ga4}
          technicalAudit={technicalAudit}
          competitors={competitors}
          trackedKeywords={trackedKeywords}
          actionItems={actionItems}
          aiWorkbench={aiWorkbench}
          dashboardHistory={dashboardHistory}
          onClose={() => setSelectedCard(null)}
        />
      ) : null}
    </section>
  );
}

function CommandDrilldownDrawer({
  card,
  searchData,
  ga4,
  technicalAudit,
  competitors,
  trackedKeywords,
  actionItems,
  aiWorkbench,
  dashboardHistory,
  onClose,
}: {
  card: HomeCard;
  searchData: SearchOpportunities | null;
  ga4: Ga4Report | null;
  technicalAudit: TechnicalAudit | null;
  competitors: CompetitorSnapshot | null;
  trackedKeywords: TrackedKeyword[];
  actionItems: ActionItem[];
  aiWorkbench: AiWorkbench | null;
  dashboardHistory: DashboardHistory | null;
  onClose: () => void;
}) {
  const rows = drilldownRows(card.id, {
    searchData,
    ga4,
    technicalAudit,
    competitors,
    trackedKeywords,
    actionItems,
    aiWorkbench,
  });
  const trendRows = drilldownTrendRows(card.id, dashboardHistory);

  return (
    <div className="drawer-backdrop" role="presentation" onClick={onClose}>
      <aside className="drilldown-drawer" role="dialog" aria-modal="true" aria-label={`${card.title} details`} onClick={(event) => event.stopPropagation()}>
        <header className="drawer-head">
          <div>
            <span className={`drawer-icon ${card.tone || 'default'}`}>{card.icon}</span>
            <div>
              <small>{card.source}</small>
              <h2>{card.title}</h2>
              <p>{card.period}</p>
            </div>
          </div>
          <button type="button" className="icon-button small-icon-button" onClick={onClose} aria-label="Close details">
            <X size={15} />
          </button>
        </header>

        <div className="drawer-hero">
          <strong>{card.value}</strong>
          <p>{card.detail}</p>
          <Link className="dash-link" to={card.to} onClick={onClose}>
            Open full page <ArrowUpRight size={14} />
          </Link>
        </div>

        {trendRows.length ? (
          <section className="drawer-section">
            <div className="drawer-section-head">
              <h3>Saved trend</h3>
              <span>Saved trend</span>
            </div>
            <div className="drawer-trend">
              {trendRows.map((row) => (
                <div key={`${row.label}-${row.value}`} title={`${row.label}: ${row.value}`}>
                  <i style={{ height: `${row.height}%` }} />
                  <span>{row.label}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="drawer-section">
          <div className="drawer-section-head">
            <h3>What to look at</h3>
            <span>{rows.length} rows</span>
          </div>
          <div className="drawer-list">
            {rows.length ? rows.map((row) => (
              <article className="drawer-row" key={`${row.title}-${row.meta}`}>
                <div>
                  <strong>{row.title}</strong>
                  <p>{row.detail}</p>
                </div>
                <span>{row.meta}</span>
              </article>
            )) : <p className="dash-empty">No saved rows yet. Run the related sync or AI task to populate this panel.</p>}
          </div>
        </section>
      </aside>
    </div>
  );
}

function buildHomeCards({
  searchData,
  ga4,
  technicalAudit,
  competitors,
  trackedKeywords,
  actionItems,
  aiWorkbench,
  onRunIdeas,
  onRunVisibility,
}: {
  searchData: SearchOpportunities | null;
  ga4: Ga4Report | null;
  technicalAudit: TechnicalAudit | null;
  competitors: CompetitorSnapshot | null;
  trackedKeywords: TrackedKeyword[];
  actionItems: ActionItem[];
  aiWorkbench: AiWorkbench | null;
  onRunIdeas: () => Promise<unknown>;
  onRunVisibility: () => Promise<unknown>;
}): HomeCard[] {
  const searchPeriod = searchData?.startDate && searchData?.endDate
    ? formatDateRange(searchData.startDate, searchData.endDate)
    : 'latest import';
  const ga4Period = ga4?.latest ? `${formatDate(ga4.latest.startDate)} – ${formatDate(ga4.latest.endDate)}` : 'Not connected';
  const openActions = actionItems.filter((item) => item.status !== 'done' && item.status !== 'dismissed').length;
  const ranked = trackedKeywords.filter((keyword) => keyword.latestSerp?.position).length;
  const visibilityRuns = aiWorkbench?.latestVisibilityRuns || [];
  const mentions = visibilityRuns.filter((run) => run.codakidMentioned).length;
  const competitorsWithBlogs = competitors?.competitors?.filter((competitor) => competitor.blogUrls > 0).length || 0;
  const ideaCount = aiWorkbench?.contentIdeas?.length || 0;
  const latestIdeaDate = aiWorkbench?.contentIdeas?.[0]?.createdAt;

  return [
    {
      id: 'ai-analyst',
      title: 'AI analyst',
      value: aiWorkbench?.configured ? 'Connected' : 'Setup needed',
      detail: 'Generate a narrative readout that explains what changed, why it matters, and what to do next.',
      source: 'AI summary',
      period: searchPeriod,
      to: '/intelligence',
      icon: <Bot size={18} />,
      tone: aiWorkbench?.configured ? 'success' : 'warning',
    },
    {
      id: 'alerts',
      title: 'Alerts',
      value: formatter.format((technicalAudit?.summary.high || 0) + Math.max(0, openActions - 3)),
      detail: `${technicalAudit?.summary.high || 0} high audit issues and ${openActions} open work items need review.`,
      source: 'Audit & tasks',
      period: technicalAudit?.generatedAt ? formatDate(technicalAudit.generatedAt) : 'Latest crawl',
      to: '/audit',
      icon: <AlertTriangle size={18} />,
      tone: technicalAudit?.summary.high ? 'danger' : 'success',
    },
    {
      id: 'content-ideas',
      title: 'Content ideas',
      value: formatter.format(ideaCount),
      detail: 'AI-generated briefs from your clusters, search opportunities, and competitor gaps.',
      source: 'AI briefs',
      period: latestIdeaDate ? `Last generated ${formatDate(latestIdeaDate)}` : 'Not generated yet',
      to: '/intelligence',
      icon: <Lightbulb size={18} />,
      action: (
        <button className="micro-action" onClick={() => void onRunIdeas()}>
          Generate
        </button>
      ),
    },
    {
      id: 'ai-visibility',
      title: 'AI visibility',
      value: visibilityRuns.length ? `${mentions}/${visibilityRuns.length}` : 'Run',
      detail: 'Checks whether CodaKid appears in AI-style parent research answers.',
      source: 'Brand mentions',
      period: visibilityRuns[0]?.createdAt ? formatDate(visibilityRuns[0].createdAt) : 'Not run yet',
      to: '/intelligence',
      icon: <Eye size={18} />,
      tone: mentions ? 'success' : 'warning',
      action: (
        <button className="micro-action" onClick={() => void onRunVisibility()}>
          Run
        </button>
      ),
    },
    {
      id: 'refresh-queue',
      title: 'Refresh queue',
      value: formatter.format((searchData?.contentDecay?.length || 0) + (technicalAudit?.summary.byType?.['stale-content'] || 0)),
      detail: 'Pages with traffic decay or stale crawl signals that should be refreshed before creating new posts.',
      source: 'Search & crawl',
      period: searchPeriod,
      to: '/keywords',
      icon: <FileText size={18} />,
      tone: 'warning',
    },
    {
      id: 'keyword-gap',
      title: 'Keyword gap',
      value: formatter.format(ranked),
      detail: `${trackedKeywords.length} tracked keywords across ${competitorsWithBlogs} competitor domains.`,
      source: 'Competitor tracking',
      period: 'Updated weekly',
      to: '/keywords',
      icon: <Search size={18} />,
    },
    {
      id: 'boss-report',
      title: 'Executive report',
      value: ga4?.latest ? formatCompact(ga4.latest.summary.sessions) : 'Open',
      detail: ga4?.latest
        ? `${formatter.format(ga4.latest.summary.screenPageViews)} GA4 page views with ${formatPercent(ga4.latest.summary.engagementRate)} engagement.`
        : 'Print-ready report with SEO, GA4, actions, and competitors.',
      source: 'Traffic & SEO',
      period: ga4Period,
      to: '/reports',
      icon: <FileText size={18} />,
    },
  ];
}

type DrilldownContext = {
  searchData: SearchOpportunities | null;
  ga4: Ga4Report | null;
  technicalAudit: TechnicalAudit | null;
  competitors: CompetitorSnapshot | null;
  trackedKeywords: TrackedKeyword[];
  actionItems: ActionItem[];
  aiWorkbench: AiWorkbench | null;
};

type DrawerRow = {
  title: string;
  detail: string;
  meta: string;
};

function drilldownRows(cardId: string, context: DrilldownContext): DrawerRow[] {
  const openActions = context.actionItems
    .filter((item) => item.status !== 'done' && item.status !== 'dismissed')
    .sort((a, b) => b.priorityScore - a.priorityScore);

  if (cardId === 'ai-analyst') {
    return [
      {
        title: 'Best input mix',
        detail: 'Combines WordPress crawl, Search Console, GA4, competitor samples, audit issues, and open actions.',
        meta: context.aiWorkbench?.configured ? 'OpenAI ready' : 'fallback',
      },
      {
        title: 'Current reporting window',
        detail: context.searchData?.startDate && context.searchData.endDate
          ? `${formatDateRange(context.searchData.startDate, context.searchData.endDate)} search data is available.`
          : 'Search Console data has not been imported for the active period yet.',
        meta: 'source label',
      },
      {
        title: 'Action queue context',
        detail: `${openActions.length} open saved actions will be included in the analyst brief.`,
        meta: 'work queue',
      },
    ];
  }

  if (cardId === 'alerts') {
    return [
      ...(context.technicalAudit?.issues || []).slice(0, 8).map((issue) => ({
        title: issue.title,
        detail: issue.detail,
        meta: `${issue.severity} · ${issue.priorityScore}`,
      })),
      ...openActions.slice(0, 4).map((item) => ({
        title: item.title,
        detail: item.detail,
        meta: item.status,
      })),
    ];
  }

  if (cardId === 'content-ideas') {
    return (context.aiWorkbench?.contentIdeas || []).slice(0, 10).map((idea) => ({
      title: idea.title,
      detail: idea.brief?.angle || `Target keyword: ${idea.targetKeyword || 'not set'}`,
      meta: `${idea.priorityScore} priority`,
    }));
  }

  if (cardId === 'ai-visibility') {
    return (context.aiWorkbench?.latestVisibilityRuns || []).slice(0, 10).map((run) => ({
      title: run.prompt,
      detail: run.recommendations?.[0] || run.answer,
      meta: run.codakidMentioned ? 'mentioned' : 'not mentioned',
    }));
  }

  if (cardId === 'refresh-queue') {
    const staleIssues = (context.technicalAudit?.issues || []).filter((issue) => issue.type === 'stale-content');
    return [
      ...(context.searchData?.contentDecay || []).slice(0, 6).map((row) => ({
        title: shortUrl(row.page),
        detail: row.recommendation,
        meta: `${formatter.format(row.lostClicks)} lost clicks`,
      })),
      ...staleIssues.slice(0, 6).map((issue) => ({
        title: issue.pageTitle,
        detail: issue.detail,
        meta: `${issue.priorityScore} priority`,
      })),
    ];
  }

  if (cardId === 'keyword-gap') {
    return [
      ...context.trackedKeywords.slice(0, 8).map((keyword) => ({
        title: keyword.keyword,
        detail: keyword.targetUrl ? shortUrl(keyword.targetUrl) : keyword.cluster,
        meta: keyword.latestSerp?.position ? `#${keyword.latestSerp.position}` : keyword.cadence,
      })),
      ...(context.competitors?.competitors || []).slice(0, 5).map((competitor) => ({
        title: competitor.label || competitor.domain,
        detail: `${competitor.blogUrls} blog URLs sampled. ${competitor.visibleTopics?.slice(0, 3).map((topic) => topic.topic).join(', ') || 'Topics pending.'}`,
        meta: competitor.category || 'competitor',
      })),
    ];
  }

  if (cardId === 'boss-report') {
    return [
      {
        title: 'GA4 sessions',
        detail: context.ga4?.latest ? `${formatter.format(context.ga4.latest.summary.sessions)} sessions in ${formatDateRange(context.ga4.latest.startDate, context.ga4.latest.endDate)}.` : 'GA4 is not connected yet.',
        meta: 'traffic',
      },
      {
        title: 'Search clicks',
        detail: context.searchData?.summary ? `${formatter.format(context.searchData.summary.totalClicks)} organic clicks in the active Search Console period.` : 'Search Console import pending.',
        meta: 'organic',
      },
      {
        title: 'Open priorities',
        detail: `${openActions.length} open action items and ${context.technicalAudit?.summary.high || 0} high audit issues.`,
        meta: 'ops',
      },
    ];
  }

  return [];
}

function drilldownTrendRows(cardId: string, history: DashboardHistory | null) {
  const rows = (() => {
    if (!history) return [];
    if (cardId === 'alerts') return history.audit.slice(-8).map((row) => ({ label: formatDate(row.createdAt), value: row.high + row.medium }));
    if (cardId === 'refresh-queue') return history.wordpress.slice(-8).map((row) => ({ label: formatDate(row.createdAt), value: row.linkGaps + row.orphanPosts }));
    if (cardId === 'boss-report') return history.ga4.slice(-8).map((row) => ({ label: formatDate(row.endDate || row.createdAt), value: row.sessions }));
    if (cardId === 'keyword-gap') return history.serp.slice(-8).map((row) => ({ label: row.keyword, value: row.position ? Math.max(1, 101 - row.position) : 0 }));
    if (cardId === 'ai-visibility') {
      return history.aiVisibility.slice(-8).map((row) => ({ label: formatDate(row.createdAt), value: row.codakidMentioned ? 1 : 0 }));
    }
    return history.searchConsole.slice(-8).map((row) => ({ label: formatDate(row.endDate || row.createdAt), value: row.clicks }));
  })();
  const max = Math.max(1, ...rows.map((row) => Number(row.value) || 0));
  return rows.map((row) => ({
    ...row,
    height: Math.max(8, Math.round(((Number(row.value) || 0) / max) * 100)),
  }));
}

function PlusIcon() {
  return <span style={{ fontWeight: 900, lineHeight: 1 }}>+</span>;
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

function positionTone(position: number) {
  if (!Number.isFinite(position) || position <= 0) return 'muted';
  if (position <= 3) return 'success';
  if (position <= 10) return 'default';
  if (position <= 20) return 'warning';
  return 'danger';
}
