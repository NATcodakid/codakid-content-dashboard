import {
  createSession,
  createCsrfToken,
  csrfCookie,
  errorResponse,
  getSql,
  hashPassword,
  hashToken,
  json,
  parseJsonBody,
  publicUser,
  sessionCookie,
  validatePassword,
} from './_auth.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST required' });

  try {
    const { token, name = '', password } = parseJsonBody(event);
    if (!token) return json(400, { error: 'Invite token required.' });
    validatePassword(password);

    const sql = getSql();
    const invitations = await sql`
      select *
      from dashboard_invitations
      where token_hash = ${hashToken(token)}
        and accepted_at is null
        and expires_at > now()
      order by created_at desc
      limit 1
    `;
    const invite = invitations[0];
    if (!invite) return json(400, { error: 'Invite is invalid or expired.' });

    const { salt, hash } = hashPassword(password);
    const users = await sql`
      update dashboard_users
      set name = coalesce(nullif(${name}, ''), name, ${invite.name}, email),
          role = ${invite.role},
          status = 'active',
          password_hash = ${hash},
          password_salt = ${salt},
          accepted_at = now()
      where email = ${invite.email}
      returning id, email, name, role, status
    `;

    await sql`update dashboard_invitations set accepted_at = now() where id = ${invite.id}`;
    const user = users[0];
    const sessionToken = await createSession(user.id);
    const csrfToken = createCsrfToken();

    return json(200, { authenticated: true, user: publicUser(user), csrfToken }, {
      'set-cookie': [sessionCookie(event, sessionToken), csrfCookie(event, csrfToken)],
    });
  } catch (error) {
    return errorResponse(error);
  }
}
