export type Status = 'connected' | 'pending' | 'sampled' | 'needs review' | string;

export type Pillar = {
  title: string;
  url: string;
  cluster: string;
  date: string;
  modified: string;
  inboundCount: number;
  outboundCount: number;
  relatedPostCount: number;
  missingRelatedLinks: Array<{ title: string; url: string; cluster: string; date: string }>;
  pillarScore: number;
  health: number;
  status: string;
  confirmedPillar?: boolean;
};

export type PostSummary = {
  title: string;
  url: string;
  slug: string;
  cluster: string;
  date: string;
  modified: string;
  inboundCount: number;
  outboundCount: number;
  relatedPostCount: number;
  pillarScore: number;
  health: number;
  status: string;
  confirmedPillar?: boolean;
};

export type GameplanRow = Record<string, string | number | null | undefined>;

export type SeoGameplan = {
  confirmedPillars: Array<{ title: string; url: string; cluster: string; status: string; notes?: string }>;
  technicalAudit: GameplanRow[];
  keywordTargets: GameplanRow[];
  contentCalendar: GameplanRow[];
  metaTags: GameplanRow[];
  internalLinks: GameplanRow[];
  schemaChecklist: GameplanRow[];
  quickWins: GameplanRow[];
  competitorIntel: GameplanRow[];
  summary: {
    confirmedPillars: number;
    technicalIssues: number;
    keywordTargets: number;
    plannedContent: number;
    metaTasks: number;
    internalLinkTasks: number;
    schemaTasks: number;
    quickWins: number;
  };
};

export type Cluster = {
  cluster: string;
  posts: number;
  pillars: number;
  internalLinks: number;
  averageInbound: number;
};

export type LinkGap = {
  pillarTitle: string;
  pillarUrl: string;
  sourceTitle: string;
  sourceUrl: string;
  cluster: string;
  suggestedAnchor: string;
};

export type Snapshot = {
  generatedAt: string;
  mode: string;
  kpis: {
    postsCrawled: number;
    categories: number;
    inferredPillars: number;
    suggestedPillars?: number;
    internalLinks: number;
    orphanPosts: number;
    linkGaps: number;
    postsUpdatedRecently: number;
    confirmedPillars?: number;
    quickWins?: number;
    keywordTargets?: number;
    plannedContent?: number;
  };
  clusters: Cluster[];
  pillars: Pillar[];
  allPosts?: PostSummary[];
  underlinkedPillars: Array<{ title: string; url: string; cluster: string; inboundCount: number; opportunity: string }>;
  linkGaps: LinkGap[];
  orphanPosts: Array<{ title: string; url: string; cluster: string; date: string; inboundCount: number; outboundCount: number }>;
  recommendations: Array<{ priority: string; title: string; detail: string }>;
  integrationStatus: Array<{ name: string; status: Status; detail: string }>;
  gameplan?: SeoGameplan;
};

export type CompetitorSnapshot = {
  generatedAt: string;
  mode: string;
  competitors: Array<{
    domain: string;
    source: string;
    urlsSampled: number;
    blogUrls: number;
    sampledPages?: Array<{ url: string; title: string }>;
    visibleTopics: Array<{ topic: string; count: number }>;
    contentAngles?: string[];
    opportunities: string[];
    status: Status;
  }>;
};

export type AiResponse = {
  mode: string;
  message?: string;
  insights: string[];
};

export type GoogleStatus = {
  configured: boolean;
  connected: boolean;
  analyticsScopeReady?: boolean;
  imported?: boolean;
  redirectUri: string;
  connection: {
    google_email?: string;
    expires_at?: string;
    updated_at?: string;
  } | null;
  properties: Array<{
    site_url: string;
    permission_level: string;
    selected: boolean;
    last_seen_at: string;
  }>;
  latestSnapshots: Array<{
    siteUrl: string;
    startDate: string;
    endDate: string;
    dimensions: string;
    rowCount: number;
    totals: { clicks: number; impressions: number };
    createdAt: string;
  }>;
};

export type TrackedKeyword = {
  id: string;
  keyword: string;
  cluster: string;
  targetUrl: string;
  intent: string;
  priority: number;
  cadence: 'weekly' | 'manual' | string;
  status: 'active' | 'paused' | 'archived' | string;
  source: string;
  notes: string;
  lastTrackedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  latestSerp: {
    id: string;
    position?: number | null;
    url: string;
    fetchedAt: string;
    organic: Array<{ title: string; link: string; snippet: string; position: number; domain: string }>;
    competitors: Array<{ domain: string; position: number; title: string; link: string }>;
  } | null;
  trend: Array<{
    position?: number | null;
    url: string;
    fetchedAt: string;
  }>;
  previousPosition?: number | null;
  positionChange?: number | null;
};

export type KeywordInput = {
  id?: string;
  keyword?: string;
  cluster?: string;
  targetUrl?: string;
  intent?: string;
  priority?: number;
  cadence?: string;
  status?: string;
  source?: string;
  notes?: string;
};

export type Ga4Report = {
  configured: boolean;
  propertyId: string;
  connected: boolean;
  analyticsScopeReady: boolean;
  message?: string;
  latest: {
    propertyId: string;
    startDate: string;
    endDate: string;
    updatedAt: string;
    summary: {
      sessions: number;
      totalUsers: number;
      screenPageViews: number;
      engagementRate: number;
      averageSessionDuration: number;
      deltas: {
        sessions: number | null;
        totalUsers: number | null;
        screenPageViews: number | null;
        engagementRate: number | null;
      };
    };
    topPages: Array<{
      path: string;
      title: string;
      url: string;
      views: number;
      sessions: number;
      users: number;
      engagementRate: number;
    }>;
  } | null;
};

export type SearchOpportunity = {
  label: string;
  page?: string;
  query?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  priorityScore: number;
  opportunityType: string;
  recommendation: string;
};

export type ContentDecayOpportunity = {
  page: string;
  clicks: number;
  previousClicks: number;
  lostClicks: number;
  clickChange: number;
  impressions: number;
  previousImpressions: number;
  impressionChange: number;
  position: number;
  priorityScore: number;
  recommendation: string;
};

export type CannibalizationOpportunity = {
  query: string;
  pageCount: number;
  totalImpressions: number;
  recommendation: string;
  pages: Array<{
    page: string;
    clicks: number;
    impressions: number;
    position: number;
    ctr: number;
  }>;
};

export type SearchPeriod = {
  startDate: string;
  endDate: string;
  updatedAt?: string;
  siteUrl?: string;
};

export type SearchTrendPoint = {
  startDate: string;
  endDate: string;
  label: string;
  totalClicks: number;
  totalImpressions: number;
  averageCtr: number;
  averagePosition: number;
  keywordCount: number;
};

export type SearchOpportunities = {
  available: boolean;
  message?: string;
  siteUrl?: string;
  startDate?: string;
  endDate?: string;
  updatedAt?: string;
  periodIndex?: number;
  periods?: SearchPeriod[];
  trend?: SearchTrendPoint[];
  summary?: {
    totalClicks: number;
    totalImpressions: number;
    averageCtr: number;
    averagePosition: number;
  };
  pageOpportunities: SearchOpportunity[];
  queryOpportunities: SearchOpportunity[];
  pageQueryOpportunities: SearchOpportunity[];
  contentDecay?: ContentDecayOpportunity[];
  cannibalization?: CannibalizationOpportunity[];
  topPages: SearchOpportunity[];
  topQueries: SearchOpportunity[];
};

export type FocusAction = {
  label: string;
  title: string;
  detail: string;
  meta: string;
  score?: number;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'viewer' | string;
  status: string;
};

export type MarkedPillar = {
  url: string;
  raw_url: string;
  title: string;
  cluster: string;
  note: string;
  marked_by?: string;
  created_at?: string;
};

export type ActionStatus = 'todo' | 'in_progress' | 'done' | 'dismissed';

export type ActionItem = {
  id: string;
  fingerprint: string;
  type: string;
  source: string;
  title: string;
  detail: string;
  pageUrl: string;
  keyword: string;
  cluster: string;
  priorityScore: number;
  status: ActionStatus;
  owner: string;
  dueDate?: string | null;
  completedAt?: string | null;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ActionInput = Partial<ActionItem> & {
  pageUrl?: string;
  priorityScore?: number;
};

export type SerpSnapshot = {
  id: string;
  keyword: string;
  location: string;
  country: string;
  language: string;
  codakidPosition?: number | null;
  codakidUrl: string;
  organic: Array<{ title: string; link: string; snippet: string; position: number; domain: string }>;
  peopleAlsoAsk: Array<{ question: string; snippet: string; title: string; link: string }>;
  relatedSearches: Array<{ query?: string } | string>;
  creditsUsed: number;
  fetchedAt: string;
  cached?: boolean;
};

export type SerpTracker = {
  configured: boolean;
  creditsUsed?: number;
  cacheHours?: number;
  snapshots: SerpSnapshot[];
  trend: Array<{
    keyword: string;
    codakidPosition?: number | null;
    codakidUrl: string;
    fetchedAt: string;
  }>;
};

export type Diagnostics = {
  database: {
    configured: boolean;
    expectedKeys: string[];
    presentExpectedKeys: string[];
  };
  env: {
    wordpressBase: string;
    openaiConfigured: boolean;
    serperConfigured: boolean;
    ga4PropertyConfigured: boolean;
    googleOauthConfigured: boolean;
    gscImportSecretConfigured: boolean;
  };
  wordpress: {
    post_count: number;
    source: string;
    ok: boolean;
    error: string;
    created_at: string;
  } | null;
  searchConsole: Array<{
    siteUrl: string;
    dimensions: string;
    rowCount: number;
    createdAt: string;
  }>;
  serp: {
    total: number;
    latest?: string | null;
  };
  actions: {
    total: number;
    open: number;
    done: number;
  };
  users: {
    total: number;
    admins: number;
    active: number;
  };
  recentActivity: Array<{
    action: string;
    resource: string;
    email: string;
    created_at: string;
  }>;
};
