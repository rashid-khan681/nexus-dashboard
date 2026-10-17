'use strict';

const { Pool, types } = require('pg');
const config = require('./config');

// BIGINT (oid 20) is returned as a string by default; our ids are far below 2^53.
types.setTypeParser(20, (value) => parseInt(value, 10));

let pool = null;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS metric_samples (
  id             BIGSERIAL PRIMARY KEY,
  ts             TIMESTAMPTZ NOT NULL DEFAULT now(),
  cpu_pct        REAL,
  mem_pct        REAL,
  disk_pct       REAL,
  load1          REAL,
  db_latency_ms  REAL,
  loop_lag_ms    REAL,
  sockets        INTEGER,
  net_rx_bps     REAL,
  net_tx_bps     REAL
);
CREATE INDEX IF NOT EXISTS idx_metric_samples_ts ON metric_samples (ts DESC);

CREATE TABLE IF NOT EXISTS alerts (
  id               BIGSERIAL PRIMARY KEY,
  rule             TEXT NOT NULL,
  severity         TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  title            TEXT NOT NULL,
  message          TEXT NOT NULL,
  metric           TEXT,
  threshold        REAL,
  peak_value       REAL,
  last_value       REAL,
  occurrences      INTEGER NOT NULL DEFAULT 1,
  opened_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at  TIMESTAMPTZ,
  resolved_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_alerts_status_opened ON alerts (status, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_opened ON alerts (opened_at DESC);

CREATE TABLE IF NOT EXISTS ai_analyses (
  id                   BIGSERIAL PRIMARY KEY,
  alert_id             BIGINT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  source               TEXT NOT NULL CHECK (source IN ('gemini', 'rules')),
  model                TEXT,
  summary              TEXT NOT NULL,
  likely_cause         TEXT,
  recommended_actions  JSONB NOT NULL DEFAULT '[]',
  evidence             JSONB NOT NULL DEFAULT '{}',
  latency_ms           INTEGER,
  fallback_reason      TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_alert ON ai_analyses (alert_id, created_at DESC);

CREATE TABLE IF NOT EXISTS events (
  id       BIGSERIAL PRIMARY KEY,
  ts       TIMESTAMPTZ NOT NULL DEFAULT now(),
  level    TEXT NOT NULL,
  source   TEXT NOT NULL,
  message  TEXT NOT NULL,
  meta     JSONB
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events (ts DESC);
`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Node can throw an AggregateError with an empty message (IPv4 + IPv6 refused), so fall back to the error code. */
function describeError(err) {
  return err.message || err.code || (err.errors && err.errors[0] && err.errors[0].code) || String(err);
}

function getPool() {
  if (!pool) throw new Error('Database is not initialised. Call init() first.');
  return pool;
}

async function query(text, params) {
  return getPool().query(text, params);
}

/**
 * Connects to PostgreSQL (with retries, because the database container may
 * still be starting) and applies the schema. Safe to run on every boot.
 */
async function init({ retries = 15, delayMs = 2000 } = {}) {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is not set. Define it in your .env file.');
  }

  pool = new Pool({
    connectionString: config.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  pool.on('error', (err) => console.error('[db] idle client error:', err.message));

  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await pool.query(SCHEMA_SQL);
      console.log('[db] connected and schema is up to date');
      return;
    } catch (err) {
      lastError = err;
      console.warn(`[db] connection attempt ${attempt}/${retries} failed: ${describeError(err)}`);
      await sleep(delayMs);
    }
  }
  throw new Error(`Could not connect to the database: ${lastError && describeError(lastError)}`);
}

/** Measures a real round trip to PostgreSQL. Never throws. */
async function probe() {
  const started = process.hrtime.bigint();
  try {
    await getPool().query('SELECT 1');
    const latencyMs = Number(process.hrtime.bigint() - started) / 1e6;
    return { ok: true, latencyMs: Math.round(latencyMs * 10) / 10 };
  } catch (err) {
    return { ok: false, latencyMs: null, error: err.message };
  }
}

/** Rolling retention window, applied by a scheduled job instead of on every insert. */
async function pruneOldData(days = config.retentionDays) {
  const samples = await query(
    `DELETE FROM metric_samples WHERE ts < now() - make_interval(days => $1)`,
    [days]
  );
  const events = await query(
    `DELETE FROM events WHERE ts < now() - make_interval(days => $1)`,
    [days]
  );
  // ai_analyses rows are removed by ON DELETE CASCADE.
  const alerts = await query(
    `DELETE FROM alerts WHERE status = 'resolved' AND resolved_at < now() - make_interval(days => $1)`,
    [days]
  );
  return { samples: samples.rowCount, events: events.rowCount, alerts: alerts.rowCount };
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { init, query, probe, pruneOldData, close };
