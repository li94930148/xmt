import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-role-management-'));
process.env.XMT_DB_PATH = path.join(directory, 'security.test.db'); process.env.JWT_SECRET = 'role-management-test-secret';
const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne, queryAll } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: rolesRouter } = await import('../../api/routes/roles.js');
await initDatabase();
const role = async (code: string) => { const item = await queryOne<{ id: number; code: string }>('SELECT id,code FROM roles WHERE code=?', [code]); assert(item); return item; };
const permission = async (code: string) => { const item = await queryOne<{ id: number; code: string }>('SELECT id,code FROM permissions WHERE code=?', [code]); assert(item); return item; };
const adminRole = await role('admin'); const systemRole = await permission('system:role'); const systemPermission = await permission('system:permission');
const managerRoleId = await executeInsert('INSERT INTO roles(code,name,description,is_system) VALUES(?,?,?,0)', ['security-role-manager', 'Security role manager', 'fixture']);
await execute('INSERT INTO role_permissions(role_id,permission_id) VALUES(?,?)', [managerRoleId, systemRole.id]);
const limitedRoleId = await executeInsert('INSERT INTO roles(code,name,description,is_system) VALUES(?,?,?,0)', ['security-limited-role', 'Security limited role', 'fixture']);
const managerId = await executeInsert('INSERT INTO users(username,password,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,?)', ['security-role-manager', 'unused', 'security-role-manager', 'Manager', 1, 0]);
await execute('INSERT INTO user_roles(user_id,role_id) VALUES(?,?)', [managerId, managerRoleId]);
const targetId = await executeInsert('INSERT INTO users(username,password,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,?)', ['security-role-target', 'unused', 'member', 'Target', 1, 0]);
const adminId = await executeInsert('INSERT INTO users(username,password,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,?)', ['security-role-admin', 'unused', 'admin', 'Admin', 1, 0]);
await execute('INSERT INTO user_roles(user_id,role_id) VALUES(?,?)', [adminId, adminRole.id]);
const app = express(); app.use(express.json()); app.use('/api/roles', rolesRouter);
const server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.once('listening', resolve)); const address = server.address(); assert(address && typeof address !== 'string'); const base = `http://127.0.0.1:${address.port}/api/roles`;
const headers = (userId: number) => ({ authorization: `Bearer ${signToken({ userId })}`, 'content-type': 'application/json' });
async function post(pathname: string, userId: number, body: unknown) { return fetch(`${base}${pathname}`, { method: 'POST', headers: headers(userId), body: JSON.stringify(body) }); }
try {
  assert.equal((await post(`/user/${managerId}`, managerId, { role_ids: [adminRole.id] })).status, 403);
  assert.equal((await post(`/user/${targetId}`, managerId, { role_ids: [adminRole.id] })).status, 403);
  const before = await queryAll<{ role_id: number }>('SELECT role_id FROM user_roles WHERE user_id=?', [targetId]);
  assert.equal((await post(`/user/${targetId}`, managerId, { role_ids: [limitedRoleId, adminRole.id] })).status, 403);
  assert.deepEqual(await queryAll<{ role_id: number }>('SELECT role_id FROM user_roles WHERE user_id=?', [targetId]), before);
  assert.equal((await post(`/user/${targetId}`, managerId, { role_ids: [limitedRoleId] })).status, 200);
  assert.equal((await post(`/user/${targetId}`, adminId, { role_ids: [adminRole.id] })).status, 200);
  assert.equal((await post('', managerId, { code: 'forbidden-role', name: 'Forbidden', permission_ids: [systemRole.id, systemPermission.id] })).status, 403);
  assert.equal((await post('', managerId, { code: 'allowed-role', name: 'Allowed', permission_ids: [systemRole.id] })).status, 200);
  const permissionsBefore = await queryAll<{ permission_id: number }>('SELECT permission_id FROM role_permissions WHERE role_id=?', [managerRoleId]);
  const update = await fetch(`${base}/${managerRoleId}`, { method: 'PUT', headers: headers(managerId), body: JSON.stringify({ permission_ids: [systemRole.id, systemPermission.id] }) });
  assert.equal(update.status, 403); assert.deepEqual(await queryAll<{ permission_id: number }>('SELECT permission_id FROM role_permissions WHERE role_id=?', [managerRoleId]), permissionsBefore);
  const adminUpdate = await fetch(`${base}/${managerRoleId}`, { method: 'PUT', headers: headers(adminId), body: JSON.stringify({ permission_ids: [systemRole.id, systemPermission.id] }) });
  assert.equal(adminUpdate.status, 200);
} finally { await new Promise<void>((resolve) => server.close(() => resolve())); await closeDatabase(); }
console.log('Role management security tests passed');
