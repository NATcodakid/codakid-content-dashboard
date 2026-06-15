import { clearSessionCookie, destroySession, errorResponse, json } from './_auth.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST required' });

  try {
    await destroySession(event);
    return json(200, { authenticated: false }, {
      'set-cookie': clearSessionCookie(event),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
