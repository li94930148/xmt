import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-user-revocation-'));
process.env.XMT_DB_PATH = path.join(directory, 'security.test.db');
process.env.JWT_SECRET = 'user-revocation-test-secret';
process.env.NODE_ENV = 'test';
const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { SessionService } = await import('../../api/modules/auth/session/session.service.js');
const { SqliteSessionRepository } = await import('../../api/modules/auth/session/session.sqlite-repository.js');
const { default: app, io, server } = await import('../../api/app.js');
await initDatabase();

const adminRole = await queryOne<{ id: number }>('SELECT id FROM roles WHERE code = ?', ['admin']);
assert(adminRole);
const adminId = await executeInsert(`INSERT INTO users(username,password,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,?)`, ['revocation-admin', 'unused', 'admin', 'Admin', 1, 0]);
await execute('INSERT INTO user_roles(user_id,role_id) VALUES(?,?)', [adminId, adminRole.id]);
const targetId = await executeInsert(`INSERT INTO users(username,password,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,?)`, ['revocation-target', 'unused', 'member', 'Target', 1, 0]);
const sessions = new SessionService({ repository: new SqliteSessionRepository() });
const sessionId = await sessions.createSession({ userId: targetId, clientType: 'web' });
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address(); assert(address && typeof address !== 'string'); const base = `http://127.0.0.1:${address.port}`;
const waitFor = (socket: Socket, event: string) => new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new Error(`timeout ${event}`)), 1_000); socket.once(event, () => { clearTimeout(timer); resolve(); }); });
let socket: Socket | null = null;
try {
  socket = connect(base, { auth: { token: signToken({ userId: targetId }) }, transports: ['websocket'], reconnection: false });
  await waitFor(socket, 'connect');
  const disconnected = waitFor(socket, 'disconnect');
  const response = await fetch(`${base}/api/users/${targetId}`, { method: 'PUT', headers: { authorization: `Bearer ${signToken({ userId: adminId })}`, 'content-type': 'application/json' }, body: JSON.stringify({ enabled: false }) });
  assert.equal(response.status, 200);
  await disconnected;
  assert.equal((await sessions.getSession(sessionId)).state, 'REVOKED');
} finally { socket?.disconnect(); await new Promise<void>((resolve) => io.close(() => resolve())); if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve())); await closeDatabase(); }
console.log('User session and socket revocation tests passed');
