import { errorResponse, getSql, json, requireUser } from './_auth.mjs';

const MIN_PAGE_IMPRESSIONS = 100;
const MIN_QUERY_IMPRESSIONS = 50;
const MAX_PERIODS = 26;

export async function handler(event) {
  try {
    await requireUser(event);
    const sql = getSql();
    const params = event.queryStringParameters || {};
    const requestedStart = String(params.startDate || '').trim();
    const requestedEnd = String(params.endDate || '').trim();
    const selectedPropertyRows = await sql`
      select site_url
      from google_search_console_properties
      where selected = true
      order by last_seen_at desc
      limit 1
    `;
    const selectedSiteUrl = selectedPropertyRows[0]?.site_url || '';

    const snapshots = await sql`
      select distinct on (start_date, end_date, dimensions)
        site_url,
        start_date,
        end_date,
        dimensions,
        data,
        created_at
      from google_search_console_snapshots
      where (${selectedSiteUrl} = '' or site_url = ${selectedSiteUrl})
      order by start_date desc, end_date desc, dimensions, created_at desc
    `;

    if (!snapshots.length) {
      return json(
        200,
        {
          available: false,
          message: 'No Google Search Console snapshots have been imported yet.',
          periods: [],
          trend: [],
          pageOpportunities: [],
          queryOpportunities: [],
          pageQueryOpportunities: [],
          contentDecay: [],
          cannibalization: [],
          topPages: [],
          topQueries: [],
        },
        { 'cache-control': 'private, no-store' },
      );
    }

    const periods = buildPeriods(snapshots);
    const trend = buildTrend(snapshots, periods);
    const selected =
      periods.find((period) => period.startDate === requestedStart && period.endDate === requestedEnd) ||
      periods[0];

    const periodSnapshots = snapshots.filter(
      (snapshot) =>
        dateOnly(snapshot.start_date) === selected.startDate && dateOnly(snapshot.end_date) === selected.endDate,
    );
    const payload = buildPeriodPayload(periodSnapshots, selected, snapshots, periods);

    return json(
      200,
      {
        ...payload,
        periods,
        trend,
        periodIndex: periods.findIndex(
          (period) => period.startDate === selected.startDate && period.endDate === selected.endDate,
        ),
      },
      { 'cache-control': 'private, no-store' },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

function buildPeriods(snapshots) {
  const map = new Map();
  for (const snapshot of snapshots) {
    const startDate = dateOnly(snapshot.start_date);
    const endDate = dateOnly(snapshot.end_date);
    const key = `${startDate}|${endDate}`;
    const existing = map.get(key);
    if (!existing || new Date(snapshot.created_at) > new Date(existing.updatedAt)) {
      map.set(key, {
        startDate,
        endDate,
        updatedAt: snapshot.created_at,
        siteUrl: snapshot.site_url,
      });
    }
  }
  return Array.from(map.values())
    .sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime())
    .slice(0, MAX_PERIODS);
}

function buildTrend(snapshots, periods) {
  const chronological = [...periods].reverse();
  return chronological.map((period) => {
    const periodSnapshots = snapshots.filter(
      (snapshot) =>
        dateOnly(snapshot.start_date) === period.startDate && dateOnly(snapshot.end_date) === period.endDate,
    );
    const byDimension = new Map(periodSnapshots.map((snapshot) => [snapshot.dimensions, snapshot]));
    const pageRows = normalizeRows(byDimension.get('page'));
    const queryRows = normalizeRows(byDimension.get('query'));
    const summary = summarizeRows(pageRows.length ? pageRows : queryRows);
    return {
      startDate: period.startDate,
      endDate: period.endDate,
      label: formatWeekLabel(period.endDate),
      keywordCount: queryRows.length,
      ...summary,
    };
  });
}

function buildPeriodPayload(snapshots, period, allSnapshots = [], periods = []) {
  const byDimension = new Map(snapshots.map((snapshot) => [snapshot.dimensions, snapshot]));
  const pageSnapshot = byDimension.get('page');
  const querySnapshot = byDimension.get('query');
  const pageQuerySnapshot = byDimension.get('page,query');

  const pageRows = normalizeRows(pageSnapshot);
  const queryRows = normalizeRows(querySnapshot);
  const pageQueryRows = normalizeRows(pageQuerySnapshot);

  if (!pageRows.length && !queryRows.length && !pageQueryRows.length) {
    return {
      available: false,
      message: 'No rows found for this reporting period.',
      siteUrl: period.siteUrl,
      startDate: period.startDate,
      endDate: period.endDate,
      updatedAt: period.updatedAt,
      summary: summarizeRows([]),
      pageOpportunities: [],
      queryOpportunities: [],
      pageQueryOpportunities: [],
      contentDecay: [],
      cannibalization: [],
      topPages: [],
      topQueries: [],
    };
  }

  const latest = pageSnapshot || querySnapshot || pageQuerySnapshot;
  const topPages = pageRows
    .map((row) => rowToOpportunity(row, { type: 'top-page', keyIndex: 0 }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, 24);
  const topQueries = queryRows
    .map((row) => rowToOpportunity(row, { type: 'top-query', keyIndex: 0 }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, 50);

  const pageOpportunities = pageRows
    .filter((row) => Number(row.impressions || 0) >= MIN_PAGE_IMPRESSIONS)
    .filter((row) => Number(row.ctr || 0) < expectedCtr(row.position) * 0.55)
    .map((row) => rowToOpportunity(row, { type: 'low-ctr-page', keyIndex: 0 }))
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 12);

  const queryOpportunities = queryRows
    .filter((row) => Number(row.impressions || 0) >= MIN_QUERY_IMPRESSIONS)
    .filter((row) => Number(row.position || 0) >= 6 && Number(row.position || 0) <= 20)
    .map((row) => rowToOpportunity(row, { type: 'striking-distance-query', keyIndex: 0 }))
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 12);

  const pageQueryOpportunities = pageQueryRows
    .filter((row) => Number(row.impressions || 0) >= MIN_QUERY_IMPRESSIONS)
    .filter((row) => Number(row.position || 0) >= 4 && Number(row.position || 0) <= 25)
    .map((row) => rowToOpportunity(row, { type: 'page-query', keyIndex: 1, pageIndex: 0 }))
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 16);
  const contentDecay = buildContentDecay(allSnapshots, periods, period);
  const cannibalization = buildCannibalization(pageQueryRows);

  return {
    available: true,
    siteUrl: latest.site_url,
    startDate: period.startDate,
    endDate: period.endDate,
    updatedAt: latest.created_at,
    summary: summarizeRows(pageRows.length ? pageRows : queryRows),
    pageOpportunities,
    queryOpportunities,
    pageQueryOpportunities,
    contentDecay,
    cannibalization,
    topPages,
    topQueries,
  };
}

function buildContentDecay(allSnapshots, periods, selectedPeriod) {
  const currentIndex = periods.findIndex(
    (period) => period.startDate === selectedPeriod.startDate && period.endDate === selectedPeriod.endDate,
  );
  const priorPeriod = periods[currentIndex + 1];
  if (!priorPeriod) return [];

  const currentPages = normalizeRows(findSnapshotForPeriod(allSnapshots, selectedPeriod, 'page'));
  const priorPages = normalizeRows(findSnapshotForPeriod(allSnapshots, priorPeriod, 'page'));
  if (!currentPages.length || !priorPages.length) return [];

  const currentByPage = new Map(currentPages.map((row) => [rowKey(row, 0), row]));
  return priorPages
    .map((prior) => {
      const page = rowKey(prior, 0);
      const current = currentByPage.get(page);
      if (!page || !current) return null;
      const priorClicks = Number(prior.clicks || 0);
      const currentClicks = Number(current.clicks || 0);
      const lostClicks = Math.round(priorClicks - currentClicks);
      const clickChange = priorClicks ? (currentClicks - priorClicks) / priorClicks : 0;
      const impressionChange = Number(prior.impressions || 0)
        ? (Number(current.impressions || 0) - Number(prior.impressions || 0)) / Number(prior.impressions || 0)
        : 0;
      if (lostClicks < 5 && clickChange > -0.25 && impressionChange > -0.3) return null;
      return {
        page,
        clicks: Math.round(currentClicks),
        previousClicks: Math.round(priorClicks),
        lostClicks,
        clickChange,
        impressions: Math.round(Number(current.impressions || 0)),
        previousImpressions: Math.round(Number(prior.impressions || 0)),
        impressionChange,
        position: Number(current.position || 0),
        priorityScore: Math.max(0, Math.round(lostClicks * 8 + Math.abs(impressionChange) * 100)),
        recommendation: 'Refresh this page, compare the ranking intent, and add internal links from related posts.',
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 12);
}

function buildCannibalization(pageQueryRows) {
  const groups = new Map();
  for (const row of pageQueryRows) {
    const page = rowKey(row, 0);
    const query = rowKey(row, 1).toLowerCase();
    if (!page || !query || Number(row.impressions || 0) < MIN_QUERY_IMPRESSIONS) continue;
    if (!groups.has(query)) groups.set(query, []);
    groups.get(query).push({
      page,
      clicks: Math.round(Number(row.clicks || 0)),
      impressions: Math.round(Number(row.impressions || 0)),
      position: Number(row.position || 0),
      ctr: Number(row.ctr || 0),
    });
  }

  return [...groups.entries()]
    .map(([query, pages]) => {
      const uniquePages = dedupeByPage(pages).sort((a, b) => b.impressions - a.impressions);
      if (uniquePages.length < 2) return null;
      const totalImpressions = uniquePages.reduce((sum, page) => sum + page.impressions, 0);
      return {
        query,
        pageCount: uniquePages.length,
        totalImpressions,
        pages: uniquePages.slice(0, 4),
        recommendation: 'Pick the primary page for this query and point the other pages toward it with clear internal links.',
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.totalImpressions - a.totalImpressions)
    .slice(0, 12);
}

function findSnapshotForPeriod(snapshots, period, dimensions) {
  return snapshots.find(
    (snapshot) =>
      snapshot.dimensions === dimensions &&
      dateOnly(snapshot.start_date) === period.startDate &&
      dateOnly(snapshot.end_date) === period.endDate,
  );
}

function rowKey(row, index) {
  return Array.isArray(row.keys) ? String(row.keys[index] || '') : '';
}

function dedupeByPage(pages) {
  const map = new Map();
  for (const page of pages) {
    const existing = map.get(page.page);
    if (!existing || page.impressions > existing.impressions) map.set(page.page, page);
  }
  return [...map.values()];
}

function formatWeekLabel(endDate) {
  const date = new Date(endDate);
  if (Number.isNaN(date.getTime())) return String(endDate || '');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function dateOnly(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function normalizeRows(snapshot) {
  return Array.isArray(snapshot?.data?.rows) ? snapshot.data.rows : [];
}

function rowToOpportunity(row, options) {
  const clicks = Math.round(Number(row.clicks || 0));
  const impressions = Math.round(Number(row.impressions || 0));
  const ctr = Number(row.ctr || 0);
  const position = Number(row.position || 0);
  const keys = Array.isArray(row.keys) ? row.keys.map((key) => String(key || '')) : [];
  const label = keys[options.keyIndex] || 'Unknown';
  const page = options.pageIndex === undefined ? label : keys[options.pageIndex] || '';
  const query = options.pageIndex === undefined ? '' : label;
  const missedClicks = Math.max(0, Math.round(impressions * Math.max(expectedCtr(position) - ctr, 0)));

  return {
    label,
    page,
    query,
    clicks,
    impressions,
    ctr,
    position,
    priorityScore: scoreOpportunity({ impressions, ctr, position, missedClicks }),
    opportunityType: options.type,
    recommendation: recommendationFor(options.type, { label, page, query, position, missedClicks }),
  };
}

function summarizeRows(rows) {
  const totals = rows.reduce(
    (sum, row) => {
      const impressions = Number(row.impressions || 0);
      const clicks = Number(row.clicks || 0);
      return {
        clicks: sum.clicks + clicks,
        impressions: sum.impressions + impressions,
        weightedPosition: sum.weightedPosition + Number(row.position || 0) * impressions,
      };
    },
    { clicks: 0, impressions: 0, weightedPosition: 0 },
  );

  return {
    totalClicks: Math.round(totals.clicks),
    totalImpressions: Math.round(totals.impressions),
    averageCtr: totals.impressions ? totals.clicks / totals.impressions : 0,
    averagePosition: totals.impressions ? totals.weightedPosition / totals.impressions : 0,
  };
}

function expectedCtr(position) {
  if (position <= 1.5) return 0.28;
  if (position <= 3) return 0.14;
  if (position <= 5) return 0.08;
  if (position <= 10) return 0.035;
  if (position <= 20) return 0.018;
  return 0.01;
}

function scoreOpportunity({ impressions, ctr, position, missedClicks }) {
  const positionBoost = position <= 10 ? 1.4 : position <= 20 ? 1.1 : 0.8;
  const ctrGap = Math.max(0, expectedCtr(position) - ctr);
  return Math.round((missedClicks * 6 + impressions * ctrGap * 100) * positionBoost);
}

function recommendationFor(type, { label, page, query, position, missedClicks }) {
  if (type === 'low-ctr-page') {
    return `Rewrite the title/meta for this page. It has visibility but is under-clicking by roughly ${missedClicks} visits.`;
  }
  if (type === 'striking-distance-query') {
    return `Strengthen the best matching page for "${label}" with a tighter section, FAQ, and internal links. Average position ${position.toFixed(1)}.`;
  }
  if (type === 'page-query') {
    return `Tune this page for "${query}" and add 2-3 internal links using that language.`;
  }
  if (type === 'top-page') return `This page is already earning search clicks. Keep it fresh and link supporting posts into it.`;
  return `This query is driving visibility. Make sure the matching page answers it clearly.`;
}
