import { createHash, randomUUID } from 'node:crypto';
import {
  assertRateLimit,
  audit,
  ensureAuthSchema,
  errorResponse,
  getSql,
  HttpError,
  json,
  parseJsonBody,
  requireAdmin,
  requireCsrf,
  requireUser,
} from './_auth.mjs';
import { openAiJson } from './ai-workbench.mjs';

const RECOMMENDATIONS = new Set(['redirect', 'merge-redirect', 'differentiate', 'canonical', 'internal-link', 'keep-separate', 'review']);
const REVIEW_STATUSES = new Set(['new', 'reviewed', 'approved', 'rejected', 'deferred', 'resolved']);
const STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'best', 'for', 'from', 'guide', 'how', 'in', 'is', 'of', 'on', 'the', 'to', 'ultimate', 'what', 'with', 'your', 'kids']);

export async function handler(event) {
  try {
    if (event.httpMethod === 'GET') {
      await requireUser(event);
      return json(200, await loadCannibalizationReport(), { 'cache-control': 'private, no-store' });
    }

    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
    requireCsrf(event);
    const user = await requireAdmin(event);
    const body = parseJsonBody(event);
    const action = String(body.action || 'scan');

    if (action === 'scan') {
      await assertRateLimit(`cannibalization-scan:${user.id}`, { limit: 6, windowSeconds: 24 * 60 * 60 });
      const report = await runCannibalizationScan(user.email);
      await audit(event, user, 'cannibalization.scan', report.scan?.id || '', report.summary);
      return json(200, report, { 'cache-control': 'private, no-store' });
    }

    if (action === 'review') {
      const recommendation = await reviewRecommendation(user, body);
      await audit(event, user, 'cannibalization.review', recommendation.id, {
        status: recommendation.status,
        owner: recommendation.owner,
      });
      return json(200, { recommendation }, { 'cache-control': 'private, no-store' });
    }

    throw new HttpError(400, 'Unknown cannibalization action.');
  } catch (error) {
    return errorResponse(error);
  }
}

export async function scheduled() {
  await ensureAuthSchema();
  await runCannibalizationScan('scheduled');
}

export async function runCannibalizationScan(createdBy = 'scheduled') {
  const sql = getSql();
  const scanId = randomUUID();
  const source = await loadSourceData(sql);
  const candidates = buildCandidates(source).slice(0, 80);
  const fallback = { results: candidates.map(fallbackClassification) };
  let ai = { mode: 'fallback', model: '', data: fallback, error: '' };

  if (candidates.length) {
    ai = await openAiJson({
      fallback,
      maxOutputTokens: 1400,
      timeoutMs: 8000,
      system: 'You are a conservative technical SEO strategist. Evaluate whether CodaKid pages satisfy the same user intent. Recommend redirects only when intent is substantially the same and one destination is clearly stronger. Never invent metrics. Prefer differentiate, internal-link, keep-separate, or review when evidence is ambiguous.',
      user: `Classify these highest-impact keyword-cannibalization groups using only the supplied evidence. Return JSON exactly like {"results":[{"id":"","sameIntent":true,"intentLabel":"informational tutorial","winnerUrl":"","recommendation":"redirect|merge-redirect|differentiate|canonical|internal-link|keep-separate|review","severity":"high|medium|low","confidence":0,"reasoning":"","preserveNotes":[""]}]}. winnerUrl must be one of the group's sourceUrls. Keep confidence below 80 when intent is uncertain.\n\n${JSON.stringify(candidates.slice(0, 10).map(aiCandidate))}`,
    });
  }

  const aiById = new Map((Array.isArray(ai.data?.results) ? ai.data.results : []).map((result) => [String(result.id), result]));
  const normalized = candidates.map((candidate) => normalizeClassification(candidate, aiById.get(candidate.id)));
  const summary = summarize(normalized);

  await sql`
    insert into cannibalization_scans (
      id, source_start_date, source_end_date, candidate_count, conflict_count, model, summary, error, created_by
    ) values (
      ${scanId}, ${source.startDate || null}, ${source.endDate || null}, ${candidates.length},
      ${normalized.filter((row) => row.recommendation !== 'keep-separate').length},
      ${ai.mode === 'openai' ? ai.model : ai.mode}, ${JSON.stringify(summary)}, ${String(ai.error || '').slice(0, 1000)}, ${createdBy}
    )
  `;

  for (let offset = 0; offset < normalized.length; offset += 10) {
    const batch = normalized.slice(offset, offset + 10);
    await Promise.all(batch.map((row) => sql`
      insert into cannibalization_recommendations (
        id, fingerprint, scan_id, source_urls, winner_url, intent_label, shared_queries, evidence,
        recommendation, severity, confidence, reasoning, preserve_notes
      ) values (
        ${randomUUID()}, ${row.fingerprint}, ${scanId}, ${JSON.stringify(row.sourceUrls)}, ${row.winnerUrl},
        ${row.intentLabel}, ${JSON.stringify(row.sharedQueries)}, ${JSON.stringify(row.evidence)},
        ${row.recommendation}, ${row.severity}, ${row.confidence}, ${row.reasoning}, ${JSON.stringify(row.preserveNotes)}
      )
      on conflict (fingerprint) do update set
        scan_id = excluded.scan_id,
        source_urls = excluded.source_urls,
        winner_url = excluded.winner_url,
        intent_label = excluded.intent_label,
        shared_queries = excluded.shared_queries,
        evidence = excluded.evidence,
        recommendation = excluded.recommendation,
        severity = excluded.severity,
        confidence = excluded.confidence,
        reasoning = excluded.reasoning,
        preserve_notes = excluded.preserve_notes,
        status = case when cannibalization_recommendations.status = 'resolved' then 'new' else cannibalization_recommendations.status end,
        last_seen_at = now(),
        resolved_at = null,
        updated_at = now()
    `));
  }

  await sql`
    update cannibalization_recommendations
    set resolved_at = now(),
        status = case when status in ('new', 'reviewed', 'deferred') then 'resolved' else status end,
        updated_at = now()
    where scan_id is distinct from ${scanId}
      and resolved_at is null
  `;

  await sql`delete from cannibalization_scans where created_at < now() - interval '730 days'`;
  return loadCannibalizationReport();
}

async function loadSourceData(sql) {
  const [wpRows, gscRows, ga4Rows] = await Promise.all([
    sql`select data, created_at from wordpress_snapshots where ok = true order by created_at desc limit 1`,
    sql`select data, start_date, end_date, created_at from google_search_console_snapshots where dimensions = 'page,query' order by created_at desc limit 1`,
    sql`select data, start_date, end_date, created_at from ga4_snapshots where dimensions = 'pagePath,pageTitle' order by created_at desc limit 1`,
  ]);
  const posts = wpRows[0]?.data?.allPosts || [];
  if (!posts.length) throw new HttpError(409, 'A WordPress crawl is required before cannibalization analysis can run.');
  const gsc = gscRows[0];
  if (!gsc?.data?.rows?.length) throw new HttpError(409, 'Search Console page and query rows are required before cannibalization analysis can run.');
  return {
    posts,
    gscRows: gsc.data.rows,
    ga4: normalizeGa4Pages(ga4Rows[0]?.data),
    startDate: dateOnly(gsc.start_date),
    endDate: dateOnly(gsc.end_date),
    updatedAt: gsc.created_at,
  };
}

function buildCandidates(source) {
  const posts = new Map(source.posts.map((post) => [normalizeUrl(post.url), post]));
  const queryPages = new Map();
  for (const row of source.gscRows) {
    const page = normalizeUrl(row.keys?.[0]);
    const query = String(row.keys?.[1] || '').trim().toLowerCase();
    if (!page || !query || !posts.has(page) || Number(row.impressions || 0) < 2) continue;
    if (!queryPages.has(query)) queryPages.set(query, new Map());
    const pages = queryPages.get(query);
    const existing = pages.get(page) || { url: page, clicks: 0, impressions: 0, weightedPosition: 0 };
    const impressions = Number(row.impressions || 0);
    existing.clicks += Number(row.clicks || 0);
    existing.impressions += impressions;
    existing.weightedPosition += Number(row.position || 0) * impressions;
    pages.set(page, existing);
  }

  const pairs = new Map();
  for (const [query, rawPages] of queryPages) {
    const pages = [...rawPages.values()]
      .map((page) => ({ ...page, position: page.impressions ? page.weightedPosition / page.impressions : 0 }))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 6);
    if (pages.length < 2) continue;
    for (let left = 0; left < pages.length - 1; left += 1) {
      for (let right = left + 1; right < pages.length; right += 1) {
        const sourceUrls = [pages[left].url, pages[right].url].sort();
        const key = sourceUrls.join('|');
        if (!pairs.has(key)) pairs.set(key, { sourceUrls, queries: [] });
        pairs.get(key).queries.push({ query, pages: [pages[left], pages[right]], impressions: pages[left].impressions + pages[right].impressions, clicks: pages[left].clicks + pages[right].clicks });
      }
    }
  }

  const candidates = [];
  for (const pair of pairs.values()) {
    const sharedImpressions = pair.queries.reduce((sum, query) => sum + query.impressions, 0);
    if (pair.queries.length < 2 && sharedImpressions < 50) continue;
    const pageEvidence = pair.sourceUrls.map((url) => pageEvidenceFor(url, posts.get(url), pair.queries, source.ga4));
    const titleSimilarity = jaccard(tokenize(pageEvidence[0].title), tokenize(pageEvidence[1].title));
    const positionGap = average(pair.queries.map((query) => Math.abs(query.pages[0].position - query.pages[1].position)));
    const overlapScore = clamp(Math.round(pair.queries.length * 7 + Math.log10(sharedImpressions + 1) * 15 + titleSimilarity * 28 + Math.max(0, 12 - positionGap)), 0, 100);
    const winner = [...pageEvidence].sort((a, b) => winnerScore(b) - winnerScore(a))[0];
    const id = createHash('sha256').update(pair.sourceUrls.join('|')).digest('hex').slice(0, 20);
    candidates.push({
      id,
      fingerprint: id,
      sourceUrls: pair.sourceUrls,
      winnerUrl: winner.url,
      sharedQueries: pair.queries.sort((a, b) => b.impressions - a.impressions).slice(0, 12).map((query) => ({ query: query.query, impressions: Math.round(query.impressions), clicks: Math.round(query.clicks) })),
      evidence: {
        period: { startDate: source.startDate, endDate: source.endDate },
        pages: pageEvidence,
        sharedQueryCount: pair.queries.length,
        sharedImpressions: Math.round(sharedImpressions),
        sharedClicks: Math.round(pair.queries.reduce((sum, query) => sum + query.clicks, 0)),
        titleSimilarity: Math.round(titleSimilarity * 100),
        averagePositionGap: Number(positionGap.toFixed(1)),
        overlapScore,
      },
    });
  }
  return candidates.sort((a, b) => b.evidence.overlapScore - a.evidence.overlapScore || b.evidence.sharedImpressions - a.evidence.sharedImpressions);
}

function pageEvidenceFor(url, post, queries, ga4) {
  const metrics = queries.flatMap((query) => query.pages.filter((page) => page.url === url));
  const impressions = metrics.reduce((sum, metric) => sum + metric.impressions, 0);
  const weightedPosition = impressions
    ? metrics.reduce((sum, metric) => sum + metric.position * metric.impressions, 0) / impressions
    : 0;
  const analytics = ga4.get(pathFromUrl(url)) || {};
  return {
    url,
    title: post?.title || pathFromUrl(url),
    excerpt: String(post?.excerpt || '').slice(0, 260),
    cluster: post?.cluster || '',
    clicks: Math.round(metrics.reduce((sum, metric) => sum + metric.clicks, 0)),
    impressions: Math.round(impressions),
    position: Number(weightedPosition.toFixed(1)),
    sessions: Number(analytics.sessions || 0),
    views: Number(analytics.views || 0),
    inboundCount: Number(post?.inboundCount || 0),
    health: Number(post?.health || 0),
    pillarScore: Number(post?.pillarScore || 0),
    confirmedPillar: Boolean(post?.confirmedPillar),
    modified: post?.modified || post?.date || '',
  };
}

function fallbackClassification(candidate) {
  const [first, second] = candidate.evidence.pages;
  const sameIntent = candidate.evidence.titleSimilarity >= 32 || candidate.evidence.sharedQueryCount >= 5;
  const winner = candidate.evidence.pages.find((page) => page.url === candidate.winnerUrl) || first;
  const loser = winner.url === first.url ? second : first;
  const winnerDemand = winner.clicks + winner.sessions;
  const loserDemand = loser.clicks + loser.sessions;
  let recommendation = 'internal-link';
  if (!sameIntent) recommendation = 'keep-separate';
  else if (loserDemand <= Math.max(3, winnerDemand * 0.2) && candidate.evidence.titleSimilarity >= 55) recommendation = 'redirect';
  else if (winner.confirmedPillar || candidate.evidence.titleSimilarity >= 42) recommendation = 'merge-redirect';
  else if (winnerDemand > 10 && loserDemand > 10) recommendation = 'differentiate';
  const confidence = clamp(Math.round(42 + candidate.evidence.overlapScore * 0.38 + (sameIntent ? 7 : 0)), 45, 87);
  return {
    id: candidate.id,
    sameIntent,
    intentLabel: inferIntent(candidate.sharedQueries.map((query) => query.query)),
    winnerUrl: winner.url,
    recommendation,
    severity: candidate.evidence.overlapScore >= 72 ? 'high' : candidate.evidence.overlapScore >= 48 ? 'medium' : 'low',
    confidence,
    reasoning: sameIntent
      ? `${candidate.evidence.sharedQueryCount} shared queries indicate substantially overlapping intent. ${winner.title} has the stronger combined search, engagement, and authority signals.`
      : 'The pages share some query language but appear to answer meaningfully different needs. Preserve both and clarify targeting.',
    preserveNotes: recommendation.includes('redirect') ? [`Review ${loser.title} for unique examples, FAQs, and links before consolidation.`] : [],
  };
}

function normalizeClassification(candidate, raw) {
  const fallback = fallbackClassification(candidate);
  const sourceUrls = new Set(candidate.sourceUrls);
  const recommendation = RECOMMENDATIONS.has(String(raw?.recommendation)) ? String(raw.recommendation) : fallback.recommendation;
  return {
    ...candidate,
    winnerUrl: sourceUrls.has(normalizeUrl(raw?.winnerUrl)) ? normalizeUrl(raw.winnerUrl) : fallback.winnerUrl,
    intentLabel: String(raw?.intentLabel || fallback.intentLabel).slice(0, 120),
    recommendation,
    severity: ['high', 'medium', 'low'].includes(String(raw?.severity)) ? String(raw.severity) : fallback.severity,
    confidence: clamp(Math.round(Number(raw?.confidence || fallback.confidence)), 0, 100),
    reasoning: String(raw?.reasoning || fallback.reasoning).slice(0, 1200),
    preserveNotes: Array.isArray(raw?.preserveNotes) ? raw.preserveNotes.map((note) => String(note).slice(0, 300)).slice(0, 8) : fallback.preserveNotes,
  };
}

function aiCandidate(candidate) {
  return {
    id: candidate.id,
    sourceUrls: candidate.sourceUrls,
    sharedQueries: candidate.sharedQueries.slice(0, 8),
    evidence: candidate.evidence,
  };
}

async function loadCannibalizationReport() {
  const sql = getSql();
  const [scanRows, recommendationRows, trendRows] = await Promise.all([
    sql`select * from cannibalization_scans order by created_at desc limit 1`,
    sql`select * from cannibalization_recommendations order by (resolved_at is null) desc, confidence desc, last_seen_at desc limit 200`,
    sql`select id, source_start_date, source_end_date, candidate_count, conflict_count, model, summary, error, created_at from cannibalization_scans order by created_at desc limit 16`,
  ]);
  const recommendations = recommendationRows.map(publicRecommendation);
  const active = recommendations.filter((row) => !row.resolvedAt);
  return {
    generatedAt: new Date().toISOString(),
    configured: Boolean(process.env.OPENAI_API_KEY),
    scan: scanRows[0] ? publicScan(scanRows[0]) : null,
    summary: summarize(active),
    recommendations,
    trend: trendRows.map(publicScan),
  };
}

async function reviewRecommendation(user, body) {
  const id = String(body.id || '').trim();
  const status = String(body.status || '').trim();
  if (!id) throw new HttpError(400, 'Recommendation id is required.');
  if (!REVIEW_STATUSES.has(status)) throw new HttpError(400, 'Invalid review status.');
  const sql = getSql();
  const rows = await sql`
    update cannibalization_recommendations
    set status = ${status},
        owner = ${String(body.owner || '').slice(0, 160)},
        notes = ${String(body.notes || '').slice(0, 2000)},
        reviewed_by = ${user.email},
        reviewed_at = now(),
        resolved_at = case when ${status} = 'resolved' then now() else resolved_at end,
        updated_at = now()
    where id = ${id}
    returning *
  `;
  if (!rows[0]) throw new HttpError(404, 'Cannibalization recommendation not found.');
  return publicRecommendation(rows[0]);
}

function summarize(rows) {
  const active = rows.filter((row) => !row.resolvedAt && row.recommendation !== 'keep-separate');
  return {
    total: active.length,
    high: active.filter((row) => row.severity === 'high').length,
    redirects: active.filter((row) => row.recommendation === 'redirect' || row.recommendation === 'merge-redirect').length,
    review: active.filter((row) => row.status === 'new' || row.status === 'deferred').length,
    approved: active.filter((row) => row.status === 'approved').length,
    resolved: rows.filter((row) => row.resolvedAt || row.status === 'resolved').length,
  };
}

function publicRecommendation(row) {
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    sourceUrls: row.source_urls || [],
    winnerUrl: row.winner_url,
    intentLabel: row.intent_label,
    sharedQueries: row.shared_queries || [],
    evidence: row.evidence || {},
    recommendation: row.recommendation,
    severity: row.severity,
    confidence: Number(row.confidence || 0),
    reasoning: row.reasoning,
    preserveNotes: row.preserve_notes || [],
    status: row.status,
    owner: row.owner,
    notes: row.notes,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    resolvedAt: row.resolved_at,
  };
}

function publicScan(row) {
  return {
    id: row.id,
    startDate: dateOnly(row.source_start_date),
    endDate: dateOnly(row.source_end_date),
    candidateCount: Number(row.candidate_count || 0),
    conflictCount: Number(row.conflict_count || 0),
    model: row.model,
    summary: row.summary || {},
    error: row.error,
    createdAt: row.created_at,
  };
}

function normalizeGa4Pages(data) {
  const map = new Map();
  const dimensions = (data?.dimensionHeaders || []).map((header) => header.name);
  const metrics = (data?.metricHeaders || []).map((header) => header.name);
  for (const row of data?.rows || []) {
    const dimensionValues = Object.fromEntries(dimensions.map((name, index) => [name, row.dimensionValues?.[index]?.value || '']));
    const metricValues = Object.fromEntries(metrics.map((name, index) => [name, Number(row.metricValues?.[index]?.value || 0)]));
    map.set(normalizePath(dimensionValues.pagePath), { sessions: metricValues.sessions || 0, views: metricValues.screenPageViews || 0 });
  }
  return map;
}

function winnerScore(page) {
  return page.clicks * 4 + page.sessions * 0.25 + page.impressions * 0.01 + page.inboundCount * 3 + page.health + page.pillarScore * 0.4 + (page.confirmedPillar ? 80 : 0);
}

function inferIntent(queries) {
  const text = queries.join(' ');
  if (/\b(best|top|versus|vs|review|classes|course|subscription)\b/i.test(text)) return 'commercial comparison';
  if (/\b(how|tutorial|make|build|install|code)\b/i.test(text)) return 'informational tutorial';
  if (/\b(what|why|meaning|definition)\b/i.test(text)) return 'informational explanation';
  return 'informational discovery';
}

function tokenize(value) {
  return new Set(String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word)));
}

function jaccard(left, right) {
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const value of left) if (right.has(value)) overlap += 1;
  return overlap / (left.size + right.size - overlap);
}

function normalizeUrl(value) {
  try {
    const url = new URL(String(value || ''), 'https://codakid.com');
    url.search = '';
    url.hash = '';
    return `${url.origin}${url.pathname}`.replace(/\/$/, '').toLowerCase();
  } catch {
    return String(value || '').replace(/\/$/, '').toLowerCase();
  }
}

function pathFromUrl(value) {
  try { return normalizePath(new URL(value).pathname); } catch { return normalizePath(value); }
}

function normalizePath(value) {
  const path = String(value || '').split('?')[0].replace(/\/$/, '');
  return path || '/';
}

function dateOnly(value) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length : 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
