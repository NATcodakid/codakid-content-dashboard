import { syncSearchAnalytics, syncSearchConsoleProperties } from './_google.mjs';
import { ensureAuthSchema } from './_auth.mjs';

export default async () => {
  await ensureAuthSchema();
  await syncSearchConsoleProperties();
  await syncSearchAnalytics();

  return new Response('Search Console sync complete', { status: 200 });
};

export const config = {
  schedule: '@daily',
};
