import { randomUUID } from 'node:crypto';
import {
  audit,
  ensureAuthSchema,
  errorResponse,
  getSql,
  json,
  requireAdmin,
  requireCsrf,
  requireUser,
} from './_auth.mjs';
import {
  ga4Configured,
  ga4PropertyId,
  ga4RunReport,
  googleConnectionHasAnalyticsScope,
  googleConnectionStatus,
} from './_google.mjs';

export async function handler(event) {
  try {
    if (event.httpMethod === 'GET') {
      await requireUser(event);
      return json(200, await ga4StatusPayload(), { 'cache-control': 'private, no-store' });
    }

    if (event.httpMethod === 'POST') {
      requireCsrf(event);
      const user = await requireAdmin(event);
      const payload = await syncGa4();
      await audit(event, user, 'ga4.sync', ga4PropertyId(), {
        summaryRows: payload.summary?.rows?.length || 0,
        pageRows: payload.topPages?.length || 0,
      });
      return json(200, payload, { 'cache-control': 'private, no-store' });
    }

    return json(405, { error: 'Method not allowed.' });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function scheduled() {
  await ensureAuthSchema();
  if (!ga4Configured()) return;
  await syncGa4();
}

async function ga4StatusPayload() {
  const connection = await googleConnectionStatus();
  const propertyId = ga4PropertyId();
  const latest = await latestGa4Payload(propertyId);
  return {
    configured: ga4Configured(),
    propertyId,
    connected: connection.connected,
    analyticsScopeReady: await googleConnectionHasAnalyticsScope(),
    latest,
    message: ga4Configured()
      ? ''
      : 'Add GA4_PROPERTY_ID in Netlify to enable Analytics reporting.',
  };
}

async function syncGa4() {
  const propertyId = ga4PropertyId();
  const current = dateRange(31, 3);
  const previous = dateRange(62, 32);
  const [summary, previousSummary, pages] = await Promise.all([
    runSummary(current),
    runSummary(previous),
    runPages(current),
  ]);

  const sql = getSql();
  await saveGa4Snapshot(sql, propertyId, current, 'summary', summary);
  await saveGa4Snapshot(sql, propertyId, previous, 'summary', previousSummary);
  await saveGa4Snapshot(sql, propertyId, current, 'pagePath,pageTitle', pages);

  return {
    configured: true,
    propertyId,
    connected: true,
    analyticsScopeReady: true,
    latest: buildPayload(propertyId, current, summary, previousSummary, pages),
    summary,
    topPages: normalizePageRows(pages),
  };
}

async function latestGa4Payload(propertyId) {
  if (!propertyId) return null;
  const sql = getSql();
  const rows = await sql`
    select dimensions, data, start_date, end_date, created_at
    from ga4_snapshots
    where property_id = ${propertyId}
    order by created_at desc
    limit 8
  `;
  if (!rows.length) return null;
  const latestSummary = rows.find((row) => row.dimensions === 'summary');
  const latestPages = rows.find((row) => row.dimensions === 'pagePath,pageTitle');
  const previousSummary = rows.find(
    (row) =>
      row.dimensions === 'summary' &&
      (dateOnly(row.start_date) !== dateOnly(latestSummary?.start_date) ||
        dateOnly(row.end_date) !== dateOnly(latestSummary?.end_date)),
  );
  if (!latestSummary) return null;
  return buildPayload(
    propertyId,
    { startDate: dateOnly(latestSummary.start_date), endDate: dateOnly(latestSummary.end_date) },
    latestSummary.data,
    previousSummary?.data || null,
    latestPages?.data || null,
    latestSummary.created_at,
  );
}

async function runSummary(range) {
  return (await ga4RunReport({
    dateRanges: [range],
    metrics: [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'screenPageViews' },
      { name: 'engagementRate' },
      { name: 'averageSessionDuration' },
    ],
  })).data;
}

async function runPages(range) {
  return (await ga4RunReport({
    dateRanges: [range],
    dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
    metrics: [
      { name: 'screenPageViews' },
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'engagementRate' },
    ],
    dimensionFilter: {
      filter: {
        fieldName: 'pagePath',
        stringFilter: {
          matchType: 'CONTAINS',
          value: '/',
        },
      },
    },
    limit: 50,
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
  })).data;
}

async function saveGa4Snapshot(sql, propertyId, range, dimensions, data) {
  const metrics = (data.metricHeaders || []).map((metric) => metric.name).join(',');
  await sql`
    insert into ga4_snapshots (id, property_id, start_date, end_date, dimensions, metrics, data)
    values (
      ${randomUUID()},
      ${propertyId},
      ${range.startDate},
      ${range.endDate},
      ${dimensions},
      ${metrics},
      ${JSON.stringify(data)}
    )
  `;
  await sql`delete from ga4_snapshots where created_at < now() - interval '180 days'`;
}

function buildPayload(propertyId, range, summary, previousSummary, pages, updatedAt = new Date().toISOString()) {
  const currentMetrics = normalizeSummary(summary);
  const previousMetrics = normalizeSummary(previousSummary);
  return {
    propertyId,
    startDate: range.startDate,
    endDate: range.endDate,
    updatedAt,
    summary: {
      ...currentMetrics,
      deltas: {
        sessions: delta(currentMetrics.sessions, previousMetrics.sessions),
        totalUsers: delta(currentMetrics.totalUsers, previousMetrics.totalUsers),
        screenPageViews: delta(currentMetrics.screenPageViews, previousMetrics.screenPageViews),
        engagementRate: delta(currentMetrics.engagementRate, previousMetrics.engagementRate),
      },
    },
    topPages: normalizePageRows(pages),
  };
}

function normalizeSummary(data) {
  const row = data?.rows?.[0];
  const headers = data?.metricHeaders || [];
  const values = {};
  headers.forEach((header, index) => {
    values[header.name] = Number(row?.metricValues?.[index]?.value || 0);
  });
  return {
    sessions: Math.round(values.sessions || 0),
    totalUsers: Math.round(values.totalUsers || 0),
    screenPageViews: Math.round(values.screenPageViews || 0),
    engagementRate: Number(values.engagementRate || 0),
    averageSessionDuration: Number(values.averageSessionDuration || 0),
  };
}

function normalizePageRows(data) {
  const rows = data?.rows || [];
  return rows
    .map((row) => {
      const path = row.dimensionValues?.[0]?.value || '';
      const title = row.dimensionValues?.[1]?.value || path;
      const metrics = row.metricValues || [];
      return {
        path,
        title,
        url: `https://codakid.com${path}`,
        views: Math.round(Number(metrics[0]?.value || 0)),
        sessions: Math.round(Number(metrics[1]?.value || 0)),
        users: Math.round(Number(metrics[2]?.value || 0)),
        engagementRate: Number(metrics[3]?.value || 0),
      };
    })
    .filter((row) => row.path.startsWith('/'))
    .slice(0, 24);
}

function delta(current, previous) {
  if (!previous) return null;
  return (current - previous) / previous;
}

function dateRange(startDaysAgo, endDaysAgo) {
  return {
    startDate: dateDaysAgo(startDaysAgo),
    endDate: dateDaysAgo(endDaysAgo),
  };
}

function dateDaysAgo(days) {
  const date = new Date(Date.now() - days * 86400000);
  return date.toISOString().slice(0, 10);
}

function dateOnly(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}
