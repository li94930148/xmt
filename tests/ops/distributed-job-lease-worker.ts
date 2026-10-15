import { closeDatabase } from '../../api/database/db.js';
import { acquireDistributedJobLease } from '../../api/jobs/distributedJobRunner.js';

type Message = { action?: string; crashAfterClaim?: boolean; jobName?: string };
const leaseDurationMs = Number(process.env.XMT_TEST_JOB_LEASE_MS || 1100);
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
