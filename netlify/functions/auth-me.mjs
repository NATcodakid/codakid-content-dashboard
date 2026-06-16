import {
  createCsrfToken,
  csrfCookie,
  databaseEnvStatus,
  ensureAuthSchema,
  errorResponse,
  getCsrfToken,
  getCurrentUser,
  json,
  publicUser,
} from './_auth.mjs';

export async function handler(event) {
  try {
    const database = databaseEnvStatus();
    if (!database.configured) {
      return json(503, {
        authenticated: false,
        user: null,
        bootstrapConfigured: Boolean(process.env.DASHBOARD_ADMIN_EMAIL && process.env.DASHBOARD_ADMIN_PASSWORD),
        databaseConfigured: false,
        database,
      });
    }

    await ensureAuthSchema();
    const user = await getCurrentUser(event);
    const csrfToken = user ? getCsrfToken(event) || createCsrfToken() : '';
    return json(user ? 200 : 401, {
      authenticated: Boolean(user),
      user: user ? publicUser(user) : null,
      csrfToken: csrfToken || undefined,
      bootstrapConfigured: Boolean(process.env.DASHBOARD_ADMIN_EMAIL && process.env.DASHBOARD_ADMIN_PASSWORD),
      adminEmailConfigured: Boolean(process.env.DASHBOARD_ADMIN_EMAIL),
      adminPasswordConfigured: Boolean(process.env.DASHBOARD_ADMIN_PASSWORD),
      databaseConfigured: database.configured,
      database,
    }, user && csrfToken !== getCsrfToken(event) ? {
      'set-cookie': csrfCookie(event, csrfToken),
    } : undefined);
  } catch (error) {
    return errorResponse(error);
  }
}
