import { closeDatabase, configureDatabaseConnection, db, SQLITE_BUSY_TIMEOUT_MS } from '../../api/database/db.js';
import { acquireDistributedJobLease } from '../../api/jobs/distributedJobRunner.js';

type Message = { action?: string; crashAfterClaim?: boolean; jobName?: string; writeCount?: number };
const leaseDurationMs = Number(process.env.XMT_TEST_JOB_LEASE_MS || 1100);
let currentLease: Awaited<ReturnType<typeof acquireDistributedJobLease>> = null;

function emit(type: string, extra: Record<string, unknown> = {}) {
  process.stdout.write(`${JSON.stringify({ type, ...extra })}\n`);
}

await configureDatabaseConnection();
const busyTimeout = await db.execute('PRAGMA busy_timeout');
if (Number(busyTimeout.rows[0]?.timeout) !== SQLITE_BUSY_TIMEOUT_MS) {
  throw new Error(`SQLite busy timeout was not applied: ${JSON.stringify(busyTimeout.rows[0])}`);
}
const synchronous = await db.execute('PRAGMA synchronous');
if (Number(synchronous.rows[0]?.synchronous) !== 1) {
  throw new Error(`SQLite NORMAL synchronous mode was not applied: ${JSON.stringify(synchronous.rows[0])}`);
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
  if (message.action === 'write-batch') {
    const writeCount = message.writeCount ?? 100;
    for (let index = 0; index < writeCount; index += 1) {
      await db.execute({
        sql: 'INSERT INTO distributed_job_lease_test_writes (worker_pid, write_index) VALUES (?, ?)',
        args: [process.pid, index],
      });
    }
    emit('writes-done', { written: writeCount });
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
