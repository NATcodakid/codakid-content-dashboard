import { Globe2 } from 'lucide-react';
import { useDashboard } from '../data';
import { LoadingState, PageHeading, PanelHeader } from '../components';
import type { Cluster, CompetitorSnapshot } from '../types';

export function CompetitorsPage() {
  const { competitors, isLoading, snapshot } = useDashboard();

  if (isLoading && !snapshot) return <LoadingState label="Sampling competitor sitemaps" />;

  return (
    <>
      <PageHeading
        title="Competitors"
        description="Public sitemap samples — topics competitors publish and where you can differentiate."
      />

      <div className="dash-stack">
      {competitors && snapshot && (
        <section className="panel">
          <PanelHeader icon={<Globe2 />} title="Content Gap Matrix" action="public sitemap/title sample" />
          <CompetitorGapMatrix competitors={competitors} clusters={snapshot.clusters} />
        </section>
      )}

      <section className="panel">
        <PanelHeader icon={<Globe2 />} title="Competitor Watchlist" action={competitors?.mode || 'loading'} />
        {!competitors ? (
          <p className="panel-note">Loading public sitemap samples.</p>
        ) : (
          <div className="competitor-grid">
            {competitors.competitors.map((competitor) => (
              <article key={competitor.domain} className="competitor-card">
                <div>
                  <strong>{competitor.domain}</strong>
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
