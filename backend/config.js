'use strict';

require('dotenv').config({ quiet: true });

const toNumber = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toList = (value) =>
  (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const corsList = toList(process.env.CORS_ORIGIN);

const config = {
  env: process.env.NODE_ENV || 'development',
  port: toNumber(process.env.PORT, 5000),

  // No hardcoded fallback password on purpose: a missing value must fail loudly.
  databaseUrl: process.env.DATABASE_URL || '',

  // "*" means any origin. Set CORS_ORIGIN to a comma-separated list in production.
  corsOrigins: corsList.length > 0 ? corsList : '*',

  // Optional shared secret for state-changing endpoints (ack / explain / ai test).
  adminToken: process.env.ADMIN_TOKEN || '',

  retentionDays: toNumber(process.env.RETENTION_DAYS, 10),

  // Telemetry loop: one global collector, shared by all connected clients.
  sampleIntervalMs: 2000,
  persistEveryTicks: 5, // persist one sample every 10 seconds
  historyMaxSamples: 150, // in-memory ring buffer (about 5 minutes)

  // Thresholds: a value >= warning opens a warning alert, >= critical a critical one.
  thresholds: {
    cpu_pct: { warning: toNumber(process.env.CPU_WARN, 70), critical: toNumber(process.env.CPU_CRIT, 85) },
    mem_pct: { warning: toNumber(process.env.MEM_WARN, 80), critical: toNumber(process.env.MEM_CRIT, 90) },
    disk_pct: { warning: toNumber(process.env.DISK_WARN, 80), critical: toNumber(process.env.DISK_CRIT, 90) },
    db_latency_ms: { warning: toNumber(process.env.DB_LAT_WARN, 100), critical: toNumber(process.env.DB_LAT_CRIT, 500) },
    loop_lag_ms: { warning: toNumber(process.env.LOOP_WARN, 100), critical: toNumber(process.env.LOOP_CRIT, 300) },
  },

  // Alert-fatigue controls: an alert opens only after N consecutive bad samples,
  // and resolves only after M consecutive good samples. Duplicates are merged.
  alerting: {
    triggerSamples: toNumber(process.env.ALERT_TRIGGER_SAMPLES, 3),
    resolveSamples: toNumber(process.env.ALERT_RESOLVE_SAMPLES, 5),
    flushEveryMs: 10000,
  },

  ai: {
    apiKey: process.env.GEMINI_API_KEY || '',
    // The model name is deliberately NOT hardcoded: model IDs get retired.
    model: process.env.GEMINI_MODEL || '',
    timeoutMs: toNumber(process.env.AI_TIMEOUT_MS, 15000),
    maxCallsPerHour: toNumber(process.env.AI_MAX_CALLS_PER_HOUR, 30),
    minIntervalMs: toNumber(process.env.AI_MIN_INTERVAL_MS, 10000),
  },
};

module.exports = config;