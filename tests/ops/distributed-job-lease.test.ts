import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { distributedJobLeasesMigration } from '../../api/database/migrations/024_distributed_job_leases.js';
import { migrationPolicies } from '../../api/database/migrations/policy.js';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-distributed-job-lease-'));
const databasePath = path.join(temporaryDirectory, 'leases.test.db');
const leaseDurationMs = 1100;
const renewIntervalMs = 250;
type WorkerMessage = { type: string; fencingToken?: number; renewed?: boolean; released?: boolean; status?: string; value?: string };

class LeaseWorker {
  child: ChildProcessWithoutNullStreams;
  messages: WorkerMessage[] = [];
  waiters: Array<{ predicate: (message: WorkerMessage) => boolean; resolve: (message: WorkerMessage) => void; timer: NodeJS.Timeout }> = [];
  stderr = '';
  lines: ReturnType<typeof createInterface>;

  constructor() {
    const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const workerPath = path.join(projectRoot, 'tests/ops/distributed-job-lease-worker.ts');
    this.child = spawn(process.execPath, ['--import', 'tsx', workerPath], {
      cwd: projectRoot,
      env: {
        PATH: process.env.PATH || '',
        NODE_ENV: 'test',
        XMT_DB_PATH: databasePath,
        XMT_TEST_JOB_LEASE_MS: String(leaseDurationMs),
        XMT_TEST_JOB_RENEW_MS: String(renewIntervalMs),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.lines = createInterface({ input: this.child.stdout });
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (chunk: string) => { this.stderr += chunk; });
    this.lines.on('line', (line) => {
      let message: WorkerMessage;
      try { message = JSON.parse(line) as WorkerMessage; }
      catch { return; } // The database client writes a human-readable close notice to stdout.
      this.messages.push(message);
      for (let index = this.waiters.length - 1; index >= 0; index -= 1) {
        const waiter = this.waiters[index]!;
        if (!waiter.predicate(message)) continue;
        clearTimeout(waiter.timer);
        this.waiters.splice(index, 1);
        waiter.resolve(message);
      }
    });
    this.child.once('exit', (code) => {
      for (const waiter of this.waiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.resolve({ type: `worker-exited-${code}` });
      }
    });
  }

  send(action: string, extra: Record<string, unknown> = {}) {
    this.child.stdin.write(`${JSON.stringify({ action, ...extra })}\n`);
  }

  waitFor(type: string, timeoutMs = 8000): Promise<WorkerMessage> {
    const existingIndex = this.messages.findIndex((message) => message.type === type);
    if (existingIndex >= 0) return Promise.resolve(this.messages.splice(existingIndex, 1)[0]!);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((waiter) => waiter.resolve !== resolve);
        reject(new Error(`Timed out waiting for ${type}: ${this.stderr}`));
      }, timeoutMs);
      this.waiters.push({ predicate: (message) => message.type === type, resolve, timer });
    });
  }

  waitForEither(types: string[], timeoutMs = 8000): Promise<WorkerMessage> {
    const existingIndex = this.messages.findIndex((message) => types.includes(message.type));
    if (existingIndex >= 0) return Promise.resolve(this.messages.splice(existingIndex, 1)[0]!);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((waiter) => waiter.resolve !== resolve);
        reject(new Error(`Timed out waiting for ${types.join(' or ')}; child=${this.child.exitCode}/${this.child.signalCode}; messages=${JSON.stringify(this.messages)}; stderr=${this.stderr}`));
      }, timeoutMs);
      this.waiters.push({ predicate: (message) => types.includes(message.type), resolve, timer });
    });
  }

  async stop() {
    if (this.child.exitCode !== null) return;
    this.send('stop');
    await new Promise<void>((resolve) => this.child.once('exit', () => resolve()));
    this.lines.close();
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const setupClient = createClient({ url: `file:${databasePath}` });
await distributedJobLeasesMigration.up(setupClient);
setupClient.close();
assert.equal(migrationPolicies['024'], 'SAFE_EXPAND');

const first = new LeaseWorker();
const second = new LeaseWorker();
const workers = [first, second];
try {
  await Promise.all(workers.map((worker) => worker.waitFor('ready')));
  first.send('run');
  second.send('run');
  const initial = await Promise.all([
    first.waitForEither(['task-started', 'run-busy']),
    second.waitForEither(['task-started', 'run-busy']),
  ]);
  const started = initial.filter((message) => message.type === 'task-started');
  const busy = initial.filter((message) => message.type === 'run-busy');
  assert.equal(started.length, 1, 'two API processes must not execute the same job at once');
  assert.equal(busy.length, 1, 'the losing process should report the active lease as busy');
  const owner = initial[0]!.type === 'task-started' ? first : second;
  const nonOwner = owner === first ? second : first;

  await sleep(2400);
  nonOwner.send('run');
  await nonOwner.waitFor('run-busy');
  owner.send('finish');
  const completed = await owner.waitFor('run-finished');
  assert.equal(completed.status, 'completed', 'the owner should finish after renewing beyond its initial lease');

  nonOwner.send('run');
  await nonOwner.waitFor('task-started');
  nonOwner.send('expire-job');
  await nonOwner.waitFor('job-expired');
  await nonOwner.waitFor('task-aborted');
  await nonOwner.waitFor('assert-invalidated');
  const lost = await nonOwner.waitFor('run-finished');
  assert.equal(lost.status, 'lease_lost', 'the runner should abort and refuse success when its lease expires');
  await Promise.all(workers.map((worker) => worker.stop()));

  const crashed = new LeaseWorker();
  workers.push(crashed);
  await crashed.waitFor('ready');
  crashed.send('claim', { crashAfterClaim: true, jobName: 'test:crash-expiry' });
  const abandoned = await crashed.waitFor('claimed');
  await new Promise<void>((resolve, reject) => {
    crashed.child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`crash fixture exited ${code}: ${crashed.stderr}`)));
  });
  await sleep(1400);

  const recovery = new LeaseWorker();
  workers.push(recovery);
  await recovery.waitFor('ready');
  recovery.send('claim', { jobName: 'test:crash-expiry' });
  const recovered = await recovery.waitFor('claimed');
  assert(Number(recovered.fencingToken) > Number(abandoned.fencingToken), 'expired takeover must advance the fencing token');

  recovery.send('release');
  assert.equal((await recovery.waitFor('released')).released, true);

  const staleOwner = new LeaseWorker();
  const nextOwner = new LeaseWorker();
  const observer = new LeaseWorker();
  workers.push(staleOwner, nextOwner, observer);
  await Promise.all([staleOwner, nextOwner, observer].map((worker) => worker.waitFor('ready')));
  staleOwner.send('claim', { jobName: 'test:stale-owner' });
  const original = await staleOwner.waitFor('claimed');
  await sleep(1400);
  nextOwner.send('claim', { jobName: 'test:stale-owner' });
  const takeover = await nextOwner.waitFor('claimed');
  assert(Number(takeover.fencingToken) > Number(original.fencingToken));
  staleOwner.send('renew');
  assert.equal((await staleOwner.waitFor('renewed')).renewed, false, 'an expired former owner cannot renew after takeover');
  staleOwner.send('release');
  assert.equal((await staleOwner.waitFor('released')).released, false, 'an expired former owner cannot release the new owner lease');
  observer.send('claim', { jobName: 'test:stale-owner' });
  await observer.waitFor('claim-busy');
  nextOwner.send('release');
  assert.equal((await nextOwner.waitFor('released')).released, true);
  observer.send('claim', { jobName: 'test:stale-owner' });
  await observer.waitFor('claimed');
  observer.send('release');
  assert.equal((await observer.waitFor('released')).released, true);
  console.log('Distributed job lease tests passed: process exclusion, renewal, release, crash expiry recovery, fencing token progression');
} finally {
  await Promise.all(workers.map((worker) => worker.stop().catch(() => undefined)));
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
