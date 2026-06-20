import { googleConnectionStatus, syncSearchAnalytics, syncSearchConsoleProperties } from './_google.mjs';
import { audit, ensureAuthSchema, errorResponse, finishSourceSyncRun, json, requireAdmin, requireCsrf, startSourceSyncRun } from './_auth.mjs';

export async function handler(event) {
  try {
    requireCsrf(event);
    const user = await requireAdmin(event);
    const result = await runTrackedSearchConsoleSync();
    await audit(event, user, 'gsc.sync', result?.siteUrl || '', {
      snapshots: result?.snapshots?.length || 0,
      periods: result?.periods?.length || 0,
    });
    return json(200, result, {
      'cache-control': 'private, no-store',
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function scheduled() {
  await ensureAuthSchema();
  await runTrackedSearchConsoleSync();
}

async function runTrackedSearchConsoleSync() {
  const connection = await googleConnectionStatus();
  const runId = await startSourceSyncRun('search-console', connection.authenticationMode || '');
  try {
    await syncSearchConsoleProperties();
    const result = await syncSearchAnalytics();
    const rowsSaved = (result.snapshots || []).reduce((sum, snapshot) => sum + Number(snapshot.rowCount || 0), 0);
    await finishSourceSyncRun(runId, {
      rowsSaved,
      detail: { siteUrl: result.siteUrl, startDate: result.startDate, endDate: result.endDate, snapshots: result.snapshots },
    });
    return result;
  } catch (error) {
    await finishSourceSyncRun(runId, { status: 'failed', error: error instanceof Error ? error.message : String(error) }).catch(() => undefined);
    throw error;
  }
}
