import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-resource-create-idempotency-service-'));
process.env.XMT_DB_PATH = path.join(directory, 'resources.db');

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const {
  createResourceRecord,
  createResourceRecordWithRequest,
  getResourceCreateRequestStatus,
  ResourceCreateRequestConflictError,
} = await import('../../api/services/resourceCenter.js');

await initDatabase();

const createActor = async (username: string) => executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password)
   VALUES(?,?,?,?,?,1,0)`,
  [username, 'unused', `${username}@example.invalid`, 'member', username],
);

const actorId = await createActor('resource-create-owner');
const otherActorId = await createActor('resource-create-other');
const requestId = '61e33e45-2db0-4e0e-87f3-84a84d2b2042';
const fields = {
  title: '结果不明后安全恢复',
  summary: '隔离服务测试',
  library_type: 'knowledge',
  category_id: null,
  visibility: 'team',
  content_text: '只写入临时数据库',
  source_type: 'manual',
  source_uri: null,
};

try {
  const first = await createResourceRecordWithRequest(fields, actorId, requestId);
  assert.deepEqual(first, { resourceId: first.resourceId, replayed: false });
  const countsAfterCreate = {
    resources: await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resources WHERE id=?', [first.resourceId]),
    audits: await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM resource_audit_logs WHERE resource_id=? AND action='create'", [first.resourceId]),
    receipts: await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resource_create_request_keys WHERE client_request_id=?', [requestId]),
  };
  assert.equal(countsAfterCreate.resources?.count, 1);
  assert.equal(countsAfterCreate.audits?.count, 1);
  assert.equal(countsAfterCreate.receipts?.count, 1);

  const replay = await createResourceRecordWithRequest(fields, actorId, requestId);
  assert.deepEqual(replay, { resourceId: first.resourceId, replayed: true }, 'same actor, request ID, and payload replay the original resource ID');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resources'))?.count ?? 0), 1, 'replay does not create another resource');
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM resource_audit_logs WHERE action='create'"))?.count ?? 0), 1, 'replay does not create a duplicate audit event');
  assert.deepEqual(await getResourceCreateRequestStatus(actorId, requestId), { state: 'created', resourceId: first.resourceId });
  assert.deepEqual(await getResourceCreateRequestStatus(otherActorId, requestId), { state: 'not_found' }, 'another actor cannot inspect the receipt');
  assert.deepEqual(await getResourceCreateRequestStatus(actorId, '61e33e45-2db0-4e0e-87f3-84a84d2b2043'), { state: 'not_found' });

  await assert.rejects(
    () => createResourceRecordWithRequest({ ...fields, title: '不同载荷不可复用请求编号' }, actorId, requestId),
    (error) => error instanceof ResourceCreateRequestConflictError,
  );
  await assert.rejects(
    () => createResourceRecordWithRequest(fields, otherActorId, requestId),
    (error) => error instanceof ResourceCreateRequestConflictError,
  );
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resources'))?.count ?? 0), 1, 'conflicting reuse creates no resource');

  const rollbackRequestId = '61e33e45-2db0-4e0e-87f3-84a84d2b2044';
  await execute(`CREATE TRIGGER fail_resource_create_receipt BEFORE INSERT ON resource_create_request_keys
    BEGIN SELECT RAISE(ABORT, 'isolated receipt failure'); END`);
  await assert.rejects(() => createResourceRecordWithRequest({ ...fields, title: '回执失败须整体回滚' }, actorId, rollbackRequestId));
  await execute('DROP TRIGGER fail_resource_create_receipt');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resources'))?.count ?? 0), 1, 'receipt failure rolls back the resource row');
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM resource_audit_logs WHERE action='create'"))?.count ?? 0), 1, 'receipt failure rolls back the audit row');
  assert.deepEqual(await getResourceCreateRequestStatus(actorId, rollbackRequestId), { state: 'not_found' }, 'receipt failure leaves no false success');

  const legacyId = await createResourceRecord({ ...fields, title: '旧客户端无请求编号' }, actorId);
  assert.ok(legacyId > 0, 'legacy creation remains available without an idempotency key');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resource_create_request_keys'))?.count ?? 0), 1, 'legacy creation does not create a receipt');
  assert.equal((await queryOne<{ quick_check: string }>('PRAGMA quick_check'))?.quick_check, 'ok');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM pragma_foreign_key_check'))?.count ?? 0), 0);

  console.log('Resource create idempotency service tests passed.');
} finally {
  closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
