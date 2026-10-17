'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Brain, Database, Globe, Network, Server } from 'lucide-react';
import { fmtDuration } from '../lib/format';
import type { AiStatus, Telemetry, Thresholds, Tone } from '../lib/types';
import { Badge, Card, TONE_HEX, toneFor } from './ui';

interface Props {
  telemetry: Telemetry | null;
  rtt: number[];
  ai: AiStatus | null;
  thresholds: Thresholds | null;
  connected: boolean;
}

interface NodeDef {
  id: string;
  x: number;
  y: number;
  label: string;
  sub: string;
  tone: Tone;
  icon: ReactNode;
}

const worst = (...tones: Tone[]): Tone => {
  if (tones.includes('crit')) return 'crit';
  if (tones.includes('warn')) return 'warn';
  if (tones.every((t) => t === 'muted')) return 'muted';
  return 'ok';
};

function Link({ x1, y1, x2, y2, tone, flowing, label }: { x1: number; y1: number; x2: number; y2: number; tone: Tone; flowing: boolean; label: string }) {
  const reduce = useReducedMotion();
  const color = TONE_HEX[tone];
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeOpacity="0.25" strokeWidth="2" />
      {flowing && !reduce ? (
        <motion.line
          x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="4 12"
          animate={{ strokeDashoffset: [0, -32] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
        />
      ) : (
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="2" strokeDasharray={flowing ? undefined : '3 6'} strokeOpacity={flowing ? 0.8 : 0.5} />
      )}
      <rect x={(x1 + x2) / 2 - 34} y={(y1 + y2) / 2 - 11} width="68" height="20" rx="10" fill="#070a14" stroke={color} strokeOpacity="0.4" />
      <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 + 3} textAnchor="middle" fontSize="10" fill={color} fontFamily="var(--font-geist-mono), monospace">
        {label}
      </text>
    </g>
  );
}

export function ServiceTopology({ telemetry: t, rtt, ai, thresholds, connected }: Props) {
  const reduce = useReducedMotion();
  const pulse = (tone: Tone) => !reduce && tone !== 'muted';
  const latestRtt = rtt.length ? rtt[rtt.length - 1] : null;
  const rttTone: Tone = !connected ? 'crit' : latestRtt === null ? 'muted' : latestRtt < 80 ? 'ok' : latestRtt < 200 ? 'warn' : 'crit';

  const backendTone = !t
    ? 'muted'
    : worst(toneFor(t.cpu_pct, 'cpu_pct', thresholds), toneFor(t.mem_pct, 'mem_pct', thresholds), toneFor(t.loop_lag_ms, 'loop_lag_ms', thresholds));
  const dbTone: Tone = !t ? 'muted' : !t.db_ok ? 'crit' : toneFor(t.db_latency_ms, 'db_latency_ms', thresholds);
  const aiTone: Tone = !ai ? 'muted' : ai.state === 'ok' ? 'ok' : ai.state === 'degraded' ? 'warn' : ai.state === 'untested' ? 'info' : 'muted';
  const aiLabel = !ai ? '–' : ai.state === 'disabled' ? 'rules only' : ai.state;

  const nodes: NodeDef[] = [
    { id: 'browser', x: 90, y: 125, label: 'Your browser', sub: connected ? 'live socket' : 'disconnected', tone: connected ? rttTone : 'crit', icon: <Globe size={26} /> },
    { id: 'api', x: 340, y: 125, label: 'Backend API', sub: t ? `CPU ${t.cpu_pct ?? '–'}% · up ${fmtDuration(t.process_uptime_s)}` : 'waiting…', tone: backendTone, icon: <Server size={26} /> },
    { id: 'db', x: 620, y: 62, label: 'PostgreSQL', sub: t ? (t.db_ok ? 'reachable' : 'unreachable') : '–', tone: dbTone, icon: <Database size={26} /> },
    { id: 'ai', x: 620, y: 188, label: 'AI provider', sub: ai?.model ?? 'not configured', tone: aiTone, icon: <Brain size={26} /> },
  ];
  const [browser, api, db, aiNode] = nodes;

  return (
    <Card
      title="Service topology"
      icon={<Network size={14} />}
      right={<Badge tone="info" title="Every node and link is measured from the running system">live measurements</Badge>}
    >
      <svg viewBox="0 0 740 250" className="w-full" role="img" aria-label="Live service topology">
        <Link x1={browser.x} y1={browser.y} x2={api.x} y2={api.y} tone={rttTone} flowing={connected} label={latestRtt === null ? '–' : `${Math.round(latestRtt)} ms`} />
        <Link x1={api.x} y1={api.y} x2={db.x} y2={db.y} tone={dbTone} flowing={!!t?.db_ok} label={t?.db_latency_ms == null ? 'down' : `${t.db_latency_ms} ms`} />
        <Link x1={api.x} y1={api.y} x2={aiNode.x} y2={aiNode.y} tone={aiTone} flowing={ai?.state === 'ok'} label={aiLabel} />

        {nodes.map((n) => {
          const color = TONE_HEX[n.tone];
          return (
            <g key={n.id}>
              <motion.circle
                cx={n.x} cy={n.y} r={40} fill="none" stroke={color} strokeOpacity={0.35}
                initial={false}
                animate={pulse(n.tone) ? { r: [40, 46, 40], strokeOpacity: [0.35, 0.05, 0.35] } : { r: 40, strokeOpacity: 0.35 }}
                transition={pulse(n.tone) ? { duration: n.tone === 'crit' ? 1 : 3, repeat: Infinity } : { duration: 0.2 }}
              />
              <circle cx={n.x} cy={n.y} r="34" fill="#0a1020" stroke={color} strokeWidth="2" />
              <foreignObject x={n.x - 16} y={n.y - 16} width="32" height="32">
                <div className="flex h-8 w-8 items-center justify-center" style={{ color }}>{n.icon}</div>
              </foreignObject>
              <text x={n.x} y={n.y + 58} textAnchor="middle" fontSize="12" fontWeight="600" fill="#e2e8f0">{n.label}</text>
              <text x={n.x} y={n.y + 73} textAnchor="middle" fontSize="10" fill="#64748b" fontFamily="var(--font-geist-mono), monospace">{n.sub}</text>
            </g>
          );
        })}
      </svg>
    </Card>
  );
}
