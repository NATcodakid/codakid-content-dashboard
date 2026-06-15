import { createGoogleAuthUrl } from './_google.mjs';
import { errorResponse, requireAdmin } from './_auth.mjs';

export async function handler(event) {
  try {
    const user = await requireAdmin(event);
    const url = await createGoogleAuthUrl(event, user.id);
    return {
      statusCode: 302,
      headers: {
        location: url,
        'cache-control': 'no-store',
      },
      body: '',
    };
  } catch (error) {
    return errorResponse(error);
  }
}
