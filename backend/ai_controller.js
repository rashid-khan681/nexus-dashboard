'use strict';

/**
 * Evidence-grounded incident analysis.
 *
 * Design rules (no fake AI):
 *  1. The model only sees measured evidence and must answer in strict JSON.
 *  2. Every number in the answer must exist in the evidence, otherwise the
 *     answer is rejected (basic hallucination guard).
 *  3. If the model is unavailable, rejected or rate limited, a deterministic
 *     rule-based analysis is returned and clearly labelled source = "rules".
 *  4. There is no model "confidence" score: models cannot report one reliably.
 *     The UI shows the evidence instead.
 */

const config = require('./config');

const METRICS = ['cpu_pct', 'mem_pct', 'disk_pct', 'load1', 'db_latency_ms', 'loop_lag_ms', 'sockets'];

let llm = null;
let llmInitError = null;
const callTimestamps = [];
let lastCallAt = 0;
const status = { lastOkAt: null, lastError: null, lastErrorAt: null, lastTestOk: null };

/** Error messages must never leak the API key into logs, the database or the UI. */
function safeMessage(message) {
  const text = String(message);
  return config.ai.apiKey ? text.split(config.ai.apiKey).join('[redacted]') : text;
}

function initModel() {
  if (llm || llmInitError) return;
  if (!config.ai.apiKey) {
    llmInitError = 'GEMINI_API_KEY is not set';
    return;
  }
  if (!config.ai.model) {
    llmInitError = 'GEMINI_MODEL is not set';
    return;
  }
  try {
    const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
    llm = new ChatGoogleGenerativeAI({
      apiKey: config.ai.apiKey,
      model: config.ai.model,
      temperature: 0,
      maxRetries: 0,
    });
  } catch (err) {
    llmInitError = `could not initialise the model client: ${err.message}`;
  }
}

function getStatus() {
  initModel();
  const callsLastHour = callTimestamps.filter((t) => Date.now() - t < 3600000).length;
  let state;
  if (llmInitError) state = 'disabled';
  else if (status.lastError && (!status.lastOkAt || status.lastErrorAt > status.lastOkAt)) state = 'degraded';
  else if (status.lastOkAt) state = 'ok';
  else state = 'untested';

  return {
    state,
    model: config.ai.model || null,
    reason: llmInitError || status.lastError,
    lastOkAt: status.lastOkAt ? new Date(status.lastOkAt).toISOString() : null,
    callsLastHour,
    maxCallsPerHour: config.ai.maxCallsPerHour,
  };
}

// ---------- Evidence ----------

function summarise(history, key) {
  const values = history.map((s) => s[key]).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  const round1 = (n) => Math.round(n * 10) / 10;
  return {
    min: round1(Math.min(...values)),
    avg: round1(sum / values.length),
    max: round1(Math.max(...values)),
    last: round1(values[values.length - 1]),
  };
}

/** Builds the exact evidence object that is sent to the model and stored with the analysis. */
function buildEvidence(history, alert) {
  const window = history.slice(-30);
  const metrics = {};
  for (const key of METRICS) {
    const s = summarise(window, key);
    if (s) metrics[key] = s;
  }
  const first = window[0];
  const last = window[window.length - 1];
  return {
    window_seconds: first && last ? Math.round((last.ts - first.ts) / 1000) : 0,
    samples: window.length,
    alert: {
      rule: alert.rule,
      severity: alert.severity,
      metric: alert.metric,
      threshold: alert.threshold,
      last_value: alert.last_value,
      peak_value: alert.peak_value,
      occurrences: alert.occurrences,
    },
    metrics,
    database_reachable: last ? last.db_ok : null,
  };
}

// ---------- Deterministic fallback ----------

const ACTIONS = {
  cpu_high: [
    'Identify the busiest processes or containers on the host (for example with `docker stats`).',
    'Check whether a recent deployment or a traffic increase matches the start of the spike.',
    'If the load is sustained, scale out or raise the instance size.',
  ],
  memory_high: [
    'Identify which container or process holds the most memory (for example with `docker stats`).',
    'Look for a memory leak or an unbounded cache in the most recent release.',
    'If usage keeps growing, restart the affected service and consider a larger instance.',
  ],
  disk_high: [
    'Remove unused Docker images and build cache (`docker system prune`, review before confirming).',
    'Check log volume and rotate or ship old logs.',
    'Expand the volume if growth is expected.',
  ],
  db_latency_high: [
    'Check PostgreSQL for long-running or blocked queries.',
    'Verify the database host is not CPU or disk constrained.',
    'Review recent schema or query changes.',
  ],
  event_loop_lag: [
    'Look for synchronous or CPU-heavy code in the backend request path.',
    'Check whether CPU saturation on the host coincides with the lag.',
  ],
  db_unreachable: [
    'Check that the database container or instance is running and healthy.',
    'Verify credentials and network rules between the backend and the database.',
  ],
};

function ruleBasedAnalysis(alert, evidence, reason) {
  const m = evidence.metrics[alert.metric];
  const parts = [];
  if (m) {
    parts.push(
      `${alert.metric} averaged ${m.avg} (peak ${m.max}) over the last ${evidence.window_seconds} seconds against a threshold of ${alert.threshold}.`
    );
  } else {
    parts.push(`${alert.title} is active (${evidence.samples} samples in the window).`);
  }
  const sockets = evidence.metrics.sockets;
  if (sockets && alert.metric !== 'sockets') {
    parts.push(`Connected clients: ${sockets.last}.`);
  }
  return {
    source: 'rules',
    model: null,
    summary: parts.join(' '),
    likely_cause: null,
    recommended_actions: ACTIONS[alert.rule] || ['Investigate the affected component.'],
    evidence,
    latency_ms: 0,
    fallback_reason: reason || null,
  };
}

// ---------- Validation ----------

function numbersIn(text) {
  return (String(text).match(/\d+(?:\.\d+)?/g) || []).map(Number);
}

function allowedNumberSet(evidence) {
  const allowed = new Set();
  for (const n of numbersIn(JSON.stringify(evidence))) {
    allowed.add(n.toFixed(1));
    allowed.add(String(Math.round(n)));
  }
  return allowed;
}

/** Returns a clean object or throws an Error describing why the answer is rejected. */
function validateModelAnswer(raw, evidence) {
  const match = String(raw).match(/\{[\s\S]*\}/);
  if (!match) throw new Error('response contained no JSON object');

  let parsed;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error('response was not valid JSON');
  }

  const { summary, likely_cause: likelyCause, recommended_actions: actions } = parsed;
  if (typeof summary !== 'string' || summary.trim() === '' || summary.length > 400) {
    throw new Error('summary missing or too long');
  }
  if (likelyCause !== null && (typeof likelyCause !== 'string' || likelyCause.length > 300)) {
    throw new Error('likely_cause must be a short string or null');
  }
  if (!Array.isArray(actions) || actions.length === 0 || actions.length > 3) {
    throw new Error('recommended_actions must contain 1 to 3 items');
  }
  if (!actions.every((a) => typeof a === 'string' && a.length > 0 && a.length <= 200)) {
    throw new Error('recommended_actions items must be short strings');
  }

  const allowed = allowedNumberSet(evidence);
  const cited = numbersIn([summary, likelyCause || '', ...actions].join(' '));
  const invented = cited.filter((n) => !allowed.has(n.toFixed(1)) && !allowed.has(String(Math.round(n))));
  if (invented.length > 0) {
    throw new Error(`answer cites numbers that are not in the evidence: ${invented.join(', ')}`);
  }

  return {
    summary: summary.trim(),
    likely_cause: likelyCause ? likelyCause.trim() : null,
    recommended_actions: actions.map((a) => a.trim()),
  };
}

// ---------- Model call ----------

function buildPrompt(evidence) {
  return [
    'You are a site reliability assistant. Analyse ONLY the evidence JSON below.',
    'Rules:',
    '1. Use only numbers that appear in the evidence. Never invent metrics, hosts, causes or history.',
    '2. If the evidence does not prove a cause, set "likely_cause" to null.',
    '3. "recommended_actions" must be 1 to 3 safe, reversible operational steps.',
    '4. Reply with one JSON object and nothing else (no markdown):',
    '{"summary": string (max 40 words), "likely_cause": string or null, "recommended_actions": string[]}',
    '',
    `EVIDENCE: ${JSON.stringify(evidence)}`,
  ].join('\n');
}

function checkRateLimit() {
  const now = Date.now();
  while (callTimestamps.length && now - callTimestamps[0] > 3600000) callTimestamps.shift();
  if (callTimestamps.length >= config.ai.maxCallsPerHour) {
    return `hourly AI call limit reached (${config.ai.maxCallsPerHour})`;
  }
  if (now - lastCallAt < config.ai.minIntervalMs) return 'AI calls are being throttled';
  return null;
}

async function invokeModel(prompt) {
  callTimestamps.push(Date.now());
  lastCallAt = Date.now();
  const response = await llm.invoke(prompt, { signal: AbortSignal.timeout(config.ai.timeoutMs) });
  const content = Array.isArray(response.content)
    ? response.content.map((c) => (typeof c === 'string' ? c : c.text || '')).join('')
    : String(response.content);
  return content;
}

/**
 * Analyses an alert. Always resolves with an analysis object; it never throws
 * and never fakes a model answer.
 */
async function analyze(alert, history) {
  const evidence = buildEvidence(history, alert);

  initModel();
  if (llmInitError) return ruleBasedAnalysis(alert, evidence, `AI disabled: ${llmInitError}`);

  const limited = checkRateLimit();
  if (limited) return ruleBasedAnalysis(alert, evidence, limited);

  const started = Date.now();
  try {
    const raw = await invokeModel(buildPrompt(evidence));
    const clean = validateModelAnswer(raw, evidence);
    status.lastOkAt = Date.now();
    return {
      source: 'gemini',
      model: config.ai.model,
      ...clean,
      evidence,
      latency_ms: Date.now() - started,
      fallback_reason: null,
    };
  } catch (err) {
    const message = safeMessage(err.message);
    status.lastError = message;
    status.lastErrorAt = Date.now();
    console.error(`[ai] model call failed or was rejected: ${message}`);
    return ruleBasedAnalysis(alert, evidence, `AI unavailable: ${message}`);
  }
}

/** Minimal connectivity check used by POST /api/ai/test. */
async function testConnection() {
  initModel();
  if (llmInitError) return { ok: false, error: llmInitError };
  const limited = checkRateLimit();
  if (limited) return { ok: false, error: limited };

  const started = Date.now();
  try {
    const raw = await invokeModel('Reply with exactly this JSON and nothing else: {"ok": true}');
    const ok = /"ok"\s*:\s*true/.test(raw);
    if (ok) {
      status.lastOkAt = Date.now();
      status.lastTestOk = true;
    }
    return { ok, latency_ms: Date.now() - started, model: config.ai.model };
  } catch (err) {
    const message = safeMessage(err.message);
    status.lastError = message;
    status.lastErrorAt = Date.now();
    status.lastTestOk = false;
    return { ok: false, error: message, model: config.ai.model };
  }
}

module.exports = { analyze, buildEvidence, getStatus, testConnection, validateModelAnswer };