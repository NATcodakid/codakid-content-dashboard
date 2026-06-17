import React from 'react';
import { Archive, ExternalLink, Globe2, Plus, RefreshCw, Search, Award } from 'lucide-react';
import { useDashboard } from '../data';
import { LoadingState, PageHeading, PanelHeader } from '../components';
import type { Cluster, CompetitorInput, CompetitorSnapshot, DomainAuthorityReport } from '../types';

export function CompetitorsPage() {
  const { competitors, isLoading, snapshot, saveCompetitor, archiveCompetitor, refresh, domainAuthority, refreshAuthority } = useDashboard();
  const [form, setForm] = React.useState<CompetitorInput>({ domain: '', label: '', category: '', notes: '' });
  const [query, setQuery] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  if (isLoading && !snapshot) return <LoadingState label="Sampling competitor sitemaps" />;

  const filteredCompetitors = (competitors?.competitors || []).filter((competitor) => {
    const haystack = `${competitor.domain} ${competitor.label || ''} ${competitor.category || ''}`.toLowerCase();
    return !query || haystack.includes(query.toLowerCase());
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.domain?.trim()) return;
    setIsSaving(true);
    await saveCompetitor(form);
    setForm({ domain: '', label: '', category: '', notes: '' });
    setIsSaving(false);
  }

  return (
    <>
      <PageHeading
        title="Competitors"
        description="Public sitemap samples, competitor categories, and content gaps you can review without burning Serper credits."
        badges={
          <button type="button" className="secondary-button" onClick={() => void refresh()}>
            <RefreshCw size={15} />
            Resample
          </button>
        }
      />

      <div className="dash-stack">
        <section className="competitor-command-grid">
          <form className="panel competitor-form" onSubmit={handleSubmit}>
            <PanelHeader icon={<Plus />} title="Add Competitor" action="saved to Neon" />
            <div className="form-grid">
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
                Name
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
                  placeholder="live classes, games, camps..."
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
            </div>
            <button type="submit" className="primary-button" disabled={isSaving}>
              <Plus size={15} />
              {isSaving ? 'Saving...' : 'Add competitor'}
            </button>
          </form>

          <section className="panel">
            <PanelHeader icon={<Search />} title="Watchlist Controls" action={`${competitors?.watchlist?.length || 0} active`} />
            <div className="filter-bar">
              <div className="search-field">
                <Search size={15} />
                <input value={query} placeholder="Filter competitors..." onChange={(event) => setQuery(event.target.value)} />
              </div>
            </div>
            <div className="watchlist-table-wrap">
              <table className="watchlist-table">
                <thead>
                  <tr>
                    <th>Competitor</th>
                    <th>Category</th>
                    <th>Sample</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredCompetitors.map((competitor) => (
                    <tr key={competitor.domain}>
                      <td>
                        <strong>{competitor.label || competitor.domain}</strong>
                        <small>
                          <a href={`https://${competitor.domain}`} target="_blank" rel="noreferrer">
                            {competitor.domain} <ExternalLink size={11} />
                          </a>
                        </small>
                      </td>
                      <td>{competitor.category || 'Competitor'}</td>
                      <td>{competitor.blogUrls} blog URLs</td>
                      <td>
                        <button className="icon-button small-icon-button" title="Archive competitor" onClick={() => void archiveCompetitor(competitor.domain)}>
                          <Archive size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>

        <DomainAuthorityPanel domainAuthority={domainAuthority} refreshAuthority={refreshAuthority} />

        {competitors && snapshot && (
          <section className="panel">
            <PanelHeader icon={<Globe2 />} title="Content Gap Matrix" action="public sitemap/title sample" />
            <CompetitorGapMatrix competitors={{ ...competitors, competitors: filteredCompetitors }} clusters={snapshot.clusters} />
          </section>
        )}

      <section className="panel">
        <PanelHeader icon={<Globe2 />} title="Competitor Watchlist" action={competitors?.mode || 'loading'} />
        {!competitors ? (
          <p className="panel-note">Loading public sitemap samples.</p>
        ) : (
          <div className="competitor-grid">
            {filteredCompetitors.map((competitor) => (
              <article key={competitor.domain} className="competitor-card">
                <div className="competitor-card-head">
                  <div>
                    <strong>{competitor.label || competitor.domain}</strong>
                    <small>{competitor.category || competitor.domain}</small>
                  </div>
                  <span>{competitor.status}</span>
                </div>
                <small>
                  {competitor.blogUrls} blog/resource URLs from {competitor.urlsSampled} sitemap URLs
                </small>
                <p>{competitor.opportunities[0]}</p>
                {competitor.contentAngles?.length ? (
                  <div className="topic-tags competitor-angles">
                    {competitor.contentAngles.map((angle) => (
                      <span key={angle}>{angle}</span>
                    ))}
                  </div>
                ) : null}
                <div className="topic-tags">
                  {competitor.visibleTopics.slice(0, 6).map((topic) => (
                    <span key={topic.topic}>
                      {topic.topic} {topic.count}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      </div>
    </>
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
      <section className="panel">
        <PanelHeader icon={<Award />} title="Domain Authority" action="OpenPageRank" />
        <p className="panel-note">
          Add <code>OPENPAGERANK_API_KEY</code> in Netlify environment variables to score your domain and every competitor
          on a 0–10 authority scale — free from OpenPageRank.
        </p>
      </section>
    );
  }

  const domains = domainAuthority.domains || [];
  const maxRank = Math.max(10, ...domains.map((d) => d.pageRank || 0));

  return (
    <section className="panel">
      <PanelHeader icon={<Award />} title="Domain Authority" action={domainAuthority.source} />
      <div className="filter-bar">
        <span className="panel-note" style={{ margin: 0 }}>
          PageRank 0–10 for your site vs. tracked competitors. Higher means stronger link authority.
        </span>
        <button type="button" className="chip-button" disabled={isRefreshing} onClick={() => void handleRefresh()}>
          <RefreshCw size={13} className={isRefreshing ? 'spin' : ''} />
          Refresh scores
        </button>
      </div>
      <div className="authority-list">
        {domains.map((entry) => (
          <article key={entry.domain} className={`authority-row${entry.isOwn ? ' is-own' : ''}`}>
            <div className="authority-label">
              <strong>{entry.label || entry.domain}</strong>
              <small>{entry.domain}{entry.isOwn ? ' · your site' : ''}</small>
            </div>
            <div className="authority-bar-track">
              <span
                className="authority-bar-fill"
                style={{ width: `${Math.min(100, ((entry.pageRank || 0) / maxRank) * 100)}%` }}
              />
            </div>
            <div className="authority-score">
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
    <div className="gap-matrix-wrap">
      <table className="gap-matrix">
        <thead>
          <tr>
            <th>Competitor</th>
            {clusterTerms.map((cluster) => (
              <th key={cluster.cluster}>{cluster.cluster}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {competitors.competitors.map((competitor) => {
            const haystack = [
              ...competitor.visibleTopics.map((topic) => topic.topic),
              ...(competitor.contentAngles || []),
              ...(competitor.sampledPages || []).map((page) => page.title),
            ].join(' ').toLowerCase();
            return (
              <tr key={competitor.domain}>
                <td>
                  <strong>{competitor.domain}</strong>
                  <small>{competitor.blogUrls} URLs</small>
                </td>
                {clusterTerms.map((cluster) => {
                  const overlap = cluster.terms.some((term) => haystack.includes(term.toLowerCase()));
                  const codaKidDepth = cluster.count >= 20 ? 'strong' : cluster.count >= 8 ? 'medium' : 'thin';
                  return (
                    <td key={cluster.cluster}>
                      <span className={`gap-dot ${overlap ? codaKidDepth : 'none'}`}>
                        {overlap ? (codaKidDepth === 'strong' ? 'covered' : 'review') : 'gap'}
                      </span>
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
