'use client';

import { useEffect } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
import { Wifi } from 'lucide-react';
import { percentile } from '../lib/format';
import type { Tone } from '../lib/types';
import { AnimatedNumber, Badge, Card, Sparkline, TONE_HEX, TONE_TEXT } from './ui';

const MAX_MS = 300;
const CX = 110;
const CY = 108;
const R = 88;

const ZONES: { from: number; to: number; tone: Tone }[] = [
  { from: 0, to: 80, tone: 'ok' },
  { from: 80, to: 200, tone: 'warn' },
  { from: 200, to: MAX_MS, tone: 'crit' },
];

const pointAt = (ms: number, radius: number) => {
  const theta = Math.PI - (Math.min(Math.max(ms, 0), MAX_MS) / MAX_MS) * Math.PI;
  return { x: CX + radius * Math.cos(theta), y: CY - radius * Math.sin(theta) };
};

const arcPath = (from: number, to: number) => {
  const a = pointAt(from, R);
  const b = pointAt(to, R);
  return `M ${a.x} ${a.y} A ${R} ${R} 0 0 1 ${b.x} ${b.y}`;
};

const toneOf = (ms: number | null): Tone => {
  if (ms === null) return 'muted';
  if (ms < 80) return 'ok';
  if (ms < 200) return 'warn';
  return 'crit';
};

const LABEL: Record<Tone, string> = { ok: 'Responsive', warn: 'Slow', crit: 'Very slow', info: '', muted: 'Measuring…' };

export function PingGauge({ rtt }: { rtt: number[] }) {
  const latest = rtt.length ? rtt[rtt.length - 1] : null;
  const tone = toneOf(latest);

  const spring = useSpring(0, { stiffness: 90, damping: 14, mass: 0.8 });
  useEffect(() => {
    if (latest !== null) spring.set(Math.min(latest, MAX_MS));
  }, [latest, spring]);
  const tipX = useTransform(spring, (v) => pointAt(v, R - 14).x);
  const tipY = useTransform(spring, (v) => pointAt(v, R - 14).y);

  return (
    <Card title="Network latency" icon={<Wifi size={14} />} right={<Badge tone={tone}>{LABEL[tone]}</Badge>}>
      <svg viewBox="0 0 220 128" className="mx-auto w-full max-w-[320px]" role="img" aria-label={`Round trip latency ${latest ?? 'unknown'} milliseconds`}>
        {ZONES.map((z) => {
          const active = latest !== null && latest >= z.from && (latest < z.to || z.to === MAX_MS);
          return (
            <path
              key={z.tone}
              d={arcPath(z.from, z.to)}
              fill="none"
              stroke={TONE_HEX[z.tone]}
              strokeWidth="11"
              strokeLinecap="butt"
              opacity={active ? 0.95 : 0.22}
              style={{ transition: 'opacity 400ms' }}
            />
          );
        })}
        {[0, 50, 100, 150, 200, 250, 300].map((ms) => {
          const inner = pointAt(ms, R - 10);
          const label = pointAt(ms, R + 12);
          return (
            <g key={ms}>
              <circle cx={inner.x} cy={inner.y} r="1" fill="#475569" />
              <text x={label.x} y={label.y + 2} textAnchor="middle" fontSize="7" fill="#64748b">
                {ms}
              </text>
            </g>
          );
        })}
        <motion.line x1={CX} y1={CY} x2={tipX} y2={tipY} stroke={TONE_HEX[tone]} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={CX} cy={CY} r="5" fill="#0b1020" stroke={TONE_HEX[tone]} strokeWidth="2" />
      </svg>

      <div className="-mt-6 text-center">
        <div className={`font-mono text-3xl font-bold tabular-nums ${TONE_TEXT[tone]}`}>
          <AnimatedNumber value={latest} decimals={latest !== null && latest < 10 ? 1 : 0} />
          <span className="ml-1 text-sm font-normal text-slate-500">ms</span>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">Browser ↔ server round trip (Socket.IO ack)</p>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        {[
          ['p50', percentile(rtt, 50)],
          ['p95', percentile(rtt, 95)],
          ['min', rtt.length ? Math.min(...rtt) : null],
          ['max', rtt.length ? Math.max(...rtt) : null],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-lg border border-white/5 bg-black/20 px-1 py-1.5">
            <div className="text-[9px] uppercase tracking-wider text-slate-500">{label as string}</div>
            <div className="font-mono text-xs text-slate-200">{value === null ? '–' : `${Math.round(value as number)} ms`}</div>
          </div>
        ))}
      </div>
      <div className="mt-2">
        <Sparkline data={rtt} color={TONE_HEX[tone]} height={30} minSpan={20} />
      </div>
    </Card>
  );
}
