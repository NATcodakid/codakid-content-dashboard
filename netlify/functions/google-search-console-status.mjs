import { googleConnectionStatus, latestSearchConsoleSnapshot } from './_google.mjs';
import { errorResponse, json, requireUser } from './_auth.mjs';

export async function handler(event) {
  try {
    await requireUser(event);
    const status = await googleConnectionStatus();
    const snapshots = await latestSearchConsoleSnapshot();
    return json(200, {
      ...status,
      latestSnapshots: summarizeSnapshots(snapshots),
    }, {
      'cache-control': 'private, no-store',
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function summarizeSnapshots(snapshots) {
  return snapshots.map((snapshot) => ({
    siteUrl: snapshot.site_url,
    startDate: snapshot.start_date,
    endDate: snapshot.end_date,
    dimensions: snapshot.dimensions,
    rowCount: snapshot.data?.rows?.length || 0,
    totals: summarizeRows(snapshot.data?.rows || []),
    createdAt: snapshot.created_at,
  }));
}

function summarizeRows(rows) {
  return rows.reduce(
    (sum, row) => ({
      clicks: sum.clicks + Number(row.clicks || 0),
      impressions: sum.impressions + Number(row.impressions || 0),
      ctr: 0,
      position: 0,
    }),
    { clicks: 0, impressions: 0, ctr: 0, position: 0 },
  );
}
