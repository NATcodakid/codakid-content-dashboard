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
      const serpRows = keywords.length
        ? await sql`
            select *
            from serp_snapshots
            where keyword = any(${keywords})
            order by keyword asc, fetched_at desc
          `
        : [];
      const serpByKeyword = groupSerpRows(serpRows);
      return json(
        200,
        {
          keywords: rows.map((row) => publicKeyword(row, serpByKeyword.get(row.keyword) || [])),
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

function publicKeyword(row, serpRows) {
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
  };
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
