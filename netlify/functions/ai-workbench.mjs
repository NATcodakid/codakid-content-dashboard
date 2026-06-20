import { randomUUID } from 'node:crypto';
import {
  assertRateLimit,
  errorResponse,
  getSql,
  json,
  parseJsonBody,
  requireCsrf,
  requireUser,
  HttpError,
} from './_auth.mjs';

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

export async function handler(event) {
  try {
    const user = await requireUser(event);
    const sql = getSql();

    if (event.httpMethod === 'GET') {
      const [promptRows, runRows, historyRows, ideaRows] = await Promise.all([
        sql`
          select *
          from ai_visibility_prompts
          where status = 'active'
          order by cluster asc, prompt asc
        `,
        sql`
          select distinct on (prompt)
            *
          from ai_visibility_runs
          order by prompt, created_at desc
          limit 50
        `,
        sql`
          select *
          from ai_visibility_runs
          order by created_at desc
          limit 240
        `,
        sql`
          select *
          from ai_content_ideas
          where status <> 'archived'
          order by priority_score desc, created_at desc
          limit 40
        `,
      ]);

      return json(200, {
        configured: Boolean(process.env.OPENAI_API_KEY),
        prompts: promptRows.map(publicPrompt),
        latestVisibilityRuns: runRows.map(publicVisibilityRun),
        visibilityHistory: historyRows.map(publicVisibilityRun),
        contentIdeas: ideaRows.map(publicContentIdea),
      }, { 'cache-control': 'private, no-store' });
    }

    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });

    requireCsrf(event);
    await assertRateLimit(`openai-workbench:user:${user.id}`, { limit: 40, windowSeconds: 24 * 60 * 60 });
    const body = parseJsonBody(event);
    const mode = String(body.mode || '').trim();

    if (mode === 'analyst') {
      const result = await analystBrief(body);
      return json(200, result, { 'cache-control': 'private, no-store' });
    }

    if (mode === 'content-ideas') {
      const result = await contentIdeas(sql, user, body);
      return json(200, result, { 'cache-control': 'private, no-store' });
    }

    if (mode === 'ai-visibility') {
      const result = await aiVisibility(sql, user, body);
      return json(200, result, { 'cache-control': 'private, no-store' });
    }

    if (mode === 'page-brief') {
      const result = await pageBrief(body);
      return json(200, result, { 'cache-control': 'private, no-store' });
    }

    throw new HttpError(400, 'Unknown AI workbench mode.');
  } catch (error) {
    return errorResponse(error);
  }
}

async function analystBrief(body) {
  const fallback = fallbackAnalyst(body);
  const result = await openAiJson({
    fallback,
    system: 'You are an expert SEO analyst for a kids coding education company. Use only provided data. Every metric you mention must include its source and time period when available.',
    user: `Create a structured SEO dashboard analyst brief. Return JSON exactly like {"headline":"","summary":"","insights":[{"title":"","detail":"","source":"","period":"","severity":"info|warning|danger|success"}],"recommendedActions":[{"title":"","detail":"","priorityScore":0,"source":""}]}.\n\n${JSON.stringify(trimContext(body), null, 2)}`,
  });
  return { mode: result.mode, model: result.model, analyst: result.data };
}

async function contentIdeas(sql, user, body) {
  const fallback = fallbackIdeas(body);
  const result = await openAiJson({
    fallback,
    system: 'You are an SEO content strategist. Generate realistic CodaKid blog ideas from data. Do not invent exact search volume.',
    user: `Return JSON exactly like {"ideas":[{"title":"","targetKeyword":"","intent":"","cluster":"","pillarUrl":"","priorityScore":0,"brief":{"angle":"","outline":[""],"whyNow":"","internalLinks":[""],"competitorGap":""}}]}.\n\n${JSON.stringify(trimContext(body), null, 2)}`,
  });

  const ideas = Array.isArray(result.data?.ideas) ? result.data.ideas.slice(0, 8) : fallback.ideas;
  const saved = [];
  for (const idea of ideas) {
    const rows = await sql`
      insert into ai_content_ideas (
        id,
        title,
        target_keyword,
        intent,
        cluster,
        pillar_url,
        priority_score,
        brief,
        source,
        created_by
      )
      values (
        ${randomUUID()},
        ${String(idea.title || '').slice(0, 220)},
        ${String(idea.targetKeyword || '').slice(0, 160)},
        ${String(idea.intent || 'informational').slice(0, 80)},
        ${String(idea.cluster || '').slice(0, 120)},
        ${String(idea.pillarUrl || '').slice(0, 500)},
        ${Math.max(0, Math.round(Number(idea.priorityScore || 0)))},
        ${JSON.stringify(idea.brief || {})},
        ${result.mode},
        ${user.email}
      )
      returning *
    `;
    saved.push(publicContentIdea(rows[0]));
  }

  return { mode: result.mode, model: result.model, ideas: saved };
}

async function aiVisibility(sql, user, body) {
  const incomingPrompts = Array.isArray(body.prompts) ? body.prompts.map((prompt) => String(prompt).trim()).filter(Boolean) : [];
  const promptRows = incomingPrompts.length
    ? await upsertPrompts(sql, user, incomingPrompts)
    : await sql`select * from ai_visibility_prompts where status = 'active' order by cluster asc, prompt asc limit 6`;

  const selectedPrompts = promptRows.slice(0, 6);
  const context = slimVisibilityContext(body);
  const fallbackResults = selectedPrompts.map((prompt) => ({
    prompt: prompt.prompt,
    ...fallbackVisibility(prompt.prompt, body),
  }));
  const result = await openAiJson({
    fallback: { results: fallbackResults },
    maxOutputTokens: 2400,
    webSearch: true,
    system: 'You are an AI visibility researcher for a kids coding education company. Search the live web before answering. Separate what the sources support from internal dashboard context. Return JSON only.',
    user: `Research each parent prompt on the live web and report which brands and pages an answer engine is likely to surface today. Return JSON exactly like {"results":[{"prompt":"","answer":"","codakidMentioned":false,"codakidSentiment":"positive|neutral|negative|unknown","competitors":[{"domain":"","reason":""}],"recommendations":[""]}]}. Include one result per prompt in the same order. Do not mark CodaKid mentioned unless live sources or results support it.\nPrompts:\n${JSON.stringify(selectedPrompts.map((prompt) => prompt.prompt))}\nInternal context for comparison only:\n${JSON.stringify(context)}`,
  });
  const generated = Array.isArray(result.data?.results) ? result.data.results : fallbackResults;
  const runs = await Promise.all(
    selectedPrompts.map((prompt, index) =>
      saveVisibilityRun(sql, user, prompt, generated[index] || fallbackResults[index], result),
    ),
  );

  return { configured: Boolean(process.env.OPENAI_API_KEY), runs };
}

async function saveVisibilityRun(sql, user, prompt, data, result) {
  const rows = await sql`
    insert into ai_visibility_runs (
      id,
      prompt_id,
      prompt,
      model,
      answer,
      codakid_mentioned,
      codakid_sentiment,
      competitors,
      recommendations,
      sources,
      source_mode,
      duration_ms,
      error,
      created_by
    )
    values (
      ${randomUUID()},
      ${prompt.id},
      ${prompt.prompt},
      ${result.mode === 'openai' ? result.model : result.mode},
      ${String(data.answer || '').slice(0, 4000)},
      ${Boolean(data.codakidMentioned)},
      ${String(data.codakidSentiment || 'unknown').slice(0, 40)},
      ${JSON.stringify(Array.isArray(data.competitors) ? data.competitors.slice(0, 8) : [])},
      ${JSON.stringify(Array.isArray(data.recommendations) ? data.recommendations.slice(0, 8) : [])},
      ${JSON.stringify(result.sources || [])},
      ${result.sourceMode || 'internal'},
      ${result.durationMs || null},
      ${String(result.error || '').slice(0, 500)},
      ${user.email}
    )
    returning *
  `;
  return publicVisibilityRun(rows[0]);
}

async function pageBrief(body) {
  const fallback = fallbackPageBrief(body);
  const result = await openAiJson({
    fallback,
    system: 'You are an SEO editor. Create concise, practical page-level recommendations. Do not claim data not provided.',
    user: `Return JSON exactly like {"titleIdeas":[""],"metaDescriptions":[""],"faqQuestions":[""],"missingSections":[""],"internalLinkAnchors":[""],"rewriteNotes":[""]}.\n\n${JSON.stringify(trimContext(body), null, 2)}`,
  });
  return { mode: result.mode, model: result.model, brief: result.data };
}

export async function openAiJson({ system, user, fallback, maxOutputTokens = 1800, webSearch = false, timeoutMs = 22000 }) {
  if (!process.env.OPENAI_API_KEY) return { mode: 'fallback', model: '', data: fallback, sources: [], sourceMode: 'internal', error: 'OpenAI is not configured.' };
  const startedAt = Date.now();
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        input: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        ...(!webSearch ? { text: { format: { type: 'json_object' } } } : {}),
        ...(webSearch ? { tools: [{ type: 'web_search' }], include: ['web_search_call.action.sources'] } : {}),
        max_output_tokens: maxOutputTokens,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      return { mode: 'fallback', model: DEFAULT_MODEL, data: fallback, sources: [], sourceMode: 'internal', durationMs: Date.now() - startedAt, error: detail.slice(0, 500) };
    }
    const payload = await response.json();
    const text = payload.output_text || extractOutputText(payload);
    const sources = webSearch ? extractSources(payload) : [];
    return {
      mode: 'openai',
      model: DEFAULT_MODEL,
      data: parseJson(text, fallback),
      sources,
      sourceMode: webSearch && sources.length ? 'web' : 'model',
      durationMs: Date.now() - startedAt,
      error: '',
    };
  } catch (error) {
    return { mode: 'fallback', model: DEFAULT_MODEL, data: fallback, sources: [], sourceMode: 'internal', durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : 'OpenAI request failed.' };
  }
}

function slimVisibilityContext(body) {
  const snapshot = body.snapshot || {};
  return {
    generatedAt: snapshot.generatedAt,
    siteKpis: snapshot.kpis,
    pillars: snapshot.pillars?.slice(0, 5).map((pillar) => ({
      title: pillar.title,
      url: pillar.url,
      cluster: pillar.cluster,
      inboundCount: pillar.inboundCount,
    })),
    clusters: snapshot.clusters?.slice(0, 6),
    competitors: body.competitors?.competitors?.slice(0, 8).map((competitor) => ({
      domain: competitor.domain,
      label: competitor.label,
      category: competitor.category,
      overlapScore: competitor.overlapScore,
    })),
    search: body.searchOpportunities
      ? {
          period: [body.searchOpportunities.startDate, body.searchOpportunities.endDate],
          summary: body.searchOpportunities.summary,
          topQueries: body.searchOpportunities.topQueries?.slice(0, 6),
        }
      : null,
    auditSummary: body.technicalAudit?.summary,
    ga4: body.ga4?.latest
      ? {
          period: [body.ga4.latest.startDate, body.ga4.latest.endDate],
          summary: body.ga4.latest.summary,
        }
      : null,
  };
}

async function upsertPrompts(sql, user, prompts) {
  const rows = [];
  for (const prompt of prompts) {
    const saved = await sql`
      insert into ai_visibility_prompts (id, prompt, cluster, created_by, updated_at)
      values (${randomUUID()}, ${prompt}, '', ${user.email}, now())
      on conflict (prompt) do update set
        status = 'active',
        updated_at = now()
      returning *
    `;
    rows.push(saved[0]);
  }
  return rows;
}

function fallbackAnalyst(body) {
  const search = body.searchOpportunities || {};
  const ga4 = body.ga4?.latest;
  const audit = body.technicalAudit || {};
  return {
    headline: 'SEO signals are ready for review',
    summary: 'OpenAI is unavailable or not configured, so this brief uses deterministic dashboard rules.',
    insights: [
      {
        title: 'Search period is explicit',
        detail: `${search.summary?.totalClicks || 0} clicks are from ${search.startDate || 'unknown start'} to ${search.endDate || 'unknown end'}, sourced from Search Console.`,
        source: 'Google Search Console',
        period: search.startDate && search.endDate ? `${search.startDate} to ${search.endDate}` : 'latest import',
        severity: 'info',
      },
      {
        title: 'Audit queue needs attention',
        detail: `${audit.summary?.high || 0} high-priority issues are visible in the technical audit.`,
        source: 'WordPress crawl',
        period: body.snapshot?.generatedAt || 'latest crawl',
        severity: audit.summary?.high ? 'warning' : 'success',
      },
      {
        title: 'GA4 context',
        detail: ga4 ? `${ga4.summary.sessions} sessions from ${ga4.startDate} to ${ga4.endDate}.` : 'GA4 is not available in this payload.',
        source: 'GA4',
        period: ga4 ? `${ga4.startDate} to ${ga4.endDate}` : 'not connected',
        severity: ga4 ? 'info' : 'warning',
      },
    ],
    recommendedActions: [
      {
        title: 'Review high-priority technical fixes',
        detail: 'Start with internal links, stale pages, and low-health pages before expanding content.',
        priorityScore: 80,
        source: 'technical-audit',
      },
    ],
  };
}

function fallbackIdeas(body) {
  const pillar = body.snapshot?.pillars?.[0];
  const cluster = pillar?.cluster || 'Coding for Kids';
  return {
    ideas: [
      {
        title: `Best ${cluster} path for beginners`,
        targetKeyword: cluster.toLowerCase(),
        intent: 'informational',
        cluster,
        pillarUrl: pillar?.url || '',
        priorityScore: 72,
        brief: {
          angle: 'Parent-friendly beginner guide tied to the strongest pillar.',
          outline: ['Who this is for', 'Best starter projects', 'How to choose the right class', 'FAQ'],
          whyNow: 'Generated from current cluster and pillar data.',
          internalLinks: [pillar?.title || 'Coding for Kids pillar'],
          competitorGap: 'Review competitor watchlist before writing.',
        },
      },
    ],
  };
}

function fallbackVisibility(prompt, body) {
  const competitors = (body.competitors?.competitors || []).slice(0, 4).map((competitor) => ({
    domain: competitor.domain,
    reason: competitor.category || 'tracked competitor',
  }));
  return {
    answer: `Fallback visibility readout for: ${prompt}`,
    codakidMentioned: /codakid/i.test(prompt),
    codakidSentiment: 'unknown',
    competitors,
    recommendations: ['Add stronger comparison copy and FAQ answers around this prompt.'],
  };
}

function fallbackPageBrief(body) {
  const page = body.page || {};
  return {
    titleIdeas: [`${page.title || 'CodaKid guide'}: updated parent guide`],
    metaDescriptions: ['Clear parent-focused summary with the primary keyword, audience, and outcome.'],
    faqQuestions: ['What age should kids start coding?', 'Which coding language is best for beginners?'],
    missingSections: ['Add a comparison section and a short FAQ block.'],
    internalLinkAnchors: ['coding for kids', 'online coding classes for kids'],
    rewriteNotes: ['Update intro, add current examples, and link to the closest pillar page.'],
  };
}

function trimContext(body) {
  const snapshot = body.snapshot || {};
  return {
    snapshot: {
      generatedAt: snapshot.generatedAt,
      kpis: snapshot.kpis,
      clusters: snapshot.clusters?.slice(0, 10),
      pillars: snapshot.pillars?.slice(0, 10),
      linkGaps: snapshot.linkGaps?.slice(0, 10),
    },
    page: body.page,
    searchOpportunities: body.searchOpportunities
      ? {
          startDate: body.searchOpportunities.startDate,
          endDate: body.searchOpportunities.endDate,
          summary: body.searchOpportunities.summary,
          topPages: body.searchOpportunities.topPages?.slice(0, 8),
          topQueries: body.searchOpportunities.topQueries?.slice(0, 12),
          pageQueryOpportunities: body.searchOpportunities.pageQueryOpportunities?.slice(0, 12),
          contentDecay: body.searchOpportunities.contentDecay?.slice(0, 8),
        }
      : null,
    technicalAudit: body.technicalAudit
      ? {
          summary: body.technicalAudit.summary,
          issues: body.technicalAudit.issues?.slice(0, 20),
        }
      : null,
    competitors: body.competitors?.competitors?.slice(0, 8),
    trackedKeywords: body.trackedKeywords?.slice(0, 20),
    ga4: body.ga4?.latest
      ? {
          startDate: body.ga4.latest.startDate,
          endDate: body.ga4.latest.endDate,
          summary: body.ga4.latest.summary,
          topPages: body.ga4.latest.topPages?.slice(0, 8),
        }
      : null,
  };
}

function publicPrompt(row) {
  return {
    id: row.id,
    prompt: row.prompt,
    cluster: row.cluster,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function publicVisibilityRun(row) {
  return {
    id: row.id,
    promptId: row.prompt_id,
    prompt: row.prompt,
    model: row.model,
    answer: row.answer,
    codakidMentioned: row.codakid_mentioned,
    codakidSentiment: row.codakid_sentiment,
    competitors: row.competitors || [],
    recommendations: row.recommendations || [],
    sources: row.sources || [],
    sourceMode: row.source_mode || 'internal',
    durationMs: row.duration_ms,
    error: row.error || '',
    createdAt: row.created_at,
  };
}

function publicContentIdea(row) {
  return {
    id: row.id,
    title: row.title,
    targetKeyword: row.target_keyword,
    intent: row.intent,
    cluster: row.cluster,
    pillarUrl: row.pillar_url,
    priorityScore: row.priority_score,
    brief: row.brief || {},
    status: row.status,
    source: row.source,
    createdAt: row.created_at,
  };
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(String(text || '').replace(/^```json\s*/i, '').replace(/```$/i, '').trim());
  } catch {
    return fallback;
  }
}

function extractOutputText(data) {
  return data?.output
    ?.flatMap((item) => item.content || [])
    ?.map((content) => content.text || '')
    ?.join('\n')
    ?.trim();
}

function extractSources(payload) {
  const found = new Map();
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== 'object') return;
    const url = typeof value.url === 'string' ? value.url : '';
    if (/^https?:\/\//i.test(url)) {
      found.set(url, {
        url,
        title: String(value.title || value.name || '').slice(0, 240),
      });
    }
    Object.values(value).forEach(visit);
  };
  visit(payload.output);
  return [...found.values()].slice(0, 20);
}
