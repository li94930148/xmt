import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-resource-mutation-atomic-'));
process.env.XMT_DB_PATH = path.join(directory, 'resource-mutation.db');
process.env.JWT_SECRET = 'resource-mutation-atomic-isolated-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: routes } = await import('../../api/routes/resource-center.js');

await initDatabase();
const adminId = await executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
  ['resource-mutation-admin', 'unused', 'resource-mutation@example.invalid', 'admin', '隔离资料管理员'],
);
await execute('INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [adminId, 'admin']);

const app = express();
app.use(express.json());
app.use('/api/resource-center', routes);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api/resource-center`;
const adminHeaders = { Authorization: `Bearer ${signToken({ userId: adminId })}`, 'Content-Type': 'application/json' };

async function createAuditFailureTrigger(name: string, predicate: string) {
  await execute(`
    CREATE TRIGGER ${name}
    BEFORE INSERT ON resource_audit_logs
    WHEN ${predicate}
    BEGIN SELECT RAISE(ABORT,'simulated audit failure'); END
  `);
}

async function removeAuditFailureTrigger(name: string) {
  await execute(`DROP TRIGGER ${name}`);
}

async function expectSafeServerFailure(response: Response, description: string) {
  assert.equal(response.status, 500, description);
  const payload = await response.json();
  assert.equal(String(payload.message || '').includes('simulated audit failure'), false, 'internal database details are not exposed');
}

try {
  const createResponse = await fetch(`${base}/resources`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ title: '变更审计事务测试资料', library_type: 'knowledge', visibility: 'team', content_text: '隔离内容' }),
  });
  assert.equal(createResponse.status, 201);
  const resourceId = Number((await createResponse.json()).id);

  await createAuditFailureTrigger('reject_update_audit', "NEW.action='update' AND NEW.detail_json LIKE '%原子更新失败%'");
  await expectSafeServerFailure(
    await fetch(`${base}/resources/${resourceId}`, {
      method: 'PUT', headers: adminHeaders, body: JSON.stringify({ title: '原子更新失败' }),
    }),
    'resource update rolls back when its audit cannot be written',
  );
  assert.equal((await queryOne<{ title: string }>('SELECT title FROM resources WHERE id=?', [resourceId]))?.title, '变更审计事务测试资料', 'failed update rolls back resource fields');
  await removeAuditFailureTrigger('reject_update_audit');
  assert.equal((await fetch(`${base}/resources/${resourceId}`, {
    method: 'PUT', headers: adminHeaders, body: JSON.stringify({ title: '原子更新成功' }),
  })).status, 200);
  assert.equal((await queryOne<{ title: string }>('SELECT title FROM resources WHERE id=?', [resourceId]))?.title, '原子更新成功');

  await createAuditFailureTrigger('reject_delete_audit', "NEW.action='delete'");
  await expectSafeServerFailure(
    await fetch(`${base}/resources/${resourceId}`, { method: 'DELETE', headers: adminHeaders }),
    'soft delete reports failure when its required audit cannot be written',
  );
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM resources WHERE id=?', [resourceId]))?.status, 'published', 'failed soft-delete rolls back');
  await removeAuditFailureTrigger('reject_delete_audit');
  assert.equal((await fetch(`${base}/resources/${resourceId}`, { method: 'DELETE', headers: adminHeaders })).status, 200);
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM resources WHERE id=?', [resourceId]))?.status, 'deleted');

  await createAuditFailureTrigger('reject_restore_audit', "NEW.action='restore'");
  await expectSafeServerFailure(
    await fetch(`${base}/resources/${resourceId}/restore`, { method: 'POST', headers: adminHeaders }),
    'restore reports failure when its required audit cannot be written',
  );
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM resources WHERE id=?', [resourceId]))?.status, 'deleted', 'failed restore rolls back');
  await removeAuditFailureTrigger('reject_restore_audit');
  assert.equal((await fetch(`${base}/resources/${resourceId}/restore`, { method: 'POST', headers: adminHeaders })).status, 200);
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM resources WHERE id=?', [resourceId]))?.status, 'published');

  const tagId = await executeInsert('INSERT INTO resource_tags(name,normalized_name,created_by) VALUES(?,?,?)', ['隔离标签', '隔离标签', adminId]);
  await createAuditFailureTrigger('reject_tag_add_audit', "NEW.action='update' AND NEW.detail_json LIKE '%tag_add%'");
  await expectSafeServerFailure(
    await fetch(`${base}/resources/${resourceId}/tags`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ tag_id: tagId }) }),
    'tag add reports failure when its audit cannot be written',
  );
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resource_tag_relations WHERE resource_id=? AND tag_id=?', [resourceId, tagId]))?.count, 0, 'failed tag add rolls back');
  await removeAuditFailureTrigger('reject_tag_add_audit');
  assert.equal((await fetch(`${base}/resources/${resourceId}/tags`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ tag_id: tagId }) })).status, 201);

  await createAuditFailureTrigger('reject_tag_remove_audit', "NEW.action='update' AND NEW.detail_json LIKE '%tag_remove%'");
  await expectSafeServerFailure(
    await fetch(`${base}/resources/${resourceId}/tags/${tagId}`, { method: 'DELETE', headers: adminHeaders }),
    'tag removal reports failure when its audit cannot be written',
  );
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resource_tag_relations WHERE resource_id=? AND tag_id=?', [resourceId, tagId]))?.count, 1, 'failed tag removal rolls back');
  await removeAuditFailureTrigger('reject_tag_remove_audit');
  assert.equal((await fetch(`${base}/resources/${resourceId}/tags/${tagId}`, { method: 'DELETE', headers: adminHeaders })).status, 200);

  await createAuditFailureTrigger('reject_relation_add_audit', "NEW.action='relation_add'");
  await expectSafeServerFailure(
    await fetch(`${base}/resources/${resourceId}/relations`, {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ target_type: 'user', target_id: adminId, relation_type: 'related' }),
    }),
    'relation add reports an internal failure rather than a duplicate when its audit cannot be written',
  );
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resource_relations WHERE resource_id=?', [resourceId]))?.count, 0, 'failed relation add rolls back');
  await removeAuditFailureTrigger('reject_relation_add_audit');
  const relationResponse = await fetch(`${base}/resources/${resourceId}/relations`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ target_type: 'user', target_id: adminId, relation_type: 'related' }),
  });
  assert.equal(relationResponse.status, 201);
  const relationId = Number((await relationResponse.json()).id);
  const duplicateRelationResponse = await fetch(`${base}/resources/${resourceId}/relations`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ target_type: 'user', target_id: adminId, relation_type: 'related' }),
  });
  assert.equal(duplicateRelationResponse.status, 409, 'a genuine duplicate relation still returns conflict');
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resource_relations WHERE resource_id=?', [resourceId]))?.count, 1);

  await createAuditFailureTrigger('reject_relation_remove_audit', "NEW.action='relation_remove'");
  await expectSafeServerFailure(
    await fetch(`${base}/resources/${resourceId}/relations/${relationId}`, { method: 'DELETE', headers: adminHeaders }),
    'relation removal reports failure when its audit cannot be written',
  );
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resource_relations WHERE id=?', [relationId]))?.count, 1, 'failed relation removal rolls back');
  await removeAuditFailureTrigger('reject_relation_remove_audit');
  assert.equal((await fetch(`${base}/resources/${resourceId}/relations/${relationId}`, { method: 'DELETE', headers: adminHeaders })).status, 200);

  const filePayload = { original_name: 'cover.png', storage_key: 'isolated/cover.png', mime_type: 'image/png', extension: 'png', size_bytes: 12 };
  await createAuditFailureTrigger('reject_file_add_audit', "NEW.action='update' AND NEW.detail_json LIKE '%file_metadata_add%'");
  await expectSafeServerFailure(
    await fetch(`${base}/resources/${resourceId}/files`, { method: 'POST', headers: adminHeaders, body: JSON.stringify(filePayload) }),
    'file metadata add reports failure when its audit cannot be written',
  );
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resource_files WHERE resource_id=?', [resourceId]))?.count, 0, 'failed file metadata add rolls back');
  await removeAuditFailureTrigger('reject_file_add_audit');
  const fileResponse = await fetch(`${base}/resources/${resourceId}/files`, { method: 'POST', headers: adminHeaders, body: JSON.stringify(filePayload) });
  assert.equal(fileResponse.status, 201);
  const fileId = Number((await fileResponse.json()).id);

  await createAuditFailureTrigger('reject_file_remove_audit', "NEW.action='update' AND NEW.detail_json LIKE '%file_metadata_remove%'");
  await expectSafeServerFailure(
    await fetch(`${base}/files/${fileId}`, { method: 'DELETE', headers: adminHeaders }),
    'file metadata removal reports failure when its audit cannot be written',
  );
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resource_files WHERE id=?', [fileId]))?.count, 1, 'failed file metadata removal rolls back');
  await removeAuditFailureTrigger('reject_file_remove_audit');
  assert.equal((await fetch(`${base}/files/${fileId}`, { method: 'DELETE', headers: adminHeaders })).status, 200);

  assert.equal((await queryOne<{ quick_check: string }>('PRAGMA quick_check'))?.quick_check, 'ok');
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM pragma_foreign_key_check'))?.count, 0);
  console.log('resource-center mutation and audit transaction tests passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
