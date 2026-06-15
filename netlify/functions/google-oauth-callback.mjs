import { completeGoogleOAuth, getSiteOrigin } from './_google.mjs';

export async function handler(event) {
  const origin = getSiteOrigin(event);
  const params = new URLSearchParams(event.rawQuery || '');

  try {
    if (params.get('error')) {
      throw new Error(params.get('error_description') || params.get('error') || 'Google OAuth was cancelled.');
    }

    await completeGoogleOAuth(event, params.get('code'), params.get('state'));
    return redirect(`${origin}/?google=connected`);
  } catch (error) {
    const message = encodeURIComponent(error instanceof Error ? error.message : 'Google OAuth failed.');
    return redirect(`${origin}/?google=error&message=${message}`);
  }
}

function redirect(location) {
  return {
    statusCode: 302,
    headers: {
      location,
      'cache-control': 'no-store',
    },
    body: '',
  };
}
