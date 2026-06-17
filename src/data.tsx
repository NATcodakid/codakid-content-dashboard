import React from 'react';
import { apiFetch, normalizeUrl } from './lib';
import type {
  ActionInput,
  ActionItem,
  ActionStatus,
  AiAnalystBrief,
  AiResponse,
  AiWorkbench,
  AuthUser,
  CompetitorInput,
  CompetitorSnapshot,
  DashboardHistory,
  Ga4Report,
  GoogleStatus,
  HomeLayout,
  KeywordInput,
  MarkedPillar,
  PageBrief,
  SerpTracker,
  SearchOpportunities,
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
  markedPillars: MarkedPillar[];
  actionItems: ActionItem[];
  trackedKeywords: TrackedKeyword[];
  serpTracker: SerpTracker | null;
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
  saveCompetitor: (item: CompetitorInput) => Promise<void>;
  archiveCompetitor: (domain: string) => Promise<void>;
  onLogout: () => void;
};

const DashboardContext = React.createContext<DashboardContextValue | null>(null);

const DEFAULT_HOME_LAYOUT: HomeLayout = {
  cards: ['ai-analyst', 'alerts', 'content-ideas', 'ai-visibility', 'refresh-queue', 'keyword-gap', 'boss-report'],
  hidden: [],
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
  const [markedPillars, setMarkedPillars] = React.useState<MarkedPillar[]>([]);
  const [actionItems, setActionItems] = React.useState<ActionItem[]>([]);
  const [trackedKeywords, setTrackedKeywords] = React.useState<TrackedKeyword[]>([]);
  const [serpTracker, setSerpTracker] = React.useState<SerpTracker | null>(null);
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
      const [
        contentResponse,
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
      ] =
        await Promise.all([
          fetch(snapshotUrl, { credentials: 'include' }),
          fetch('/api/competitors', { credentials: 'include' }),
          fetch('/api/google/search-console/status', { credentials: 'include' }).catch(() => null),
          fetch('/api/ga4', { credentials: 'include' }).catch(() => null),
          fetch('/api/search-opportunities', { credentials: 'include' }).catch(() => null),
          fetch('/api/technical-audit', { credentials: 'include' }).catch(() => null),
          fetch('/api/pillars', { credentials: 'include' }).catch(() => null),
          fetch('/api/action-items', { credentials: 'include' }).catch(() => null),
          fetch('/api/tracked-keywords', { credentials: 'include' }).catch(() => null),
          fetch('/api/serp-tracker', { credentials: 'include' }).catch(() => null),
          fetch('/api/ai-workbench', { credentials: 'include' }).catch(() => null),
          fetch('/api/dashboard-layout', { credentials: 'include' }).catch(() => null),
          fetch('/api/dashboard-history', { credentials: 'include' }).catch(() => null),
        ]);

      if (contentResponse.status === 401) {
        onUnauthorized();
        return;
      }
      if (!contentResponse.ok) throw new Error('Content snapshot failed to load.');

      const content = (await contentResponse.json()) as Snapshot;
      const competitorData = competitorResponse.ok ? ((await competitorResponse.json()) as CompetitorSnapshot) : null;
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
      setSnapshot(content);
      setCompetitors(competitorData);
      setTechnicalAudit(technicalAuditData);
      setGoogleStatus(googleResponse?.ok ? ((await googleResponse.json()) as GoogleStatus) : null);
      setGa4(ga4Data);
      setSearchOpportunities(opportunityData);
      setActionItems(actionData);
      setTrackedKeywords(trackedKeywordData);
      setSerpTracker(serpData);
      setAiWorkbench(aiWorkbenchData);
      setHomeLayout(normalizeHomeLayout(homeLayoutData?.layout));
      setDashboardHistory(historyData);
      if (pillarsResponse?.ok) {
        const data = (await pillarsResponse.json()) as { pillars: MarkedPillar[] };
        setMarkedPillars(data.pillars || []);
      }
      await loadAi(content, { competitorData, opportunityData, actionData, trackedKeywordData, ga4Data });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Dashboard failed to load.');
    } finally {
      setIsLoading(false);
    }
  }, [loadAi, onUnauthorized]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Search Console sync failed.');
    } finally {
      setIsSyncingGsc(false);
    }
  }, [refreshGoogleStatus]);

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
        void refresh({ forceCrawl: true });
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
      void refresh({ forceCrawl: true });
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
      return data.actionItem as ActionItem;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save action item.');
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
      return data.keyword as TrackedKeyword;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save keyword.');
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'GA4 sync failed.');
    }
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save competitor.');
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
    markedPillars,
    actionItems,
    trackedKeywords,
    serpTracker,
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
    saveCompetitor,
    archiveCompetitor,
    onLogout,
  };

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
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
