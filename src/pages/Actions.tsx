import React from 'react';
import { CheckCircle2, Circle, Clock3, ExternalLink, ListChecks, Plus } from 'lucide-react';
import { useDashboard } from '../data';
import { KpiCard, LoadingState, PageHeading, PanelHeader } from '../components';
import { buildFocusActions, formatter, shortUrl } from '../lib';
import type { ActionItem, ActionStatus } from '../types';

const STATUS_LABELS: Record<ActionStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  dismissed: 'Dismissed',
};

export function ActionsPage() {
  const {
    snapshot,
    searchOpportunities,
    actionItems,
    isLoading,
    saveActionItem,
    updateActionStatus,
  } = useDashboard();
  const [status, setStatus] = React.useState<ActionStatus | 'all'>('all');

  if (isLoading && !snapshot) return <LoadingState label="Loading action queue" />;
  if (!snapshot) return null;

  const generated: QueueAction[] = buildFocusActions(snapshot, searchOpportunities).map((action) => ({
    id: '',
    fingerprint: `generated:${action.label}:${action.title}`,
    type: action.label.toLowerCase().replace(/\s+/g, '-'),
    source: 'generated',
    title: action.title,
    detail: action.detail,
    pageUrl: action.meta?.startsWith('/') ? `https://codakid.com${action.meta}` : '',
    keyword: action.label === 'Ranking lift' ? action.title : '',
    cluster: action.meta,
    priorityScore: action.score || 50,
    status: 'todo' as ActionStatus,
    owner: '',
  }));

  const allItems = mergeGenerated(actionItems, generated);
  const filtered = allItems.filter((item) => status === 'all' || item.status === status);
  const openCount = allItems.filter((item) => item.status !== 'done' && item.status !== 'dismissed').length;

  return (
    <>
      <PageHeading
        title="Actions"
        description="A practical SEO work queue from Search Console, internal links, pillars, and the imported gameplan."
      />

      <div className="dash-stack">
        <section className="kpi-grid kpi-grid-3" aria-label="Action KPIs">
          <KpiCard icon={<ListChecks />} label="Open Actions" value={openCount} note="todo or in progress" tone="warning" />
          <KpiCard icon={<Clock3 />} label="In Progress" value={allItems.filter((item) => item.status === 'in_progress').length} note="being worked" />
          <KpiCard icon={<CheckCircle2 />} label="Completed" value={allItems.filter((item) => item.status === 'done').length} note="saved in Neon" tone="success" />
        </section>

        <section className="panel">
          <PanelHeader
            icon={<ListChecks />}
            title="SEO Action Queue"
            action={`${filtered.length} visible`}
          />
          <div className="filter-bar">
            <select value={status} onChange={(event) => setStatus(event.target.value as ActionStatus | 'all')}>
              <option value="all">All statuses</option>
              <option value="todo">To do</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </div>
          <div className="action-list">
            {filtered.map((item) => (
              <ActionRow
                key={item.id || item.fingerprint}
                item={item}
                onSave={() => void saveActionItem(item)}
                onStatus={(nextStatus) => void updateActionStatus(item, nextStatus)}
              />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

type QueueAction = ActionItem;

function ActionRow({
  item,
  onSave,
  onStatus,
}: {
  item: ActionItem;
  onSave: () => void;
  onStatus: (status: ActionStatus) => void;
}) {
  const persisted = Boolean(item.id);
  return (
    <article className={`action-row ${item.status}`}>
      <button
        type="button"
        className="action-check"
        onClick={() => (persisted ? onStatus(item.status === 'done' ? 'todo' : 'done') : onSave())}
        title={persisted ? 'Toggle done' : 'Save action'}
      >
        {item.status === 'done' ? <CheckCircle2 size={18} /> : persisted ? <Circle size={18} /> : <Plus size={18} />}
      </button>
      <div>
        <div className="action-row-head">
          <small>{item.source} · {STATUS_LABELS[item.status]}</small>
          <span>Priority {formatter.format(item.priorityScore || 0)}</span>
        </div>
        <strong>{item.title}</strong>
        <p>{item.detail}</p>
        {(item.pageUrl || item.keyword || item.cluster) && (
          <div className="action-meta">
            {item.keyword && <span>{item.keyword}</span>}
            {item.cluster && <span>{item.cluster}</span>}
            {item.pageUrl && (
              <a href={item.pageUrl} target="_blank" rel="noreferrer">
                {shortUrl(item.pageUrl)} <ExternalLink size={12} />
              </a>
            )}
          </div>
        )}
      </div>
      {persisted && item.status !== 'done' && (
        <select value={item.status} onChange={(event) => onStatus(event.target.value as ActionStatus)}>
          <option value="todo">To do</option>
          <option value="in_progress">In progress</option>
          <option value="dismissed">Dismiss</option>
        </select>
      )}
    </article>
  );
}

function mergeGenerated(saved: ActionItem[], generated: ActionItem[]) {
  const savedByFingerprint = new Map(saved.map((item) => [item.fingerprint, item]));
  const merged = [...saved];
  for (const item of generated) {
    if (!savedByFingerprint.has(item.fingerprint)) merged.push(item);
  }
  return merged.sort((a, b) => {
    const statusScore = statusOrder(a.status) - statusOrder(b.status);
    if (statusScore) return statusScore;
    return (b.priorityScore || 0) - (a.priorityScore || 0);
  });
}

function statusOrder(status: ActionStatus) {
  if (status === 'in_progress') return 0;
  if (status === 'todo') return 1;
  if (status === 'done') return 2;
  return 3;
}
