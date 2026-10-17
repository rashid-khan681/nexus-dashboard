export interface Telemetry {
  ts: number;
  cpu_pct: number | null;
  mem_pct: number;
  mem_used_mb: number;
  mem_total_mb: number;
  disk_pct: number | null;
  load1: number;
  cores: number;
  db_ok: boolean;
  db_latency_ms: number | null;
  loop_lag_ms: number | null;
  sockets: number;
  net_rx_bps: number | null;
  net_tx_bps: number | null;
  host_uptime_s: number;
  process_uptime_s: number;
}

export type Severity = 'warning' | 'critical';
export type AlertStatus = 'open' | 'acknowledged' | 'resolved';

export interface Alert {
  id: number | string;
  rule: string;
  severity: Severity;
  status: AlertStatus;
  title: string;
  message: string;
  metric: string | null;
  threshold: number | null;
  peak_value: number | null;
  last_value: number | null;
  occurrences: number;
  opened_at: string;
  last_seen_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  analysis_source?: 'gemini' | 'rules' | null;
}

export interface MetricStats {
  min: number;
  avg: number;
  max: number;
  last: number;
}

export interface Evidence {
  window_seconds?: number;
  samples?: number;
  metrics?: Record<string, MetricStats>;
}

export interface Analysis {
  id: number;
  alert_id: number;
  source: 'gemini' | 'rules';
  model: string | null;
  summary: string;
  likely_cause: string | null;
  recommended_actions: string[];
  evidence: Evidence;
  latency_ms: number | null;
  fallback_reason: string | null;
  created_at: string;
}

export interface AiStatus {
  state: 'ok' | 'degraded' | 'disabled' | 'untested';
  model: string | null;
  reason: string | null;
  lastOkAt: string | null;
  callsLastHour: number;
  maxCallsPerHour: number;
}

export interface LogEvent {
  id?: number;
  seq?: number;
  ts: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: string;
  message: string;
}

export type Thresholds = Record<string, { warning: number; critical: number }>;

export interface MetricPoint {
  t: string;
  cpu_avg: number | null;
  cpu_max: number | null;
  mem_avg: number | null;
  disk_avg: number | null;
  load1: number | null;
  db_latency_avg: number | null;
  db_latency_max: number | null;
  sockets: number | null;
  net_rx_bps: number | null;
  net_tx_bps: number | null;
}

export interface Summary {
  open_alerts: { total: number; critical: number; warning: number };
  noise_reduction_24h: { alerts_24h: number; breach_samples_24h: number };
  thresholds: Thresholds;
  retention_days: number;
  ai: AiStatus;
}

export interface SamplePoint {
  ts: string;
  cpu_pct: number | null;
  mem_pct: number | null;
  disk_pct: number | null;
  load1: number | null;
  db_latency_ms: number | null;
  loop_lag_ms: number | null;
  sockets: number | null;
}

export type Tone = 'ok' | 'warn' | 'crit' | 'info' | 'muted';
