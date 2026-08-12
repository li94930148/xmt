export type ReadinessStatus = 'PASS' | 'FAIL' | 'UNKNOWN';
export type ReadinessDecision = 'GO' | 'NO-GO' | 'INSUFFICIENT_DATA';
export type ReadinessCheck = { status: ReadinessStatus; reason?: string };

export type AuthReadinessInput = {
  pm2?: { available: boolean; status?: string; restartCount?: number; uptimeMs?: number };
  health?: { available: boolean; ok?: boolean };
  database?: { available: boolean; quickCheck?: string };
  memory?: { available: boolean; rss?: number; heapUsed?: number; heapTotal?: number };
  socket?: { available: boolean; connections?: number; unknownTotal?: number };
  thresholds: { minConnections: number; maxUnknownRate: number; maxRestarts: number; maxRssBytes: number; maxHeapRatio: number; minSampleWindowMs: number };
};

export type AuthReadinessAssessment = {
  decision: ReadinessDecision;
  checks: Record<'pm2' | 'health' | 'database' | 'memory' | 'socket' | 'sample_window', ReadinessCheck>;
};

const pass = (): ReadinessCheck => ({ status: 'PASS' });
const fail = (reason: string): ReadinessCheck => ({ status: 'FAIL', reason });
const unknown = (reason: string): ReadinessCheck => ({ status: 'UNKNOWN', reason });

export function assessAuthReadiness(input: AuthReadinessInput): AuthReadinessAssessment {
  const { thresholds } = input;
  const pm2 = !input.pm2?.available
    ? unknown('PM2 进程信息不可读取')
    : input.pm2.status !== 'online'
      ? fail(`PM2 进程状态异常：${input.pm2.status || 'unknown'}`)
      : Number(input.pm2.restartCount || 0) > thresholds.maxRestarts
        ? fail(`PM2 重启次数过高：${input.pm2.restartCount}/${thresholds.maxRestarts}`)
        : pass();
  const health = !input.health?.available
    ? unknown('健康检查端点不可读取')
    : input.health.ok ? pass() : fail('健康检查返回异常状态');
  const database = !input.database?.available
    ? unknown('SQLite quick_check 不可读取')
    : input.database.quickCheck === 'ok' ? pass() : fail(`SQLite quick_check 失败：${input.database.quickCheck || 'empty'}`);
  const heapRatio = input.memory?.heapTotal && input.memory.heapTotal > 0 ? Number(input.memory.heapUsed || 0) / input.memory.heapTotal : null;
  const memory = !input.memory?.available
    ? unknown('运行时内存摘要不可读取')
    : Number(input.memory.rss || 0) > thresholds.maxRssBytes
      ? fail(`RSS 超过阈值：${input.memory.rss}/${thresholds.maxRssBytes}`)
      : heapRatio === null
        ? unknown('heap 使用率不可读取')
        : heapRatio > thresholds.maxHeapRatio
          ? fail(`heap 使用率过高：${heapRatio.toFixed(4)}/${thresholds.maxHeapRatio}`)
          : pass();
  const connections = input.socket?.connections;
  const unknownRate = input.socket?.available && typeof connections === 'number' && connections > 0
    ? Number(input.socket.unknownTotal || 0) / connections : null;
  const socket = !input.socket?.available
    ? unknown('Socket 生命周期摘要不可读取')
    : typeof connections !== 'number'
      ? unknown('Socket 连接样本不可读取')
      : connections < thresholds.minConnections
        ? unknown(`连接样本不足：${connections}/${thresholds.minConnections}`)
        : unknownRate !== null && unknownRate > thresholds.maxUnknownRate
          ? fail(`Session ID unknown 比率过高：${unknownRate.toFixed(4)}/${thresholds.maxUnknownRate}`)
          : pass();
  const sampleWindow = !input.pm2?.available || typeof input.pm2.uptimeMs !== 'number'
    ? unknown('无法证明业务样本观察窗口')
    : input.pm2.uptimeMs < thresholds.minSampleWindowMs
      ? unknown(`业务样本观察窗口不足：${input.pm2.uptimeMs}/${thresholds.minSampleWindowMs}`)
      : pass();
  const checks = { pm2, health, database, memory, socket, sample_window: sampleWindow };
  const statuses = Object.values(checks).map((check) => check.status);
  const decision: ReadinessDecision = statuses.includes('FAIL') ? 'NO-GO' : statuses.includes('UNKNOWN') ? 'INSUFFICIENT_DATA' : 'GO';
  return { decision, checks };
}
