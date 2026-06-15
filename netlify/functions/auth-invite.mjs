import {
  errorResponse,
  getSql,
  hashToken,
  json,
  normalizeEmail,
  parseJsonBody,
  requireAdmin,
} from './_auth.mjs';
import { randomBytes, randomUUID } from 'node:crypto';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST required' });

  try {
    const admin = await requireAdmin(event);
    const { email, name = '', role = 'viewer' } = parseJsonBody(event);
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !normalizedEmail.includes('@')) return json(400, { error: 'Valid email required.' });
    if (!['admin', 'viewer'].includes(role)) return json(400, { error: 'Role must be admin or viewer.' });

    const sql = getSql();
    const token = randomBytes(32).toString('base64url');
    const existing = await sql`select id, status from dashboard_users where email = ${normalizedEmail} limit 1`;
    const userId = existing[0]?.id || randomUUID();

    if (!existing[0]) {
      await sql`
        insert into dashboard_users (id, email, name, role, status, invited_by)
        values (${userId}, ${normalizedEmail}, ${name}, ${role}, 'invited', ${admin.id})
      `;
    } else {
      await sql`
        update dashboard_users
        set name = coalesce(nullif(${name}, ''), name),
            role = ${role},
            status = case when status = 'disabled' then status else 'invited' end,
            invited_by = ${admin.id}
        where id = ${userId}
      `;
    }

    await sql`
      insert into dashboard_invitations (id, email, name, role, token_hash, invited_by, expires_at)
      values (${randomUUID()}, ${normalizedEmail}, ${name}, ${role}, ${hashToken(token)}, ${admin.id}, now() + interval '14 days')
    `;

    const origin = event.headers?.origin || process.env.URL || 'http://localhost:8888';
    return json(200, {
      email: normalizedEmail,
      role,
      inviteUrl: `${origin.replace(/\/$/, '')}/accept-invite?token=${token}`,
      expiresInDays: 14,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
