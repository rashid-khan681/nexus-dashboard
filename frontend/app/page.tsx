'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { Activity, Bell, Server, ScrollText, WifiOff } from 'lucide-react';
import { AiPanel } from './components/AiPanel';
import { AlertsTable } from './components/AlertsTable';
import { IncidentDrawer } from './components/IncidentDrawer';
import { InfraView } from './components/InfraView';
import { KpiStrip } from './components/KpiStrip';
import { LogViewer } from './components/LogViewer';
import { MetricsChart } from './components/MetricsChart';
import { PingGauge } from './components/PingGauge';
import { ServiceTopology } from './components/ServiceTopology';
import { Badge, useNow } from './components/ui';
import { useNexus } from './hooks/useNexus';
import { apiGet, getApiBase } from './lib/api';
import type { Alert, Summary } from './lib/types';

type Tab = 'overview' | 'alerts' | 'logs' | 'system';

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <Activity size={18} /> },
  { id: 'alerts', label: 'Alerts', icon: <Bell size={18} /> },
  { id: 'logs', label: 'Events', icon: <ScrollText size={18} /> },
  { id: 'system', label: 'System', icon: <Server size={18} /> },
];

export default function Dashboard() {
  const nexus = useNexus();
  const { connected, telemetry, history, openAlerts, events, ai, analyses, rtt, alertTick, lastMessageAt } = nexus;
  const now = useNow(1000);

  const [tab, setTab] = useState<Tab>('overview');
  const [selected, setSelected] = useState<Alert | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      apiGet<Summary>('/api/summary', controller.signal)
        .then(setSummary)
        .catch(() => undefined);
    load();
    const timer = setInterval(load, 30000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [alertTick]);

  const thresholds = nexus.thresholds ?? summary?.thresholds ?? null;
  const closeDrawer = useCallback(() => setSelected(null), []);

  const ageSeconds = now && lastMessageAt ? Math.max(0, Math.round((now - lastMessageAt) / 1000)) : null;
  const stale = connected && ageSeconds !== null && ageSeconds > 6;
  const critical = openAlerts.filter((a) => a.severity === 'critical').length;

  const status = !connected
    ? { tone: 'crit' as const, text: 'Disconnected' }
    : stale
      ? { tone: 'warn' as const, text: `Stale · ${ageSeconds}s` }
      : { tone: 'ok' as const, text: 'Live' };

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-[#05060b] font-sans text-slate-200 [background-image:radial-gradient(60rem_30rem_at_15%_-10%,rgba(56,189,248,0.10),transparent),radial-gradient(50rem_30rem_at_100%_0%,rgba(139,92,246,0.10),transparent)]">
        <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col gap-4 p-3 pb-24 lg:flex-row lg:p-5 lg:pb-5">
          <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-white/10 bg-[#070a14]/95 p-2 backdrop-blur lg:static lg:w-20 lg:flex-col lg:justify-start lg:gap-2 lg:rounded-2xl lg:border lg:p-3">
            <div className="hidden h-11 w-11 items-center justify-center self-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-lg font-black text-white shadow-lg shadow-sky-500/20 lg:flex">N</div>
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined} className={`relative flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-[10px] font-medium transition lg:mt-1 ${tab === t.id ? 'bg-sky-400/10 text-sky-300' : 'text-slate-500 hover:text-slate-300'}`}>
                {t.icon}
                {t.label}
                {t.id === 'alerts' && openAlerts.length > 0 && (
                  <span className={`absolute right-2 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white ${critical > 0 ? 'bg-rose-500' : 'bg-amber-500'}`}>{openAlerts.length}</span>
                )}
              </button>
            ))}
          </nav>

          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3">
              <div>
                <h1 className="bg-gradient-to-r from-sky-300 to-indigo-400 bg-clip-text text-2xl font-black tracking-[0.18em] text-transparent">NEXUS PRIME</h1>
                <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Real-time infrastructure monitoring · alert-fatigue reduction</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {ai && <Badge tone={ai.state === 'ok' ? 'ok' : ai.state === 'degraded' ? 'warn' : ai.state === 'untested' ? 'info' : 'muted'} title={ai.reason ?? undefined}>{ai.state === 'disabled' ? 'AI: rules only' : `AI: ${ai.model ?? ai.state}`}</Badge>}
                <Badge tone={status.tone}>
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${status.tone === 'ok' ? 'animate-pulse bg-emerald-400' : status.tone === 'warn' ? 'bg-amber-400' : 'bg-rose-400'}`} />
                  {status.text}
                </Badge>
                <span className="font-mono text-sm tabular-nums text-slate-300">{now ? new Date(now).toLocaleTimeString('en-GB', { hour12: false }) : '--:--:--'}</span>
              </div>
            </header>

            {!connected && (
              <div role="alert" className="flex items-center gap-3 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                <WifiOff size={18} />
                <span>Cannot reach the backend at <span className="font-mono">{getApiBase()}</span>. Retrying automatically; the dashboard resumes as soon as it is back.</span>
              </div>
            )}

            <AnimatePresence mode="wait">
              <motion.main key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }} className="flex flex-col gap-4">
                {tab === 'overview' && (
                  <>
                    <KpiStrip telemetry={telemetry} history={history} thresholds={thresholds} openAlerts={openAlerts} />
                    <div className="grid gap-4 xl:grid-cols-3">
                      <div className="flex min-w-0 flex-col gap-4 xl:col-span-2">
                        <ServiceTopology telemetry={telemetry} rtt={rtt} ai={ai} thresholds={thresholds} connected={connected} />
                        <MetricsChart thresholds={thresholds} refreshKey={alertTick} />
                      </div>
                      <div className="flex min-w-0 flex-col gap-4">
                        <PingGauge rtt={rtt} />
                        <AiPanel ai={ai} openAlerts={openAlerts} analyses={analyses} refreshKey={alertTick} />
                      </div>
                    </div>
                    <AlertsTable refreshKey={alertTick} onSelect={setSelected} summary={summary} compact />
                  </>
                )}
                {tab === 'alerts' && <AlertsTable refreshKey={alertTick} onSelect={setSelected} summary={summary} />}
                {tab === 'logs' && <LogViewer liveEvents={events} />}
                {tab === 'system' && <InfraView telemetry={telemetry} thresholds={thresholds} ai={ai} summary={summary} />}
              </motion.main>
            </AnimatePresence>
          </div>
        </div>

        <IncidentDrawer alert={selected} onClose={closeDrawer} refreshKey={alertTick} liveAnalysis={selected ? analyses[String(selected.id)] : undefined} />
      </div>
    </MotionConfig>
  );
}
