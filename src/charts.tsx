import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCompact, formatter, shortUrl } from './lib';
import type { Cluster, Pillar, SearchOpportunity, SearchTrendPoint } from './types';

const PALETTE = ['#4f663c', '#a1b887', '#2d3b23', '#9a6b12', '#5e6b52', '#8b9f72', '#a94436', '#64748b'];
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
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#eef1f8" strokeWidth={stroke} />
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
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#eef1f8" strokeWidth={stroke} />
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
            <path d="M0,0 L6,3 L0,6 Z" fill="#9db4ff" />
          </marker>
        </defs>
        {nodes.map((node) => (
          <line
            key={`line-${node.url}`}
            x1={node.lineStart.x}
            y1={node.lineStart.y}
            x2={node.lineEnd.x}
            y2={node.lineEnd.y}
            stroke="#c4d2ff"
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
  const colors = ['#0ea371', '#4f6bff', '#f59e0b', '#94a3b8'];
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
          <i style={{ background: entry.color || entry.payload?.fill || '#4f6bff' }} />
          <span>{entry.name || entry.payload?.name}</span>
          <strong>{formatter.format(Number(entry.value) || 0)}</strong>
        </div>
      ))}
    </div>
  );
}

const tooltipCursor = { fill: 'rgba(79,107,255,0.06)' };

function healthColor(value: number) {
  if (value >= 78) return '#0ea371';
  if (value >= 58) return '#f59e0b';
  return '#ef4444';
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
        <Bar dataKey="posts" name="Posts" fill="#4f6bff" radius={[6, 6, 0, 0]} maxBarSize={42} />
        <Bar dataKey="pillars" name="Pillars" fill="#0ea371" radius={[6, 6, 0, 0]} maxBarSize={42} />
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

export function HealthBarChart({ pillars }: { pillars: Pillar[] }) {
  const data = pillars
    .slice(0, 10)
    .map((pillar) => ({
      name: pillar.title.length > 28 ? `${pillar.title.slice(0, 27)}…` : pillar.title,
      health: pillar.health,
    }))
    .reverse();

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <XAxis type="number" domain={[0, 100]} tick={AXIS} />
        <YAxis type="category" dataKey="name" tick={AXIS} width={150} />
        <Tooltip content={<GlassTooltip />} cursor={tooltipCursor} />
        <Bar dataKey="health" name="Health" radius={[0, 6, 6, 0]} maxBarSize={20}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={healthColor(entry.health)} />
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
    return <p className="dash-empty">Import more weekly snapshots to see trends.</p>;
  }

  const data = trend.map((point) => ({
    label: point.label,
    clicks: point.totalClicks,
    impressions: point.totalImpressions,
    active: point.startDate === activeStart && point.endDate === activeEnd,
  }));

  return (
    <div className="search-trend-chart">
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
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
          <Tooltip content={<GlassTooltip />} />
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

export function SearchClicksChart({ pages }: { pages: SearchOpportunity[] }) {
  const data = pages
    .slice(0, 8)
    .map((page) => ({
      name: shortUrl(page.page || page.label),
      clicks: page.clicks,
      impressions: page.impressions,
    }))
    .reverse();

  return (
    <div className="chart-scroll">
      <ResponsiveContainer width="100%" height={Math.max(220, data.length * 36)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <XAxis type="number" tick={AXIS} tickFormatter={(value) => formatCompact(Number(value))} />
          <YAxis type="category" dataKey="name" tick={AXIS} width={110} />
          <Tooltip content={<GlassTooltip />} cursor={tooltipCursor} />
          <Bar dataKey="clicks" name="Clicks" fill="#4f663c" radius={[0, 6, 6, 0]} maxBarSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
