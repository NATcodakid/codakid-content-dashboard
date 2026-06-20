import { createCipheriv, createDecipheriv, createHash, createSign, randomBytes, randomUUID } from 'node:crypto';
import { HttpError, getSql, hashToken } from './_auth.mjs';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GSC_API_BASE = 'https://www.googleapis.com/webmasters/v3';
const GA4_API_BASE = 'https://analyticsdata.googleapis.com/v1beta';
const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const GA4_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const USER_SCOPE = 'openid email';
const SERVICE_ACCOUNT_SCOPES = `${GSC_SCOPE} ${GA4_SCOPE}`;

let serviceAccountCredentialsCache;
let serviceAccountTokenCache;

export function googleOAuthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleServiceAccountConfigured() {
  try {
    return Boolean(getServiceAccountCredentials());
  } catch {
    return false;
  }
}

export function getRedirectUri(event) {
  return `${getSiteOrigin(event)}/api/google/oauth/callback`;
}

export function getSiteOrigin(event) {
  const configured = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.SITE_URL;
  if (configured) return configured.replace(/\/$/, '');

  const host = event.headers?.host || event.headers?.Host;
  const proto = event.headers?.['x-forwarded-proto'] || 'https';
  if (!host) return 'https://codakidblogdashboard.netlify.app';
  return `${proto}://${host}`;
}

export async function createGoogleAuthUrl(event, userId) {
  assertGoogleConfigured();
  const sql = getSql();
  const state = randomBytes(32).toString('base64url');
  await sql`delete from google_oauth_states where expires_at <= now()`;
  await sql`
    insert into google_oauth_states (state_hash, user_id, expires_at)
    values (${hashToken(state)}, ${userId}, now() + interval '15 minutes')
  `;

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: getRedirectUri(event),
    response_type: 'code',
    scope: `${GSC_SCOPE} ${GA4_SCOPE} ${USER_SCOPE}`,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function completeGoogleOAuth(event, code, state) {
  assertGoogleConfigured();
  if (!code || !state) throw new HttpError(400, 'Missing Google OAuth code or state.');

  const sql = getSql();
  const states = await sql`
    delete from google_oauth_states
    where state_hash = ${hashToken(state)}
      and expires_at > now()
    returning user_id
  `;
  const userId = states[0]?.user_id;
  if (!userId) throw new HttpError(400, 'Google OAuth session expired. Start the connection again.');

  const tokenData = await exchangeCodeForToken(event, code);
  const userInfo = await fetchGoogleUserInfo(tokenData.access_token);
  await saveGoogleConnection(userId, tokenData, userInfo.email || '');
  const properties = await syncSearchConsoleProperties();

  return {
    googleEmail: userInfo.email || '',
    properties,
  };
}

export async function googleConnectionStatus() {
  const sql = getSql();
  const rows = await sql`
    select google_email, scope, expires_at, connected_at, updated_at
    from google_search_console_connections
    order by updated_at desc
    limit 1
  `;
  const properties = await sql`
    select site_url, permission_level, selected, last_seen_at
    from google_search_console_properties
    order by selected desc, site_url asc
  `;

  const serviceAccount = getServiceAccountCredentials({ optional: true });
  const configuredSite = configuredGscSiteUrl();
  const serviceProperty = configuredSite && !properties.some((row) => row.site_url === configuredSite)
    ? [{ site_url: configuredSite, permission_level: 'serviceAccount', selected: true, last_seen_at: null }]
    : [];
  return {
    configured: Boolean(serviceAccount) || googleOAuthConfigured(),
    connected: Boolean(serviceAccount) || Boolean(rows[0]),
    authenticationMode: serviceAccount ? 'service-account' : rows[0] ? 'oauth' : 'none',
    analyticsScopeReady: Boolean(serviceAccount) || hasScope(rows[0]?.scope, GA4_SCOPE),
    connection: serviceAccount
      ? { google_email: serviceAccount.client_email, scope: SERVICE_ACCOUNT_SCOPES, service_account: true }
      : rows[0] || null,
    properties: [...serviceProperty, ...properties],
    redirectUri: process.env.URL ? `${process.env.URL.replace(/\/$/, '')}/api/google/oauth/callback` : 'https://codakidblogdashboard.netlify.app/api/google/oauth/callback',
  };
}

export async function syncSearchConsoleProperties() {
  const data = await gscFetch('/sites');
  const entries = data.siteEntry || [];
  const sql = getSql();

  for (const site of entries) {
    await sql`
      insert into google_search_console_properties (site_url, permission_level, selected, last_seen_at)
      values (${site.siteUrl}, ${site.permissionLevel || ''}, ${isLikelyCodakidProperty(site.siteUrl)}, now())
      on conflict (site_url) do update set
        permission_level = excluded.permission_level,
        selected = google_search_console_properties.selected or excluded.selected,
        last_seen_at = now()
    `;
  }

  if (entries.length && !entries.some((site) => isLikelyCodakidProperty(site.siteUrl))) {
    await sql`
      update google_search_console_properties
      set selected = true
      where site_url = ${entries[0].siteUrl}
    `;
  }

  return entries;
}

export async function syncSearchAnalytics() {
  const sql = getSql();
  const selectedRows = await sql`
    select site_url
    from google_search_console_properties
    where selected = true
    order by site_url asc
    limit 1
  `;
  const siteUrl = configuredGscSiteUrl() || selectedRows[0]?.site_url;
  if (!siteUrl) throw new HttpError(400, 'No Search Console property selected.');

  await sql`
    insert into google_search_console_properties (site_url, permission_level, selected, last_seen_at)
    values (${siteUrl}, ${googleServiceAccountConfigured() ? 'serviceAccount' : ''}, true, now())
    on conflict (site_url) do update set selected = true, last_seen_at = now()
  `;

  const endDate = dateDaysAgo(3);
  const startDate = dateDaysAgo(93);
  const dimensionsToFetch = [
    ['page'],
    ['query'],
    ['page', 'query'],
    ['date'],
    ['page', 'date'],
  ];
  const snapshots = await Promise.all(dimensionsToFetch.map(async (dimensions) => {
    const dimensionKey = dimensions.join(',');
    const body = {
      startDate,
      endDate,
      dimensions,
      rowLimit: dimensionKey === 'page,date' ? 25000 : dimensionKey === 'page,query' ? 15000 : 5000,
      searchType: 'web',
    };
    const data = await gscFetch(`/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    await sql`
      insert into google_search_console_snapshots (id, site_url, start_date, end_date, dimensions, data)
      values (${randomUUID()}, ${siteUrl}, ${startDate}, ${endDate}, ${dimensionKey}, ${JSON.stringify(data)})
    `;
    return { dimensions, rowCount: data.rows?.length || 0 };
  }));

  return { siteUrl, startDate, endDate, snapshots };
}

export async function latestSearchConsoleSnapshot() {
  const sql = getSql();
  const rows = await sql`
    select site_url, start_date, end_date, dimensions, data, created_at
    from google_search_console_snapshots
    order by created_at desc
    limit 12
  `;
  return rows;
}

export function ga4Configured() {
  return Boolean(ga4PropertyId());
}

export function ga4PropertyId() {
  return String(
    process.env.GA4_PROPERTY_ID ||
      process.env.GOOGLE_ANALYTICS_PROPERTY_ID ||
      process.env.VITE_GA4_PROPERTY_ID ||
      '',
  ).trim();
}

export async function ga4RunReport(body) {
  const propertyId = ga4PropertyId();
  if (!propertyId) throw new HttpError(500, 'GA4_PROPERTY_ID is not configured.');
  const data = await googleFetch(`${GA4_API_BASE}/properties/${propertyId}:runReport`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return { propertyId, data };
}

export async function googleConnectionHasAnalyticsScope() {
  const sql = getSql();
  const rows = await sql`
    select scope
    from google_search_console_connections
    order by updated_at desc
    limit 1
  `;
  return hasScope(rows[0]?.scope, GA4_SCOPE);
}

async function gscFetch(path, options = {}) {
  return googleFetch(`${GSC_API_BASE}${path}`, options, 'Google Search Console request failed.');
}

async function googleFetch(url, options = {}, fallbackMessage = 'Google API request failed.') {
  const accessToken = await getValidAccessToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(response.status, data.error?.message || fallbackMessage);
  }
  return data;
}

async function getValidAccessToken() {
  if (googleServiceAccountConfigured()) return getServiceAccountAccessToken();

  const sql = getSql();
  const rows = await sql`
    select id, access_token_encrypted, refresh_token_encrypted, expires_at
    from google_search_console_connections
    order by updated_at desc
    limit 1
  `;
  const connection = rows[0];
  if (!connection) throw new HttpError(400, 'Google Search Console is not connected.');

  const accessToken = decryptToken(connection.access_token_encrypted);
  const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : 0;
  if (accessToken && expiresAt > Date.now() + 60000) return accessToken;

  const refreshToken = decryptToken(connection.refresh_token_encrypted);
  if (!refreshToken) throw new HttpError(400, 'Google refresh token is missing. Reconnect Search Console.');
  const tokenData = await refreshAccessToken(refreshToken);
  await sql`
    update google_search_console_connections
    set access_token_encrypted = ${encryptToken(tokenData.access_token)},
        expires_at = ${new Date(Date.now() + Number(tokenData.expires_in || 3600) * 1000).toISOString()},
        updated_at = now()
    where id = ${connection.id}
  `;
  return tokenData.access_token;
}

async function getServiceAccountAccessToken() {
  if (serviceAccountTokenCache?.token && serviceAccountTokenCache.expiresAt > Date.now() + 60000) {
    return serviceAccountTokenCache.token;
  }

  const credentials = getServiceAccountCredentials();
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJwtPart({ alg: 'RS256', typ: 'JWT' });
  const claim = encodeJwtPart({
    iss: credentials.client_email,
    scope: SERVICE_ACCOUNT_SCOPES,
    aud: credentials.token_uri || GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  });
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  signer.end();
  const assertion = `${header}.${claim}.${signer.sign(credentials.private_key, 'base64url')}`;
  const response = await fetch(credentials.token_uri || GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new HttpError(response.status || 500, data.error_description || data.error || 'Google service account authentication failed.');
  }
  serviceAccountTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
  return serviceAccountTokenCache.token;
}

function getServiceAccountCredentials({ optional = false } = {}) {
  if (serviceAccountCredentialsCache) return serviceAccountCredentialsCache;
  const raw = String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) {
    if (optional) return null;
    throw new HttpError(500, 'GOOGLE_SERVICE_ACCOUNT_JSON is not configured.');
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed.type !== 'service_account' || !parsed.client_email || !parsed.private_key) {
      throw new Error('Required service account fields are missing.');
    }
    serviceAccountCredentialsCache = {
      ...parsed,
      private_key: String(parsed.private_key).replace(/\\n/g, '\n'),
    };
    return serviceAccountCredentialsCache;
  } catch (error) {
    if (optional) return null;
    throw new HttpError(500, `GOOGLE_SERVICE_ACCOUNT_JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function encodeJwtPart(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function configuredGscSiteUrl() {
  return String(process.env.GSC_SITE_URL || '').trim();
}

async function exchangeCodeForToken(event, code) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: getRedirectUri(event),
      grant_type: 'authorization_code',
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new HttpError(400, data.error_description || data.error || 'Google OAuth token exchange failed.');
  return data;
}

async function refreshAccessToken(refreshToken) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new HttpError(400, data.error_description || data.error || 'Google token refresh failed.');
  return data;
}

async function fetchGoogleUserInfo(accessToken) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return {};
  return response.json();
}

async function saveGoogleConnection(userId, tokenData, googleEmail) {
  const sql = getSql();
  const existing = await sql`
    select refresh_token_encrypted
    from google_search_console_connections
    order by updated_at desc
    limit 1
  `;
  const refreshToken = tokenData.refresh_token || decryptToken(existing[0]?.refresh_token_encrypted);
  if (!refreshToken) throw new HttpError(400, 'Google did not return a refresh token. Reconnect and approve offline access.');

  await sql`
    insert into google_search_console_connections (
      id, user_id, google_email, access_token_encrypted, refresh_token_encrypted,
      token_type, scope, expires_at
    )
    values (
      ${randomUUID()}, ${userId}, ${googleEmail || ''}, ${encryptToken(tokenData.access_token)},
      ${encryptToken(refreshToken)}, ${tokenData.token_type || ''}, ${tokenData.scope || ''},
      ${new Date(Date.now() + Number(tokenData.expires_in || 3600) * 1000).toISOString()}
    )
  `;
}

function assertGoogleConfigured() {
  if (!googleOAuthConfigured()) {
    throw new HttpError(500, 'Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Netlify.');
  }
}

function encryptToken(value) {
  if (!value) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decryptToken(value) {
  if (!value) return '';
  const [ivPart, tagPart, encryptedPart] = String(value).split('.');
  if (!ivPart || !tagPart || !encryptedPart) return '';
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function encryptionKey() {
  return createHash('sha256')
    .update(process.env.GOOGLE_TOKEN_SECRET || process.env.GOOGLE_CLIENT_SECRET || getSqlSecretFallback())
    .digest();
}

function getSqlSecretFallback() {
  return process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || 'codakid-dashboard-local';
}

function isLikelyCodakidProperty(siteUrl) {
  return /codakid\.com/i.test(siteUrl || '');
}

function hasScope(scopeValue, requiredScope) {
  return String(scopeValue || '').split(/\s+/).includes(requiredScope);
}

function dateDaysAgo(days) {
  const date = new Date(Date.now() - days * 86400000);
  return date.toISOString().slice(0, 10);
}
