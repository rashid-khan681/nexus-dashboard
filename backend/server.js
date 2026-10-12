'use strict';

const crypto = require('crypto');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const config = require('./config');
const db = require('./database');
const events = require('./eventlog');
const alerts = require('./rules');
const ai = require('./ai_controller');
const { collect } = require('./collector');

const app = express();
app.set('trust proxy', 1); // behind a load balancer (Elastic Beanstalk / ALB)
app.disable('x-powered-by');

const corsOrigin = config.corsOrigins === '*' ? true : config.corsOrigins;
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '10kb' }));
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });
  next();
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: config.corsOrigins === '*' ? '*' : config.corsOrigins, methods: ['GET', 'POST'] },
});

// ---------- Small helpers ----------

const hits = new Map();
function rateLimit({ windowMs, max }) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.ip}:${req.baseUrl || ''}${req.path}`.slice(0, 120);
    let entry = hits.get(key);
    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'Too many requests' });
    }
    return next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of hits) if (entry.resetAt < now) hits.delete(key);
}, 60000).unref();

function requireAdmin(req, res, next) {
  if (!config.adminToken) return next(); // demo mode, warned about at startup
  const provided = Buffer.from(req.get('x-admin-token') || '');
  const expected = Buffer.from(config.adminToken);
  const ok = provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
  if (!ok) return res.status(401).json({ error: 'Invalid or missing admin token' });
  return next();
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function intParam(value, { min, max, fallback }) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const round1 = (n) => (n === null || n === undefined ? null : Math.round(n * 10) / 10);

// ---------- Live state ----------

const history = [];
let latest = null;
let tickCount = 0;
let ticking = false;
const analysisInFlight = new Set();

async function persistSample(s) {
  await db.query(
    `INSERT INTO metric_samples
       (ts, cpu_pct, mem_pct, disk_pct, load1, db_latency_ms, loop_lag_ms, sockets, net_rx_bps, net_tx_bps)
     VALUES (to_timestamp($1::float8 / 1000.0), $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [s.ts, s.cpu_pct, s.mem_pct, s.disk_pct, s.load1, s.db_latency_ms, s.loop_lag_ms, s.sockets, s.net_rx_bps, s.net_tx_bps]
  );
}

// Compatibility event for the previous dashboard UI. Remove once the new UI is deployed.
function legacyPayload(s) {
  return [
    {
      region: 'primary-host',
      cpuUsage: Math.round(s.cpu_pct || 0),
      ramUsage: Math.round(s.mem_pct || 0),
      activeConnections: s.sockets,
      status: 'Healthy',
    },
  ];
}

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const sample = await collect({ probeDb: db.probe, sockets: io.engine.clientsCount });
    latest = sample;
    history.push(sample);
    if (history.length > config.historyMaxSamples) history.shift();

    io.emit('telemetry', sample);
    io.emit('infrastructure_metrics', legacyPayload(sample));

    tickCount += 1;
    const persistTick = tickCount % config.persistEveryTicks === 0;
    if (persistTick && sample.db_ok) {
      try {
        await persistSample(sample);
      } catch (err) {
        console.error('[collector] could not persist sample:', err.message);
      }
    }
    await alerts.evaluate(sample);
    if (persistTick) await alerts.flush();
  } catch (err) {
    console.error('[collector] tick failed:', err.message);
  } finally {
    ticking = false;
  }
}

// ---------- AI analysis ----------

async function historyForAlert(alert) {
  if (alert.status !== 'resolved') return history;
  // Resolved incident: rebuild the evidence window from stored samples.
  const res = await db.query(
    `SELECT extract(epoch FROM ts) * 1000 AS ts, cpu_pct, mem_pct, disk_pct, load1,
            db_latency_ms, loop_lag_ms, sockets
     FROM metric_samples
     WHERE ts BETWEEN $1::timestamptz - interval '2 minutes' AND COALESCE($2::timestamptz, now())
     ORDER BY ts ASC LIMIT 200`,
    [alert.opened_at, alert.resolved_at]
  );
  return res.rows.map((r) => ({ ...r, ts: Number(r.ts), db_ok: null }));
}

async function saveAnalysis(alertId, a) {
  const res = await db.query(
    `INSERT INTO ai_analyses
       (alert_id, source, model, summary, likely_cause, recommended_actions, evidence, latency_ms, fallback_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      alertId,
      a.source,
      a.model,
      a.summary,
      a.likely_cause,
      JSON.stringify(a.recommended_actions),
      JSON.stringify(a.evidence),
      a.latency_ms,
      a.fallback_reason,
    ]
  );
  return res.rows[0];
}

async function runAnalysis(alert) {
  if (typeof alert.id !== 'number') throw new Error('Analysis is only available for stored alerts');
  if (analysisInFlight.has(alert.id)) return null;
  analysisInFlight.add(alert.id);
  try {
    const analysis = await ai.analyze(alert, await historyForAlert(alert));
    const saved = await saveAnalysis(alert.id, analysis);
    io.emit('ai_analysis', { alert_id: alert.id, analysis: saved });
    events.log('info', 'ai', `Analysis stored for alert ${alert.id} (source: ${saved.source})`, {
      alert_id: alert.id,
      source: saved.source,
      fallback_reason: saved.fallback_reason,
    });
    return saved;
  } finally {
    analysisInFlight.delete(alert.id);
  }
}

alerts.setNotifier((alert, kind) => {
  io.emit('alert_update', { kind, alert });
  const needsAnalysis = (kind === 'opened' || kind === 'escalated') && alert.severity === 'critical';
  if (needsAnalysis && typeof alert.id === 'number') {
    runAnalysis(alert).catch((err) => console.error('[ai] automatic analysis failed:', err.message));
  }
});

events.onEvent((entry) => io.emit('log_event', entry));

// ---------- REST API ----------

app.get('/health', (req, res) => res.json({ status: 'ok' })); // load balancer probe, no dependencies

const api = express.Router();
api.use(rateLimit({ windowMs: 60000, max: 240 }));

api.get(
  '/health',
  wrap(async (req, res) => {
    const probe = await db.probe();
    res.status(probe.ok ? 200 : 503).json({
      status: probe.ok ? 'ok' : 'degraded',
      uptime_s: Math.round(process.uptime()),
      database: probe,
      ai: ai.getStatus(),
      open_alerts: alerts.getOpenAlerts().length,
      last_sample_at: latest ? new Date(latest.ts).toISOString() : null,
    });
  })
);

api.get(
  '/summary',
  wrap(async (req, res) => {
    const open = alerts.getOpenAlerts();
    const stats = await db.query(
      `SELECT count(*)::int AS alerts_24h, COALESCE(sum(occurrences), 0)::int AS breach_samples_24h
       FROM alerts WHERE opened_at > now() - interval '24 hours'`
    );
    res.json({
      sample: latest,
      open_alerts: {
        total: open.length,
        critical: open.filter((a) => a.severity === 'critical').length,
        warning: open.filter((a) => a.severity === 'warning').length,
      },
      noise_reduction_24h: stats.rows[0], // threshold breaches collapsed into alerts
      thresholds: config.thresholds,
      retention_days: config.retentionDays,
      ai: ai.getStatus(),
    });
  })
);

const RANGES = {
  '15m': { interval: '15 minutes', bucketSeconds: 10 },
  '1h': { interval: '1 hour', bucketSeconds: 30 },
  '6h': { interval: '6 hours', bucketSeconds: 120 },
  '24h': { interval: '24 hours', bucketSeconds: 300 },
  '7d': { interval: '7 days', bucketSeconds: 1800 },
};

api.get(
  '/metrics',
  wrap(async (req, res) => {
    const key = req.query.range || '1h';
    const range = RANGES[key];
    if (!range) return res.status(400).json({ error: `range must be one of ${Object.keys(RANGES).join(', ')}` });

    const result = await db.query(
      `SELECT to_timestamp(floor(extract(epoch FROM ts) / $2::float8) * $2::float8) AS t,
              avg(cpu_pct) AS cpu_avg, max(cpu_pct) AS cpu_max,
              avg(mem_pct) AS mem_avg, avg(disk_pct) AS disk_avg, avg(load1) AS load1,
              avg(db_latency_ms) AS db_latency_avg, max(db_latency_ms) AS db_latency_max,
              avg(sockets) AS sockets, avg(net_rx_bps) AS net_rx_bps, avg(net_tx_bps) AS net_tx_bps
       FROM metric_samples
       WHERE ts > now() - $1::interval
       GROUP BY 1 ORDER BY 1`,
      [range.interval, range.bucketSeconds]
    );
    const points = result.rows.map((r) => ({
      t: r.t,
      cpu_avg: round1(r.cpu_avg),
      cpu_max: round1(r.cpu_max),
      mem_avg: round1(r.mem_avg),
      disk_avg: round1(r.disk_avg),
      load1: round1(r.load1),
      db_latency_avg: round1(r.db_latency_avg),
      db_latency_max: round1(r.db_latency_max),
      sockets: round1(r.sockets),
      net_rx_bps: r.net_rx_bps === null ? null : Math.round(r.net_rx_bps),
      net_tx_bps: r.net_tx_bps === null ? null : Math.round(r.net_tx_bps),
    }));
    return res.json({ range: key, bucket_seconds: range.bucketSeconds, points });
  })
);

const STATUSES = new Set(['open', 'acknowledged', 'resolved']);
const SEVERITIES = new Set(['warning', 'critical']);

api.get(
  '/alerts',
  wrap(async (req, res) => {
    const status = STATUSES.has(req.query.status) ? req.query.status : null;
    const severity = SEVERITIES.has(req.query.severity) ? req.query.severity : null;
    const limit = intParam(req.query.limit, { min: 1, max: 100, fallback: 25 });
    const offset = intParam(req.query.offset, { min: 0, max: 100000, fallback: 0 });

    const result = await db.query(
      `SELECT a.*, count(*) OVER() AS total,
              (SELECT s.source FROM ai_analyses s WHERE s.alert_id = a.id ORDER BY s.created_at DESC LIMIT 1) AS analysis_source
       FROM alerts a
       WHERE ($1::text IS NULL OR a.status = $1) AND ($2::text IS NULL OR a.severity = $2)
       ORDER BY a.opened_at DESC LIMIT $3 OFFSET $4`,
      [status, severity, limit, offset]
    );

    const total = result.rows.length ? Number(result.rows[0].total) : 0;
    const items = result.rows.map(({ total: _t, ...row }) => {
      const live = alerts.findOpenAlert(row.id); // fresher counters than the last flush
      return live ? { ...live, analysis_source: row.analysis_source } : row;
    });

    // In-memory alerts (for example "database unreachable") are not in PostgreSQL.
    if (offset === 0 && (status === null || status === 'open')) {
      const memoryOnly = alerts
        .getOpenAlerts()
        .filter((a) => typeof a.id !== 'number' && (!severity || a.severity === severity));
      items.unshift(...memoryOnly.map((a) => ({ ...a, analysis_source: null })));
    }
    return res.json({ total, limit, offset, items });
  })
);

api.get(
  '/alerts/:id',
  wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Alert id must be a number' });

    const alertRes = await db.query('SELECT * FROM alerts WHERE id = $1', [id]);
    if (alertRes.rows.length === 0) return res.status(404).json({ error: 'Alert not found' });
    const alert = alerts.findOpenAlert(id) || alertRes.rows[0];

    const analyses = await db.query(
      'SELECT * FROM ai_analyses WHERE alert_id = $1 ORDER BY created_at DESC LIMIT 5',
      [id]
    );
    const samples = await db.query(
      `SELECT ts, cpu_pct, mem_pct, disk_pct, load1, db_latency_ms, loop_lag_ms, sockets
       FROM metric_samples
       WHERE ts BETWEEN $1::timestamptz - interval '5 minutes' AND COALESCE($2::timestamptz, now())
       ORDER BY ts ASC LIMIT 500`,
      [alert.opened_at, alert.resolved_at]
    );
    return res.json({ alert, analyses: analyses.rows, samples: samples.rows });
  })
);

api.post(
  '/alerts/:id/ack',
  requireAdmin,
  wrap(async (req, res) => {
    const raw = req.params.id;
    const id = /^\d+$/.test(raw) ? parseInt(raw, 10) : raw;
    const alert = await alerts.acknowledge(id);
    if (!alert) return res.status(404).json({ error: 'Alert is not open' });
    return res.json({ alert });
  })
);

api.post(
  '/alerts/:id/explain',
  requireAdmin,
  rateLimit({ windowMs: 60000, max: 6 }),
  wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Analysis is only available for stored alerts' });
    }
    const alertRes = await db.query('SELECT * FROM alerts WHERE id = $1', [id]);
    if (alertRes.rows.length === 0) return res.status(404).json({ error: 'Alert not found' });
    const alert = alerts.findOpenAlert(id) || alertRes.rows[0];

    const saved = await runAnalysis(alert);
    if (!saved) return res.status(409).json({ error: 'An analysis for this alert is already running' });
    return res.json({ analysis: saved });
  })
);

const LEVELS = new Set(['debug', 'info', 'warn', 'error']);

api.get(
  '/logs',
  wrap(async (req, res) => {
    const level = LEVELS.has(req.query.level) ? req.query.level : null;
    const q = typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q.trim().slice(0, 100) : null;
    const limit = intParam(req.query.limit, { min: 1, max: 200, fallback: 50 });
    const before = req.query.before ? intParam(req.query.before, { min: 1, max: Number.MAX_SAFE_INTEGER, fallback: null }) : null;

    const result = await db.query(
      `SELECT id, ts, level, source, message, meta FROM events
       WHERE ($1::text IS NULL OR level = $1)
         AND ($2::text IS NULL OR message ILIKE '%' || $2 || '%')
         AND ($3::bigint IS NULL OR id < $3)
       ORDER BY id DESC LIMIT $4`,
      [level, q, before, limit]
    );
    const items = result.rows;
    res.json({ items, next_before: items.length === limit ? items[items.length - 1].id : null });
  })
);

api.get('/ai/status', (req, res) => res.json(ai.getStatus()));

api.post(
  '/ai/test',
  requireAdmin,
  rateLimit({ windowMs: 60000, max: 3 }),
  wrap(async (req, res) => {
    const result = await ai.testConnection();
    res.status(result.ok ? 200 : 502).json(result);
  })
);

app.use('/api', api);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[http] unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ---------- Socket.IO ----------

io.on('connection', (socket) => {
  socket.emit('hello', {
    history: history.slice(-30),
    alerts: alerts.getOpenAlerts(),
    ai: ai.getStatus(),
    events: events.recent(30),
    config: { sampleIntervalMs: config.sampleIntervalMs, thresholds: config.thresholds },
  });

  // Round-trip probe used by the dashboard to measure real browser-to-server latency.
  socket.on('ping_request', (ack) => {
    socket.emit('pong_response');
    if (typeof ack === 'function') ack();
  });
});

// ---------- Boot and shutdown ----------

let collectorTimer = null;
let retentionTimer = null;

async function runRetention() {
  try {
    const removed = await db.pruneOldData();
    const total = removed.samples + removed.events + removed.alerts;
    if (total > 0) events.log('info', 'retention', `Retention removed ${total} old row(s)`, removed);
  } catch (err) {
    console.error('[retention] failed:', err.message);
  }
}

async function start() {
  await db.init();
  await alerts.rehydrate();

  server.listen(config.port, () => {
    const aiStatus = ai.getStatus();
    events.log('info', 'system', `Nexus Prime backend listening on port ${config.port}`, {
      ai: aiStatus.state,
      ai_reason: aiStatus.reason,
      retention_days: config.retentionDays,
    });
    if (!config.adminToken) {
      events.log('warn', 'security', 'ADMIN_TOKEN is not set: state-changing endpoints are open (demo mode).');
    }
    if (config.corsOrigins === '*') {
      events.log('warn', 'security', 'CORS_ORIGIN is not set: any origin may call this API.');
    }
  });

  collectorTimer = setInterval(tick, config.sampleIntervalMs);
  runRetention();
  retentionTimer = setInterval(runRetention, 3600000);
}

async function shutdown(signal) {
  console.log(`[system] ${signal} received, shutting down`);
  clearInterval(collectorTimer);
  clearInterval(retentionTimer);
  const force = setTimeout(() => process.exit(1), 10000);
  force.unref();
  io.close();
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch((err) => {
  console.error('[system] fatal startup error:', err.message);
  process.exit(1);
});