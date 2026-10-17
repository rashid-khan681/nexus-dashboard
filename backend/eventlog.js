'use strict';

const db = require('./database');

const RING_MAX = 300;
const PERSISTED_LEVELS = new Set(['info', 'warn', 'error']);

const ring = [];
let seq = 0;
let liveListener = null;

/** Registers a callback that receives every new event (used for the socket live tail). */
function onEvent(listener) {
  liveListener = listener;
}

/**
 * Records a system event: console, in-memory ring, PostgreSQL (info and above)
 * and the live socket stream. Never throws.
 */
function log(level, source, message, meta = null) {
  seq += 1;
  const entry = { seq, ts: new Date().toISOString(), level, source, message, meta };

  ring.push(entry);
  if (ring.length > RING_MAX) ring.shift();

  const line = `[${source}] ${message}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);

  if (PERSISTED_LEVELS.has(level)) {
    db.query('INSERT INTO events (level, source, message, meta) VALUES ($1, $2, $3, $4)', [
      level,
      source,
      message,
      meta ? JSON.stringify(meta) : null,
    ]).catch((err) => console.error('[eventlog] could not persist event:', err.message));
  }

  if (liveListener) {
    try {
      liveListener(entry);
    } catch (err) {
      console.error('[eventlog] live listener failed:', err.message);
    }
  }
  return entry;
}

function recent(limit = 50) {
  return ring.slice(-limit);
}

module.exports = { log, onEvent, recent };
