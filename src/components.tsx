import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { formatter } from './lib';

export function KpiCard({
  icon,
  label,
  value,
  note,
  tone = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  note: string;
  tone?: 'default' | 'warning' | 'success';
}) {
  return (
    <article className={`kpi-card ${tone}`}>
      <div className="kpi-icon">{icon}</div>
      <div className="kpi-card-body">
        <span className="kpi-card-label">{label}</span>
        <strong className="kpi-card-value">{typeof value === 'number' ? formatter.format(value) : value}</strong>
        <small className="kpi-card-note">{note}</small>
      </div>
    </article>
  );
}

export function PanelHeader({
  icon,
  title,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="panel-header">
      <div>
        {icon}
        <h2>{title}</h2>
      </div>
      {action !== undefined && <span>{action}</span>}
    </div>
  );
}

export function MetricPill({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="metric-pill">
      <strong>{typeof value === 'number' ? formatter.format(value) : value}</strong>
      <span>{label}</span>
    </div>
  );
}

export function HealthMeter({ value, status }: { value: number; status: string }) {
  const [width, setWidth] = React.useState(0);

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setWidth(Math.max(0, Math.min(100, value))));
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <div className="health-meter">
      <span>{value}</span>
      <div>
        <i style={{ width: `${width}%` }} />
      </div>
      <small>{status}</small>
    </div>
  );
}

export function InfoDot({ text }: { text: string }) {
  return (
    <span className="info-dot" tabIndex={0} aria-label={text} data-tip={text}>
      ?
    </span>
  );
}

export function StatTile({
  icon,
  label,
  value,
  hint,
  info,
  to,
  tone = 'default',
  chart,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  hint: string;
  info?: string;
  to?: string;
  tone?: 'default' | 'warning' | 'success' | 'danger';
  chart?: React.ReactNode;
}) {
  const inner = (
    <>
      <div className="stat-tile-top">
        <span className="stat-tile-icon">{icon}</span>
        <span className="stat-tile-label">
          {label}
          {info && <InfoDot text={info} />}
        </span>
        {to && <ArrowUpRight className="stat-tile-go" size={16} />}
      </div>
      <div className="stat-tile-main">
        <strong className="stat-tile-value">{typeof value === 'number' ? formatter.format(value) : value}</strong>
        {chart && <span className="stat-tile-chart">{chart}</span>}
      </div>
      <p className="stat-tile-hint">{hint}</p>
    </>
  );

  if (to) {
    return (
      <Link className={`stat-tile interactive ${tone}`} to={to}>
        {inner}
      </Link>
    );
  }

  return <article className={`stat-tile ${tone}`}>{inner}</article>;
}

export function SectionHeader({
  title,
  description,
  meta,
}: {
  title: string;
  description?: string;
  meta?: React.ReactNode;
}) {
  return (
    <div className="section-header">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {meta !== undefined && <span className="section-meta">{meta}</span>}
    </div>
  );
}

export function DashCard({
  title,
  subtitle,
  action,
  children,
  className = '',
  soft = false,
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  soft?: boolean;
}) {
  return (
    <div className={`dash-card-shell ${className}`.trim()}>
      <div className={`dash-card ${soft ? 'soft' : ''}`}>
        {(title || action) && (
          <header className="dash-card-head">
            <div>
              {title && <h3>{title}</h3>}
              {subtitle && <p>{subtitle}</p>}
            </div>
            {action}
          </header>
        )}
        {children}
      </div>
    </div>
  );
}

export function DashMetric({
  label,
  value,
  detail,
  chart,
  to,
}: {
  label: string;
  value: number | string;
  detail?: string;
  chart?: React.ReactNode;
  to?: string;
}) {
  const inner = (
    <>
      <div className="dash-metric-head">
        <span className="dash-label">{label}</span>
        {to && <ArrowUpRight size={14} className="dash-metric-go" />}
      </div>
      <div className="dash-metric-body">
        <strong>{typeof value === 'number' ? formatter.format(value) : value}</strong>
        {chart}
      </div>
      {detail && <p className="dash-metric-detail">{detail}</p>}
    </>
  );

  if (to) {
    return (
      <Link className="dash-metric interactive" to={to}>
        {inner}
      </Link>
    );
  }

  return <article className="dash-metric">{inner}</article>;
}

export function PageHeading({
  title,
  description,
  badges,
}: {
  title: string;
  description?: string;
  badges?: React.ReactNode;
}) {
  return (
    <header className="dash-header page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {badges && <div className="dash-badges">{badges}</div>}
    </header>
  );
}

export function LoadingState({ label = 'Loading dashboard data' }: { label?: string }) {
  return (
    <div className="loading-state">
      <RefreshCw size={22} className="spin" />
      <strong>{label}</strong>
      <span>This reads live post content and links, so it can take a few seconds.</span>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="empty-compact">
      {icon}
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

export function SearchPeriodNav({
  label,
  onPrevious,
  onNext,
  canPrevious,
  canNext,
  loading = false,
  note,
}: {
  label: string;
  onPrevious: () => void;
  onNext: () => void;
  canPrevious: boolean;
  canNext: boolean;
  loading?: boolean;
  note?: string;
}) {
  return (
    <div className="search-period-nav">
      <button
        type="button"
        className="period-nav-btn"
        onClick={onPrevious}
        disabled={!canPrevious || loading}
        aria-label="Previous reporting period"
      >
        <ChevronLeft size={18} />
      </button>
      <div className="search-period-copy">
        <strong>{label}</strong>
        {note ? <span>{note}</span> : null}
      </div>
      <button
        type="button"
        className="period-nav-btn"
        onClick={onNext}
        disabled={!canNext || loading}
        aria-label="Next reporting period"
      >
        <ChevronRight size={18} />
      </button>
      {loading ? <RefreshCw size={14} className="spin search-period-spinner" aria-hidden /> : null}
    </div>
  );
}
