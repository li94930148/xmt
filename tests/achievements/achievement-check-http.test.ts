import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-achievement-check-'));
process.env.XMT_DB_PATH = path.join(directory, 'achievement-check.db');
process.env.JWT_SECRET = 'achievement-check-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: achievementsRouter } = await import('../../api/routes/achievements.js');

await initDatabase();
const userId = await executeInsert("INSERT INTO users (username,password,email,role,name,enabled,force_change_password) VALUES ('achievement-check-member','unused','achievement-check@example.invalid','member','成就测试用户',1,0)");
await execute("INSERT INTO topics (title,creator_id,status) VALUES ('满足成就条件的选题',?,'pending')", [userId]);
const existingAchievementId = await executeInsert("INSERT INTO achievements (name,condition_type,condition_value,points,sort_order) VALUES ('已获得','topic_count',1,10,1)");
const nextAchievementId = await executeInsert("INSERT INTO achievements (name,condition_type,condition_value,points,sort_order) VALUES ('后续可获得','topic_count',1,20,2)");
await execute('INSERT INTO user_achievements (user_id,achievement_id) VALUES (?,?)', [userId, existingAchievementId]);

const app = express();
app.use(express.json());
app.use('/api/achievements', achievementsRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');

try {
  const response = await fetch(`http://127.0.0.1:${address.port}/api/achievements/check`, {
    method: 'POST',
    headers: { authorization: `Bearer ${signToken({ userId })}`, 'content-type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(2000),
  });
  assert.equal(response.status, 200, 'an already-earned first achievement must not leave the HTTP request unanswered');
  const body = await response.json() as { newAchievements: Array<{ id: number }>; message: string };
  assert.deepEqual(body.newAchievements.map(item => item.id), [nextAchievementId], 'checking continues and grants a later qualifying achievement');
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM user_achievements WHERE user_id=?', [userId]))?.count, 2);

  const repeated = await fetch(`http://127.0.0.1:${address.port}/api/achievements/check`, {
    method: 'POST',
    headers: { authorization: `Bearer ${signToken({ userId })}`, 'content-type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(2000),
  });
  assert.equal(repeated.status, 200);
  assert.deepEqual((await repeated.json() as { newAchievements: unknown[] }).newAchievements, []);
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM user_achievements WHERE user_id=?', [userId]))?.count, 2, 'rechecking does not duplicate earned rows');

  const concurrentAchievementId = await executeInsert(
    "INSERT INTO achievements (name,condition_type,condition_value,points,sort_order) VALUES ('并发检查只授予一次','topic_count',1,30,3)",
  );
  const messageCountBefore = Number((await queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM messages WHERE user_id=? AND title='🏆 获得新成就'",
    [userId],
  ))?.count || 0);
  const concurrentResponses = await Promise.all([1, 2].map(() => fetch(`http://127.0.0.1:${address.port}/api/achievements/check`, {
    method: 'POST',
    headers: { authorization: `Bearer ${signToken({ userId })}`, 'content-type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(2000),
  })));
  assert.deepEqual(concurrentResponses.map(response => response.status), [200, 200]);
  const concurrentBodies = await Promise.all(concurrentResponses.map(response => response.json() as Promise<{ newAchievements: Array<{ id: number }> }>));
  assert.equal(concurrentBodies.reduce((sum, body) => sum + body.newAchievements.filter(item => item.id === concurrentAchievementId).length, 0), 1,
    'concurrent checks report the newly earned achievement in exactly one response');
  assert.equal(Number((await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM user_achievements WHERE user_id=? AND achievement_id=?',
    [userId, concurrentAchievementId],
  ))?.count || 0), 1, 'the unique earned row is inserted only once');
  assert.equal(Number((await queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM messages WHERE user_id=? AND title='🏆 获得新成就'",
    [userId],
  ))?.count || 0), messageCountBefore + 1, 'concurrent checks persist only one achievement notification');
} finally {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}

console.log('成就检查 HTTP 回归通过：已获得项会跳过、后续成就继续检查，顺序与并发重复检查均只授予并通知一次。');
