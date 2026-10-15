import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-user-audit-atomic-'));
process.env.XMT_DB_PATH = path.join(directory, 'user-audit-atomic.db');
process.env.JWT_SECRET = 'user-audit-atomic-isolated-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { clearPermissionCache } = await import('../../api/middleware/permissions.js');
const { default: routes } = await import('../../api/routes/users.js');
const { signToken } = await import('../../api/utils/jwt.js');

await initDatabase();
const adminId = await executeInsert(
  'INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)',
  ['user-audit-admin', 'unused', 'user-audit@example.invalid', 'admin', '隔离用户管理员'],
);
await execute('INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [adminId, 'admin']);
clearPermissionCache();

const targetId = await executeInsert(
  'INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)',
  ['user-audit-target', 'unused', 'target@example.invalid', 'member', '原用户名称'],
);
await execute('INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [targetId, 'member']);

const app = express();
app.use(express.json());
app.use('/api/users', routes);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api/users`;
const headers = {
  Authorization: `Bearer ${signToken({ userId: adminId })}`,
  'Content-Type': 'application/json',
};

async function createUser(username: string) {
  return fetch(base, {
    method: 'POST',
    headers,
    body: JSON.stringify({ username, password: 'isolated-password', email: `${username}@example.invalid`, role: 'member', name: '隔离新用户' }),
  });
}

async function countActivity(action: string, detailLike: string) {
  return Number((await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM activity_log WHERE user_id=? AND action=? AND target=? AND detail LIKE ?',
    [adminId, action, 'user', detailLike],
  ))?.count || 0);
}

try {
  await execute(`
    CREATE TRIGGER reject_user_create_audit
    BEFORE INSERT ON activity_log
    WHEN NEW.action='create' AND NEW.target='user'
    BEGIN SELECT RAISE(ABORT, 'simulated user create audit failure'); END
  `);
  const failedCreate = await createUser('user-audit-created');
  assert.equal(failedCreate.status, 500, 'a failed create audit fails the user create request');
  assert.deepEqual(await failedCreate.json(), { message: '创建用户失败' }, 'SQLite error text is not returned to callers');
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM users WHERE username='user-audit-created'"))?.count || 0), 0);
  assert.equal(await countActivity('create', '%user-audit-created%'), 0);

  await execute('DROP TRIGGER reject_user_create_audit');
  const created = await createUser('user-audit-created');
  assert.equal(created.status, 200, 'the same create succeeds once the audit store recovers');
  const createdBody = await created.json() as { userId: number };
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM users WHERE username='user-audit-created'"))?.count || 0), 1);
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM user_roles WHERE user_id=?', [createdBody.userId]))?.count || 0), 1);
  assert.equal(await countActivity('create', '%user-audit-created%'), 1);

  await execute(`
    CREATE TRIGGER reject_user_update_audit
    BEFORE INSERT ON activity_log
    WHEN NEW.action='update' AND NEW.target='user'
    BEGIN SELECT RAISE(ABORT, 'simulated user update audit failure'); END
  `);
  const failedUpdate = await fetch(`${base}/${targetId}`, {
    method: 'PUT', headers, body: JSON.stringify({ name: '不应保存的名称', role: 'director' }),
  });
  assert.equal(failedUpdate.status, 500, 'a failed update audit fails the user update request');
  assert.deepEqual(await failedUpdate.json(), { message: '更新用户失败' }, 'SQLite error text is not returned to callers');
  assert.deepEqual(
    await queryOne<{ name: string; role: string }>('SELECT name,role FROM users WHERE id=?', [targetId]),
    { name: '原用户名称', role: 'member' },
    'user and role changes roll back when the audit insert fails',
  );
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM user_roles WHERE user_id=? AND role_id=(SELECT id FROM roles WHERE code=?)', [targetId, 'member']))?.count || 0), 1);
  assert.equal(await countActivity('update', '%user-audit-target%'), 0);

  await execute('DROP TRIGGER reject_user_update_audit');
  const updated = await fetch(`${base}/${targetId}`, {
    method: 'PUT', headers, body: JSON.stringify({ name: '更新后的名称', role: 'director' }),
  });
  assert.equal(updated.status, 200, 'the update succeeds once the audit store recovers');
  assert.deepEqual(await queryOne<{ name: string; role: string }>('SELECT name,role FROM users WHERE id=?', [targetId]), { name: '更新后的名称', role: 'director' });
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM user_roles WHERE user_id=? AND role_id=(SELECT id FROM roles WHERE code=?)', [targetId, 'director']))?.count || 0), 1);
  assert.equal(await countActivity('update', '%user-audit-target%'), 1);

  await execute(`
    CREATE TRIGGER reject_user_delete_audit
    BEFORE INSERT ON activity_log
    WHEN NEW.action='delete' AND NEW.target='user'
    BEGIN SELECT RAISE(ABORT, 'simulated user delete audit failure'); END
  `);
  const failedDelete = await fetch(`${base}/${targetId}`, { method: 'DELETE', headers });
  assert.equal(failedDelete.status, 500, 'a failed delete audit fails the user delete request');
  assert.deepEqual(await failedDelete.json(), { message: '删除用户失败' }, 'SQLite error text is not returned to callers');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM users WHERE id=?', [targetId]))?.count || 0), 1);
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM user_roles WHERE user_id=?', [targetId]))?.count || 0), 1);
  assert.equal(await countActivity('delete', '%user-audit-target%'), 0);

  await execute('DROP TRIGGER reject_user_delete_audit');
  const deleted = await fetch(`${base}/${targetId}`, { method: 'DELETE', headers });
  assert.equal(deleted.status, 200, 'the delete succeeds once the audit store recovers');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM users WHERE id=?', [targetId]))?.count || 0), 0);
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM user_roles WHERE user_id=?', [targetId]))?.count || 0), 0);
  assert.equal(await countActivity('delete', '%user-audit-target%'), 1);
  assert.equal((await queryOne<{ quick_check: string }>('PRAGMA quick_check'))?.quick_check, 'ok');
  console.log('user create/update/delete and activity audit transaction tests passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  clearPermissionCache();
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
