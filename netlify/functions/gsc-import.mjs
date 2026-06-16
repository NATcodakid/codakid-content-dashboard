import { randomUUID, timingSafeEqual } from 'node:crypto';
import { ensureAuthSchema, errorResponse, getSql, json } from './_auth.mjs';

const MAX_ROWS_PER_SNAPSHOT = 3000;
const MAX_SNAPSHOTS = 6;

export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
    verifyWebhookSecret(event);
    await ensureAuthSchema();

    const payload = JSON.parse(event.body || '{}');
    const siteUrl = String(payload.siteUrl || '').trim();
    const startDate = String(payload.startDate || '').trim();
    const endDate = String(payload.endDate || '').trim();
    const snapshots = Array.isArray(payload.snapshots) ? payload.snapshots.slice(0, MAX_SNAPSHOTS) : [];

    if (!siteUrl || !startDate || !endDate || !snapshots.length) {
      return json(400, { error: 'Payload must include siteUrl, startDate, endDate, and snapshots.' });
    }

    const sql = getSql();
    await sql`
      insert into google_search_console_properties (site_url, permission_level, selected, last_seen_at)
      values (${siteUrl}, ${'apps-script-import'}, ${true}, now())
      on conflict (site_url) do update set
        permission_level = excluded.permission_level,
        selected = true,
        last_seen_at = now()
    `;

    const saved = [];
    for (const snapshot of snapshots) {
      const dimensions = normalizeDimensions(snapshot.dimensions);
      const rows = Array.isArray(snapshot.rows) ? snapshot.rows.slice(0, MAX_ROWS_PER_SNAPSHOT) : [];
      if (!dimensions.length) continue;

      const data = { rows };
      await sql`
        insert into google_search_console_snapshots (id, site_url, start_date, end_date, dimensions, data)
        values (${randomUUID()}, ${siteUrl}, ${startDate}, ${endDate}, ${dimensions.join(',')}, ${JSON.stringify(data)})
      `;
      saved.push({ dimensions, rowCount: rows.length });
    }

    return json(200, {
      ok: true,
      siteUrl,
      startDate,
      endDate,
      saved,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function verifyWebhookSecret(event) {
  const expected = process.env.GSC_WEBHOOK_SECRET;
  const actual = event.headers?.['x-codakid-webhook-secret'] || event.headers?.['X-Codakid-Webhook-Secret'];
  if (!expected) {
    const error = new Error('GSC_WEBHOOK_SECRET is not configured in Netlify.');
    error.statusCode = 500;
    throw error;
  }
  if (!actual || !safeEqual(String(actual), String(expected))) {
    const error = new Error('Invalid webhook secret.');
    error.statusCode = 401;
    throw error;
  }
}

function safeEqual(a, b) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

function normalizeDimensions(dimensions) {
  if (!Array.isArray(dimensions)) return [];
  return dimensions.map((dimension) => String(dimension).trim()).filter(Boolean);
}
