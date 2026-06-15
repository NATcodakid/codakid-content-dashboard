import { requireUser } from './_auth.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'POST required' });
  }

  try {
    await requireUser(event);
  } catch (error) {
    return json(error?.statusCode || 500, {
      error: error?.statusCode ? error.message : 'Server error',
      detail: error instanceof Error ? error.message : String(error),
    });
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
            content: `Create a weekly executive SEO insight brief for this WordPress-only content snapshot. Return 5 bullets with clear next actions.\n\n${JSON.stringify(trimPayload(payload), null, 2)}`,
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
  const kpis = payload?.kpis || {};
  const pillars = payload?.pillars || [];
  const linkGaps = payload?.linkGaps || [];
  const underlinked = payload?.underlinkedPillars || [];

  return [
    `Start with internal links: ${linkGaps.length || 0} link gaps are visible from WordPress alone.`,
    `Review the top pillar "${pillars[0]?.title || 'Coding for Kids'}" and mirror its linking pattern across weaker clusters.`,
    `${underlinked.length || 0} inferred pillars need more supporting posts or stronger anchor text.`,
    `Use Search Console next so the dashboard can separate real ranking losses from structural SEO issues.`,
    `Current crawl covers ${kpis.postsCrawled || 0} posts and ${kpis.internalLinks || 0} internal links.`,
  ];
}

function trimPayload(payload) {
  return {
    generatedAt: payload.generatedAt,
    mode: payload.mode,
    kpis: payload.kpis,
    clusters: payload.clusters?.slice(0, 10),
    pillars: payload.pillars?.slice(0, 12).map((pillar) => ({
      title: pillar.title,
      cluster: pillar.cluster,
      inboundCount: pillar.inboundCount,
      relatedPostCount: pillar.relatedPostCount,
      health: pillar.health,
      status: pillar.status,
      url: pillar.url,
    })),
    linkGaps: payload.linkGaps?.slice(0, 12),
    underlinkedPillars: payload.underlinkedPillars?.slice(0, 10),
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

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}
