import { errorResponse, getSql, json, requireUser } from './_auth.mjs';

export async function handler(event) {
  try {
    await requireUser(event);
    const sql = getSql();
    const [wordpressRows, auditRows, ga4Rows, gscRows, serpRows, visibilityRows] = await Promise.all([
      sql`
        select post_count, data, created_at
        from wordpress_snapshots
        where ok = true
        order by created_at asc
        limit 80
      `,
      sql`
        select health_score, issue_count, high_count, medium_count, summary, created_at
        from technical_audit_snapshots
        order by created_at asc
        limit 80
      `,
      sql`
        select start_date, end_date, data, created_at
        from ga4_snapshots
        order by created_at asc
        limit 80
      `,
      sql`
        select start_date, end_date, dimensions, data, created_at
        from google_search_console_snapshots
        order by created_at asc
        limit 120
      `,
      sql`
        select keyword, codakid_position, codakid_url, fetched_at
        from serp_snapshots
        order by fetched_at asc
        limit 120
      `,
      sql`
        select prompt, codakid_mentioned, codakid_sentiment, created_at
        from ai_visibility_runs
        order by created_at asc
        limit 120
      `,
    ]);

    return json(200, {
      generatedAt: new Date().toISOString(),
      wordpress: wordpressRows.map((row) => ({
        createdAt: row.created_at,
        posts: row.post_count,
        internalLinks: row.data?.kpis?.internalLinks || 0,
        linkGaps: row.data?.kpis?.linkGaps || 0,
        orphanPosts: row.data?.kpis?.orphanPosts || 0,
      })),
      audit: auditRows.map((row) => ({
        createdAt: row.created_at,
        healthScore: row.health_score,
        total: row.issue_count,
        high: row.high_count,
        medium: row.medium_count,
        byType: row.summary?.byType || {},
      })),
      ga4: ga4Rows.map((row) => {
        const summary = row.data?.summary || summarizeGa4Rows(row.data?.rows || []);
        return {
          createdAt: row.created_at,
          startDate: row.start_date,
          endDate: row.end_date,
          sessions: summary.sessions || 0,
          users: summary.totalUsers || summary.users || 0,
          views: summary.screenPageViews || summary.views || 0,
          engagementRate: summary.engagementRate || 0,
        };
      }),
      searchConsole: gscRows.map((row) => {
        const totals = summarizeGscRows(row.data?.rows || []);
        return {
          createdAt: row.created_at,
          startDate: row.start_date,
          endDate: row.end_date,
          dimensions: row.dimensions,
          clicks: totals.clicks,
          impressions: totals.impressions,
          ctr: totals.ctr,
          position: totals.position,
        };
      }),
      serp: serpRows.map((row) => ({
        keyword: row.keyword,
        position: row.codakid_position,
        url: row.codakid_url,
        createdAt: row.fetched_at,
      })),
      aiVisibility: visibilityRows.map((row) => ({
        prompt: row.prompt,
        codakidMentioned: row.codakid_mentioned,
        codakidSentiment: row.codakid_sentiment,
        createdAt: row.created_at,
      })),
    }, { 'cache-control': 'private, no-store' });
  } catch (error) {
    return errorResponse(error);
  }
}

function summarizeGscRows(rows) {
  const totals = rows.reduce((sum, row) => {
    sum.clicks += Number(row.clicks || 0);
    sum.impressions += Number(row.impressions || 0);
    sum.weightedPosition += Number(row.position || 0) * Number(row.impressions || 0);
    return sum;
  }, { clicks: 0, impressions: 0, weightedPosition: 0 });
  return {
    clicks: totals.clicks,
    impressions: totals.impressions,
    ctr: totals.impressions ? totals.clicks / totals.impressions : 0,
    position: totals.impressions ? totals.weightedPosition / totals.impressions : 0,
  };
}

function summarizeGa4Rows(rows) {
  return rows.reduce((sum, row) => {
    const metrics = row.metricValues || row.metrics || [];
    sum.sessions += Number(metrics[1]?.value || row.sessions || 0);
    sum.totalUsers += Number(metrics[2]?.value || row.totalUsers || 0);
    sum.screenPageViews += Number(metrics[0]?.value || row.screenPageViews || 0);
    return sum;
  }, { sessions: 0, totalUsers: 0, screenPageViews: 0, engagementRate: 0 });
}
