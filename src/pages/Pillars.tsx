import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Award, ExternalLink, GitBranch, LayoutGrid, Link2, List, Plus, RotateCcw, Scan, Search, Star, ZoomIn, ZoomOut, X } from 'lucide-react';
import { useDashboard } from '../data';
import { EmptyState, KpiCard, LoadingState, PageHeading, PanelHeader, PillarSupportBadge } from '../components';
import { PillarInboundChart } from '../charts';
import { buildPillarClusterMap, formatContentAge, formatDate, normalizeUrl, pillarSupportLevel, shortUrl } from '../lib';
import type { PostSummary } from '../types';

export function PillarsPage() {
  const { snapshot, markedPillars, analysisOverview, isLoading, isPillar, markPillar, unmarkPillar } = useDashboard();
  const [query, setQuery] = React.useState('');
  const [cluster, setCluster] = React.useState('All');
  const [view, setView] = React.useState<'pillars' | 'inventory'>('pillars');

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

  const thinPillars = confirmedPosts.filter((post) => post.inboundCount < 5).length;

  const confirmedPillarObjects = snapshot.pillars.filter((pillar) => isPillar(pillar.url));

  return (
    <>
      <PageHeading
        title="Pillars"
        description="Cornerstone pages your cluster links into. Promote any post — it's saved for the team."
      />

      <nav className="content-view-tabs" aria-label="Content views">
        <button type="button" className={view === 'pillars' ? 'active' : ''} onClick={() => setView('pillars')}>Pillar management</button>
        <button type="button" className={view === 'inventory' ? 'active' : ''} onClick={() => setView('inventory')}>Content lifecycle</button>
      </nav>

      {view === 'pillars' ? (
      <div className="dash-stack">
      <section className="kpi-grid kpi-grid-3" aria-label="Pillar KPIs">
        <KpiCard icon={<Star />} label="Confirmed Pillars" value={confirmedPosts.length} note="saved to your workspace" tone="success" />
        <KpiCard icon={<Award />} label="Suggested Candidates" value={snapshot.kpis.suggestedPillars ?? 0} note="high-score posts to review" />
        <KpiCard icon={<Link2 />} label="Need more links" value={confirmedPosts.length ? thinPillars : '—'} note="pillars with fewer than 5 inbound" tone={thinPillars ? 'warning' : 'success'} />
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
                      <span>{formatDate(post.modified || post.date) || 'Date unknown'}</span>
                    </div>
                    <PillarSupportBadge inboundCount={post.inboundCount} modified={post.modified} date={post.date} />
                    <Link className="pillar-map-link" to={`/pillars/${encodeURIComponent(post.slug || slugFromUrl(post.url))}`}>
                      View cluster map <GitBranch size={13} />
                    </Link>
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
          <PanelHeader icon={<Link2 />} title="Inbound support" action="confirmed pages" />
          {confirmedPillarObjects.length ? (
            <>
              <p className="panel-note">
                How many posts in your crawl link to each pillar. Aim for 12+ inbound links for strong cluster support.
              </p>
              <div className="pillar-support-legend">
                <span><i style={{ background: '#3f5733' }} /> Well linked (12+)</span>
                <span><i style={{ background: '#9a6b12' }} /> Growing (5–11)</span>
                <span><i style={{ background: '#a94436' }} /> Needs links (&lt;5)</span>
              </div>
              <PillarInboundChart pillars={confirmedPillarObjects} />
            </>
          ) : (
            <EmptyState
              icon={<Link2 size={22} />}
              title="Link chart appears here"
              body="Once you confirm pillars from the crawl, inbound link counts plot here."
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
                <th>Support</th>
                <th>Pillar</th>
                <th>Map</th>
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
                      <PillarSupportBadge inboundCount={post.inboundCount} modified={post.modified} date={post.date} compact />
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
                    <td>
                      <Link className="table-link subtle" to={`/pillars/${encodeURIComponent(post.slug || slugFromUrl(post.url))}`}>
                        Map
                      </Link>
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
      ) : <ContentLifecyclePanel rows={analysisOverview?.lifecycle || []} summary={analysisOverview?.lifecycleSummary || {}} />}
    </>
  );
}

function ContentLifecyclePanel({ rows, summary }: { rows: import('../types').ContentLifecycleRow[]; summary: Record<string, number> }) {
  const [stage, setStage] = React.useState('All');
  const [query, setQuery] = React.useState('');
  const stages = ['All', 'Decaying', 'Consolidate', 'Stale', 'Growing', 'Protect', 'Stable', 'Unmeasured'];
  const filtered = rows.filter((row) => (stage === 'All' || row.stage === stage) && (!query || `${row.title} ${row.cluster}`.toLowerCase().includes(query.toLowerCase())));
  return (
    <section className="lifecycle-workspace">
      <header className="lifecycle-summary">
        <div><h2>Content lifecycle</h2><p>Every status combines crawl quality with measured Search Console movement.</p></div>
        <dl>{['Decaying', 'Growing', 'Protect', 'Consolidate', 'Unmeasured'].map((name) => <div key={name}><dt>{name}</dt><dd>{summary[name] || 0}</dd></div>)}</dl>
      </header>
      <div className="lifecycle-toolbar">
        <div className="search-field"><Search size={15} /><input type="search" placeholder="Search content…" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <select value={stage} onChange={(event) => setStage(event.target.value)} aria-label="Filter lifecycle stage">{stages.map((name) => <option key={name}>{name}</option>)}</select>
        <span>{filtered.length} pages</span>
      </div>
      <div className="table-wrap">
        <table className="lifecycle-table">
          <thead><tr><th>Page</th><th>Stage</th><th>Clicks</th><th>Change</th><th>Health</th><th>Updated</th></tr></thead>
          <tbody>{filtered.slice(0, 100).map((row) => (
            <tr key={row.url}>
              <td><Link className="table-link" to={`/pages/${encodeURIComponent(slugFromUrl(row.url))}`}>{row.title}</Link><small>{row.cluster} · {row.reason}</small></td>
              <td><span className={`lifecycle-badge ${row.stage.toLowerCase()}`}>{row.stage}</span></td>
              <td>{row.clicks}</td>
              <td className={row.clickChange > 0.01 ? 'positive' : row.clickChange < -0.01 ? 'negative' : ''}>{row.previousClicks ? `${row.clickChange > 0 ? '+' : ''}${Math.round(row.clickChange * 100)}%` : 'New'}</td>
              <td>{row.health}</td>
              <td>{row.ageDays > 365 ? `${Math.round(row.ageDays / 365)}y ago` : `${row.ageDays}d ago`}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {!rows.length ? <p className="dash-empty">The lifecycle inventory will appear after the aligned analysis feed has loaded.</p> : null}
    </section>
  );
}

export function PillarDetailPage() {
  const { slug } = useParams();
  const { snapshot, isLoading, isPillar, markPillar, unmarkPillar } = useDashboard();

  if (isLoading && !snapshot) return <LoadingState label="Loading pillar detail" />;
  if (!snapshot) return null;

  const posts = snapshot.allPosts || [];
  const decoded = decodeURIComponent(slug || '');
  const post = posts.find((item) => item.slug === decoded || slugFromUrl(item.url) === decoded) ||
    snapshot.pillars.find((item) => slugFromUrl(item.url) === decoded);

  if (!post) {
    return (
      <>
        <PageHeading title="Pillar not found" description="The selected page was not part of the latest crawl." />
        <Link className="dash-link" to="/pillars">Back to pillars</Link>
      </>
    );
  }

  const confirmed = isPillar(post.url);
  const postSummary: PostSummary = 'slug' in post
    ? post
    : {
        title: post.title,
        url: post.url,
        slug: slugFromUrl(post.url),
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
      };
  const clusterMap = buildPillarClusterMap(postSummary.url, posts, snapshot.linkGaps);
  const childCount = clusterMap.inbound.length + clusterMap.outbound.length;
  const support = pillarSupportLevel(postSummary.inboundCount);
  const age = formatContentAge(postSummary.modified, postSummary.date);

  return (
    <>
      <PageHeading
        title={postSummary.title}
        description={`${postSummary.cluster} · ${postSummary.inboundCount} inbound · ${support.label.toLowerCase()}`}
        badges={
          <>
            <Link className="dash-badge" to="/pillars">
              <ArrowLeft size={12} /> Pillars
            </Link>
            <a className="dash-badge live" href={postSummary.url} target="_blank" rel="noreferrer">
              Open page <ExternalLink size={12} />
            </a>
          </>
        }
      />

      <div className="dash-stack">
        <section className="kpi-grid kpi-grid-4">
          <KpiCard icon={<Link2 />} label="Links in" value={postSummary.inboundCount} note={support.label} tone={support.tone} />
          <KpiCard icon={<Star />} label="Last updated" value={formatDate(postSummary.modified || postSummary.date) || 'Unknown'} note={age} />
          <KpiCard icon={<GitBranch />} label="Cluster children" value={childCount} note="linked in + out" />
          <KpiCard icon={<Award />} label="Link gaps" value={clusterMap.gaps.length} note="should link here" tone={clusterMap.gaps.length ? 'warning' : 'default'} />
        </section>

        <PillarClusterMap pillar={postSummary} map={clusterMap} posts={posts} />

        <section className="dashboard-grid">
          <div className="panel">
            <PanelHeader icon={<Star />} title="Pillar status" action={confirmed ? 'confirmed' : 'candidate'} />
            {confirmed ? (
              <button className="secondary-button" onClick={() => void unmarkPillar(postSummary.url)}>
                <X size={14} />
                Remove saved pillar
              </button>
            ) : (
              <button
                className="secondary-button"
                onClick={() => void markPillar({ url: postSummary.url, title: postSummary.title, cluster: postSummary.cluster })}
              >
                <Plus size={14} />
                Make pillar
              </button>
            )}
          </div>
          <div className="panel">
            <PanelHeader icon={<Link2 />} title="Refresh checklist" action="manual review" />
            <ul className="checklist-list">
              <li>Update title/meta for the top impression query.</li>
              <li>Add FAQ/schema for parent-intent questions.</li>
              <li>Close link gaps from the cluster map.</li>
              <li>Review competitor pages for missing sections.</li>
            </ul>
          </div>
        </section>
      </div>
    </>
  );
}

function PillarClusterMap({
  pillar,
  map,
  posts,
}: {
  pillar: PostSummary;
  map: ReturnType<typeof buildPillarClusterMap>;
  posts: PostSummary[];
}) {
  const [view, setView] = React.useState<'visual' | 'list'>('visual');
  const [showSiblings, setShowSiblings] = React.useState(false);
  const postByUrl = React.useMemo(
    () => new Map(posts.map((item) => [normalizeUrl(item.url), item])),
    [posts],
  );

  const total =
    map.inbound.length + map.outbound.length + map.gaps.length + map.siblings.length;

  return (
    <section className="panel pillar-cluster-map">
      <div className="pillar-cluster-toolbar">
        <PanelHeader icon={<GitBranch />} title="Cluster map" action={`${total} posts`} />
        <div className="pillar-cluster-view-toggle" role="tablist" aria-label="Cluster map view">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'visual'}
            className={view === 'visual' ? 'active' : ''}
            onClick={() => setView('visual')}
          >
            <LayoutGrid size={14} />
            Visual
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'list'}
            className={view === 'list' ? 'active' : ''}
            onClick={() => setView('list')}
          >
            <List size={14} />
            List
          </button>
        </div>
      </div>

      <div className="pillar-map-stats">
        <span className="pillar-map-stat inbound">
          <strong>{map.inbound.length}</strong> link in
        </span>
        <span className="pillar-map-stat outbound">
          <strong>{map.outbound.length}</strong> pillar links out
        </span>
        <span className="pillar-map-stat gap">
          <strong>{map.gaps.length}</strong> missing links
        </span>
        <span className="pillar-map-stat sibling">
          <strong>{map.siblings.length}</strong> same cluster
        </span>
      </div>

      {view === 'visual' ? (
        <PillarClusterVisual
          pillar={pillar}
          map={map}
          postByUrl={postByUrl}
          showSiblings={showSiblings}
          onToggleSiblings={() => setShowSiblings((value) => !value)}
        />
      ) : (
        <PillarClusterList
          pillar={pillar}
          map={map}
          postByUrl={postByUrl}
          showSiblings={showSiblings}
          onToggleSiblings={() => setShowSiblings((value) => !value)}
        />
      )}
    </section>
  );
}

const VISUAL_NODE_CAP = 28;
const CLUSTER_CANVAS = { w: 1100, h: 760 };
const CLUSTER_MIN_SCALE = 0.35;
const CLUSTER_MAX_SCALE = 2.4;
const CLUSTER_DRAG_THRESHOLD = 4;

type GraphNode = {
  key: string;
  title: string;
  href: string;
  external?: boolean;
  relation: 'inbound' | 'outbound' | 'gap' | 'sibling';
  meta?: string;
};

type NodePosition = { x: number; y: number };

type ClusterLayout = {
  hub: NodePosition;
  nodes: Record<string, NodePosition>;
};

type ViewTransform = {
  panX: number;
  panY: number;
  scale: number;
};

function PillarClusterVisual({
  pillar,
  map,
  postByUrl,
  showSiblings,
  onToggleSiblings,
}: {
  pillar: PostSummary;
  map: ReturnType<typeof buildPillarClusterMap>;
  postByUrl: Map<string, PostSummary>;
  showSiblings: boolean;
  onToggleSiblings: () => void;
}) {
  const navigate = useNavigate();
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const initialLayoutRef = React.useRef<ClusterLayout | null>(null);
  const dragRef = React.useRef<
    | { kind: 'pan'; startX: number; startY: number; panX: number; panY: number }
    | { kind: 'node' | 'hub'; key?: string; startX: number; startY: number; origin: NodePosition }
    | null
  >(null);
  const movedRef = React.useRef(false);
  const transformRef = React.useRef<ViewTransform>({ panX: 0, panY: 0, scale: 1 });

  const [graphNodes, setGraphNodes] = React.useState<GraphNode[]>([]);
  const [hubPos, setHubPos] = React.useState<NodePosition>({ x: CLUSTER_CANVAS.w / 2, y: CLUSTER_CANVAS.h / 2 });
  const [nodePositions, setNodePositions] = React.useState<Record<string, NodePosition>>({});
  const [transform, setTransform] = React.useState<ViewTransform>({ panX: 0, panY: 0, scale: 1 });
  const [isPanning, setIsPanning] = React.useState(false);
  const [activeNode, setActiveNode] = React.useState<string | null>(null);

  transformRef.current = transform;

  const overflow = React.useMemo(
    () => ({
      inbound: Math.max(0, map.inbound.length - VISUAL_NODE_CAP),
      outbound: Math.max(0, map.outbound.length - VISUAL_NODE_CAP),
      gaps: Math.max(0, map.gaps.length - VISUAL_NODE_CAP),
      siblings: showSiblings ? Math.max(0, map.siblings.length - VISUAL_NODE_CAP) : map.siblings.length,
    }),
    [map, showSiblings],
  );

  React.useEffect(() => {
    const inboundNodes = map.inbound.slice(0, VISUAL_NODE_CAP).map((post) => graphNodeFromPost(post, 'inbound'));
    const outboundNodes = map.outbound.slice(0, VISUAL_NODE_CAP).map((post) => graphNodeFromPost(post, 'outbound'));
    const gapNodes = map.gaps.slice(0, VISUAL_NODE_CAP).map((gap) => {
      const source = postByUrl.get(normalizeUrl(gap.sourceUrl));
      if (source) return graphNodeFromPost(source, 'gap', gap.suggestedAnchor);
      return {
        key: gap.sourceUrl,
        title: gap.sourceTitle,
        href: gap.sourceUrl,
        external: true,
        relation: 'gap' as const,
        meta: gap.suggestedAnchor,
      };
    });
    const siblingNodes = showSiblings
      ? map.siblings.slice(0, VISUAL_NODE_CAP).map((post) => graphNodeFromPost(post, 'sibling'))
      : [];

    const nodes = [...inboundNodes, ...outboundNodes, ...gapNodes, ...siblingNodes];
    const layout = buildClusterLayout(nodes, inboundNodes, outboundNodes, gapNodes, siblingNodes);
    initialLayoutRef.current = layout;
    setGraphNodes(nodes);
    setHubPos(layout.hub);
    setNodePositions(layout.nodes);
    const el = viewportRef.current;
    setTransform(centerTransform(el?.clientWidth ?? 720, el?.clientHeight ?? 520, layout.hub, 1));
  }, [map, showSiblings, postByUrl, pillar.url]);

  React.useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      const direction = event.deltaY < 0 ? 1.08 : 0.92;

      setTransform((current) => {
        const nextScale = clamp(current.scale * direction, CLUSTER_MIN_SCALE, CLUSTER_MAX_SCALE);
        const ratio = nextScale / current.scale;
        return {
          scale: nextScale,
          panX: mx - (mx - current.panX) * ratio,
          panY: my - (my - current.panY) * ratio,
        };
      });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  React.useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || !viewportRef.current) return;

      const rect = viewportRef.current.getBoundingClientRect();
      const world = screenToWorld(event.clientX, event.clientY, rect, transformRef.current);

      if (drag.kind === 'pan') {
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (Math.hypot(dx, dy) > CLUSTER_DRAG_THRESHOLD) movedRef.current = true;
        setTransform((current) => ({
          ...current,
          panX: drag.panX + dx,
          panY: drag.panY + dy,
        }));
        return;
      }

      const dx = world.x - drag.startX;
      const dy = world.y - drag.startY;
      if (Math.hypot(dx, dy) > CLUSTER_DRAG_THRESHOLD) movedRef.current = true;
      const next = { x: drag.origin.x + dx, y: drag.origin.y + dy };

      if (drag.kind === 'hub') {
        setHubPos(next);
        return;
      }

      if (drag.key) {
        setNodePositions((current) => ({ ...current, [drag.key!]: next }));
      }
    };

    const onPointerUp = () => {
      dragRef.current = null;
      setIsPanning(false);
      setActiveNode(null);
      window.setTimeout(() => {
        movedRef.current = false;
      }, 0);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  const hasConnections = graphNodes.length > 0;

  const startPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    movedRef.current = false;
    dragRef.current = {
      kind: 'pan',
      startX: event.clientX,
      startY: event.clientY,
      panX: transform.panX,
      panY: transform.panY,
    };
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const startNodeDrag = (event: React.PointerEvent<HTMLDivElement>, key: string) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    movedRef.current = false;
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const world = screenToWorld(event.clientX, event.clientY, rect, transformRef.current);
    const origin = nodePositions[key];
    if (!origin) return;
    dragRef.current = {
      kind: 'node',
      key,
      startX: world.x,
      startY: world.y,
      origin,
    };
    setActiveNode(key);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const startHubDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    movedRef.current = false;
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const world = screenToWorld(event.clientX, event.clientY, rect, transformRef.current);
    dragRef.current = {
      kind: 'hub',
      startX: world.x,
      startY: world.y,
      origin: hubPos,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const openNode = (node: GraphNode) => {
    if (movedRef.current) return;
    if (node.external) {
      window.open(node.href, '_blank', 'noopener,noreferrer');
      return;
    }
    navigate(node.href);
  };

  const zoomBy = (factor: number) => {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = rect.width / 2;
    const my = rect.height / 2;
    setTransform((current) => {
      const nextScale = clamp(current.scale * factor, CLUSTER_MIN_SCALE, CLUSTER_MAX_SCALE);
      const ratio = nextScale / current.scale;
      return {
        scale: nextScale,
        panX: mx - (mx - current.panX) * ratio,
        panY: my - (my - current.panY) * ratio,
      };
    });
  };

  const resetView = () => {
    const el = viewportRef.current;
    setTransform(centerTransform(el?.clientWidth ?? 720, el?.clientHeight ?? 520, hubPos, 1));
  };

  const resetLayout = () => {
    const layout = initialLayoutRef.current;
    if (!layout) return;
    const el = viewportRef.current;
    setHubPos(layout.hub);
    setNodePositions(layout.nodes);
    setTransform(centerTransform(el?.clientWidth ?? 720, el?.clientHeight ?? 520, layout.hub, 1));
  };

  return (
    <div className="pillar-cluster-visual-wrap">
      <div
        ref={viewportRef}
        className={`pillar-cluster-visual${isPanning ? ' is-panning' : ''}`}
        style={{ minHeight: 520 }}
        onPointerDown={startPan}
      >
        <div className="pillar-cluster-visual-controls" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => zoomBy(1.15)} title="Zoom in" aria-label="Zoom in">
            <ZoomIn size={15} />
          </button>
          <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => zoomBy(0.87)} title="Zoom out" aria-label="Zoom out">
            <ZoomOut size={15} />
          </button>
          <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={resetView} title="Center view" aria-label="Center view">
            <Scan size={15} />
          </button>
          <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={resetLayout} title="Reset layout" aria-label="Reset layout">
            <RotateCcw size={15} />
          </button>
        </div>

        <p className="pillar-cluster-visual-hint">Drag background to pan · Scroll to zoom · Drag nodes to rearrange</p>

        <div
          className="pillar-cluster-visual-stage"
          style={{
            width: CLUSTER_CANVAS.w,
            height: CLUSTER_CANVAS.h,
            transform: `translate(${transform.panX}px, ${transform.panY}px) scale(${transform.scale})`,
          }}
        >
          <svg className="pillar-cluster-visual-lines" width={CLUSTER_CANVAS.w} height={CLUSTER_CANVAS.h} aria-hidden>
            <defs>
              <marker id="pc-inbound" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#5f7d52" />
              </marker>
              <marker id="pc-outbound" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#3b6ea8" />
              </marker>
              <marker id="pc-gap" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#b8860b" />
              </marker>
            </defs>
            {graphNodes.map((node) => {
              const position = nodePositions[node.key];
              if (!position) return null;
              const { lineStart, lineEnd } = connectorEndpoints(hubPos, position, node.relation);
              return (
                <line
                  key={`line-${node.key}`}
                  x1={lineStart.x}
                  y1={lineStart.y}
                  x2={lineEnd.x}
                  y2={lineEnd.y}
                  className={`pillar-cluster-line ${node.relation}`}
                  markerEnd={node.relation === 'sibling' ? undefined : `url(#pc-${node.relation === 'gap' ? 'gap' : node.relation})`}
                />
              );
            })}
          </svg>

          <div
            className="pillar-cluster-visual-hub"
            style={{ left: hubPos.x, top: hubPos.y }}
            onPointerDown={startHubDrag}
            title="Drag to move hub"
          >
            <Star size={20} />
            <strong>{truncateTitle(pillar.title, 52)}</strong>
            <small>{pillar.cluster}</small>
            <span>{pillar.inboundCount} inbound · {pillarSupportLevel(pillar.inboundCount).label}</span>
          </div>

          {graphNodes.map((node) => {
            const position = nodePositions[node.key];
            if (!position) return null;
            return (
              <div
                key={node.key}
                role="link"
                tabIndex={0}
                className={`pillar-cluster-visual-node ${node.relation}${activeNode === node.key ? ' is-dragging' : ''}`}
                style={{ left: position.x, top: position.y }}
                title={node.title}
                onPointerDown={(event) => startNodeDrag(event, node.key)}
                onClick={() => openNode(node)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') openNode(node);
                }}
              >
                <VisualNodeContent node={node} />
              </div>
            );
          })}

          {!hasConnections ? (
            <p className="pillar-cluster-visual-empty">No cluster connections in this crawl yet.</p>
          ) : null}
        </div>
      </div>

      <div className="pillar-cluster-visual-footer">
        <div className="pillar-cluster-visual-legend">
          <span><i className="inbound" /> Links in</span>
          <span><i className="outbound" /> Pillar links out</span>
          <span><i className="gap" /> Missing link</span>
          {map.siblings.length ? <span><i className="sibling" /> Same cluster</span> : null}
        </div>
        <div className="pillar-cluster-visual-actions">
          {map.siblings.length ? (
            <button type="button" className="pillar-map-siblings-toggle" onClick={onToggleSiblings} aria-pressed={showSiblings}>
              {showSiblings ? 'Hide' : 'Show'} unlinked cluster posts ({map.siblings.length})
            </button>
          ) : null}
          {overflow.inbound || overflow.outbound || overflow.gaps || overflow.siblings ? (
            <span className="pillar-cluster-visual-overflow">
              +{overflow.inbound + overflow.outbound + overflow.gaps + overflow.siblings} more in list view
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function VisualNodeContent({ node }: { node: GraphNode }) {
  const labels = {
    inbound: 'In',
    outbound: 'Out',
    gap: 'Gap',
    sibling: 'Cluster',
  };

  return (
    <>
      <span className="pillar-cluster-visual-tag">{labels[node.relation]}</span>
      <strong>{truncateTitle(node.title, 40)}</strong>
      {node.meta ? <small>{truncateTitle(node.meta, 36)}</small> : null}
    </>
  );
}

function PillarClusterList({
  pillar,
  map,
  postByUrl,
  showSiblings,
  onToggleSiblings,
}: {
  pillar: PostSummary;
  map: ReturnType<typeof buildPillarClusterMap>;
  postByUrl: Map<string, PostSummary>;
  showSiblings: boolean;
  onToggleSiblings: () => void;
}) {
  return (
    <div className="pillar-cluster-list">
      <header className="pillar-cluster-list-hub">
        <div>
          <h3>{pillar.title}</h3>
          <p>
            {pillar.cluster} · {pillar.inboundCount} inbound · {pillarSupportLevel(pillar.inboundCount).label}
          </p>
        </div>
      </header>

      <PillarMapGroup
        title="Posts linking here"
        count={map.inbound.length}
        empty="No posts in this crawl link to this pillar yet."
      >
        {map.inbound.map((item) => (
          <PillarMapNode key={item.url} post={item} relation="inbound" />
        ))}
      </PillarMapGroup>

      <PillarMapGroup
        title="Pillar links out"
        count={map.outbound.length}
        empty="This pillar does not link to other cluster posts in the crawl."
      >
        {map.outbound.map((item) => (
          <PillarMapNode key={item.url} post={item} relation="outbound" />
        ))}
      </PillarMapGroup>

      <PillarMapGroup
        title="Should link here"
        count={map.gaps.length}
        empty="No link gaps queued for this pillar."
        tone="warning"
      >
        {map.gaps.map((gap) => {
          const source = postByUrl.get(normalizeUrl(gap.sourceUrl));
          return source ? (
            <PillarMapNode key={gap.sourceUrl} post={source} relation="gap" hint={gap.suggestedAnchor} />
          ) : (
            <a
              key={gap.sourceUrl}
              className="pillar-map-row gap"
              href={gap.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              <div className="pillar-map-row-main">
                <strong>{gap.sourceTitle}</strong>
                <span className="pillar-map-row-meta">Anchor: {gap.suggestedAnchor}</span>
              </div>
              <ExternalLink size={14} className="pillar-map-row-chevron" aria-hidden />
            </a>
          );
        })}
      </PillarMapGroup>

      {map.siblings.length > 0 ? (
        <div className={`pillar-map-group${showSiblings ? '' : ' collapsed'}`}>
          <button
            type="button"
            className="pillar-map-group-head pillar-map-siblings-toggle"
            onClick={onToggleSiblings}
            aria-expanded={showSiblings}
          >
            <h3>Same cluster, not linked</h3>
            <span>{map.siblings.length}</span>
          </button>
          {showSiblings ? (
            <div className="pillar-map-nodes">
              {map.siblings.map((item) => (
                <PillarMapNode key={item.url} post={item} relation="sibling" />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function buildClusterLayout(
  allNodes: GraphNode[],
  inboundNodes: GraphNode[],
  outboundNodes: GraphNode[],
  gapNodes: GraphNode[],
  siblingNodes: GraphNode[],
): ClusterLayout {
  const hub = { x: CLUSTER_CANVAS.w / 2, y: CLUSTER_CANVAS.h / 2 };
  const cx = hub.x;
  const cy = hub.y;
  const rx = CLUSTER_CANVAS.w * 0.34;
  const ry = CLUSTER_CANVAS.h * 0.34;
  const nodes: Record<string, NodePosition> = {};

  const assignArc = (items: GraphNode[], startDeg: number, endDeg: number, radiusScale = 1) => {
    const count = items.length;
    if (!count) return;
    items.forEach((node, index) => {
      const deg = count === 1 ? (startDeg + endDeg) / 2 : startDeg + ((endDeg - startDeg) * index) / (count - 1);
      const rad = (deg * Math.PI) / 180;
      nodes[node.key] = {
        x: cx + rx * radiusScale * Math.cos(rad),
        y: cy + ry * radiusScale * Math.sin(rad),
      };
    });
  };

  assignArc(inboundNodes, 155, 205);
  assignArc(outboundNodes, -25, 25);
  assignArc(gapNodes, 55, 125, 0.95);
  assignArc(siblingNodes, -125, -55, 1.08);

  for (const node of allNodes) {
    if (!nodes[node.key]) {
      nodes[node.key] = { x: cx, y: cy };
    }
  }

  return { hub, nodes };
}

function connectorEndpoints(hub: NodePosition, node: NodePosition, relation: GraphNode['relation']) {
  const dx = hub.x - node.x;
  const dy = hub.y - node.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const hubTrim = relation === 'outbound' ? 58 : 50;
  const nodeTrim = 64;

  if (relation === 'outbound') {
    return {
      lineStart: { x: hub.x - ux * hubTrim, y: hub.y - uy * hubTrim },
      lineEnd: { x: node.x + ux * nodeTrim, y: node.y + uy * nodeTrim },
    };
  }

  return {
    lineStart: { x: node.x + ux * nodeTrim, y: node.y + uy * nodeTrim },
    lineEnd: { x: hub.x - ux * hubTrim, y: hub.y - uy * hubTrim },
  };
}

function screenToWorld(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  transform: ViewTransform,
) {
  return {
    x: (clientX - rect.left - transform.panX) / transform.scale,
    y: (clientY - rect.top - transform.panY) / transform.scale,
  };
}

function centerTransform(viewportW: number, viewportH: number, hub: NodePosition, scale: number): ViewTransform {
  return {
    scale,
    panX: viewportW / 2 - hub.x * scale,
    panY: viewportH / 2 - hub.y * scale,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function graphNodeFromPost(
  post: PostSummary,
  relation: GraphNode['relation'],
  meta?: string,
): GraphNode {
  return {
    key: post.url,
    title: post.title,
    href: `/pages/${encodeURIComponent(post.slug || slugFromUrl(post.url))}`,
    relation,
    meta,
  };
}

function truncateTitle(title: string, max: number) {
  if (title.length <= max) return title;
  return `${title.slice(0, max - 1)}…`;
}

function PillarMapGroup({
  title,
  count,
  empty,
  tone,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  tone?: 'warning';
  children: React.ReactNode;
}) {
  if (count === 0) {
    return (
      <div className={`pillar-map-group empty${tone ? ` ${tone}` : ''}`}>
        <div className="pillar-map-group-head">
          <h3>{title}</h3>
          <span>0</span>
        </div>
        <p className="panel-note">{empty}</p>
      </div>
    );
  }

  return (
    <div className={`pillar-map-group${tone ? ` ${tone}` : ''}`}>
      <div className="pillar-map-group-head">
        <h3>{title}</h3>
        <span>{count}</span>
      </div>
      <div className="pillar-map-nodes">{children}</div>
    </div>
  );
}

function PillarMapNode({
  post,
  relation,
  hint,
}: {
  post: PostSummary;
  relation: 'inbound' | 'outbound' | 'gap' | 'sibling';
  hint?: string;
}) {
  return (
    <Link
      className={`pillar-map-row ${relation}`}
      to={`/pages/${encodeURIComponent(post.slug || slugFromUrl(post.url))}`}
    >
      <div className="pillar-map-row-main">
        <strong>{post.title}</strong>
        <span className="pillar-map-row-meta">
          {shortUrl(post.url)}
          {relation !== 'gap' ? ` · ${post.inboundCount} inbound` : ''}
          {hint ? ` · ${hint}` : ''}
        </span>
      </div>
      <ArrowUpRight size={14} className="pillar-map-row-chevron" aria-hidden />
    </Link>
  );
}

function slugFromUrl(url: string) {
  try {
    return new URL(url).pathname.split('/').filter(Boolean).pop() || '';
  } catch {
    return url.split('/').filter(Boolean).pop() || '';
  }
}
