import { randomUUID } from 'node:crypto';
import {
  HttpError,
  audit,
  errorResponse,
  getSql,
  json,
  parseJsonBody,
  requireCsrf,
  requireUser,
} from './_auth.mjs';

const CHANGE_TYPES = new Set(['content', 'title-meta', 'internal-links', 'schema', 'technical', 'conversion', 'other']);
const STATUSES = new Set(['planned', 'implemented', 'measuring', 'complete']);

export async function handler(event) {
  try {
    const user = await requireUser(event);
    if (event.httpMethod === 'GET') {
      return json(200, await buildPayload(), { 'cache-control': 'private, no-store' });
    }

    requireCsrf(event);
    if (event.httpMethod === 'POST') {
      const body = parseJsonBody(event);
      const pageUrl = canonicalUrl(body.pageUrl);
      const summary = clean(body.summary, 240);
      if (!pageUrl || !summary) throw new HttpError(400, 'Page and change summary are required.');
      const changeType = CHANGE_TYPES.has(body.changeType) ? body.changeType : 'content';
      const implementedAt = body.implementedAt ? validDate(body.implementedAt) : null;
      const status = implementedAt && dateOnly(implementedAt) <= dateOnly(new Date()) ? 'measuring' : 'planned';
      const beforeState = await pointInTimeSnapshot(pageUrl, implementedAt || new Date().toISOString());
      const id = randomUUID();
      const sql = getSql();
      await sql`
        insert into seo_changes (
          id, page_url, page_title, change_type, summary, notes, before_state,
          status, implemented_at, created_by
        ) values (
          ${id}, ${pageUrl}, ${clean(body.pageTitle, 240)}, ${changeType}, ${summary},
          ${clean(body.notes, 2000)}, ${JSON.stringify(beforeState)}, ${status},
          ${implementedAt}, ${user.id}
        )
      `;
      await audit(event, user, 'seo-change.create', id, { pageUrl, changeType, status });
      return json(201, await buildPayload());
    }

    if (event.httpMethod === 'PATCH') {
      const body = parseJsonBody(event);
      const id = clean(body.id, 80);
      if (!id) throw new HttpError(400, 'Change id is required.');
      const sql = getSql();
      const existing = (await sql`select * from seo_changes where id = ${id} limit 1`)[0];
      if (!existing) throw new HttpError(404, 'SEO change not found.');
      const status = STATUSES.has(body.status) ? body.status : existing.status;
      const implementedAt = body.implementedAt === undefined
        ? existing.implemented_at
        : body.implementedAt
          ? validDate(body.implementedAt)
          : null;
      const beforeState = !existing.implemented_at && implementedAt
        ? await pointInTimeSnapshot(existing.page_url, implementedAt)
        : existing.before_state;
      await sql`
        update seo_changes set
          page_title = ${body.pageTitle === undefined ? existing.page_title : clean(body.pageTitle, 240)},
          change_type = ${CHANGE_TYPES.has(body.changeType) ? body.changeType : existing.change_type},
          summary = ${body.summary === undefined ? existing.summary : clean(body.summary, 240)},
          notes = ${body.notes === undefined ? existing.notes : clean(body.notes, 2000)},
          status = ${implementedAt && status === 'planned' ? 'measuring' : status},
          implemented_at = ${implementedAt},
          before_state = ${JSON.stringify(beforeState || {})},
          updated_at = now()
        where id = ${id}
      `;
      await audit(event, user, 'seo-change.update', id, { status, implementedAt });
      return json(200, await buildPayload());
    }

    if (event.httpMethod === 'DELETE') {
      const body = parseJsonBody(event);
      const id = clean(body.id, 80);
      if (!id) throw new HttpError(400, 'Change id is required.');
      const sql = getSql();
      await sql`delete from seo_changes where id = ${id}`;
      await audit(event, user, 'seo-change.delete', id);
      return json(200, await buildPayload());
    }

    return json(405, { error: 'Method not allowed.' });
  } catch (error) {
    return errorResponse(error);
  }
}

async function buildPayload() {
  const sql = getSql();
  const [changes, ga4Rows, gscRows] = await Promise.all([
    sql`select * from seo_changes order by coalesce(implemented_at, created_at) desc, created_at desc limit 200`,
    sql`
      select data, start_date, end_date, created_at
      from ga4_snapshots
      where dimensions = 'pagePath,date'
      order by created_at desc
      limit 1
    `,
    sql`
      select data, start_date, end_date, created_at
      from google_search_console_snapshots
      where dimensions = 'page,date'
      order by created_at desc
      limit 1
    `,
  ]);
  const ga4Daily = normalizeGa4PageDaily(ga4Rows[0]?.data);
  const gscDaily = normalizeGscPageDaily(gscRows[0]?.data);
  const items = changes.map((row) => mapChange(row, compareChange(row, ga4Daily, gscDaily)));
  const measured = items.filter((item) => item.impact?.ready);
  const wins = measured.filter((item) => (item.impact?.score || 0) > 0).length;
  const median = medianValue(measured.map((item) => item.impact?.score || 0));
  return {
    generatedAt: new Date().toISOString(),
    coverage: {
      ga4StartDate: dateOnly(ga4Rows[0]?.start_date),
      ga4EndDate: dateOnly(ga4Rows[0]?.end_date),
      gscStartDate: dateOnly(gscRows[0]?.start_date),
      gscEndDate: dateOnly(gscRows[0]?.end_date),
      ga4Rows: ga4Daily.length,
      gscRows: gscDaily.length,
    },
    summary: {
      total: items.length,
      planned: items.filter((item) => item.status === 'planned').length,
      measuring: items.filter((item) => item.status === 'measuring' || item.status === 'implemented').length,
      measured: measured.length,
      wins,
      medianImpact: median,
    },
    changes: items,
  };
}

function compareChange(change, ga4Daily, gscDaily) {
  if (!change.implemented_at) return { ready: false, state: 'planned', message: 'Add an implementation date to begin measuring.' };
  const implementationDate = dateOnly(change.implemented_at);
  const today = dateOnly(new Date());
  if (implementationDate > today) return { ready: false, state: 'planned', message: `Measurement begins ${implementationDate}.` };
  const beforeStart = addDays(implementationDate, -28);
  const beforeEnd = addDays(implementationDate, -1);
  const afterStart = implementationDate;
  const afterEnd = minDate(addDays(implementationDate, 27), addDays(today, -1));
  const url = canonicalUrl(change.page_url);
  const before = aggregateWindow(url, beforeStart, beforeEnd, ga4Daily, gscDaily);
  const after = aggregateWindow(url, afterStart, afterEnd, ga4Daily, gscDaily);
  const minDays = Math.min(before.observedDays, after.observedDays);
  const ready = minDays >= 7;
  const metrics = ['clicks', 'impressions', 'sessions', 'views', 'keyEvents', 'totalRevenue'].reduce((result, key) => {
    const beforeDaily = before.days ? before[key] / before.days : 0;
    const afterDaily = after.days ? after[key] / after.days : 0;
    result[key] = {
      before: before[key],
      after: after[key],
      beforeDaily,
      afterDaily,
      change: beforeDaily ? (afterDaily - beforeDaily) / beforeDaily : afterDaily > 0 ? 1 : null,
    };
    return result;
  }, {});
  const signals = [metrics.clicks.change, metrics.sessions.change, metrics.keyEvents.change].filter(Number.isFinite);
  const score = signals.length ? Math.round((signals.reduce((sum, value) => sum + value, 0) / signals.length) * 100) : 0;
  return {
    ready,
    state: ready ? 'measured' : 'collecting',
    message: ready ? '' : `Collecting history: ${minDays} of 7 minimum comparable days available.`,
    implementationDate,
    beforePeriod: { startDate: beforeStart, endDate: beforeEnd, days: before.days, observedDays: before.observedDays },
    afterPeriod: { startDate: afterStart, endDate: afterEnd, days: after.days, observedDays: after.observedDays },
    metrics,
    score,
  };
}

function aggregateWindow(url, startDate, endDate, ga4Daily, gscDaily) {
  const path = urlPath(url);
  const gaRows = ga4Daily.filter((row) => row.path === path && inRange(row.date, startDate, endDate));
  const gsRows = gscDaily.filter((row) => canonicalUrl(row.page) === url && inRange(row.date, startDate, endDate));
  const result = { clicks: 0, impressions: 0, sessions: 0, views: 0, keyEvents: 0, totalRevenue: 0 };
  gaRows.forEach((row) => {
    result.sessions += row.sessions;
    result.views += row.views;
    result.keyEvents += row.keyEvents;
    result.totalRevenue += row.totalRevenue;
  });
  gsRows.forEach((row) => {
    result.clicks += row.clicks;
    result.impressions += row.impressions;
  });
  const days = Math.max(1, diffDays(startDate, endDate) + 1);
  const observedDays = new Set([...gaRows.map((row) => row.date), ...gsRows.map((row) => row.date)]).size;
  return { ...result, days, observedDays };
}

async function pointInTimeSnapshot(pageUrl, at) {
  const sql = getSql();
  const [ga4Rows, gscRows] = await Promise.all([
    sql`select data from ga4_snapshots where dimensions = 'pagePath,date' order by created_at desc limit 1`,
    sql`select data from google_search_console_snapshots where dimensions = 'page,date' order by created_at desc limit 1`,
  ]);
  const endDate = addDays(dateOnly(at), -1);
  const startDate = addDays(endDate, -27);
  return {
    capturedAt: new Date().toISOString(),
    period: { startDate, endDate },
    metrics: aggregateWindow(pageUrl, startDate, endDate, normalizeGa4PageDaily(ga4Rows[0]?.data), normalizeGscPageDaily(gscRows[0]?.data)),
  };
}

function normalizeGa4PageDaily(data) {
  const headers = (data?.metricHeaders || []).map((item) => item.name);
  return (data?.rows || []).map((row) => {
    const metric = Object.fromEntries(headers.map((name, index) => [name, Number(row.metricValues?.[index]?.value || 0)]));
    return {
      path: normalizePath(row.dimensionValues?.[0]?.value),
      date: gaDate(row.dimensionValues?.[1]?.value),
      sessions: metric.sessions || 0,
      views: metric.screenPageViews || 0,
      keyEvents: metric.keyEvents || 0,
      totalRevenue: metric.totalRevenue || 0,
    };
  }).filter((row) => row.path && row.date);
}

function normalizeGscPageDaily(data) {
  return (data?.rows || []).map((row) => ({
    page: row.keys?.[0] || '',
    date: row.keys?.[1] || '',
    clicks: Number(row.clicks || 0),
    impressions: Number(row.impressions || 0),
  })).filter((row) => row.page && row.date);
}

function mapChange(row, impact) {
  return {
    id: row.id,
    pageUrl: row.page_url,
    pageTitle: row.page_title,
    changeType: row.change_type,
    summary: row.summary,
    notes: row.notes,
    status: row.status,
    implementedAt: row.implemented_at,
    beforeState: row.before_state || {},
    afterState: row.after_state || {},
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    impact,
  };
}

function canonicalUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value), 'https://codakid.com');
    if (!/(^|\.)codakid\.com$/i.test(url.hostname)) return '';
    return `https://codakid.com${normalizePath(url.pathname)}`;
  } catch {
    return '';
  }
}

function urlPath(value) {
  try { return normalizePath(new URL(value).pathname); } catch { return normalizePath(value); }
}

function normalizePath(value) {
  const path = `/${String(value || '').replace(/^\/+|\/+$/g, '')}`;
  return path === '/' ? '/' : `${path}/`;
}

function validDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, 'Implementation date is invalid.');
  return date.toISOString();
}

function clean(value, max) { return String(value || '').trim().slice(0, max); }
function dateOnly(value) { return value ? new Date(value).toISOString().slice(0, 10) : ''; }
function gaDate(value) { const text = String(value || ''); return /^\d{8}$/.test(text) ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}` : text; }
function addDays(value, days) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function diffDays(start, end) { return Math.round((new Date(`${end}T12:00:00Z`) - new Date(`${start}T12:00:00Z`)) / 86400000); }
function inRange(value, start, end) { return value >= start && value <= end; }
function minDate(a, b) { return a < b ? a : b; }
function medianValue(values) { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2); }
