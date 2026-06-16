import { createHash, randomUUID } from 'node:crypto';
import { audit, errorResponse, getSql, json, parseJsonBody, requireCsrf, requireUser, HttpError } from './_auth.mjs';

const ALLOWED_STATUSES = new Set(['todo', 'in_progress', 'done', 'dismissed']);

export async function handler(event) {
  try {
    const user = await requireUser(event);
    const sql = getSql();

    if (event.httpMethod === 'GET') {
      const status = String(event.queryStringParameters?.status || '').trim();
      const rows = status
        ? await sql`
            select *
            from dashboard_action_items
            where status = ${status}
            order by status asc, priority_score desc, updated_at desc
          `
        : await sql`
            select *
            from dashboard_action_items
            order by
              case status
                when 'in_progress' then 1
                when 'todo' then 2
                when 'done' then 3
                else 4
              end,
              priority_score desc,
              updated_at desc
          `;
      return json(200, { actionItems: rows.map(publicActionItem) }, { 'cache-control': 'private, no-store' });
    }

    if (event.httpMethod === 'POST') {
      requireCsrf(event);
      const body = parseJsonBody(event);
      const item = normalizeInput(body);
      const fingerprint = item.fingerprint || fingerprintFor(item);
      const rows = await sql`
        insert into dashboard_action_items (
          id,
          fingerprint,
          type,
          source,
          title,
          detail,
          page_url,
          keyword,
          cluster,
          priority_score,
          status,
          owner,
          due_date,
          completed_at,
          created_by,
          updated_at
        )
        values (
          ${randomUUID()},
          ${fingerprint},
          ${item.type},
          ${item.source},
          ${item.title},
          ${item.detail},
          ${item.pageUrl},
          ${item.keyword},
          ${item.cluster},
          ${item.priorityScore},
          ${item.status},
          ${item.owner},
          ${item.dueDate || null},
          ${item.status === 'done' ? new Date().toISOString() : null},
          ${user.email},
          now()
        )
        on conflict (fingerprint) do update set
          type = excluded.type,
          source = excluded.source,
          title = excluded.title,
          detail = excluded.detail,
          page_url = excluded.page_url,
          keyword = excluded.keyword,
          cluster = excluded.cluster,
          priority_score = greatest(dashboard_action_items.priority_score, excluded.priority_score),
          status = case
            when dashboard_action_items.status in ('done', 'dismissed') then dashboard_action_items.status
            else excluded.status
          end,
          owner = coalesce(nullif(excluded.owner, ''), dashboard_action_items.owner),
          due_date = coalesce(excluded.due_date, dashboard_action_items.due_date),
          completed_at = case
            when excluded.status = 'done' then coalesce(dashboard_action_items.completed_at, now())
            else dashboard_action_items.completed_at
          end,
          updated_at = now()
        returning *
      `;
      await audit(event, user, 'action.upsert', rows[0]?.id || fingerprint, {
        type: item.type,
        source: item.source,
        status: item.status,
      });
      return json(200, { actionItem: publicActionItem(rows[0]) }, { 'cache-control': 'private, no-store' });
    }

    if (event.httpMethod === 'PATCH') {
      requireCsrf(event);
      const body = parseJsonBody(event);
      const id = String(body.id || '').trim();
      const fingerprint = String(body.fingerprint || '').trim();
      if (!id && !fingerprint) throw new HttpError(400, 'Action id or fingerprint is required.');

      const status = body.status === undefined ? undefined : String(body.status || '').trim();
      if (status !== undefined && !ALLOWED_STATUSES.has(status)) {
        throw new HttpError(400, 'Invalid action status.');
      }

      const owner = body.owner === undefined ? undefined : String(body.owner || '').trim();
      const dueDate = body.dueDate === undefined ? undefined : String(body.dueDate || '').trim();
      const rows = await sql`
        update dashboard_action_items
        set
          status = coalesce(${status || null}, status),
          owner = coalesce(${owner ?? null}, owner),
          due_date = coalesce(${dueDate || null}, due_date),
          completed_at = case
            when ${status || null} = 'done' then coalesce(completed_at, now())
            when ${status || null} in ('todo', 'in_progress') then null
            else completed_at
          end,
          updated_at = now()
        where (${id} <> '' and id = ${id})
           or (${fingerprint} <> '' and fingerprint = ${fingerprint})
        returning *
      `;
      if (!rows[0]) throw new HttpError(404, 'Action item not found.');
      await audit(event, user, 'action.update', rows[0].id, {
        status,
        owner,
        dueDate,
      });
      return json(200, { actionItem: publicActionItem(rows[0]) }, { 'cache-control': 'private, no-store' });
    }

    if (event.httpMethod === 'DELETE') {
      requireCsrf(event);
      const body = parseJsonBody(event);
      const id = String(body.id || '').trim();
      if (!id) throw new HttpError(400, 'Action id is required.');
      await sql`delete from dashboard_action_items where id = ${id}`;
      await audit(event, user, 'action.delete', id);
      return json(200, { ok: true }, { 'cache-control': 'private, no-store' });
    }

    return json(405, { error: 'Method not allowed.' });
  } catch (error) {
    return errorResponse(error);
  }
}

function normalizeInput(body) {
  const title = String(body.title || '').trim();
  if (!title) throw new HttpError(400, 'Action title is required.');
  const status = String(body.status || 'todo').trim();
  if (!ALLOWED_STATUSES.has(status)) throw new HttpError(400, 'Invalid action status.');
  return {
    fingerprint: String(body.fingerprint || '').trim(),
    type: String(body.type || 'general').trim(),
    source: String(body.source || 'manual').trim(),
    title,
    detail: String(body.detail || '').trim(),
    pageUrl: String(body.pageUrl || body.page_url || '').trim(),
    keyword: String(body.keyword || '').trim(),
    cluster: String(body.cluster || '').trim(),
    priorityScore: Math.max(0, Math.round(Number(body.priorityScore || body.priority_score || 0))),
    status,
    owner: String(body.owner || '').trim(),
    dueDate: String(body.dueDate || body.due_date || '').trim(),
  };
}

function fingerprintFor(item) {
  return createHash('sha256')
    .update([item.type, item.source, item.title, item.pageUrl, item.keyword, item.cluster].join('|').toLowerCase())
    .digest('hex');
}

function publicActionItem(row) {
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    type: row.type,
    source: row.source,
    title: row.title,
    detail: row.detail,
    pageUrl: row.page_url,
    keyword: row.keyword,
    cluster: row.cluster,
    priorityScore: row.priority_score,
    status: row.status,
    owner: row.owner,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
