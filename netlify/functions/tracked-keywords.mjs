import { randomUUID } from 'node:crypto';
import {
  audit,
  errorResponse,
  getSql,
  json,
  parseJsonBody,
  requireCsrf,
  requireUser,
  HttpError,
} from './_auth.mjs';

const VALID_STATUSES = new Set(['active', 'paused', 'archived']);
const VALID_CADENCES = new Set(['weekly', 'manual']);

export async function handler(event) {
  try {
    const user = await requireUser(event);
    const sql = getSql();

    if (event.httpMethod === 'GET') {
      const rows = await sql`
        select *
        from tracked_keywords
        where status <> 'archived'
        order by status asc, priority desc, keyword asc
      `;
      const keywords = rows.map((row) => row.keyword);
      const [serpRows, gscRows] = await Promise.all([
        keywords.length ? sql`
            select *
            from serp_snapshots
            where keyword = any(${keywords})
            order by keyword asc, fetched_at desc
          ` : [],
        sql`
          select data, start_date, end_date, created_at
          from google_search_console_snapshots
          where dimensions = 'query'
          order by created_at desc
          limit 1
        `,
      ]);
      const serpByKeyword = groupSerpRows(serpRows);
      const demand = buildDemandMap(gscRows[0]?.data?.rows || [], keywords);
      return json(
        200,
        {
          period: gscRows[0] ? { startDate: gscRows[0].start_date, endDate: gscRows[0].end_date, updatedAt: gscRows[0].created_at } : null,
          keywords: rows.map((row) => publicKeyword(row, serpByKeyword.get(row.keyword) || [], demand.get(row.keyword.toLowerCase()))),
        },
        { 'cache-control': 'private, no-store' },
      );
    }

    if (event.httpMethod === 'POST') {
      requireCsrf(event);
      const body = parseJsonBody(event);
      const input = normalizeInput(body);
      const rows = await sql`
        insert into tracked_keywords (
          id,
          keyword,
          cluster,
          target_url,
          intent,
          priority,
          cadence,
          status,
          source,
          notes,
          created_by,
          updated_at
        )
        values (
          ${randomUUID()},
          ${input.keyword},
          ${input.cluster},
          ${input.targetUrl},
          ${input.intent},
          ${input.priority},
          ${input.cadence},
          ${input.status},
          ${input.source},
          ${input.notes},
          ${user.email},
          now()
        )
        on conflict (keyword) do update set
          cluster = excluded.cluster,
          target_url = excluded.target_url,
          intent = excluded.intent,
          priority = excluded.priority,
          cadence = excluded.cadence,
          status = excluded.status,
          source = case when tracked_keywords.source = 'seed' then tracked_keywords.source else excluded.source end,
          notes = excluded.notes,
          updated_at = now()
        returning *
      `;
      await audit(event, user, 'keyword.upsert', input.keyword, input);
      return json(200, { keyword: publicKeyword(rows[0], []) }, { 'cache-control': 'private, no-store' });
    }

    if (event.httpMethod === 'PATCH') {
      requireCsrf(event);
      const body = parseJsonBody(event);
      const id = String(body.id || '').trim();
      if (!id) throw new HttpError(400, 'Keyword id is required.');
      const input = normalizeInput(body, { partial: true });
      const rows = await sql`
        update tracked_keywords
        set
          cluster = coalesce(${input.cluster ?? null}, cluster),
          target_url = coalesce(${input.targetUrl ?? null}, target_url),
          intent = coalesce(${input.intent ?? null}, intent),
          priority = coalesce(${input.priority ?? null}, priority),
          cadence = coalesce(${input.cadence ?? null}, cadence),
          status = coalesce(${input.status ?? null}, status),
          notes = coalesce(${input.notes ?? null}, notes),
          updated_at = now()
        where id = ${id}
        returning *
      `;
      if (!rows[0]) throw new HttpError(404, 'Tracked keyword not found.');
      await audit(event, user, 'keyword.update', rows[0].keyword, input);
      return json(200, { keyword: publicKeyword(rows[0], []) }, { 'cache-control': 'private, no-store' });
    }

    if (event.httpMethod === 'DELETE') {
      requireCsrf(event);
      const body = parseJsonBody(event);
      const id = String(body.id || '').trim();
      if (!id) throw new HttpError(400, 'Keyword id is required.');
      const rows = await sql`
        update tracked_keywords
        set status = 'archived', updated_at = now()
        where id = ${id}
        returning keyword
      `;
      await audit(event, user, 'keyword.archive', rows[0]?.keyword || id);
      return json(200, { ok: true }, { 'cache-control': 'private, no-store' });
    }

    return json(405, { error: 'Method not allowed.' });
  } catch (error) {
    return errorResponse(error);
  }
}

function normalizeInput(body, { partial = false } = {}) {
  const keyword = clean(body.keyword);
  if (!partial && !keyword) throw new HttpError(400, 'Keyword is required.');
  const priority = body.priority === undefined ? undefined : Math.max(0, Math.min(100, Math.round(Number(body.priority || 0))));
  const cadence = body.cadence === undefined ? undefined : clean(body.cadence || 'weekly');
  const status = body.status === undefined ? undefined : clean(body.status || 'active');
  if (cadence !== undefined && !VALID_CADENCES.has(cadence)) throw new HttpError(400, 'Invalid tracking cadence.');
  if (status !== undefined && !VALID_STATUSES.has(status)) throw new HttpError(400, 'Invalid keyword status.');
  return {
    keyword,
    cluster: body.cluster === undefined ? undefined : clean(body.cluster),
    targetUrl: body.targetUrl === undefined && body.target_url === undefined ? undefined : clean(body.targetUrl || body.target_url),
    intent: body.intent === undefined ? undefined : clean(body.intent || 'informational'),
    priority: priority ?? (partial ? undefined : 50),
    cadence: cadence ?? (partial ? undefined : 'weekly'),
    status: status ?? (partial ? undefined : 'active'),
    source: body.source === undefined ? (partial ? undefined : 'manual') : clean(body.source || 'manual'),
    notes: body.notes === undefined ? undefined : clean(body.notes),
  };
}

function clean(value) {
  return String(value || '').trim();
}

function groupSerpRows(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.keyword)) map.set(row.keyword, []);
    map.get(row.keyword).push(row);
  }
  return map;
}

function publicKeyword(row, serpRows, demand = null) {
  const latest = serpRows[0] || null;
  const previous = serpRows[1] || null;
  const latestPosition = latest?.codakid_position || null;
  const previousPosition = previous?.codakid_position || null;
  const positionChange = latestPosition && previousPosition ? previousPosition - latestPosition : null;
  return {
    id: row.id,
    keyword: row.keyword,
    cluster: row.cluster,
    targetUrl: row.target_url,
    intent: row.intent,
    priority: row.priority,
    cadence: row.cadence,
    status: row.status,
    source: row.source,
    notes: row.notes,
    lastTrackedAt: row.last_tracked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    latestSerp: latest
      ? {
          id: latest.id,
          position: latestPosition,
          url: latest.codakid_url,
          fetchedAt: latest.fetched_at,
          organic: latest.organic || [],
          competitors: competitorDomains(latest.organic || []),
        }
      : null,
    trend: serpRows
      .slice()
      .reverse()
      .map((serp) => ({
        position: serp.codakid_position,
        url: serp.codakid_url,
        fetchedAt: serp.fetched_at,
      })),
    previousPosition,
    positionChange,
    demand: {
      score: demand?.score || 0,
      clicks: demand?.clicks || 0,
      impressions: demand?.impressions || 0,
      ctr: demand?.ctr || 0,
      gscPosition: demand?.position || 0,
    },
    difficulty: estimateDifficulty(latest, latestPosition),
    opportunityScore: opportunityScore(demand, latestPosition),
    serpFeatures: {
      peopleAlsoAsk: (latest?.people_also_ask || []).length,
      relatedSearches: (latest?.related_searches || []).length,
    },
  };
}

function buildDemandMap(rows, keywords) {
  const wanted = new Set(keywords.map((keyword) => keyword.toLowerCase()));
  const matches = rows
    .map((row) => ({
      keyword: String(row.keys?.[0] || '').toLowerCase(),
      clicks: Number(row.clicks || 0),
      impressions: Number(row.impressions || 0),
      ctr: Number(row.ctr || 0),
      position: Number(row.position || 0),
    }))
    .filter((row) => wanted.has(row.keyword));
  const maxLog = Math.max(1, ...matches.map((row) => Math.log10(row.impressions + 1)));
  return new Map(matches.map((row) => [row.keyword, { ...row, score: Math.round((Math.log10(row.impressions + 1) / maxLog) * 100) }]));
}

function estimateDifficulty(latest, position) {
  if (!latest) return { score: null, label: 'Waiting for SERP', basis: 'No live SERP snapshot yet' };
  const competitors = (latest.organic || []).filter((result) => result.domain && result.domain !== 'codakid.com').length;
  const rankPenalty = position ? Math.min(35, Number(position) * 3) : 35;
  const score = Math.max(0, Math.min(100, Math.round(18 + competitors * 4 + rankPenalty)));
  return {
    score,
    label: score >= 70 ? 'Hard' : score >= 45 ? 'Moderate' : 'Approachable',
    basis: 'Estimate from the current top 10 and CodaKid position',
  };
}

function opportunityScore(demand, position) {
  if (!demand) return 0;
  const rankGap = position ? Math.min(1, Math.max(0.15, Number(position) / 20)) : 1;
  const ctrGap = demand.impressions ? Math.max(0.2, 1 - demand.ctr / 0.12) : 0.2;
  return Math.round(Math.min(100, demand.score * 0.65 + rankGap * 20 + ctrGap * 15));
}

function competitorDomains(organic) {
  return organic
    .filter((result) => result.domain && result.domain !== 'codakid.com')
    .slice(0, 5)
    .map((result) => ({
      domain: result.domain,
      position: result.position,
      title: result.title,
      link: result.link,
    }));
}
