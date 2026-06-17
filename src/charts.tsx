import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { formatCompact, formatter, formatDateRange, formatShortPeriod, formatPercent, formatPosition, chartPageLabel, periodDayCount, shortUrl, inboundBarColor } from './lib';
import type { Cluster, Pillar, SearchOpportunity, SearchTrendPoint, SearchDailyPoint, TrackedKeyword, PageSpeedHistoryPoint } from './types';

const PALETTE = ['#4f663c', '#a1b887', '#2d3b23', '#9a6b12', '#5e6b52', '#8b9f72', '#a94436', '#748b61'];
const AXIS = { fontSize: 11, fill: '#7a876e' };

const TONE_COLOR: Record<string, string> = {
  success: '#4f663c',
  default: '#a1b887',
  warning: '#9a6b12',
  danger: '#a94436',
};

export function ScoreGauge({
  score,
  tone = 'default',
  size = 168,
}: {
  score: number;
  tone?: 'success' | 'default' | 'warning' | 'danger';
  size?: number;
}) {
  const stroke = 13;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const target = (Math.max(0, Math.min(100, score)) / 100) * circumference;
  const color = TONE_COLOR[tone] || TONE_COLOR.default;
  const [dash, setDash] = useState(0);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setDash(target));
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return (
    <div className="score-gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e4ecd9" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 900ms cubic-bezier(0.22, 0.61, 0.36, 1)' }}
        />
      </svg>
      <div className="score-gauge-label">
        <strong style={{ color }}>{score}</strong>
        <span>/ 100</span>
      </div>
    </div>
  );
}

function nodeTone(score: number) {
  if (score >= 78) return 'success';
  if (score >= 58) return 'warning';
  return 'danger';
}

export function Sparkbars({ data, color = '#4f663c' }: { data: number[]; color?: string }) {
  const bars = data.length ? data.slice(0, 12) : [0];
  const max = Math.max(1, ...bars);
  const barW = 5;
  const gap = 3;
  const height = 30;
  const width = bars.length * (barW + gap);
  return (
    <svg className="sparkbars" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {bars.map((value, index) => {
        const h = Math.max(3, (value / max) * (height - 4));
        return (
          <rect
            key={index}
            className="sparkbar"
            x={index * (barW + gap)}
            y={height - h}
            width={barW}
            height={h}
            rx={2}
            fill={color}
            opacity={0.4 + 0.6 * (value / max)}
            style={{ animationDelay: `${index * 45}ms` }}
          />
        );
      })}
    </svg>
  );
}

export function MiniRing({ value, total, color = '#4f663c' }: { value: number; total: number; color?: string }) {
  const pct = total > 0 ? Math.min(1, value / total) : 0;
  const size = 46;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const target = pct * circumference;
  const [dash, setDash] = useState(0);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setDash(target));
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return (
    <svg className="mini-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e4ecd9" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray 800ms cubic-bezier(0.22, 0.61, 0.36, 1)' }}
      />
    </svg>
  );
}

const RANK_META: Record<string, { color: string; label: string }> = {
  'Top 3': { color: '#4f663c', label: 'Top 3 · positions 1–3' },
  'Page 1 (4–10)': { color: '#a1b887', label: 'Page 1 · positions 4–10' },
  'Page 2 (11–20)': { color: '#9a6b12', label: 'Page 2 · positions 11–20' },
  '21+': { color: '#7a876e', label: 'Page 3+ · position 21 and beyond' },
};

export function RankBreakdown({ buckets }: { buckets: Array<{ name: string; value: number }> }) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.value, 0) || 1;
  return (
    <div className="rank-breakdown">
      <div className="rank-bar" role="img" aria-label="Distribution of keyword rankings">
        {buckets.map((bucket, index) =>
          bucket.value > 0 ? (
            <span
              key={bucket.name}
              className="rank-bar-segment"
              style={{
                width: `${(bucket.value / total) * 100}%`,
                background: RANK_META[bucket.name]?.color,
                animationDelay: `${index * 80}ms`,
              }}
              title={`${RANK_META[bucket.name]?.label}: ${bucket.value}`}
            />
          ) : null,
        )}
      </div>
      <ul className="rank-legend">
        {buckets.map((bucket) => (
          <li key={bucket.name}>
            <i style={{ background: RANK_META[bucket.name]?.color }} />
            <span className="rank-name">{RANK_META[bucket.name]?.label || bucket.name}</span>
            <strong>{bucket.value}</strong>
            <small>{Math.round((bucket.value / total) * 100)}%</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type ClusterNode = { title: string; health: number; url: string };

export function ClusterMap({
  pillarTitle,
  internalLinks,
  related,
}: {
  pillarTitle: string;
  internalLinks: number;
  related: ClusterNode[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 720, h: 380 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cx = size.w / 2;
  const cy = size.h / 2;
  const rx = size.w * 0.36;
  const ry = size.h * 0.33;
  const count = Math.max(1, related.length);

  const nodes = related.map((post, index) => {
    const angle = (-90 + (360 / count) * index) * (Math.PI / 180);
    const x = cx + rx * Math.cos(angle);
    const y = cy + ry * Math.sin(angle);
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    return {
      ...post,
      x,
      y,
      // Trim the connector so the arrow lands just outside each card / the hub.
      lineStart: { x: cx + ux * 86, y: cy + uy * 40 },
      lineEnd: { x: x - ux * 60, y: y - uy * 34 },
    };
  });

  return (
    <div className="cluster-map" ref={ref}>
      <svg className="cluster-map-lines" width={size.w} height={size.h}>
        <defs>
          <marker id="cm-arrow" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#a1b887" />
          </marker>
        </defs>
        {nodes.map((node) => (
          <line
            key={`line-${node.url}`}
            x1={node.lineStart.x}
            y1={node.lineStart.y}
            x2={node.lineEnd.x}
            y2={node.lineEnd.y}
            stroke="#c9ddb4"
            strokeWidth={2}
            markerEnd="url(#cm-arrow)"
          />
        ))}
      </svg>

      <div className="cluster-hub" style={{ left: cx, top: cy }}>
        <strong>{pillarTitle}</strong>
        <span>{formatter.format(internalLinks)} internal links</span>
      </div>

      {nodes.map((node) => (
        <a
          key={node.url}
          className="cluster-node"
          href={node.url}
          target="_blank"
          rel="noreferrer"
          style={{ left: node.x, top: node.y }}
          title={node.title}
        >
          <span className={`cluster-node-score ${nodeTone(node.health)}`}>{node.health}</span>
          <p>{node.title}</p>
        </a>
      ))}
    </div>
  );
}

export function PositionDistributionChart({ data }: { data: Array<{ name: string; value: number }> }) {
  const colors = ['#3f5733', '#4f663c', '#9a6b12', '#748b61'];
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <XAxis dataKey="name" tick={AXIS} interval={0} height={28} />
        <YAxis tick={AXIS} allowDecimals={false} />
        <Tooltip content={<GlassTooltip />} cursor={tooltipCursor} />
        <Bar dataKey="value" name="Keywords" radius={[6, 6, 0, 0]} maxBarSize={64}>
          {data.map((entry, index) => (
            <Cell key={entry.name} fill={colors[index % colors.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

type TooltipEntry = {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  payload?: { fill?: string; name?: string };
};

function TrendPeriodTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: { rangeLabel?: string; periodDays?: number | null; clicks?: number; impressions?: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="glass-tooltip">
      {point.rangeLabel ? <p className="gt-label">{point.rangeLabel}</p> : null}
      {point.periodDays ? <p className="gt-sub">{point.periodDays} days in this GSC import</p> : null}
      <div className="gt-row">
        <i style={{ background: '#4f663c' }} />
        <span>Clicks</span>
        <strong>{formatter.format(Number(point.clicks) || 0)}</strong>
      </div>
      <div className="gt-row">
        <i style={{ background: '#a1b887' }} />
        <span>Impressions</span>
        <strong>{formatter.format(Number(point.impressions) || 0)}</strong>
      </div>
    </div>
  );
}

function PageClicksTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: { fullPath?: string; name?: string }; value?: number; color?: string }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  return (
    <div className="glass-tooltip">
      {point?.fullPath ? <p className="gt-label">{point.fullPath}</p> : null}
      <div className="gt-row">
        <i style={{ background: payload[0]?.color || '#4f663c' }} />
        <span>Clicks</span>
        <strong>{formatter.format(Number(payload[0]?.value) || 0)}</strong>
      </div>
    </div>
  );
}

function GlassTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-tooltip">
      {label ? <p className="gt-label">{label}</p> : null}
      {payload.map((entry, index) => (
        <div className="gt-row" key={`${entry.dataKey ?? entry.name ?? index}`}>
          <i style={{ background: entry.color || entry.payload?.fill || '#4f663c' }} />
          <span>{entry.name || entry.payload?.name}</span>
          <strong>{formatter.format(Number(entry.value) || 0)}</strong>
        </div>
      ))}
    </div>
  );
}

const tooltipCursor = { fill: 'rgba(79,107,255,0.06)' };

function healthColor(value: number) {
  if (value >= 78) return '#3f5733';
  if (value >= 58) return '#9a6b12';
  return '#a94436';
}

export function ClusterBarChart({ clusters }: { clusters: Cluster[] }) {
  const data = clusters.slice(0, 8).map((cluster) => ({
    name: cluster.cluster,
    posts: cluster.posts,
    pillars: cluster.pillars,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <XAxis dataKey="name" tick={AXIS} interval={0} angle={-18} textAnchor="end" height={56} />
        <YAxis tick={AXIS} allowDecimals={false} />
        <Tooltip content={<GlassTooltip />} cursor={tooltipCursor} />
        <Bar dataKey="posts" name="Posts" fill="#4f663c" radius={[6, 6, 0, 0]} maxBarSize={42} />
        <Bar dataKey="pillars" name="Pillars" fill="#a1b887" radius={[6, 6, 0, 0]} maxBarSize={42} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ClusterDonut({ clusters }: { clusters: Cluster[] }) {
  const top = clusters.slice(0, 6);
  const rest = clusters.slice(6);
  const data = [
    ...top.map((cluster) => ({ name: cluster.cluster, value: cluster.posts })),
    ...(rest.length ? [{ name: 'Other', value: rest.reduce((sum, c) => sum + c.posts, 0) }] : []),
  ].filter((entry) => entry.value > 0);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={56}
          outerRadius={92}
          paddingAngle={2}
          stroke="none"
        >
          {data.map((entry, index) => (
            <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip content={<GlassTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ChartLegend({ clusters }: { clusters: Cluster[] }) {
  const top = clusters.slice(0, 6);
  const rest = clusters.slice(6);
  const entries = [
    ...top.map((cluster, index) => ({ name: cluster.cluster, value: cluster.posts, color: PALETTE[index % PALETTE.length] })),
    ...(rest.length
      ? [{ name: 'Other', value: rest.reduce((sum, c) => sum + c.posts, 0), color: PALETTE[6 % PALETTE.length] }]
      : []),
  ];

  return (
    <div className="chart-legend">
      {entries.map((entry) => (
        <span key={entry.name}>
          <i style={{ background: entry.color }} />
          {entry.name}
          <strong>{formatter.format(entry.value)}</strong>
        </span>
      ))}
    </div>
  );
}

export function PillarInboundChart({ pillars }: { pillars: Pillar[] }) {
  const data = pillars
    .slice(0, 10)
    .map((pillar) => ({
      name: pillar.title.length > 28 ? `${pillar.title.slice(0, 27)}…` : pillar.title,
      inbound: pillar.inboundCount,
    }))
    .reverse();

  const maxInbound = Math.max(12, ...data.map((entry) => entry.inbound));

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <XAxis type="number" domain={[0, maxInbound]} tick={AXIS} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={AXIS} width={150} />
        <Tooltip content={<GlassTooltip />} cursor={tooltipCursor} />
        <Bar dataKey="inbound" name="Inbound links" radius={[0, 6, 6, 0]} maxBarSize={20}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={inboundBarColor(entry.inbound)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SearchTrendChart({
  trend,
  activeStart,
  activeEnd,
}: {
  trend: SearchTrendPoint[];
  activeStart?: string;
  activeEnd?: string;
}) {
  if (!trend.length) {
    return <p className="dash-empty">Import Search Console data to see search performance.</p>;
  }

  // A trend needs at least two distinct reporting periods. With one period (the common
  // case until a second month/window is imported) a 2-bar chart is misleading, so show
  // a clear single-period summary instead.
  if (trend.length < 2) {
    const point = trend[0];
    return (
      <div className="single-period-summary">
        <p className="single-period-range">{formatDateRange(point.startDate, point.endDate)}</p>
        <div className="single-period-stats">
          <div>
            <span>Clicks</span>
            <strong>{formatCompact(point.totalClicks)}</strong>
          </div>
          <div>
            <span>Impressions</span>
            <strong>{formatCompact(point.totalImpressions)}</strong>
          </div>
          <div>
            <span>Avg position</span>
            <strong>{formatPosition(point.averagePosition)}</strong>
          </div>
          <div>
            <span>CTR</span>
            <strong>{formatPercent(point.averageCtr)}</strong>
          </div>
        </div>
        <p className="single-period-note">
          A clicks-and-impressions trend line appears here once a second reporting period is imported (for example,
          next month&rsquo;s Search Console data).
        </p>
      </div>
    );
  }

  const data = trend.map((point) => ({
    label: formatShortPeriod(point.startDate, point.endDate),
    rangeLabel: formatDateRange(point.startDate, point.endDate),
    periodDays: periodDayCount(point.startDate, point.endDate),
    clicks: point.totalClicks,
    impressions: point.totalImpressions,
    active: point.startDate === activeStart && point.endDate === activeEnd,
  }));

  return (
    <div className="search-trend-chart">
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: -4, bottom: 0 }}>
          <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" />
          <YAxis
            yAxisId="clicks"
            tick={AXIS}
            tickFormatter={(value) => formatCompact(Number(value))}
            width={48}
          />
          <YAxis
            yAxisId="impressions"
            orientation="right"
            tick={AXIS}
            tickFormatter={(value) => formatCompact(Number(value))}
            width={52}
          />
          <Tooltip content={<TrendPeriodTooltip />} />
          <Bar
            yAxisId="clicks"
            dataKey="clicks"
            name="Clicks"
            fill="#4f663c"
            radius={[4, 4, 0, 0]}
            maxBarSize={42}
          >
            {data.map((entry) => (
              <Cell key={entry.label} fill={entry.active ? '#4f663c' : '#a1b887'} />
            ))}
          </Bar>
          <Line
            yAxisId="impressions"
            type="monotone"
            dataKey="impressions"
            name="Impressions"
            stroke="#a1b887"
            strokeWidth={2}
            dot={{ r: 3, fill: '#a1b887' }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="search-trend-legend">
        <span>
          <i className="clicks" /> Clicks
        </span>
        <span>
          <i className="impressions" /> Impressions
        </span>
      </div>
    </div>
  );
}

const DAILY_RANGES: Array<{ id: string; label: string; days: number }> = [
  { id: '7', label: '7d', days: 7 },
  { id: '28', label: '28d', days: 28 },
  { id: '90', label: '90d', days: 90 },
  { id: 'all', label: 'All', days: 9999 },
];

export function SearchDailyChart({ daily }: { daily: SearchDailyPoint[] }) {
  const [range, setRange] = useState('28');
  const days = DAILY_RANGES.find((r) => r.id === range)?.days ?? 28;
  const sliced = days >= daily.length ? daily : daily.slice(-days);
  const data = sliced.map((point) => ({
    date: point.date,
    label: formatDayLabel(point.date),
    clicks: point.clicks,
    impressions: point.impressions,
  }));

  return (
    <div className="search-trend-chart">
      <div className="seg-toggle daily-range-toggle">
        {DAILY_RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            className={range === r.id ? 'active' : ''}
            onClick={() => setRange(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={250}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: -4, bottom: 0 }}>
          <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={28} />
          <YAxis
            yAxisId="clicks"
            tick={AXIS}
            tickFormatter={(value) => formatCompact(Number(value))}
            width={48}
          />
          <YAxis
            yAxisId="impressions"
            orientation="right"
            tick={AXIS}
            tickFormatter={(value) => formatCompact(Number(value))}
            width={52}
          />
          <Tooltip content={<DailyTrendTooltip />} />
          <Line
            yAxisId="impressions"
            type="monotone"
            dataKey="impressions"
            name="Impressions"
            stroke="#a1b887"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            yAxisId="clicks"
            type="monotone"
            dataKey="clicks"
            name="Clicks"
            stroke="#4f663c"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="search-trend-legend">
        <span>
          <i className="clicks" /> Clicks
        </span>
        <span>
          <i className="impressions" /> Impressions
        </span>
      </div>
    </div>
  );
}

function formatDayLabel(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function DailyTrendTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { date: string; clicks: number; impressions: number } }> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="glass-tooltip">
      <strong>{formatDayLabel(point.date)}</strong>
      <span>{formatter.format(point.clicks)} clicks</span>
      <span>{formatter.format(point.impressions)} impressions</span>
    </div>
  );
}

export function CtrPositionScatter({ rows }: { rows: SearchOpportunity[] }) {
  const data = rows
    .filter((r) => r.position > 0 && r.position <= 50 && r.impressions > 0)
    .slice(0, 140)
    .map((r) => ({
      x: Math.round(r.position * 10) / 10,
      y: Math.round(r.ctr * 1000) / 10,
      label: r.query || r.label,
      impressions: r.impressions,
    }));
  if (data.length < 3) {
    return <p className="dash-empty">Not enough query data to plot yet.</p>;
  }
  return (
    <div className="search-trend-chart">
      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 16 }}>
          <XAxis type="number" dataKey="x" name="Position" domain={[1, 50]} tick={AXIS} label={{ value: 'Position (1 = best)', position: 'insideBottom', offset: -8, fontSize: 11, fill: '#7a876e' }} />
          <YAxis type="number" dataKey="y" name="CTR" unit="%" tick={AXIS} width={40} />
          <ZAxis type="number" dataKey="impressions" range={[30, 320]} name="Impressions" />
          <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter data={data} fill="#4f663c" fillOpacity={0.6} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function ScatterTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { label: string; x: number; y: number; impressions: number } }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="glass-tooltip">
      <strong>{p.label}</strong>
      <span>Position #{p.x}</span>
      <span>{p.y}% CTR</span>
      <span>{formatter.format(p.impressions)} impressions</span>
    </div>
  );
}

export function RankTrendChart({ keywords }: { keywords: TrackedKeyword[] }) {
  const byDate = new Map<string, { sum: number; n: number }>();
  for (const kw of keywords) {
    for (const point of kw.trend || []) {
      if (point.position == null) continue;
      const date = (point.fetchedAt || '').slice(0, 10);
      if (!date) continue;
      const cur = byDate.get(date) || { sum: 0, n: 0 };
      cur.sum += point.position;
      cur.n += 1;
      byDate.set(date, cur);
    }
  }
  const data = [...byDate.entries()]
    .map(([date, v]) => ({ date, label: formatDayLabel(date), position: Math.round((v.sum / v.n) * 10) / 10 }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (data.length < 2) {
    return <p className="dash-empty">Track keywords over a few weeks to see average rank trend.</p>;
  }
  return (
    <div className="search-trend-chart">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={28} />
          <YAxis reversed domain={[1, 'dataMax']} allowDecimals={false} tick={AXIS} width={36} />
          <Tooltip content={<GlassTooltip />} />
          <Line type="monotone" dataKey="position" name="Avg position" stroke="#4f663c" strokeWidth={2.5} dot={{ r: 3, fill: '#4f663c' }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
      <p className="chart-footnote">Lower is better — the axis is flipped so improving ranks rise.</p>
    </div>
  );
}

export function RankSparkline({ trend }: { trend: Array<{ position?: number | null; fetchedAt: string }> }) {
  const values = (trend || [])
    .filter((p) => p.position != null)
    .slice(-12)
    .map((p) => Number(p.position));
  if (values.length < 2) return <span className="spark-empty">—</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 78;
  const h = 22;
  const pad = 3;
  const stepX = (w - pad * 2) / (values.length - 1);
  // Lower position is better → flip so improvements rise.
  const coords = values.map((v, i) => ({
    x: pad + i * stepX,
    y: pad + ((v - min) / range) * (h - pad * 2),
  }));
  const improved = values[values.length - 1] <= values[0];
  const color = improved ? '#4f663c' : '#a94436';
  const last = coords[coords.length - 1];
  return (
    <svg className="rank-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Rank trend">
      <polyline
        points={coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last.x} cy={last.y} r={2.4} fill={color} />
    </svg>
  );
}

export function PositionBucketTrend({ keywords }: { keywords: TrackedKeyword[] }) {
  const byDate = new Map<string, { top3: number; page1: number; page2: number; rest: number }>();
  for (const kw of keywords) {
    for (const point of kw.trend || []) {
      if (point.position == null) continue;
      const date = (point.fetchedAt || '').slice(0, 10);
      if (!date) continue;
      const bucket = byDate.get(date) || { top3: 0, page1: 0, page2: 0, rest: 0 };
      const pos = Number(point.position);
      if (pos <= 3) bucket.top3 += 1;
      else if (pos <= 10) bucket.page1 += 1;
      else if (pos <= 20) bucket.page2 += 1;
      else bucket.rest += 1;
      byDate.set(date, bucket);
    }
  }
  const data = [...byDate.entries()]
    .map(([date, bucket]) => ({ date, label: formatDayLabel(date), ...bucket }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (data.length < 2) {
    return <p className="dash-empty">This stacks up once tracked keywords have a few weeks of SERP history.</p>;
  }
  return (
    <div className="search-trend-chart">
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={28} />
          <YAxis allowDecimals={false} tick={AXIS} width={32} />
          <Tooltip content={<GlassTooltip />} />
          <Area type="monotone" dataKey="top3" stackId="1" name="Top 3" stroke="#2d3b23" fill="#2d3b23" fillOpacity={0.85} />
          <Area type="monotone" dataKey="page1" stackId="1" name="Page 1 (4–10)" stroke="#4f663c" fill="#4f663c" fillOpacity={0.8} />
          <Area type="monotone" dataKey="page2" stackId="1" name="Page 2 (11–20)" stroke="#a1b887" fill="#a1b887" fillOpacity={0.8} />
          <Area type="monotone" dataKey="rest" stackId="1" name="21+" stroke="#d7dfce" fill="#d7dfce" fillOpacity={0.8} />
          <Legend verticalAlign="bottom" height={30} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AuditIssuesDonut({ byType, labels }: { byType: Record<string, number>; labels?: Record<string, string> }) {
  const data = Object.entries(byType || {})
    .map(([type, value]) => ({ name: labels?.[type] || type, value: Number(value) || 0 }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
  if (!data.length) {
    return <p className="dash-empty">No issues to chart — nice work.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={54} outerRadius={92} paddingAngle={2} stroke="none">
          {data.map((entry, index) => (
            <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip content={<GlassTooltip />} />
        <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function CoreWebVitalsTrend({ history }: { history: PageSpeedHistoryPoint[] }) {
  const data = (history || []).map((h) => ({
    date: h.date,
    label: formatDayLabel(h.date),
    performance: h.performance,
    lcp: h.lcpMs != null ? Math.round(h.lcpMs / 100) / 10 : null,
  }));
  if (data.length < 2) {
    return <p className="dash-empty">Core Web Vitals trend appears after the weekly check runs a few times.</p>;
  }
  return (
    <div className="search-trend-chart">
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={28} />
          <YAxis yAxisId="score" domain={[0, 100]} tick={AXIS} width={36} />
          <YAxis yAxisId="lcp" orientation="right" tick={AXIS} width={40} unit="s" />
          <Tooltip content={<GlassTooltip />} />
          <Line yAxisId="score" type="monotone" dataKey="performance" name="Performance" stroke="#4f663c" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
          <Line yAxisId="lcp" type="monotone" dataKey="lcp" name="LCP (s)" stroke="#9a6b12" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="search-trend-legend">
        <span><i style={{ background: '#4f663c' }} /> Performance score</span>
        <span><i style={{ background: '#9a6b12' }} /> LCP (seconds)</span>
      </div>
    </div>
  );
}

export function SearchClicksChart({ pages }: { pages: SearchOpportunity[] }) {
  const data = pages
    .slice(0, 8)
    .map((page) => {
      const fullPath = shortUrl(page.page || page.label);
      return {
        name: chartPageLabel(page.page || page.label),
        fullPath,
        clicks: page.clicks,
        impressions: page.impressions,
      };
    })
    .reverse();

  const yAxisWidth = Math.min(
    220,
    Math.max(132, ...data.map((row) => Math.min(row.name.length, 28) * 7)),
  );

  return (
    <div className="chart-scroll chart-scroll-pages">
      <ResponsiveContainer width="100%" height={Math.max(240, data.length * 40)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 4 }}>
          <XAxis type="number" tick={AXIS} tickFormatter={(value) => formatCompact(Number(value))} />
          <YAxis type="category" dataKey="name" tick={AXIS} width={yAxisWidth} />
          <Tooltip content={<PageClicksTooltip />} cursor={tooltipCursor} />
          <Bar dataKey="clicks" name="Clicks" fill="#4f663c" radius={[0, 6, 6, 0]} maxBarSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
