'use strict';

/**
 * Deterministic alert engine.
 *
 * Alert-fatigue controls:
 *  - Hysteresis: an alert opens only after N consecutive bad samples and
 *    resolves only after M consecutive good samples (no flapping).
 *  - Deduplication: while an alert is open, further bad samples only update
 *    its counters (occurrences, peak) instead of creating new alerts.
 *  - Severity escalation: warning -> critical updates the same alert.
 */

const config = require('./config');
const db = require('./database');
const events = require('./eventlog');

const RULES = [
  { key: 'cpu_high', metric: 'cpu_pct', title: 'High CPU utilisation', unit: '%' },
  { key: 'memory_high', metric: 'mem_pct', title: 'High memory utilisation', unit: '%' },
  { key: 'disk_high', metric: 'disk_pct', title: 'High disk utilisation', unit: '%' },
  { key: 'db_latency_high', metric: 'db_latency_ms', title: 'Slow database responses', unit: ' ms' },
  { key: 'event_loop_lag', metric: 'loop_lag_ms', title: 'Backend event-loop lag', unit: ' ms' },
  // The database cannot store its own outage, so this alert lives in memory only.
  { key: 'db_unreachable', metric: 'db_ok', title: 'Database unreachable', unit: '', ephemeral: true },
];

const states = new Map(); // rule key -> { alert, bad, good, dirty }
let notifier = () => {};
let lastDbErrorLogAt = 0;

function stateFor(key) {
  if (!states.has(key)) states.set(key, { alert: null, bad: 0, good: 0, dirty: false });
  return states.get(key);
}

function setNotifier(fn) {
  notifier = fn;
}

function levelFor(rule, sample) {
  if (rule.key === 'db_unreachable') return sample.db_ok === false ? 'critical' : 'ok';
  const value = sample[rule.metric];
  if (value === null || value === undefined) return null; // metric unavailable: skip
  const th = config.thresholds[rule.metric];
  if (value >= th.critical) return 'critical';
  if (value >= th.warning) return 'warning';
  return 'ok';
}

function thresholdFor(rule, level) {
  const th = config.thresholds[rule.metric];
  return th ? th[level] : null;
}

function buildMessage(rule, level, value) {
  if (rule.key === 'db_unreachable') return 'PostgreSQL did not answer the health probe.';
  const threshold = thresholdFor(rule, level);
  return `${rule.title}: ${value}${rule.unit} (${level} threshold ${threshold}${rule.unit}).`;
}

function throttledDbError(message) {
  const now = Date.now();
  if (now - lastDbErrorLogAt > 60000) {
    lastDbErrorLogAt = now;
    console.error(`[alerts] ${message}`);
  }
}

async function openAlert(rule, level, value) {
  const message = buildMessage(rule, level, value);
  const threshold = rule.key === 'db_unreachable' ? null : thresholdFor(rule, level);

  let alert;
  if (rule.ephemeral) {
    const now = new Date().toISOString();
    alert = {
      id: `ephemeral-${rule.key}`,
      rule: rule.key,
      severity: level,
      status: 'open',
      title: rule.title,
      message,
      metric: rule.metric,
      threshold: null,
      peak_value: null,
      last_value: null,
      occurrences: 1,
      opened_at: now,
      last_seen_at: now,
      acknowledged_at: null,
      resolved_at: null,
    };
  } else {
    try {
      const res = await db.query(
        `INSERT INTO alerts (rule, severity, title, message, metric, threshold, peak_value, last_value)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING *`,
        [rule.key, level, rule.title, message, rule.metric, threshold, value]
      );
      alert = res.rows[0];
    } catch (err) {
      throttledDbError(`could not open alert ${rule.key}: ${err.message}`);
      return null; // retried on the next tick because the bad streak continues
    }
  }

  const st = stateFor(rule.key);
  st.alert = alert;
  st.dirty = false;
  events.log(
    level === 'critical' ? 'error' : 'warn',
    'alerts',
    `Alert opened [${level}] ${rule.title}`,
    { alert_id: alert.id, value, threshold }
  );
  notifier(alert, 'opened');
  return alert;
}

async function persistAlert(alert) {
  if (typeof alert.id !== 'number') return; // ephemeral alert
  await db.query(
    `UPDATE alerts SET severity = $2, message = $3, threshold = $4, status = $5,
            peak_value = $6, last_value = $7, occurrences = $8, last_seen_at = $9
     WHERE id = $1`,
    [
      alert.id,
      alert.severity,
      alert.message,
      alert.threshold,
      alert.status,
      alert.peak_value,
      alert.last_value,
      alert.occurrences,
      alert.last_seen_at,
    ]
  );
}

async function resolveAlert(rule, st) {
  const alert = st.alert;
  alert.status = 'resolved';
  alert.resolved_at = new Date().toISOString();
  try {
    if (typeof alert.id === 'number') {
      await db.query(
        `UPDATE alerts SET status = 'resolved', resolved_at = now(),
                peak_value = $2, last_value = $3, occurrences = $4, last_seen_at = $5
         WHERE id = $1`,
        [alert.id, alert.peak_value, alert.last_value, alert.occurrences, alert.last_seen_at]
      );
    }
  } catch (err) {
    throttledDbError(`could not resolve alert ${alert.id}: ${err.message}`);
    alert.status = 'open';
    alert.resolved_at = null;
    return; // retried on the next tick
  }
  events.log('info', 'alerts', `Alert resolved: ${rule.title}`, {
    alert_id: alert.id,
    occurrences: alert.occurrences,
    peak: alert.peak_value,
  });
  notifier(alert, 'resolved');
  st.alert = null;
  st.good = 0;
  st.bad = 0;
  st.dirty = false;
}

/** Evaluates every rule against one telemetry sample. */
async function evaluate(sample) {
  for (const rule of RULES) {
    const level = levelFor(rule, sample);
    if (level === null) continue;

    const st = stateFor(rule.key);
    const value = rule.key === 'db_unreachable' ? null : sample[rule.metric];

    if (level === 'ok') {
      st.bad = 0;
      if (st.alert) {
        st.good += 1;
        if (st.good >= config.alerting.resolveSamples) await resolveAlert(rule, st);
      }
      continue;
    }

    st.good = 0;
    st.bad += 1;

    if (!st.alert) {
      if (st.bad >= config.alerting.triggerSamples) await openAlert(rule, level, value);
      continue;
    }

    // Deduplicate: update the existing alert instead of creating a new one.
    const alert = st.alert;
    alert.occurrences += 1;
    alert.last_seen_at = new Date().toISOString();
    alert.last_value = value;
    if (value !== null && (alert.peak_value === null || value > alert.peak_value)) {
      alert.peak_value = value;
    }
    st.dirty = true;

    if (level === 'critical' && alert.severity === 'warning') {
      alert.severity = 'critical';
      alert.threshold = thresholdFor(rule, 'critical');
      alert.message = buildMessage(rule, 'critical', value);
      try {
        await persistAlert(alert);
        st.dirty = false;
      } catch (err) {
        throttledDbError(`could not escalate alert ${alert.id}: ${err.message}`);
      }
      events.log('error', 'alerts', `Alert escalated to critical: ${rule.title}`, { alert_id: alert.id, value });
      notifier(alert, 'escalated');
    }
  }
}

/** Writes dirty counters to PostgreSQL and pushes a live update. Called every few seconds. */
async function flush() {
  for (const st of states.values()) {
    if (!st.alert || !st.dirty) continue;
    try {
      await persistAlert(st.alert);
      st.dirty = false;
      notifier(st.alert, 'updated');
    } catch (err) {
      throttledDbError(`could not flush alert ${st.alert.id}: ${err.message}`);
    }
  }
}

/** Restores open alerts after a restart so they are not duplicated. */
async function rehydrate() {
  const res = await db.query(
    `SELECT * FROM alerts WHERE status IN ('open', 'acknowledged') ORDER BY opened_at DESC`
  );
  const seen = new Set();
  for (const row of res.rows) {
    if (seen.has(row.rule)) {
      await db.query(`UPDATE alerts SET status = 'resolved', resolved_at = now() WHERE id = $1`, [row.id]);
      continue;
    }
    seen.add(row.rule);
    const st = stateFor(row.rule);
    st.alert = row;
    st.bad = config.alerting.triggerSamples;
    st.good = 0;
  }
  if (seen.size > 0) events.log('info', 'alerts', `Restored ${seen.size} open alert(s) after restart`);
}

function getOpenAlerts() {
  return [...states.values()].filter((st) => st.alert).map((st) => st.alert);
}

function findOpenAlert(id) {
  return getOpenAlerts().find((a) => String(a.id) === String(id)) || null;
}

/** Marks an open alert as acknowledged. Returns the alert, or null if it is not open. */
async function acknowledge(id) {
  const alert = findOpenAlert(id);
  if (!alert || alert.status !== 'open') return alert;
  alert.status = 'acknowledged';
  alert.acknowledged_at = new Date().toISOString();
  await persistAlert(alert);
  if (typeof alert.id === 'number') {
    await db.query('UPDATE alerts SET acknowledged_at = now() WHERE id = $1', [alert.id]);
  }
  events.log('info', 'alerts', `Alert acknowledged: ${alert.title}`, { alert_id: alert.id });
  notifier(alert, 'acknowledged');
  return alert;
}

module.exports = { evaluate, flush, rehydrate, getOpenAlerts, findOpenAlert, acknowledge, setNotifier, RULES };