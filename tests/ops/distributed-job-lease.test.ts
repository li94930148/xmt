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
import type { DistributedJobLease } from '../../api/jobs/distributedJobRunner.js';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-distributed-job-lease-'));
const databasePath = path.join(temporaryDirectory, 'leases.test.db');
process.env.XMT_DB_PATH = databasePath;
process.env.NODE_ENV = 'test';
const leaseDurationMs = 1100;
type WorkerMessage = { type: string; fencingToken?: number; renewed?: boolean; released?: boolean; status?: string; value?: string };
const { runWithAcquiredDistributedJobLease } = await import('../../api/jobs/distributedJobRunner.js');

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
        reject(new Error(`Timed out waiting for ${type}; messages=${JSON.stringify(this.messages)}; stderr=${this.stderr}`));
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

let finishHandler!: () => void;
let resolveRenewal!: (renewed: boolean) => void;
let notifyRenewalStarted!: () => void;
let releaseCount = 0;
const renewalStarted = new Promise<void>((resolve) => { notifyRenewalStarted = resolve; });
const pendingRenewal = new Promise<boolean>((resolve) => { resolveRenewal = resolve; });
const heldLease: DistributedJobLease = {
  jobName: 'test:renewal-settlement',
  fencingToken: 1,
  leaseDurationMs: 1000,
  renew: () => { notifyRenewalStarted(); return pendingRenewal; },
  assertCurrent: async () => undefined,
  release: async () => { releaseCount += 1; return true; },
};
const settlement = runWithAcquiredDistributedJobLease('test:renewal-settlement', heldLease, async () => {
  await new Promise<void>((resolve) => { finishHandler = resolve; });
  return 'handler result';
}, { renewIntervalMs: 100 });
await renewalStarted;
finishHandler();
await Promise.resolve();
resolveRenewal(false);
const settledRenewal = await settlement;
assert.equal(settledRenewal.status, 'lease_lost', 'a renewal already in flight must settle before the handler can report completion');
assert.equal(releaseCount, 1, 'the already-acquired lease must still be released after renewal settles');

const first = new LeaseWorker();
const second = new LeaseWorker();
const workers = [first, second];
try {
  await Promise.all(workers.map((worker) => worker.waitFor('ready')));

  first.send('claim', { jobName: 'test:daily-maintenance' });
  second.send('claim', { jobName: 'test:daily-maintenance' });
  const initial = await Promise.all([
    first.waitForEither(['claimed', 'claim-busy']),
    second.waitForEither(['claimed', 'claim-busy']),
  ]);
  const started = initial.filter((message) => message.type === 'claimed');
  const busy = initial.filter((message) => message.type === 'claim-busy');
  assert.equal(started.length, 1, 'two API processes must not acquire the same job lease at once');
  assert.equal(busy.length, 1, 'the losing process should report the active lease as busy');
  const owner = initial[0]!.type === 'claimed' ? first : second;
  const nonOwner = owner === first ? second : first;

  owner.send('renew');
  assert.equal((await owner.waitFor('renewed')).renewed, true, 'an active owner should renew its lease');
  owner.send('release');
  assert.equal((await owner.waitFor('released')).released, true);
  nonOwner.send('claim', { jobName: 'test:daily-maintenance' });
  const afterRelease = await nonOwner.waitFor('claimed');
  assert(Number(afterRelease.fencingToken) > Number(started[0]!.fencingToken), 'a new owner should receive a later fencing token');
  nonOwner.send('release');
  assert.equal((await nonOwner.waitFor('released')).released, true);

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
  console.log('Distributed job lease tests passed: in-flight renewal settlement, multi-process exclusion, renewal/release, crash expiry recovery, fencing token progression');
} finally {
  await Promise.all(workers.map((worker) => worker.stop().catch(() => undefined)));
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
