import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { createInterface } from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';

export type WorkerEvent = { id: string; event: 'started'|'progress'|'login_required'|'capture'|'export'|'warning'|'error'|'completed'|'cancelled'; data: Record<string, unknown> };
type Pending = { resolve: (value: WorkerEvent) => void; reject: (reason: Error) => void; timer: NodeJS.Timeout };
export class CollectorLoginRequiredError extends Error {
  readonly code = "COLLECTOR_LOGIN_REQUIRED" as const;
  constructor(message = "抖音 Creator Center 需要重新认证。") { super(message); this.name = "CollectorLoginRequiredError"; }
}
export function workerTerminalError(message: WorkerEvent): Error | null {
  if (message.event === "error") return new Error(String(message.data.message || "Scrapling Worker 执行失败"));
  if (message.event === "login_required") return new CollectorLoginRequiredError(String(message.data.message || "抖音 Creator Center 需要重新认证。"));
  return null;
}
export type CollectorRuntimeCode = 'READY'|'RUNTIME_ROOT_NOT_FOUND'|'PYTHON_NOT_FOUND'|'WORKER_NOT_FOUND'|'PACKAGED_RUNTIME_NOT_FOUND';
export type CollectorRuntime = { code: CollectorRuntimeCode; mode: 'source-python'|'packaged-worker'; collector: string; python?: string; worker?: string; executable?: string; requirements?: string; available: boolean };
export function resolveCollectorRuntime(root: string, platform = process.platform, packaged = false): CollectorRuntime {
  if (packaged) {
    const collector = path.join(root, 'collector-runtime');
    const executableName = platform === 'win32' ? 'xmt-collector-worker.exe' : 'xmt-collector-worker';
    const executable = path.join(collector, 'xmt-collector-worker', executableName);
    const available = fs.existsSync(executable);
    return { code: available ? 'READY' : 'PACKAGED_RUNTIME_NOT_FOUND', mode: 'packaged-worker', collector, executable, available };
  }
  const collector = path.join(root, 'collector');
  const python = process.env.XMT_COLLECTOR_PYTHON || (platform === 'win32' ? path.join(collector, '.venv', 'Scripts', 'python.exe') : path.join(collector, '.venv', 'bin', 'python'));
  const worker = path.join(collector, 'xmt_collector', 'runtime', 'worker.py');
  const requirements = path.join(collector, 'requirements.lock');
  const code: CollectorRuntimeCode = !fs.existsSync(collector) ? 'RUNTIME_ROOT_NOT_FOUND' : !fs.existsSync(python) ? 'PYTHON_NOT_FOUND' : !fs.existsSync(worker) ? 'WORKER_NOT_FOUND' : 'READY';
  return { code, mode: 'source-python', collector, python, worker, requirements, available: code === 'READY' && fs.existsSync(requirements) };
}

export class ScraplingWorkerBridge {
  private child: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<string, Pending>();
  private readonly listeners = new Set<(event: WorkerEvent) => void>();
  constructor(private readonly root: string, private readonly onDiagnostic: (message: string) => void = () => undefined, private readonly packaged = false) {}

  onEvent(listener: (event: WorkerEvent) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  runtime() { return resolveCollectorRuntime(this.root, process.platform, this.packaged); }
  async start() {
    if (this.child) return;
    const runtime = this.runtime();
    this.onDiagnostic(`collector_runtime code=${runtime.code} collector=${runtime.collector} mode=${runtime.mode}`);
    if (!runtime.available) throw new Error(runtime.mode === 'packaged-worker'
      ? `${runtime.code}: 未找到已打包的 Collector Worker：${runtime.executable}`
      : `${runtime.code}: 未找到 Collector Python Runtime：${runtime.python}`);
    const command = runtime.mode === 'packaged-worker' ? runtime.executable : runtime.python;
    const args = runtime.mode === 'packaged-worker' ? [] : [runtime.worker!];
    if (!command) throw new Error('Collector runtime command is missing');
    this.child = spawn(command, args, { cwd: runtime.collector, env: runtime.mode === 'packaged-worker' ? { ...process.env, XMT_COLLECTOR_PYTHON: '' } : { ...process.env, PYTHONPATH: path.join(this.root, 'collector') }, stdio: 'pipe', shell: false });
    this.child.stderr.setEncoding('utf8'); this.child.stderr.on('data', value => this.onDiagnostic(`Collector: ${String(value).trim().slice(0, 500)}`));
    this.child.once('exit', (code, signal) => { const error = new Error(`Scrapling Worker 已退出（code=${code ?? 'none'}, signal=${signal ?? 'none'}）`); for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(error); } this.pending.clear(); this.child = null; });
    const reader = createInterface({ input: this.child.stdout }); reader.on('line', line => this.receive(line));
    await this.request('health', {}, 15_000);
  }
  async request(method: string, params: Record<string, unknown>, timeout = 90_000): Promise<WorkerEvent> {
    await this.start();
    const id = crypto.randomUUID();
    const response = new Promise<WorkerEvent>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Scrapling Worker ${method} 超时`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
    });
    this.child?.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    return response;
  }
  async shutdown() { try { await this.request('shutdown', {}, 10_000); } finally { this.child?.kill(); this.child = null; } }
  private receive(line: string) {
    let message: WorkerEvent; try { message = JSON.parse(line) as WorkerEvent; } catch { this.onDiagnostic('Collector 输出了无效 JSON，已忽略。'); return; }
    this.listeners.forEach(listener => listener(message));
    if (!['completed', 'error', 'login_required', 'cancelled'].includes(message.event)) return;
    const pending = this.pending.get(message.id); if (!pending) return;
    clearTimeout(pending.timer); this.pending.delete(message.id);
    const error = workerTerminalError(message);
    if (error) pending.reject(error); else pending.resolve(message);
  }
}
