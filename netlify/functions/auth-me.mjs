import { ensureAuthSchema, errorResponse, getCurrentUser, json, publicUser } from './_auth.mjs';

export async function handler(event) {
  try {
    await ensureAuthSchema();
    const user = await getCurrentUser(event);
    return json(user ? 200 : 401, {
      authenticated: Boolean(user),
      user: user ? publicUser(user) : null,
      bootstrapConfigured: Boolean(process.env.DASHBOARD_ADMIN_EMAIL && process.env.DASHBOARD_ADMIN_PASSWORD),
      databaseConfigured: Boolean(process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || process.env.NEON_DATABASE_URL),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
