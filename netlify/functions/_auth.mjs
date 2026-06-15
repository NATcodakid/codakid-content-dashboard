import { neon } from '@neondatabase/serverless';
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from 'node:crypto';

const SESSION_COOKIE = 'ck_content_session';
const SESSION_DAYS = 30;

let schemaReady = false;
let sqlClient;

export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function getSql() {
  const url = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!url) {
    throw new HttpError(500, 'Neon database URL is not configured.');
  }
  if (!sqlClient) sqlClient = neon(url);
  return sqlClient;
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

  await sql`create index if not exists dashboard_sessions_user_id_idx on dashboard_sessions(user_id)`;
  await sql`create index if not exists dashboard_sessions_expires_at_idx on dashboard_sessions(expires_at)`;
  await bootstrapAdmin(sql);
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

export function clearSessionCookie(event) {
  const secure = isSecureRequest(event) ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function json(statusCode, body, headers = {}) {
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
  });
}

export function parseJsonBody(event) {
  try {
    return JSON.parse(event.body || '{}');
  } catch {
    throw new HttpError(400, 'Invalid JSON body.');
  }
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

async function bootstrapAdmin(sql) {
  const countRows = await sql`select count(*)::int as count from dashboard_users`;
  if (countRows[0]?.count > 0) return;

  const email = normalizeEmail(process.env.DASHBOARD_ADMIN_EMAIL);
  const password = process.env.DASHBOARD_ADMIN_PASSWORD;
  if (!email || !password) return;
  validatePassword(password);

  const { salt, hash } = hashPassword(password);
  await sql`
    insert into dashboard_users (id, email, name, role, status, password_hash, password_salt, accepted_at)
    values (${randomUUID()}, ${email}, 'Admin', 'admin', 'active', ${hash}, ${salt}, now())
  `;
}

function getCookie(event, name) {
  const header = event.headers?.cookie || event.headers?.Cookie || '';
  return header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function isSecureRequest(event) {
  return (
    event.headers?.['x-forwarded-proto'] === 'https' ||
    event.headers?.['X-Forwarded-Proto'] === 'https' ||
    process.env.CONTEXT === 'production' ||
    process.env.URL?.startsWith('https://')
  );
}
