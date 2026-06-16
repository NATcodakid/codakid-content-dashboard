import { ClipboardList, ExternalLink } from 'lucide-react';
import { useDashboard } from '../data';
import { LoadingState, MetricPill, PageHeading, PanelHeader } from '../components';
import { formatCell } from '../lib';
import type { GameplanRow } from '../types';

export function GameplanPage() {
  const { snapshot, isLoading } = useDashboard();

  if (isLoading && !snapshot) return <LoadingState label="Loading the SEO gameplan" />;
  if (!snapshot) return null;

  const gameplan = snapshot.gameplan;
  if (!gameplan) {
    return (
      <>
        <PageHeading title="Gameplan" description="Imported SEO workbook." />
        <div className="dash-stack">
        <section className="panel">
          <p className="panel-note">No gameplan workbook has been imported yet.</p>
        </section>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeading
        title="Gameplan"
        description="Pillars, quick wins, keyword targets, and content calendar from your workbook."
      />

      <div className="dash-stack">
      <section className="panel">
        <PanelHeader icon={<ClipboardList />} title="Workbook Summary" action="imported" />
        <div className="gameplan-summary">
          <MetricPill label="Confirmed pillars" value={gameplan.summary.confirmedPillars} />
          <MetricPill label="Quick wins" value={gameplan.summary.quickWins} />
          <MetricPill label="Keyword targets" value={gameplan.summary.keywordTargets} />
          <MetricPill label="Planned content" value={gameplan.summary.plannedContent} />
          <MetricPill label="Meta tasks" value={gameplan.summary.metaTasks} />
          <MetricPill label="Schema tasks" value={gameplan.summary.schemaTasks} />
        </div>
      </section>

      <section className="panel">
        <PanelHeader icon={<ClipboardList />} title="Working Lists" />
        <div className="gameplan-grid">
          <div className="gameplan-card confirmed-card">
            <h3>Confirmed Pillars</h3>
            {gameplan.confirmedPillars.map((pillar) => (
              <article key={pillar.url}>
                <a href={pillar.url} target="_blank" rel="noreferrer">
                  {pillar.title}
                  <ExternalLink size={13} />
                </a>
                <span>{pillar.cluster}</span>
                <p>{pillar.notes}</p>
              </article>
            ))}
          </div>
          <GameplanList
            title="Urgent Quick Wins"
            rows={gameplan.quickWins.slice(0, 6)}
            primaryKey="Action"
            secondaryKey="Page / Target"
            metaKey="Expected Impact"
          />
          <GameplanList
            title="Priority Keywords"
            rows={gameplan.keywordTargets.slice(0, 8)}
            primaryKey="Keyword"
            secondaryKey="Target URL"
            metaKey="Action"
          />
          <GameplanList
            title="Content Calendar"
            rows={gameplan.contentCalendar.slice(0, 6)}
            primaryKey="Title (SEO-Optimized)"
            secondaryKey="Target Keyword"
            metaKey="Priority"
          />
        </div>
      </section>
      </div>
    </>
  );
}

function GameplanList({
  title,
  rows,
  primaryKey,
  secondaryKey,
  metaKey,
}: {
  title: string;
  rows: GameplanRow[];
  primaryKey: string;
  secondaryKey: string;
  metaKey: string;
}) {
  return (
    <div className="gameplan-card">
      <h3>{title}</h3>
      <div className="gameplan-list">
        {rows.map((row, index) => (
          <article key={`${title}-${index}`}>
            <strong>{formatCell(row[primaryKey])}</strong>
            <span>{formatCell(row[secondaryKey])}</span>
            <small>{formatCell(row[metaKey])}</small>
          </article>
        ))}
      </div>
    </div>
  );
}
