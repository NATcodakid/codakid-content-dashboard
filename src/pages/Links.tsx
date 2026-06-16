import { CheckCircle2, Gauge, ListChecks, Network } from 'lucide-react';
import { useDashboard } from '../data';
import { EmptyState, KpiCard, LoadingState, PageHeading, PanelHeader } from '../components';
import { formatter } from '../lib';
import type { ActionItem, LinkGap } from '../types';

export function LinksPage() {
  const { snapshot, isLoading, actionItems, saveActionItem, updateActionStatus } = useDashboard();

  if (isLoading && !snapshot) return <LoadingState label="Mapping internal links" />;
  if (!snapshot) return null;

  const gaps = snapshot.linkGaps;

  return (
    <>
      <PageHeading
        title="Internal Links"
        description="Posts that should link into your pillars. Each gap is a contextual link to strengthen a cluster."
      />

      <div className="dash-stack">
      <section className="kpi-grid kpi-grid-3" aria-label="Link KPIs">
        <KpiCard icon={<Network />} label="Link Gaps" value={snapshot.kpis.linkGaps} note="suggested internal links" tone="warning" />
        <KpiCard icon={<Network />} label="Internal Links" value={snapshot.kpis.internalLinks} note="found in the crawl" />
        <KpiCard icon={<Network />} label="Orphan Posts" value={snapshot.kpis.orphanPosts} note="weak link signals" />
      </section>

      <div className="dashboard-grid">
        <div className="panel">
          <PanelHeader icon={<Network />} title="Link Map Preview" action="top pillar" />
          <MiniLinkMap gaps={gaps.slice(0, 8)} />
        </div>
        <div className="panel">
          <PanelHeader icon={<Network />} title="Suggested Links" action={`${gaps.length} total`} />
          <div className="gap-list">
            {gaps.length ? (
              gaps.slice(0, 12).map((gap) => (
                <article className="gap-item" key={`${gap.pillarUrl}-${gap.sourceUrl}`}>
                  <span>{gap.cluster}</span>
                  <a href={gap.sourceUrl} target="_blank" rel="noreferrer">
                    {gap.sourceTitle}
                  </a>
                  <p>
                    Link to <strong>{gap.pillarTitle}</strong>
                  </p>
                  <small>Anchor: {gap.suggestedAnchor}</small>
                  <div className="gap-actions">
                    {linkActionFor(actionItems, gap)?.status === 'done' ? (
                      <span className="row-badge">Done</span>
                    ) : (
                      <>
                        <button
                          className="secondary-button mini-button"
                          onClick={() => {
                            const existing = linkActionFor(actionItems, gap);
                            if (existing) void updateActionStatus(existing, 'done');
                            else void saveActionItem(linkActionInput(gap, 'done'));
                          }}
                        >
                          <CheckCircle2 size={14} />
                          Mark done
                        </button>
                        <button
                          className="secondary-button mini-button"
                          onClick={() => void saveActionItem(linkActionInput(gap, 'todo'))}
                        >
                          <ListChecks size={14} />
                          Add action
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <EmptyState
                icon={<CheckCircle2 size={22} />}
                title="No link gaps queued"
                body="The crawl did not find obvious supporting-post link opportunities. Confirm more pillars to surface more."
              />
            )}
          </div>
        </div>
      </div>
      </div>
    </>
  );
}

function linkFingerprint(gap: LinkGap) {
  return `link:${gap.sourceUrl}:${gap.pillarUrl}`;
}

function linkActionFor(items: ActionItem[], gap: LinkGap) {
  return items.find((item) => item.fingerprint === linkFingerprint(gap));
}

function linkActionInput(gap: LinkGap, status: 'todo' | 'done') {
  return {
    fingerprint: linkFingerprint(gap),
    type: 'internal-link',
    source: 'wordpress-crawl',
    title: `Link ${gap.sourceTitle} to ${gap.pillarTitle}`,
    detail: `Add a contextual link using "${gap.suggestedAnchor}".`,
    pageUrl: gap.sourceUrl,
    cluster: gap.cluster,
    priorityScore: 60,
    status,
  };
}

function MiniLinkMap({ gaps }: { gaps: LinkGap[] }) {
  const primary = gaps[0];
  if (!primary) {
    return (
      <EmptyState
        icon={<CheckCircle2 size={22} />}
        title="No link gaps queued"
        body="The crawl did not find obvious supporting-post link opportunities."
      />
    );
  }

  return (
    <div className="link-map" aria-label="Internal linking preview">
      <div className="map-pillar">
        <Gauge size={18} />
        <strong>{primary.pillarTitle}</strong>
        <small>Target pillar page · {formatter.format(gaps.length)} sources</small>
      </div>
      <div className="map-spokes">
        {gaps.slice(0, 6).map((gap) => (
          <article key={`${gap.sourceUrl}-${gap.pillarUrl}`}>
            <span />
            <div>
              <strong>{gap.sourceTitle}</strong>
              <small>{gap.suggestedAnchor}</small>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
