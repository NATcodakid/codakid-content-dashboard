import { databaseEnvStatus, errorResponse, getSql, json, requireAdmin } from './_auth.mjs';
import { googleServiceAccountConfigured } from './_google.mjs';

export async function handler(event) {
  try {
    await requireAdmin(event);
    const sql = getSql();
    const [wpRows, gscRows, serpRows, actionRows, userRows, auditRows, syncRows, cannibalizationRows] = await Promise.all([
      sql`
        select post_count, source, ok, error, created_at
        from wordpress_snapshots
        order by created_at desc
        limit 1
      `,
      sql`
        select site_url, dimensions, jsonb_array_length(coalesce(data->'rows', '[]'::jsonb)) as row_count, created_at
        from google_search_console_snapshots
        order by created_at desc
        limit 6
      `,
      sql`
        select count(*)::int as total, max(fetched_at) as latest
        from serp_snapshots
      `,
      sql`
        select
          count(*)::int as total,
          count(*) filter (where status in ('todo', 'in_progress'))::int as open,
          count(*) filter (where status = 'done')::int as done
        from dashboard_action_items
      `,
      sql`
        select
          count(*)::int as total,
          count(*) filter (where role = 'admin' and status = 'active')::int as admins,
          count(*) filter (where status = 'active')::int as active
        from dashboard_users
      `,
      sql`
        select action, resource, email, created_at
        from dashboard_audit_log
        order by created_at desc
        limit 8
      `,
      sql`
        select distinct on (source) source, status, auth_mode, rows_saved, error, started_at, completed_at
        from source_sync_runs
        order by source, started_at desc
      `,
      sql`
        select
          count(*) filter (where resolved_at is null and recommendation <> 'keep-separate')::int as active,
          count(*) filter (where resolved_at is null and severity = 'high')::int as high,
          max(last_seen_at) as latest
        from cannibalization_recommendations
      `,
    ]);

    return json(
      200,
      {
        database: databaseEnvStatus(),
        env: {
          wordpressBase: process.env.VITE_WORDPRESS_BASE || 'https://codakid.com',
          openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
          serperConfigured: Boolean(process.env.SERPER_API_KEY || process.env.SERPER_DEV_API_KEY),
          ga4PropertyConfigured: Boolean(process.env.GA4_PROPERTY_ID || process.env.GOOGLE_ANALYTICS_PROPERTY_ID),
          googleOauthConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
          googleServiceAccountConfigured: googleServiceAccountConfigured(),
          gscImportSecretConfigured: Boolean(process.env.GSC_IMPORT_SECRET),
        },
        wordpress: wpRows[0] || null,
        searchConsole: gscRows.map((row) => ({
          siteUrl: row.site_url,
          dimensions: row.dimensions,
          rowCount: Number(row.row_count || 0),
          createdAt: row.created_at,
        })),
        serp: serpRows[0] || { total: 0, latest: null },
        actions: actionRows[0] || { total: 0, open: 0, done: 0 },
        users: userRows[0] || { total: 0, admins: 0, active: 0 },
        recentActivity: auditRows,
        sourceSyncs: syncRows.map((row) => ({
          source: row.source,
          status: row.status,
          authMode: row.auth_mode,
          rowsSaved: Number(row.rows_saved || 0),
          error: row.error,
          startedAt: row.started_at,
          completedAt: row.completed_at,
        })),
        cannibalization: cannibalizationRows[0] || { active: 0, high: 0, latest: null },
      },
      { 'cache-control': 'private, no-store' },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
