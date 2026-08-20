import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-role-assignment-'));
process.env.XMT_DB_PATH = path.join(directory, 'security.test.db');
process.env.JWT_SECRET = 'role-assignment-test-secret';
const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: usersRouter } = await import('../../api/routes/users.js');
await initDatabase();

const adminRole = await queryOne<{ id: number }>('SELECT id FROM roles WHERE code = ?', ['admin']);
const directorRole = await queryOne<{ id: number }>('SELECT id FROM roles WHERE code = ?', ['director']);
assert(adminRole && directorRole);
const directorId = await executeInsert(`INSERT INTO users(username,password,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,?)`, ['role-director', 'unused', 'director', 'Director', 1, 0]);
await execute('INSERT INTO user_roles(user_id, role_id) VALUES(?, ?)', [directorId, directorRole.id]);
const adminId = await executeInsert(`INSERT INTO users(username,password,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,?)`, ['role-admin', 'unused', 'admin', 'Admin', 1, 0]);
await execute('INSERT INTO user_roles(user_id, role_id) VALUES(?, ?)', [adminId, adminRole.id]);
const targetId = await executeInsert(`INSERT INTO users(username,password,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,?)`, ['role-target', 'unused', 'member', 'Target', 1, 0]);

const app = express(); app.use(express.json()); app.use('/api/users', usersRouter);
const server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address(); assert(address && typeof address !== 'string'); const base = `http://127.0.0.1:${address.port}/api/users`;
const headersFor = (id: number) => ({ authorization: `Bearer ${signToken({ userId: id })}`, 'content-type': 'application/json' });
try {
  assert.equal((await fetch(base, { method: 'POST', headers: headersFor(directorId), body: JSON.stringify({ username: 'forbidden-admin', password: 'password', role: 'admin' }) })).status, 403);
  assert.equal((await fetch(`${base}/${directorId}`, { method: 'PUT', headers: headersFor(directorId), body: JSON.stringify({ role: 'admin' }) })).status, 403);
  assert.equal((await fetch(`${base}/${targetId}`, { method: 'PUT', headers: headersFor(directorId), body: JSON.stringify({ role: 'admin' }) })).status, 403);
  const assignable = await (await fetch(`${base}/assignable-roles`, { headers: headersFor(directorId) })).json() as Array<{ code: string }>;
  assert.equal(assignable.some((role) => role.code === 'admin'), false);
  assert.equal((await fetch(base, { method: 'POST', headers: headersFor(adminId), body: JSON.stringify({ username: 'permitted-admin', password: 'password', role: 'admin' }) })).status, 200);
  assert.equal((await fetch(`${base}/${targetId}`, { method: 'PUT', headers: headersFor(adminId), body: JSON.stringify({ role: 'admin' }) })).status, 200);
} finally { await new Promise<void>((resolve) => server.close(() => resolve())); await closeDatabase(); }
console.log('User role assignment security tests passed');
