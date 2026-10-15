import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import * as Y from 'yjs';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-yjs-runtime-persistence-'));
process.env.XMT_DB_PATH = path.join(temporaryDirectory, 'runtime-persistence.test.db');
process.env.NODE_ENV = 'test';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const {
  applyRuntimeDocumentUpdate,
  dropRuntimeDocument,
  ensureRuntimeDocumentLoaded,
  getRuntimeDocumentState,
  getRuntimeDocumentVersion,
  refreshRuntimeDocument,
  RuntimeDocumentPersistenceError,
} = await import('../../api/collaboration/yjs/documentStore.js');
const { RUNTIME_CHECKPOINT_INTERVAL } = await import('../../api/collaboration/yjs/persistence.js');
const secondWorkerStore = await import(
  `${new URL('../../api/collaboration/yjs/documentStore.js', import.meta.url).href}?worker=second`
);

async function runConcurrentWorkerPair(roomId: string, userId: number, databasePath: string) {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const workerPath = path.join(projectRoot, 'tests/collaboration/yjs-runtime-worker.ts');
  const startWorker = (value: string) => {
    const child = spawn(process.execPath, ['--import', 'tsx', workerPath], {
      cwd: projectRoot,
      env: {
        PATH: process.env.PATH || '',
        NODE_ENV: 'test',
        XMT_DB_PATH: databasePath,
        XMT_TEST_ROOM_ID: roomId,
        XMT_TEST_UPDATE: value,
        XMT_TEST_USER_ID: String(userId),
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
    let resolveDone!: (version: number) => void;
    let rejectDone!: (error: Error) => void;
    const done = new Promise<number>((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
    const exit = new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => {
        if (code === 0) resolve();
        else {
          const error = new Error(`Yjs worker exited with ${code}: ${stderr}`);
          rejectReady(error);
          rejectDone(error);
          reject(error);
        }
      });
    });

    lines.on('line', (line) => {
      if (line === 'READY') resolveReady();
      const match = line.match(/^DONE:(\d+)$/);
      if (match) resolveDone(Number(match[1]));
    });

    return { child, lines, ready, done, exit };
  };

  const workers = [startWorker('C'), startWorker('D')];
  let timeout: NodeJS.Timeout | undefined;
  try {
    const withTimeout = <T>(promise: Promise<T>, stage: string) => Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Yjs worker ${stage} timed out`)), 15_000);
      }),
    ]);
    await withTimeout(Promise.all(workers.map((worker) => worker.ready)), 'readiness');
    if (timeout) clearTimeout(timeout);
    for (const worker of workers) worker.child.stdin.end('go\n');
    const versions = await withTimeout(Promise.all(workers.map((worker) => worker.done)), 'write');
    if (timeout) clearTimeout(timeout);
    await withTimeout(Promise.all(workers.map((worker) => worker.exit)), 'exit');
    return versions;
  } catch (error) {
    for (const worker of workers) worker.child.kill('SIGTERM');
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    for (const worker of workers) worker.lines.close();
  }
}

function readText(state: number[]) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Uint8Array.from(state));
  const result = doc.getText('content').toString();
  doc.destroy();
  return result;
}

await initDatabase();
try {
  const ownerId = await executeInsert(
    'INSERT INTO users (username,password,role,name,enabled,force_change_password) VALUES (?,?,?,?,?,?)',
    ['yjs-runtime-owner', 'unused', 'member', 'Runtime Owner', 1, 0],
  );
  const topicId = await executeInsert(
    'INSERT INTO topics (title,description,platform,creator_id,status) VALUES (?,?,?,?,?)',
    ['协作运行态恢复', '', 'douyin', ownerId, 'production'],
  );
  const productionId = await executeInsert(
    'INSERT INTO production (topic_id,version,content,status,operator_id) VALUES (?,?,?,?,?)',
    [topicId, 'v1.0', '<p>已自动保存正文</p>', 'draft', ownerId],
  );
  const roomId = `production:${productionId}@v1.0`;
  const clientDoc = new Y.Doc();

  clientDoc.getText('content').insert(0, '尚未进入正文自动保存的协作中间态');
  assert.equal(await applyRuntimeDocumentUpdate(roomId, Array.from(Y.encodeStateAsUpdate(clientDoc)), { userId: ownerId }), 1);

  // A process restart is represented by dropping the in-memory Y.Doc. The accepted
  // update must be reconstructed from the durable append log on the next room load.
  dropRuntimeDocument(roomId);
  await ensureRuntimeDocumentLoaded(roomId);
  assert.equal(readText(getRuntimeDocumentState(roomId)), '尚未进入正文自动保存的协作中间态');
  assert.equal(getRuntimeDocumentVersion(roomId), 1);

  for (let index = 0; index < RUNTIME_CHECKPOINT_INTERVAL - 1; index += 1) {
    const stateVector = Y.encodeStateVector(clientDoc);
    clientDoc.getText('content').insert(clientDoc.getText('content').length, '续');
    const delta = Y.encodeStateAsUpdate(clientDoc, stateVector);
    await applyRuntimeDocumentUpdate(roomId, Array.from(delta), { userId: ownerId });
  }

  assert.equal(getRuntimeDocumentVersion(roomId), RUNTIME_CHECKPOINT_INTERVAL);
  const checkpoint = await queryOne<{ version: number; state_base64: string }>(
    'SELECT version, state_base64 FROM collaboration_document_snapshots WHERE doc_id = ?',
    [roomId],
  );
  assert.equal(Number(checkpoint?.version), RUNTIME_CHECKPOINT_INTERVAL, 'checkpoint is created after the configured update interval');
  assert.ok(checkpoint?.state_base64, 'checkpoint stores a Yjs state');
  assert.equal(
    Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM collaboration_document_updates WHERE doc_id = ?', [roomId]))?.count),
    0,
    'checkpoint and update-log compaction commit together',
  );

  const expectedText = clientDoc.getText('content').toString();
  dropRuntimeDocument(roomId);
  await ensureRuntimeDocumentLoaded(roomId);
  assert.equal(readText(getRuntimeDocumentState(roomId)), expectedText, 'checkpoint restores the complete Yjs document');

  const concurrentRoomId = 'production:multi-runtime-test@v1.0';
  const concurrentClientA = new Y.Doc();
  const concurrentClientB = new Y.Doc();
  concurrentClientA.getText('content').insert(0, 'A');
  concurrentClientB.getText('content').insert(0, 'B');
  const concurrentResults = await Promise.all([
    applyRuntimeDocumentUpdate(concurrentRoomId, Array.from(Y.encodeStateAsUpdate(concurrentClientA)), { userId: ownerId }),
    secondWorkerStore.applyRuntimeDocumentUpdate(concurrentRoomId, Array.from(Y.encodeStateAsUpdate(concurrentClientB)), { userId: ownerId }),
  ]);
  assert.deepEqual(concurrentResults.sort(), [1, 2], 'independent workers serialize durable update versions');
  await Promise.all([
    refreshRuntimeDocument(concurrentRoomId),
    secondWorkerStore.refreshRuntimeDocument(concurrentRoomId),
  ]);
  const concurrentTextA = readText(getRuntimeDocumentState(concurrentRoomId));
  const concurrentTextB = readText(secondWorkerStore.getRuntimeDocumentState(concurrentRoomId));
  assert.equal(concurrentTextA.split('').sort().join(''), 'AB', 'retry merges a concurrent update instead of losing it');
  assert.equal(concurrentTextB, concurrentTextA, 'each worker reloads the same persisted Yjs state');

  const multiProcessRoomId = 'production:multi-process-test@v1.0';
  const processVersions = await runConcurrentWorkerPair(multiProcessRoomId, ownerId, process.env.XMT_DB_PATH!);
  assert.deepEqual(processVersions.sort(), [1, 2], 'separate Node processes serialize updates through the shared SQLite log');
  dropRuntimeDocument(multiProcessRoomId);
  await ensureRuntimeDocumentLoaded(multiProcessRoomId);
  assert.equal(readText(getRuntimeDocumentState(multiProcessRoomId)).split('').sort().join(''), 'CD');
  assert.equal(getRuntimeDocumentVersion(multiProcessRoomId), 2);

  const { setDocLocked, releaseLock } = await import('../../api/collaboration/control/collaborationGuard.js');
  await setDocLocked(concurrentRoomId, '并发验收锁', String(ownerId));
  const lockedClient = new Y.Doc();
  Y.applyUpdate(lockedClient, Uint8Array.from(getRuntimeDocumentState(concurrentRoomId)));
  const lockedStateVector = Y.encodeStateVector(lockedClient);
  lockedClient.getText('content').insert(lockedClient.getText('content').length, '!');
  const lockedDelta = Y.encodeStateAsUpdate(lockedClient, lockedStateVector);
  await assert.rejects(
    secondWorkerStore.applyRuntimeDocumentUpdate(concurrentRoomId, Array.from(lockedDelta), { userId: ownerId }),
    (error: unknown) => error instanceof Error && error.name === 'RuntimeDocumentLockedError' && error.message === 'Collaboration document is locked',
    'a lock written through the shared database rejects updates from every worker',
  );
  await releaseLock(concurrentRoomId, String(ownerId));
  assert.equal(
    Number((await queryOne<{ version: number }>(
      `SELECT MAX(version) AS version FROM collaboration_document_updates WHERE doc_id = ?`,
      [concurrentRoomId],
    ))?.version),
    2,
    'rejected locked updates do not enter the durable log',
  );
  concurrentClientA.destroy();
  concurrentClientB.destroy();
  lockedClient.destroy();

  await execute(`CREATE TRIGGER reject_test_collaboration_update
    BEFORE INSERT ON collaboration_document_updates
    BEGIN SELECT RAISE(ABORT, 'test persistence failure'); END`);
  const beforeRejectedUpdate = readText(getRuntimeDocumentState(roomId));
  const vectorBeforeRejectedUpdate = Y.encodeStateVector(clientDoc);
  clientDoc.getText('content').insert(clientDoc.getText('content').length, '不可广播');
  const rejectedDelta = Y.encodeStateAsUpdate(clientDoc, vectorBeforeRejectedUpdate);
  await assert.rejects(
    applyRuntimeDocumentUpdate(roomId, Array.from(rejectedDelta), { userId: ownerId }),
    RuntimeDocumentPersistenceError,
  );
  assert.equal(readText(getRuntimeDocumentState(roomId)), beforeRejectedUpdate, 'database failure does not mutate the live document');
  await execute('DROP TRIGGER reject_test_collaboration_update');

  dropRuntimeDocument(roomId);
  await ensureRuntimeDocumentLoaded(roomId);
  assert.equal(readText(getRuntimeDocumentState(roomId)), beforeRejectedUpdate, 'database failure does not become visible after rehydration');

  await execute('DELETE FROM production WHERE id = ?', [productionId]);
  assert.equal(
    Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM collaboration_document_snapshots WHERE doc_id = ?', [roomId]))?.count),
    0,
    'deleting a production record removes its persisted runtime checkpoint',
  );
  assert.equal(
    Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM collaboration_document_updates WHERE doc_id = ?', [roomId]))?.count),
    0,
    'deleting a production record removes its persisted update log',
  );

  await execute(
    'INSERT INTO collaboration_document_snapshots (doc_id,version,state_base64,updated_at) VALUES (?,?,?,?)',
    ['production:999@v1.0', 1, '%%%invalid%%%', Date.now()],
  );
  await assert.rejects(
    ensureRuntimeDocumentLoaded('production:999@v1.0'),
    /Stored collaboration checkpoint is invalid/,
    'corrupt checkpoint fails closed instead of returning an empty document',
  );
  await execute(
    'INSERT INTO collaboration_document_updates (doc_id,version,update_base64,user_id,created_at) VALUES (?,?,?,?,?)',
    ['shooting:999', 2, Buffer.from([1, 2, 3, 4]).toString('base64'), null, Date.now()],
  );
  await assert.rejects(
    ensureRuntimeDocumentLoaded('shooting:999'),
    /Stored collaboration update sequence is incomplete/,
    'missing update sequence fails closed',
  );

  clientDoc.destroy();
  console.log('Yjs runtime persistence tests passed');
} finally {
  await closeDatabase();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
