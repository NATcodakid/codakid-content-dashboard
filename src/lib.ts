import type { FocusAction, GameplanRow, Pillar, SearchOpportunities, Snapshot } from './types';

const CSRF_COOKIE = 'ck_content_csrf';

export const formatter = new Intl.NumberFormat('en-US');

export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const method = String(init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers || {});
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
    const token = readCookie(CSRF_COOKIE);
    if (token) headers.set('x-codakid-csrf', token);
  }
  return fetch(input, {
    ...init,
    credentials: init.credentials || 'include',
    headers,
  });
}

function readCookie(name: string) {
  return document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) || '';
}

export function formatPercent(value: number) {
  return `${(value * 100).toFixed(value < 0.01 ? 1 : 0)}%`;
}

export function formatPosition(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '-';
  return value.toFixed(value < 10 ? 1 : 0);
}

export function formatDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateRange(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) return 'the latest available data';
  return `${formatDate(startDate)} – ${formatDate(endDate)}`;
}

export function trendClicks(trend?: Array<{ totalClicks: number }>) {
  return trend?.length ? trend.map((point) => point.totalClicks) : [0];
}

export function trendImpressions(trend?: Array<{ totalImpressions: number }>) {
  return trend?.length ? trend.map((point) => point.totalImpressions) : [0];
}

export function trendCtrPercent(trend?: Array<{ averageCtr: number }>) {
  return trend?.length ? trend.map((point) => Math.round(point.averageCtr * 1000) / 10) : [0];
}

export function trendPositions(trend?: Array<{ averagePosition: number }>) {
  if (!trend?.length) return [0];
  const positions = trend.map((point) => point.averagePosition || 0);
  const max = Math.max(...positions, 1);
  return positions.map((position) => Math.round((max - position + 1) * 10));
}

export function trendKeywords(trend?: Array<{ keywordCount: number }>) {
  return trend?.length ? trend.map((point) => point.keywordCount) : [0];
}

export function periodDelta(
  trend: Array<{ totalClicks: number }> | undefined,
  periodIndex: number,
): string | null {
  if (!trend?.length) return null;
  const trendIndex = trend.length - 1 - periodIndex;
  if (trendIndex <= 0) return null;
  const current = trend[trendIndex]?.totalClicks || 0;
  const previous = trend[trendIndex - 1]?.totalClicks || 0;
  if (!previous) return null;
  const change = Math.round(((current - previous) / previous) * 100);
  if (!change) return 'flat vs prior period';
  return `${change > 0 ? '+' : ''}${change}% vs prior period`;
}

export type HealthFactor = { label: string; score: number; hint: string };
export type SeoHealth = {
  score: number;
  band: { label: string; tone: 'success' | 'default' | 'warning' | 'danger' };
  verdict: string;
  factors: HealthFactor[];
};

export function computeSeoHealth(snapshot: Snapshot): SeoHealth {
  const posts = Math.max(1, snapshot.kpis.postsCrawled || 0);
  const orphans = snapshot.kpis.orphanPosts || 0;
  const confirmed = snapshot.kpis.confirmedPillars || 0;
  const pillarHealth = snapshot.pillars.length
    ? Math.round(snapshot.pillars.reduce((sum, pillar) => sum + pillar.health, 0) / snapshot.pillars.length)
    : 0;

  const linking = clampScore(Math.round(100 - (orphans / posts) * 100));
  const coverage = clampScore(40 + confirmed * 15);
  const content = clampScore(pillarHealth);

  const score = clampScore(Math.round(linking * 0.4 + content * 0.4 + coverage * 0.2));

  return {
    score,
    band: scoreBand(score),
    verdict: scoreVerdict(score),
    factors: [
      {
        label: 'Internal Linking',
        score: linking,
        hint: `${orphans} of ${posts} posts have no links pointing to them. Fewer orphans = a stronger score.`,
      },
      {
        label: 'Content Health',
        score: content,
        hint: 'Average freshness, depth, and link strength of your pillar pages (0–100).',
      },
      {
        label: 'Pillar Coverage',
        score: coverage,
        hint: `${confirmed} cornerstone page${confirmed === 1 ? '' : 's'} confirmed. Confirming more raises this score.`,
      },
    ],
  };
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function scoreBand(score: number): SeoHealth['band'] {
  if (score >= 80) return { label: 'Excellent', tone: 'success' };
  if (score >= 60) return { label: 'Good', tone: 'default' };
  if (score >= 40) return { label: 'Needs work', tone: 'warning' };
  return { label: 'Poor', tone: 'danger' };
}

function scoreVerdict(score: number) {
  if (score >= 80) return 'Your blog is in great shape. Keep pillars fresh and protect your rankings.';
  if (score >= 60) return 'Solid foundation. A few internal-link and pillar fixes will push you higher.';
  if (score >= 40) return 'There is real upside here. Focus on the action plan below to climb fast.';
  return 'Lots of quick wins available. Start with the action plan below.';
}

export function positionBuckets(opportunities: SearchOpportunities | null) {
  const rows = [
    ...(opportunities?.topQueries || []),
    ...(opportunities?.queryOpportunities || []),
    ...(opportunities?.pageQueryOpportunities || []),
  ].filter((row) => Number.isFinite(row.position) && row.position > 0);

  const seen = new Set<string>();
  const buckets = { 'Top 3': 0, 'Page 1 (4–10)': 0, 'Page 2 (11–20)': 0, '21+': 0 };

  for (const row of rows) {
    const key = `${row.query || row.label}|${row.page || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const position = row.position;
    if (position <= 3) buckets['Top 3'] += 1;
    else if (position <= 10) buckets['Page 1 (4–10)'] += 1;
    else if (position <= 20) buckets['Page 2 (11–20)'] += 1;
    else buckets['21+'] += 1;
  }

  return Object.entries(buckets).map(([name, value]) => ({ name, value }));
}

export function formatCompact(value: number) {
  return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function shortUrl(url: string) {
  if (!url) return 'Not set';
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/\/$/, '') || parsed.hostname;
  } catch {
    return url;
  }
}

export function formatCell(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return 'Not set';
  return String(value);
}

export function normalizeUrl(url: string) {
  try {
    const parsed = new URL(url, 'https://codakid.com');
    parsed.hash = '';
    parsed.search = '';
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '').toLowerCase();
  } catch {
    return String(url).replace(/\/$/, '').toLowerCase();
  }
}

export function nextMoveForPillar(pillar: Pillar, role: string) {
  if (role === 'Ignore') return 'Hidden from active planning';
  if (role === 'Refresh') return 'Refresh title, intro, examples, and FAQ';
  if (role === 'Pillar') {
    return pillar.inboundCount < 8
      ? 'Build more supporting links into this pillar'
      : 'Protect rankings and update quarterly';
  }
  return pillar.missingRelatedLinks.length
    ? 'Use as supporting content for the pillar cluster'
    : 'Review for consolidation';
}

export function buildFocusActions(snapshot: Snapshot, opportunities: SearchOpportunities | null): FocusAction[] {
  const actions: FocusAction[] = [];
  const pageOpportunity = opportunities?.pageOpportunities?.[0];
  const queryOpportunity = opportunities?.queryOpportunities?.[0];
  const pageQueryOpportunity = opportunities?.pageQueryOpportunities?.[0];
  const linkGap = snapshot.linkGaps[0];
  const quickWin = snapshot.gameplan?.quickWins?.[0] as GameplanRow | undefined;

  if (pageOpportunity) {
    actions.push({
      label: 'CTR fix',
      title: shortUrl(pageOpportunity.label),
      detail: pageOpportunity.recommendation,
      meta: `${formatter.format(pageOpportunity.impressions)} impressions`,
      score: pageOpportunity.priorityScore,
    });
  }

  if (queryOpportunity) {
    actions.push({
      label: 'Ranking lift',
      title: queryOpportunity.label,
      detail: queryOpportunity.recommendation,
      meta: `Avg position ${formatPosition(queryOpportunity.position)}`,
      score: queryOpportunity.priorityScore,
    });
  }

  if (pageQueryOpportunity) {
    actions.push({
      label: 'Page refresh',
      title: pageQueryOpportunity.query || pageQueryOpportunity.label,
      detail: pageQueryOpportunity.recommendation,
      meta: shortUrl(pageQueryOpportunity.page || ''),
      score: pageQueryOpportunity.priorityScore,
    });
  }

  if (linkGap) {
    actions.push({
      label: 'Internal link',
      title: linkGap.sourceTitle,
      detail: `Add a link to ${linkGap.pillarTitle} using "${linkGap.suggestedAnchor}".`,
      meta: linkGap.cluster,
    });
  }

  if (quickWin) {
    actions.push({
      label: 'Gameplan',
      title: formatCell(quickWin.Action || quickWin.Task || quickWin['Page / Target']),
      detail: formatCell(quickWin['Expected Impact'] || quickWin.Notes || quickWin.Priority),
      meta: formatCell(quickWin['Page / Target'] || quickWin.Owner || 'Imported workbook'),
    });
  }

  return actions.slice(0, 4);
}
