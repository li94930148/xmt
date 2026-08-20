import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { createInterface } from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';

export type WorkerEvent = { id: string; event: 'started'|'progress'|'login_required'|'capture'|'export'|'warning'|'error'|'completed'|'cancelled'; data: Record<string, unknown> };
type Pending = { resolve: (value: WorkerEvent) => void; reject: (reason: Error) => void; timer: NodeJS.Timeout };

export class ScraplingWorkerBridge {
  private child: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<string, Pending>();
  private readonly listeners = new Set<(event: WorkerEvent) => void>();
  constructor(private readonly root: string, private readonly onDiagnostic: (message: string) => void = () => undefined) {}

  onEvent(listener: (event: WorkerEvent) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  runtime() {
    const collector = path.join(this.root, 'collector');
    const python = process.env.XMT_COLLECTOR_PYTHON || path.join(collector, '.venv', 'bin', 'python');
    return { python, worker: path.join(collector, 'xmt_collector', 'runtime', 'worker.py'), available: fs.existsSync(python) && fs.existsSync(path.join(collector, 'xmt_collector', 'runtime', 'worker.py')) };
  }
  async start() {
    if (this.child) return;
    const runtime = this.runtime();
    if (!runtime.available) throw new Error('Scrapling Collector 未安装：请使用 Python 3.10+ 在 collector/.venv 安装 requirements.lock。');
    this.child = spawn(runtime.python, [runtime.worker], { cwd: path.join(this.root, 'collector'), env: { ...process.env, PYTHONPATH: path.join(this.root, 'collector') }, stdio: 'pipe' });
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
    if (message.event === 'error') pending.reject(new Error(String(message.data.message || 'Scrapling Worker 执行失败'))); else pending.resolve(message);
  }
}
