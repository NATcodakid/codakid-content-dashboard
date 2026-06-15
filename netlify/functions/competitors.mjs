import { requireUser } from './_auth.mjs';

const DEFAULT_COMPETITORS = [
  'codewizardshq.com',
  'idtech.com',
  'createandlearn.us',
  'tynker.com',
  'codecombat.com',
];

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
    await requireUser(event);
  } catch (error) {
    return json(error?.statusCode || 500, {
      error: error?.statusCode ? error.message : 'Server error',
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const domains = event.queryStringParameters?.domains
    ? event.queryStringParameters.domains.split(',').map((domain) => domain.trim()).filter(Boolean)
    : DEFAULT_COMPETITORS;

  try {
    const competitors = await Promise.all(domains.slice(0, 8).map(sampleCompetitor));
    return json(200, {
      generatedAt: new Date().toISOString(),
      mode: 'public-sitemap-sampling',
      competitors,
    }, {
      'cache-control': 'private, no-store',
    });
  } catch (error) {
    return json(500, {
      error: 'Failed to sample competitors',
      detail: error instanceof Error ? error.message : String(error),
    });
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
  const topicMatches = countTopics(blogUrls);

  return {
    domain: new URL(base).hostname.replace(/^www\./, ''),
    source,
    urlsSampled: urls.length,
    blogUrls: blogUrls.length,
    visibleTopics: Object.entries(topicMatches)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([topic, count]) => ({ topic, count })),
    opportunities: buildOpportunities(topicMatches),
    status: urls.length ? 'sampled' : 'needs review',
  };
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

function json(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  };
}
