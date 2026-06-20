import { scheduled } from './google-search-console-sync.mjs';

export default async () => {
  await scheduled();

  return new Response('Search Console sync complete', { status: 200 });
};

export const config = {
  schedule: '@daily',
};
