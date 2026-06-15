import { errorResponse, getSql, json, requireAdmin } from './_auth.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'GET') return json(405, { error: 'GET required' });

  try {
    await requireAdmin(event);
    const sql = getSql();
    const users = await sql`
      select id, email, name, role, status, created_at, accepted_at
      from dashboard_users
      order by created_at desc
    `;
    return json(200, { users });
  } catch (error) {
    return errorResponse(error);
  }
}
