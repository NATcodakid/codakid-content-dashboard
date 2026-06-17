import { errorResponse, getSql, json, parseJsonBody, requireCsrf, requireUser } from './_auth.mjs';

const DEFAULT_LAYOUT = {
  cards: ['ai-analyst', 'alerts', 'content-ideas', 'ai-visibility', 'refresh-queue', 'keyword-gap', 'boss-report'],
  hidden: [],
};

export async function handler(event) {
  try {
    const user = await requireUser(event);
    const sql = getSql();

    if (event.httpMethod === 'GET') {
      const rows = await sql`
        select value, updated_at
        from dashboard_preferences
        where user_id = ${user.id}
          and key = 'home-layout'
        limit 1
      `;
      return json(200, {
        layout: normalizeLayout(rows[0]?.value),
        updatedAt: rows[0]?.updated_at || null,
      }, { 'cache-control': 'private, no-store' });
    }

    if (event.httpMethod === 'POST') {
      requireCsrf(event);
      const body = parseJsonBody(event);
      const layout = normalizeLayout(body.layout || body);
      const rows = await sql`
        insert into dashboard_preferences (user_id, key, value, updated_at)
        values (${user.id}, 'home-layout', ${JSON.stringify(layout)}, now())
        on conflict (user_id, key) do update set
          value = excluded.value,
          updated_at = now()
        returning value, updated_at
      `;
      return json(200, {
        layout: normalizeLayout(rows[0]?.value),
        updatedAt: rows[0]?.updated_at,
      }, { 'cache-control': 'private, no-store' });
    }

    return json(405, { error: 'Method not allowed.' });
  } catch (error) {
    return errorResponse(error);
  }
}

function normalizeLayout(value) {
  const incoming = value && typeof value === 'object' ? value : {};
  const cards = Array.isArray(incoming.cards) ? incoming.cards.map(String) : DEFAULT_LAYOUT.cards;
  const hidden = Array.isArray(incoming.hidden) ? incoming.hidden.map(String) : [];
  const nextCards = [...new Set([...cards, ...DEFAULT_LAYOUT.cards])].filter(Boolean);
  return {
    cards: nextCards,
    hidden: [...new Set(hidden)].filter((id) => nextCards.includes(id)),
  };
}
