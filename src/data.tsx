import React from 'react';
import { apiFetch, normalizeUrl } from './lib';
import { toast } from './toast';
import type {
  ActionInput,
  ActionItem,
  ActionStatus,
  AnalysisFilters,
  AnalysisOverview,
  AlertReport,
  AiAnalystBrief,
  AiResponse,
  AiWorkbench,
  AuthUser,
  CompetitorInput,
  CompetitorSnapshot,
  DashboardHistory,
  DomainAuthorityReport,
  KeywordIdeas,
  PageSpeedReport,
  PageSpeedResult,
  Ga4Report,
  GoogleStatus,
  HomeLayout,
  KeywordInput,
  MarkedPillar,
  PageBrief,
  SerpTracker,
  SearchOpportunities,
  ResearchIntelligence,
  SeoChangeInput,
  SeoChangesReport,
  Snapshot,
  TechnicalAudit,
  TrackedKeyword,
} from './types';

type DashboardContextValue = {
  user: AuthUser;
  snapshot: Snapshot | null;
  competitors: CompetitorSnapshot | null;
  technicalAudit: TechnicalAudit | null;
  ai: AiResponse | null;
  aiWorkbench: AiWorkbench | null;
  homeLayout: HomeLayout;
  dashboardHistory: DashboardHistory | null;
  googleStatus: GoogleStatus | null;
  searchOpportunities: SearchOpportunities | null;
  ga4: Ga4Report | null;
  seoChanges: SeoChangesReport | null;
  alerts: AlertReport | null;
  research: ResearchIntelligence | null;
  analysisOverview: AnalysisOverview | null;
  analysisFilters: AnalysisFilters;
  markedPillars: MarkedPillar[];
  actionItems: ActionItem[];
  trackedKeywords: TrackedKeyword[];
  serpTracker: SerpTracker | null;
  domainAuthority: DomainAuthorityReport | null;
  pageSpeed: PageSpeedReport | null;
  isLoading: boolean;
  isRefreshingAi: boolean;
  isSyncingGsc: boolean;
  error: string | null;
  isPillar: (url: string) => boolean;
  refresh: (options?: { forceCrawl?: boolean }) => Promise<void>;
  regenerateAi: () => Promise<void>;
  runAiWorkbench: (mode: 'analyst' | 'content-ideas' | 'ai-visibility' | 'page-brief', extra?: Record<string, unknown>) => Promise<AiAnalystBrief | PageBrief | unknown | null>;
  saveHomeLayout: (layout: HomeLayout) => Promise<void>;
  syncSearchConsole: () => Promise<void>;
  markPillar: (post: { url: string; title: string; cluster: string }) => Promise<void>;
  unmarkPillar: (url: string) => Promise<void>;
  saveActionItem: (item: ActionInput) => Promise<ActionItem | null>;
  updateActionStatus: (item: Pick<ActionItem, 'id' | 'fingerprint'>, status: ActionStatus) => Promise<void>;
  trackSerpKeywords: (keywords: string[], force?: boolean) => Promise<void>;
  saveTrackedKeyword: (item: KeywordInput) => Promise<TrackedKeyword | null>;
  updateTrackedKeyword: (item: KeywordInput & { id: string }) => Promise<void>;
  archiveTrackedKeyword: (id: string) => Promise<void>;
  syncTrackedKeywords: () => Promise<void>;
  syncGa4: () => Promise<void>;
  saveSeoChange: (item: SeoChangeInput) => Promise<void>;
  updateSeoChange: (item: SeoChangeInput & { id: string }) => Promise<void>;
  deleteSeoChange: (id: string) => Promise<void>;
  updateAlert: (fingerprint: string, status: 'read' | 'dismissed' | 'snoozed' | 'unread', days?: number) => Promise<void>;
  refreshMentions: () => Promise<void>;
  importBacklinks: (rows: Array<{ sourceUrl: string; targetUrl?: string }>) => Promise<void>;
  setAnalysisFilters: (filters: AnalysisFilters) => void;
  saveCompetitor: (item: CompetitorInput) => Promise<void>;
  archiveCompetitor: (domain: string) => Promise<void>;
  refreshAuthority: () => Promise<void>;
  runPageSpeed: (url: string, strategy?: 'mobile' | 'desktop') => Promise<PageSpeedResult | null>;
  fetchKeywordIdeas: (seed: string) => Promise<KeywordIdeas | null>;
  onLogout: () => void;
};

const DashboardContext = React.createContext<DashboardContextValue | null>(null);

const DEFAULT_HOME_LAYOUT: HomeLayout = {
  cards: ['ai-analyst', 'alerts', 'content-ideas', 'ai-visibility', 'refresh-queue', 'keyword-gap', 'boss-report'],
  hidden: ['content-ideas', 'ai-visibility', 'refresh-queue', 'keyword-gap'],
};

export function useDashboard() {
  const value = React.useContext(DashboardContext);
  if (!value) throw new Error('useDashboard must be used inside DashboardProvider');
  return value;
}

export function DashboardProvider({
  user,
  onUnauthorized,
  onLogout,
  children,
}: {
  user: AuthUser;
  onUnauthorized: () => void;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null);
  const [competitors, setCompetitors] = React.useState<CompetitorSnapshot | null>(null);
  const [technicalAudit, setTechnicalAudit] = React.useState<TechnicalAudit | null>(null);
  const [ai, setAi] = React.useState<AiResponse | null>(null);
  const [aiWorkbench, setAiWorkbench] = React.useState<AiWorkbench | null>(null);
  const [homeLayout, setHomeLayout] = React.useState<HomeLayout>(DEFAULT_HOME_LAYOUT);
  const [dashboardHistory, setDashboardHistory] = React.useState<DashboardHistory | null>(null);
  const [googleStatus, setGoogleStatus] = React.useState<GoogleStatus | null>(null);
  const [searchOpportunities, setSearchOpportunities] = React.useState<SearchOpportunities | null>(null);
  const [ga4, setGa4] = React.useState<Ga4Report | null>(null);
  const [seoChanges, setSeoChanges] = React.useState<SeoChangesReport | null>(null);
  const [alerts, setAlerts] = React.useState<AlertReport | null>(null);
  const [research, setResearch] = React.useState<ResearchIntelligence | null>(null);
  const [analysisOverview, setAnalysisOverview] = React.useState<AnalysisOverview | null>(null);
  const [analysisFilters, setAnalysisFiltersState] = React.useState<AnalysisFilters>(readAnalysisFilters);
  const [markedPillars, setMarkedPillars] = React.useState<MarkedPillar[]>([]);
  const [actionItems, setActionItems] = React.useState<ActionItem[]>([]);
  const [trackedKeywords, setTrackedKeywords] = React.useState<TrackedKeyword[]>([]);
  const [serpTracker, setSerpTracker] = React.useState<SerpTracker | null>(null);
  const [domainAuthority, setDomainAuthority] = React.useState<DomainAuthorityReport | null>(null);
  const [pageSpeed, setPageSpeed] = React.useState<PageSpeedReport | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshingAi, setIsRefreshingAi] = React.useState(false);
  const [isSyncingGsc, setIsSyncingGsc] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadAi = React.useCallback(async (
    content: Snapshot,
    context?: {
      competitorData?: CompetitorSnapshot | null;
      opportunityData?: SearchOpportunities | null;
      actionData?: ActionItem[];
      trackedKeywordData?: TrackedKeyword[];
      ga4Data?: Ga4Report | null;
    },
  ) => {
    setIsRefreshingAi(true);
    try {
      const response = await apiFetch('/api/ai-insights', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          snapshot: content,
          competitors: context?.competitorData ?? null,
          searchOpportunities: context?.opportunityData ?? null,
          actionItems: context?.actionData ?? [],
          trackedKeywords: context?.trackedKeywordData ?? [],
          ga4: context?.ga4Data ?? null,
        }),
      });
      if (response.ok) setAi((await response.json()) as AiResponse);
    } finally {
      setIsRefreshingAi(false);
    }
  }, []);

  const refresh = React.useCallback(async (options?: { forceCrawl?: boolean }) => {
    setIsLoading(true);
    setError(null);
    try {
      const snapshotUrl = options?.forceCrawl ? '/api/content-snapshot?refresh=1' : '/api/content-snapshot';
      const contentPromise = fetch(snapshotUrl, { credentials: 'include' });
      const secondaryPromise = fetchDashboardModules([
        '/api/competitors',
        '/api/google/search-console/status',
        '/api/ga4',
        '/api/search-opportunities',
        '/api/technical-audit',
        '/api/pillars',
        '/api/action-items',
        '/api/tracked-keywords',
        '/api/serp-tracker',
        '/api/ai-workbench',
        '/api/dashboard-layout',
        '/api/dashboard-history',
        '/api/authority',
        '/api/pagespeed',
        '/api/seo-changes',
        '/api/alerts',
        '/api/research-intelligence',
      ]);

      const contentResponse = await contentPromise;
      if (contentResponse.status === 401) {
        onUnauthorized();
        return;
      }
      if (!contentResponse.ok) throw new Error('Content snapshot failed to load.');

      const content = (await contentResponse.json()) as Snapshot;
      setSnapshot(content);
      setIsLoading(false);

      const [
        competitorResponse,
        googleResponse,
        ga4Response,
        opportunitiesResponse,
        technicalAuditResponse,
        pillarsResponse,
        actionsResponse,
        trackedKeywordsResponse,
        serpResponse,
        aiWorkbenchResponse,
        homeLayoutResponse,
        historyResponse,
        authorityResponse,
        pageSpeedResponse,
        seoChangesResponse,
        alertsResponse,
        researchResponse,
      ] = await secondaryPromise;
      const competitorData = competitorResponse?.ok ? ((await competitorResponse.json()) as CompetitorSnapshot) : null;
      const opportunityData = opportunitiesResponse?.ok ? ((await opportunitiesResponse.json()) as SearchOpportunities) : null;
      const technicalAuditData = technicalAuditResponse?.ok ? ((await technicalAuditResponse.json()) as TechnicalAudit) : null;
      const actionData = actionsResponse?.ok
        ? (((await actionsResponse.json()) as { actionItems: ActionItem[] }).actionItems || [])
        : [];
      const trackedKeywordData = trackedKeywordsResponse?.ok
        ? (((await trackedKeywordsResponse.json()) as { keywords: TrackedKeyword[] }).keywords || [])
        : [];
      const ga4Data = ga4Response?.ok ? ((await ga4Response.json()) as Ga4Report) : null;
      const serpData = serpResponse?.ok ? ((await serpResponse.json()) as SerpTracker) : null;
      const aiWorkbenchData = aiWorkbenchResponse?.ok ? ((await aiWorkbenchResponse.json()) as AiWorkbench) : null;
      const homeLayoutData = homeLayoutResponse?.ok ? ((await homeLayoutResponse.json()) as { layout: HomeLayout }) : null;
      const historyData = historyResponse?.ok ? ((await historyResponse.json()) as DashboardHistory) : null;
      const authorityData = authorityResponse?.ok ? ((await authorityResponse.json()) as DomainAuthorityReport) : null;
      const pageSpeedData = pageSpeedResponse?.ok ? ((await pageSpeedResponse.json()) as PageSpeedReport) : null;
      const seoChangesData = seoChangesResponse?.ok ? ((await seoChangesResponse.json()) as SeoChangesReport) : null;
      const alertsData = alertsResponse?.ok ? ((await alertsResponse.json()) as AlertReport) : null;
      const researchData = researchResponse?.ok ? ((await researchResponse.json()) as ResearchIntelligence) : null;
      setCompetitors(competitorData);
      setTechnicalAudit(technicalAuditData);
      setGoogleStatus(googleResponse?.ok ? ((await googleResponse.json()) as GoogleStatus) : null);
      setGa4(ga4Data);
      setSeoChanges(seoChangesData);
      setAlerts(alertsData);
      setResearch(researchData);
      setSearchOpportunities(opportunityData);
      setActionItems(actionData);
      setTrackedKeywords(trackedKeywordData);
      setSerpTracker(serpData);
      setDomainAuthority(authorityData);
      setPageSpeed(pageSpeedData);
      setAiWorkbench(aiWorkbenchData);
      setHomeLayout(normalizeHomeLayout(homeLayoutData?.layout));
      setDashboardHistory(historyData);
      if (pillarsResponse?.ok) {
        const data = (await pillarsResponse.json()) as { pillars: MarkedPillar[] };
        setMarkedPillars(data.pillars || []);
      }
      void loadAi(content, { competitorData, opportunityData, actionData, trackedKeywordData, ga4Data });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Dashboard failed to load.');
    } finally {
      setIsLoading(false);
    }
  }, [loadAi, onUnauthorized]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    let active = true;
    void fetch(`/api/analysis-overview?scope=${analysisFilters.scope}&days=${analysisFilters.days}`, { credentials: 'include' })
      .then(async (response) => {
        if (active && response.ok) setAnalysisOverview((await response.json()) as AnalysisOverview);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [analysisFilters.days, analysisFilters.scope]);

  const regenerateAi = React.useCallback(async () => {
    if (snapshot) {
      await loadAi(snapshot, {
        competitorData: competitors,
        opportunityData: searchOpportunities,
        actionData: actionItems,
        trackedKeywordData: trackedKeywords,
        ga4Data: ga4,
      });
    }
  }, [actionItems, competitors, ga4, searchOpportunities, snapshot, trackedKeywords, loadAi]);

  const runAiWorkbench = React.useCallback(async (
    mode: 'analyst' | 'content-ideas' | 'ai-visibility' | 'page-brief',
    extra: Record<string, unknown> = {},
  ) => {
    try {
      const response = await apiFetch('/api/ai-workbench', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode,
          snapshot,
          competitors,
          searchOpportunities,
          technicalAudit,
          actionItems,
          trackedKeywords,
          ga4,
          ...extra,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'AI workbench request failed.');
      const refreshResponse = await fetch('/api/ai-workbench', { credentials: 'include' });
      if (refreshResponse.ok) setAiWorkbench((await refreshResponse.json()) as AiWorkbench);
      if (mode === 'analyst') return data.analyst as AiAnalystBrief;
      if (mode === 'page-brief') return data.brief as PageBrief;
      return data;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'AI workbench request failed.');
      return null;
    }
  }, [actionItems, competitors, ga4, searchOpportunities, snapshot, technicalAudit, trackedKeywords]);

  const saveHomeLayout = React.useCallback(async (layout: HomeLayout) => {
    const normalized = normalizeHomeLayout(layout);
    setHomeLayout(normalized);
    try {
      const response = await apiFetch('/api/dashboard-layout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ layout: normalized }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save dashboard layout.');
      setHomeLayout(normalizeHomeLayout(data.layout));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save dashboard layout.');
    }
  }, []);

  const refreshGoogleStatus = React.useCallback(async () => {
    const [statusResponse, opportunitiesResponse] = await Promise.all([
      fetch('/api/google/search-console/status', { credentials: 'include' }),
      fetch('/api/search-opportunities', { credentials: 'include' }).catch(() => null),
    ]);
    if (statusResponse.ok) setGoogleStatus((await statusResponse.json()) as GoogleStatus);
    if (opportunitiesResponse?.ok) {
      setSearchOpportunities((await opportunitiesResponse.json()) as SearchOpportunities);
    }
  }, []);

  const refreshMeasurementData = React.useCallback(async () => {
    const [historyResponse, changesResponse] = await Promise.all([
      fetch('/api/dashboard-history', { credentials: 'include' }).catch(() => null),
      fetch('/api/seo-changes', { credentials: 'include' }).catch(() => null),
    ]);
    if (historyResponse?.ok) setDashboardHistory((await historyResponse.json()) as DashboardHistory);
    if (changesResponse?.ok) setSeoChanges((await changesResponse.json()) as SeoChangesReport);
  }, []);

  const syncSearchConsole = React.useCallback(async () => {
    setIsSyncingGsc(true);
    try {
      const response = await apiFetch('/api/google/search-console/sync', {
        method: 'POST',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Search Console sync failed.');
      }
      await refreshGoogleStatus();
      await refreshMeasurementData();
      toast.success('Search Console history updated');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Search Console sync failed.');
    } finally {
      setIsSyncingGsc(false);
    }
  }, [refreshGoogleStatus, refreshMeasurementData]);

  const serverConfirmed = React.useMemo(() => {
    const set = new Set<string>();
    for (const post of snapshot?.allPosts || []) {
      if (post.confirmedPillar) set.add(normalizeUrl(post.url));
    }
    for (const pillar of snapshot?.pillars || []) {
      if (pillar.confirmedPillar) set.add(normalizeUrl(pillar.url));
    }
    return set;
  }, [snapshot]);

  const markedUrls = React.useMemo(
    () => new Set(markedPillars.map((pillar) => normalizeUrl(pillar.raw_url || pillar.url))),
    [markedPillars],
  );

  const isPillar = React.useCallback(
    (url: string) => {
      const normalized = normalizeUrl(url);
      return markedUrls.has(normalized) || serverConfirmed.has(normalized);
    },
    [markedUrls, serverConfirmed],
  );

  const markPillar = React.useCallback(
    async (post: { url: string; title: string; cluster: string }) => {
      const optimistic: MarkedPillar = {
        url: normalizeUrl(post.url),
        raw_url: post.url,
        title: post.title,
        cluster: post.cluster,
        note: '',
      };
      setMarkedPillars((current) => {
        if (current.some((pillar) => normalizeUrl(pillar.raw_url || pillar.url) === optimistic.url)) return current;
        return [optimistic, ...current];
      });
      try {
        const response = await apiFetch('/api/pillars', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: post.url, title: post.title, cluster: post.cluster }),
        });
        if (!response.ok) throw new Error('Could not save pillar.');
        void refresh();
      } catch (caught) {
        setMarkedPillars((current) =>
          current.filter((pillar) => normalizeUrl(pillar.raw_url || pillar.url) !== optimistic.url),
        );
        setError(caught instanceof Error ? caught.message : 'Could not save pillar.');
      }
    },
    [refresh],
  );

  const unmarkPillar = React.useCallback(async (url: string) => {
    const normalized = normalizeUrl(url);
    const previous = markedPillars;
    setMarkedPillars((current) =>
      current.filter((pillar) => normalizeUrl(pillar.raw_url || pillar.url) !== normalized),
    );
    try {
      const response = await apiFetch('/api/pillars', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) throw new Error('Could not remove pillar.');
      void refresh();
    } catch (caught) {
      setMarkedPillars(previous);
      setError(caught instanceof Error ? caught.message : 'Could not remove pillar.');
    }
  }, [markedPillars, refresh]);

  const saveActionItem = React.useCallback(async (item: ActionInput) => {
    try {
      const response = await apiFetch('/api/action-items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(item),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save action item.');
      setActionItems((current) => upsertActionItem(current, data.actionItem));
      toast.success('Added to your action queue');
      return data.actionItem as ActionItem;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not save action item.';
      setError(message);
      toast.error(message);
      return null;
    }
  }, []);

  const updateActionStatus = React.useCallback(
    async (item: Pick<ActionItem, 'id' | 'fingerprint'>, status: ActionStatus) => {
      const previous = actionItems;
      setActionItems((current) =>
        current.map((action) =>
          action.id === item.id || action.fingerprint === item.fingerprint
            ? { ...action, status, completedAt: status === 'done' ? new Date().toISOString() : null }
            : action,
        ),
      );
      try {
        const response = await apiFetch('/api/action-items', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: item.id, fingerprint: item.fingerprint, status }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not update action item.');
        setActionItems((current) => upsertActionItem(current, data.actionItem));
      } catch (caught) {
        setActionItems(previous);
        setError(caught instanceof Error ? caught.message : 'Could not update action item.');
      }
    },
    [actionItems],
  );

  const trackSerpKeywords = React.useCallback(async (keywords: string[], force = false) => {
    const cleanKeywords = keywords.map((keyword) => keyword.trim()).filter(Boolean).slice(0, 5);
    if (!cleanKeywords.length) return;
    try {
      const response = await apiFetch('/api/serp-tracker', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ keywords: cleanKeywords, force }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not track SERP keywords.');
      setSerpTracker((current) => ({
        configured: data.configured,
        creditsUsed: data.creditsUsed,
        cacheHours: data.cacheHours,
        snapshots: data.snapshots || [],
        trend: current?.trend || [],
      }));
      await refreshTrackedKeywords();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not track SERP keywords.');
    }
  }, []);

  const refreshTrackedKeywords = React.useCallback(async () => {
    const response = await fetch('/api/tracked-keywords', { credentials: 'include' });
    if (response.ok) {
      const data = (await response.json()) as { keywords: TrackedKeyword[] };
      setTrackedKeywords(data.keywords || []);
    }
  }, []);

  const saveTrackedKeyword = React.useCallback(async (item: KeywordInput) => {
    try {
      const response = await apiFetch('/api/tracked-keywords', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(item),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save keyword.');
      await refreshTrackedKeywords();
      toast.success(`Now tracking “${data.keyword?.keyword || item.keyword}”`);
      return data.keyword as TrackedKeyword;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not save keyword.';
      setError(message);
      toast.error(message);
      return null;
    }
  }, [refreshTrackedKeywords]);

  const updateTrackedKeyword = React.useCallback(async (item: KeywordInput & { id: string }) => {
    try {
      const response = await apiFetch('/api/tracked-keywords', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(item),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update keyword.');
      await refreshTrackedKeywords();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update keyword.');
    }
  }, [refreshTrackedKeywords]);

  const archiveTrackedKeyword = React.useCallback(async (id: string) => {
    try {
      const response = await apiFetch('/api/tracked-keywords', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not archive keyword.');
      setTrackedKeywords((current) => current.filter((keyword) => keyword.id !== id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not archive keyword.');
    }
  }, []);

  const syncTrackedKeywords = React.useCallback(async () => {
    try {
      const response = await apiFetch('/api/keyword-weekly-sync', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not sync tracked keywords.');
      await refreshTrackedKeywords();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sync tracked keywords.');
    }
  }, [refreshTrackedKeywords]);

  const syncGa4 = React.useCallback(async () => {
    try {
      const response = await apiFetch('/api/ga4', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'GA4 sync failed.');
      setGa4(data as Ga4Report);
      await refreshMeasurementData();
      toast.success('GA4 history updated');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'GA4 sync failed.');
    }
  }, [refreshMeasurementData]);

  const mutateSeoChange = React.useCallback(async (method: 'POST' | 'PATCH' | 'DELETE', item: SeoChangeInput) => {
    try {
      const response = await apiFetch('/api/seo-changes', {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(item),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save SEO change.');
      setSeoChanges(data as SeoChangesReport);
      toast.success(method === 'DELETE' ? 'Change removed' : 'SEO change saved');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not save SEO change.';
      setError(message);
      toast.error(message);
    }
  }, []);

  const saveSeoChange = React.useCallback((item: SeoChangeInput) => mutateSeoChange('POST', item), [mutateSeoChange]);
  const updateSeoChange = React.useCallback((item: SeoChangeInput & { id: string }) => mutateSeoChange('PATCH', item), [mutateSeoChange]);
  const deleteSeoChange = React.useCallback((id: string) => mutateSeoChange('DELETE', { id }), [mutateSeoChange]);

  const updateAlert = React.useCallback(async (fingerprint: string, status: 'read' | 'dismissed' | 'snoozed' | 'unread', days = 7) => {
    try {
      const response = await apiFetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fingerprint, status, days }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update alert.');
      setAlerts(data as AlertReport);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not update alert.');
    }
  }, []);

  const mutateResearch = React.useCallback(async (action: 'refresh-mentions' | 'import-backlinks', extra: Record<string, unknown> = {}) => {
    try {
      const response = await apiFetch('/api/research-intelligence', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Research update failed.');
      setResearch(data as ResearchIntelligence);
      toast.success(action === 'refresh-mentions' ? 'External mentions refreshed' : 'Backlink sample imported');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Research update failed.';
      setError(message);
      toast.error(message);
    }
  }, []);

  const refreshMentions = React.useCallback(() => mutateResearch('refresh-mentions'), [mutateResearch]);
  const importBacklinks = React.useCallback((rows: Array<{ sourceUrl: string; targetUrl?: string }>) => mutateResearch('import-backlinks', { rows }), [mutateResearch]);

  const setAnalysisFilters = React.useCallback((filters: AnalysisFilters) => {
    setAnalysisFiltersState(filters);
    try { window.localStorage.setItem('codakid-analysis-filters', JSON.stringify(filters)); } catch { /* local preference only */ }
  }, []);

  const refreshCompetitors = React.useCallback(async () => {
    const response = await fetch('/api/competitors', { credentials: 'include' });
    if (response.ok) setCompetitors((await response.json()) as CompetitorSnapshot);
  }, []);

  const saveCompetitor = React.useCallback(async (item: CompetitorInput) => {
    try {
      const response = await apiFetch('/api/competitors', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(item),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save competitor.');
      await refreshCompetitors();
      toast.success('Competitor added to your watchlist');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not save competitor.';
      setError(message);
      toast.error(message);
    }
  }, [refreshCompetitors]);

  const archiveCompetitor = React.useCallback(async (domain: string) => {
    try {
      const response = await apiFetch('/api/competitors', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not archive competitor.');
      await refreshCompetitors();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not archive competitor.');
    }
  }, [refreshCompetitors]);

  const refreshAuthority = React.useCallback(async () => {
    try {
      const response = await fetch('/api/authority?refresh=1', { credentials: 'include' });
      if (!response.ok) throw new Error('Could not refresh domain authority.');
      const data = (await response.json()) as DomainAuthorityReport;
      setDomainAuthority(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not refresh domain authority.');
    }
  }, []);

  const runPageSpeed = React.useCallback(async (url: string, strategy: 'mobile' | 'desktop' = 'mobile') => {
    try {
      const response = await apiFetch('/api/pagespeed', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url, strategy }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'PageSpeed test failed.');
      const result = data.result as PageSpeedResult;
      setPageSpeed((prev) => {
        const base: PageSpeedReport = prev || { configured: true, generatedAt: new Date().toISOString(), candidates: [], results: [] };
        const others = base.results.filter((r) => !(r.url === result.url && r.strategy === result.strategy));
        return { ...base, generatedAt: new Date().toISOString(), results: [result, ...others] };
      });
      return result;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'PageSpeed test failed.');
      return null;
    }
  }, []);

  const fetchKeywordIdeas = React.useCallback(async (seed: string) => {
    try {
      const response = await fetch(`/api/keyword-ideas?seed=${encodeURIComponent(seed)}`, { credentials: 'include' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not fetch keyword ideas.');
      return data as KeywordIdeas;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not fetch keyword ideas.');
      return null;
    }
  }, []);

  const value: DashboardContextValue = {
    user,
    snapshot,
    competitors,
    technicalAudit,
    ai,
    aiWorkbench,
    homeLayout,
    dashboardHistory,
    googleStatus,
    searchOpportunities,
    ga4,
    seoChanges,
    alerts,
    research,
    analysisOverview,
    analysisFilters,
    markedPillars,
    actionItems,
    trackedKeywords,
    serpTracker,
    domainAuthority,
    pageSpeed,
    isLoading,
    isRefreshingAi,
    isSyncingGsc,
    error,
    isPillar,
    refresh,
    regenerateAi,
    runAiWorkbench,
    saveHomeLayout,
    syncSearchConsole,
    markPillar,
    unmarkPillar,
    saveActionItem,
    updateActionStatus,
    trackSerpKeywords,
    saveTrackedKeyword,
    updateTrackedKeyword,
    archiveTrackedKeyword,
    syncTrackedKeywords,
    syncGa4,
    saveSeoChange,
    updateSeoChange,
    deleteSeoChange,
    updateAlert,
    refreshMentions,
    importBacklinks,
    setAnalysisFilters,
    saveCompetitor,
    archiveCompetitor,
    refreshAuthority,
    runPageSpeed,
    fetchKeywordIdeas,
    onLogout,
  };

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

async function fetchDashboardModules(paths: string[], concurrency = 5): Promise<Array<Response | null>> {
  const results: Array<Response | null> = new Array(paths.length).fill(null);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, paths.length) }, async () => {
    while (nextIndex < paths.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await fetch(paths[index], { credentials: 'include' });
      } catch {
        results[index] = null;
      }
    }
  }));
  return results;
}

function readAnalysisFilters(): AnalysisFilters {
  try {
    const saved = JSON.parse(window.localStorage.getItem('codakid-analysis-filters') || '{}') as Partial<AnalysisFilters>;
    const scope = saved.scope === 'site' || saved.scope === 'pillars' ? saved.scope : 'blog';
    const days = saved.days === 7 || saved.days === 90 ? saved.days : 28;
    return { scope, days };
  } catch {
    return { scope: 'blog', days: 28 };
  }
}

function upsertActionItem(items: ActionItem[], next: ActionItem) {
  const exists = items.some((item) => item.id === next.id || item.fingerprint === next.fingerprint);
  if (!exists) return [next, ...items];
  return items.map((item) => (item.id === next.id || item.fingerprint === next.fingerprint ? next : item));
}

function normalizeHomeLayout(layout?: HomeLayout | null): HomeLayout {
  const cards = Array.isArray(layout?.cards) && layout.cards.length ? layout.cards : DEFAULT_HOME_LAYOUT.cards;
  const hidden = Array.isArray(layout?.hidden) ? layout.hidden : [];
  const allCards = [...new Set([...cards, ...DEFAULT_HOME_LAYOUT.cards])];
  return {
    cards: allCards,
    hidden: [...new Set(hidden)].filter((id) => allCards.includes(id)),
  };
}
