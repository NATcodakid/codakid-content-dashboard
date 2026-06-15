import { syncSearchAnalytics, syncSearchConsoleProperties } from './_google.mjs';
import { ensureAuthSchema, errorResponse, json, requireAdmin } from './_auth.mjs';

export async function handler(event) {
  try {
    await requireAdmin(event);
    await syncSearchConsoleProperties();
    const result = await syncSearchAnalytics();
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
