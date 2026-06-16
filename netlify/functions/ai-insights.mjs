import { assertRateLimit, errorResponse, json, requireCsrf, requireUser } from './_auth.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'POST required' });
  }

  let user;
  try {
    requireCsrf(event);
    user = await requireUser(event);
    await assertRateLimit(`openai:user:${user.id}`, { limit: 30, windowSeconds: 24 * 60 * 60 });
  } catch (error) {
    return errorResponse(error);
  }

  const payload = safeParse(event.body || '{}');
  const fallback = buildFallback(payload);

  if (!process.env.OPENAI_API_KEY) {
    return json(200, {
      mode: 'fallback',
      message: 'OPENAI_API_KEY is not configured yet. Showing deterministic recommendations.',
      insights: fallback,
    });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        input: [
          {
            role: 'system',
            content:
              'You are an SEO content strategist. Give concise, specific recommendations based only on the provided dashboard data. Do not invent rankings, traffic, or conversion data.',
          },
          {
            role: 'user',
            content: `Create a weekly executive SEO insight brief for this CodaKid blog dashboard. Return 5 bullets with clear next actions. Use Search Console, WordPress crawl, competitors, and open action items when present.\n\n${JSON.stringify(trimPayload(payload), null, 2)}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return json(200, {
        mode: 'fallback',
        message: `OpenAI request failed (${response.status}). Showing fallback recommendations.`,
        detail,
        insights: fallback,
      });
    }

    const data = await response.json();
    const output = data.output_text || extractOutputText(data);

    return json(200, {
      mode: 'openai',
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      insights: output
        ? output.split(/\n+/).map((line) => line.replace(/^[-*\d.\s]+/, '').trim()).filter(Boolean)
        : fallback,
    });
  } catch (error) {
    return json(200, {
      mode: 'fallback',
      message: 'OpenAI request errored. Showing fallback recommendations.',
      detail: error instanceof Error ? error.message : String(error),
      insights: fallback,
    });
  }
}

function buildFallback(payload) {
  const snapshot = payload?.snapshot || payload;
  const opportunities = payload?.searchOpportunities || {};
  const competitors = payload?.competitors || {};
  const actions = payload?.actionItems || [];
  const trackedKeywords = payload?.trackedKeywords || [];
  const ga4 = payload?.ga4?.latest;
  const kpis = snapshot?.kpis || {};
  const pillars = snapshot?.pillars || [];
  const linkGaps = snapshot?.linkGaps || [];
  const underlinked = snapshot?.underlinkedPillars || [];
  const searchClicks = opportunities?.summary?.totalClicks || 0;
  const topQuery = opportunities?.queryOpportunities?.[0]?.label || opportunities?.topQueries?.[0]?.label;
  const topCompetitor = competitors?.competitors?.[0]?.domain;
  const trackedKeyword = trackedKeywords.find((keyword) => keyword.latestSerp?.position);
  const topGa4Page = ga4?.topPages?.[0];

  return [
    `Start with internal links: ${linkGaps.length || 0} link gaps are visible from WordPress alone.`,
    `Review the top pillar "${pillars[0]?.title || 'Coding for Kids'}" and mirror its linking pattern across weaker clusters.`,
    trackedKeyword
      ? `Rank tracking: "${trackedKeyword.keyword}" is currently ${trackedKeyword.latestSerp.position ? `#${trackedKeyword.latestSerp.position}` : 'outside the tracked range'}; keep its target page mapped.`
      : topQuery
      ? `Use Search Console next: "${topQuery}" is the clearest keyword opportunity in the current data.`
      : `Search Console has ${searchClicks} clicks in the current loaded period.`,
    topCompetitor
      ? `Competitor watch: ${topCompetitor} has the strongest sampled overlap, so use it for content gap review.`
      : `${underlinked.length || 0} inferred pillars need more supporting posts or stronger anchor text.`,
    topGa4Page
      ? `GA4 traffic: "${topGa4Page.title || topGa4Page.path}" has ${topGa4Page.views} views; compare engagement before changing major copy.`
      : actions.length
      ? `${actions.filter((action) => action.status !== 'done').length} open action items are ready for follow-up.`
      : `Current crawl covers ${kpis.postsCrawled || 0} posts and ${kpis.internalLinks || 0} internal links.`,
  ];
}

function trimPayload(payload) {
  const snapshot = payload?.snapshot || payload;
  return {
    generatedAt: snapshot.generatedAt,
    mode: snapshot.mode,
    kpis: snapshot.kpis,
    search: {
      summary: payload?.searchOpportunities?.summary,
      pageOpportunities: payload?.searchOpportunities?.pageOpportunities?.slice(0, 8),
      queryOpportunities: payload?.searchOpportunities?.queryOpportunities?.slice(0, 8),
      pageQueryOpportunities: payload?.searchOpportunities?.pageQueryOpportunities?.slice(0, 8),
    },
    competitors: payload?.competitors?.competitors?.slice(0, 6),
    actionItems: payload?.actionItems?.slice(0, 10),
    trackedKeywords: payload?.trackedKeywords?.slice(0, 20),
    ga4: payload?.ga4?.latest
      ? {
          summary: payload.ga4.latest.summary,
          topPages: payload.ga4.latest.topPages?.slice(0, 10),
        }
      : null,
    clusters: snapshot.clusters?.slice(0, 10),
    pillars: snapshot.pillars?.slice(0, 12).map((pillar) => ({
      title: pillar.title,
      cluster: pillar.cluster,
      inboundCount: pillar.inboundCount,
      relatedPostCount: pillar.relatedPostCount,
      health: pillar.health,
      status: pillar.status,
      url: pillar.url,
    })),
    linkGaps: snapshot.linkGaps?.slice(0, 12),
    underlinkedPillars: snapshot.underlinkedPillars?.slice(0, 10),
  };
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function extractOutputText(data) {
  return data?.output
    ?.flatMap((item) => item.content || [])
    ?.map((content) => content.text || '')
    ?.join('\n')
    ?.trim();
}
