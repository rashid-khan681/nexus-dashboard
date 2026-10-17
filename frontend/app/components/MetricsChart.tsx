'use client';

import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LineChart as LineChartIcon } from 'lucide-react';
import { apiGet } from '../lib/api';
import type { MetricPoint, Thresholds } from '../lib/types';
import { Card, EmptyState } from './ui';

const RANGES = ['15m', '1h', '6h', '24h', '7d'] as const;
type Range = (typeof RANGES)[number];

interface Series {
  key: keyof MetricPoint;
  name: string;
  color: string;
}

interface Group {
  id: string;
  label: string;
  unit: string;
  series: Series[];
  threshold?: string;
  scale?: number;
}

const GROUPS: Group[] = [
  {
    id: 'cpu_mem', label: 'CPU & memory', unit: '%', threshold: 'cpu_pct',
    series: [
      { key: 'cpu_avg', name: 'CPU %', color: '#38bdf8' },
      { key: 'mem_avg', name: 'Memory %', color: '#a78bfa' },
    ],
  },
  {
    id: 'db', label: 'Database latency', unit: ' ms', threshold: 'db_latency_ms',
    series: [
      { key: 'db_latency_avg', name: 'Average', color: '#34d399' },
      { key: 'db_latency_max', name: 'Peak', color: '#fbbf24' },
    ],
  },
  {
    id: 'load', label: 'Load & clients', unit: '',
    series: [
      { key: 'load1', name: 'Load (1m)', color: '#f472b6' },
      { key: 'sockets', name: 'Clients', color: '#94a3b8' },
    ],
  },
  {
    id: 'net', label: 'Network', unit: ' KB/s', scale: 1024,
    series: [
      { key: 'net_rx_bps', name: 'Received', color: '#22d3ee' },
      { key: 'net_tx_bps', name: 'Sent', color: '#fb923c' },
    ],
  },
];

const tickFormat = (iso: string, range: Range) => {
  const d = new Date(iso);
  return range === '7d' || range === '24h'
    ? d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
};

export function MetricsChart({ thresholds, refreshKey }: { thresholds: Thresholds | null; refreshKey?: number }) {
  const [range, setRange] = useState<Range>('15m');
  const [groupId, setGroupId] = useState('cpu_mem');
  const [points, setPoints] = useState<MetricPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const group = GROUPS.find((g) => g.id === groupId) ?? GROUPS[0];

  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      apiGet<{ points: MetricPoint[] }>(`/api/metrics?range=${range}`, controller.signal)
        .then((r) => {
          setPoints(r.points);
          setError(null);
          setLoaded(true);
        })
        .catch((e: Error) => {
          if (e.name !== 'AbortError') setError(e.message);
        });
    load();
    const timer = setInterval(load, 10000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [range, refreshKey]);

  const data = useMemo(
    () =>
      points.map((p) => {
        const row: Record<string, number | string | null> = { t: p.t };
        for (const s of group.series) {
          const v = p[s.key] as number | null;
          row[s.key] = v === null || v === undefined ? null : group.scale ? Math.round((v / group.scale) * 10) / 10 : v;
        }
        return row;
      }),
    [points, group],
  );

  const hasData = data.some((row) => group.series.some((s) => row[s.key] !== null));
  const th = group.threshold && thresholds ? thresholds[group.threshold] : null;

  return (
    <Card
      title="History"
      icon={<LineChartIcon size={14} />}
      right={
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button key={r} onClick={() => setRange(r)} className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition ${r === range ? 'bg-sky-400/20 text-sky-200' : 'text-slate-500 hover:text-slate-300'}`}>
              {r}
            </button>
          ))}
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        {GROUPS.map((g) => (
          <button key={g.id} onClick={() => setGroupId(g.id)} className={`rounded-full border px-3 py-1 text-[11px] transition ${g.id === groupId ? 'border-sky-400/40 bg-sky-400/10 text-sky-200' : 'border-white/10 text-slate-400 hover:text-slate-200'}`}>
            {g.label}
          </button>
        ))}
      </div>

      <div className="h-64">
        {error ? (
          <EmptyState>Could not load history: {error}</EmptyState>
        ) : !loaded ? (
          <EmptyState>Loading history…</EmptyState>
        ) : !hasData ? (
          <EmptyState>{group.id === 'net' ? 'Network counters are not available on this host (Linux only).' : 'No samples in this range yet. Data is stored every 10 seconds.'}</EmptyState>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <defs>
                {group.series.map((s) => (
                  <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="t" tickFormatter={(v: string) => tickFormat(v, range)} stroke="#475569" fontSize={10} minTickGap={40} tickLine={false} />
              <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} domain={group.unit === '%' ? [0, 100] : [0, 'auto']} />
              <Tooltip
                contentStyle={{ background: '#070a14', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, fontSize: 12 }}
                labelFormatter={(v) => new Date(String(v)).toLocaleString('en-GB', { hour12: false })}
                formatter={(value, name) => [`${value ?? '–'}${group.unit}`, String(name)]}
              />
              {th && <ReferenceLine y={th.warning} stroke="#fbbf24" strokeDasharray="4 4" strokeOpacity={0.6} label={{ value: 'warning', fill: '#fbbf24', fontSize: 9, position: 'insideTopRight' }} />}
              {th && <ReferenceLine y={th.critical} stroke="#fb7185" strokeDasharray="4 4" strokeOpacity={0.7} label={{ value: 'critical', fill: '#fb7185', fontSize: 9, position: 'insideTopRight' }} />}
              {group.series.map((s) => (
                <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} fill={`url(#fill-${s.key})`} connectNulls dot={false} isAnimationActive={false} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-slate-400">
        {group.series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </Card>
  );
}
