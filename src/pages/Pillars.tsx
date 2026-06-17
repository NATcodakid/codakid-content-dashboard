import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { Activity, Award, ExternalLink, Plus, Search, Star, X } from 'lucide-react';
import { useDashboard } from '../data';
import { EmptyState, HealthMeter, KpiCard, LoadingState, PageHeading, PanelHeader } from '../components';
import { HealthBarChart } from '../charts';
import { normalizeUrl } from '../lib';
import type { PostSummary } from '../types';

export function PillarsPage() {
  const { snapshot, markedPillars, isLoading, isPillar, markPillar, unmarkPillar } = useDashboard();
  const [query, setQuery] = React.useState('');
  const [cluster, setCluster] = React.useState('All');

  if (isLoading && !snapshot) return <LoadingState label="Building the pillar map" />;
  if (!snapshot) return null;

  const posts: PostSummary[] = snapshot.allPosts?.length
    ? snapshot.allPosts
    : snapshot.pillars.map((pillar) => ({
        title: pillar.title,
        url: pillar.url,
        slug: pillar.url,
        cluster: pillar.cluster,
        date: pillar.date,
        modified: pillar.modified,
        inboundCount: pillar.inboundCount,
        outboundCount: pillar.outboundCount,
        relatedPostCount: pillar.relatedPostCount,
        pillarScore: pillar.pillarScore,
        health: pillar.health,
        status: pillar.status,
        confirmedPillar: pillar.confirmedPillar,
      }));

  const markedUrls = new Set(markedPillars.map((pillar) => normalizeUrl(pillar.raw_url || pillar.url)));
  const confirmedPosts = posts.filter((post) => isPillar(post.url));
  const clusters = ['All', ...Array.from(new Set(posts.map((post) => post.cluster))).sort()];

  const filtered = posts.filter((post) => {
    const matchesCluster = cluster === 'All' || post.cluster === cluster;
    const matchesQuery = !query || post.title.toLowerCase().includes(query.toLowerCase());
    return matchesCluster && matchesQuery;
  });

  const avgHealth = confirmedPosts.length
    ? Math.round(confirmedPosts.reduce((sum, post) => sum + post.health, 0) / confirmedPosts.length)
    : 0;

  const confirmedPillarObjects = snapshot.pillars.filter((pillar) => isPillar(pillar.url));

  return (
    <>
      <PageHeading
        title="Pillars"
        description="Cornerstone pages your cluster links into. Promote any post — it's saved for the team."
      />

      <div className="dash-stack">
      <section className="kpi-grid kpi-grid-3" aria-label="Pillar KPIs">
        <KpiCard icon={<Star />} label="Confirmed Pillars" value={confirmedPosts.length} note="saved to your workspace" tone="success" />
        <KpiCard icon={<Award />} label="Suggested Candidates" value={snapshot.kpis.suggestedPillars ?? 0} note="high-score posts to review" />
        <KpiCard icon={<Activity />} label="Avg Pillar Health" value={confirmedPosts.length ? avgHealth : '—'} note="0–100 health score" />
      </section>

      <div className="dashboard-grid">
        <div className="panel">
          <PanelHeader icon={<Star />} title="Your Pillars" action={`${confirmedPosts.length} confirmed`} />
          {confirmedPosts.length ? (
            <div className="pillar-cards">
              {confirmedPosts.map((post) => {
                const canRemove = markedUrls.has(normalizeUrl(post.url));
                return (
                  <article className="pillar-card" key={post.url}>
                <div className="pillar-card-head">
                      <Link to={`/pillars/${encodeURIComponent(post.slug || slugFromUrl(post.url))}`}>
                        {post.title}
                      </Link>
                      {canRemove ? (
                        <button
                          className="chip-button danger"
                          onClick={() => void unmarkPillar(post.url)}
                          title="Remove pillar"
                        >
                          <X size={13} />
                          Remove
                        </button>
                      ) : (
                        <span className="row-badge">Confirmed</span>
                      )}
                    </div>
                    <div className="pillar-card-meta">
                      <span>{post.cluster}</span>
                      <span>{post.inboundCount} inbound links</span>
                      <span>Updated {post.modified || post.date}</span>
                    </div>
                    <HealthMeter value={post.health} status={post.status} />
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<Star size={22} />}
              title="No pillars confirmed yet"
              body="Promote a blog post below to track it as a pillar. Confirmed pillars drive the link map and recommendations."
            />
          )}
        </div>

        <div className="panel">
          <PanelHeader icon={<Activity />} title="Pillar Health" action="confirmed pages" />
          {confirmedPillarObjects.length ? (
            <HealthBarChart pillars={confirmedPillarObjects} />
          ) : (
            <EmptyState
              icon={<Activity size={22} />}
              title="Health chart appears here"
              body="Once you confirm pillars that were part of the crawl, their health scores plot here."
            />
          )}
        </div>
      </div>

      <section className="panel pillars-promote-panel">
        <PanelHeader icon={<Plus />} title="Promote a Blog to Pillar" action={`${posts.length} posts`} />
        <div className="filter-bar">
          <div className="search-field">
            <Search size={15} />
            <input
              type="search"
              placeholder="Search posts by title…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select value={cluster} onChange={(event) => setCluster(event.target.value)} aria-label="Filter by cluster">
            {clusters.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="table-wrap">
          <table className="pillars-table">
            <thead>
              <tr>
                <th>Post</th>
                <th>Cluster</th>
                <th>Inbound</th>
                <th>Health</th>
                <th>Pillar</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 60).map((post) => {
                const pillar = isPillar(post.url);
                const canRemove = markedUrls.has(normalizeUrl(post.url));
                return (
                  <tr key={post.url}>
                    <td>
                      <Link className="table-link" to={`/pages/${encodeURIComponent(post.slug || slugFromUrl(post.url))}`}>
                        {post.title}
                      </Link>
                      <small>
                        Score {post.pillarScore} · <a href={post.url} target="_blank" rel="noreferrer">Open live <ExternalLink size={11} /></a>
                      </small>
                    </td>
                    <td>{post.cluster}</td>
                    <td>{post.inboundCount}</td>
                    <td>
                      <HealthMeter value={post.health} status={post.status} />
                    </td>
                    <td>
                      {pillar ? (
                        canRemove ? (
                          <button className="chip-button danger" onClick={() => void unmarkPillar(post.url)}>
                            <X size={13} />
                            Pillar
                          </button>
                        ) : (
                          <span className="row-badge">Confirmed</span>
                        )
                      ) : (
                        <button
                          className="chip-button"
                          onClick={() => void markPillar({ url: post.url, title: post.title, cluster: post.cluster })}
                        >
                          <Plus size={13} />
                          Make pillar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 60 && (
          <p className="panel-note" style={{ marginTop: 12 }}>
            Showing the first 60 of {filtered.length} matches. Refine your search to see more.
          </p>
        )}
      </section>
      </div>
    </>
  );
}

export function PillarDetailPage() {
  const { slug } = useParams();
  const { snapshot, isLoading, isPillar, markPillar, unmarkPillar } = useDashboard();

  if (isLoading && !snapshot) return <LoadingState label="Loading pillar detail" />;
  if (!snapshot) return null;

  const decoded = decodeURIComponent(slug || '');
  const post = (snapshot.allPosts || []).find((item) => item.slug === decoded || slugFromUrl(item.url) === decoded) ||
    snapshot.pillars.find((item) => slugFromUrl(item.url) === decoded);

  if (!post) {
    return (
      <>
        <PageHeading title="Pillar not found" description="The selected page was not part of the latest crawl." />
        <Link className="dash-link" to="/pillars">Back to pillars</Link>
      </>
    );
  }

  const pillar = snapshot.pillars.find((item) => normalizeUrl(item.url) === normalizeUrl(post.url));
  const related = (snapshot.allPosts || [])
    .filter((item) => item.cluster === post.cluster && normalizeUrl(item.url) !== normalizeUrl(post.url))
    .sort((a, b) => b.inboundCount - a.inboundCount)
    .slice(0, 12);
  const linkGaps = snapshot.linkGaps.filter((gap) => normalizeUrl(gap.pillarUrl) === normalizeUrl(post.url));
  const confirmed = isPillar(post.url);

  return (
    <>
      <PageHeading
        title={post.title}
        description={`${post.cluster} · ${post.inboundCount} inbound links · health ${post.health}`}
        badges={<a className="dash-badge" href={post.url} target="_blank" rel="noreferrer">Open page</a>}
      />

      <div className="dash-stack">
        <section className="kpi-grid kpi-grid-3">
          <KpiCard icon={<Activity />} label="Health" value={post.health} note={post.status} />
          <KpiCard icon={<Star />} label="Inbound Links" value={post.inboundCount} note="links into this page" />
          <KpiCard icon={<Award />} label="Related Posts" value={related.length} note="same cluster" />
        </section>

        <section className="dashboard-grid">
          <div className="panel">
            <PanelHeader icon={<Star />} title="Pillar Control" action={confirmed ? 'confirmed' : 'candidate'} />
            <p className="panel-note">
              Use this page as the control center for refreshing copy, adding internal links, and checking keyword opportunities.
            </p>
            {confirmed ? (
              <button className="secondary-button" onClick={() => void unmarkPillar(post.url)}>
                <X size={14} />
                Remove saved pillar
              </button>
            ) : (
              <button
                className="secondary-button"
                onClick={() => void markPillar({ url: post.url, title: post.title, cluster: post.cluster })}
              >
                <Plus size={14} />
                Make pillar
              </button>
            )}
          </div>
          <div className="panel">
            <PanelHeader icon={<Activity />} title="Refresh Checklist" action="manual review" />
            <ul className="checklist-list">
              <li>Update title/meta for the highest impression query.</li>
              <li>Add FAQ/schema for parent-intent questions.</li>
              <li>Add 3-5 links from related posts into this page.</li>
              <li>Review competitor pages for missing sections.</li>
            </ul>
          </div>
        </section>

        <section className="dashboard-grid">
          <div className="panel">
            <PanelHeader icon={<Plus />} title="Missing Internal Links" action={`${linkGaps.length} suggestions`} />
            <div className="gap-list">
              {linkGaps.length ? linkGaps.map((gap) => (
                <article className="gap-item" key={`${gap.sourceUrl}-${gap.pillarUrl}`}>
                  <span>{gap.cluster}</span>
                  <a href={gap.sourceUrl} target="_blank" rel="noreferrer">{gap.sourceTitle}</a>
                  <small>Anchor: {gap.suggestedAnchor}</small>
                </article>
              )) : <p className="panel-note">No link gaps are currently queued for this pillar.</p>}
            </div>
          </div>
          <div className="panel">
            <PanelHeader icon={<Award />} title="Supporting Posts" action={`${related.length} related`} />
            <div className="pillar-cards compact">
              {related.map((item) => (
                <article className="pillar-card" key={item.url}>
                  <div className="pillar-card-head">
                    <a href={item.url} target="_blank" rel="noreferrer">
                      {item.title}
                      <ExternalLink size={13} />
                    </a>
                  </div>
                  <div className="pillar-card-meta">
                    <span>{item.inboundCount} inbound</span>
                    <span>{item.health} health</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

function slugFromUrl(url: string) {
  try {
    return new URL(url).pathname.split('/').filter(Boolean).pop() || '';
  } catch {
    return url.split('/').filter(Boolean).pop() || '';
  }
}
