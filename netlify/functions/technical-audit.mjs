import { randomUUID } from 'node:crypto';
import { errorResponse, getSql, json, requireUser } from './_auth.mjs';
import { loadContentSnapshot } from './content-snapshot.mjs';

export async function handler(event) {
  try {
    await requireUser(event);
    const snapshot = await loadContentSnapshot({ forceRefresh: false });
    const issues = await buildIssues(snapshot);
    const summary = summarize(issues);
    const healthScore = auditHealthScore(summary, snapshot);
    await saveAuditSnapshot(summary, healthScore);
    const trend = await fetchAuditTrend();
    return json(
      200,
      {
        generatedAt: new Date().toISOString(),
        healthScore,
        summary,
        issues,
        trend,
      },
      { 'cache-control': 'private, no-store' },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

async function buildIssues(snapshot) {
  const posts = snapshot.allPosts || [];
  const issues = [];

  for (const post of posts) {
    if ((post.titleLength || 0) < 35) {
      issues.push(issue('short-title', 'Medium', post, 'Short title', `${post.titleLength || 0} characters. Expand the title so searchers understand the page promise.`, 54));
    }
    if ((post.titleLength || 0) > 72) {
      issues.push(issue('long-title', 'Medium', post, 'Long title', `${post.titleLength} characters. Trim to reduce SERP truncation risk.`, 56));
    }
    if ((post.excerptLength || 0) < 80) {
      issues.push(issue('thin-meta-summary', 'Medium', post, 'Weak meta summary proxy', `${post.excerptLength || 0} excerpt characters. Add a stronger summary/meta description target.`, 52));
    }
    if ((post.h2Count || 0) < 2 && (post.wordCount || 0) > 900) {
      issues.push(issue('weak-heading-structure', 'Medium', post, 'Weak heading structure', `${post.h2Count || 0} H2 headings on a ${post.wordCount || 0}-word post. Add scan-friendly sections.`, 57));
    }
    if ((post.imagesMissingAlt || 0) > 0) {
      issues.push(issue('image-alt-missing', 'Medium', post, 'Images missing alt text', `${post.imagesMissingAlt} of ${post.imageCount || post.imagesMissingAlt} images appear to have empty/missing alt text.`, 61));
    }
    if ((post.schemaHintCount || 0) === 0 && (post.wordCount || 0) > 1200) {
      issues.push(issue('schema-opportunity', 'Low', post, 'Schema opportunity', 'No schema hints found in the post body. Consider FAQ/Article schema where appropriate.', 38));
    }
    if ((post.wordCount || 0) > 0 && post.wordCount < 650) {
      issues.push(issue('thin-content', 'High', post, 'Thin content', `${post.wordCount} words. Expand or consolidate this page.`, 82));
    }
    if (daysSince(post.modified || post.date) > 540) {
      issues.push(issue('stale-content', 'Medium', post, 'Stale content', `Last updated ${post.modified || post.date}. Review examples, dates, screenshots, and FAQs.`, 64));
    }
    if (post.inboundCount === 0) {
      issues.push(issue('orphan-post', 'High', post, 'Orphaned post', 'No internal links pointing in. Add this page to a relevant cluster path or merge it.', 88));
    }
    if (post.outboundCount < 2) {
      issues.push(issue('weak-outbound-links', 'Medium', post, 'Weak outbound internal links', `${post.outboundCount} internal links out. Add links to the best pillar and 2 supporting posts.`, 58));
    }
    if (post.health < 45) {
      issues.push(issue('low-health', 'High', post, 'Low SEO health', `Health score ${post.health}. Needs freshness, link, or depth work.`, 76));
    }
  }

  for (const gap of snapshot.linkGaps || []) {
    issues.push({
      id: `link-gap:${gap.sourceUrl}:${gap.pillarUrl}`,
      type: 'link-gap',
      severity: 'High',
      title: 'Missing internal link',
      detail: `Add a link from "${gap.sourceTitle}" to "${gap.pillarTitle}" using "${gap.suggestedAnchor}".`,
      pageUrl: gap.sourceUrl,
      pageTitle: gap.sourceTitle,
      targetUrl: gap.pillarUrl,
      targetTitle: gap.pillarTitle,
      cluster: gap.cluster,
      priorityScore: 72,
    });
  }

  const brokenLinks = await findBrokenInternalLinks(posts);
  for (const broken of brokenLinks) {
    issues.push({
      id: `broken-internal-link:${broken.sourceUrl}:${broken.url}`,
      type: 'broken-internal-link',
      severity: 'High',
      title: 'Broken internal link',
      detail: `Internal link returned ${broken.status}. Fix or redirect ${broken.url}.`,
      pageUrl: broken.sourceUrl,
      pageTitle: broken.sourceTitle,
      targetUrl: broken.url,
      targetTitle: broken.url,
      cluster: broken.cluster,
      priorityScore: 92,
    });
  }

  return issues.sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 250);
}

function issue(type, severity, post, title, detail, score) {
  return {
    id: `${type}:${post.url}`,
    type,
    severity,
    title,
    detail,
    pageUrl: post.url,
    pageTitle: post.title,
    cluster: post.cluster,
    priorityScore: score,
  };
}

function summarize(issues) {
  return {
    total: issues.length,
    high: issues.filter((issue) => issue.severity === 'High').length,
    medium: issues.filter((issue) => issue.severity === 'Medium').length,
    byType: issues.reduce((map, issue) => {
      map[issue.type] = (map[issue.type] || 0) + 1;
      return map;
    }, {}),
  };
}

async function findBrokenInternalLinks(posts) {
  const seen = new Set();
  const candidates = [];
  for (const post of posts) {
    for (const url of post.internalLinks || []) {
      if (seen.has(url)) continue;
      seen.add(url);
      candidates.push({
        url,
        sourceUrl: post.url,
        sourceTitle: post.title,
        cluster: post.cluster,
      });
      if (candidates.length >= 45) break;
    }
    if (candidates.length >= 45) break;
  }

  const checked = await Promise.all(candidates.map(async (candidate) => {
    try {
      const response = await fetch(candidate.url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(4500),
        headers: { 'user-agent': 'CodaKidContentDashboard/1.0' },
      });
      return response.status >= 400 ? { ...candidate, status: response.status } : null;
    } catch {
      try {
        const response = await fetch(candidate.url, {
          method: 'GET',
          redirect: 'follow',
          signal: AbortSignal.timeout(4500),
          headers: { 'user-agent': 'CodaKidContentDashboard/1.0' },
        });
        return response.status >= 400 ? { ...candidate, status: response.status } : null;
      } catch {
        return null;
      }
    }
  }));

  return checked.filter(Boolean).slice(0, 20);
}

function auditHealthScore(summary, snapshot) {
  const posts = Math.max(1, snapshot.kpis?.postsCrawled || 1);
  const highPenalty = Math.min(45, (summary.high / posts) * 140);
  const mediumPenalty = Math.min(28, (summary.medium / posts) * 65);
  const linkPenalty = Math.min(18, ((summary.byType?.['broken-internal-link'] || 0) + (summary.byType?.['link-gap'] || 0)) / posts * 120);
  return Math.max(0, Math.round(100 - highPenalty - mediumPenalty - linkPenalty));
}

async function saveAuditSnapshot(summary, healthScore) {
  try {
    const sql = getSql();
    const recentRows = await sql`
      select id
      from technical_audit_snapshots
      where created_at >= now() - interval '6 hours'
      limit 1
    `;
    if (recentRows[0]) return;
    await sql`
      insert into technical_audit_snapshots (id, health_score, summary, issue_count, high_count, medium_count)
      values (${randomUUID()}, ${healthScore}, ${JSON.stringify(summary)}, ${summary.total}, ${summary.high}, ${summary.medium})
    `;
    await sql`delete from technical_audit_snapshots where created_at < now() - interval '180 days'`;
  } catch {
    // Trend persistence should not block the audit.
  }
}

async function fetchAuditTrend() {
  try {
    const sql = getSql();
    const rows = await sql`
      select health_score, summary, issue_count, high_count, medium_count, created_at
      from technical_audit_snapshots
      order by created_at asc
      limit 60
    `;
    return rows.map((row) => ({
      createdAt: row.created_at,
      healthScore: row.health_score,
      total: row.issue_count,
      high: row.high_count,
      medium: row.medium_count,
      byType: row.summary?.byType || {},
    }));
  } catch {
    return [];
  }
}

function daysSince(value) {
  if (!value) return 9999;
  return Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 86400000));
}
