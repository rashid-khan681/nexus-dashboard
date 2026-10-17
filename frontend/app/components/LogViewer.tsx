'use client';

import { useEffect, useMemo, useState } from 'react';
import { Radio, ScrollText, Search } from 'lucide-react';
import { apiGet } from '../lib/api';
import { fmtClock } from '../lib/format';
import type { LogEvent, Tone } from '../lib/types';
import { Badge, Card, EmptyState } from './ui';

const LEVEL_TONE: Record<LogEvent['level'], Tone> = { debug: 'muted', info: 'info', warn: 'warn', error: 'crit' };
const PAGE = 50;

interface LogPage {
  items: LogEvent[];
  next_before: number | null;
}

export function LogViewer({ liveEvents }: { liveEvents: LogEvent[] }) {
  const [level, setLevel] = useState('');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [live, setLive] = useState(true);
  const [items, setItems] = useState<LogEvent[]>([]);
  const [before, setBefore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: String(PAGE) });
    if (level) params.set('level', level);
    if (debounced) params.set('q', debounced);
    apiGet<LogPage>(`/api/logs?${params}`, controller.signal)
      .then((r) => {
        setItems(r.items);
        setBefore(r.next_before);
        setError(null);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [level, debounced]);

  const loadOlder = () => {
    if (before === null) return;
    const params = new URLSearchParams({ limit: String(PAGE), before: String(before) });
    if (level) params.set('level', level);
    if (debounced) params.set('q', debounced);
    apiGet<LogPage>(`/api/logs?${params}`).then((r) => {
      setItems((prev) => [...prev, ...r.items]);
      setBefore(r.next_before);
    });
  };

  // Live tail: newest events from the socket, filtered the same way as the stored list.
  const rows = useMemo(() => {
    if (!live) return items;
    const matches = (e: LogEvent) =>
      (!level || e.level === level) && (!debounced || e.message.toLowerCase().includes(debounced.toLowerCase()));
    const newest = items[0]?.ts ?? '';
    const fresh = liveEvents.filter((e) => matches(e) && e.level !== 'debug' && e.ts > newest);
    return [...fresh, ...items];
  }, [live, liveEvents, items, level, debounced]);

  return (
    <Card
      title="System events"
      icon={<ScrollText size={14} />}
      right={
        <button onClick={() => setLive(!live)} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] transition ${live ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200' : 'border-white/10 text-slate-400'}`}>
          <Radio size={12} className={live ? 'animate-pulse' : ''} /> {live ? 'Live tail on' : 'Live tail off'}
        </button>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <label className="flex flex-1 items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-slate-400 focus-within:border-sky-400/50">
          <Search size={14} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search messages…" aria-label="Search logs" className="w-full bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600" />
        </label>
        <select aria-label="Filter by level" value={level} onChange={(e) => setLevel(e.target.value)} className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-slate-300 outline-none">
          <option value="">All levels</option>
          <option value="info">Info</option>
          <option value="warn">Warning</option>
          <option value="error">Error</option>
        </select>
      </div>

      {error ? (
        <EmptyState>Could not load events: {error}</EmptyState>
      ) : loading ? (
        <EmptyState>Loading events…</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState>No events match this filter.</EmptyState>
      ) : (
        <ul className="max-h-[28rem] divide-y divide-white/5 overflow-y-auto rounded-xl border border-white/5 bg-black/20 font-mono text-[12px]">
          {rows.map((e, i) => (
            <li key={`${e.ts}-${e.id ?? e.seq ?? i}`} className="flex items-start gap-3 px-3 py-1.5">
              <span className="shrink-0 text-slate-500">{fmtClock(e.ts)}</span>
              <span className="w-14 shrink-0"><Badge tone={LEVEL_TONE[e.level]}>{e.level}</Badge></span>
              <span className="w-16 shrink-0 truncate text-slate-500">{e.source}</span>
              <span className="min-w-0 break-words text-slate-200">{e.message}</span>
            </li>
          ))}
        </ul>
      )}
      {before !== null && !loading && (
        <button onClick={loadOlder} className="mt-3 w-full rounded-lg border border-white/10 py-1.5 text-xs text-slate-400 transition hover:text-slate-200">
          Load older events
        </button>
      )}
    </Card>
  );
}
