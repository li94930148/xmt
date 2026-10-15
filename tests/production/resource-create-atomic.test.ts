import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-resource-create-atomic-'));
process.env.XMT_DB_PATH = path.join(directory, 'resource-create.db');
process.env.JWT_SECRET = 'resource-create-atomic-isolated-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: routes } = await import('../../api/routes/resource-center.js');

await initDatabase();
const adminId = await executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
  ['resource-create-admin', 'unused', 'resource-create@example.invalid', 'admin', '隔离资料管理员'],
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
const payload = {
  title: '原子性测试资料',
  summary: '隔离创建回归',
  library_type: 'knowledge',
  visibility: 'team',
  content_text: '只写入临时数据库',
  source_type: 'manual',
};

try {
  const beforeCount = Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resources'))?.count || 0);
  await execute(`
    CREATE TRIGGER reject_resource_create_audit
    BEFORE INSERT ON resource_audit_logs
    WHEN NEW.action='create'
    BEGIN SELECT RAISE(ABORT,'simulated create audit failure'); END
  `);
  const failedCreate = await fetch(`${base}/resources`, { method: 'POST', headers: adminHeaders, body: JSON.stringify(payload) });
  assert.equal(failedCreate.status, 500, 'the failed audit is surfaced as a failed create');
  assert.equal(
    Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resources'))?.count || 0),
    beforeCount,
    'resource insert rolls back when its required audit event cannot be written',
  );
  assert.equal(
    Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM resource_audit_logs WHERE action='create'"))?.count || 0),
    0,
    'a failed create leaves no orphan audit event',
  );

  await execute('DROP TRIGGER reject_resource_create_audit');
  const retriedCreate = await fetch(`${base}/resources`, { method: 'POST', headers: adminHeaders, body: JSON.stringify(payload) });
  assert.equal(retriedCreate.status, 201, 'the same create request succeeds after the isolated audit failure is removed');
  const created = await retriedCreate.json();
  assert.equal(typeof created.id, 'number');
  assert.equal(
    Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resources'))?.count || 0),
    beforeCount + 1,
    'the retry creates exactly one resource',
  );
  const audit = await queryOne<{ resource_id: number; detail_json: string }>(
    "SELECT resource_id,detail_json FROM resource_audit_logs WHERE action='create' ORDER BY id DESC LIMIT 1",
  );
  assert.equal(audit?.resource_id, created.id);
  assert.deepEqual(JSON.parse(audit?.detail_json || '{}'), {
    title: payload.title,
    library_type: payload.library_type,
    category_id: null,
    visibility: payload.visibility,
  });
  assert.equal((await queryOne<{ quick_check: string }>('PRAGMA quick_check'))?.quick_check, 'ok');
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM pragma_foreign_key_check'))?.count, 0);
  console.log('resource create and audit transaction test passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
