import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-user-list-pagination-'));
process.env.XMT_DB_PATH = path.join(directory, 'users.db');
process.env.JWT_SECRET = 'user-list-pagination-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: usersRoutes } = await import('../../api/routes/users.js');

await initDatabase();
const seededUserCount = Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM users'))?.count || 0);
const ownerId = await executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
  ['user-pagination-admin', 'unused', 'user-pagination-admin@example.invalid', 'admin', 'User Pagination Admin'],
);
await execute('INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [ownerId, 'admin']);
const otherId = await executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
  ['user-pagination-member', 'unused', 'user-pagination-member@example.invalid', 'member', 'Member'],
);
const expectedTotal = seededUserCount + 58;

for (let index = 1; index <= 55; index += 1) {
  await executeInsert(
    `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
    [`team-user-${String(index).padStart(3, '0')}`, 'unused', `person${index}@example.invalid`, 'member', `员工-${String(index).padStart(3, '0')}`],
  );
}
await executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
  ['special-percent%user', 'unused', 'percent@example.invalid', 'member', '特殊字符测试'],
);

const app = express();
app.use(express.json());
app.use('/api/users', usersRoutes);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api/users`;
const adminHeaders = { Authorization: `Bearer ${signToken({ userId: ownerId })}` };
const memberHeaders = { Authorization: `Bearer ${signToken({ userId: otherId })}` };

async function getUsers(query: string, headers = adminHeaders) {
  const response = await fetch(`${base}${query ? `?${query}` : ''}`, { headers });
  return { response, body: await response.json() as { data: Array<{ id: number; username: string; password?: string }>; total: number; page: number; limit: number } };
}

try {
  const firstPage = await getUsers('page=1&limit=50');
  assert.equal(firstPage.response.status, 200);
  assert.equal(firstPage.body.total, expectedTotal, 'seeded accounts and new accounts are counted once');
  assert.equal(firstPage.body.page, 1);
  assert.equal(firstPage.body.limit, 50);
  assert.equal(firstPage.body.data.length, 50);
  assert.ok(firstPage.body.data.every((item) => item.password === undefined), 'list response never includes password fields');

  const secondPage = await getUsers('page=2&limit=50');
  assert.equal(secondPage.body.total, expectedTotal);
  assert.equal(secondPage.body.data.length, expectedTotal - 50);
  assert.equal(new Set([...firstPage.body.data, ...secondPage.body.data].map((item) => item.id)).size, expectedTotal, 'stable pages contain no duplicates');

  const search = await getUsers('page=1&limit=50&search=%E5%91%98%E5%B7%A5-054');
  assert.equal(search.body.total, 1, 'search includes users beyond the first page');
  assert.equal(search.body.data[0]?.username, 'team-user-054');

  const literalPercent = await getUsers('search=%25');
  assert.equal(literalPercent.body.total, 1, 'search text treats percent as a literal character, not an SQL wildcard');
  assert.equal(literalPercent.body.data[0]?.username, 'special-percent%user');

  const invalid = await getUsers('page=0&limit=invalid');
  assert.equal(invalid.body.page, 1);
  assert.equal(invalid.body.limit, 200, 'legacy default remains capped at 200');

  const forbidden = await getUsers('', memberHeaders);
  assert.equal(forbidden.response.status, 403, 'server-side search does not bypass user:view');
  console.log('user list pagination, search, and authorization tests passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
