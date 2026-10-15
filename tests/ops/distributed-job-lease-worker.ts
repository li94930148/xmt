import { closeDatabase, db } from '../../api/database/db.js';
import { acquireDistributedJobLease, runWithDistributedJobLease } from '../../api/jobs/distributedJobRunner.js';

type Message = { action?: string; crashAfterClaim?: boolean; jobName?: string };
const leaseDurationMs = Number(process.env.XMT_TEST_JOB_LEASE_MS || 1100);
const renewIntervalMs = Number(process.env.XMT_TEST_JOB_RENEW_MS || 250);
let activeFinish: ((value: string) => void) | null = null;
let currentLease: Awaited<ReturnType<typeof acquireDistributedJobLease>> = null;

function emit(type: string, extra: Record<string, unknown> = {}) {
  process.stdout.write(`${JSON.stringify({ type, ...extra })}\n`);
}

process.stdout.write(`${JSON.stringify({ type: 'ready' })}\n`);
process.stdin.setEncoding('utf8');
let input = '';
process.stdin.on('data', (chunk: string) => {
  input += chunk;
  const lines = input.split('\n');
  input = lines.pop() || '';
  for (const line of lines) {
    if (!line) continue;
    void handle(JSON.parse(line) as Message);
  }
});

async function handle(message: Message) {
  if (message.action === 'run') {
    void runWithDistributedJobLease('test:daily-maintenance', async (context) => {
      emit('task-started', { fencingToken: context.fencingToken });
      context.signal.addEventListener('abort', () => {
        emit('task-aborted');
        void context.assertCurrent().catch(() => emit('assert-invalidated')).finally(() => {
          activeFinish?.('aborted');
          activeFinish = null;
        });
      }, { once: true });
      return await new Promise<string>((resolve) => { activeFinish = resolve; });
    }, { leaseDurationMs, renewIntervalMs }).then((result) => {
      if (result.status === 'busy') emit('run-busy');
      else emit('run-finished', result);
    }).catch((error) => emit('run-error', { message: error instanceof Error ? error.message : String(error) }));
    return;
  }

  if (message.action === 'finish') {
    activeFinish?.('finished');
    activeFinish = null;
    return;
  }

  if (message.action === 'expire-job') {
    const result = await db.execute("UPDATE distributed_job_leases SET lease_expires_at_ms = 0 WHERE job_name = 'test:daily-maintenance'");
    emit('job-expired', { updated: result.rowsAffected });
    return;
  }

  if (message.action === 'claim') {
    currentLease = await acquireDistributedJobLease(message.jobName || 'test:crash-recovery', { leaseDurationMs });
    if (!currentLease) {
      emit('claim-busy');
      return;
    }
    emit('claimed', { fencingToken: currentLease.fencingToken });
    if (message.crashAfterClaim) setImmediate(() => process.exit(0));
    return;
  }

  if (message.action === 'renew') {
    emit('renewed', { renewed: currentLease ? await currentLease.renew() : false });
    return;
  }

  if (message.action === 'release') {
    emit('released', { released: currentLease ? await currentLease.release() : false });
    currentLease = null;
    return;
  }

  if (message.action === 'stop') {
    await closeDatabase();
    process.exit(0);
  }
}
