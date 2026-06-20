import React from 'react';
import { ArrowUpRight, Check, Download, ExternalLink, GitMerge, RefreshCw, Search, ShieldAlert, X } from 'lucide-react';
import { apiFetch } from '../lib';
import { downloadCsv } from '../export';
import { KpiCard, LoadingState, PageHeading } from '../components';
import { toast } from '../toast';
import { useDashboard } from '../data';
import type { CannibalizationRecommendation, CannibalizationReport } from '../types';

const STATUS_OPTIONS = ['new', 'reviewed', 'approved', 'deferred', 'rejected', 'resolved'];

export function CannibalizationPage() {
  const { user } = useDashboard();
  const [report, setReport] = React.useState<CannibalizationReport | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [scanning, setScanning] = React.useState(false);
  const [error, setError] = React.useState('');
  const [query, setQuery] = React.useState('');
  const deferredQuery = React.useDeferredValue(query.trim().toLowerCase());
  const [severity, setSeverity] = React.useState('all');
  const [recommendation, setRecommendation] = React.useState('all');
  const [status, setStatus] = React.useState('active');
  const [selected, setSelected] = React.useState<CannibalizationRecommendation | null>(null);

  const load = React.useCallback(async () => {
    try {
      const response = await fetch('/api/cannibalization', { credentials: 'include' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Cannibalization analysis failed to load.');
      setReport(data as CannibalizationReport);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Cannibalization analysis failed to load.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const visibleRows = React.useMemo(() => (report?.recommendations || []).filter((row) => {
    const activeMatch = status === 'all' || (status === 'active'
      ? !row.resolvedAt && row.status !== 'resolved' && row.recommendation !== 'keep-separate'
      : row.status === status);
    const severityMatch = severity === 'all' || row.severity === severity;
    const recommendationMatch = recommendation === 'all' || row.recommendation === recommendation;
    const text = `${row.intentLabel} ${row.reasoning} ${row.sourceUrls.join(' ')} ${row.sharedQueries.map((item) => item.query).join(' ')}`.toLowerCase();
    return activeMatch && severityMatch && recommendationMatch && (!deferredQuery || text.includes(deferredQuery));
  }), [deferredQuery, recommendation, report?.recommendations, severity, status]);

  async function runScan() {
    setScanning(true);
    try {
      const response = await apiFetch('/api/cannibalization', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'scan' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Cannibalization scan failed.');
      setReport(data as CannibalizationReport);
      toast.success('Cannibalization scan completed');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Cannibalization scan failed.';
      setError(message);
      toast.error(message);
    } finally {
      setScanning(false);
    }
  }

  function updateRecommendation(next: CannibalizationRecommendation) {
    setReport((current) => current ? {
      ...current,
      recommendations: current.recommendations.map((row) => row.id === next.id ? next : row),
    } : current);
    setSelected(next);
  }

  function exportRows() {
    downloadCsv('codakid-cannibalization-recommendations.csv', visibleRows.map((row) => ({
      status: row.status,
      severity: row.severity,
      confidence: row.confidence,
      intent: row.intentLabel,
      recommendation: recommendationLabel(row.recommendation),
      redirect_from: row.sourceUrls.filter((url) => url !== row.winnerUrl).join(' | '),
      redirect_to: row.winnerUrl,
      shared_queries: row.sharedQueries.map((item) => item.query).join(' | '),
      shared_impressions: row.evidence.sharedImpressions || 0,
      reasoning: row.reasoning,
      preserve_before_redirect: row.preserveNotes.join(' | '),
      owner: row.owner,
      notes: row.notes,
    })));
  }

  if (loading) return <LoadingState label="Loading cannibalization evidence" />;

  return (
    <>
      <PageHeading
        title="Cannibalization"
        description="Find pages competing for the same user intent and review safe consolidation recommendations."
        badges={report?.scan ? <span className="dash-badge live">GSC · {report.scan.startDate} – {report.scan.endDate}</span> : undefined}
      />

      <section className="kpi-grid kpi-grid-4 cannibalization-kpis" aria-label="Cannibalization summary">
        <KpiCard icon={<GitMerge />} label="Active conflicts" value={report?.summary.total || 0} note="same-site competition to review" tone={(report?.summary.total || 0) ? 'warning' : 'success'} />
        <KpiCard icon={<ShieldAlert />} label="High priority" value={report?.summary.high || 0} note="strong overlap and risk" tone={(report?.summary.high || 0) ? 'danger' : 'success'} />
        <KpiCard icon={<ArrowUpRight />} label="Redirect candidates" value={report?.summary.redirects || 0} note="redirect or merge first" />
        <KpiCard icon={<Check />} label="Resolved" value={report?.summary.resolved || 0} note="no longer active" tone="success" />
      </section>

      <section className="panel cannibalization-workspace">
        <header className="cannibalization-head">
          <div>
            <h2>Intent conflicts</h2>
            <p>{report?.scan ? `${report.scan.candidateCount} candidate groups checked · ${report.scan.model || 'evidence model'}` : 'Run the first scan after Search Console sync completes.'}</p>
          </div>
          <div className="cannibalization-actions">
            <button type="button" className="secondary-button" onClick={exportRows} disabled={!visibleRows.length} title="Export visible recommendations">
              <Download size={15} /> Export CSV
            </button>
            {user.role === 'admin' ? (
              <button type="button" className="primary-button" onClick={() => void runScan()} disabled={scanning}>
                <RefreshCw size={15} className={scanning ? 'spin' : ''} /> {scanning ? 'Analyzing intent…' : 'Run intent scan'}
              </button>
            ) : null}
          </div>
        </header>

        {error ? <div className="workspace-error"><ShieldAlert size={17} /><span>{error}</span></div> : null}

        <div className="cannibalization-toolbar">
          <label className="search-field">
            <Search size={15} />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages, intent, or query…" />
          </label>
          <select value={severity} onChange={(event) => setSeverity(event.target.value)} aria-label="Filter severity">
            <option value="all">All severity</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </select>
          <select value={recommendation} onChange={(event) => setRecommendation(event.target.value)} aria-label="Filter recommendation">
            <option value="all">All actions</option><option value="redirect">301 redirect</option><option value="merge-redirect">Merge then redirect</option><option value="differentiate">Differentiate</option><option value="canonical">Canonical</option><option value="internal-link">Internal-link fix</option><option value="keep-separate">Keep separate</option><option value="review">Manual review</option>
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter review status">
            <option value="active">Active</option><option value="all">All status</option>{STATUS_OPTIONS.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}
          </select>
          <span>{visibleRows.length} groups</span>
        </div>

        <div className="table-wrap cannibalization-table-wrap">
          <table className="cannibalization-table">
            <thead><tr><th>Competing pages</th><th>Intent</th><th>Evidence</th><th>Recommendation</th><th>Review</th><th /></tr></thead>
            <tbody>
              {visibleRows.map((row) => {
                const pages = row.evidence.pages || [];
                const winner = pages.find((page) => page.url === row.winnerUrl);
                return (
                  <tr key={row.id}>
                    <td>
                      <strong>{winner?.title || shortPath(row.winnerUrl)}</strong>
                      <small>{row.sourceUrls.length} URLs · winner selected</small>
                    </td>
                    <td><span className="intent-label">{row.intentLabel || 'Needs review'}</span><small>{row.evidence.sharedQueryCount || row.sharedQueries.length} shared queries</small></td>
                    <td><strong>{formatNumber(row.evidence.sharedImpressions || 0)} impressions</strong><small>{row.evidence.sharedClicks || 0} clicks · overlap {row.evidence.overlapScore || 0}/100</small></td>
                    <td><span className={`recommendation-badge ${row.recommendation}`}>{recommendationLabel(row.recommendation)}</span><small>{row.confidence}% confidence</small></td>
                    <td><span className={`review-status ${row.status}`}>{statusLabel(row.status)}</span><small>{row.owner || 'Unassigned'}</small></td>
                    <td><button type="button" className="icon-button" aria-label={`Review ${winner?.title || 'conflict'}`} title="Review evidence" onClick={() => setSelected(row)}><ArrowUpRight size={16} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!visibleRows.length ? <div className="cannibalization-empty"><GitMerge size={24} /><strong>No matching conflicts</strong><p>{report?.scan ? 'Adjust the filters or run a fresh scan after new Search Console data arrives.' : 'The first scan will build this workspace from Search Console and WordPress evidence.'}</p></div> : null}
      </section>

      {selected ? <RecommendationDrawer recommendation={selected} onClose={() => setSelected(null)} onSaved={updateRecommendation} /> : null}
    </>
  );
}

function RecommendationDrawer({ recommendation, onClose, onSaved }: { recommendation: CannibalizationRecommendation; onClose: () => void; onSaved: (row: CannibalizationRecommendation) => void }) {
  const [status, setStatus] = React.useState(recommendation.status);
  const [owner, setOwner] = React.useState(recommendation.owner || '');
  const [notes, setNotes] = React.useState(recommendation.notes || '');
  const [saving, setSaving] = React.useState(false);
  const pages = recommendation.evidence.pages || [];

  async function saveReview() {
    setSaving(true);
    try {
      const response = await apiFetch('/api/cannibalization', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'review', id: recommendation.id, status, owner, notes }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Review could not be saved.');
      onSaved(data.recommendation as CannibalizationRecommendation);
      toast.success('Cannibalization review saved');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Review could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="drawer-backdrop cannibalization-drawer-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="drilldown-drawer cannibalization-drawer" aria-label="Cannibalization recommendation">
        <header className="drawer-head">
          <div><span className={`drawer-icon ${recommendation.severity === 'high' ? 'danger' : recommendation.severity === 'medium' ? 'warning' : ''}`}><GitMerge size={20} /></span><div><small>{recommendation.severity} priority · {recommendation.confidence}% confidence</small><h2>{recommendationLabel(recommendation.recommendation)}</h2><p>{recommendation.intentLabel}</p></div></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close recommendation"><X size={17} /></button>
        </header>

        <section className="drawer-section">
          <div className="drawer-section-head"><h3>Recommendation</h3><span>Intent evidence</span></div>
          <p className="drawer-copy">{recommendation.reasoning}</p>
          <div className="winner-route"><span>Selected destination</span><a href={recommendation.winnerUrl} target="_blank" rel="noreferrer">{shortPath(recommendation.winnerUrl)} <ExternalLink size={13} /></a></div>
        </section>

        <section className="drawer-section">
          <div className="drawer-section-head"><h3>Competing pages</h3><span>{pages.length}</span></div>
          <div className="drawer-list">{pages.map((page) => (
            <article className={`drawer-row cannibalization-page-row${page.url === recommendation.winnerUrl ? ' winner' : ''}`} key={page.url}>
              <div><strong>{page.title}</strong><p>{page.clicks} clicks · {formatNumber(page.impressions)} impressions · position {page.position || '—'} · {page.sessions} sessions</p><a href={page.url} target="_blank" rel="noreferrer">Open page <ExternalLink size={12} /></a></div>
              <span>{page.url === recommendation.winnerUrl ? 'Winner' : 'Competing'}</span>
            </article>
          ))}</div>
        </section>

        <section className="drawer-section">
          <div className="drawer-section-head"><h3>Shared queries</h3><span>{recommendation.evidence.sharedQueryCount || recommendation.sharedQueries.length}</span></div>
          <div className="query-evidence-list">{recommendation.sharedQueries.slice(0, 10).map((query) => <div key={query.query}><strong>{query.query}</strong><span>{formatNumber(query.impressions)} impressions · {query.clicks} clicks</span></div>)}</div>
        </section>

        {recommendation.preserveNotes.length ? <section className="drawer-section"><div className="drawer-section-head"><h3>Preserve before redirecting</h3></div><ul className="preserve-list">{recommendation.preserveNotes.map((note) => <li key={note}>{note}</li>)}</ul></section> : null}

        <section className="drawer-section review-form">
          <div className="drawer-section-head"><h3>Team review</h3><span>Saved in Neon</span></div>
          <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}>{STATUS_OPTIONS.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}</select></label>
          <label>Owner<input value={owner} onChange={(event) => setOwner(event.target.value)} placeholder="Name or email" /></label>
          <label>Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Implementation decision, redirect timing, or content to preserve" rows={4} /></label>
          <button type="button" className="primary-button" onClick={() => void saveReview()} disabled={saving}><Check size={15} />{saving ? 'Saving…' : 'Save review'}</button>
        </section>
      </aside>
    </div>
  );
}

function recommendationLabel(value: string) {
  return ({ redirect: '301 redirect', 'merge-redirect': 'Merge then redirect', differentiate: 'Differentiate intent', canonical: 'Add canonical', 'internal-link': 'Internal-link fix', 'keep-separate': 'Keep separate', review: 'Manual review' } as Record<string, string>)[value] || value;
}

function statusLabel(value: string) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : 'New';
}

function shortPath(value: string) {
  try { return new URL(value).pathname || '/'; } catch { return value; }
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', { notation: value >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);
}
