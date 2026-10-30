import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-published-archive-soft-delete-'));
process.env.XMT_DB_PATH = path.join(directory, 'published-archive.test.db');
process.env.JWT_SECRET = 'published-archive-soft-delete-isolated-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { clearPermissionCache } = await import('../../api/middleware/permissions.js');
const { default: legacyResourcesRouter } = await import('../../api/routes/resources.js');
const { default: resourceCenterRouter } = await import('../../api/routes/resource-center.js');
const { signToken } = await import('../../api/utils/jwt.js');

await initDatabase();
const adminId = await executeInsert(
  'INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)',
  ['archive-soft-delete-admin', 'unused', 'archive-soft-delete@example.invalid', 'admin', '归档软删除验收管理员'],
);
await execute('INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [adminId, 'admin']);
clearPermissionCache();

const app = express();
app.use(express.json());
app.use('/api/resources', legacyResourcesRouter);
app.use('/api/resource-center', resourceCenterRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
const headers = { Authorization: `Bearer ${signToken({ userId: adminId })}` };

async function createArchive(topicKey: string, uploaderId = adminId) {
  return executeInsert(
    `INSERT INTO resources(name,type,file_path,category,content,uploader_id)
     VALUES(?,?,?,?,?,?)`,
    [`归档 ${topicKey}`, 'archive', `archive/${topicKey}`, '已完成', JSON.stringify({ topic: { id: topicKey, title: '隔离归档' } }), uploaderId],
  );
}

async function deleteArchive(id: number) {
  return fetch(`${base}/api/resources/archives/${id}`, { method: 'DELETE', headers });
}

try {
  const archiveId = await createArchive('soft-delete-round-trip');
  const deleteResponse = await deleteArchive(archiveId);
  assert.equal(deleteResponse.status, 200, 'the current published archive action remains available');
  assert.deepEqual(await queryOne<{ status: string; deleted_at: string | null; content: string }>(
    'SELECT status,deleted_at,content FROM resources WHERE id=?', [archiveId],
  ), {
    status: 'deleted',
    deleted_at: (await queryOne<{ deleted_at: string }>('SELECT deleted_at FROM resources WHERE id=?', [archiveId]))?.deleted_at,
    content: JSON.stringify({ topic: { id: 'soft-delete-round-trip', title: '隔离归档' } }),
  }, 'archive content must remain intact in a recoverable deleted state');
  assert.ok((await queryOne<{ deleted_at: string }>('SELECT deleted_at FROM resources WHERE id=?', [archiveId]))?.deleted_at);
  assert.equal(Number((await queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM resource_audit_logs WHERE resource_id=? AND action='delete' AND user_id=?",
    [archiveId, adminId],
  ))?.count || 0), 1, 'soft deletion and its audit record are both written');

  const hiddenListResponse = await fetch(`${base}/api/resources/archives`, { headers });
  assert.equal(hiddenListResponse.status, 200);
  const hiddenList = await hiddenListResponse.json() as { data: Array<{ id: number }>; total: number };
  assert.equal(hiddenList.data.some((item) => item.id === archiveId), false, 'deleted archives are hidden from the active archive list');
  assert.equal(hiddenList.total, 0);
  assert.equal((await fetch(`${base}/api/resources/archives/${archiveId}`, { headers })).status, 404,
    'deleted archives are hidden from active detail reads for response-loss recovery');

  const restoreResponse = await fetch(`${base}/api/resource-center/resources/${archiveId}/restore`, {
    method: 'POST', headers,
  });
  assert.equal(restoreResponse.status, 200, 'the existing resource-center restore operation can recover the snapshot');
  assert.deepEqual(await queryOne<{ status: string; deleted_at: string | null; content: string }>(
    'SELECT status,deleted_at,content FROM resources WHERE id=?', [archiveId],
  ), {
    status: 'published', deleted_at: null,
    content: JSON.stringify({ topic: { id: 'soft-delete-round-trip', title: '隔离归档' } }),
  });
  assert.equal(Number((await queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM resource_audit_logs WHERE resource_id=? AND action='restore' AND user_id=?",
    [archiveId, adminId],
  ))?.count || 0), 1, 'restore is also recorded in the resource audit log');
  assert.equal((await fetch(`${base}/api/resources/archives/${archiveId}`, { headers })).status, 200,
    'a restored archive returns to the current published archive page');

  const concurrentId = await createArchive('concurrent-delete');
  const concurrentDeletes = await Promise.all([deleteArchive(concurrentId), deleteArchive(concurrentId)]);
  assert.deepEqual(concurrentDeletes.map((response) => response.status).sort(), [200, 404],
    'a concurrent second delete cannot create another successful transition');
  assert.equal(Number((await queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM resource_audit_logs WHERE resource_id=? AND action='delete'",
    [concurrentId],
  ))?.count || 0), 1, 'concurrent delete writes one audit entry');

  const rollbackId = await createArchive('audit-rollback');
  await execute(`CREATE TRIGGER fail_archive_delete_audit BEFORE INSERT ON resource_audit_logs
    WHEN NEW.action='delete' BEGIN SELECT RAISE(ABORT, 'injected archive delete audit failure'); END`);
  const rollbackResponse = await deleteArchive(rollbackId);
  assert.equal(rollbackResponse.status, 500, 'an audit failure is returned as an unconfirmed delete result');
  assert.deepEqual(await queryOne<{ status: string; deleted_at: string | null }>(
    'SELECT status,deleted_at FROM resources WHERE id=?', [rollbackId],
  ), { status: 'published', deleted_at: null }, 'audit failure rolls the soft delete back');
  await execute('DROP TRIGGER fail_archive_delete_audit');

  const uploaderRoleId = await executeInsert(
    'INSERT INTO roles(code,name,description,is_system) VALUES(?,?,?,0)',
    ['published-archive-owner-delete', '归档上传者删除验收', 'isolated test'],
  );
  await execute(
    'INSERT INTO role_permissions(role_id,permission_id) SELECT ?,id FROM permissions WHERE code=?',
    [uploaderRoleId, 'resource:delete'],
  );
  const uploaderId = await executeInsert(
    'INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)',
    ['archive-owner', 'unused', 'archive-owner@example.invalid', 'member', '归档上传者'],
  );
  await execute('INSERT INTO user_roles(user_id,role_id) VALUES(?,?)', [uploaderId, uploaderRoleId]);
  clearPermissionCache();
  const uploaderHeaders = { Authorization: `Bearer ${signToken({ userId: uploaderId })}` };
  const ownArchiveId = await createArchive('owner-delete', uploaderId);
  assert.equal((await fetch(`${base}/api/resources/archives/${ownArchiveId}`, { method: 'DELETE', headers: uploaderHeaders })).status, 200,
    'a non-privileged uploader with resource:delete can delete their own archive');
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM resources WHERE id=?', [ownArchiveId]))?.status, 'deleted');

  const otherArchiveId = await createArchive('other-owner-delete');
  assert.equal((await fetch(`${base}/api/resources/archives/${otherArchiveId}`, { method: 'DELETE', headers: uploaderHeaders })).status, 403,
    'the same role cannot delete an archive uploaded by another user');
  assert.equal((await queryOne<{ status: string }>('SELECT status FROM resources WHERE id=?', [otherArchiveId]))?.status, 'published',
    'a denied cross-owner delete leaves the other archive unchanged');

  console.log('Published archive soft-delete HTTP contract tests passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
