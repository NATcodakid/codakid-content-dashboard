import { randomUUID } from 'node:crypto';
import { audit, errorResponse, getSql, json, parseJsonBody, requireCsrf, requireUser, HttpError } from './_auth.mjs';
import { loadContentSnapshot } from './content-snapshot.mjs';

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const WP_BASE = (process.env.VITE_WORDPRESS_BASE || 'https://codakid.com').replace(/\/$/, '');
const MAX_CANDIDATES = 8;

export function pageSpeedConfigured() {
  return Boolean(process.env.PAGESPEED_API_KEY);
}

export async function handler(event) {
  try {
    const user = await requireUser(event);
    const sql = getSql();

    if (event.httpMethod === 'POST') {
      requireCsrf(event);
      if (!pageSpeedConfigured()) throw new HttpError(500, 'PAGESPEED_API_KEY is not configured.');
      const body = parseJsonBody(event);
      const url = sanitizeUrl(body.url);
      if (!url) throw new HttpError(400, 'A valid page URL is required.');
      const strategy = body.strategy === 'desktop' ? 'desktop' : 'mobile';
      const result = await runPageSpeed(url, strategy);
      await storePageSpeedResult(sql, result, strategy);
      await audit(event, user, 'pagespeed.run', result.url, { strategy, performance: result.performance });
      return json(200, { configured: true, result: { ...result, strategy } }, { 'cache-control': 'private, no-store' });
    }

    // GET: candidate pages + latest cached results.
    const candidates = await buildCandidates();
    const cached = await sql`
      select distinct on (url, strategy)
        url, strategy, performance, seo, accessibility, best_practices,
        lcp_ms, cls_x1000, fcp_ms, ttfb_ms, field_lcp_ms, field_cls_x1000, field_inp_ms,
        overall_category, created_at
      from pagespeed_snapshots
      order by url, strategy, created_at desc
    `;
    // Daily history (mobile), averaged across pages, for the Core Web Vitals trend.
    const historyRows = await sql`
      select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
             round(avg(performance))::int as performance,
             round(avg(lcp_ms))::int as lcp_ms,
             round(avg(cls_x1000))::int as cls_x1000
      from pagespeed_snapshots
      where strategy = 'mobile' and performance is not null
      group by day
      order by day asc
      limit 60
    `;
    const results = cached.map(publicResult);
    return json(
      200,
      {
        configured: pageSpeedConfigured(),
        generatedAt: new Date().toISOString(),
        candidates,
        latest: buildLatestSummary(results),
        results,
        history: historyRows.map((row) => ({
          date: row.day,
          performance: row.performance,
          lcpMs: row.lcp_ms,
          clsX1000: row.cls_x1000,
        })),
      },
      { 'cache-control': 'private, no-store' },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function storePageSpeedResult(sql, result, strategy) {
  await sql`
    insert into pagespeed_snapshots (
      id, url, strategy, performance, seo, accessibility, best_practices,
      lcp_ms, cls_x1000, fcp_ms, ttfb_ms,
      field_lcp_ms, field_cls_x1000, field_inp_ms, overall_category, data
    ) values (
      ${randomUUID()}, ${result.url}, ${strategy}, ${result.performance}, ${result.seo}, ${result.accessibility}, ${result.bestPractices},
      ${result.lcpMs}, ${result.clsX1000}, ${result.fcpMs}, ${result.ttfbMs},
      ${result.fieldLcpMs}, ${result.fieldClsX1000}, ${result.fieldInpMs}, ${result.overallCategory}, ${JSON.stringify(result.extra || {})}
    )
  `;
  await sql`delete from pagespeed_snapshots where created_at < now() - interval '180 days'`;
}

export async function buildCandidates() {
  const candidates = [{ url: `${WP_BASE}/`, title: 'Homepage' }];
  try {
    const snapshot = await loadContentSnapshot({ forceRefresh: false });
    const pillars = (snapshot.pillars || []).slice(0, MAX_CANDIDATES - 1);
    for (const pillar of pillars) {
      if (pillar.url) candidates.push({ url: pillar.url, title: pillar.title || pillar.url });
    }
  } catch {
    // Homepage-only candidate set if the crawl is unavailable.
  }
  // De-dupe by URL.
  const seen = new Set();
  return candidates.filter((c) => {
    const key = sanitizeUrl(c.url);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_CANDIDATES);
}

export async function runPageSpeed(url, strategy) {
  const params = new URLSearchParams({ url, strategy, key: process.env.PAGESPEED_API_KEY });
  for (const category of ['performance', 'seo', 'accessibility', 'best-practices']) {
    params.append('category', category);
  }
  const response = await fetch(`${PSI_ENDPOINT}?${params.toString()}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const upstreamMessage = payload?.error?.message || '';
    if (/api key not valid/i.test(upstreamMessage)) {
      throw new HttpError(
        502,
        'PageSpeed API key is invalid. Replace PAGESPEED_API_KEY with a Google Cloud API key that has the PageSpeed Insights API enabled.',
      );
    }
    if (response.status === 429) {
      throw new HttpError(429, 'PageSpeed quota is temporarily exhausted. Try again later or review the API key quota in Google Cloud.');
    }
    throw new HttpError(502, upstreamMessage || `PageSpeed request failed (${response.status}).`);
  }
  const lh = payload.lighthouseResult || {};
  const cats = lh.categories || {};
  const audits = lh.audits || {};
  const field = payload.loadingExperience?.metrics || {};

  return {
    url: payload.id || url,
    performance: pct(cats.performance?.score),
    seo: pct(cats.seo?.score),
    accessibility: pct(cats.accessibility?.score),
    bestPractices: pct(cats['best-practices']?.score),
    lcpMs: numeric(audits['largest-contentful-paint']?.numericValue),
    clsX1000: numeric(audits['cumulative-layout-shift']?.numericValue, 1000),
    fcpMs: numeric(audits['first-contentful-paint']?.numericValue),
    ttfbMs: numeric(audits['server-response-time']?.numericValue),
    fieldLcpMs: field.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null,
    fieldClsX1000: field.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile ?? null,
    fieldInpMs: field.INTERACTION_TO_NEXT_PAINT?.percentile ?? null,
    overallCategory: payload.loadingExperience?.overall_category || '',
    extra: {
      totalBlockingTimeMs: numeric(audits['total-blocking-time']?.numericValue),
      speedIndexMs: numeric(audits['speed-index']?.numericValue),
      finalUrl: lh.finalUrl || lh.finalDisplayedUrl || url,
      fetchTime: lh.fetchTime || null,
    },
  };
}

function publicResult(row) {
  return {
    url: row.url,
    strategy: row.strategy,
    performance: row.performance,
    seo: row.seo,
    accessibility: row.accessibility,
    bestPractices: row.best_practices,
    lcpMs: row.lcp_ms,
    clsX1000: row.cls_x1000,
    fcpMs: row.fcp_ms,
    ttfbMs: row.ttfb_ms,
    fieldLcpMs: row.field_lcp_ms,
    fieldClsX1000: row.field_cls_x1000,
    fieldInpMs: row.field_inp_ms,
    overallCategory: row.overall_category,
    updatedAt: row.created_at,
  };
}

function buildLatestSummary(results) {
  if (!results.length) return null;
  const mobile = results.filter((result) => result.strategy === 'mobile');
  const scoped = mobile.length ? mobile : results;
  const latestTime = Math.max(
    ...scoped
      .map((result) => (result.updatedAt ? new Date(result.updatedAt).getTime() : 0))
      .filter((time) => Number.isFinite(time)),
  );
  return {
    resultCount: results.length,
    mobileCount: mobile.length,
    averagePerformance: average(scoped.map((result) => result.performance)),
    averageSeo: average(scoped.map((result) => result.seo)),
    averageAccessibility: average(scoped.map((result) => result.accessibility)),
    averageBestPractices: average(scoped.map((result) => result.bestPractices)),
    updatedAt: latestTime > 0 ? new Date(latestTime).toISOString() : null,
  };
}

function average(values) {
  const numericValues = values.filter((value) => value != null && Number.isFinite(Number(value))).map(Number);
  if (!numericValues.length) return null;
  return Math.round(numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length);
}

function pct(score) {
  if (score == null) return null;
  return Math.round(Number(score) * 100);
}

function numeric(value, multiplier = 1) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return Math.round(Number(value) * multiplier);
}

function sanitizeUrl(input) {
  if (!input) return '';
  try {
    const url = new URL(String(input).trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString();
  } catch {
    return '';
  }
}
