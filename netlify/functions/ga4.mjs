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
  const connection = await googleConnectionStatus();
  if (!connection.connected || !(await googleConnectionHasAnalyticsScope())) {
    console.info('GA4 scheduled sync skipped: Google Analytics access is not connected.');
    return;
  }
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

export async function syncGa4() {
  const propertyId = ga4PropertyId();
  const current = dateRange(31, 3);
  const previous = dateRange(62, 32);
  const historyRange = dateRange(93, 3);
  const [summary, previousSummary, pages, daily, pageDaily] = await Promise.all([
    runSummary(current),
    runSummary(previous),
    runPages(current),
    runDaily(historyRange),
    runPageDaily(historyRange),
  ]);

  const sql = getSql();
  await saveGa4Snapshot(sql, propertyId, current, 'summary', summary);
  await saveGa4Snapshot(sql, propertyId, previous, 'summary', previousSummary);
  await saveGa4Snapshot(sql, propertyId, current, 'pagePath,pageTitle', pages);
  await saveGa4Snapshot(sql, propertyId, historyRange, 'date', daily);
  await saveGa4Snapshot(sql, propertyId, historyRange, 'pagePath,date', pageDaily);

  return {
    configured: true,
    propertyId,
    connected: true,
    analyticsScopeReady: true,
    latest: buildPayload(propertyId, current, summary, previousSummary, pages, undefined, daily, pageDaily),
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
    limit 16
  `;
  if (!rows.length) return null;
  const latestSummary = rows.find((row) => row.dimensions === 'summary');
  const latestPages = rows.find((row) => row.dimensions === 'pagePath,pageTitle');
  const latestDaily = rows.find((row) => row.dimensions === 'date');
  const latestPageDaily = rows.find((row) => row.dimensions === 'pagePath,date');
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
    latestDaily?.data || null,
    latestPageDaily?.data || null,
  );
}

async function runSummary(range) {
  const baseMetrics = [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'screenPageViews' },
      { name: 'engagementRate' },
      { name: 'averageSessionDuration' },
  ];
  return runWithMetricFallback({ dateRanges: [range] }, baseMetrics);
}

async function runPages(range) {
  const base = {
    dateRanges: [range],
    dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
    dimensionFilter: {
      filter: {
        fieldName: 'pagePath',
        stringFilter: { matchType: 'CONTAINS', value: '/' },
      },
    },
    limit: 50,
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
  };
  const baseMetrics = [
      { name: 'screenPageViews' },
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'engagementRate' },
  ];
  return runWithMetricFallback(base, baseMetrics);
}

async function runDaily(range) {
  const base = {
    dateRanges: [range],
    dimensions: [{ name: 'date' }],
    limit: 120,
    orderBys: [{ dimension: { dimensionName: 'date' } }],
  };
  const baseMetrics = [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'screenPageViews' },
  ];
  return runWithMetricFallback(base, baseMetrics, true);
}

async function runPageDaily(range) {
  const base = {
    dateRanges: [range],
    dimensions: [{ name: 'pagePath' }, { name: 'date' }],
    dimensionFilter: {
      filter: {
        fieldName: 'pagePath',
        stringFilter: { matchType: 'CONTAINS', value: '/' },
      },
    },
    limit: 10000,
    orderBys: [{ dimension: { dimensionName: 'date' } }],
  };
  const baseMetrics = [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'screenPageViews' },
  ];
  return runWithMetricFallback(base, baseMetrics, true);
}

async function runWithMetricFallback(base, baseMetrics, optional = false) {
  try {
    return (await ga4RunReport({ ...base, metrics: [...baseMetrics, { name: 'keyEvents' }, { name: 'totalRevenue' }] })).data;
  } catch (error) {
    console.warn('GA4 enriched report failed; retrying core metrics.', error instanceof Error ? error.message : error);
    try {
      return (await ga4RunReport({ ...base, metrics: baseMetrics })).data;
    } catch (fallbackError) {
      if (!optional) throw fallbackError;
      console.warn('Optional GA4 history report skipped.', fallbackError instanceof Error ? fallbackError.message : fallbackError);
      return { dimensionHeaders: base.dimensions || [], metricHeaders: baseMetrics, rows: [] };
    }
  }
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

function buildPayload(propertyId, range, summary, previousSummary, pages, updatedAt = new Date().toISOString(), daily = null, pageDaily = null) {
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
        keyEvents: delta(currentMetrics.keyEvents, previousMetrics.keyEvents),
        totalRevenue: delta(currentMetrics.totalRevenue, previousMetrics.totalRevenue),
      },
    },
    topPages: normalizePageRows(pages),
    dailyTrend: normalizeDailyRows(daily),
    pageDaily: normalizePageDailyRows(pageDaily),
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
    keyEvents: Number(values.keyEvents || 0),
    totalRevenue: Number(values.totalRevenue || 0),
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
        keyEvents: Number(metrics[4]?.value || 0),
        totalRevenue: Number(metrics[5]?.value || 0),
      };
    })
    .filter((row) => row.path.startsWith('/'))
    .slice(0, 24);
}

function metricMap(data, row) {
  const values = {};
  (data?.metricHeaders || []).forEach((header, index) => {
    values[header.name] = Number(row?.metricValues?.[index]?.value || 0);
  });
  return values;
}

function normalizeDailyRows(data) {
  return (data?.rows || []).map((row) => {
    const values = metricMap(data, row);
    return {
      date: gaDate(row.dimensionValues?.[0]?.value),
      sessions: Math.round(values.sessions || 0),
      users: Math.round(values.totalUsers || 0),
      views: Math.round(values.screenPageViews || 0),
      keyEvents: values.keyEvents || 0,
      totalRevenue: values.totalRevenue || 0,
    };
  }).filter((row) => row.date);
}

function normalizePageDailyRows(data) {
  return (data?.rows || []).map((row) => {
    const values = metricMap(data, row);
    const path = row.dimensionValues?.[0]?.value || '';
    return {
      path,
      url: `https://codakid.com${path}`,
      date: gaDate(row.dimensionValues?.[1]?.value),
      sessions: Math.round(values.sessions || 0),
      users: Math.round(values.totalUsers || 0),
      views: Math.round(values.screenPageViews || 0),
      keyEvents: values.keyEvents || 0,
      totalRevenue: values.totalRevenue || 0,
    };
  }).filter((row) => row.path.startsWith('/') && row.date);
}

function gaDate(value) {
  const text = String(value || '');
  return /^\d{8}$/.test(text) ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}` : text;
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
