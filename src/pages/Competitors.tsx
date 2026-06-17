import React from 'react';
import { Archive, ExternalLink, Globe2, Plus, RefreshCw, Search, Award, Swords, Target } from 'lucide-react';
import { useDashboard } from '../data';
import { LoadingState } from '../components';
import { formatDate } from '../lib';
import type { Cluster, CompetitorInput, CompetitorSnapshot, DomainAuthorityReport } from '../types';

type CompetitorEntry = CompetitorSnapshot['competitors'][number];

export function CompetitorsPage() {
  const { competitors, isLoading, snapshot, saveCompetitor, archiveCompetitor, refresh, domainAuthority, refreshAuthority } = useDashboard();
  const [form, setForm] = React.useState<CompetitorInput>({ domain: '', label: '', category: '', notes: '' });
  const [query, setQuery] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  if (isLoading && !snapshot) return <LoadingState label="Sampling competitor sitemaps" />;

  const allCompetitors = competitors?.competitors || [];
  const filteredCompetitors = allCompetitors.filter((competitor) => {
    const haystack = `${competitor.domain} ${competitor.label || ''} ${competitor.category || ''}`.toLowerCase();
    return !query || haystack.includes(query.toLowerCase());
  });

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
      <header className="competitors-hero">
        <div className="competitors-hero-glow" aria-hidden />
        <div className="competitors-hero-inner">
          <div className="competitors-hero-copy">
            <span className="competitors-eyebrow">
              <Swords size={14} />
              Competitor intel
            </span>
            <h1>Who you&apos;re up against</h1>
            <p>
              Public sitemap samples, topic overlap, and content gaps — reviewed without burning Serper credits.
            </p>
          </div>
          <div className="competitors-hero-aside">
            <button type="button" className="competitors-resample-btn" disabled={isRefreshing} onClick={() => void handleResample()}>
              <RefreshCw size={15} className={isRefreshing ? 'spin' : ''} />
              Resample sitemaps
            </button>
            <dl className="competitors-stats">
              <div>
                <dt>Tracked</dt>
                <dd>{allCompetitors.length}</dd>
              </div>
              <div>
                <dt>Blog URLs</dt>
                <dd>{totalBlogUrls}</dd>
              </div>
              <div>
                <dt>Sampled</dt>
                <dd>{totalSampled}</dd>
              </div>
            </dl>
            {competitors?.generatedAt ? (
              <p className="competitors-meta">
                {competitors.mode} · updated {formatDate(competitors.generatedAt)}
              </p>
            ) : null}
          </div>
        </div>
      </header>

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
              {filteredCompetitors.length} of {allCompetitors.length} shown
            </span>
          </div>

          {filteredCompetitors.length ? (
            <div className="competitors-list">
              {filteredCompetitors.map((competitor) => (
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
        <section className="competitors-matrix-section">
          <div className="competitors-matrix-head">
            <div>
              <Target size={18} />
              <div>
                <h2>Cluster overlap matrix</h2>
                <p>Where competitors publish vs. your pillar depth</p>
              </div>
            </div>
            <div className="competitors-matrix-legend">
              <span><i className="covered" /> You&apos;re strong</span>
              <span><i className="review" /> Worth reviewing</span>
              <span><i className="gap" /> Open gap</span>
              <span><i className="none" /> No overlap</span>
            </div>
          </div>
          <CompetitorGapMatrix competitors={{ ...competitors, competitors: filteredCompetitors }} clusters={snapshot.clusters} />
        </section>
      ) : null}
    </div>
  );
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
