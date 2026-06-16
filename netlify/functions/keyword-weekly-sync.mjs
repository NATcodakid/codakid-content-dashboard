import {
  assertRateLimit,
  audit,
  ensureAuthSchema,
  errorResponse,
  getSql,
  json,
  requireAdmin,
  requireCsrf,
} from './_auth.mjs';
import { serperConfigured, trackSerpKeyword, publicSerpSnapshot } from './serp-tracker.mjs';

const MAX_WEEKLY_KEYWORDS = 30;

export async function handler(event) {
  try {
    requireCsrf(event);
    const user = await requireAdmin(event);
    const result = await runKeywordSync({ createdBy: user.email, requestedBy: user.email });
    await audit(event, user, 'keyword.weekly_sync', 'manual', result);
    return json(200, result, { 'cache-control': 'private, no-store' });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function scheduled() {
  await ensureAuthSchema();
  await runKeywordSync({ createdBy: 'scheduled@netlify', requestedBy: 'scheduled' });
}

async function runKeywordSync({ createdBy, requestedBy }) {
  if (!serperConfigured()) {
    return { configured: false, requestedBy, tracked: 0, skipped: 'SERPER_API_KEY is not configured.' };
  }

  const sql = getSql();
  const rows = await sql`
    select id, keyword
    from tracked_keywords
    where status = 'active'
      and cadence = 'weekly'
      and (last_tracked_at is null or last_tracked_at < now() - interval '7 days')
    order by priority desc, last_tracked_at asc nulls first, keyword asc
    limit ${MAX_WEEKLY_KEYWORDS}
  `;

  const snapshots = [];
  const errors = [];
  for (const row of rows) {
    try {
      await assertRateLimit('serper:global', { limit: 2000, windowSeconds: 31 * 24 * 60 * 60 });
      const saved = await trackSerpKeyword(sql, row.keyword, { createdBy });
      snapshots.push(publicSerpSnapshot(saved));
    } catch (error) {
      errors.push({
        keyword: row.keyword,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    configured: true,
    requestedBy,
    tracked: snapshots.length,
    attempted: rows.length,
    errors,
    snapshots,
  };
}
