import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-announcement-create-idempotency-'));
process.env.XMT_DB_PATH = path.join(tempDirectory, 'announcement-create-idempotency.test.db');
process.env.JWT_SECRET = 'announcement-create-idempotency-test-secret';

const [{ initDatabase, closeDatabase }, database, { signToken }, { clearPermissionCache }, { default: announcementsRouter }] = await Promise.all([
  import('../../api/database/db.js'),
  import('../../api/database/utils.js'),
  import('../../api/utils/jwt.js'),
  import('../../api/middleware/permissions.js'),
  import('../../api/routes/announcements.js'),
]);

await initDatabase();
const createUser = async (username: string, role: string) => {
  const id = await database.executeInsert(
    'INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)',
    [username, 'unused', `${username}@example.invalid`, role, username],
  );
  await database.execute('INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [id, role]);
  return id;
};
const adminId = await createUser('announcement-idempotency-admin', 'admin');
const secondAdminId = await createUser('announcement-idempotency-admin2', 'admin');
const readerId = await createUser('announcement-idempotency-reader', 'member');
clearPermissionCache();

const app = express();
app.use(express.json());
app.use('/api/announcements', announcementsRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api/announcements`;
const headers = (userId: number) => ({ Authorization: `Bearer ${signToken({ userId })}`, 'Content-Type': 'application/json' });
const post = (requestId: string | null, payload: { content: string; type?: string; pinned?: boolean }, userId = adminId) => fetch(base, {
  method: 'POST',
  headers: headers(userId),
  body: JSON.stringify(requestId ? { ...payload, client_request_id: requestId } : payload),
});
const countByContent = (content: string) => database.queryOne<{ count: number }>(
  'SELECT COUNT(*) AS count FROM announcements WHERE content=?', [content],
);

try {
  const unauthenticatedStatus = await fetch(`${base}/create-request/00112233-4455-4677-8899-aabbccddeeff`);
  assert.equal(unauthenticatedStatus.status, 401, 'status verification requires authentication');

  const requestId = 'b0122334-4556-4788-899a-bbccddeeff00';
  const payload = { content: '响应丢失后恢复的公告', type: 'announcement', pinned: true };
  const missingStatus = await fetch(`${base}/create-request/${requestId}`, { headers: headers(adminId) });
  assert.equal(missingStatus.status, 200);
  assert.equal(missingStatus.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await missingStatus.json(), { state: 'not_found' });

  const createdResponse = await post(requestId, payload);
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json() as { id: number; idempotent_replay?: boolean };
  assert.equal(created.idempotent_replay, false);

  const replayResponse = await post(requestId, payload);
  assert.equal(replayResponse.status, 200);
  const replay = await replayResponse.json() as { id: number; idempotent_replay?: boolean };
  assert.equal(replay.id, created.id);
  assert.equal(replay.idempotent_replay, true);
  assert.equal(Number((await countByContent(payload.content))?.count), 1, 'same actor and payload never insert a second announcement');

  const committedStatus = await fetch(`${base}/create-request/${requestId}`, { headers: headers(adminId) });
  assert.deepEqual(await committedStatus.json(), { state: 'committed', announcementId: created.id });

  const changedPayload = await post(requestId, { ...payload, content: '不能覆盖原请求' });
  assert.equal(changedPayload.status, 409, 'a request ID cannot authorize changed content');
  const otherActorReplay = await post(requestId, payload, secondAdminId);
  assert.equal(otherActorReplay.status, 409, 'a request ID cannot be replayed by another actor');
  const otherActorStatus = await fetch(`${base}/create-request/${requestId}`, { headers: headers(secondAdminId) });
  assert.deepEqual(await otherActorStatus.json(), { state: 'conflict' }, 'status does not reveal another actor result');

  const deniedCreate = await post('c0122334-4556-4788-899a-bbccddeeff00', { content: '无权限公告' }, readerId);
  assert.equal(deniedCreate.status, 403, 'create retains system:announcement permission');
  const deniedStatus = await fetch(`${base}/create-request/${requestId}`, { headers: headers(readerId) });
  assert.equal(deniedStatus.status, 403, 'read-only recovery retains system:announcement permission');
  assert.equal(deniedStatus.headers.get('cache-control'), 'no-store', 'even permission errors must not be cached as recovery state');

  const concurrentId = 'd0122334-4556-4788-899a-bbccddeeff00';
  const concurrent = await Promise.all([
    post(concurrentId, { content: '同编号并发创建' }),
    post(concurrentId, { content: '同编号并发创建' }),
  ]);
  assert.deepEqual(concurrent.map((response) => response.status).sort(), [200, 201], 'concurrent retries converge on one create');
  assert.equal(Number((await countByContent('同编号并发创建'))?.count), 1);

  await database.execute(`
    CREATE TRIGGER reject_announcement_request_key
    BEFORE INSERT ON announcement_create_request_keys
    BEGIN SELECT RAISE(ABORT, 'simulated announcement request ledger failure'); END
  `);
  const failedLedger = await post('e0122334-4556-4788-899a-bbccddeeff00', { content: '台账失败应整体回滚' });
  assert.equal(failedLedger.status, 500);
  assert.equal(Number((await countByContent('台账失败应整体回滚'))?.count), 0, 'ledger failure rolls back the announcement row');
  await database.execute('DROP TRIGGER reject_announcement_request_key');

  const legacy = await post(null, { content: '旧版无编号调用仍可用' });
  assert.equal(legacy.status, 200, 'legacy unkeyed route remains compatible');
  assert.equal(Number((await countByContent('旧版无编号调用仍可用'))?.count), 1);

  const deleted = await fetch(`${base}/${created.id}`, { method: 'DELETE', headers: headers(adminId) });
  assert.equal(deleted.status, 200);
  const deletedStatus = await fetch(`${base}/create-request/${requestId}`, { headers: headers(adminId) });
  assert.deepEqual(await deletedStatus.json(), { state: 'deleted' }, 'deleted announcements retain a request tombstone');
  const deletedReplay = await post(requestId, payload);
  assert.equal(deletedReplay.status, 410, 'late replay cannot resurrect an intentionally deleted announcement');
  assert.equal(Number((await countByContent(payload.content))?.count), 0);

  assert.equal((await database.queryOne<{ quick_check: string }>('PRAGMA quick_check'))?.quick_check, 'ok');
  console.log('Announcement create idempotency HTTP tests passed.');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
