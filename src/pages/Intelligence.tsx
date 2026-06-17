import React from 'react';
import { ArrowRight, Bot, Download, Lightbulb, ListChecks, Plus, RefreshCw, Search, Sparkles } from 'lucide-react';
import { useDashboard } from '../data';
import { KpiCard, LoadingState, PageHeading, PanelHeader } from '../components';
import { analystBriefMarkdown, contentIdeasMarkdown, downloadMarkdown } from '../export';
import { formatDate, formatter, shortUrl } from '../lib';
import type { AiAnalystBrief, AiContentIdea, AiVisibilityRun } from '../types';

export function IntelligencePage() {
  const {
    snapshot,
    aiWorkbench,
    technicalAudit,
    searchOpportunities,
    isLoading,
    runAiWorkbench,
    saveActionItem,
  } = useDashboard();
  const [brief, setBrief] = React.useState<AiAnalystBrief | null>(null);
  const [promptText, setPromptText] = React.useState('');
  const [busy, setBusy] = React.useState<string | null>(null);

  if (isLoading && !snapshot) return <LoadingState label="Loading AI Lab" />;

  async function runAnalyst() {
    setBusy('analyst');
    const result = await runAiWorkbench('analyst');
    if (result && 'headline' in (result as AiAnalystBrief)) setBrief(result as AiAnalystBrief);
    setBusy(null);
  }

  async function generateIdeas() {
    setBusy('ideas');
    await runAiWorkbench('content-ideas');
    setBusy(null);
  }

  async function runVisibility(prompts?: string[]) {
    setBusy('visibility');
    await runAiWorkbench('ai-visibility', { prompts: prompts?.length ? prompts : undefined });
    setPromptText('');
    setBusy(null);
  }

  const latestRuns = aiWorkbench?.latestVisibilityRuns || [];
  const ideas = aiWorkbench?.contentIdeas || [];
  const promptCount = aiWorkbench?.prompts?.length || 0;
  const visibilityMentions = latestRuns.filter((run) => run.codakidMentioned).length;

  return (
    <>
      <PageHeading
        title="AI Lab"
        description="OpenAI-powered SEO analysis, AI visibility checks, content ideas, and page-level planning."
        badges={<span className={aiWorkbench?.configured ? 'dash-badge live' : 'dash-badge'}>{aiWorkbench?.configured ? 'OpenAI connected' : 'OpenAI fallback mode'}</span>}
      />

      <div className="dash-stack">
        <section className="kpi-grid kpi-grid-3">
          <KpiCard icon={<Bot />} label="Visibility Prompts" value={promptCount} note="tracked AI-search questions" />
          <KpiCard icon={<Sparkles />} label="CodaKid Mentions" value={`${visibilityMentions}/${latestRuns.length || 0}`} note="latest AI visibility runs" tone={visibilityMentions ? 'success' : 'warning'} />
          <KpiCard icon={<ListChecks />} label="Audit Issues" value={technicalAudit?.summary.total || 0} note={`${technicalAudit?.summary.high || 0} high priority`} tone={technicalAudit?.summary.high ? 'danger' : 'success'} />
        </section>

        <section className="intelligence-grid">
          <div className="panel ai-command-panel">
            <PanelHeader icon={<Sparkles />} title="AI SEO Analyst" action={searchOpportunities?.startDate ? `${searchOpportunities.startDate} to ${searchOpportunities.endDate}` : 'latest data'} />
            <p className="panel-note">
              Generates a plain-English readout with metric source and time-period labels so numbers do not float without context.
            </p>
            <button className="primary-button" onClick={() => void runAnalyst()} disabled={busy === 'analyst'}>
              <RefreshCw size={15} className={busy === 'analyst' ? 'spin' : ''} />
              Generate analyst brief
            </button>
            {brief && (
              <div className="ai-brief-box">
                <div className="ai-brief-actions">
                  <span>Ready to share</span>
                  <button
                    type="button"
                    className="chip-button"
                    onClick={() => downloadMarkdown('codakid-ai-analyst-brief.md', analystBriefMarkdown(brief))}
                  >
                    <Download size={13} />
                    Export
                  </button>
                </div>
                <strong>{brief.headline}</strong>
                <p>{brief.summary}</p>
                <div className="ai-insight-list">
                  {brief.insights?.map((insight) => (
                    <article key={`${insight.title}-${insight.source}`}>
                      <span className={`severity-chip ${insight.severity}`}>{insight.source || 'AI'}</span>
                      <div>
                        <strong>{insight.title}</strong>
                        <p>{insight.detail}</p>
                        <small>{insight.period}</small>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="panel">
            <PanelHeader icon={<Search />} title="AI Visibility Tracker" action={`${latestRuns.length} latest runs`} />
            <p className="panel-note">
              Tracks how CodaKid might appear in AI-style answers for parent research prompts. Results are saved in Neon for trend history.
            </p>
            <div className="filter-bar">
              <div className="search-field">
                <Search size={15} />
                <input
                  value={promptText}
                  placeholder="Best Python coding class for kids"
                  onChange={(event) => setPromptText(event.target.value)}
                />
              </div>
              <button
                className="secondary-button"
                disabled={busy === 'visibility'}
                onClick={() => void runVisibility(promptText.trim() ? [promptText.trim()] : undefined)}
              >
                <Bot size={15} />
                {promptText.trim() ? 'Run prompt' : 'Run watchlist'}
              </button>
            </div>
            <VisibilityRuns runs={latestRuns} />
          </div>
        </section>

        <section className="panel">
          <PanelHeader
            icon={<Lightbulb />}
            title="Content Idea Generator"
            action={
              <span className="panel-actions">
                {ideas.length ? (
                  <button
                    type="button"
                    className="chip-button"
                    onClick={() => downloadMarkdown('codakid-content-ideas.md', contentIdeasMarkdown(ideas))}
                  >
                    <Download size={13} />
                    Export
                  </button>
                ) : null}
                <button type="button" className="chip-button" onClick={() => void generateIdeas()} disabled={busy === 'ideas'}>
                  <Plus size={13} />
                  Generate ideas
                </button>
              </span>
            }
          />
          <div className="content-idea-grid">
            {ideas.length ? ideas.slice(0, 12).map((idea) => (
              <ContentIdeaCard
                key={idea.id}
                idea={idea}
                onSave={() =>
                  saveActionItem({
                    fingerprint: `content-idea:${idea.id}`,
                    type: 'content-idea',
                    source: 'openai',
                    title: idea.title,
                    detail: `${idea.brief?.angle || 'Create this content idea.'} Target keyword: ${idea.targetKeyword || 'not set'}.`,
                    keyword: idea.targetKeyword,
                    cluster: idea.cluster,
                    pageUrl: idea.pillarUrl,
                    priorityScore: idea.priorityScore,
                  })
                }
              />
            )) : (
              <p className="panel-note">Generate ideas to create a reusable content backlog from crawl, competitor, keyword, and GA4 data.</p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function VisibilityRuns({ runs }: { runs: AiVisibilityRun[] }) {
  if (!runs.length) return <p className="panel-note">Run the watchlist to see AI visibility results.</p>;
  return (
    <div className="visibility-run-list">
      {runs.slice(0, 8).map((run) => (
        <article key={run.id}>
          <div>
            <strong>{run.prompt}</strong>
            <span className={`movement-chip ${run.codakidMentioned ? 'up' : 'down'}`}>
              {run.codakidMentioned ? 'mentioned' : 'not mentioned'}
            </span>
          </div>
          <p>{run.answer}</p>
          <small>
            {formatDate(run.createdAt)} · {run.codakidSentiment} · competitors:{' '}
            {run.competitors?.map((competitor) => competitor.domain).join(', ') || 'none listed'}
          </small>
        </article>
      ))}
    </div>
  );
}

function ContentIdeaCard({ idea, onSave }: { idea: AiContentIdea; onSave: () => Promise<unknown> }) {
  const outline = Array.isArray(idea.brief?.outline) ? idea.brief.outline.slice(0, 4) : [];
  return (
    <article className="content-idea-card">
      <div className="content-idea-head">
        <span>{formatter.format(idea.priorityScore)}</span>
        <small>{idea.intent || 'idea'}</small>
      </div>
      <strong>{idea.title}</strong>
      <p>{idea.brief?.angle || 'AI-generated content opportunity.'}</p>
      <div className="topic-tags">
        {idea.targetKeyword && <span>{idea.targetKeyword}</span>}
        {idea.cluster && <span>{idea.cluster}</span>}
        {idea.pillarUrl && <span>{shortUrl(idea.pillarUrl)}</span>}
      </div>
      {outline.length ? (
        <ul className="mini-outline">
          {outline.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : null}
      <button className="next-action-link idea-action" onClick={() => void onSave()}>
        Add to work queue <ArrowRight size={18} />
      </button>
    </article>
  );
}
