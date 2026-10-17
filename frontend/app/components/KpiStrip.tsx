'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Bell, Cpu, Database, Gauge, HardDrive, MemoryStick, Users } from 'lucide-react';
import type { Alert, Telemetry, Thresholds, Tone } from '../lib/types';
import { AnimatedNumber, Sparkline, TONE_HEX, TONE_TEXT, toneFor } from './ui';

interface KpiProps {
  label: string;
  icon: ReactNode;
  value: number | null;
  decimals?: number;
  unit?: string;
  sub?: string;
  tone: Tone;
  series?: number[];
  pulse?: boolean;
  domain?: { min?: number; max?: number; minSpan?: number };
}

function Kpi({ label, icon, value, decimals = 0, unit, sub, tone, series, pulse, domain }: KpiProps) {
  return (
    <motion.div
      layout
      animate={pulse ? { boxShadow: ['0 0 0 0 rgba(251,113,133,0)', '0 0 22px 2px rgba(251,113,133,0.35)', '0 0 0 0 rgba(251,113,133,0)'] } : { boxShadow: '0 0 0 0 rgba(0,0,0,0)' }}
      transition={pulse ? { duration: 2, repeat: Infinity } : { duration: 0.3 }}
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"
    >
      <div className="flex items-center justify-between text-slate-400">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">{label}</span>
        <span className={TONE_TEXT[tone]}>{icon}</span>
      </div>
      <div className={`mt-1 font-mono text-2xl font-bold tabular-nums ${TONE_TEXT[tone]}`}>
        <AnimatedNumber value={value} decimals={decimals} />
        {unit && <span className="ml-0.5 text-xs font-normal text-slate-500">{unit}</span>}
      </div>
      <div className="mt-0.5 h-4 truncate text-[10px] text-slate-500">{sub}</div>
      <div className="mt-1">{series ? <Sparkline data={series} color={TONE_HEX[tone]} height={26} {...domain} /> : <div className="h-[26px]" />}</div>
    </motion.div>
  );
}

const series = (history: Telemetry[], pick: (t: Telemetry) => number | null): number[] =>
  history.map(pick).filter((v): v is number => v !== null).slice(-60);

export function KpiStrip({
  telemetry,
  history,
  thresholds,
  openAlerts,
}: {
  telemetry: Telemetry | null;
  history: Telemetry[];
  thresholds: Thresholds | null;
  openAlerts: Alert[];
}) {
  const t = telemetry;
  const critical = openAlerts.filter((a) => a.severity === 'critical').length;
  const alertTone: Tone = critical > 0 ? 'crit' : openAlerts.length > 0 ? 'warn' : 'ok';

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
      <Kpi label="CPU" icon={<Cpu size={14} />} value={t?.cpu_pct ?? null} decimals={1} unit="%" sub={t ? `${t.cores} cores` : undefined} tone={toneFor(t?.cpu_pct, 'cpu_pct', thresholds)} series={series(history, (h) => h.cpu_pct)} domain={{ min: 0, max: 100 }} />
      <Kpi label="Memory" icon={<MemoryStick size={14} />} value={t?.mem_pct ?? null} decimals={1} unit="%" sub={t ? `${t.mem_used_mb} / ${t.mem_total_mb} MB` : undefined} tone={toneFor(t?.mem_pct, 'mem_pct', thresholds)} series={series(history, (h) => h.mem_pct)} domain={{ min: 0, max: 100 }} />
      <Kpi label="Disk" icon={<HardDrive size={14} />} value={t?.disk_pct ?? null} decimals={1} unit="%" sub="root filesystem" tone={toneFor(t?.disk_pct, 'disk_pct', thresholds)} series={series(history, (h) => h.disk_pct)} domain={{ min: 0, max: 100 }} />
      <Kpi label="DB latency" icon={<Database size={14} />} value={t?.db_latency_ms ?? null} decimals={1} unit="ms" sub={t ? (t.db_ok ? 'PostgreSQL reachable' : 'PostgreSQL unreachable') : undefined} tone={t && !t.db_ok ? 'crit' : toneFor(t?.db_latency_ms, 'db_latency_ms', thresholds)} series={series(history, (h) => h.db_latency_ms)} domain={{ minSpan: 10 }} />
      <Kpi label="Load (1m)" icon={<Gauge size={14} />} value={t?.load1 ?? null} decimals={2} sub={t ? `per core ${(t.load1 / Math.max(1, t.cores)).toFixed(2)}` : undefined} tone="info" series={series(history, (h) => h.load1)} domain={{ minSpan: 1 }} />
      <Kpi label="Clients" icon={<Users size={14} />} value={t?.sockets ?? null} sub="live dashboards" tone="info" series={series(history, (h) => h.sockets)} domain={{ minSpan: 2 }} />
      <Kpi label="Open alerts" icon={<Bell size={14} />} value={openAlerts.length} sub={critical > 0 ? `${critical} critical` : openAlerts.length ? 'warnings only' : 'all clear'} tone={alertTone} pulse={critical > 0} />
    </div>
  );
}
