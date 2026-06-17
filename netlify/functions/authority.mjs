import { randomUUID } from 'node:crypto';
import { audit, errorResponse, getSql, json, requireUser } from './_auth.mjs';

const OPR_ENDPOINT = 'https://openpagerank.com/api/v1.0/getPageRank';
const WP_BASE = process.env.VITE_WORDPRESS_BASE || 'https://codakid.com';
const CACHE_HOURS = 24;
const MAX_DOMAINS = 100;

export function openPageRankConfigured() {
  return Boolean(process.env.OPENPAGERANK_API_KEY);
}

export async function handler(event) {
  try {
    const user = await requireUser(event);
    const sql = getSql();
    const forceRefresh = event.queryStringParameters?.refresh === '1';

    const ownDomain = normalizeDomain(WP_BASE);
    const competitorRows = await sql`
      select domain, label from dashboard_competitors where status = 'active' order by domain asc
    `;
    const targets = dedupe([
      { domain: ownDomain, label: process.env.VITE_SITE_NAME || ownDomain, isOwn: true },
      ...competitorRows.map((row) => ({ domain: normalizeDomain(row.domain), label: row.label || row.domain, isOwn: false })),
    ]).slice(0, MAX_DOMAINS);

    // Pull any fresh cached scores so we only call the API for stale/missing domains.
    const cached = await sql`
      select distinct on (domain) domain, page_rank, rank, status_code, error, created_at
      from domain_authority_snapshots
      order by domain, created_at desc
    `;
    const cacheByDomain = new Map(cached.map((row) => [row.domain, row]));

    const stale = forceRefresh
      ? targets.map((t) => t.domain)
      : targets
          .filter((t) => {
            const hit = cacheByDomain.get(t.domain);
            if (!hit) return true;
            const ageHours = (Date.now() - new Date(hit.created_at).getTime()) / 3_600_000;
            return ageHours > CACHE_HOURS;
          })
          .map((t) => t.domain);

    let fetchedNote = 'cached';
    if (stale.length && openPageRankConfigured()) {
      const fresh = await fetchPageRanks(stale);
      for (const row of fresh) {
        await sql`
          insert into domain_authority_snapshots (id, domain, page_rank, rank, status_code, error)
          values (${randomUUID()}, ${row.domain}, ${row.pageRank}, ${row.rank}, ${row.statusCode}, ${row.error})
        `;
        cacheByDomain.set(row.domain, {
          domain: row.domain,
          page_rank: row.pageRank,
          rank: row.rank,
          status_code: row.statusCode,
          error: row.error,
          created_at: new Date().toISOString(),
        });
      }
      await sql`delete from domain_authority_snapshots where created_at < now() - interval '180 days'`;
      await audit(event, user, 'authority.refresh', ownDomain, { domains: stale.length });
      fetchedNote = `refreshed ${fresh.length}`;
    }

    const domains = targets
      .map((t) => {
        const hit = cacheByDomain.get(t.domain);
        const pageRank = hit?.page_rank != null ? Number(hit.page_rank) : null;
        return {
          domain: t.domain,
          label: t.label,
          isOwn: t.isOwn,
          pageRank: pageRank != null ? Number(pageRank.toFixed(2)) : null,
          rank: hit?.rank ?? null,
          updatedAt: hit?.created_at ?? null,
        };
      })
      .sort((a, b) => (b.pageRank ?? -1) - (a.pageRank ?? -1));

    const ownAuthority = domains.find((d) => d.isOwn)?.pageRank ?? null;

    return json(
      200,
      {
        configured: openPageRankConfigured(),
        generatedAt: new Date().toISOString(),
        source: openPageRankConfigured() ? `OpenPageRank · ${fetchedNote}` : 'not configured',
        ownDomain,
        ownAuthority,
        domains,
      },
      { 'cache-control': 'private, no-store' },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

async function fetchPageRanks(domains) {
  const out = [];
  for (let i = 0; i < domains.length; i += MAX_DOMAINS) {
    const batch = domains.slice(i, i + MAX_DOMAINS);
    const params = batch.map((d) => `domains[]=${encodeURIComponent(d)}`).join('&');
    try {
      const response = await fetch(`${OPR_ENDPOINT}?${params}`, {
        headers: { 'API-OPR': process.env.OPENPAGERANK_API_KEY },
      });
      const payload = await response.json().catch(() => ({}));
      const rows = Array.isArray(payload.response) ? payload.response : [];
      for (const row of rows) {
        const rankNumber = Number.parseInt(String(row.rank ?? ''), 10);
        out.push({
          domain: normalizeDomain(row.domain || ''),
          pageRank: row.page_rank_decimal != null ? Number(row.page_rank_decimal) : null,
          rank: Number.isFinite(rankNumber) ? rankNumber : null,
          statusCode: Number(row.status_code) || response.status,
          error: row.error ? String(row.error) : '',
        });
      }
      // Domains the API silently dropped still get a record so we don't re-hammer them.
      for (const d of batch) {
        if (!out.some((o) => o.domain === d)) {
          out.push({ domain: d, pageRank: null, rank: null, statusCode: response.status, error: 'no data' });
        }
      }
    } catch (caught) {
      for (const d of batch) {
        out.push({ domain: d, pageRank: null, rank: null, statusCode: 0, error: caught instanceof Error ? caught.message : 'fetch failed' });
      }
    }
  }
  return out;
}

function normalizeDomain(input) {
  if (!input) return '';
  let value = String(input).trim().toLowerCase();
  value = value.replace(/^https?:\/\//, '').replace(/^www\./, '');
  value = value.split('/')[0].split('?')[0].split('#')[0];
  return value;
}

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!item.domain || seen.has(item.domain)) continue;
    seen.add(item.domain);
    out.push(item);
  }
  return out;
}
