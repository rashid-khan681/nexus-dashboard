'use client';

import { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { apiGet, getApiBase } from '../lib/api';
import type { AiStatus, Alert, Analysis, LogEvent, Telemetry, Thresholds } from '../lib/types';

const HISTORY_MAX = 150;
const EVENTS_MAX = 200;
const RTT_MAX = 60;

interface HelloPayload {
  history: Telemetry[];
  alerts: Alert[];
  ai: AiStatus;
  events: LogEvent[];
  config: { sampleIntervalMs: number; thresholds: Thresholds };
}

interface AlertUpdate {
  kind: 'opened' | 'escalated' | 'updated' | 'acknowledged' | 'resolved';
  alert: Alert;
}

/** Owns the realtime connection and every piece of live state shown on the dashboard. */
export function useNexus() {
  const [connected, setConnected] = useState(false);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [history, setHistory] = useState<Telemetry[]>([]);
  const [openAlerts, setOpenAlerts] = useState<Alert[]>([]);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [analyses, setAnalyses] = useState<Record<string, Analysis>>({});
  const [rtt, setRtt] = useState<number[]>([]);
  const [alertTick, setAlertTick] = useState(0);
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);

  const refreshAi = useCallback(() => {
    apiGet<AiStatus>('/api/ai/status').then(setAi).catch(() => undefined);
  }, []);

  useEffect(() => {
    const socket = io(getApiBase(), { reconnectionDelayMax: 5000 });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('hello', (h: HelloPayload) => {
      setHistory(h.history);
      setOpenAlerts(h.alerts);
      setAi(h.ai);
      setEvents([...h.events].reverse());
      setThresholds(h.config.thresholds);
    });

    socket.on('telemetry', (t: Telemetry) => {
      setTelemetry(t);
      setLastMessageAt(Date.now());
      setHistory((prev) => [...prev.slice(-(HISTORY_MAX - 1)), t]);
    });

    socket.on('alert_update', ({ kind, alert }: AlertUpdate) => {
      setOpenAlerts((prev) => {
        const rest = prev.filter((a) => String(a.id) !== String(alert.id));
        return kind === 'resolved' ? rest : [alert, ...rest];
      });
      if (kind !== 'updated') setAlertTick((n) => n + 1);
    });

    socket.on('ai_analysis', ({ alert_id, analysis }: { alert_id: number; analysis: Analysis }) => {
      setAnalyses((prev) => ({ ...prev, [String(alert_id)]: analysis }));
      setAlertTick((n) => n + 1);
      apiGet<AiStatus>('/api/ai/status').then(setAi).catch(() => undefined);
    });

    socket.on('log_event', (e: LogEvent) => {
      setEvents((prev) => [e, ...prev].slice(0, EVENTS_MAX));
    });

    // Real browser <-> server round trip, measured with a Socket.IO acknowledgement.
    const pingTimer = setInterval(() => {
      if (!socket.connected) return;
      const started = performance.now();
      socket.timeout(3000).emit('ping_request', (err: Error | null) => {
        if (err) return;
        const ms = Math.round((performance.now() - started) * 10) / 10;
        setRtt((prev) => [...prev.slice(-(RTT_MAX - 1)), ms]);
      });
    }, 2000);

    return () => {
      clearInterval(pingTimer);
      socket.disconnect();
    };
  }, []);

  return {
    connected,
    telemetry,
    history,
    openAlerts,
    events,
    ai,
    thresholds,
    analyses,
    rtt,
    alertTick,
    lastMessageAt,
    refreshAi,
  };
}
