import { syncSearchAnalytics, syncSearchConsoleProperties } from './_google.mjs';
import { audit, ensureAuthSchema, errorResponse, json, requireAdmin, requireCsrf } from './_auth.mjs';

export async function handler(event) {
  try {
    requireCsrf(event);
    const user = await requireAdmin(event);
    await syncSearchConsoleProperties();
    const result = await syncSearchAnalytics();
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
  await syncSearchConsoleProperties();
  await syncSearchAnalytics();
}
