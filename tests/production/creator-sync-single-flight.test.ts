import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-creator-sync-single-flight-'));
const databasePath = path.join(temporaryDirectory, 'creator-sync.test.db');
process.env.XMT_DB_PATH = databasePath;
process.env.NODE_ENV = 'test';

const [{ initDatabase, closeDatabase }, { execute, executeInsert, queryOne }] = await Promise.all([
  import('../../api/database/db.js'),
  import('../../api/database/utils.js'),
]);
const { claimCreatorSyncTask } = await import('../../api/services/creatorSyncV291.js');
const { creatorSyncSingleFlightMigration } = await import('../../api/database/migrations/023_creator_sync_single_flight.js');

function startWorker(agentId: number, taskId: string, account: string) {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const workerPath = path.join(projectRoot, 'tests/production/creator-sync-single-flight-worker.ts');
  const child = spawn(process.execPath, ['--import', 'tsx', workerPath], {
    cwd: projectRoot,
    env: {
      PATH: process.env.PATH || '',
      NODE_ENV: 'test',
      XMT_DB_PATH: databasePath,
      XMT_TEST_CREATOR_AGENT_ID: String(agentId),
      XMT_TEST_CREATOR_TASK_ID: taskId,
      XMT_TEST_CREATOR_ACCOUNT: account,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const lines = createInterface({ input: child.stdout });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => { stderr += chunk; });
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  let resolveResult!: (result: string) => void;
  let rejectResult!: (error: Error) => void;
  const result = new Promise<string>((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
  const exit = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else {
        const error = new Error(`Creator sync worker exited with ${code}: ${stderr}`);
        rejectReady(error);
        rejectResult(error);
        reject(error);
      }
    });
  });
  lines.on('line', (line) => {
    if (line === 'READY') resolveReady();
    if (line === 'CLAIMED' || line === 'CONFLICT') resolveResult(line);
  });
  return { child, lines, ready, result, exit };
}

await initDatabase();
try {
  const legacy = createClient({ url: `file:${path.join(temporaryDirectory, 'duplicates.db')}` });
  try {
    await legacy.execute('CREATE TABLE creator_sync_tasks(platform TEXT, account TEXT, status TEXT)');
    await legacy.execute("INSERT INTO creator_sync_tasks VALUES('douyin','legacy','running'),('douyin','legacy','running')");
    await assert.rejects(() => creatorSyncSingleFlightMigration.up(legacy), /no tasks were changed/);
    assert.equal(Number((await legacy.execute('SELECT COUNT(*) AS count FROM creator_sync_tasks')).rows[0]?.count), 2);
    assert.equal((await legacy.execute("SELECT name FROM sqlite_master WHERE type='index'")).rows.length, 0);
  } finally { legacy.close(); }
  const account = 'shared-creator-account';
  const agentIds = await Promise.all(['device-a', 'device-b'].map((deviceId) => executeInsert(`INSERT INTO creator_agents
    (user_id,platform,account_id,device_id,token_hash,encryption_key_hash) VALUES(1,'douyin',?,?,?,?)`,
  [account, deviceId, `token-${deviceId}`, `key-${deviceId}`])));
  const workers = [
    startWorker(agentIds[0]!, 'task-a', account),
    startWorker(agentIds[1]!, 'task-b', account),
  ];
  let timeout: NodeJS.Timeout | undefined;
  const withTimeout = <T>(promise: Promise<T>, stage: string) => Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`Creator sync workers ${stage} timed out`)), 15_000);
    }),
  ]);

  try {
    await withTimeout(Promise.all(workers.map((worker) => worker.ready)), 'readiness');
    if (timeout) clearTimeout(timeout);
    for (const worker of workers) worker.child.stdin.end('go\n');
    const outcomes = await withTimeout(Promise.all(workers.map((worker) => worker.result)), 'claim');
    if (timeout) clearTimeout(timeout);
    assert.deepEqual([...outcomes].sort(), ['CLAIMED', 'CONFLICT']);
    await withTimeout(Promise.all(workers.map((worker) => worker.exit)), 'exit');
    if (timeout) clearTimeout(timeout);

    const running = await queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM creator_sync_tasks
      WHERE platform = 'douyin' AND account = ? AND status = 'running'`, [account]);
    assert.equal(Number(running?.count), 1, 'different Agent processes cannot sync the same account concurrently');

    const winner = await queryOne<{ agent_id: number; task_id: string }>(`SELECT agent_id,task_id FROM creator_sync_tasks WHERE account=? AND status='running'`, [account]);
    assert(winner);
    await execute(`UPDATE creator_sync_tasks SET status = 'failed', end_time = CURRENT_TIMESTAMP
      WHERE platform = 'douyin' AND account = ? AND status = 'running'`, [account]);
    await claimCreatorSyncTask(winner.agent_id, winner.task_id, 'douyin', account, new Date().toISOString());
    await assert.rejects(() => claimCreatorSyncTask(winner.agent_id, winner.task_id, 'douyin', account, new Date().toISOString()),
      (error: unknown) => (error as { statusCode?: number }).statusCode === 503, 'the same running task cannot re-enter');
    await execute("UPDATE creator_sync_tasks SET status='success' WHERE account=?", [account]);
    await claimCreatorSyncTask(agentIds[0]!, 'task-after-completion', 'douyin', account, new Date().toISOString());
    await claimCreatorSyncTask(agentIds[1]!, 'independent-account', 'douyin', 'another-account', new Date().toISOString());
    const lockingClient = createClient({ url: `file:${databasePath}` });
    const transaction = await lockingClient.transaction('write');
    try {
      await transaction.execute("UPDATE creator_sync_tasks SET error_message='temporary lock' WHERE account='another-account'");
      await assert.rejects(() => claimCreatorSyncTask(agentIds[0]!, 'busy-database', 'douyin', 'busy-account', new Date().toISOString()),
        (error: unknown) => (error as { statusCode?: number }).statusCode === 503, 'database lock exhaustion must stay retryable');
    } finally { await transaction.rollback(); transaction.close(); lockingClient.close(); }
    assert.equal(await queryOne('SELECT task_id FROM creator_sync_tasks WHERE task_id=?', ['busy-database']), null);
    await claimCreatorSyncTask(agentIds[0]!, 'busy-database', 'douyin', 'busy-account', new Date().toISOString());
    console.log('Creator Agent single-flight concurrency test passed across two Node processes');
  } catch (error) {
    for (const worker of workers) worker.child.kill('SIGTERM');
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    for (const worker of workers) worker.lines.close();
  }
} finally {
  closeDatabase();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
