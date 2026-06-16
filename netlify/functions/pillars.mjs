import { audit, errorResponse, getSql, json, parseJsonBody, requireCsrf, requireUser, HttpError } from './_auth.mjs';

const WP_BASE = process.env.VITE_WORDPRESS_BASE || 'https://codakid.com';

export async function handler(event) {
  try {
    const user = await requireUser(event);
    const sql = getSql();

    if (event.httpMethod === 'GET') {
      const rows = await sql`
        select url, raw_url, title, cluster, note, marked_by, created_at
        from dashboard_pillars
        order by created_at desc
      `;
      return json(200, { pillars: rows }, { 'cache-control': 'private, no-store' });
    }

    if (event.httpMethod === 'POST') {
      requireCsrf(event);
      const body = parseJsonBody(event);
      const rawUrl = String(body.url || '').trim();
      if (!rawUrl) throw new HttpError(400, 'A post url is required to mark a pillar.');
      const url = normalizeUrl(rawUrl);
      const title = String(body.title || '').trim();
      const cluster = String(body.cluster || '').trim();
      const note = String(body.note || '').trim();

      const rows = await sql`
        insert into dashboard_pillars (url, raw_url, title, cluster, note, marked_by)
        values (${url}, ${rawUrl}, ${title}, ${cluster}, ${note}, ${user.email})
        on conflict (url) do update set
          raw_url = excluded.raw_url,
          title = excluded.title,
          cluster = excluded.cluster,
          note = excluded.note,
          marked_by = excluded.marked_by
        returning url, raw_url, title, cluster, note, marked_by, created_at
      `;
      await audit(event, user, 'pillar.mark', url, { title, cluster });
      return json(200, { pillar: rows[0] }, { 'cache-control': 'private, no-store' });
    }

    if (event.httpMethod === 'DELETE') {
      requireCsrf(event);
      const rawUrl = String(
        parseJsonBody(event).url || event.queryStringParameters?.url || '',
      ).trim();
      if (!rawUrl) throw new HttpError(400, 'A post url is required to remove a pillar.');
      const url = normalizeUrl(rawUrl);
      await sql`delete from dashboard_pillars where url = ${url}`;
      await audit(event, user, 'pillar.unmark', url);
      return json(200, { ok: true, url }, { 'cache-control': 'private, no-store' });
    }

    return json(405, { error: 'Method not allowed.' });
  } catch (error) {
    return errorResponse(error);
  }
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url, WP_BASE);
    parsed.hash = '';
    parsed.search = '';
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '').toLowerCase();
  } catch {
    return String(url).replace(/\/$/, '').toLowerCase();
  }
}
