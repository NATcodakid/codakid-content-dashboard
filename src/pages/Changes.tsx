import React from 'react';
import { ArrowDown, ArrowUp, CalendarCheck, CheckCircle2, Clock3, Plus, Trash2 } from 'lucide-react';
import { useDashboard } from '../data';
import { KpiCard, LoadingState, PageHeading } from '../components';
import { formatDate, formatDateRange, formatPercent, formatter, shortUrl } from '../lib';
import type { SeoChange } from '../types';
import { useSearchParams } from 'react-router-dom';

const CHANGE_TYPES = [
  ['content', 'Content refresh'],
  ['title-meta', 'Title or meta'],
  ['internal-links', 'Internal links'],
  ['schema', 'Schema'],
  ['technical', 'Technical'],
  ['conversion', 'Conversion'],
  ['other', 'Other'],
];

export function ChangesPage() {
  const { snapshot, seoChanges, saveSeoChange, updateSeoChange, deleteSeoChange, isLoading } = useDashboard();
  const [searchParams] = useSearchParams();
  const requestedUrl = searchParams.get('url') || '';
  const [open, setOpen] = React.useState(Boolean(requestedUrl));
  const [pageUrl, setPageUrl] = React.useState(requestedUrl);
  const [changeType, setChangeType] = React.useState('content');
  const [summary, setSummary] = React.useState('');
  const [implementedAt, setImplementedAt] = React.useState(new Date().toISOString().slice(0, 10));
  const pages = [...(snapshot?.allPosts || [])].sort((a, b) => a.title.localeCompare(b.title));

  if (isLoading && !snapshot) return <LoadingState label="Loading change history" />;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const page = pages.find((item) => item.url === pageUrl);
    await saveSeoChange({ pageUrl, pageTitle: page?.title || '', changeType, summary, implementedAt: implementedAt || null });
    setSummary('');
    setOpen(false);
  }

  const report = seoChanges;
  const coverage = report?.coverage;
  return (
    <>
      <PageHeading
        title="Change Impact"
        description="Record SEO work and compare the 28 days before with the available 28 days after."
        badges={
          <button type="button" className="primary-button" onClick={() => setOpen((value) => !value)}>
            <Plus size={15} /> Log change
          </button>
        }
      />

      <div className="dash-stack changes-page">
        {open ? (
          <form className="panel change-form" onSubmit={(event) => void submit(event)}>
            <div className="change-form-heading">
              <div><span>New measurement</span><h2>What changed?</h2></div>
              <p>The dashboard saves the pre-change baseline now and measures results as daily data arrives.</p>
            </div>
            <div className="change-form-grid">
              <label className="field span-2"><span>Page</span>
                <select value={pageUrl} onChange={(event) => setPageUrl(event.target.value)} required>
                  <option value="">Choose a blog page</option>
                  {pages.map((page) => <option key={page.url} value={page.url}>{page.title}</option>)}
                </select>
              </label>
              <label className="field"><span>Change type</span>
                <select value={changeType} onChange={(event) => setChangeType(event.target.value)}>
                  {CHANGE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="field"><span>Implemented</span>
                <input type="date" value={implementedAt} onChange={(event) => setImplementedAt(event.target.value)} />
              </label>
              <label className="field span-2"><span>Short description</span>
                <input value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Updated intro, title, and internal links" maxLength={240} required />
              </label>
            </div>
            <div className="change-form-actions">
              <button type="button" className="secondary-button" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" className="primary-button"><CalendarCheck size={15} /> Save baseline</button>
            </div>
          </form>
        ) : null}

        <section className="kpi-grid change-kpis" aria-label="Change measurement summary">
          <KpiCard icon={<CalendarCheck />} label="Logged changes" value={report?.summary.total || 0} note={`${report?.summary.planned || 0} planned`} />
          <KpiCard icon={<Clock3 />} label="Measuring" value={report?.summary.measuring || 0} note="minimum 7 comparable days" />
          <KpiCard icon={<CheckCircle2 />} label="Measured" value={report?.summary.measured || 0} note={`${report?.summary.wins || 0} positive outcomes`} tone="success" />
          <KpiCard icon={<ArrowUp />} label="Median impact" value={report?.summary.medianImpact == null ? '—' : `${report.summary.medianImpact > 0 ? '+' : ''}${report.summary.medianImpact}%`} note="clicks, sessions, and key events" />
        </section>

        <div className="change-coverage" role="status">
          <span className={coverage?.ga4Rows && coverage?.gscRows ? 'live' : ''} />
          <p><strong>Historical coverage</strong>{coverage?.ga4StartDate || coverage?.gscStartDate
            ? ` GA4 ${formatDateRange(coverage.ga4StartDate, coverage.ga4EndDate)} · Search Console ${formatDateRange(coverage.gscStartDate, coverage.gscEndDate)}`
            : ' Daily page history will appear after the next GA4 and Search Console sync.'}</p>
        </div>

        <section className="change-list" aria-label="SEO changes">
          {report?.changes.length ? report.changes.map((change) => (
            <ChangeRow
              key={change.id}
              change={change}
              onStatus={(status) => updateSeoChange({ id: change.id, status })}
              onDelete={() => deleteSeoChange(change.id)}
            />
          )) : (
            <div className="panel change-empty">
              <CalendarCheck size={28} />
              <h2>No changes logged yet</h2>
              <p>Log the next meaningful blog update. The dashboard will preserve its baseline and measure the outcome.</p>
              <button type="button" className="primary-button" onClick={() => setOpen(true)}><Plus size={15} /> Log first change</button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function ChangeRow({ change, onStatus, onDelete }: { change: SeoChange; onStatus: (status: string) => Promise<void>; onDelete: () => Promise<void> }) {
  const impact = change.impact;
  const metrics = impact.metrics;
  const period = impact.beforePeriod && impact.afterPeriod
    ? `${formatDateRange(impact.beforePeriod.startDate, impact.beforePeriod.endDate)} vs ${formatDateRange(impact.afterPeriod.startDate, impact.afterPeriod.endDate)}`
    : '';
  return (
    <article className="panel change-row">
      <header className="change-row-head">
        <div>
          <div className="change-row-meta"><span>{labelType(change.changeType)}</span><span>{change.implementedAt ? formatDate(change.implementedAt) : 'Planned'}</span></div>
          <h2>{change.summary}</h2>
          <a href={change.pageUrl} target="_blank" rel="noreferrer">{change.pageTitle || shortUrl(change.pageUrl)}</a>
        </div>
        <div className="change-row-controls">
          <select value={change.status} aria-label="Change status" onChange={(event) => void onStatus(event.target.value)}>
            <option value="planned">Planned</option><option value="measuring">Measuring</option><option value="complete">Complete</option>
          </select>
          <button type="button" className="icon-button" title="Delete change" onClick={() => void onDelete()}><Trash2 size={15} /></button>
        </div>
      </header>
      {impact.ready && metrics ? (
        <div className="change-impact">
          <Metric label="Clicks" value={metrics.clicks.afterDaily} delta={metrics.clicks.change} />
          <Metric label="Sessions" value={metrics.sessions.afterDaily} delta={metrics.sessions.change} />
          <Metric label="Views" value={metrics.views.afterDaily} delta={metrics.views.change} />
          <Metric label="Key events" value={metrics.keyEvents.afterDaily} delta={metrics.keyEvents.change} decimals />
        </div>
      ) : (
        <div className="change-collecting"><Clock3 size={16} /><span>{impact.message}</span></div>
      )}
      {period ? <footer>{period} · daily averages normalize partial after-periods</footer> : null}
    </article>
  );
}

function Metric({ label, value, delta, decimals = false }: { label: string; value: number; delta: number | null; decimals?: boolean }) {
  const positive = Number(delta) > 0;
  return <div className="change-metric"><span>{label} / day</span><strong>{decimals ? value.toFixed(1) : formatter.format(Math.round(value))}</strong><small className={delta == null ? '' : positive ? 'positive' : delta < 0 ? 'negative' : ''}>{delta == null ? 'new baseline' : <>{positive ? <ArrowUp size={12} /> : delta < 0 ? <ArrowDown size={12} /> : null}{formatPercent(Math.abs(delta))}</>}</small></div>;
}

function labelType(value: string) { return CHANGE_TYPES.find(([key]) => key === value)?.[1] || 'SEO change'; }
