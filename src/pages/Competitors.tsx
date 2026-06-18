import React from 'react';
import { Archive, BarChart3, ExternalLink, FileUp, Globe2, Link2, Plus, Radio, RefreshCw, Search, Award, Target } from 'lucide-react';
import { useDashboard } from '../data';
import { LoadingState } from '../components';
import type { Cluster, CompetitorInput, CompetitorSnapshot, DomainAuthorityReport } from '../types';
import { ShareOfVoiceChart } from '../charts';
import { formatDate, formatPercent, formatter, shortUrl } from '../lib';

type CompetitorEntry = CompetitorSnapshot['competitors'][number];

export function CompetitorsPage() {
  const { competitors, research, isLoading, snapshot, saveCompetitor, archiveCompetitor, refresh, domainAuthority, refreshAuthority, refreshMentions, importBacklinks } = useDashboard();
  const [form, setForm] = React.useState<CompetitorInput>({ domain: '', label: '', category: '', notes: '' });
  const [query, setQuery] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [view, setView] = React.useState<'landscape' | 'visibility' | 'mentions' | 'backlinks'>('landscape');
  const [researchBusy, setResearchBusy] = React.useState(false);
  const [showAllCompetitors, setShowAllCompetitors] = React.useState(false);

  if (isLoading && !snapshot) return <LoadingState label="Sampling competitor sitemaps" />;

  const allCompetitors = competitors?.competitors || [];
  const filteredCompetitors = allCompetitors.filter((competitor) => {
    const haystack = `${competitor.domain} ${competitor.label || ''} ${competitor.category || ''}`.toLowerCase();
    return !query || haystack.includes(query.toLowerCase());
  });
  const visibleCompetitors = query || showAllCompetitors ? filteredCompetitors : filteredCompetitors.slice(0, 5);

  const totalBlogUrls = allCompetitors.reduce((sum, item) => sum + item.blogUrls, 0);
  const totalSampled = allCompetitors.reduce((sum, item) => sum + item.urlsSampled, 0);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.domain?.trim()) return;
    setIsSaving(true);
    await saveCompetitor(form);
    setForm({ domain: '', label: '', category: '', notes: '' });
    setIsSaving(false);
  }

  async function handleResample() {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <div className="competitors-page">
      <header className="research-header">
        <div><h1>Competitive research</h1><p>Search visibility, public content, mentions, and your imported Search Console link sample.</p></div>
        <dl>
          <div><dt>Competitors</dt><dd>{allCompetitors.length}</dd></div>
          <div><dt>CodaKid share</dt><dd>{formatPercent(research?.market.codakidShare || 0)}</dd></div>
          <div><dt>Mentions</dt><dd>{research?.mentions.total || 0}</dd></div>
          <div><dt>Referring domains</dt><dd>{research?.backlinks.domains || 0}</dd></div>
        </dl>
      </header>

      <nav className="research-view-tabs" aria-label="Research views">
        <button type="button" className={view === 'landscape' ? 'active' : ''} onClick={() => setView('landscape')}><Globe2 size={14} /> Landscape</button>
        <button type="button" className={view === 'visibility' ? 'active' : ''} onClick={() => setView('visibility')}><BarChart3 size={14} /> Search visibility</button>
        <button type="button" className={view === 'mentions' ? 'active' : ''} onClick={() => setView('mentions')}><Radio size={14} /> Mentions</button>
        <button type="button" className={view === 'backlinks' ? 'active' : ''} onClick={() => setView('backlinks')}><Link2 size={14} /> Backlinks</button>
      </nav>

      {view === 'landscape' ? <>
      <DomainAuthorityPanel domainAuthority={domainAuthority} refreshAuthority={refreshAuthority} />

      <section className="competitors-workspace">
        <div className="competitors-main">
          <div className="competitors-toolbar">
            <div className="competitors-search">
              <Search size={16} />
              <input
                value={query}
                placeholder="Filter by name, domain, or category…"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <span className="competitors-toolbar-meta">
              {visibleCompetitors.length} of {allCompetitors.length} shown
            </span>
          </div>

          {filteredCompetitors.length ? (
            <div className="competitors-list">
              {visibleCompetitors.map((competitor) => (
                <CompetitorRow key={competitor.domain} competitor={competitor} onArchive={() => void archiveCompetitor(competitor.domain)} />
              ))}
            </div>
          ) : (
            <div className="competitors-empty">
              <Globe2 size={26} strokeWidth={1.5} />
              <strong>{query ? 'No matches' : 'No competitors yet'}</strong>
              <p>{query ? 'Try a different search term.' : 'Add a competitor on the right to start sampling their sitemap.'}</p>
            </div>
          )}
          {!query && filteredCompetitors.length > 5 ? (
            <button type="button" className="competitors-show-more" onClick={() => setShowAllCompetitors((current) => !current)}>
              {showAllCompetitors ? 'Show fewer competitors' : `Show all ${filteredCompetitors.length} competitors`}
            </button>
          ) : null}
        </div>

        <aside className="competitors-sidebar">
          <form className="competitors-add-form" onSubmit={handleSubmit}>
            <div className="competitors-add-head">
              <Plus size={18} />
              <div>
                <h2>Add competitor</h2>
                <p>Domain gets sampled on the next crawl</p>
              </div>
            </div>
            <label>
              Domain
              <input
                required
                value={form.domain || ''}
                placeholder="example.com"
                onChange={(event) => setForm((current) => ({ ...current, domain: event.target.value }))}
              />
            </label>
            <label>
              Display name
              <input
                value={form.label || ''}
                placeholder="Competitor name"
                onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
              />
            </label>
            <label>
              Category
              <input
                value={form.category || ''}
                placeholder="live classes, games, camps…"
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
              />
            </label>
            <label>
              Notes
              <input
                value={form.notes || ''}
                placeholder="Why they matter"
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>
            <button type="submit" className="competitors-add-btn" disabled={isSaving}>
              <Plus size={15} />
              {isSaving ? 'Saving…' : 'Add to watchlist'}
            </button>
          </form>
        </aside>
      </section>

      {competitors && snapshot && filteredCompetitors.length ? (
        <details className="competitors-matrix-section competitors-matrix-disclosure">
          <summary className="competitors-matrix-head">
            <div>
              <Target size={18} />
              <div>
                <h2>Cluster overlap matrix</h2>
                <p>Open the detailed competitor-by-cluster comparison</p>
              </div>
            </div>
          </summary>
          <div className="competitors-matrix-body">
            <div className="competitors-matrix-legend">
              <span><i className="covered" /> You&apos;re strong</span>
              <span><i className="review" /> Worth reviewing</span>
              <span><i className="gap" /> Open gap</span>
              <span><i className="none" /> No overlap</span>
            </div>
            <CompetitorGapMatrix competitors={{ ...competitors, competitors: filteredCompetitors }} clusters={snapshot.clusters} />
          </div>
        </details>
      ) : null}
      </> : null}

      {view === 'visibility' ? (
        <section className="research-mode-panel">
          <div className="research-mode-head"><div><h2>Search share of voice</h2><p>Weighted presence across the latest top ten results for tracked keywords.</p></div><span>{research?.market.trackedSerps || 0} SERPs</span></div>
          <ShareOfVoiceChart rows={research?.market.shareOfVoice || []} />
          <div className="research-signal-strip">
            <div><span>People Also Ask</span><strong>{research?.market.serpFeatures.peopleAlsoAsk || 0}</strong><small>tracked SERPs with questions</small></div>
            <div><span>Related searches</span><strong>{research?.market.serpFeatures.relatedSearches || 0}</strong><small>tracked SERPs with topic expansions</small></div>
            <div><span>Serper usage</span><strong>{research?.credits.usedThisMonth || 0}</strong><small>of {research?.credits.monthlyBudget || 2000} dashboard budget</small></div>
          </div>
        </section>
      ) : null}

      {view === 'mentions' ? (
        <section className="research-mode-panel">
          <div className="research-mode-head">
            <div><h2>External mentions</h2><p>Weekly web results that mention CodaKid outside codakid.com. This is mention monitoring, not a complete backlink index.</p></div>
            <button type="button" className="secondary-button" disabled={researchBusy || !research?.configured} onClick={async () => { setResearchBusy(true); await refreshMentions(); setResearchBusy(false); }}><RefreshCw size={14} className={researchBusy ? 'spin' : ''} /> Refresh</button>
          </div>
          <div className="research-result-list">
            {(research?.mentions.rows || []).map((mention) => (
              <article key={mention.id}><div><strong>{mention.title || mention.domain}</strong><a href={mention.url} target="_blank" rel="noreferrer">{mention.domain}<ExternalLink size={11} /></a><p>{mention.snippet}</p></div><time>{formatDate(mention.lastSeenAt)}</time></article>
            ))}
            {!research?.mentions.rows.length ? <div className="research-empty"><Radio size={24} /><strong>No external mentions saved yet</strong><p>Run the weekly check to create the first sample.</p></div> : null}
          </div>
        </section>
      ) : null}

      {view === 'backlinks' ? <BacklinkPanel research={research} onImport={importBacklinks} /> : null}
    </div>
  );
}

function BacklinkPanel({ research, onImport }: { research: ReturnType<typeof useDashboard>['research']; onImport: (rows: Array<{ sourceUrl: string; targetUrl?: string }>) => Promise<void> }) {
  const [busy, setBusy] = React.useState(false);
  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const text = await file.text();
    const rows = parseBacklinkFile(text);
    await onImport(rows);
    setBusy(false);
    event.target.value = '';
  }
  return (
    <section className="research-mode-panel">
      <div className="research-mode-head">
        <div><h2>Backlink sample</h2><p>Import the free Search Console external-links CSV. Google provides a sample, so totals are intentionally labeled as partial.</p></div>
        <label className="secondary-button file-button"><FileUp size={14} />{busy ? 'Importing…' : 'Import CSV'}<input type="file" accept=".csv,.txt,text/csv,text/plain" disabled={busy} onChange={(event) => void handleFile(event)} /></label>
      </div>
      <div className="research-signal-strip">
        <div><span>Sampled links</span><strong>{formatter.format(research?.backlinks.total || 0)}</strong><small>unique source and target pairs</small></div>
        <div><span>Referring domains</span><strong>{formatter.format(research?.backlinks.domains || 0)}</strong><small>from the imported sample</small></div>
        <div><span>Updated</span><strong className="date-value">{research?.backlinks.updatedAt ? formatDate(research.backlinks.updatedAt) : 'Not imported'}</strong><small>latest Search Console export</small></div>
      </div>
      <div className="backlink-columns">
        <div><h3>Top referring domains</h3>{research?.backlinks.topDomains.map((row) => <article key={row.domain}><span>{row.domain}</span><strong>{row.links}</strong></article>)}</div>
        <div><h3>Most-linked pages</h3>{research?.backlinks.topTargets.map((row) => <article key={row.url}><span>{shortUrl(row.url)}</span><strong>{row.links}</strong></article>)}</div>
      </div>
      {!research?.backlinks.total ? <div className="research-empty compact"><Link2 size={22} /><strong>No link sample imported</strong><p>The rest of Research works without this optional file.</p></div> : null}
    </section>
  );
}

function parseBacklinkFile(text: string) {
  const rows = text.split(/\r?\n/).map(parseCsvRow).filter((row) => row.length);
  const header = rows[0]?.map((value) => value.toLowerCase()) || [];
  const sourceIndex = Math.max(0, header.findIndex((value) => /source|linking page|latest links|url/.test(value)));
  const targetIndex = header.findIndex((value) => /target|linked page/.test(value));
  const hasHeader = header.some((value) => /source|link|url|target/.test(value) && !/^https?:/.test(value));
  return rows.slice(hasHeader ? 1 : 0).map((row) => ({ sourceUrl: row[sourceIndex] || '', targetUrl: targetIndex >= 0 ? row[targetIndex] : undefined })).filter((row) => /^https?:\/\//i.test(row.sourceUrl));
}

function parseCsvRow(line: string) {
  const cells = []; let value = ''; let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { cells.push(value.trim()); value = ''; }
    else value += char;
  }
  cells.push(value.trim());
  return cells;
}

function CompetitorRow({
  competitor,
  onArchive,
}: {
  competitor: CompetitorEntry;
  onArchive: () => void;
}) {
  const topTopics = competitor.visibleTopics.slice(0, 5);

  return (
    <article className="competitor-row">
      <div className="competitor-row-main">
        <header>
          <div>
            <h3>{competitor.label || competitor.domain}</h3>
            <a href={`https://${competitor.domain}`} target="_blank" rel="noreferrer">
              {competitor.domain}
              <ExternalLink size={12} />
            </a>
          </div>
          <div className="competitor-row-badges">
            <span className="competitor-category">{competitor.category || 'Competitor'}</span>
            <span className={`competitor-status ${competitor.status}`}>{competitor.status}</span>
          </div>
        </header>

        <p className="competitor-row-stats">
          <strong>{competitor.blogUrls}</strong> blog URLs from <strong>{competitor.urlsSampled}</strong> sitemap pages sampled
        </p>

        {competitor.opportunities[0] ? (
          <p className="competitor-row-opportunity">{competitor.opportunities[0]}</p>
        ) : null}

        {competitor.contentAngles?.length ? (
          <div className="competitor-row-angles">
            {competitor.contentAngles.slice(0, 3).map((angle) => (
              <span key={angle}>{angle}</span>
            ))}
          </div>
        ) : null}

        {topTopics.length ? (
          <div className="competitor-row-topics">
            {topTopics.map((topic) => (
              <span key={topic.topic}>
                {topic.topic} <em>{topic.count}</em>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <button type="button" className="competitor-archive-btn" title="Archive competitor" onClick={onArchive}>
        <Archive size={15} />
      </button>
    </article>
  );
}

function DomainAuthorityPanel({
  domainAuthority,
  refreshAuthority,
}: {
  domainAuthority: DomainAuthorityReport | null;
  refreshAuthority: () => Promise<void>;
}) {
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      await refreshAuthority();
    } finally {
      setIsRefreshing(false);
    }
  }

  if (!domainAuthority?.configured) {
    return (
      <section className="competitors-da competitors-da-setup">
        <Award size={20} />
        <div>
          <strong>Domain authority</strong>
          <p>
            Add <code>OPENPAGERANK_API_KEY</code> in Netlify to score your domain and competitors on a 0–10 scale (free via OpenPageRank).
          </p>
        </div>
      </section>
    );
  }

  const domains = domainAuthority.domains || [];
  const maxRank = Math.max(10, ...domains.map((entry) => entry.pageRank || 0));

  return (
    <section className="competitors-da">
      <div className="competitors-da-head">
        <div>
          <Award size={18} />
          <div>
            <h2>Domain authority</h2>
            <p>PageRank 0–10 · {domainAuthority.source}</p>
          </div>
        </div>
        <button type="button" className="competitors-text-btn" disabled={isRefreshing} onClick={() => void handleRefresh()}>
          <RefreshCw size={14} className={isRefreshing ? 'spin' : ''} />
          Refresh
        </button>
      </div>
      <div className="competitors-da-list">
        {domains.map((entry) => (
          <article key={entry.domain} className={entry.isOwn ? 'is-own' : ''}>
            <div className="competitors-da-label">
              <strong>{entry.label || entry.domain}</strong>
              <small>
                {entry.domain}
                {entry.isOwn ? ' · your site' : ''}
              </small>
            </div>
            <div className="competitors-da-track">
              <span style={{ width: `${Math.min(100, ((entry.pageRank || 0) / maxRank) * 100)}%` }} />
            </div>
            <div className="competitors-da-score">
              {entry.pageRank != null ? entry.pageRank.toFixed(2) : '—'}
              {entry.rank ? <small>#{entry.rank.toLocaleString()}</small> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function CompetitorGapMatrix({ competitors, clusters }: { competitors: CompetitorSnapshot; clusters: Cluster[] }) {
  const clusterTerms = clusters.slice(0, 7).map((cluster) => ({
    cluster: cluster.cluster,
    count: cluster.posts,
    terms: cluster.cluster.toLowerCase().split(/\s+/).filter(Boolean),
  }));

  return (
    <div className="competitors-matrix-wrap">
      <table className="competitors-matrix">
        <thead>
          <tr>
            <th>Competitor</th>
            {clusterTerms.map((cluster) => (
              <th key={cluster.cluster} title={cluster.cluster}>
                {truncateCluster(cluster.cluster)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {competitors.competitors.map((competitor) => {
            const haystack = [
              ...competitor.visibleTopics.map((topic) => topic.topic),
              ...(competitor.contentAngles || []),
              ...(competitor.sampledPages || []).map((page) => page.title),
            ]
              .join(' ')
              .toLowerCase();

            return (
              <tr key={competitor.domain}>
                <td>
                  <strong>{competitor.label || competitor.domain}</strong>
                  <small>{competitor.blogUrls} URLs</small>
                </td>
                {clusterTerms.map((cluster) => {
                  const overlap = cluster.terms.some((term) => haystack.includes(term.toLowerCase()));
                  const depth = cluster.count >= 20 ? 'covered' : cluster.count >= 8 ? 'review' : 'gap';
                  const cell = overlap ? depth : 'none';
                  const label = overlap
                    ? depth === 'covered'
                      ? 'Strong overlap'
                      : 'Review overlap'
                    : 'Gap opportunity';

                  return (
                    <td key={cluster.cluster}>
                      <span className={`competitors-matrix-cell ${cell}`} title={`${cluster.cluster} · ${label}`} aria-label={label} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function truncateCluster(name: string) {
  if (name.length <= 14) return name;
  return `${name.slice(0, 13)}…`;
}
