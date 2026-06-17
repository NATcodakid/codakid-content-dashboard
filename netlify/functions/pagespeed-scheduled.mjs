import { ensureAuthSchema, getSql } from './_auth.mjs';
import { buildCandidates, runPageSpeed, storePageSpeedResult, pageSpeedConfigured } from './pagespeed.mjs';

// Runs weekly (see netlify.toml) so Core Web Vitals trend over time without anyone
// clicking "Test". Mobile strategy mirrors how Google ranks. Failures on a single
// URL never abort the rest of the run.
export async function handler() {
  if (!pageSpeedConfigured()) {
    return { statusCode: 200, body: JSON.stringify({ skipped: 'PAGESPEED_API_KEY not configured' }) };
  }
  try {
    await ensureAuthSchema();
    const sql = getSql();
    const candidates = await buildCandidates();
    let stored = 0;
    for (const page of candidates) {
      try {
        const result = await runPageSpeed(page.url, 'mobile');
        await storePageSpeedResult(sql, result, 'mobile');
        stored += 1;
      } catch (caught) {
        console.error('pagespeed-scheduled: failed for', page.url, caught instanceof Error ? caught.message : caught);
      }
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, candidates: candidates.length, stored }) };
  } catch (error) {
    console.error('pagespeed-scheduled error', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'scheduled pagespeed failed' }) };
  }
}
