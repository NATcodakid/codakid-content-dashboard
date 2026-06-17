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
    return json(
      200,
      {
        configured: pageSpeedConfigured(),
        generatedAt: new Date().toISOString(),
        candidates,
        results: cached.map(publicResult),
      },
      { 'cache-control': 'private, no-store' },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

async function buildCandidates() {
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

async function runPageSpeed(url, strategy) {
  const params = new URLSearchParams({ url, strategy, key: process.env.PAGESPEED_API_KEY });
  for (const category of ['performance', 'seo', 'accessibility', 'best-practices']) {
    params.append('category', category);
  }
  const response = await fetch(`${PSI_ENDPOINT}?${params.toString()}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(502, payload?.error?.message || `PageSpeed request failed (${response.status}).`);
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
