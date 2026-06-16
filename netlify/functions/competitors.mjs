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
