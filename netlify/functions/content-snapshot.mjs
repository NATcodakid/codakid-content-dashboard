import { randomUUID } from 'node:crypto';
import { requireUser, getSql } from './_auth.mjs';
import fallbackSnapshotData from './content-snapshot-fallback-data.mjs';
import seoGameplanData from './seo-gameplan-data.mjs';

const WP_BASE = process.env.VITE_WORDPRESS_BASE || 'https://codakid.com';
const WP_API = `${WP_BASE.replace(/\/$/, '')}/wp-json/wp/v2`;
const WP_HEADERS = {
  accept: 'application/json',
  'user-agent': 'CodaKidContentDashboard/1.0 (+https://codakidblogdashboard.netlify.app)',
};
const fallbackSnapshot = fallbackSnapshotData;
const seoGameplan = seoGameplanData;
const confirmedPillarUrls = new Set((seoGameplan?.confirmedPillars || []).map((pillar) => normalizeUrl(pillar.url)));

const evergreenSignals = [
  'ultimate guide',
  'complete guide',
  'best ',
  'classes',
  'courses',
  'coding for kids',
  'minecraft',
  'roblox',
  'python',
  'ai ',
  'parents',
  'homeschool',
  'camps',
  'learn',
];

const clusterRules = [
  ['AI', /\b(ai|artificial intelligence|machine learning|chatgpt)\b/i],
  ['Minecraft', /\bminecraft|modding|mods|java\b/i],
  ['Roblox', /\broblox|lua|roblox studio\b/i],
  ['Python', /\bpython|pygame\b/i],
  ['Coding for Kids', /\bcoding for kids|coding classes|coding courses|coding platforms|programming\b/i],
  ['Camps', /\bcamp|summer camp\b/i],
  ['Homeschool', /\bhomeschool\b/i],
  ['STEM', /\bstem|robotics|science\b/i],
  ['Scratch', /\bscratch|block coding\b/i],
  ['Game Development', /\bgame design|game development|unity|unreal|fortnite\b/i],
  ['Web Development', /\bweb development|javascript|html|css\b/i],
];

const starterPillarSlugs = new Set([
  'coding-for-kids-the-ultimate-guide-for-parents-2',
  'best-online-coding-classes-kids',
  'best-coding-platforms-for-kids',
  'best-ways-to-teach-kids-computer-coding',
  'best-kids-coding-subscriptions',
  'best-ai-classes-for-kids-teens',
  'best-ai-tools-for-students-safe-school-friendly-picks',
  'explain-ai-to-kids-by-age',
  'minecraft-modding-for-kids-parents-guide',
  'guide-to-minecraft-modding-with-java',
  'best-minecraft-coding-modding-classes-for-kids',
  'roblox-lua-scripting-basics-for-beginners',
  'best-roblox-coding-classes-for-kids',
  'best-python-courses-for-kids-ranked-by-age-goal',
  'best-online-coding-camps-for-kids-ultimate-guide',
]);

export async function handler(event) {
  try {
    await requireUser(event);
    const snapshot = await getSnapshot();
    return json(200, snapshot, {
      'cache-control': 'private, no-store',
    });
  } catch (error) {
    return json(error?.statusCode || 500, {
      error: error?.statusCode ? error.message : 'Failed to build content snapshot',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

async function getSnapshot() {
  const markedPillarUrls = await fetchMarkedPillarUrls();
  try {
    const snapshot = await buildSnapshot(markedPillarUrls);
    await saveWordPressSnapshot(snapshot);
    return snapshot;
  } catch (error) {
    const cached = await fetchLatestWordPressSnapshot();
    if (cached?.data?.kpis) {
      return {
        ...cached.data,
        generatedAt: cached.created_at || cached.data.generatedAt,
        source: 'cached-wordpress-snapshot',
        sourceDetail: `Live WordPress crawl failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    if (!fallbackSnapshot?.kpis) throw error;
    return {
      ...fallbackSnapshot,
      source: 'bundled-fallback-snapshot',
      sourceDetail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function saveWordPressSnapshot(snapshot) {
  try {
    const sql = getSql();
    const postCount = snapshot?.kpis?.postsCrawled || 0;
    const recentRows = await sql`
      select id
      from wordpress_snapshots
      where ok = true
        and post_count = ${postCount}
        and created_at >= now() - interval '6 hours'
      limit 1
    `;
    if (recentRows[0]) return;

    await sql`
      insert into wordpress_snapshots (id, source, ok, post_count, data)
      values (
        ${randomUUID()},
        'wordpress-rest',
        true,
        ${postCount},
        ${JSON.stringify(snapshot)}
      )
    `;
    await sql`delete from wordpress_snapshots where created_at < now() - interval '180 days'`;
  } catch {
    // The live dashboard should still work if history persistence has a problem.
  }
}

async function fetchLatestWordPressSnapshot() {
  try {
    const sql = getSql();
    const rows = await sql`
      select data, created_at
      from wordpress_snapshots
      where ok = true
      order by created_at desc
      limit 1
    `;
    return rows[0] || null;
  } catch {
    return null;
  }
}

async function fetchMarkedPillarUrls() {
  try {
    const sql = getSql();
    const rows = await sql`select url from dashboard_pillars`;
    return new Set(rows.map((row) => normalizeUrl(row.url)));
  } catch {
    return new Set();
  }
}

export async function buildSnapshot(markedPillarUrls = new Set()) {
  const isConfirmed = (url) => confirmedPillarUrls.has(url) || markedPillarUrls.has(url);
  const [categories, totalPages] = await Promise.all([fetchCategories(), fetchTotalPages()]);
  const posts = await fetchPosts(totalPages);
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const postRecords = posts.map((post) => normalizePost(post, categoryMap));
  const postByUrl = new Map(postRecords.map((post) => [post.normalizedUrl, post]));
  const inbound = new Map();

  for (const post of postRecords) {
    for (const link of post.internalLinks) {
      if (!inbound.has(link)) inbound.set(link, new Set());
      inbound.get(link).add(post.normalizedUrl);
    }
  }

  const enriched = postRecords.map((post) => {
    const inboundSources = [...(inbound.get(post.normalizedUrl) || [])];
    const relatedPosts = findRelatedPosts(post, postRecords);
    const inboundCount = inboundSources.length;
    const freshnessDays = daysSince(post.date);
    const pillarScore = scorePillar(post, inboundCount, relatedPosts.length, freshnessDays);
    const health = scoreHealth(post, inboundCount, relatedPosts.length, freshnessDays);

    return {
      ...stripContent(post),
      inboundCount,
      inboundSources,
      relatedPostCount: relatedPosts.length,
      missingRelatedLinks: relatedPosts
        .filter((candidate) => !candidate.internalLinks.includes(post.normalizedUrl))
        .slice(0, 8)
        .map(({ title, url, cluster, date }) => ({ title, url, cluster, date })),
      pillarScore,
      health,
      freshnessDays,
      status: getStatus(health),
      confirmedPillar: isConfirmed(post.normalizedUrl),
    };
  });

  const confirmedPillars = enriched
    .filter((post) => post.confirmedPillar)
    .sort((a, b) => b.pillarScore - a.pillarScore);

  const suggestedPillars = enriched
    .filter((post) => !post.confirmedPillar && (starterPillarSlugs.has(post.slug) || post.pillarScore >= 52))
    .sort((a, b) => b.pillarScore - a.pillarScore)
    .slice(0, 12);

  const inferredPillars = [...confirmedPillars, ...suggestedPillars];

  const underlinkedPillars = inferredPillars
    .filter((post) => post.inboundCount < 12 || post.missingRelatedLinks.length > 3)
    .map((post) => ({
      title: post.title,
      url: post.url,
      cluster: post.cluster,
      inboundCount: post.inboundCount,
      opportunity: `${post.missingRelatedLinks.length} likely supporting posts can add links`,
    }));

  const orphanPosts = enriched
    .filter((post) => post.inboundCount === 0 && post.outboundCount < 3)
    .slice(0, 20);

  const linkGaps = inferredPillars
    .flatMap((pillar) =>
      pillar.missingRelatedLinks.slice(0, 4).map((source) => ({
        pillarTitle: pillar.title,
        pillarUrl: pillar.url,
        sourceTitle: source.title,
        sourceUrl: source.url,
        cluster: pillar.cluster,
        suggestedAnchor: suggestAnchor(pillar),
      })),
    )
    .slice(0, 40);

  const clusters = summarizeClusters(enriched, inferredPillars);
  const postsUpdatedRecently = enriched.filter((post) => daysSince(post.date) <= 90).length;
  const searchConsoleStatus = await getSearchConsoleStatusSummary();

  return {
    generatedAt: new Date().toISOString(),
    mode: 'wordpress-only',
    source: {
      wordpressBase: WP_BASE,
      postsEndpoint: `${WP_API}/posts`,
      categoriesEndpoint: `${WP_API}/categories`,
    },
    kpis: {
      postsCrawled: enriched.length,
      categories: categories.length,
      inferredPillars: inferredPillars.length,
      suggestedPillars: suggestedPillars.length,
      internalLinks: enriched.reduce((sum, post) => sum + post.outboundCount, 0),
      orphanPosts: orphanPosts.length,
      linkGaps: linkGaps.length,
      postsUpdatedRecently,
      confirmedPillars: confirmedPillars.length,
      quickWins: seoGameplan?.summary?.quickWins || 0,
      keywordTargets: seoGameplan?.summary?.keywordTargets || 0,
      plannedContent: seoGameplan?.summary?.plannedContent || 0,
    },
    categories: categories
      .filter((category) => category.count > 0)
      .sort((a, b) => b.count - a.count)
      .map(({ id, name, slug, count, link }) => ({ id, name, slug, count, link })),
    clusters,
    pillars: inferredPillars,
    allPosts: enriched
      .slice()
      .sort((a, b) => b.pillarScore - a.pillarScore)
      .map((post) => ({
        title: post.title,
        url: post.url,
        slug: post.slug,
        cluster: post.cluster,
        date: post.date,
        modified: post.modified,
        inboundCount: post.inboundCount,
        outboundCount: post.outboundCount,
        relatedPostCount: post.relatedPostCount,
        pillarScore: post.pillarScore,
        health: post.health,
        status: post.status,
        confirmedPillar: post.confirmedPillar,
      })),
    underlinkedPillars,
    linkGaps,
    orphanPosts: orphanPosts.map(({ title, url, cluster, date, inboundCount, outboundCount }) => ({
      title,
      url,
      cluster,
      date,
      inboundCount,
      outboundCount,
    })),
    recommendations: buildRecommendations(inferredPillars, underlinkedPillars, linkGaps, orphanPosts),
    gameplan: seoGameplan,
    integrationStatus: [
      { name: 'WordPress REST API', status: 'connected', detail: `${enriched.length} posts crawled` },
      { name: 'SEO Gameplan', status: 'connected', detail: `${seoGameplan?.summary?.quickWins || 0} quick wins imported` },
      {
        name: 'Google Search Console',
        status: searchConsoleStatus.status,
        detail: searchConsoleStatus.detail,
      },
      { name: 'GA4', status: 'pending', detail: 'Connect Data API to add sessions, engagement, and conversions' },
      { name: 'OpenAI', status: process.env.OPENAI_API_KEY ? 'connected' : 'pending', detail: 'Add OPENAI_API_KEY for generated strategy briefs' },
    ],
  };
}

async function getSearchConsoleStatusSummary() {
  try {
    const sql = getSql();
    const rows = await sql`
      select dimensions, data, created_at
      from google_search_console_snapshots
      order by created_at desc
      limit 1
    `;
    if (rows[0]) {
      const count = Array.isArray(rows[0].data?.rows) ? rows[0].data.rows.length : 0;
      return {
        status: 'connected',
        detail: `${count} ${rows[0].dimensions} rows imported`,
      };
    }
  } catch {
    // Snapshot status is advisory; never fail the WordPress crawl because of it.
  }
  return { status: 'pending', detail: 'Import Search Console rows to add rankings, CTR, and query movement' };
}

async function fetchCategories() {
  const response = await wpFetch(`${WP_API}/categories?per_page=100&_fields=id,name,slug,count,link,parent`);
  if (!response.ok) return [];
  return response.json();
}

async function fetchTotalPages() {
  const response = await wpFetch(`${WP_API}/posts?per_page=100&page=1&_fields=id`);
  if (!response.ok) throw new Error(`Posts head request failed: ${response.status}`);
  return Number(response.headers.get('x-wp-totalpages') || '1');
}

async function fetchPosts(totalPages) {
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);
  const requests = pages.map(async (page) => {
    const fields = 'id,link,slug,title,date,modified,categories,content,excerpt';
    const response = await wpFetch(`${WP_API}/posts?per_page=100&page=${page}&_fields=${fields}`);
    if (!response.ok) throw new Error(`Posts page ${page} failed: ${response.status}`);
    return response.json();
  });
  return (await Promise.all(requests)).flat();
}

async function wpFetch(url) {
  return fetch(url, {
    headers: WP_HEADERS,
  });
}

function normalizePost(post, categoryMap) {
  const title = cleanHtml(post.title?.rendered || '');
  const excerpt = cleanHtml(post.excerpt?.rendered || '').slice(0, 260);
  const content = post.content?.rendered || '';
  const url = post.link;
  const categories = (post.categories || []).map((id) => categoryMap.get(id)).filter(Boolean);
  const categoryNames = categories.map((category) => category.name);
  const internalLinks = extractInternalLinks(content, url);
  const text = cleanHtml(content);
  const cluster = inferCluster(title, categoryNames, url);

  return {
    id: post.id,
    title,
    slug: post.slug,
    url,
    normalizedUrl: normalizeUrl(url),
    date: post.date?.slice(0, 10),
    modified: post.modified?.slice(0, 10),
    categories: categoryNames,
    cluster,
    excerpt,
    content,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    internalLinks,
    outboundCount: internalLinks.length,
  };
}

function extractInternalLinks(html, sourceUrl) {
  const source = normalizeUrl(sourceUrl);
  const matches = [...html.matchAll(/href=["']([^"'#]+)["']/gi)]
    .map((match) => match[1])
    .filter((href) => href.includes('codakid.com') || href.startsWith('/'))
    .map((href) => {
      try {
        return normalizeUrl(new URL(href, WP_BASE).toString());
      } catch {
        return '';
      }
    })
    .filter((href) => href && href !== source && !href.includes('/wp-content/'));

  return [...new Set(matches)];
}

function inferCluster(title, categories, url) {
  const haystack = `${title} ${categories.join(' ')} ${url}`;
  const categoryMatch = categories.find((name) => name && name !== 'Uncategorized');
  const rule = clusterRules.find(([, pattern]) => pattern.test(haystack));
  return rule?.[0] || categoryMatch || 'General';
}

function findRelatedPosts(post, posts) {
  return posts
    .filter((candidate) => candidate.normalizedUrl !== post.normalizedUrl)
    .filter((candidate) => candidate.cluster === post.cluster || hasSharedTerms(post.title, candidate.title))
    .sort((a, b) => relatedScore(post, b) - relatedScore(post, a))
    .slice(0, 18);
}

function hasSharedTerms(a, b) {
  const termsA = importantTerms(a);
  const termsB = importantTerms(b);
  return [...termsA].some((term) => termsB.has(term));
}

function relatedScore(a, b) {
  let score = a.cluster === b.cluster ? 12 : 0;
  const termsA = importantTerms(a.title);
  const termsB = importantTerms(b.title);
  for (const term of termsA) {
    if (termsB.has(term)) score += 4;
  }
  score += Math.max(0, 5 - daysSince(b.date) / 120);
  return score;
}

function importantTerms(text) {
  const stop = new Set(['the', 'and', 'for', 'with', 'kids', 'your', 'best', 'guide', 'how', 'what', 'why', 'top', '2026', '2025']);
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((term) => term.length > 2 && !stop.has(term)),
  );
}

function scorePillar(post, inboundCount, relatedCount, freshnessDays) {
  const title = post.title.toLowerCase();
  const evergreenBonus = evergreenSignals.reduce((sum, signal) => sum + (title.includes(signal) ? 5 : 0), 0);
  const categoryBonus = ['Coding for Kids', 'Minecraft', 'AI', 'Roblox', 'Python', 'Camps'].includes(post.cluster) ? 10 : 4;
  const starterBonus = starterPillarSlugs.has(post.slug) ? 28 : 0;
  const wordBonus = Math.min(12, post.wordCount / 250);
  const freshnessPenalty = freshnessDays > 900 ? 8 : freshnessDays > 540 ? 4 : 0;
  return Math.round(inboundCount * 2.1 + relatedCount * 1.5 + evergreenBonus + categoryBonus + starterBonus + wordBonus - freshnessPenalty);
}

function scoreHealth(post, inboundCount, relatedCount, freshnessDays) {
  const linkScore = Math.min(42, inboundCount * 2.5);
  const clusterScore = Math.min(24, relatedCount * 1.5);
  const freshnessScore = freshnessDays <= 180 ? 22 : freshnessDays <= 540 ? 14 : freshnessDays <= 900 ? 8 : 3;
  const depthScore = Math.min(12, post.wordCount / 250);
  return Math.max(0, Math.min(100, Math.round(linkScore + clusterScore + freshnessScore + depthScore)));
}

function getStatus(health) {
  if (health >= 78) return 'strong';
  if (health >= 58) return 'watch';
  return 'needs attention';
}

function summarizeClusters(posts, pillars) {
  const byCluster = new Map();
  for (const post of posts) {
    if (!byCluster.has(post.cluster)) byCluster.set(post.cluster, []);
    byCluster.get(post.cluster).push(post);
  }
  return [...byCluster.entries()]
    .map(([cluster, records]) => ({
      cluster,
      posts: records.length,
      pillars: pillars.filter((pillar) => pillar.cluster === cluster).length,
      internalLinks: records.reduce((sum, post) => sum + post.outboundCount, 0),
      averageInbound: Number((records.reduce((sum, post) => sum + post.inboundCount, 0) / records.length).toFixed(1)),
    }))
    .sort((a, b) => b.posts - a.posts);
}

function buildRecommendations(pillars, underlinkedPillars, linkGaps, orphanPosts) {
  return [
    {
      priority: 'High',
      title: 'Protect the highest-authority pillar',
      detail: `${pillars[0]?.title || 'Top pillar'} has the strongest internal footprint. Use it as the model for cluster linking and conversion routing.`,
    },
    {
      priority: 'High',
      title: 'Build links into underlinked pillars',
      detail: `${underlinkedPillars.length} inferred pillars need more supporting links. Start with the first ${Math.min(8, linkGaps.length)} contextual opportunities.`,
    },
    {
      priority: 'Medium',
      title: 'Turn recent posts into supporting assets',
      detail: 'New 2026 posts should link back to the correct evergreen guides, especially AI, Minecraft, Roblox, and coding-class pages.',
    },
    {
      priority: 'Medium',
      title: 'Clean up orphaned content',
      detail: `${orphanPosts.length} posts have weak link signals. Decide whether to refresh, merge, redirect, or add them to a cluster.`,
    },
  ];
}

function suggestAnchor(pillar) {
  const title = pillar.title.replace(/\s*\([^)]*\)/g, '').replace(/\s*\|\s*CodaKid.*/i, '');
  return title.length > 62 ? title.slice(0, 59).trim() + '...' : title;
}

function stripContent(post) {
  const { content, internalLinks, ...rest } = post;
  return rest;
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

function normalizeUrl(url) {
  try {
    const parsed = new URL(url, WP_BASE);
    parsed.hash = '';
    parsed.search = '';
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '').toLowerCase();
  } catch {
    return String(url).replace(/\/$/, '').toLowerCase();
  }
}

function daysSince(date) {
  if (!date) return 9999;
  return Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 86400000));
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
