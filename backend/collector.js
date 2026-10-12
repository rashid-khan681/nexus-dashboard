'use strict';

const os = require('os');
const fs = require('fs');
const { monitorEventLoopDelay } = require('perf_hooks');

const LOOP_RESOLUTION_MS = 20;
const loopHistogram = monitorEventLoopDelay({ resolution: LOOP_RESOLUTION_MS });
loopHistogram.enable();

const round1 = (n) => Math.round(n * 10) / 10;

let previousCpu = null;
let previousNet = null;

function readCpuTimes() {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    const t = cpu.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

/** CPU utilisation (%) across all cores since the previous call. Null on the first call. */
function readCpuPercent() {
  const current = readCpuTimes();
  const prev = previousCpu;
  previousCpu = current;
  if (!prev) return null;

  const totalDiff = current.total - prev.total;
  const idleDiff = current.idle - prev.idle;
  if (totalDiff <= 0) return null;
  return round1(100 * (1 - idleDiff / totalDiff));
}

/** Memory utilisation based on the memory the kernel reports as available. */
function readMemory() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return {
    pct: round1((used / total) * 100),
    usedMb: Math.round(used / 1048576),
    totalMb: Math.round(total / 1048576),
  };
}

/** Disk utilisation (%) of the filesystem that holds "/". Null if unsupported. */
async function readDiskPercent() {
  try {
    const s = await fs.promises.statfs('/');
    const used = (s.blocks - s.bfree) * s.bsize;
    const available = s.bavail * s.bsize;
    if (used + available <= 0) return null;
    return round1((used / (used + available)) * 100);
  } catch {
    return null;
  }
}

/** Network throughput in bytes per second, from /proc/net/dev (Linux only). */
function readNetworkRates() {
  try {
    const raw = fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2);
    let rx = 0;
    let tx = 0;
    for (const line of raw) {
      const [iface, rest] = line.split(':');
      if (!rest || iface.trim() === 'lo') continue;
      const cols = rest.trim().split(/\s+/).map(Number);
      rx += cols[0] || 0;
      tx += cols[8] || 0;
    }
    const now = Date.now();
    const prev = previousNet;
    previousNet = { rx, tx, now };
    if (!prev) return { rxBps: null, txBps: null };
    const seconds = (now - prev.now) / 1000;
    if (seconds <= 0) return { rxBps: null, txBps: null };
    return {
      rxBps: Math.max(0, Math.round((rx - prev.rx) / seconds)),
      txBps: Math.max(0, Math.round((tx - prev.tx) / seconds)),
    };
  } catch {
    return { rxBps: null, txBps: null };
  }
}

/**
 * Event-loop lag (p99, ms) since the previous call: a real health signal of this service.
 * Node reports the timer resolution as a baseline delay, so it is subtracted here.
 */
function readLoopLagMs() {
  const p99 = loopHistogram.percentile(99) / 1e6;
  loopHistogram.reset();
  if (!Number.isFinite(p99)) return null;
  return round1(Math.max(0, p99 - LOOP_RESOLUTION_MS));
}

/**
 * Collects one telemetry sample. Everything here is measured, nothing is simulated.
 * @param {{probeDb: Function, sockets: number}} deps
 */
async function collect({ probeDb, sockets }) {
  const [disk, dbProbe] = await Promise.all([readDiskPercent(), probeDb()]);
  const mem = readMemory();
  const net = readNetworkRates();

  return {
    ts: Date.now(),
    cpu_pct: readCpuPercent(),
    mem_pct: mem.pct,
    mem_used_mb: mem.usedMb,
    mem_total_mb: mem.totalMb,
    disk_pct: disk,
    load1: round1(os.loadavg()[0]),
    cores: os.cpus().length,
    db_ok: dbProbe.ok,
    db_latency_ms: dbProbe.latencyMs,
    loop_lag_ms: readLoopLagMs(),
    sockets,
    net_rx_bps: net.rxBps,
    net_tx_bps: net.txBps,
    host_uptime_s: Math.round(os.uptime()),
    process_uptime_s: Math.round(process.uptime()),
  };
}

module.exports = { collect };