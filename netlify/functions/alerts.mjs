import {
  audit,
  errorResponse,
  getSql,
  json,
  parseJsonBody,
  requireCsrf,
  requireUser,
  HttpError,
} from './_auth.mjs';

const VALID_STATES = new Set(['unread', 'read', 'dismissed', 'snoozed']);

export async function handler(event) {
  try {
    const user = await requireUser(event);
    if (event.httpMethod === 'GET') {
      return json(200, await buildAlertPayload(user.id), { 'cache-control': 'private, no-store' });
    }
    if (event.httpMethod === 'PATCH') {
      requireCsrf(event);
      const body = parseJsonBody(event);
      const fingerprint = clean(body.fingerprint, 240);
      const status = clean(body.status, 30);
      if (!fingerprint || !VALID_STATES.has(status)) throw new HttpError(400, 'Alert and valid state are required.');
      const snoozedUntil = status === 'snoozed'
        ? new Date(Date.now() + Math.max(1, Math.min(30, Number(body.days || 7))) * 86400000).toISOString()
        : null;
      const sql = getSql();
      await sql`
        insert into dashboard_alert_states (user_id, fingerprint, status, snoozed_until, updated_at)
        values (${user.id}, ${fingerprint}, ${status}, ${snoozedUntil}, now())
        on conflict (user_id, fingerprint) do update set
          status = excluded.status,
          snoozed_until = excluded.snoozed_until,
          updated_at = now()
      `;
      await audit(event, user, 'alert.update', fingerprint, { status, snoozedUntil });
      return json(200, await buildAlertPayload(user.id), { 'cache-control': 'private, no-store' });
    }
    return json(405, { error: 'Method not allowed.' });
  } catch (error) {
    return errorResponse(error);
  }
}

async function buildAlertPayload(userId) {
  const sql = getSql();
  const [auditRows, wpRows, gscRows, ga4Rows, rankRows, aiRows, actionRows, cannibalizationRows, stateRows] = await Promise.all([
    sql`select high_count, medium_count, health_score, created_at from technical_audit_snapshots order by created_at desc limit 1`,
    sql`select post_count, created_at from wordpress_snapshots where ok = true order by created_at desc limit 1`,
    sql`select data, start_date, end_date, created_at from google_search_console_snapshots where dimensions = 'page' order by created_at desc limit 2`,
    sql`select created_at, start_date, end_date from ga4_snapshots where dimensions = 'summary' order by created_at desc limit 1`,
    sql`
      with ranked as (
        select keyword, codakid_position, codakid_url, fetched_at,
          row_number() over (partition by keyword order by fetched_at desc) as rn
        from serp_snapshots
      )
      select c.keyword, c.codakid_position, c.codakid_url, c.fetched_at,
        p.codakid_position as previous_position
      from ranked c
      left join ranked p on p.keyword = c.keyword and p.rn = 2
      where c.rn = 1
      order by c.fetched_at desc
      limit 80
    `,
    sql`
      select distinct on (prompt) prompt, codakid_mentioned, source_mode, created_at
      from ai_visibility_runs
      order by prompt, created_at desc
      limit 60
    `,
    sql`
      select count(*)::int as overdue
      from dashboard_action_items
      where status in ('todo', 'in_progress') and due_date < current_date
    `,
    sql`
      select count(*)::int as high_conflicts
      from cannibalization_recommendations
      where resolved_at is null
        and severity = 'high'
        and recommendation <> 'keep-separate'
    `,
    sql`select fingerprint, status, snoozed_until from dashboard_alert_states where user_id = ${userId}`,
  ]);

  const alerts = [];
  const latestAudit = auditRows[0];
  if (Number(latestAudit?.high_count || 0) > 0) {
    alerts.push(makeAlert('audit:high', 'technical', 'high', `${latestAudit.high_count} high-priority site issues`, `The detailed technical audit score is ${latestAudit.health_score || 0}/100. Review the highest-impact crawl findings first.`, 'Technical audit', latestAudit.created_at, '/audit'));
  }
  if (Number(actionRows[0]?.overdue || 0) > 0) {
    alerts.push(makeAlert('actions:overdue', 'workflow', 'high', `${actionRows[0].overdue} overdue action${Number(actionRows[0].overdue) === 1 ? '' : 's'}`, 'These tasks passed their due date and still need an owner or resolution.', 'Work queue', new Date().toISOString(), '/actions'));
  }
  if (Number(cannibalizationRows[0]?.high_conflicts || 0) > 0) {
    alerts.push(makeAlert(
      'cannibalization:high',
      'content-intent',
      'high',
      `${cannibalizationRows[0].high_conflicts} high-impact intent conflicts`,
      'Multiple CodaKid pages are competing for the same Search Console queries. Review consolidation and differentiation evidence before editing WordPress.',
      'Intent cannibalization',
      new Date().toISOString(),
      '/cannibalization',
    ));
  }

  addFreshnessAlert(alerts, 'wordpress', 'WordPress crawl', wpRows[0]?.created_at, 48, '/audit');
  addFreshnessAlert(alerts, 'gsc', 'Search Console', gscRows[0]?.created_at, 72, '/keywords');
  addFreshnessAlert(alerts, 'ga4', 'Google Analytics', ga4Rows[0]?.created_at, 72, '/reports');

  const decay = comparePageSnapshots(gscRows[0], gscRows[1]);
  decay.slice(0, 4).forEach((row) => {
    alerts.push(makeAlert(
      `decay:${normalizeUrl(row.page)}`,
      'traffic',
      row.change <= -0.5 ? 'high' : 'medium',
      `${shortPath(row.page)} lost ${Math.round(row.lostClicks)} clicks`,
      `${Math.abs(Math.round(row.change * 100))}% fewer clicks in the latest comparable Search Console window.`,
      'Search Console',
      gscRows[0]?.created_at,
      `/pages/${encodeURIComponent(slug(row.page))}`,
    ));
  });

  rankRows.filter((row) => row.codakid_position && row.previous_position && Number(row.codakid_position) - Number(row.previous_position) >= 3).slice(0, 5).forEach((row) => {
    const loss = Number(row.codakid_position) - Number(row.previous_position);
    alerts.push(makeAlert(`rank:${row.keyword}`, 'ranking', loss >= 8 ? 'high' : 'medium', `“${row.keyword}” dropped ${loss} positions`, `Now ranking #${row.codakid_position}, previously #${row.previous_position}.`, 'Serper weekly tracking', row.fetched_at, '/keywords'));
  });

  aiRows.filter((row) => row.source_mode === 'web' && !row.codakid_mentioned).slice(0, 4).forEach((row) => {
    alerts.push(makeAlert(`ai:${row.prompt}`, 'ai-visibility', 'medium', `CodaKid was absent for “${row.prompt}”`, 'Review cited competitors and strengthen the best matching page.', 'OpenAI web search', row.created_at, '/intelligence'));
  });

  const stateMap = new Map(stateRows.map((row) => [row.fingerprint, row]));
  const now = Date.now();
  const visible = alerts
    .map((alert) => ({ ...alert, status: stateMap.get(alert.fingerprint)?.status || 'unread' }))
    .filter((alert) => {
      const state = stateMap.get(alert.fingerprint);
      if (state?.status === 'dismissed') return false;
      if (state?.status === 'snoozed' && new Date(state.snoozed_until).getTime() > now) return false;
      return true;
    })
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: visible.length,
      unread: visible.filter((alert) => alert.status === 'unread').length,
      high: visible.filter((alert) => alert.severity === 'high').length,
    },
    alerts: visible,
  };
}

function comparePageSnapshots(current, previous) {
  if (!current?.data?.rows || !previous?.data?.rows) return [];
  const prior = new Map(previous.data.rows.map((row) => [normalizeUrl(row.keys?.[0]), row]));
  return current.data.rows.flatMap((row) => {
    const page = row.keys?.[0] || '';
    const old = prior.get(normalizeUrl(page));
    const clicks = Number(row.clicks || 0);
    const previousClicks = Number(old?.clicks || 0);
    if (previousClicks < 20 || clicks >= previousClicks * 0.7) return [];
    return [{ page, clicks, previousClicks, lostClicks: previousClicks - clicks, change: (clicks - previousClicks) / previousClicks }];
  }).sort((a, b) => b.lostClicks - a.lostClicks);
}

function addFreshnessAlert(alerts, key, label, updatedAt, hours, to) {
  const ageHours = updatedAt ? (Date.now() - new Date(updatedAt).getTime()) / 3600000 : Infinity;
  if (ageHours <= hours) return;
  alerts.push(makeAlert(`stale:${key}`, 'data-health', ageHours > hours * 2 ? 'high' : 'medium', `${label} data needs a refresh`, updatedAt ? `Last successful snapshot was ${Math.round(ageHours / 24)} days ago.` : 'No successful snapshot is available yet.', label, updatedAt || new Date().toISOString(), to));
}

function makeAlert(fingerprint, type, severity, title, detail, source, createdAt, to) {
  return { fingerprint, type, severity, title, detail, source, createdAt, to };
}

function severityRank(value) { return value === 'high' ? 3 : value === 'medium' ? 2 : 1; }
function clean(value, max) { return String(value || '').trim().slice(0, max); }
function normalizeUrl(value) { try { const url = new URL(value, 'https://codakid.com'); return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/$/, '')}`.toLowerCase(); } catch { return String(value || '').toLowerCase(); } }
function shortPath(value) { try { const path = new URL(value, 'https://codakid.com').pathname; return path.length > 48 ? `${path.slice(0, 45)}…` : path; } catch { return value; } }
function slug(value) { try { return new URL(value, 'https://codakid.com').pathname.split('/').filter(Boolean).pop() || ''; } catch { return ''; } }
