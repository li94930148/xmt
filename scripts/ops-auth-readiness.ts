import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { assessAuthReadiness } from '../api/modules/auth/rollout/auth-readiness-decision.js';

type Pm2Process = { name?: string; pm2_env?: { status?: string; pm_uptime?: number; restart_time?: number }; monit?: { memory?: number } };
type SocketSummary = { activeConnections?: number; counters?: Record<string, number> };

const appName = process.env.XMT_PM2_APP || 'xmt-api';
const baseUrl = process.env.XMT_OPS_BASE_URL || 'http://127.0.0.1:3001';
const dbPath = process.env.XMT_DB_PATH || path.join(process.cwd(), 'data/xmt.db');
const numberEnv = (name: string, fallback: number) => Math.max(0, Number(process.env[name] || fallback));
const thresholds = {
  minConnections: Math.max(1, numberEnv('XMT_AUTH_READINESS_MIN_CONNECTIONS', 50)),
  maxUnknownRate: numberEnv('XMT_AUTH_READINESS_MAX_UNKNOWN_RATE', 0.01),
  maxRestarts: numberEnv('XMT_AUTH_READINESS_MAX_RESTARTS', 2),
  maxRssBytes: numberEnv('XMT_AUTH_READINESS_MAX_RSS_BYTES', 512 * 1024 * 1024),
  maxHeapRatio: numberEnv('XMT_AUTH_READINESS_MAX_HEAP_RATIO', 0.85),
  minSampleWindowMs: numberEnv('XMT_AUTH_READINESS_MIN_SAMPLE_WINDOW_MS', 24 * 60 * 60 * 1000),
};

function command(commandName: string, args: string[]): string | null {
  try { return execFileSync(commandName, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
}

async function probe(url: string): Promise<{ available: boolean; ok?: boolean; body?: Record<string, unknown> }> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    return { available: true, ok: response.ok, body };
  } catch { return { available: false }; }
}

function databaseProbe() {
  if (!fs.existsSync(dbPath)) return { available: false };
  const result = command('sqlite3', [dbPath, 'PRAGMA quick_check;']);
  return result === null ? { available: false } : { available: true, quickCheck: result };
}

const pm2Raw = command('pm2', ['jlist']);
let pm2Rows: Pm2Process[] = [];
try { pm2Rows = pm2Raw === null ? [] : JSON.parse(pm2Raw) as Pm2Process[]; } catch { pm2Rows = []; }
const processInfo = pm2Rows.find((row) => row.name === appName);
const [healthProbe, socketProbe, runtimeProbe] = await Promise.all([
  probe(`${baseUrl}/api/health`), probe(`${baseUrl}/internal/socket-lifecycle/summary`), probe(`${baseUrl}/internal/ops/runtime`),
]);
const summary = socketProbe.body?.summary as SocketSummary | undefined;
const counters = summary?.counters || {};
const connections = Number(counters.connection || 0);
const unknownEntries = Object.entries(counters).filter(([key]) => key.startsWith('session_id_unknown.'));
const unknownTotal = unknownEntries.reduce((total, [, count]) => total + Number(count || 0), 0);
const runtimeMemory = runtimeProbe.body?.memory as { rss?: number; heapUsed?: number; heapTotal?: number } | undefined;
const uptimeMs = processInfo?.pm2_env?.pm_uptime ? Math.max(0, Date.now() - processInfo.pm2_env.pm_uptime) : undefined;
const assessment = assessAuthReadiness({
  pm2: { available: pm2Raw !== null && Boolean(processInfo), status: processInfo?.pm2_env?.status, restartCount: processInfo?.pm2_env?.restart_time, uptimeMs },
  health: { available: healthProbe.available, ok: healthProbe.ok },
  database: databaseProbe(),
  memory: { available: runtimeProbe.available && runtimeProbe.ok === true && Boolean(runtimeMemory), ...runtimeMemory },
  socket: { available: socketProbe.available && socketProbe.ok === true && Boolean(summary), connections, unknownTotal },
  thresholds,
});
const reasons = Object.entries(assessment.checks).flatMap(([name, check]) => check.status === 'PASS' ? [] : [`${name}: ${check.reason}`]);

console.log(JSON.stringify({
  decision: assessment.decision, result: assessment.decision, checks: assessment.checks, reasons,
  metrics: {
    process: processInfo ? { status: processInfo.pm2_env?.status || 'unknown', uptimeMs, restartCount: Number(processInfo.pm2_env?.restart_time || 0), rss: Number(processInfo.monit?.memory || 0) } : null,
    memory: runtimeMemory || null,
    socket: { activeConnections: Number(summary?.activeConnections || 0), connections, disconnects: Number(counters.disconnect || 0), reconnects: Number(counters.reconnect || 0), sessionIdUnknown: unknownTotal },
  },
  readOnly: true,
}, null, 2));

if (assessment.decision !== 'GO') process.exitCode = 1;
