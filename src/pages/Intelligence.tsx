import React from 'react';
import { ArrowRight, Bot, Download, ExternalLink, Globe2, Lightbulb, ListChecks, Plus, RefreshCw, Search, Sparkles, Wand2 } from 'lucide-react';
import { useDashboard } from '../data';
import { LoadingState } from '../components';
import { analystBriefMarkdown, contentIdeasMarkdown, downloadMarkdown } from '../export';
import { formatDate, shortUrl } from '../lib';
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
  const visibilityHistory = aiWorkbench?.visibilityHistory || [];
  const ideas = aiWorkbench?.contentIdeas || [];
  const watchlist = aiWorkbench?.prompts || [];
  const promptCount = watchlist.length;
  const visibilityMentions = latestRuns.filter((run) => run.codakidMentioned).length;
  const recentHistory = visibilityHistory.filter((run) => Date.now() - new Date(run.createdAt).getTime() <= 30 * 86400000);
  const historicalMentionRate = recentHistory.length ? Math.round((recentHistory.filter((run) => run.codakidMentioned).length / recentHistory.length) * 100) : null;
  const periodLabel = searchOpportunities?.startDate
    ? `${searchOpportunities.startDate} – ${searchOpportunities.endDate}`
    : 'latest crawl + GSC';

  return (
    <div className="ai-lab">
      <header className="ai-lab-hero">
        <div className="ai-lab-hero-glow" aria-hidden />
        <div className="ai-lab-hero-inner">
          <div className="ai-lab-hero-copy">
            <span className="ai-lab-eyebrow">
              <Sparkles size={14} />
              AI Lab
            </span>
            <h1>SEO intelligence workspace</h1>
            <p>
              Analyst briefs, AI-search visibility, and content ideas — grounded in your crawl, Search Console, and competitor data.
            </p>
          </div>
          <div className="ai-lab-hero-aside">
            <span className={`ai-lab-status${aiWorkbench?.configured ? ' live' : ''}`}>
              <i aria-hidden />
              {aiWorkbench?.configured ? 'OpenAI connected' : 'Fallback mode'}
            </span>
            <dl className="ai-lab-stats">
              <div>
                <dt>Prompts</dt>
                <dd>{promptCount}</dd>
              </div>
              <div>
                <dt>Mentions</dt>
                <dd>
                  {visibilityMentions}/{latestRuns.length || 0}
                </dd>
              </div>
              <div>
                <dt>Audit issues</dt>
                <dd>{technicalAudit?.summary.total || 0}</dd>
              </div>
            </dl>
          </div>
        </div>
      </header>

      <section className="ai-lab-workspace">
        <article className="ai-lab-station analyst">
          <div className="ai-lab-station-head">
            <div>
              <Wand2 size={18} />
              <div>
                <h2>SEO Analyst</h2>
                <p>Plain-English readout with labeled sources · {periodLabel}</p>
              </div>
            </div>
            <button className="ai-lab-run-btn" onClick={() => void runAnalyst()} disabled={busy === 'analyst'}>
              <RefreshCw size={15} className={busy === 'analyst' ? 'spin' : ''} />
              {brief ? 'Refresh brief' : 'Generate brief'}
            </button>
          </div>

          {brief ? (
            <div className="ai-lab-brief">
              <div className="ai-lab-brief-toolbar">
                <span>Analyst brief</span>
                <button
                  type="button"
                  className="ai-lab-text-btn"
                  onClick={() => downloadMarkdown('codakid-ai-analyst-brief.md', analystBriefMarkdown(brief))}
                >
                  <Download size={14} />
                  Export
                </button>
              </div>
              <h3>{brief.headline}</h3>
              <p className="ai-lab-brief-summary">{brief.summary}</p>
              {brief.insights?.length ? (
                <ol className="ai-lab-insights">
                  {brief.insights.map((insight) => (
                    <li key={`${insight.title}-${insight.source}`} data-severity={insight.severity || 'default'}>
                      <div className="ai-lab-insight-top">
                        <strong>{insight.title}</strong>
                        <span>{insight.source || 'AI'}</span>
                      </div>
                      <p>{insight.detail}</p>
                      {insight.period ? <small>{insight.period}</small> : null}
                    </li>
                  ))}
                </ol>
              ) : null}
              {brief.recommendedActions?.length ? (
                <div className="ai-lab-actions-block">
                  <h4>Recommended next</h4>
                  <ul>
                    {brief.recommendedActions.slice(0, 4).map((action) => (
                      <li key={action.title}>
                        <strong>{action.title}</strong>
                        <span>{action.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="ai-lab-empty">
              <div className="ai-lab-empty-orb" aria-hidden />
              <strong>Run your first analyst brief</strong>
              <p>Summarizes what moved in search, what needs links, and what to fix — with the date range on every metric.</p>
            </div>
          )}
        </article>

        <article className="ai-lab-station visibility">
          <div className="ai-lab-station-head">
            <div>
              <Search size={18} />
              <div>
                <h2>AI Visibility</h2>
                <p>How CodaKid shows up in AI-style parent research answers</p>
              </div>
            </div>
            <span className="ai-lab-station-meta">{historicalMentionRate == null ? `${latestRuns.length} latest runs` : `${historicalMentionRate}% mentioned · last 30 days`}</span>
          </div>

          <VisibilityConfidence runs={visibilityHistory} />

          <div className="ai-lab-prompt-bar">
            <Search size={18} />
            <input
              value={promptText}
              placeholder="Ask a parent research question…"
              onChange={(event) => setPromptText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !busy) {
                  void runVisibility(promptText.trim() ? [promptText.trim()] : undefined);
                }
              }}
            />
            <button
              type="button"
              className="ai-lab-run-btn compact"
              disabled={busy === 'visibility'}
              onClick={() => void runVisibility(promptText.trim() ? [promptText.trim()] : undefined)}
            >
              <Bot size={15} />
              {busy === 'visibility' ? 'Checking…' : promptText.trim() ? 'Run' : 'Watchlist'}
            </button>
          </div>

          {watchlist.length ? (
            <div className="ai-lab-prompt-chips">
              {watchlist.slice(0, 6).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="ai-lab-prompt-chip"
                  disabled={busy === 'visibility'}
                  onClick={() => void runVisibility([item.prompt])}
                >
                  {item.prompt}
                </button>
              ))}
            </div>
          ) : null}

          <VisibilityFeed
            runs={latestRuns}
            onSave={(run) => saveActionItem({
              fingerprint: `ai-visibility:${run.id}`,
              type: 'ai-visibility',
              source: run.sourceMode === 'web' ? 'openai-web-search' : 'openai',
              title: run.codakidMentioned ? `Strengthen visibility for “${run.prompt}”` : `Build visibility for “${run.prompt}”`,
              detail: run.recommendations?.[0] || 'Review cited sources and improve the most relevant CodaKid page for this parent question.',
              priorityScore: run.codakidMentioned ? 55 : 78,
            })}
          />
        </article>
      </section>

      <section className="ai-lab-ideas">
        <div className="ai-lab-ideas-head">
          <div>
            <Lightbulb size={18} />
            <div>
              <h2>Content ideas</h2>
              <p>Backlog from crawl, competitors, keywords, and GA4</p>
            </div>
          </div>
          <div className="ai-lab-ideas-actions">
            {ideas.length ? (
              <button
                type="button"
                className="ai-lab-text-btn"
                onClick={() => downloadMarkdown('codakid-content-ideas.md', contentIdeasMarkdown(ideas))}
              >
                <Download size={14} />
                Export
              </button>
            ) : null}
            <button type="button" className="ai-lab-run-btn" onClick={() => void generateIdeas()} disabled={busy === 'ideas'}>
              <Plus size={15} />
              Generate ideas
            </button>
          </div>
        </div>

        {ideas.length ? (
          <div className="ai-lab-ideas-grid">
            {ideas.slice(0, 12).map((idea, index) => (
              <ContentIdeaCard
                key={idea.id}
                idea={idea}
                featured={index === 0}
                rank={index + 1}
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
            ))}
          </div>
        ) : (
          <div className="ai-lab-empty ideas">
            <ListChecks size={28} strokeWidth={1.5} />
            <strong>No ideas yet</strong>
            <p>Generate a batch to fill your content queue with keyword targets and outlines.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function VisibilityConfidence({ runs }: { runs: AiVisibilityRun[] }) {
  const recent = runs.filter((run) => Date.now() - new Date(run.createdAt).getTime() <= 30 * 86400000);
  const prompts = new Set(recent.map((run) => run.prompt.toLowerCase()));
  const webRuns = recent.filter((run) => run.sourceMode === 'web');
  const mentions = recent.filter((run) => run.codakidMentioned).length;
  const citations = recent.reduce((total, run) => total + (run.sources?.length || 0), 0);
  const repeated = [...prompts].filter((prompt) => recent.filter((run) => run.prompt.toLowerCase() === prompt).length >= 2).length;
  const confidence = recent.length >= 20 && repeated >= Math.max(3, prompts.size / 2) ? 'Good sample' : recent.length >= 8 ? 'Directional sample' : 'Early sample';
  return (
    <div className="ai-visibility-confidence">
      <div><span>Confidence</span><strong>{confidence}</strong><small>AI answers vary; repeated runs improve reliability.</small></div>
      <div><span>Mention rate</span><strong>{recent.length ? Math.round((mentions / recent.length) * 100) : 0}%</strong><small>{mentions} of {recent.length} saved runs</small></div>
      <div><span>Web-grounded</span><strong>{recent.length ? Math.round((webRuns.length / recent.length) * 100) : 0}%</strong><small>{citations} citations captured</small></div>
      <div><span>Repeated prompts</span><strong>{repeated}/{prompts.size}</strong><small>30-day prompt coverage</small></div>
    </div>
  );
}

function VisibilityFeed({ runs, onSave }: { runs: AiVisibilityRun[]; onSave: (run: AiVisibilityRun) => Promise<unknown> }) {
  if (!runs.length) {
    return (
      <div className="ai-lab-feed-empty">
        <Bot size={22} strokeWidth={1.5} />
        <p>Run the watchlist or type a question above to see visibility results.</p>
      </div>
    );
  }

  return (
    <div className="ai-lab-feed">
      {runs.slice(0, 8).map((run) => (
        <article key={run.id} className={run.codakidMentioned ? 'mentioned' : ''}>
          <div className="ai-lab-feed-marker" aria-hidden />
          <div className="ai-lab-feed-body">
            <header>
              <strong>{run.prompt}</strong>
              <div className="ai-visibility-badges">
                <span className={`source ${run.sourceMode === 'web' ? 'web' : ''}`}><Globe2 size={11} />{run.sourceMode === 'web' ? 'Web-grounded' : run.sourceMode === 'model' ? 'Model answer' : 'Internal fallback'}</span>
                <span className={run.codakidMentioned ? 'hit' : 'miss'}>{run.codakidMentioned ? 'Mentioned' : 'Not mentioned'}</span>
              </div>
            </header>
            <p>{run.answer}</p>
            {run.sources?.length ? (
              <div className="ai-visibility-sources">
                {run.sources.slice(0, 4).map((source) => (
                  <a key={source.url} href={source.url} target="_blank" rel="noreferrer"><ExternalLink size={11} />{source.title || sourceHost(source.url)}</a>
                ))}
              </div>
            ) : null}
            <footer>
              <span>{formatDate(run.createdAt)}{run.codakidSentiment ? ` · ${run.codakidSentiment}` : ''}{run.durationMs ? ` · ${(run.durationMs / 1000).toFixed(1)}s` : ''}</span>
              <button type="button" onClick={() => void onSave(run)}><Plus size={12} /> Add action</button>
            </footer>
          </div>
        </article>
      ))}
    </div>
  );
}

function sourceHost(url: string) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Source'; } }

function ContentIdeaCard({
  idea,
  featured,
  rank,
  onSave,
}: {
  idea: AiContentIdea;
  featured?: boolean;
  rank: number;
  onSave: () => Promise<unknown>;
}) {
  const outline = Array.isArray(idea.brief?.outline) ? idea.brief.outline.slice(0, 3) : [];
  const tier = idea.priorityScore >= 80 ? 'high' : idea.priorityScore >= 60 ? 'mid' : 'low';

  return (
    <article className={`ai-lab-idea-card${featured ? ' featured' : ''}`}>
      <div className="ai-lab-idea-top">
        <span className="ai-lab-idea-rank">#{rank}</span>
        <span className={`ai-lab-idea-tier ${tier}`}>{tier === 'high' ? 'High priority' : tier === 'mid' ? 'Medium' : 'Explore'}</span>
      </div>
      <h3>{idea.title}</h3>
      <p>{idea.brief?.angle || 'AI-generated content opportunity.'}</p>
      <div className="ai-lab-idea-tags">
        {idea.targetKeyword ? <span>{idea.targetKeyword}</span> : null}
        {idea.cluster ? <span>{idea.cluster}</span> : null}
        {idea.pillarUrl ? <span>{shortUrl(idea.pillarUrl)}</span> : null}
      </div>
      {outline.length ? (
        <ul className="ai-lab-idea-outline">
          {outline.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      <button type="button" className="ai-lab-idea-action" onClick={() => void onSave()}>
        Add to work queue
        <ArrowRight size={15} />
      </button>
    </article>
  );
}
