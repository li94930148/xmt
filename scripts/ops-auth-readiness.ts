import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

type Pm2Process = { name?: string; pm2_env?: { status?: string; pm_uptime?: number; restart_time?: number }; monit?: { memory?: number }; pid?: number };
type SocketSummary = { activeConnections?: number; counters?: Record<string, number> };

const appName = process.env.XMT_PM2_APP || 'xmt-api';
const baseUrl = process.env.XMT_OPS_BASE_URL || 'http://127.0.0.1:3001';
const dbPath = process.env.XMT_DB_PATH || path.join(process.cwd(), 'data/xmt.db');
const minConnections = Math.max(1, Number(process.env.XMT_AUTH_READINESS_MIN_CONNECTIONS || 50));
const maxUnknownRate = Math.max(0, Number(process.env.XMT_AUTH_READINESS_MAX_UNKNOWN_RATE || 0.01));

function command(command: string, args: string[]): string | null {
  try { return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
}

async function json(url: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return null;
    return await response.json() as Record<string, unknown>;
  } catch { return null; }
}

function databaseQuickCheck() {
  if (!fs.existsSync(dbPath)) return null;
  return command('sqlite3', [dbPath, 'PRAGMA quick_check;']) === 'ok';
}

const pm2Rows = (() => { try { return JSON.parse(command('pm2', ['jlist']) || '[]') as Pm2Process[]; } catch { return [] as Pm2Process[]; } })();
const processInfo = pm2Rows.find((row) => row.name === appName) ?? null;
const health = await json(`${baseUrl}/api/health`);
const socketResponse = await json(`${baseUrl}/internal/socket-lifecycle/summary`);
const runtime = await json(`${baseUrl}/internal/ops/runtime`);
const summary = socketResponse?.summary as SocketSummary | undefined;
const counters = summary?.counters || {};
const connections = Number(counters.connection || 0);
const unknownEntries = Object.entries(counters).filter(([key]) => key.startsWith('session_id_unknown.'));
const unknownTotal = unknownEntries.reduce((total, [, count]) => total + Number(count || 0), 0);
const uptimeMs = processInfo?.pm2_env?.pm_uptime ? Math.max(0, Date.now() - processInfo.pm2_env.pm_uptime) : null;
const unknownRate = connections > 0 ? unknownTotal / connections : null;

const reasons: string[] = [];
if (!processInfo || processInfo.pm2_env?.status !== 'online') reasons.push('PM2 进程未在线或不可读取');
if (!health) reasons.push('健康检查不可用');
if (databaseQuickCheck() !== true) reasons.push('SQLite quick_check 未通过或不可读取');
if (!summary) reasons.push('Socket 生命周期摘要不可读取');
if (!runtime) reasons.push('运行时内存摘要不可读取');
if (connections < minConnections) reasons.push(`连接样本不足：${connections}/${minConnections}`);
if (uptimeMs !== null && uptimeMs < 24 * 60 * 60 * 1000) reasons.push('进程运行不足 24 小时');
if (unknownRate !== null && unknownRate > maxUnknownRate) reasons.push(`Session ID unknown 比率过高：${unknownRate.toFixed(4)}`);

const result = !processInfo || !health || databaseQuickCheck() === false
  ? 'NO-GO'
  : reasons.length > 0 ? 'INSUFFICIENT_DATA' : 'GO';

console.log(JSON.stringify({
  result,
  reasons,
  process: processInfo ? {
    status: processInfo.pm2_env?.status || 'unknown',
    uptimeMs,
    restartCount: Number(processInfo.pm2_env?.restart_time || 0),
    rss: Number(processInfo.monit?.memory || 0),
  } : null,
  memory: runtime?.memory || null,
  socket: {
    activeConnections: Number(summary?.activeConnections || 0), connections,
    disconnects: Number(counters.disconnect || 0), reconnects: Number(counters.reconnect || 0),
    sessionIdUnknown: unknownTotal, sessionIdUnknownByCategory: Object.fromEntries(unknownEntries), unknownRate,
  },
  health: Boolean(health), databaseQuickCheck: databaseQuickCheck(), readOnly: true,
}, null, 2));

if (result !== 'GO') process.exitCode = 1;
