import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-resource-update-idempotency-service-'));
process.env.XMT_DB_PATH = path.join(directory, 'resources.db');

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const {
  createResourceRecord,
  getResourceUpdateRequestStatus,
  ResourceUpdateRequestConflictError,
  updateResourceRecordWithRequest,
} = await import('../../api/services/resourceCenter.js');

await initDatabase();

const createActor = async (username: string) => executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password)
   VALUES(?,?,?,?,?,1,0)`,
  [username, 'unused', `${username}@example.invalid`, 'member', username],
);

const actorId = await createActor('resource-update-owner');
const otherActorId = await createActor('resource-update-other');
const fields = {
  title: '更新前资料',
  summary: '旧摘要',
  library_type: 'knowledge',
  category_id: null,
  visibility: 'team',
  content_text: '旧正文',
  source_type: 'manual',
  source_uri: null,
};

try {
  const resourceId = await createResourceRecord(fields, actorId);
  const secondResourceId = await createResourceRecord({ ...fields, title: '另一条资料' }, actorId);
  const tagId = await executeInsert(
    'INSERT INTO resource_tags(name,normalized_name,created_by) VALUES(?,?,?)',
    ['隔离标签', '隔离标签', actorId],
  );
  const requestId = 'd350f580-7877-492f-9b70-a3f8e1ca9f02';
  const updates = {
    title: '更新后的资料',
    summary: '新摘要',
    category_id: null,
    visibility: 'private',
    content_text: '只写入临时数据库的新正文',
  };

  const concurrentResourceId = await createResourceRecord({ ...fields, title: '并发重放目标' }, actorId);
  const concurrentRequestId = 'd350f580-7877-492f-9b70-a3f8e1ca9f07';
  const concurrentResults = await Promise.all([
    updateResourceRecordWithRequest(concurrentResourceId, actorId, updates, undefined, concurrentRequestId, 'knowledge'),
    updateResourceRecordWithRequest(concurrentResourceId, actorId, updates, undefined, concurrentRequestId, 'knowledge'),
  ]);
  assert.ok(concurrentResults.every((result) => result.resourceId === concurrentResourceId));
  assert.deepEqual(concurrentResults.map((result) => result.replayed).sort(), [false, true], 'concurrent same-key updates commit once and replay once');
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM resource_audit_logs WHERE resource_id=? AND action='update'", [concurrentResourceId]))?.count ?? 0), 1, 'concurrent replay writes only one audit row');

  const first = await updateResourceRecordWithRequest(resourceId, actorId, updates, [tagId], requestId, 'knowledge');
  assert.deepEqual(first, { resourceId, replayed: false });
  assert.deepEqual(await queryOne('SELECT title,name,summary,visibility,content_text FROM resources WHERE id=?', [resourceId]), {
    title: updates.title,
    name: updates.title,
    summary: updates.summary,
    visibility: updates.visibility,
    content_text: updates.content_text,
  });
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resource_tag_relations WHERE resource_id=? AND tag_id=?', [resourceId, tagId]))?.count ?? 0), 1);
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM resource_audit_logs WHERE resource_id=? AND action='update'", [resourceId]))?.count ?? 0), 1);
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resource_update_request_keys WHERE client_request_id=?', [requestId]))?.count ?? 0), 1);

  const replay = await updateResourceRecordWithRequest(resourceId, actorId, updates, [tagId], requestId, 'knowledge');
  assert.deepEqual(replay, { resourceId, replayed: true }, 'same actor, resource, key, and payload replay the original result');
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM resource_audit_logs WHERE resource_id=? AND action='update'", [resourceId]))?.count ?? 0), 1, 'replay does not duplicate the audit row');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resource_tag_relations WHERE resource_id=?', [resourceId]))?.count ?? 0), 1, 'replay does not rewrite tag relations');
  assert.deepEqual(await getResourceUpdateRequestStatus(actorId, resourceId, requestId), { state: 'updated', resourceId });
  assert.deepEqual(await getResourceUpdateRequestStatus(otherActorId, resourceId, requestId), { state: 'not_found' }, 'another actor cannot inspect the receipt');
  assert.deepEqual(await getResourceUpdateRequestStatus(actorId, secondResourceId, requestId), { state: 'not_found' }, 'the receipt is scoped to its resource');
  assert.deepEqual(await getResourceUpdateRequestStatus(actorId, resourceId, 'd350f580-7877-492f-9b70-a3f8e1ca9f03'), { state: 'not_found' });

  await assert.rejects(
    () => updateResourceRecordWithRequest(resourceId, actorId, { ...updates, title: '不同内容' }, [tagId], requestId, 'knowledge'),
    (error) => error instanceof ResourceUpdateRequestConflictError,
  );
  await assert.rejects(
    () => updateResourceRecordWithRequest(resourceId, otherActorId, updates, [tagId], requestId, 'knowledge'),
    (error) => error instanceof ResourceUpdateRequestConflictError,
  );
  await assert.rejects(
    () => updateResourceRecordWithRequest(secondResourceId, actorId, updates, [tagId], requestId, 'knowledge'),
    (error) => error instanceof ResourceUpdateRequestConflictError,
  );
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM resource_audit_logs WHERE action='update'"))?.count ?? 0), 2, 'conflicting request reuse does not mutate or audit');

  const rollbackRequestId = 'd350f580-7877-492f-9b70-a3f8e1ca9f04';
  await execute(`CREATE TRIGGER fail_resource_update_receipt BEFORE INSERT ON resource_update_request_keys
    BEGIN SELECT RAISE(ABORT, 'isolated receipt failure'); END`);
  await assert.rejects(() => updateResourceRecordWithRequest(resourceId, actorId, { ...updates, title: '必须整体回滚' }, [tagId], rollbackRequestId, 'knowledge'));
  await execute('DROP TRIGGER fail_resource_update_receipt');
  assert.equal((await queryOne<{ title: string }>('SELECT title FROM resources WHERE id=?', [resourceId]))?.title, updates.title, 'receipt failure rolls back resource content');
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM resource_audit_logs WHERE resource_id=? AND action='update'", [resourceId]))?.count ?? 0), 1, 'receipt failure rolls back the audit row');
  assert.deepEqual(await getResourceUpdateRequestStatus(actorId, resourceId, rollbackRequestId), { state: 'not_found' }, 'receipt failure leaves no false success');

  assert.equal((await queryOne<{ quick_check: string }>('PRAGMA quick_check'))?.quick_check, 'ok');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM pragma_foreign_key_check'))?.count ?? 0), 0);
  console.log('Resource update idempotency service tests passed.');
} finally {
  closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
