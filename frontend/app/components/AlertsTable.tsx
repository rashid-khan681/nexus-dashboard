'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { apiGet } from '../lib/api';
import { timeAgo } from '../lib/format';
import type { Alert, AlertStatus, Severity, Summary, Tone } from '../lib/types';
import { Badge, Card, EmptyState, useNow } from './ui';

const PAGE_SIZE = 8;

export const SEVERITY_TONE: Record<Severity, Tone> = { warning: 'warn', critical: 'crit' };
export const STATUS_TONE: Record<AlertStatus, Tone> = { open: 'crit', acknowledged: 'warn', resolved: 'ok' };

interface Page {
  total: number;
  items: Alert[];
}

export function AlertsTable({
  refreshKey,
  onSelect,
  summary,
  compact = false,
}: {
  refreshKey: number;
  onSelect: (alert: Alert) => void;
  summary: Summary | null;
  compact?: boolean;
}) {
  const now = useNow(5000);
  const [status, setStatus] = useState<'' | AlertStatus>('');
  const [severity, setSeverity] = useState<'' | Severity>('');
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ limit: String(compact ? 5 : PAGE_SIZE), offset: String(offset) });
    if (status) query.set('status', status);
    if (severity) query.set('severity', severity);
    const load = () =>
      apiGet<Page>(`/api/alerts?${query}`, controller.signal)
        .then((p) => {
          setPage(p);
          setError(null);
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
  }, [status, severity, offset, refreshKey, compact]);

  const size = compact ? 5 : PAGE_SIZE;
  const total = page?.total ?? 0;
  const noise = summary?.noise_reduction_24h;

  const select = 'rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-slate-300 outline-none focus:border-sky-400/50';

  return (
    <Card
      title="Alerts"
      icon={<Bell size={14} />}
      right={
        !compact && (
          <div className="flex gap-2">
            <select aria-label="Filter by status" className={select} value={status} onChange={(e) => { setStatus(e.target.value as '' | AlertStatus); setOffset(0); }}>
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
            </select>
            <select aria-label="Filter by severity" className={select} value={severity} onChange={(e) => { setSeverity(e.target.value as '' | Severity); setOffset(0); }}>
              <option value="">All severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
            </select>
          </div>
        )
      }
    >
      {noise && noise.alerts_24h > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-[12px] text-emerald-200">
          <Layers size={14} />
          <span>
            Last 24h: <b className="font-mono">{noise.breach_samples_24h}</b> threshold breaches merged into <b className="font-mono">{noise.alerts_24h}</b> alert{noise.alerts_24h === 1 ? '' : 's'} (deduplication + hysteresis).
          </span>
        </div>
      )}

      {error ? (
        <EmptyState>Could not load alerts: {error}</EmptyState>
      ) : !page ? (
        <EmptyState>Loading alerts…</EmptyState>
      ) : page.items.length === 0 ? (
        <EmptyState>No alerts match this filter. Thresholds are evaluated every 2 seconds.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="pb-2 font-medium">Severity</th>
                <th className="pb-2 font-medium">Alert</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 text-right font-medium">Peak</th>
                <th className="pb-2 text-right font-medium">Merged</th>
                <th className="pb-2 text-right font-medium">Opened</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((a) => (
                <motion.tr
                  key={String(a.id)}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => onSelect(a)}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && onSelect(a)}
                  className="cursor-pointer border-t border-white/5 transition hover:bg-white/[0.04] focus:bg-white/[0.06] focus:outline-none"
                >
                  <td className="py-2.5 pr-3"><Badge tone={SEVERITY_TONE[a.severity]}>{a.severity}</Badge></td>
                  <td className="py-2.5 pr-3">
                    <div className="font-medium text-slate-100">{a.title}</div>
                    <div className="max-w-md truncate text-[11px] text-slate-500">{a.message}</div>
                  </td>
                  <td className="py-2.5 pr-3">
                    <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>
                    {a.analysis_source && <span className="ml-1.5 text-[10px] text-slate-500">{a.analysis_source === 'gemini' ? 'AI' : 'rules'}</span>}
                  </td>
                  <td className="py-2.5 text-right font-mono text-slate-300">{a.peak_value ?? '–'}</td>
                  <td className="py-2.5 text-right font-mono text-slate-300">×{a.occurrences}</td>
                  <td className="py-2.5 text-right text-[12px] text-slate-400">{timeAgo(a.opened_at, now)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!compact && total > size && (
        <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
          <span>{offset + 1}–{Math.min(offset + size, total)} of {total}</span>
          <div className="flex gap-1">
            <button aria-label="Previous page" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - size))} className="rounded-md border border-white/10 p-1 disabled:opacity-30"><ChevronLeft size={14} /></button>
            <button aria-label="Next page" disabled={offset + size >= total} onClick={() => setOffset(offset + size)} className="rounded-md border border-white/10 p-1 disabled:opacity-30"><ChevronRight size={14} /></button>
          </div>
        </div>
      )}
    </Card>
  );
}
