import { randomUUID } from 'node:crypto';
import { ensureAuthSchema, errorResponse, getSql, json, requireUser } from './_auth.mjs';

const VALID_SCOPES = new Set(['blog', 'site', 'pillars']);
const VALID_WINDOWS = new Set([7, 28, 90]);
const DAY_MS = 86400000;

export async function handler(event) {
  try {
    await requireUser(event);
    const params = event.queryStringParameters || {};
    const scope = VALID_SCOPES.has(params.scope) ? params.scope : 'blog';
    const days = VALID_WINDOWS.has(Number(params.days)) ? Number(params.days) : 28;
    const payload = await buildAnalysisOverview({ scope, days });
    await persistSnapshot(payload);
    return json(200, payload, { 'cache-control': 'private, no-store' });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function scheduled() {
  await ensureAuthSchema();
  for (const scope of ['blog', 'site', 'pillars']) {
    const payload = await buildAnalysisOverview({ scope, days: 28 });
    await persistSnapshot(payload);
  }
}

export async function buildAnalysisOverview({ scope = 'blog', days = 28 } = {}) {
  const sql = getSql();
  const [wordpressRows, gscRows, ga4Rows, auditRows, serpRows, aiRows, historyRows] = await Promise.all([
    sql`select data, created_at from wordpress_snapshots where ok = true order by created_at desc limit 1`,
    sql`select data, start_date, end_date, created_at from google_search_console_snapshots where dimensions = 'page,date' order by created_at desc limit 1`,
    sql`select data, start_date, end_date, created_at from ga4_snapshots where dimensions = 'pagePath,date' order by created_at desc limit 1`,
    sql`select health_score, high_count, medium_count, issue_count, created_at from technical_audit_snapshots order by created_at desc limit 1`,
    sql`
      with ranked as (
        select keyword, codakid_position, codakid_url, fetched_at,
          row_number() over (partition by keyword order by fetched_at desc) as rn
        from serp_snapshots
      )
      select current.keyword, current.codakid_position, current.codakid_url, current.fetched_at,
        previous.codakid_position as previous_position
      from ranked current
      left join ranked previous on previous.keyword = current.keyword and previous.rn = 2
      where current.rn = 1
      order by current.fetched_at desc
    `,
    sql`select created_at, codakid_mentioned, source_mode from ai_visibility_runs order by created_at desc limit 100`,
    sql`
      select snapshot_date, data
      from analysis_snapshots
      where scope = ${scope} and window_days = ${days}
      order by snapshot_date desc
      limit 24
    `,
  ]);

  const wordpress = wordpressRows[0] || null;
  const gsc = gscRows[0] || null;
  const ga4 = ga4Rows[0] || null;
  const audit = auditRows[0] || null;
  const snapshot = wordpress?.data || {};
  const allPosts = Array.isArray(snapshot.allPosts) ? snapshot.allPosts : [];
  const pillars = Array.isArray(snapshot.pillars) ? snapshot.pillars : [];
  const allowed = scope === 'pillars'
    ? new Set(pillars.map((page) => normalizeUrl(page.url)))
    : new Set(allPosts.map((page) => normalizeUrl(page.url)));
  const inScope = (url) => scope === 'site' || allowed.has(normalizeUrl(url));

  const gscDaily = normalizeGscDaily(gsc?.data).filter((row) => inScope(row.url));
  const ga4Daily = normalizeGa4Daily(ga4?.data).filter((row) => inScope(row.url));
  const latestDate = commonLatestDate(gscDaily, ga4Daily) || dateOnly(gsc?.end_date) || dateOnly(ga4?.end_date) || dateDaysAgo(3);
  const currentRange = makeRange(latestDate, days, 0);
  const previousRange = makeRange(latestDate, days, days);

  const currentGsc = aggregateRows(gscDaily, currentRange);
  const previousGsc = aggregateRows(gscDaily, previousRange);
  const currentGa4 = aggregateRows(ga4Daily, currentRange);
  const previousGa4 = aggregateRows(ga4Daily, previousRange);
  const gscPages = comparePages(gscDaily, currentRange, previousRange, 'clicks');
  const ga4Pages = comparePages(ga4Daily, currentRange, previousRange, 'sessions');
  const pageComparison = mergePageComparisons(gscPages, ga4Pages);
  const selectedPosts = scope === 'pillars' ? pillars : allPosts;
  const lifecycle = buildLifecycle(selectedPosts, pageComparison, currentGsc.rows > 0);
  const rankingMovers = buildRankingMovers(serpRows);
  const health = buildUnifiedHealth({ snapshot, selectedPosts, audit, currentGsc, previousGsc });
  const sources = buildSources({ wordpress, gsc, ga4, audit, serpRows, aiRows, gscDaily, ga4Daily, allowed, scope });
  const confidence = buildConfidence(sources, currentGsc, previousGsc, currentGa4, previousGa4, days);

  return {
    generatedAt: new Date().toISOString(),
    filters: { scope, days, startDate: currentRange.startDate, endDate: currentRange.endDate, previousStartDate: previousRange.startDate, previousEndDate: previousRange.endDate },
    coverage: {
      knownBlogUrls: allPosts.length,
      scopedUrls: scope === 'site' ? null : allowed.size,
      gscPages: currentGsc.pages,
      ga4Pages: currentGa4.pages,
    },
    confidence,
    sources,
    health,
    performance: {
      current: metrics(currentGsc, currentGa4),
      previous: metrics(previousGsc, previousGa4),
      deltas: metricDeltas(currentGsc, previousGsc, currentGa4, previousGa4),
    },
    winners: pageComparison.filter((page) => page.clickChange > 0.15 && page.clicks >= 3).sort((a, b) => b.clickDelta - a.clickDelta).slice(0, 8),
    losers: pageComparison.filter((page) => page.clickChange < -0.15 && page.previousClicks >= 5).sort((a, b) => a.clickDelta - b.clickDelta).slice(0, 8),
    lifecycle,
    lifecycleSummary: countBy(lifecycle, 'stage'),
    rankingMovers,
    history: historyRows.reverse().map((row) => ({ date: dateOnly(row.snapshot_date), score: Number(row.data?.health?.score || 0), clicks: Number(row.data?.performance?.current?.clicks || 0), sessions: Number(row.data?.performance?.current?.sessions || 0) })),
    methodology: {
      health: 'Overall SEO readiness = 35% technical audit + 30% content health + 20% internal linking + 15% search performance.',
      scope: scope === 'site' ? 'All URLs returned by Google sources.' : scope === 'pillars' ? 'Only confirmed and inferred pillar URLs from the latest WordPress crawl.' : 'Only URLs present in the latest WordPress blog crawl.',
      comparisons: `Current ${days}-day window compared with the immediately preceding ${days}-day window.`,
    },
  };
}

async function persistSnapshot(payload) {
  const sql = getSql();
  const compact = {
    health: payload.health,
    performance: payload.performance,
    confidence: payload.confidence,
    coverage: payload.coverage,
  };
  await sql`
    insert into analysis_snapshots (id, scope, window_days, snapshot_date, data)
    values (${randomUUID()}, ${payload.filters.scope}, ${payload.filters.days}, current_date, ${JSON.stringify(compact)})
    on conflict (scope, window_days, snapshot_date) do update set data = excluded.data, created_at = now()
  `;
}

function normalizeGscDaily(data) {
  return (data?.rows || []).flatMap((row) => {
    const url = row.keys?.[0] || '';
    const date = row.keys?.[1] || '';
    if (!url || !date) return [];
    return [{ url, date, clicks: Number(row.clicks || 0), impressions: Number(row.impressions || 0), position: Number(row.position || 0), sessions: 0, views: 0, keyEvents: 0, revenue: 0 }];
  });
}

function normalizeGa4Daily(data) {
  const headers = (data?.metricHeaders || []).map((header) => header.name);
  return (data?.rows || []).flatMap((row) => {
    const path = row.dimensionValues?.[0]?.value || '';
    const date = gaDate(row.dimensionValues?.[1]?.value);
    if (!path || !date) return [];
    const values = Object.fromEntries(headers.map((header, index) => [header, Number(row.metricValues?.[index]?.value || 0)]));
    return [{ url: `https://codakid.com${path}`, date, clicks: 0, impressions: 0, position: 0, sessions: values.sessions || 0, views: values.screenPageViews || 0, keyEvents: values.keyEvents || 0, revenue: values.totalRevenue || 0 }];
  });
}

function aggregateRows(rows, range) {
  const filtered = rows.filter((row) => inRange(row.date, range));
  const impressions = sum(filtered, 'impressions');
  return {
    clicks: Math.round(sum(filtered, 'clicks')),
    impressions: Math.round(impressions),
    position: impressions ? filtered.reduce((total, row) => total + row.position * row.impressions, 0) / impressions : 0,
    ctr: impressions ? sum(filtered, 'clicks') / impressions : 0,
    sessions: Math.round(sum(filtered, 'sessions')),
    views: Math.round(sum(filtered, 'views')),
    keyEvents: sum(filtered, 'keyEvents'),
    revenue: sum(filtered, 'revenue'),
    pages: new Set(filtered.map((row) => normalizeUrl(row.url))).size,
    rows: filtered.length,
    observedDays: new Set(filtered.map((row) => row.date)).size,
  };
}

function comparePages(rows, currentRange, previousRange, metric) {
  const current = groupPages(rows.filter((row) => inRange(row.date, currentRange)));
  const previous = groupPages(rows.filter((row) => inRange(row.date, previousRange)));
  const urls = new Set([...current.keys(), ...previous.keys()]);
  return [...urls].map((url) => ({ url, current: current.get(url)?.[metric] || 0, previous: previous.get(url)?.[metric] || 0 }));
}

function groupPages(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const url = normalizeUrl(row.url);
    const current = grouped.get(url) || { clicks: 0, impressions: 0, sessions: 0, views: 0 };
    current.clicks += row.clicks || 0;
    current.impressions += row.impressions || 0;
    current.sessions += row.sessions || 0;
    current.views += row.views || 0;
    grouped.set(url, current);
  }
  return grouped;
}

function mergePageComparisons(gscPages, ga4Pages) {
  const map = new Map();
  for (const row of gscPages) map.set(row.url, { url: row.url, clicks: Math.round(row.current), previousClicks: Math.round(row.previous), sessions: 0, previousSessions: 0 });
  for (const row of ga4Pages) {
    const page = map.get(row.url) || { url: row.url, clicks: 0, previousClicks: 0, sessions: 0, previousSessions: 0 };
    page.sessions = Math.round(row.current);
    page.previousSessions = Math.round(row.previous);
    map.set(row.url, page);
  }
  return [...map.values()].map((page) => ({
    ...page,
    clickDelta: page.clicks - page.previousClicks,
    clickChange: change(page.clicks, page.previousClicks),
    sessionDelta: page.sessions - page.previousSessions,
    sessionChange: change(page.sessions, page.previousSessions),
  }));
}

function buildLifecycle(posts, comparisons, hasSearchData) {
  const comparisonMap = new Map(comparisons.map((page) => [normalizeUrl(page.url), page]));
  const clickValues = comparisons.map((page) => page.clicks).sort((a, b) => b - a);
  const protectThreshold = clickValues[Math.max(0, Math.floor(clickValues.length * 0.2) - 1)] || Infinity;
  return posts.map((post) => {
    const performance = comparisonMap.get(normalizeUrl(post.url)) || { clicks: 0, previousClicks: 0, clickChange: 0, sessions: 0, previousSessions: 0 };
    const ageDays = daysSince(post.modified || post.date);
    let stage = 'Stable';
    let reason = 'No material movement in the selected comparison.';
    if (!hasSearchData) { stage = 'Unmeasured'; reason = 'Page-level Search Console coverage is not available for this window.'; }
    if (hasSearchData && performance.clicks >= protectThreshold && performance.clicks >= 10) { stage = 'Protect'; reason = 'Top-performing page in this scope.'; }
    if (hasSearchData && performance.clickChange >= 0.2 && performance.clicks >= 5) { stage = 'Growing'; reason = 'Organic clicks increased at least 20%.'; }
    if (hasSearchData && performance.clickChange <= -0.2 && performance.previousClicks >= 10) { stage = 'Decaying'; reason = 'Organic clicks fell at least 20%.'; }
    if (hasSearchData && ageDays > 365 && performance.clicks > 0 && stage === 'Stable') { stage = 'Stale'; reason = 'Still receives traffic but has not been updated in over a year.'; }
    if (hasSearchData && Number(post.health || 0) < 45 && performance.clicks < 3 && ageDays > 180) { stage = 'Consolidate'; reason = 'Low health, low traffic, and aging content.'; }
    return { title: post.title, url: post.url, cluster: post.cluster, stage, reason, ageDays, health: Number(post.health || 0), ...performance };
  }).sort((a, b) => lifecycleRank(a.stage) - lifecycleRank(b.stage) || b.previousClicks - a.previousClicks);
}

function buildRankingMovers(rows) {
  return rows.flatMap((row) => {
    const current = Number(row.codakid_position || 0);
    const previous = Number(row.previous_position || 0);
    if (!current || !previous || current === previous) return [];
    return [{ keyword: row.keyword, position: current, previousPosition: previous, change: previous - current, url: row.codakid_url || '', fetchedAt: row.fetched_at }];
  }).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 12);
}

function buildUnifiedHealth({ snapshot, selectedPosts, audit, currentGsc, previousGsc }) {
  const posts = selectedPosts.length ? selectedPosts : snapshot.allPosts || [];
  const content = posts.length ? Math.round(posts.reduce((total, post) => total + Number(post.health || 0), 0) / posts.length) : 0;
  const orphans = posts.filter((post) => Number(post.inboundCount || 0) === 0).length;
  const links = posts.length ? clamp(Math.round(100 - (orphans / posts.length) * 100)) : 0;
  const technical = clamp(Number(audit?.health_score || 0));
  const clickDelta = change(currentGsc.clicks, previousGsc.clicks);
  const search = clamp(Math.round(55 + Math.max(-25, Math.min(25, clickDelta * 100)) + Math.min(20, currentGsc.ctr * 200)));
  const score = clamp(Math.round(technical * 0.35 + content * 0.3 + links * 0.2 + search * 0.15));
  return {
    score,
    label: score >= 80 ? 'Excellent' : score >= 65 ? 'Good' : score >= 45 ? 'Needs attention' : 'At risk',
    components: [
      { id: 'technical', label: 'Technical audit', score: technical, weight: 35, source: 'Technical crawl' },
      { id: 'content', label: 'Content quality', score: content, weight: 30, source: 'WordPress crawl' },
      { id: 'links', label: 'Internal linking', score: links, weight: 20, source: 'WordPress link graph' },
      { id: 'search', label: 'Search performance', score: search, weight: 15, source: 'Search Console comparison' },
    ],
  };
}

function buildSources({ wordpress, gsc, ga4, audit, serpRows, aiRows, gscDaily, ga4Daily, allowed, scope }) {
  const latestSerp = serpRows[0]?.fetched_at || null;
  const latestAi = aiRows[0]?.created_at || null;
  return [
    source('WordPress', wordpress?.created_at, 48, scope === 'site' ? `${wordpress?.data?.kpis?.postsCrawled || 0} blog posts; site-wide pages are not crawled` : `${allowed.size} scoped URLs`, 'Measured'),
    source('Search Console', gscDaily.length ? `${maxDate(gscDaily)}T00:00:00Z` : null, 72, `${gscDaily.length} page-day rows · observed ${minDate(gscDaily) || '—'} to ${maxDate(gscDaily) || '—'}`, 'Measured'),
    source('Google Analytics', ga4Daily.length ? `${maxDate(ga4Daily)}T00:00:00Z` : null, 72, `${ga4Daily.length} page-day rows · observed ${minDate(ga4Daily) || '—'} to ${maxDate(ga4Daily) || '—'}`, 'Measured'),
    source('Technical crawl', audit?.created_at, 168, `${audit?.issue_count || 0} findings`, 'Measured'),
    source('Serper', latestSerp, 192, `${serpRows.length} tracked keywords`, 'Measured sample'),
    source('OpenAI visibility', latestAi, 192, `${aiRows.length} saved prompt runs`, 'Sampled'),
  ];
}

function source(name, updatedAt, staleHours, coverage, measurement) {
  const ageHours = updatedAt ? (Date.now() - new Date(updatedAt).getTime()) / 3600000 : Infinity;
  return { name, updatedAt: updatedAt || null, status: !updatedAt ? 'missing' : ageHours > staleHours ? 'stale' : 'current', coverage, measurement };
}

function buildConfidence(sources, gsc, previousGsc, ga4, previousGa4, days) {
  const current = sources.filter((item) => item.status === 'current').length;
  const missing = sources.filter((item) => item.status === 'missing').length;
  const coverageRatio = Math.min(1, gsc.observedDays / days, previousGsc.observedDays / days, ga4.observedDays / days, previousGa4.observedDays / days);
  const score = clamp(Math.round((current / sources.length) * 70 + coverageRatio * 30));
  return { score, label: score >= 85 ? 'High confidence' : score >= 65 ? 'Good confidence' : score >= 40 ? 'Partial coverage' : 'Low confidence', currentSources: current, totalSources: sources.length, missingSources: missing };
}

function metrics(gsc, ga4) { return { clicks: gsc.clicks, impressions: gsc.impressions, ctr: gsc.ctr, position: gsc.position, sessions: ga4.sessions, views: ga4.views, keyEvents: ga4.keyEvents, revenue: ga4.revenue }; }
function metricDeltas(currentGsc, previousGsc, currentGa4, previousGa4) { return { clicks: previousGsc.rows ? change(currentGsc.clicks, previousGsc.clicks) : null, impressions: previousGsc.rows ? change(currentGsc.impressions, previousGsc.impressions) : null, ctr: previousGsc.rows ? currentGsc.ctr - previousGsc.ctr : null, position: previousGsc.rows ? previousGsc.position - currentGsc.position : null, sessions: previousGa4.rows ? change(currentGa4.sessions, previousGa4.sessions) : null, views: previousGa4.rows ? change(currentGa4.views, previousGa4.views) : null, keyEvents: previousGa4.rows ? change(currentGa4.keyEvents, previousGa4.keyEvents) : null, revenue: previousGa4.rows ? change(currentGa4.revenue, previousGa4.revenue) : null }; }
function commonLatestDate(gsc, ga4) { const g = maxDate(gsc); const a = maxDate(ga4); return g && a ? (g < a ? g : a) : g || a; }
function maxDate(rows) { return rows.reduce((latest, row) => !latest || row.date > latest ? row.date : latest, ''); }
function minDate(rows) { return rows.reduce((earliest, row) => !earliest || row.date < earliest ? row.date : earliest, ''); }
function makeRange(endDate, days, offset) { const end = new Date(`${endDate}T00:00:00Z`); const rangeEnd = new Date(end.getTime() - offset * DAY_MS); const start = new Date(rangeEnd.getTime() - (days - 1) * DAY_MS); return { startDate: dateOnly(start), endDate: dateOnly(rangeEnd) }; }
function inRange(date, range) { return date >= range.startDate && date <= range.endDate; }
function sum(rows, key) { return rows.reduce((total, row) => total + Number(row[key] || 0), 0); }
function change(current, previous) { return previous ? (current - previous) / previous : current ? 1 : 0; }
function countBy(rows, key) { return rows.reduce((counts, row) => ({ ...counts, [row[key]]: (counts[row[key]] || 0) + 1 }), {}); }
function clamp(value) { return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0)); }
function lifecycleRank(stage) { return ({ Decaying: 0, Consolidate: 1, Stale: 2, Growing: 3, Protect: 4, Stable: 5, Unmeasured: 6 })[stage] ?? 9; }
function normalizeUrl(value) { try { const url = new URL(value, 'https://codakid.com'); return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/$/, '')}`.toLowerCase(); } catch { return String(value || '').toLowerCase(); } }
function daysSince(value) { const time = new Date(value || 0).getTime(); return time ? Math.max(0, Math.floor((Date.now() - time) / DAY_MS)) : 9999; }
function dateOnly(value) { if (!value) return ''; if (value instanceof Date) return value.toISOString().slice(0, 10); return String(value).slice(0, 10); }
function dateDaysAgo(days) { return new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10); }
function gaDate(value) { const raw = String(value || ''); return /^\d{8}$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw; }
