import {
  createSession,
  ensureAuthSchema,
  errorResponse,
  getSql,
  json,
  normalizeEmail,
  parseJsonBody,
  publicUser,
  sessionCookie,
  verifyPassword,
} from './_auth.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST required' });

  try {
    await ensureAuthSchema();
    const { email, password } = parseJsonBody(event);
    const normalizedEmail = normalizeEmail(email);
    const sql = getSql();
    const rows = await sql`
      select id, email, name, role, status, password_hash, password_salt
      from dashboard_users
      where email = ${normalizedEmail}
      limit 1
    `;
    const user = rows[0];

    if (!user || user.status !== 'active' || !verifyPassword(password, user.password_salt, user.password_hash)) {
      return json(401, { error: 'Invalid email or password.' });
    }

    const token = await createSession(user.id);
    return json(200, { authenticated: true, user: publicUser(user) }, {
      'set-cookie': sessionCookie(event, token),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
