'use client';

import { CheckCircle2, CircleSlash, Server, SlidersHorizontal } from 'lucide-react';
import { getApiBase } from '../lib/api';
import { fmtBytesPerSec, fmtDuration } from '../lib/format';
import type { AiStatus, Summary, Telemetry, Thresholds, Tone } from '../lib/types';
import { Badge, Card } from './ui';

const LABELS: Record<string, string> = {
  cpu_pct: 'CPU utilisation (%)',
  mem_pct: 'Memory utilisation (%)',
  disk_pct: 'Disk utilisation (%)',
  db_latency_ms: 'Database latency (ms)',
  loop_lag_ms: 'Event-loop lag (ms)',
};

const MEASURED = [
  'CPU, memory, disk and load average of the host running the backend',
  'Network throughput of the backend container (Linux only)',
  'Real PostgreSQL round-trip latency and reachability',
  'Backend event-loop lag and process uptime',
  'Browser-to-server round trip, measured with a Socket.IO acknowledgement',
];

const NOT_MEASURED = [
  'Multi-region failover: this build runs a single instance, nothing is simulated',
  'Packet loss: not measurable from a browser, so it is not displayed',
  'Per-container metrics: would require mounting the Docker socket',
];

export function InfraView({ telemetry: t, thresholds, ai, summary }: { telemetry: Telemetry | null; thresholds: Thresholds | null; ai: AiStatus | null; summary: Summary | null }) {
  const services: { name: string; tone: Tone; state: string; detail: string }[] = [
    { name: 'Backend API', tone: t ? 'ok' : 'muted', state: t ? 'running' : 'waiting', detail: t ? `uptime ${fmtDuration(t.process_uptime_s)} · ${t.sockets} client(s)` : '–' },
    { name: 'PostgreSQL', tone: !t ? 'muted' : t.db_ok ? 'ok' : 'crit', state: !t ? 'waiting' : t.db_ok ? 'reachable' : 'unreachable', detail: t?.db_latency_ms != null ? `${t.db_latency_ms} ms round trip` : '–' },
    { name: 'AI provider', tone: !ai ? 'muted' : ai.state === 'ok' ? 'ok' : ai.state === 'degraded' ? 'warn' : ai.state === 'untested' ? 'info' : 'muted', state: ai?.state === 'disabled' ? 'not configured' : (ai?.state ?? 'waiting'), detail: ai ? `${ai.model ?? 'no model'} · ${ai.callsLastHour}/${ai.maxCallsPerHour} calls this hour${ai.reason ? ` · ${ai.reason}` : ''}` : '–' },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Host" icon={<Server size={14} />}>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          {[
            ['CPU cores', t?.cores ?? '–'],
            ['Memory', t ? `${t.mem_used_mb} / ${t.mem_total_mb} MB` : '–'],
            ['Host uptime', t ? fmtDuration(t.host_uptime_s) : '–'],
            ['Network in', fmtBytesPerSec(t?.net_rx_bps)],
            ['Network out', fmtBytesPerSec(t?.net_tx_bps)],
            ['Retention', summary ? `${summary.retention_days} days` : '–'],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-xl border border-white/5 bg-black/20 px-3 py-2">
              <dt className="text-[10px] uppercase tracking-wider text-slate-500">{label as string}</dt>
              <dd className="mt-0.5 font-mono text-slate-200">{value as string | number}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 break-all text-[11px] text-slate-600">API endpoint: {getApiBase()}</p>
      </Card>

      <Card title="Services">
        <ul className="space-y-2">
          {services.map((s) => (
            <li key={s.name} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-2.5">
              <div>
                <div className="text-sm font-medium text-slate-100">{s.name}</div>
                <div className="text-[11px] text-slate-500">{s.detail}</div>
              </div>
              <Badge tone={s.tone}>{s.state}</Badge>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Alert thresholds" icon={<SlidersHorizontal size={14} />}>
        <table className="w-full text-left text-sm">
          <thead className="text-[10px] uppercase tracking-wider text-slate-500">
            <tr><th className="pb-2 font-medium">Metric</th><th className="pb-2 text-right font-medium text-amber-300/80">Warning</th><th className="pb-2 text-right font-medium text-rose-300/80">Critical</th></tr>
          </thead>
          <tbody>
            {thresholds && Object.entries(thresholds).map(([key, th]) => (
              <tr key={key} className="border-t border-white/5">
                <td className="py-2 text-slate-300">{LABELS[key] ?? key}</td>
                <td className="py-2 text-right font-mono text-slate-300">≥ {th.warning}</td>
                <td className="py-2 text-right font-mono text-slate-300">≥ {th.critical}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">An alert opens after 3 consecutive breaching samples and resolves after 5 consecutive healthy ones. Repeated breaches merge into the open alert.</p>
      </Card>

      <Card title="What this dashboard measures">
        <ul className="space-y-1.5 text-[13px] text-slate-300">
          {MEASURED.map((m) => (<li key={m} className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-400" />{m}</li>))}
        </ul>
        <h3 className="mb-1.5 mt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Not part of this build</h3>
        <ul className="space-y-1.5 text-[13px] text-slate-400">
          {NOT_MEASURED.map((m) => (<li key={m} className="flex gap-2"><CircleSlash size={14} className="mt-0.5 shrink-0 text-slate-500" />{m}</li>))}
        </ul>
      </Card>
    </div>
  );
}
