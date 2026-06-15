import {
  ensureAuthSchema,
  errorResponse,
  getSql,
  hashPassword,
  json,
  normalizeEmail,
  parseJsonBody,
  publicUser,
  validatePassword,
} from './_auth.mjs';
import { randomUUID } from 'node:crypto';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST required' });

  try {
    await ensureAuthSchema();
    const sql = getSql();
    const countRows = await sql`select count(*)::int as count from dashboard_users`;
    if (countRows[0]?.count > 0) {
      return json(409, { error: 'Bootstrap is closed because a dashboard user already exists.' });
    }

    const { email, password, name = 'Admin' } = parseJsonBody(event);
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !normalizedEmail.includes('@')) return json(400, { error: 'Valid email required.' });
    validatePassword(password);

    const { salt, hash } = hashPassword(password);
    const users = await sql`
      insert into dashboard_users (id, email, name, role, status, password_hash, password_salt, accepted_at)
      values (${randomUUID()}, ${normalizedEmail}, ${name}, 'admin', 'active', ${hash}, ${salt}, now())
      returning id, email, name, role, status
    `;

    return json(201, {
      created: true,
      user: publicUser(users[0]),
      message: 'First admin created. Bootstrap is now closed.',
    });
  } catch (error) {
    return errorResponse(error);
  }
}
