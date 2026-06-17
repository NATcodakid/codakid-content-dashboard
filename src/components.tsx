import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, Info, Minus, RefreshCw } from 'lucide-react';
import { formatter, formatContentAge, pillarSupportLevel } from './lib';
import { subscribeToasts, type ToastItem } from './toast';

export function Toaster() {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  React.useEffect(() => subscribeToasts(setItems), []);
  if (!items.length) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={`toast toast-${item.kind}`}>
          {item.kind === 'success' ? <CheckCircle2 size={16} /> : item.kind === 'error' ? <AlertTriangle size={16} /> : <Info size={16} />}
          <span>{item.message}</span>
        </div>
      ))}
    </div>
  );
}

const LOGO_SRC = '/codakid-logo.png';
const LOGO_WORDMARK_SRC = '/codakid-logo-wordmark.png';

export function BrandLogo({
  variant = 'sidebar',
  subtitle,
  subtitleAbove = variant === 'sidebar',
}: {
  variant?: 'sidebar' | 'auth' | 'loading';
  subtitle?: string;
  subtitleAbove?: boolean;
}) {
  if (variant === 'sidebar') {
    return (
      <Link to="/" className="brand-lockup">
        {subtitle ? <span className="brand-eyebrow">{subtitle}</span> : null}
        <img src={LOGO_WORDMARK_SRC} alt="CodaKid" className="brand-logo brand-logo-sidebar" />
      </Link>
    );
  }

  const subtitleEl = subtitle ? <span className="brand-logo-subtitle">{subtitle}</span> : null;

  return (
    <div className={`brand-logo-wrap brand-logo-wrap-${variant}`}>
      {subtitleAbove ? subtitleEl : null}
      <img src={LOGO_SRC} alt="CodaKid" className={`brand-logo brand-logo-${variant}`} />
      {!subtitleAbove ? subtitleEl : null}
    </div>
  );
}

function useCountUp(value: number, duration = 650) {
  const [display, setDisplay] = React.useState(0);
  const fromRef = React.useRef(0);
  React.useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    // Respect reduced-motion: snap straight to the final value.
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      fromRef.current = to;
      setDisplay(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return display;
}

export type KpiDelta = {
  /** Pre-formatted change text, e.g. "+12%", "-1.3", "+0.4pt". */
  display: string;
  /** Whether the change is good (drives color). Omit for a neutral pill. */
  good?: boolean;
  /** Arrow direction. Defaults to inferred from the leading sign of display. */
  direction?: 'up' | 'down' | 'flat';
};

export function KpiCard({
  icon,
  label,
  value,
  note,
  tone = 'default',
  delta,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  note: string;
  tone?: 'default' | 'warning' | 'success' | 'danger';
  delta?: KpiDelta;
}) {
  return (
    <article className={`kpi-card ${tone}`}>
      <div className="kpi-icon">{icon}</div>
      <div className="kpi-card-body">
        <span className="kpi-card-label">{label}</span>
        {typeof value === 'number' ? <KpiValue value={value} /> : <strong className="kpi-card-value">{value}</strong>}
        <div className="kpi-card-foot">
          {delta ? <DeltaPill delta={delta} /> : null}
          <small className="kpi-card-note">{note}</small>
        </div>
      </div>
    </article>
  );
}

function KpiValue({ value }: { value: number }) {
  const display = useCountUp(value);
  return <strong className="kpi-card-value">{formatter.format(display)}</strong>;
}

function DeltaPill({ delta }: { delta: KpiDelta }) {
  const direction =
    delta.direction || (delta.display.startsWith('-') ? 'down' : delta.display.startsWith('+') ? 'up' : 'flat');
  const tone = delta.good === undefined ? 'neutral' : delta.good ? 'good' : 'bad';
  const Icon = direction === 'down' ? ArrowDownRight : direction === 'up' ? ArrowUpRight : Minus;
  return (
    <span className={`kpi-delta ${tone}`} title="vs prior period">
      <Icon size={12} />
      {delta.display}
    </span>
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
      {action !== undefined && (
        typeof action === 'string' || typeof action === 'number'
          ? <span>{action}</span>
          : <div className="panel-header-action">{action}</div>
      )}
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

export function PillarSupportBadge({
  inboundCount,
  modified,
  date,
  compact = false,
}: {
  inboundCount: number;
  modified?: string;
  date?: string;
  compact?: boolean;
}) {
  const support = pillarSupportLevel(inboundCount);
  const age = formatContentAge(modified, date);

  return (
    <div className={`pillar-support pillar-support-${support.tone}${compact ? ' compact' : ''}`}>
      <div className="pillar-support-main">
        <strong>{inboundCount}</strong>
        <span>links in</span>
      </div>
      <small className="pillar-support-label">{support.label}</small>
      {!compact ? <small className="pillar-support-age">{age}</small> : null}
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
  period,
  value,
  valueNote,
  detail,
  chart,
  to,
}: {
  label: string;
  period?: string;
  value: number | string;
  valueNote?: string;
  detail?: string;
  chart?: React.ReactNode;
  to?: string;
}) {
  const inner = (
    <>
      <div className="dash-metric-head">
        <div className="dash-metric-title">
          <span className="dash-label">{label}</span>
          {period ? <span className="dash-metric-period">{period}</span> : null}
        </div>
        {to && <ArrowUpRight size={14} className="dash-metric-go" />}
      </div>
      <div className="dash-metric-body">
        <div className="dash-metric-value">
          <strong>{typeof value === 'number' ? formatter.format(value) : value}</strong>
          {valueNote ? <span className="dash-metric-value-note">{valueNote}</span> : null}
        </div>
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
    <div className="skeleton-page" aria-busy="true" aria-label={label}>
      <div className="skeleton-head">
        <span className="skeleton skeleton-title" />
        <span className="skeleton skeleton-sub" />
      </div>
      <div className="skeleton-kpis">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton skeleton-card" />
        ))}
      </div>
      <div className="skeleton skeleton-chart" />
      <div className="skeleton-rows">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="skeleton skeleton-row" />
        ))}
      </div>
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

/** Guided "connect this to unlock" state for widgets that depend on an integration. */
export function ConnectCard({
  icon,
  title,
  body,
  hint,
  steps,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  hint?: string;
  steps?: string[];
  action?: React.ReactNode;
}) {
  return (
    <div className="connect-card">
      <div className="connect-card-icon">{icon}</div>
      <div className="connect-card-body">
        <strong>{title}</strong>
        <p>{body}</p>
        {steps?.length ? (
          <ol className="connect-card-steps">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        ) : null}
        {hint ? <span className="connect-card-hint">{hint}</span> : null}
        {action ? <div className="connect-card-action">{action}</div> : null}
      </div>
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
