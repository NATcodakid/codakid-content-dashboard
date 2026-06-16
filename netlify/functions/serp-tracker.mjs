import { randomUUID } from 'node:crypto';
import {
  assertRateLimit,
  audit,
  errorResponse,
  getSql,
  json,
  parseJsonBody,
  requireCsrf,
  requireUser,
  HttpError,
} from './_auth.mjs';

const SERPER_ENDPOINT = 'https://google.serper.dev/search';
const MAX_KEYWORDS_PER_REQUEST = 5;
const CACHE_HOURS = 168;

export async function handler(event) {
  try {
    const user = await requireUser(event);
    const sql = getSql();

    if (event.httpMethod === 'GET') {
      const keywords = parseKeywords(event.queryStringParameters?.keywords || event.queryStringParameters?.keyword || '');
      const rows = keywords.length
        ? await sql`
            select distinct on (keyword)
              *
            from serp_snapshots
            where keyword = any(${keywords})
            order by keyword, fetched_at desc
          `
        : await sql`
            select distinct on (keyword)
              *
            from serp_snapshots
            order by keyword, fetched_at desc
            limit 50
          `;
      const trendRows = keywords.length
        ? await sql`
            select keyword, codakid_position, codakid_url, fetched_at
            from serp_snapshots
            where keyword = any(${keywords})
            order by keyword asc, fetched_at asc
          `
        : [];
      return json(
        200,
        {
          configured: serperConfigured(),
          snapshots: rows.map(publicSerpSnapshot),
          trend: trendRows.map((row) => ({
            keyword: row.keyword,
            codakidPosition: row.codakid_position,
            codakidUrl: row.codakid_url,
            fetchedAt: row.fetched_at,
          })),
        },
        { 'cache-control': 'private, no-store' },
      );
    }

    if (event.httpMethod === 'POST') {
      requireCsrf(event);
      if (!serperConfigured()) throw new HttpError(500, 'SERPER_API_KEY is not configured.');
      const body = parseJsonBody(event);
      const keywords = parseKeywords(body.keywords || body.keyword).slice(0, MAX_KEYWORDS_PER_REQUEST);
      if (!keywords.length) throw new HttpError(400, 'At least one keyword is required.');

      const force = Boolean(body.force);
      if (force && user.role !== 'admin') throw new HttpError(403, 'Only admins can force a fresh SERP pull.');
      const location = String(body.location || 'United States').trim();
      const country = String(body.country || 'us').trim().toLowerCase();
      const language = String(body.language || 'en').trim().toLowerCase();
      const snapshots = [];

      for (const keyword of keywords) {
        const cached = !force ? await getFreshSnapshot(sql, keyword) : null;
        if (cached) {
          snapshots.push({ ...publicSerpSnapshot(cached), cached: true });
          continue;
        }
        await assertRateLimit(`serper:user:${user.id}`, { limit: 20, windowSeconds: 24 * 60 * 60 });
        await assertRateLimit('serper:global', { limit: 2000, windowSeconds: 31 * 24 * 60 * 60 });
        const saved = await trackSerpKeyword(sql, keyword, {
          location,
          country,
          language,
          createdBy: user.email,
        });
        await audit(event, user, 'serp.fetch', keyword, { force, location, country, language });
        snapshots.push({ ...publicSerpSnapshot(saved), cached: false });
      }

      return json(
        200,
        {
          configured: true,
          creditsUsed: snapshots.filter((snapshot) => !snapshot.cached).length,
          cacheHours: CACHE_HOURS,
          snapshots,
        },
        { 'cache-control': 'private, no-store' },
      );
    }

    return json(405, { error: 'Method not allowed.' });
  } catch (error) {
    return errorResponse(error);
  }
}

export function serperConfigured() {
  return Boolean(process.env.SERPER_API_KEY || process.env.SERPER_DEV_API_KEY);
}

async function getFreshSnapshot(sql, keyword) {
  const rows = await sql`
    select *
    from serp_snapshots
    where keyword = ${keyword}
      and fetched_at >= now() - (${CACHE_HOURS} * interval '1 hour')
    order by fetched_at desc
    limit 1
  `;
  return rows[0] || null;
}

export async function trackSerpKeyword(sql, keyword, { location = 'United States', country = 'us', language = 'en', createdBy = '' } = {}) {
  const data = await fetchSerper(keyword, { location, country, language });
  const saved = await saveSnapshot(sql, {
    keyword,
    location,
    country,
    language,
    data,
    createdBy,
  });
  await sql`
    update tracked_keywords
    set last_tracked_at = ${saved.fetched_at}, updated_at = now()
    where keyword = ${keyword}
  `;
  return saved;
}

async function fetchSerper(keyword, { location, country, language }) {
  const response = await fetch(SERPER_ENDPOINT, {
    method: 'POST',
    headers: {
      'X-API-KEY': process.env.SERPER_API_KEY || process.env.SERPER_DEV_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      q: keyword,
      gl: country,
      hl: language,
      location,
      num: 10,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(response.status, data.message || data.error || 'Serper request failed.');
  }
  return data;
}

async function saveSnapshot(sql, { keyword, location, country, language, data, createdBy }) {
  const organic = Array.isArray(data.organic) ? data.organic.slice(0, 10) : [];
  const peopleAlsoAsk = Array.isArray(data.peopleAlsoAsk) ? data.peopleAlsoAsk.slice(0, 8) : [];
  const relatedSearches = Array.isArray(data.relatedSearches) ? data.relatedSearches.slice(0, 8) : [];
  const codakid = organic.find((result) => {
    try {
      return new URL(result.link).hostname.replace(/^www\./, '') === 'codakid.com';
    } catch {
      return false;
    }
  });

  const rows = await sql`
    insert into serp_snapshots (
      id,
      keyword,
      location,
      country,
      language,
      codakid_position,
      codakid_url,
      organic,
      people_also_ask,
      related_searches,
      credits_used,
      created_by
    )
    values (
      ${randomUUID()},
      ${keyword},
      ${location},
      ${country},
      ${language},
      ${codakid?.position || null},
      ${codakid?.link || ''},
      ${JSON.stringify(organic.map(cleanSerpResult))},
      ${JSON.stringify(peopleAlsoAsk.map(cleanQuestion))},
      ${JSON.stringify(relatedSearches)},
      1,
      ${createdBy}
    )
    returning *
  `;
  return rows[0];
}

export function publicSerpSnapshot(row) {
  return {
    id: row.id,
    keyword: row.keyword,
    location: row.location,
    country: row.country,
    language: row.language,
    codakidPosition: row.codakid_position,
    codakidUrl: row.codakid_url,
    organic: row.organic || [],
    peopleAlsoAsk: row.people_also_ask || [],
    relatedSearches: row.related_searches || [],
    creditsUsed: row.credits_used,
    fetchedAt: row.fetched_at,
    createdBy: row.created_by,
  };
}

function parseKeywords(value) {
  const raw = Array.isArray(value) ? value.join(',') : String(value || '');
  return [...new Set(raw.split(/[\n,]+/).map((keyword) => keyword.trim()).filter(Boolean))]
    .slice(0, MAX_KEYWORDS_PER_REQUEST);
}

function cleanSerpResult(result) {
  return {
    title: String(result.title || '').slice(0, 180),
    link: String(result.link || ''),
    snippet: String(result.snippet || '').slice(0, 360),
    position: Number(result.position || 0),
    domain: domainFor(result.link),
  };
}

function cleanQuestion(question) {
  return {
    question: String(question.question || question.title || '').slice(0, 220),
    snippet: String(question.snippet || '').slice(0, 360),
    title: String(question.title || '').slice(0, 180),
    link: String(question.link || ''),
  };
}

function domainFor(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
