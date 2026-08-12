import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-rbac-invariant-'));
process.env.XMT_DB_PATH = path.join(tempDirectory, 'rbac-invariant.test.db');
process.env.JWT_SECRET = 'rbac-invariant-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryAll, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: rolesRouter } = await import('../../api/routes/roles.js');

await initDatabase();
const adminRole = await queryOne<{ id: number }>('SELECT id FROM roles WHERE code = ?', ['admin']);
const memberRole = await queryOne<{ id: number }>('SELECT id FROM roles WHERE code = ?', ['member']);
assert(adminRole && memberRole);
const operatorId = await executeInsert(`INSERT INTO users (username,password,email,role,name,enabled,force_change_password) VALUES (?,?,?,?,?,?,?)`, ['rbac-operator', 'unused', 'operator@example.invalid', 'admin', 'Operator', 1, 0]);
await execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [operatorId, adminRole.id]);
const targetId = await executeInsert(`INSERT INTO users (username,password,email,role,name,enabled,force_change_password) VALUES (?,?,?,?,?,?,?)`, ['rbac-target', 'unused', 'target@example.invalid', 'admin', 'Target', 1, 0]);
await execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [targetId, adminRole.id]);

const app = express();
app.use(express.json());
app.use('/api/roles', rolesRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const headers = { authorization: `Bearer ${signToken({ userId: operatorId })}`, 'content-type': 'application/json' };

try {
  const request = (body: unknown) => fetch(`http://127.0.0.1:${address.port}/api/roles/user/${targetId}`, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal((await request({ role_ids: [] })).status, 400);
  assert.equal((await request({ role_ids: [adminRole.id, adminRole.id] })).status, 400);
  assert.equal((await request({ role_ids: [999999] })).status, 400);
  const target = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = ?', [targetId]);
  const mappings = await queryAll<{ role_id: number }>('SELECT role_id FROM user_roles WHERE user_id = ?', [targetId]);
  assert.equal(target?.role, 'admin');
  assert.deepEqual(mappings.map((item) => item.role_id), [adminRole.id]);
  assert.equal((await request({ role_ids: [memberRole.id] })).status, 200);
  assert.equal((await queryOne<{ role: string }>('SELECT role FROM users WHERE id = ?', [targetId]))?.role, 'member');
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDatabase();
}

console.log('RBAC invariant tests passed');
