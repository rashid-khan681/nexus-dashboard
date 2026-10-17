'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCheck, KeyRound, Sparkles, X } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ApiError, apiGet, apiPost, setAdminToken } from '../lib/api';
import { fmtClock, timeAgo } from '../lib/format';
import type { Alert, Analysis, SamplePoint } from '../lib/types';
import { AnalysisView } from './AnalysisView';
import { SEVERITY_TONE, STATUS_TONE } from './AlertsTable';
import { Badge, EmptyState, useNow } from './ui';

interface Detail {
  alert: Alert;
  analyses: Analysis[];
  samples: SamplePoint[];
}

interface ContentProps {
  alert: Alert;
  onClose: () => void;
  refreshKey: number;
  liveAnalysis?: Analysis;
}

/** Remounted per alert (see key in the wrapper), so its state resets naturally when another alert is opened. */
function DrawerContent({ alert, onClose, refreshKey, liveAnalysis }: ContentProps) {
  const now = useNow(5000);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState<'ack' | 'explain' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [needsToken, setNeedsToken] = useState(false);
  const [tokenInput, setTokenInput] = useState('');

  const id = alert?.id;
  const stored = typeof id === 'number';

  useEffect(() => {
    if (typeof id !== 'number') return;
    const controller = new AbortController();
    apiGet<Detail>(`/api/alerts/${id}`, controller.signal)
      .then(setDetail)
      .catch(() => undefined);
    return () => controller.abort();
  }, [id, refreshKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const act = useCallback(
    async (kind: 'ack' | 'explain') => {
      if (!stored && kind === 'explain') return;
      setBusy(kind);
      setMessage(null);
      try {
        await apiPost(`/api/alerts/${id}/${kind}`);
        setNeedsToken(false);
        if (typeof id === 'number') setDetail(await apiGet<Detail>(`/api/alerts/${id}`));
        setMessage(kind === 'ack' ? 'Alert acknowledged.' : 'Analysis updated.');
      } catch (e) {
        const err = e as ApiError;
        if (err.status === 401) {
          setNeedsToken(true);
          setMessage('This action needs the admin token.');
        } else if (err.status === 429) setMessage('Too many requests. Try again in a minute.');
        else setMessage(err.message);
      } finally {
        setBusy(null);
      }
    },
    [id, stored],
  );

  const current = detail?.alert ?? alert;
  const analysis = liveAnalysis ?? detail?.analyses[0];
  const metricKey = current?.metric && current.metric !== 'db_ok' ? (current.metric as keyof SamplePoint) : null;
  const chart = metricKey ? (detail?.samples ?? []).map((s) => ({ t: s.ts, v: s[metricKey] as number | null })) : [];

  return (
    <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge tone={SEVERITY_TONE[current.severity]}>{current.severity}</Badge>
                  <Badge tone={STATUS_TONE[current.status]}>{current.status}</Badge>
                </div>
                <h2 className="mt-2 text-lg font-semibold text-slate-100">{current.title}</h2>
                <p className="mt-1 text-sm text-slate-400">{current.message}</p>
              </div>
              <button aria-label="Close" onClick={onClose} className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:text-white"><X size={16} /></button>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              {[
                ['Opened', timeAgo(current.opened_at, now)],
                ['Last seen', timeAgo(current.last_seen_at, now)],
                ['Merged breaches', `×${current.occurrences}`],
                ['Peak value', current.peak_value ?? '–'],
                ['Threshold', current.threshold ?? '–'],
                ['Resolved', current.resolved_at ? timeAgo(current.resolved_at, now) : '–'],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
                  <dt className="text-[10px] uppercase tracking-wider text-slate-500">{label as string}</dt>
                  <dd className="mt-0.5 font-mono text-slate-200">{value as string | number}</dd>
                </div>
              ))}
            </dl>

            {metricKey && (
              <div className="mt-5">
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{current.metric} around the incident</h3>
                <div className="h-40">
                  {chart.length < 2 ? (
                    <EmptyState>Not enough stored samples yet.</EmptyState>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chart} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                        <XAxis dataKey="t" tickFormatter={(v: string) => fmtClock(v)} stroke="#475569" fontSize={10} minTickGap={40} tickLine={false} />
                        <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ background: '#070a14', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, fontSize: 12 }} labelFormatter={(v) => fmtClock(String(v))} />
                        {current.threshold !== null && <ReferenceLine y={current.threshold} stroke="#fb7185" strokeDasharray="4 4" />}
                        <Area type="monotone" dataKey="v" name={current.metric ?? ''} stroke="#38bdf8" strokeWidth={2} fill="rgba(56,189,248,0.15)" dot={false} isAnimationActive={false} connectNulls />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {current.status === 'open' && (
                <button disabled={busy !== null} onClick={() => act('ack')} className="flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-400/20 disabled:opacity-50">
                  <CheckCheck size={14} /> Acknowledge
                </button>
              )}
              {stored && (
                <button disabled={busy !== null} onClick={() => act('explain')} className="flex items-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-400/10 px-3 py-1.5 text-xs font-medium text-sky-200 transition hover:bg-sky-400/20 disabled:opacity-50">
                  <Sparkles size={14} /> {busy === 'explain' ? 'Analysing…' : 'Analyse this incident'}
                </button>
              )}
              {message && <span className="text-xs text-slate-400">{message}</span>}
            </div>

            {needsToken && (
              <form
                className="mt-3 flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setAdminToken(tokenInput.trim());
                  setMessage('Token saved for this browser tab. Try the action again.');
                  setNeedsToken(false);
                }}
              >
                <KeyRound size={14} className="text-slate-500" />
                <input type="password" autoComplete="off" placeholder="Admin token" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-400/50" />
                <button className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300">Save</button>
              </form>
            )}

            <div className="mt-6 border-t border-white/10 pt-4">
              <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Analysis</h3>
              {analysis ? (
                <AnalysisView analysis={analysis} now={now} />
              ) : (
                <p className="text-sm text-slate-500">
                  {stored
                    ? 'No analysis stored yet. Critical alerts are analysed automatically; use the button above to analyse this one on demand.'
                    : 'In-memory alerts (for example a database outage) cannot be stored or analysed while the database is down.'}
                </p>
              )}
            </div>
    </>
  );
}

export function IncidentDrawer({
  alert,
  onClose,
  refreshKey,
  liveAnalysis,
}: {
  alert: Alert | null;
  onClose: () => void;
  refreshKey: number;
  liveAnalysis?: Analysis;
}) {
  return (
    <AnimatePresence>
      {alert && (
        <>
          <motion.div key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]" />
          <motion.aside
            key="panel"
            role="dialog"
            aria-modal="true"
            aria-label="Incident details"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-white/10 bg-[#080b16] p-5 shadow-2xl"
          >
            <DrawerContent key={String(alert.id)} alert={alert} onClose={onClose} refreshKey={refreshKey} liveAnalysis={liveAnalysis} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
