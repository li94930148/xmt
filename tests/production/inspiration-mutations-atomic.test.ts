import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-inspiration-mutations-'));
process.env.XMT_DB_PATH = path.join(directory, 'inspiration-mutations.test.db');
process.env.JWT_SECRET = 'inspiration-mutations-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: inspirationRoutes } = await import('../../api/routes/inspirations.js');

await initDatabase();
const userId = await executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
  ['inspiration-atomic-qa', 'unused', 'inspiration-atomic-qa@example.invalid', 'admin', '灵感原子性验收'],
);
const inspirationId = await executeInsert(
  `INSERT INTO inspirations(title, description, category, creator_id, votes) VALUES(?,?,?,?,0)`,
  ['原子性验收灵感', '隔离事务测试', '故事', userId],
);

const app = express();
app.use(express.json());
app.use('/api/inspirations', inspirationRoutes);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const endpoint = `http://127.0.0.1:${address.port}/api/inspirations`;
const headers = {
  authorization: `Bearer ${signToken({ userId })}`,
  'content-type': 'application/json',
};

async function request(pathname: string, method: 'POST' | 'DELETE', body?: unknown) {
  return fetch(`${endpoint}/${inspirationId}${pathname}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

try {
  await execute(`CREATE TRIGGER fail_inspiration_comment_parent_update
    BEFORE UPDATE OF updated_at ON inspirations
    BEGIN SELECT RAISE(ABORT, 'injected comment parent update failure'); END`);
  const failedComment = await request('/comments', 'POST', { content: '事务失败不应留下评论' });
  assert.equal(failedComment.status, 500);
  assert.equal((await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM inspiration_comments WHERE inspiration_id = ?', [inspirationId]))?.total, 0);
  await execute('DROP TRIGGER fail_inspiration_comment_parent_update');

  const createdComment = await request('/comments', 'POST', { content: '恢复后只写入一次' });
  assert.equal(createdComment.status, 200);
  const commentBody = await createdComment.json() as { comment: { content: string; creator_id: number }; comment_count: number };
  assert.equal(commentBody.comment.content, '恢复后只写入一次');
  assert.equal(Number(commentBody.comment.creator_id), userId);
  assert.equal(commentBody.comment_count, 1);
  assert.equal((await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM inspiration_comments WHERE inspiration_id = ?', [inspirationId]))?.total, 1);

  const otherUserId = await executeInsert(
    `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
    ['inspiration-unauthorized-qa', 'unused', 'inspiration-unauthorized-qa@example.invalid', 'member', '无删除权限验收'],
  );
  const unauthorizedDelete = await fetch(`${endpoint}/${inspirationId}`, {
    method: 'DELETE',
    headers: { ...headers, authorization: `Bearer ${signToken({ userId: otherUserId })}` },
  });
  assert.equal(unauthorizedDelete.status, 403);
  assert.ok(await queryOne('SELECT id FROM inspirations WHERE id = ?', [inspirationId]), 'permission rejection leaves the inspiration intact');

  await execute(`CREATE TRIGGER fail_inspiration_vote_parent_update
    BEFORE UPDATE OF votes ON inspirations
    BEGIN SELECT RAISE(ABORT, 'injected vote parent update failure'); END`);
  const failedVote = await request('/vote', 'POST');
  assert.equal(failedVote.status, 500);
  assert.equal((await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM inspiration_votes WHERE inspiration_id = ?', [inspirationId]))?.total, 0);
  assert.equal((await queryOne<{ votes: number }>('SELECT votes FROM inspirations WHERE id = ?', [inspirationId]))?.votes, 0);
  await execute('DROP TRIGGER fail_inspiration_vote_parent_update');

  const voted = await request('/vote', 'POST');
  assert.equal(voted.status, 200);
  assert.deepEqual(await voted.json(), { message: '投票成功', voted: true });
  assert.equal((await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM inspiration_votes WHERE inspiration_id = ?', [inspirationId]))?.total, 1);
  assert.equal((await queryOne<{ votes: number }>('SELECT votes FROM inspirations WHERE id = ?', [inspirationId]))?.votes, 1);

  await execute(`CREATE TRIGGER fail_inspiration_unvote_parent_update
    BEFORE UPDATE OF votes ON inspirations
    BEGIN SELECT RAISE(ABORT, 'injected unvote parent update failure'); END`);
  const failedUnvote = await request('/vote', 'POST');
  assert.equal(failedUnvote.status, 500);
  assert.equal((await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM inspiration_votes WHERE inspiration_id = ?', [inspirationId]))?.total, 1);
  assert.equal((await queryOne<{ votes: number }>('SELECT votes FROM inspirations WHERE id = ?', [inspirationId]))?.votes, 1);
  await execute('DROP TRIGGER fail_inspiration_unvote_parent_update');

  const unvoted = await request('/vote', 'POST');
  assert.equal(unvoted.status, 200);
  assert.deepEqual(await unvoted.json(), { message: '取消投票成功', voted: false });
  assert.equal((await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM inspiration_votes WHERE inspiration_id = ?', [inspirationId]))?.total, 0);
  assert.equal((await queryOne<{ votes: number }>('SELECT votes FROM inspirations WHERE id = ?', [inspirationId]))?.votes, 0);

  const finalVote = await request('/vote', 'POST');
  assert.equal(finalVote.status, 200);
  await execute(`CREATE TRIGGER fail_inspiration_vote_delete
    BEFORE DELETE ON inspiration_votes
    BEGIN SELECT RAISE(ABORT, 'injected inspiration vote deletion failure'); END`);
  const failedDelete = await fetch(`${endpoint}/${inspirationId}`, { method: 'DELETE', headers });
  assert.equal(failedDelete.status, 500);
  assert.ok(await queryOne('SELECT id FROM inspirations WHERE id = ?', [inspirationId]), 'the parent row remains after child cleanup failure');
  assert.equal((await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM inspiration_comments WHERE inspiration_id = ?', [inspirationId]))?.total, 1, 'earlier comment cleanup is rolled back');
  assert.equal((await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM inspiration_votes WHERE inspiration_id = ?', [inspirationId]))?.total, 1);
  await execute('DROP TRIGGER fail_inspiration_vote_delete');

  const deleted = await fetch(`${endpoint}/${inspirationId}`, { method: 'DELETE', headers });
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), { message: '灵感删除成功' });
  assert.equal(await queryOne('SELECT id FROM inspirations WHERE id = ?', [inspirationId]), null);
  assert.equal((await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM inspiration_comments WHERE inspiration_id = ?', [inspirationId]))?.total, 0);
  assert.equal((await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM inspiration_votes WHERE inspiration_id = ?', [inspirationId]))?.total, 0);
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}

console.log('inspiration mutation atomicity tests passed');
