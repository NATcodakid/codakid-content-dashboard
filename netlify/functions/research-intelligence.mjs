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
const MENTION_QUERY = 'CodaKid coding for kids';

export async function handler(event) {
  try {
    const user = await requireUser(event);
    if (event.httpMethod === 'GET') return json(200, await buildResearchPayload(), { 'cache-control': 'private, no-store' });
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
    requireCsrf(event);
    const body = parseJsonBody(event);
    const action = String(body.action || '').trim();
    if (action === 'refresh-mentions') {
      if (user.role !== 'admin') throw new HttpError(403, 'Admin access required.');
      await assertRateLimit('serper:mention-monitor', { limit: 5, windowSeconds: 7 * 24 * 60 * 60 });
      const result = await refreshMentions({ createdBy: user.email });
      await audit(event, user, 'mentions.refresh', 'codakid.com', result);
      return json(200, await buildResearchPayload(), { 'cache-control': 'private, no-store' });
    }
    if (action === 'import-backlinks') {
      if (user.role !== 'admin') throw new HttpError(403, 'Admin access required.');
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, 5000) : [];
      if (!rows.length) throw new HttpError(400, 'No backlink rows were provided.');
      const imported = await importBacklinks(rows);
      await audit(event, user, 'backlinks.import', imported.batch, { imported: imported.count });
      return json(200, await buildResearchPayload(), { 'cache-control': 'private, no-store' });
    }
    throw new HttpError(400, 'Unknown research action.');
  } catch (error) {
    return errorResponse(error);
  }
}

export async function scheduled() {
  try {
    await refreshMentions({ createdBy: 'scheduled' });
  } catch (error) {
    console.warn('External mention refresh skipped.', error instanceof Error ? error.message : error);
  }
}

export async function refreshMentions({ createdBy = '' } = {}) {
  const key = process.env.SERPER_API_KEY || process.env.SERPER_DEV_API_KEY;
  if (!key) throw new HttpError(500, 'SERPER_API_KEY is not configured.');
  const response = await fetch(SERPER_ENDPOINT, {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'content-type': 'application/json' },
    body: JSON.stringify({ q: MENTION_QUERY, gl: 'us', hl: 'en', location: 'United States', num: 20 }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(response.status, data.message || data.error || 'Mention search failed.');
  const sql = getSql();
  let count = 0;
  for (const result of Array.isArray(data.organic) ? data.organic : []) {
    const url = cleanUrl(result.link);
    const domain = domainFor(url);
    if (!url || !domain || domain === 'codakid.com') continue;
    await sql`
      insert into external_mentions (id, url, domain, title, snippet, search_query, source, last_seen_at)
      values (${randomUUID()}, ${url}, ${domain}, ${clean(result.title, 240)}, ${clean(result.snippet, 600)}, ${MENTION_QUERY}, 'serper', now())
      on conflict (url) do update set
        title = excluded.title,
        snippet = excluded.snippet,
        search_query = excluded.search_query,
        last_seen_at = now()
    `;
    count += 1;
  }
  return { count, creditsUsed: 1, createdBy };
}

async function importBacklinks(rows) {
  const sql = getSql();
  const batch = randomUUID();
  const records = [];
  for (const raw of rows) {
    const sourceUrl = cleanUrl(typeof raw === 'string' ? raw : raw.sourceUrl || raw.source_url || raw.url);
    const targetUrl = cleanTarget(typeof raw === 'string' ? '' : raw.targetUrl || raw.target_url || raw.target);
    const domain = domainFor(sourceUrl);
    if (!sourceUrl || !domain || domain === 'codakid.com') continue;
    records.push({ id: randomUUID(), source_url: sourceUrl, target_url: targetUrl, domain });
  }
  if (!records.length) return { batch, count: 0 };
  await sql`
    insert into backlink_records (id, source_url, target_url, domain, source, import_batch, last_seen_at)
    select row.id, row.source_url, row.target_url, row.domain, 'gsc-export', ${batch}, now()
    from jsonb_to_recordset(${JSON.stringify(records)}::jsonb)
      as row(id text, source_url text, target_url text, domain text)
    on conflict (source_url, target_url) do update set
      import_batch = excluded.import_batch,
      last_seen_at = now()
  `;
  return { batch, count: records.length };
}

async function buildResearchPayload() {
  const sql = getSql();
  const [serpRows, mentionRows, backlinkSummary, backlinkDomains, backlinkTargets, creditRows] = await Promise.all([
    sql`
      select distinct on (s.keyword) s.keyword, s.codakid_position, s.codakid_url, s.organic, s.people_also_ask, s.related_searches, s.fetched_at
      from serp_snapshots s
      join tracked_keywords k on k.keyword = s.keyword and k.status = 'active'
      order by s.keyword, s.fetched_at desc
    `,
    sql`select id, url, domain, title, snippet, first_seen_at, last_seen_at from external_mentions order by last_seen_at desc limit 100`,
    sql`select count(*)::int as links, count(distinct domain)::int as domains, max(last_seen_at) as updated_at from backlink_records`,
    sql`select domain, count(*)::int as links, max(last_seen_at) as last_seen_at from backlink_records group by domain order by links desc, domain asc limit 20`,
    sql`select target_url, count(*)::int as links, count(distinct domain)::int as domains from backlink_records group by target_url order by links desc, target_url asc limit 20`,
    sql`select coalesce(sum(credits_used), 0)::int as used from serp_snapshots where fetched_at >= date_trunc('month', now())`,
  ]);

  const share = buildShareOfVoice(serpRows);
  const codakidVisibility = share.find((item) => item.domain === 'codakid.com') || null;
  const shareLeaders = share.slice(0, 10);
  const displayedShare = codakidVisibility && !shareLeaders.some((item) => item.domain === 'codakid.com')
    ? [...share.slice(0, 9), codakidVisibility].sort((a, b) => b.score - a.score)
    : shareLeaders;
  const serpFeatures = serpRows.reduce((totals, row) => {
    if ((row.people_also_ask || []).length) totals.peopleAlsoAsk += 1;
    if ((row.related_searches || []).length) totals.relatedSearches += 1;
    return totals;
  }, { peopleAlsoAsk: 0, relatedSearches: 0 });
  return {
    generatedAt: new Date().toISOString(),
    configured: Boolean(process.env.SERPER_API_KEY || process.env.SERPER_DEV_API_KEY),
    market: {
      trackedSerps: serpRows.length,
      shareOfVoice: displayedShare,
      codakidShare: codakidVisibility?.share || 0,
      serpFeatures,
      latestAt: serpRows.reduce((latest, row) => !latest || new Date(row.fetched_at) > new Date(latest) ? row.fetched_at : latest, null),
    },
    mentions: {
      total: mentionRows.length,
      newThisMonth: mentionRows.filter((row) => Date.now() - new Date(row.first_seen_at).getTime() <= 30 * 86400000).length,
      latestAt: mentionRows[0]?.last_seen_at || null,
      rows: mentionRows.map((row) => ({ id: row.id, url: row.url, domain: row.domain, title: row.title, snippet: row.snippet, firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at })),
    },
    backlinks: {
      total: Number(backlinkSummary[0]?.links || 0),
      domains: Number(backlinkSummary[0]?.domains || 0),
      updatedAt: backlinkSummary[0]?.updated_at || null,
      topDomains: backlinkDomains.map((row) => ({ domain: row.domain, links: Number(row.links || 0), lastSeenAt: row.last_seen_at })),
      topTargets: backlinkTargets.map((row) => ({ url: row.target_url, links: Number(row.links || 0), domains: Number(row.domains || 0) })),
    },
    credits: { usedThisMonth: Number(creditRows[0]?.used || 0), monthlyBudget: 2000 },
  };
}

function buildShareOfVoice(rows) {
  const scores = new Map();
  let total = 0;
  for (const row of rows) {
    for (const result of row.organic || []) {
      const domain = domainFor(result.link) || String(result.domain || '').replace(/^www\./, '').toLowerCase();
      const position = Number(result.position || 0);
      if (!domain || position < 1 || position > 10) continue;
      const points = 11 - position;
      scores.set(domain, (scores.get(domain) || 0) + points);
      total += points;
    }
  }
  return [...scores.entries()]
    .map(([domain, score]) => ({ domain, score, share: total ? score / total : 0 }))
    .sort((a, b) => b.score - a.score);
}

function clean(value, max) { return String(value || '').trim().slice(0, max); }
function cleanUrl(value) { try { const url = new URL(String(value || '')); if (!/^https?:$/.test(url.protocol)) return ''; url.hash = ''; return url.toString(); } catch { return ''; } }
function cleanTarget(value) { try { const url = new URL(String(value || 'https://codakid.com/'), 'https://codakid.com'); if (!/(^|\.)codakid\.com$/i.test(url.hostname)) return 'https://codakid.com/'; url.hash = ''; return url.toString(); } catch { return 'https://codakid.com/'; } }
function domainFor(value) { try { return new URL(value).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } }
