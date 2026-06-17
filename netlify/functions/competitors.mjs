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

const topicTerms = [
  'coding',
  'kids',
  'minecraft',
  'roblox',
  'python',
  'ai',
  'camp',
  'homeschool',
  'game',
  'stem',
];

export async function handler(event) {
  try {
    const user = await requireUser(event);
    const sql = getSql();

    if (event.httpMethod === 'POST') {
      requireCsrf(event);
      const body = parseJsonBody(event);
      const domain = normalizeDomain(body.domain);
      if (!domain) throw new HttpError(400, 'Competitor domain is required.');
      const label = String(body.label || domain).trim();
      const category = String(body.category || 'coding education').trim();
      const notes = String(body.notes || '').trim();
      const rows = await sql`
        insert into dashboard_competitors (domain, label, category, notes, created_by, updated_at)
        values (${domain}, ${label}, ${category}, ${notes}, ${user.email}, now())
        on conflict (domain) do update set
          label = excluded.label,
          category = excluded.category,
          notes = excluded.notes,
          status = 'active',
          updated_at = now()
        returning *
      `;
      await audit(event, user, 'competitor.upsert', domain, { label, category });
      return json(200, { competitor: publicCompetitor(rows[0]) }, { 'cache-control': 'private, no-store' });
    }

    if (event.httpMethod === 'PATCH') {
      requireCsrf(event);
      const body = parseJsonBody(event);
      const domain = normalizeDomain(body.domain);
      if (!domain) throw new HttpError(400, 'Competitor domain is required.');
      const status = String(body.status || 'active').trim();
      const rows = await sql`
        update dashboard_competitors
        set status = ${status}, updated_at = now()
        where domain = ${domain}
        returning *
      `;
      if (!rows[0]) throw new HttpError(404, 'Competitor not found.');
      await audit(event, user, 'competitor.update', domain, { status });
      return json(200, { competitor: publicCompetitor(rows[0]) }, { 'cache-control': 'private, no-store' });
    }

    if (event.httpMethod === 'DELETE') {
      requireCsrf(event);
      const body = parseJsonBody(event);
      const domain = normalizeDomain(body.domain);
      if (!domain) throw new HttpError(400, 'Competitor domain is required.');
      await sql`update dashboard_competitors set status = 'archived', updated_at = now() where domain = ${domain}`;
      await audit(event, user, 'competitor.archive', domain);
      return json(200, { ok: true }, { 'cache-control': 'private, no-store' });
    }

    if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed.' });

    const dbCompetitors = await sql`
      select *
      from dashboard_competitors
      where status = 'active'
      order by domain asc
    `;

    const domains = event.queryStringParameters?.domains
      ? event.queryStringParameters.domains.split(',').map((domain) => normalizeDomain(domain)).filter(Boolean)
      : dbCompetitors.map((row) => row.domain);

    const competitors = await Promise.all(domains.slice(0, 12).map(async (domain) => {
      const sample = await sampleCompetitor(domain);
      const meta = dbCompetitors.find((row) => row.domain === sample.domain);
      return {
        ...sample,
        label: meta?.label || sample.domain,
        category: meta?.category || 'coding education',
        notes: meta?.notes || '',
      };
    }));

    return json(200, {
      generatedAt: new Date().toISOString(),
      mode: 'public-sitemap-sampling',
      watchlist: dbCompetitors.map(publicCompetitor),
      competitors,
    }, {
      'cache-control': 'private, no-store',
    });
  } catch (error) {
    return errorResponse(error);
  }
}

async function sampleCompetitor(domain) {
  const base = domain.startsWith('http') ? domain : `https://${domain}`;
  const candidates = [`${base}/post-sitemap.xml`, `${base}/page-sitemap.xml`, `${base}/sitemap.xml`];
  let urls = [];
  let source = '';

  for (const sitemap of candidates) {
    try {
      const response = await fetch(sitemap, {
        headers: { 'user-agent': 'CodaKidContentDashboard/0.1' },
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok) continue;
      const xml = await response.text();
      urls = extractUrls(xml);
      source = sitemap;
      if (urls.length) break;
    } catch {
      // Try the next sitemap candidate.
    }
  }

  const blogUrls = urls.filter((url) => /blog|article|resources|learn|guide/i.test(url)).slice(0, 80);
  const sampledPages = await samplePageTitles(blogUrls.slice(0, 14));
  const topicMatches = countTopics([...blogUrls, ...sampledPages.map((page) => `${page.url} ${page.title}`)]);

  return {
    domain: new URL(base).hostname.replace(/^www\./, ''),
    source,
    urlsSampled: urls.length,
    blogUrls: blogUrls.length,
    sampledPages,
    visibleTopics: Object.entries(topicMatches)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([topic, count]) => ({ topic, count })),
    contentAngles: buildContentAngles(sampledPages),
    opportunities: buildOpportunities(topicMatches),
    status: urls.length ? 'sampled' : 'needs review',
  };
}

async function samplePageTitles(urls) {
  const pages = await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url, {
          headers: { 'user-agent': 'CodaKidContentDashboard/0.1' },
          signal: AbortSignal.timeout(4500),
        });
        if (!response.ok) return null;
        const html = await response.text();
        const title = cleanHtml(
          html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
            html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ||
            '',
        );
        if (!title) return null;
        return { url, title: title.slice(0, 140) };
      } catch {
        return null;
      }
    }),
  );
  return pages.filter(Boolean).slice(0, 10);
}

function extractUrls(xml) {
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/gi)]
    .map((match) => match[1].trim())
    .filter((url) => /^https?:\/\//.test(url));
}

function countTopics(urls) {
  const counts = Object.fromEntries(topicTerms.map((term) => [term, 0]));
  for (const url of urls) {
    const clean = decodeURIComponent(url).toLowerCase();
    for (const term of topicTerms) {
      if (clean.includes(term)) counts[term] += 1;
    }
  }
  return counts;
}

function buildOpportunities(counts) {
  const ideas = [];
  if ((counts.ai || 0) > 0) ideas.push('Watch AI class and safe-AI-for-kids messaging.');
  if ((counts.minecraft || 0) > 0) ideas.push('Compare Minecraft coding pages against CodaKid modding pillars.');
  if ((counts.roblox || 0) > 0) ideas.push('Track Roblox scripting/tutorial clusters for topic gaps.');
  if ((counts.camp || 0) > 0) ideas.push('Review seasonal camp pages before summer search demand peaks.');
  if (!ideas.length) ideas.push('Sitemap sampled, but topic overlap needs deeper crawl or SERP data.');
  return ideas.slice(0, 3);
}

function buildContentAngles(pages) {
  const titleText = pages.map((page) => page.title.toLowerCase()).join(' ');
  const angles = [];
  if (/free|lesson|activity|project/.test(titleText)) angles.push('Free lessons/projects');
  if (/parent|guide|age|beginner/.test(titleText)) angles.push('Parent/beginner guides');
  if (/minecraft|roblox|python|scratch/.test(titleText)) angles.push('Platform-specific learning paths');
  if (/camp|summer|class|course/.test(titleText)) angles.push('Course and camp landing content');
  if (/ai|artificial intelligence|chatgpt/.test(titleText)) angles.push('AI education content');
  return angles.slice(0, 4);
}

function cleanHtml(value) {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, '-')
    .replace(/&#038;|&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDomain(value) {
  try {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return new URL(raw.startsWith('http') ? raw : `https://${raw}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return String(value || '').trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
  }
}

function publicCompetitor(row) {
  return {
    domain: row.domain,
    label: row.label,
    category: row.category,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
