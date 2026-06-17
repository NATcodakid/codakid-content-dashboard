import type { AiAnalystBrief, AiContentIdea, PageBrief, PostSummary } from './types';

export function downloadMarkdown(filename: string, markdown: string) {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.md') ? filename : `${filename}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function analystBriefMarkdown(brief: AiAnalystBrief) {
  return [
    `# ${brief.headline}`,
    '',
    brief.summary,
    '',
    '## Insights',
    ...(brief.insights || []).flatMap((insight) => [
      `### ${insight.title}`,
      `Source: ${insight.source || 'AI'} · Period: ${insight.period || 'latest data'} · Severity: ${insight.severity || 'info'}`,
      '',
      insight.detail,
      '',
    ]),
    '## Recommended Actions',
    ...(brief.recommendedActions || []).flatMap((action) => [
      `### ${action.title}`,
      `Priority: ${action.priorityScore}`,
      '',
      action.detail,
      '',
    ]),
  ].join('\n');
}

export function contentIdeasMarkdown(ideas: AiContentIdea[]) {
  return [
    '# CodaKid Content Ideas',
    '',
    ...ideas.map((idea) => [
      `## ${idea.title}`,
      `Keyword: ${idea.targetKeyword || 'Not set'}`,
      `Cluster: ${idea.cluster || 'Not set'}`,
      `Priority: ${idea.priorityScore}`,
      '',
      idea.brief?.angle || 'No angle saved.',
      '',
      ...(Array.isArray(idea.brief?.outline) ? ['### Outline', ...idea.brief.outline.map((item) => `- ${item}`), ''] : []),
      idea.brief?.competitorGap ? `Competitor gap: ${idea.brief.competitorGap}` : '',
    ].filter(Boolean).join('\n')).join('\n\n'),
  ].join('\n');
}

export function pageBriefMarkdown(page: PostSummary, brief: PageBrief) {
  return [
    `# Rewrite Brief: ${page.title}`,
    '',
    `URL: ${page.url}`,
    `Cluster: ${page.cluster}`,
    '',
    section('Title Ideas', brief.titleIdeas),
    section('Meta Descriptions', brief.metaDescriptions),
    section('FAQ Questions', brief.faqQuestions),
    section('Missing Sections', brief.missingSections),
    section('Internal Link Anchors', brief.internalLinkAnchors),
    section('Rewrite Notes', brief.rewriteNotes),
  ].filter(Boolean).join('\n\n');
}

function section(title: string, rows?: string[]) {
  const visibleRows = (rows || []).filter(Boolean);
  if (!visibleRows.length) return '';
  return [`## ${title}`, ...visibleRows.map((row) => `- ${row}`)].join('\n');
}
