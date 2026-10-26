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
const secondInspirationId = await executeInsert(
  `INSERT INTO inspirations(title, description, category, creator_id, votes) VALUES(?,?,?,?,0)`,
  ['第二条验收灵感', '隔离事务测试', '故事', userId],
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

async function request(pathname: string, method: 'POST' | 'DELETE', body?: unknown, targetInspirationId = inspirationId) {
  return fetch(`${endpoint}/${targetInspirationId}${pathname}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

try {
  const rollbackRequestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
  await execute(`CREATE TRIGGER fail_inspiration_comment_parent_update
    BEFORE UPDATE OF updated_at ON inspirations
    BEGIN SELECT RAISE(ABORT, 'injected comment parent update failure'); END`);
  const failedComment = await request('/comments', 'POST', { content: '事务失败不应留下评论', client_request_id: rollbackRequestId });
  assert.equal(failedComment.status, 500);
  assert.equal((await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM inspiration_comments WHERE inspiration_id = ?', [inspirationId]))?.total, 0);
  await execute('DROP TRIGGER fail_inspiration_comment_parent_update');

  const createdComment = await request('/comments', 'POST', { content: '事务失败不应留下评论', client_request_id: rollbackRequestId });
  assert.equal(createdComment.status, 200);
  const commentBody = await createdComment.json() as { comment: { id: number; content: string; creator_id: number; client_request_id: string }; comment_count: number; idempotent_replay: boolean };
  assert.equal(commentBody.comment.content, '事务失败不应留下评论');
  assert.equal(Number(commentBody.comment.creator_id), userId);
  assert.equal(commentBody.comment.client_request_id, rollbackRequestId);
  assert.equal(commentBody.comment_count, 1);
  assert.equal(commentBody.idempotent_replay, false);
  assert.equal((await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM inspiration_comments WHERE inspiration_id = ?', [inspirationId]))?.total, 1);

  const repeatedComment = await request('/comments', 'POST', { content: '事务失败不应留下评论', client_request_id: rollbackRequestId });
  assert.equal(repeatedComment.status, 200);
  const repeatedCommentBody = await repeatedComment.json() as typeof commentBody;
  assert.equal(repeatedCommentBody.idempotent_replay, true);
  assert.equal(repeatedCommentBody.comment.id, commentBody.comment.id, 'same request key returns the original comment');
  assert.equal(repeatedCommentBody.comment_count, 1);
  assert.equal((await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM inspiration_comments WHERE inspiration_id = ?', [inspirationId]))?.total, 1, 'replaying a request key never creates a duplicate comment');

  const conflictingPayload = await request('/comments', 'POST', { content: '不能复用同一个编号写入不同内容', client_request_id: rollbackRequestId });
  assert.equal(conflictingPayload.status, 409, 'a request key cannot be reused for different content');
  const conflictingParent = await request('/comments', 'POST', { content: '事务失败不应留下评论', client_request_id: rollbackRequestId }, secondInspirationId);
  assert.equal(conflictingParent.status, 409, 'a request key cannot be reused for a different inspiration');
  const invalidRequestId = await request('/comments', 'POST', { content: '无效编号', client_request_id: 'not-a-uuid' });
  assert.equal(invalidRequestId.status, 400);
  assert.equal((await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM inspiration_comments'))?.total, 1, 'conflicts and invalid keys never create comments');

  const otherUserId = await executeInsert(
    `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
    ['inspiration-unauthorized-qa', 'unused', 'inspiration-unauthorized-qa@example.invalid', 'member', '无删除权限验收'],
  );
  const keyedVoteRequestId = 'e11a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
  const keyedVote = await request('/vote', 'POST', { client_request_id: keyedVoteRequestId, voted: true }, secondInspirationId);
  assert.equal(keyedVote.status, 200);
  const keyedVoteBody = await keyedVote.json() as { voted: boolean; votes: number; idempotent_replay: boolean };
  assert.deepEqual(keyedVoteBody, { message: '投票成功', voted: true, processedVoted: true, votes: 1, idempotent_replay: false });
  assert.equal((await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM inspiration_votes WHERE inspiration_id = ?', [secondInspirationId]))?.total, 1);

  const repeatedKeyedVote = await request('/vote', 'POST', { client_request_id: keyedVoteRequestId, voted: true }, secondInspirationId);
  assert.equal(repeatedKeyedVote.status, 200);
  assert.equal((await repeatedKeyedVote.json() as { idempotent_replay: boolean }).idempotent_replay, true);
  assert.equal((await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM inspiration_votes WHERE inspiration_id = ?', [secondInspirationId]))?.total, 1,
    'replaying the same target-state request does not toggle the vote a second time');

  const conflictingVoteState = await request('/vote', 'POST', { client_request_id: keyedVoteRequestId, voted: false }, secondInspirationId);
  assert.equal(conflictingVoteState.status, 409, 'a request id cannot be reused with a different target state');
  const conflictingVoteTarget = await request('/vote', 'POST', { client_request_id: keyedVoteRequestId, voted: true }, inspirationId);
  assert.equal(conflictingVoteTarget.status, 409, 'a request id cannot be reused for a different inspiration');
  assert.equal((await request('/vote', 'POST', { client_request_id: 'not-a-uuid', voted: true }, secondInspirationId)).status, 400);
  assert.equal((await request('/vote', 'POST', { client_request_id: keyedVoteRequestId }, secondInspirationId)).status, 400);

  const keyedVoteStatus = await fetch(`${endpoint}/vote-requests/${keyedVoteRequestId}`, { headers });
  assert.equal(keyedVoteStatus.status, 200);
  assert.equal(keyedVoteStatus.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await keyedVoteStatus.json(), {
    inspirationId: secondInspirationId,
    processedVoted: true,
    voted: true,
    votes: 1,
  });
  const crossActorVoteStatus = await fetch(`${endpoint}/vote-requests/${keyedVoteRequestId}`, {
    headers: { ...headers, authorization: `Bearer ${signToken({ userId: otherUserId })}` },
  });
  assert.equal(crossActorVoteStatus.status, 404, 'vote request status is isolated to the actor who created it');
  const crossActorVoteReplay = await fetch(`${endpoint}/${secondInspirationId}/vote`, {
    method: 'POST',
    headers: { ...headers, authorization: `Bearer ${signToken({ userId: otherUserId })}` },
    body: JSON.stringify({ client_request_id: keyedVoteRequestId, voted: true }),
  });
  assert.equal(crossActorVoteReplay.status, 409, 'another actor cannot replay the request key');

  const concurrentVoteRequestId = 'f11a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
  const concurrentVoteResults = await Promise.all([
    request('/vote', 'POST', { client_request_id: concurrentVoteRequestId, voted: false }, secondInspirationId),
    request('/vote', 'POST', { client_request_id: concurrentVoteRequestId, voted: false }, secondInspirationId),
  ]);
  assert.deepEqual(concurrentVoteResults.map((response) => response.status), [200, 200], 'concurrent same-key requests both resolve successfully');
  assert.equal((await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM inspiration_votes WHERE inspiration_id = ?', [secondInspirationId]))?.total, 0,
    'concurrent same-key requests apply the target state only once');
  assert.equal((await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM inspiration_vote_request_keys WHERE client_request_id = ?', [concurrentVoteRequestId]))?.total, 1);

  const replayAfterLaterChange = await request('/vote', 'POST', { client_request_id: keyedVoteRequestId, voted: true }, secondInspirationId);
  assert.equal(replayAfterLaterChange.status, 200);
  assert.deepEqual(await replayAfterLaterChange.json(), {
    message: '取消投票成功',
    voted: false,
    processedVoted: true,
    votes: 0,
    idempotent_replay: true,
  }, 'a replay reports both the original processed target and the current state after a later request');
  assert.equal((await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM inspiration_votes WHERE inspiration_id = ?', [secondInspirationId]))?.total, 0,
    'replaying an old key after a newer unlike does not revive the vote');

  const rollbackVoteRequestId = 'a21a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
  await execute(`CREATE TRIGGER fail_keyed_inspiration_vote_parent_update
    BEFORE UPDATE OF votes ON inspirations
    BEGIN SELECT RAISE(ABORT, 'injected keyed vote parent update failure'); END`);
  const failedKeyedVote = await request('/vote', 'POST', { client_request_id: rollbackVoteRequestId, voted: true }, secondInspirationId);
  assert.equal(failedKeyedVote.status, 500);
  assert.equal(await queryOne('SELECT client_request_id FROM inspiration_vote_request_keys WHERE client_request_id = ?', [rollbackVoteRequestId]), null,
    'failed vote writes do not leave a successful recovery receipt');
  assert.equal((await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM inspiration_votes WHERE inspiration_id = ?', [secondInspirationId]))?.total, 0,
    'failed keyed vote transactions roll back the vote row');
  await execute('DROP TRIGGER fail_keyed_inspiration_vote_parent_update');
  assert.equal((await request('/vote', 'POST', { client_request_id: rollbackVoteRequestId, voted: true }, secondInspirationId)).status, 200,
    'the same request key can safely retry after a transaction rollback');

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

  const deletedSecondInspiration = await fetch(`${endpoint}/${secondInspirationId}`, { method: 'DELETE', headers });
  assert.equal(deletedSecondInspiration.status, 200);
  const deletedVoteStatus = await fetch(`${endpoint}/vote-requests/${keyedVoteRequestId}`, { headers });
  assert.equal(deletedVoteStatus.status, 410, 'deleting an inspiration preserves a terminal vote request result');
  assert.equal((await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM inspiration_vote_request_keys WHERE inspiration_id = ?', [secondInspirationId]))?.total, 3,
    'vote request tombstones survive inspiration deletion');
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}

console.log('inspiration mutation atomicity tests passed');
