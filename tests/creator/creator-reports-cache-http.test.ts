import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempRoot = mkdtempSync(path.join(tmpdir(), 'xmt-creator-reports-cache-'));
process.env.XMT_DB_PATH = path.join(tempRoot, 'creator-reports.db');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'creator-reports-cache-http-test-secret';

const [{ default: app }, database, databaseUtils, { signToken }] = await Promise.all([
  import('../../api/app.js'),
  import('../../api/database/db.js'),
  import('../../api/database/utils.js'),
  import('../../api/utils/jwt.js'),
]);
const { execute, executeInsert } = databaseUtils;
await database.initDatabase();

const adminId = await executeInsert(
  'INSERT INTO users(username,password,role,name,enabled) VALUES(?,?,?,?,1)',
  ['creator-reports-cache-admin', 'unused', 'admin', '报告缓存验收管理员'],
);
await execute('INSERT OR IGNORE INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [adminId, 'admin']);
const adminToken = signToken({ userId: adminId, username: 'creator-reports-cache-admin', role: 'admin' });

const limitedUserId = await executeInsert(
  'INSERT INTO users(username,password,role,name,enabled) VALUES(?,?,?,?,1)',
  ['creator-reports-cache-limited', 'unused', 'member', '无报告权限用户'],
);
const limitedToken = signToken({ userId: limitedUserId, username: 'creator-reports-cache-limited', role: 'member' });

const creatorAccountId = await executeInsert(
  `INSERT INTO creator_platform_accounts(user_id,platform,platform_uid,nickname,status)
   VALUES(?,'douyin','creator-reports-cache-account','报告缓存验收账号','active')`,
  [adminId],
);
await executeInsert(
  `INSERT INTO douyin_accounts(name,profile_url,douyin_uid,creator_account_id,last_sync_time)
   VALUES('报告缓存验收账号','','creator-reports-cache-account',?,'2026-10-30T08:00:00.000Z')`,
  [creatorAccountId],
);

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const endpoint = `http://127.0.0.1:${address.port}/api/creator-agent/reports`;
const request = (url: string, token?: string) => fetch(url, {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
});
const noStore = (response: Response) => assert.match(response.headers.get('cache-control') || '', /no-store/i);

try {
  const unauthenticated = await request(endpoint);
  assert.equal(unauthenticated.status, 401);
  noStore(unauthenticated);

  const permissionDenied = await request(endpoint, limitedToken);
  assert.equal(permissionDenied.status, 403);
  noStore(permissionDenied);

  const unavailableScope = await request(`${endpoint}?account_id=not-synced-account`, adminToken);
  assert.equal(unavailableScope.status, 404);
  noStore(unavailableScope);

  const response = await request(`${endpoint}?account_id=creator-reports-cache-account`, adminToken);
  assert.equal(response.status, 200);
  noStore(response);
  assert(Array.isArray(await response.json()), 'the report list returns its current persisted representation');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  database.closeDatabase();
  rmSync(tempRoot, { recursive: true, force: true });
}

console.log('Creator report HTTP cache contract passed.');
