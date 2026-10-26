import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-achievement-seed-'));
process.env.XMT_DB_PATH = path.join(directory, 'achievement-seed.db');
process.env.JWT_SECRET = 'achievement-seed-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryAll, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: achievementsRouter } = await import('../../api/routes/achievements.js');

await initDatabase();
const adminId = await executeInsert(
  'INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)',
  ['achievement-seed-admin', 'unused', 'achievement-seed@example.invalid', 'admin', '成就初始化测试管理员'],
);
await execute('INSERT OR IGNORE INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [adminId, 'admin']);
const unprivilegedId = await executeInsert(
  'INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)',
  ['achievement-seed-unprivileged', 'unused', 'achievement-seed-unprivileged@example.invalid', 'member', '无成就权限测试用户'],
);

const app = express();
app.use(express.json());
app.use('/api/achievements', achievementsRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const seedUrl = `http://127.0.0.1:${address.port}/api/achievements/seed`;
const headers = { authorization: `Bearer ${signToken({ userId: adminId })}` };
const unprivilegedHeaders = { authorization: `Bearer ${signToken({ userId: unprivilegedId })}` };
const expectedSortOrders = [1, 2, 3, 4, 5, 10, 11, 12, 20, 21, 22, 23, 30, 31, 40, 41, 42, 43, 44, 50, 51];

async function postSeed(requestHeaders: Record<string, string> = headers) {
  return fetch(seedUrl, { method: 'POST', headers: requestHeaders, signal: AbortSignal.timeout(3000) });
}

try {
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM achievements'))?.count, 0);

  const unauthenticated = await postSeed({});
  assert.equal(unauthenticated.status, 401, 'authentication remains required for initialization');
  assert.deepEqual(await unauthenticated.json(), { message: '未登录' });

  const forbidden = await postSeed(unprivilegedHeaders);
  assert.equal(forbidden.status, 403, 'initialization remains restricted to users with the required permission');
  assert.deepEqual(await forbidden.json(), { message: '权限不足', required: ['system:achievement'] });
  assert.equal(
    (await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM achievements'))?.count,
    0,
    'unauthenticated and unauthorized requests do not mutate achievements',
  );

  await execute(`
    CREATE TRIGGER fail_achievement_seed_midway
    BEFORE INSERT ON achievements
    WHEN NEW.sort_order = 20
    BEGIN SELECT RAISE(ABORT, 'injected achievement seed failure'); END
  `);

  const failed = await postSeed();
  assert.equal(failed.status, 500, 'a seed insert failure is returned as an API error');
  assert.equal(
    (await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM achievements'))?.count,
    0,
    'the failed transaction leaves no partially seeded achievements',
  );

  await execute('DROP TRIGGER fail_achievement_seed_midway');
  const concurrentResponses = await Promise.all([postSeed(), postSeed()]);
  assert.deepEqual(
    concurrentResponses.map((response) => response.status),
    [200, 200],
    'both concurrent initialization requests succeed after the injected failure is removed',
  );
  const concurrentBodies = await Promise.all(concurrentResponses.map((response) => response.json()));
  assert.equal(
    concurrentBodies.filter((body) => body.message === '成功初始化 21 个成就').length,
    1,
    'exactly one concurrent request performs the initialization',
  );
  assert.equal(
    concurrentBodies.filter((body) => body.message === '成就数据已存在，跳过初始化').length,
    1,
    'the other concurrent request observes the committed initialization and skips',
  );
  assert.equal(
    (await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM achievements'))?.count,
    21,
    'concurrent retry leaves exactly 21 achievements with no duplicate rows',
  );
  assert.deepEqual(
    (await queryAll<{ sort_order: number }>('SELECT sort_order FROM achievements ORDER BY sort_order ASC')).map((row) => row.sort_order),
    expectedSortOrders,
    'the complete configured seed set is present after retry',
  );

  const repeated = await postSeed();
  assert.equal(repeated.status, 200);
  assert.deepEqual(await repeated.json(), { message: '成就数据已存在，跳过初始化' });
  assert.equal(
    (await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM achievements'))?.count,
    21,
    'repeated initialization skips without duplicating rows',
  );
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}

console.log('成就初始化 HTTP 回归通过：权限校验、中段失败完整回滚、并发重试不重复且重复初始化跳过。');
