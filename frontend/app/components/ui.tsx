'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
import type { Thresholds, Tone } from '../lib/types';

export const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-emerald-400',
  warn: 'text-amber-400',
  crit: 'text-rose-400',
  info: 'text-sky-400',
  muted: 'text-slate-400',
};

export const TONE_HEX: Record<Tone, string> = {
  ok: '#34d399',
  warn: '#fbbf24',
  crit: '#fb7185',
  info: '#38bdf8',
  muted: '#64748b',
};

const TONE_BADGE: Record<Tone, string> = {
  ok: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  warn: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  crit: 'border-rose-400/30 bg-rose-400/10 text-rose-300',
  info: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
  muted: 'border-white/10 bg-white/5 text-slate-300',
};

/** Returns a tone from a value and the warning / critical thresholds of a metric. */
export function toneFor(value: number | null | undefined, key: string, thresholds: Thresholds | null): Tone {
  if (value === null || value === undefined || !thresholds || !thresholds[key]) return 'muted';
  if (value >= thresholds[key].critical) return 'crit';
  if (value >= thresholds[key].warning) return 'warn';
  return 'ok';
}

/** Current time in ms, refreshed on an interval. Null until mounted (avoids hydration mismatch). */
export function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
}

export function Card({
  title,
  icon,
  right,
  children,
  className = '',
}: {
  title?: string;
  icon?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-[0_0_40px_-20px_rgba(56,189,248,0.25)] backdrop-blur-sm ${className}`}
    >
      {title && (
        <header className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-300/80">
            {icon}
            {title}
          </h2>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Badge({ tone = 'muted', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${TONE_BADGE[tone]}`}
    >
      {children}
    </span>
  );
}

/** A number that glides to its new value instead of jumping. */
export function AnimatedNumber({ value, decimals = 0, className = '' }: { value: number | null; decimals?: number; className?: string }) {
  const spring = useSpring(value ?? 0, { stiffness: 120, damping: 20 });
  const text = useTransform(spring, (v) => v.toFixed(decimals));
  useEffect(() => {
    if (value !== null) spring.set(value);
  }, [value, spring]);
  if (value === null) return <span className={className}>–</span>;
  return <motion.span className={className}>{text}</motion.span>;
}

/**
 * Tiny trend line. Pass `min`/`max` for a fixed domain (e.g. 0-100 for percentages) and `minSpan`
 * so that harmless jitter on a flat metric does not look like a dramatic swing.
 */
export function Sparkline({
  data,
  color = '#38bdf8',
  height = 36,
  min: fixedMin,
  max: fixedMax,
  minSpan = 0,
}: {
  data: number[];
  color?: string;
  height?: number;
  min?: number;
  max?: number;
  minSpan?: number;
}) {
  const gradientId = useId();
  if (data.length < 2) return <div style={{ height }} />;
  let min = fixedMin ?? Math.min(...data);
  let max = fixedMax ?? Math.max(...data);
  if (max - min < minSpan) {
    const mid = (max + min) / 2;
    min = mid - minSpan / 2;
    max = mid + minSpan / 2;
  }
  const span = max - min || 1;
  const width = 120;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - 3 - ((v - min) / span) * (height - 6)}`);
  const line = points.join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${line} ${width},${height}`} fill={`url(#${gradientId})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="flex min-h-24 items-center justify-center text-center text-sm text-slate-500">{children}</div>;
}
