import { neon } from '@neondatabase/serverless';
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from 'node:crypto';

const SESSION_COOKIE = 'ck_content_session';
const CSRF_COOKIE = 'ck_content_csrf';
const SESSION_DAYS = 30;
const DATABASE_ENV_KEYS = [
  'NETLIFY_DATABASE_URL',
  'DATABASE_URL',
  'NEON_DATABASE_URL',
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL_NON_POOLING',
  'POSTGRES_URL_NO_SSL',
  'POSTGRES_URL_UNPOOLED',
  'NEON_DATABASE_URL_UNPOOLED',
];

let schemaReady = false;
let sqlClient;

export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function getSql() {
  const url = getDatabaseUrl();
  if (!url) {
    const present = DATABASE_ENV_KEYS.filter((key) => Boolean(process.env[key]));
    const error = new HttpError(500, 'Neon database URL is not configured.');
    error.meta = {
      expectedKeys: DATABASE_ENV_KEYS,
      presentExpectedKeys: present,
    };
    throw error;
  }
  if (!sqlClient) sqlClient = neon(url);
  return sqlClient;
}

export function getDatabaseUrl() {
  return DATABASE_ENV_KEYS.map((key) => process.env[key]).find(Boolean);
}

export function databaseEnvStatus() {
  return {
    configured: Boolean(getDatabaseUrl()),
    expectedKeys: DATABASE_ENV_KEYS,
    presentExpectedKeys: DATABASE_ENV_KEYS.filter((key) => Boolean(process.env[key])),
  };
}

export async function ensureAuthSchema() {
  if (schemaReady) return;
  const sql = getSql();

  await sql`
    create table if not exists dashboard_users (
      id text primary key,
      email text not null unique,
      name text not null default '',
      role text not null default 'viewer',
      status text not null default 'active',
      password_hash text,
      password_salt text,
      invited_by text,
      created_at timestamptz not null default now(),
      accepted_at timestamptz
    )
  `;

  await sql`
    create table if not exists dashboard_invitations (
      id text primary key,
      email text not null,
      name text not null default '',
      role text not null default 'viewer',
      token_hash text not null unique,
      invited_by text not null,
      expires_at timestamptz not null,
      accepted_at timestamptz,
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists dashboard_sessions (
      id text primary key,
      user_id text not null references dashboard_users(id) on delete cascade,
      token_hash text not null unique,
      expires_at timestamptz not null,
      created_at timestamptz not null default now(),
      last_seen_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists google_oauth_states (
      state_hash text primary key,
      user_id text not null references dashboard_users(id) on delete cascade,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists google_search_console_connections (
      id text primary key,
      user_id text not null references dashboard_users(id) on delete cascade,
      google_email text not null default '',
      access_token_encrypted text,
      refresh_token_encrypted text,
      token_type text,
      scope text,
      expires_at timestamptz,
      connected_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists google_search_console_properties (
      site_url text primary key,
      permission_level text,
      selected boolean not null default false,
      last_seen_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists google_search_console_snapshots (
      id text primary key,
      site_url text not null,
      start_date date not null,
      end_date date not null,
      dimensions text not null,
      data jsonb not null,
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists dashboard_pillars (
      url text primary key,
      raw_url text not null default '',
      title text not null default '',
      cluster text not null default '',
      note text not null default '',
      marked_by text,
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists dashboard_competitors (
      domain text primary key,
      label text not null default '',
      category text not null default 'coding education',
      status text not null default 'active',
      notes text not null default '',
      created_by text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists dashboard_action_items (
      id text primary key,
      fingerprint text not null unique,
      type text not null default 'general',
      source text not null default 'manual',
      title text not null default '',
      detail text not null default '',
      page_url text not null default '',
      keyword text not null default '',
      cluster text not null default '',
      priority_score integer not null default 0,
      status text not null default 'todo',
      owner text not null default '',
      due_date date,
      completed_at timestamptz,
      created_by text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists dashboard_preferences (
      user_id text not null references dashboard_users(id) on delete cascade,
      key text not null,
      value jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now(),
      primary key (user_id, key)
    )
  `;

  await sql`
    create table if not exists ai_visibility_prompts (
      id text primary key,
      prompt text not null unique,
      cluster text not null default '',
      status text not null default 'active',
      created_by text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists ai_visibility_runs (
      id text primary key,
      prompt_id text,
      prompt text not null default '',
      model text not null default '',
      answer text not null default '',
      codakid_mentioned boolean not null default false,
      codakid_sentiment text not null default 'unknown',
      competitors jsonb not null default '[]'::jsonb,
      recommendations jsonb not null default '[]'::jsonb,
      created_by text,
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists ai_content_ideas (
      id text primary key,
      title text not null default '',
      target_keyword text not null default '',
      intent text not null default '',
      cluster text not null default '',
      pillar_url text not null default '',
      priority_score integer not null default 0,
      brief jsonb not null default '{}'::jsonb,
      status text not null default 'idea',
      source text not null default 'openai',
      created_by text,
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists technical_audit_snapshots (
      id text primary key,
      health_score integer not null default 0,
      summary jsonb not null default '{}'::jsonb,
      issue_count integer not null default 0,
      high_count integer not null default 0,
      medium_count integer not null default 0,
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists serp_snapshots (
      id text primary key,
      keyword text not null,
      location text not null default 'United States',
      country text not null default 'us',
      language text not null default 'en',
      codakid_position integer,
      codakid_url text not null default '',
      organic jsonb not null default '[]'::jsonb,
      people_also_ask jsonb not null default '[]'::jsonb,
      related_searches jsonb not null default '[]'::jsonb,
      credits_used integer not null default 1,
      fetched_at timestamptz not null default now(),
      created_by text
    )
  `;

  await sql`
    create table if not exists tracked_keywords (
      id text primary key,
      keyword text not null unique,
      cluster text not null default '',
      target_url text not null default '',
      intent text not null default 'informational',
      priority integer not null default 50,
      cadence text not null default 'weekly',
      status text not null default 'active',
      source text not null default 'seed',
      notes text not null default '',
      last_tracked_at timestamptz,
      created_by text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists wordpress_snapshots (
      id text primary key,
      source text not null default 'wordpress-rest',
      ok boolean not null default true,
      post_count integer not null default 0,
      data jsonb not null,
      error text not null default '',
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists ga4_snapshots (
      id text primary key,
      property_id text not null,
      start_date date not null,
      end_date date not null,
      dimensions text not null,
      metrics text not null,
      data jsonb not null,
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists pagespeed_snapshots (
      id text primary key,
      url text not null,
      strategy text not null default 'mobile',
      performance integer,
      seo integer,
      accessibility integer,
      best_practices integer,
      lcp_ms integer,
      cls_x1000 integer,
      inp_ms integer,
      fcp_ms integer,
      ttfb_ms integer,
      field_lcp_ms integer,
      field_cls_x1000 integer,
      field_inp_ms integer,
      overall_category text not null default '',
      data jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists domain_authority_snapshots (
      id text primary key,
      domain text not null,
      page_rank numeric,
      rank integer,
      status_code integer not null default 0,
      error text not null default '',
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists dashboard_audit_log (
      id text primary key,
      user_id text,
      email text not null default '',
      action text not null,
      resource text not null default '',
      detail jsonb not null default '{}'::jsonb,
      ip text not null default '',
      user_agent text not null default '',
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists dashboard_rate_limits (
      key text primary key,
      count integer not null default 0,
      reset_at timestamptz not null
    )
  `;

  await sql`create index if not exists dashboard_sessions_user_id_idx on dashboard_sessions(user_id)`;
  await sql`create index if not exists dashboard_sessions_expires_at_idx on dashboard_sessions(expires_at)`;
  await sql`create index if not exists google_oauth_states_expires_at_idx on google_oauth_states(expires_at)`;
  await sql`create index if not exists gsc_snapshots_site_dates_idx on google_search_console_snapshots(site_url, start_date, end_date)`;
  await sql`create index if not exists dashboard_competitors_status_idx on dashboard_competitors(status, domain)`;
  await sql`create index if not exists dashboard_action_items_status_idx on dashboard_action_items(status, priority_score desc)`;
  await sql`create index if not exists dashboard_action_items_type_idx on dashboard_action_items(type, source)`;
  await sql`create index if not exists ai_visibility_prompts_status_idx on ai_visibility_prompts(status, cluster)`;
  await sql`create index if not exists ai_visibility_runs_prompt_created_idx on ai_visibility_runs(prompt_id, created_at desc)`;
  await sql`create index if not exists ai_content_ideas_status_priority_idx on ai_content_ideas(status, priority_score desc, created_at desc)`;
  await sql`create index if not exists technical_audit_snapshots_created_idx on technical_audit_snapshots(created_at desc)`;
  await sql`create index if not exists serp_snapshots_keyword_fetched_idx on serp_snapshots(keyword, fetched_at desc)`;
  await sql`create index if not exists tracked_keywords_status_priority_idx on tracked_keywords(status, priority desc)`;
  await sql`create index if not exists tracked_keywords_last_tracked_idx on tracked_keywords(last_tracked_at asc nulls first)`;
  await sql`create index if not exists wordpress_snapshots_created_idx on wordpress_snapshots(created_at desc)`;
  await sql`create index if not exists ga4_snapshots_property_dates_idx on ga4_snapshots(property_id, start_date, end_date, created_at desc)`;
  await sql`create index if not exists pagespeed_snapshots_url_created_idx on pagespeed_snapshots(url, strategy, created_at desc)`;
  await sql`create index if not exists domain_authority_snapshots_domain_created_idx on domain_authority_snapshots(domain, created_at desc)`;
  await sql`create index if not exists dashboard_audit_log_created_idx on dashboard_audit_log(created_at desc)`;
  await sql`create index if not exists dashboard_rate_limits_reset_idx on dashboard_rate_limits(reset_at)`;
  await seedCompetitors(sql);
  await seedAiVisibilityPrompts(sql);
  await seedTrackedKeywords(sql);
  await syncEnvAdmin(sql);
  schemaReady = true;
}

export async function getCurrentUser(event) {
  await ensureAuthSchema();
  const token = getCookie(event, SESSION_COOKIE);
  if (!token) return null;

  const sql = getSql();
  const rows = await sql`
    select
      u.id,
      u.email,
      u.name,
      u.role,
      u.status,
      s.id as session_id,
      s.expires_at
    from dashboard_sessions s
    join dashboard_users u on u.id = s.user_id
    where s.token_hash = ${hashToken(token)}
      and s.expires_at > now()
      and u.status = 'active'
    limit 1
  `;

  const user = rows[0];
  if (!user) return null;

  await sql`update dashboard_sessions set last_seen_at = now() where id = ${user.session_id}`;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
  };
}

export async function requireUser(event) {
  const user = await getCurrentUser(event);
  if (!user) throw new HttpError(401, 'Login required.');
  return user;
}

export async function requireAdmin(event) {
  const user = await requireUser(event);
  if (user.role !== 'admin') throw new HttpError(403, 'Admin access required.');
  return user;
}

export async function createSession(userId) {
  const sql = getSql();
  const token = randomBytes(32).toString('base64url');
  await sql`
    insert into dashboard_sessions (id, user_id, token_hash, expires_at)
    values (${randomUUID()}, ${userId}, ${hashToken(token)}, now() + (${SESSION_DAYS} * interval '1 day'))
  `;
  return token;
}

export async function destroySession(event) {
  await ensureAuthSchema();
  const token = getCookie(event, SESSION_COOKIE);
  if (!token) return;
  const sql = getSql();
  await sql`delete from dashboard_sessions where token_hash = ${hashToken(token)}`;
}

export function sessionCookie(event, token) {
  const secure = isSecureRequest(event) ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 60 * 60}${secure}`;
}

export function createCsrfToken() {
  return randomBytes(24).toString('base64url');
}

export function csrfCookie(event, token) {
  const secure = isSecureRequest(event) ? '; Secure' : '';
  return `${CSRF_COOKIE}=${token}; Path=/; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 60 * 60}${secure}`;
}

export function getCsrfToken(event) {
  return getCookie(event, CSRF_COOKIE);
}

export function clearSessionCookie(event) {
  const secure = isSecureRequest(event) ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function clearCsrfCookie(event) {
  const secure = isSecureRequest(event) ? '; Secure' : '';
  return `${CSRF_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}

export function json(statusCode, body, headers = {}) {
  const nextHeaders = {
    'content-type': 'application/json',
    ...headers,
  };
  const setCookie = nextHeaders['set-cookie'] || nextHeaders['Set-Cookie'];
  delete nextHeaders['set-cookie'];
  delete nextHeaders['Set-Cookie'];

  const response = {
    statusCode,
    headers: nextHeaders,
    body: JSON.stringify(body),
  };

  if (setCookie) {
    response.multiValueHeaders = {
      'set-cookie': Array.isArray(setCookie) ? setCookie : [setCookie],
    };
  }

  return response;
}

export function secureJson(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

export function errorResponse(error) {
  const statusCode = error?.statusCode || 500;
  return json(statusCode, {
    error: statusCode === 500 ? 'Server error' : error.message,
    detail: statusCode === 500 && error instanceof Error ? error.message : undefined,
    diagnostic: error?.meta,
  });
}

export function parseJsonBody(event) {
  try {
    return JSON.parse(event.body || '{}');
  } catch {
    throw new HttpError(400, 'Invalid JSON body.');
  }
}

export function requireCsrf(event) {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(event.httpMethod)) return;
  const cookieToken = getCookie(event, CSRF_COOKIE);
  const headerToken = event.headers?.['x-codakid-csrf'] || event.headers?.['X-Codakid-Csrf'];
  if (!cookieToken || !headerToken || !safeStringEqual(String(cookieToken), String(headerToken))) {
    throw new HttpError(403, 'Security check failed. Refresh the dashboard and try again.');
  }
}

export async function audit(event, user, action, resource = '', detail = {}) {
  try {
    const sql = getSql();
    await sql`
      insert into dashboard_audit_log (id, user_id, email, action, resource, detail, ip, user_agent)
      values (
        ${randomUUID()},
        ${user?.id || ''},
        ${user?.email || ''},
        ${action},
        ${resource},
        ${JSON.stringify(detail || {})},
        ${clientIp(event)},
        ${event.headers?.['user-agent'] || event.headers?.['User-Agent'] || ''}
      )
    `;
  } catch {
    // Auditing should not break the user workflow.
  }
}

export async function assertRateLimit(key, { limit, windowSeconds }) {
  const sql = getSql();
  await sql`delete from dashboard_rate_limits where reset_at <= now()`;
  const rows = await sql`
    insert into dashboard_rate_limits (key, count, reset_at)
    values (${key}, 1, now() + (${windowSeconds} * interval '1 second'))
    on conflict (key) do update set
      count = case
        when dashboard_rate_limits.reset_at <= now() then 1
        else dashboard_rate_limits.count + 1
      end,
      reset_at = case
        when dashboard_rate_limits.reset_at <= now() then now() + (${windowSeconds} * interval '1 second')
        else dashboard_rate_limits.reset_at
      end
    returning count, reset_at
  `;
  const current = rows[0];
  if (current?.count > limit) {
    const error = new HttpError(429, `Rate limit reached. Try again after ${new Date(current.reset_at).toLocaleString()}.`);
    error.meta = { limit, resetAt: current.reset_at };
    throw error;
  }
  return current;
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 12) {
    throw new HttpError(400, 'Password must be at least 12 characters.');
  }
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, hash) {
  if (!password || !salt || !hash) return false;
  const actual = Buffer.from(scryptSync(password, salt, 64).toString('hex'), 'hex');
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
  };
}

async function seedCompetitors(sql) {
  const rows = await sql`select count(*)::int as count from dashboard_competitors`;
  if (Number(rows[0]?.count || 0) > 0) return;

  const competitors = [
    ['tynker.com', 'Tynker', 'self-paced coding platform', 'Game-based coding and Minecraft/Python content.'],
    ['code.org', 'Code.org', 'free coding curriculum', 'High-authority curriculum and Hour of Code content.'],
    ['codewizardshq.com', 'CodeWizardsHQ', 'live coding classes', 'Strong parent-guide and coding class comparison content.'],
    ['codemonkey.com', 'CodeMonkey', 'game-based coding platform', 'Game-based coding classes and coding website guides.'],
    ['codecombat.com', 'CodeCombat', 'game-based coding platform', 'Game-led Python and JavaScript learning.'],
    ['junilearning.com', 'Juni Learning', 'online tutoring', 'Private online coding and STEM tutoring.'],
    ['idtech.com', 'iD Tech', 'camp and classes', 'Summer camp and coding class landing pages.'],
    ['scratch.mit.edu', 'Scratch', 'free beginner coding', 'High-authority beginner/block coding destination.'],
    ['khanacademy.org', 'Khan Academy', 'free learning platform', 'Free programming and CS learning content.'],
    ['kodable.com', 'Kodable', 'elementary coding platform', 'Younger-kid coding and school curriculum content.'],
  ];

  for (const [domain, label, category, notes] of competitors) {
    await sql`
      insert into dashboard_competitors (domain, label, category, notes, created_by)
      values (${domain}, ${label}, ${category}, ${notes}, 'seed')
      on conflict (domain) do nothing
    `;
  }
}

async function seedAiVisibilityPrompts(sql) {
  const rows = await sql`select count(*)::int as count from ai_visibility_prompts`;
  if (Number(rows[0]?.count || 0) > 0) return;

  const prompts = [
    ['What are the best online coding classes for kids?', 'Coding for Kids'],
    ['What is the best way for a child to learn Python?', 'Python'],
    ['Best Minecraft coding course for kids', 'Minecraft'],
    ['Best Roblox coding classes for beginners', 'Roblox'],
    ['Coding classes for homeschool kids', 'Homeschool'],
    ['Safe AI and coding classes for kids', 'AI'],
  ];

  for (const [prompt, cluster] of prompts) {
    await sql`
      insert into ai_visibility_prompts (id, prompt, cluster, created_by)
      values (${randomUUID()}, ${prompt}, ${cluster}, 'seed')
      on conflict (prompt) do nothing
    `;
  }
}

async function seedTrackedKeywords(sql) {
  const rows = await sql`select count(*)::int as count from tracked_keywords`;
  if (Number(rows[0]?.count || 0) > 0) return;

  const starterKeywords = [
    ['coding for kids', 'Coding for Kids', 'https://codakid.com/coding-for-kids-the-ultimate-guide-for-parents-2/', 'pillar', 100],
    ['online coding classes for kids', 'Coding for Kids', '', 'commercial', 95],
    ['coding classes for kids', 'Coding for Kids', '', 'commercial', 94],
    ['kids coding', 'Coding for Kids', 'https://codakid.com/coding-for-kids-the-ultimate-guide-for-parents-2/', 'informational', 88],
    ['computer coding for kids', 'Coding for Kids', 'https://codakid.com/coding-for-kids-the-ultimate-guide-for-parents-2/', 'informational', 86],
    ['programming for kids', 'Coding for Kids', '', 'informational', 82],
    ['coding for teens', 'Coding for Kids', '', 'commercial', 72],
    ['python for kids', 'Python', '', 'commercial', 86],
    ['python coding for kids', 'Python', '', 'commercial', 84],
    ['minecraft coding for kids', 'Minecraft', '', 'commercial', 90],
    ['minecraft modding for kids', 'Minecraft', '', 'commercial', 88],
    ['minecraft java coding for kids', 'Minecraft', '', 'commercial', 78],
    ['roblox coding for kids', 'Roblox', '', 'commercial', 88],
    ['roblox scripting for kids', 'Roblox', '', 'commercial', 82],
    ['lua coding for kids', 'Roblox', '', 'informational', 70],
    ['scratch coding for kids', 'Scratch', '', 'commercial', 72],
    ['game coding for kids', 'Game Development', '', 'commercial', 80],
    ['coding camps for kids', 'Camps', '', 'commercial', 82],
    ['online coding camp for kids', 'Camps', '', 'commercial', 78],
    ['homeschool coding curriculum', 'Homeschool', '', 'commercial', 70],
    ['ai classes for kids', 'AI', '', 'commercial', 84],
    ['artificial intelligence for kids', 'AI', '', 'informational', 78],
    ['ai for kids', 'AI', '', 'informational', 76],
  ];

  for (const [keyword, cluster, targetUrl, intent, priority] of starterKeywords) {
    await sql`
      insert into tracked_keywords (id, keyword, cluster, target_url, intent, priority, source)
      values (${randomUUID()}, ${keyword}, ${cluster}, ${targetUrl}, ${intent}, ${priority}, 'seed')
      on conflict (keyword) do nothing
    `;
  }
}

async function syncEnvAdmin(sql) {
  const email = normalizeEmail(process.env.DASHBOARD_ADMIN_EMAIL);
  const password = process.env.DASHBOARD_ADMIN_PASSWORD;
  if (!email || !password) return;
  validatePassword(password);

  const existingRows = await sql`
    select id, password_hash, password_salt
    from dashboard_users
    where email = ${email}
    limit 1
  `;
  const existing = existingRows[0];

  if (existing && verifyPassword(password, existing.password_salt, existing.password_hash)) {
    await sql`
      update dashboard_users
      set role = 'admin',
          status = 'active',
          accepted_at = coalesce(accepted_at, now())
      where id = ${existing.id}
    `;
    return;
  }

  const { salt, hash } = hashPassword(password);
  const users = await sql`
    insert into dashboard_users (id, email, name, role, status, password_hash, password_salt, accepted_at)
    values (${randomUUID()}, ${email}, 'Admin', 'admin', 'active', ${hash}, ${salt}, now())
    on conflict (email) do update
      set role = 'admin',
          status = 'active',
          password_hash = excluded.password_hash,
          password_salt = excluded.password_salt,
          accepted_at = coalesce(dashboard_users.accepted_at, now())
    returning id
  `;

  if (users[0]?.id) {
    await sql`delete from dashboard_sessions where user_id = ${users[0].id}`;
  }
}

function getCookie(event, name) {
  const header = event.headers?.cookie || event.headers?.Cookie || '';
  return header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function clientIp(event) {
  return String(
    event.headers?.['x-nf-client-connection-ip'] ||
      event.headers?.['client-ip'] ||
      event.headers?.['x-forwarded-for'] ||
      '',
  ).split(',')[0].trim();
}

function safeStringEqual(a, b) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

function isSecureRequest(event) {
  return (
    event.headers?.['x-forwarded-proto'] === 'https' ||
    event.headers?.['X-Forwarded-Proto'] === 'https' ||
    process.env.CONTEXT === 'production' ||
    process.env.URL?.startsWith('https://')
  );
}
