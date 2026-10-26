import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-production-review-'));
process.env.XMT_DB_PATH = path.join(directory, 'review.db');
process.env.JWT_SECRET = 'production-review-test-secret';

const [{ default: app }, database, databaseUtils, { signToken }] = await Promise.all([
  import('../../api/app.js'),
  import('../../api/database/db.js'),
  import('../../api/database/utils.js'),
  import('../../api/utils/jwt.js'),
]);
await database.initDatabase();

async function createUser(username: string, role: string) {
  const id = await databaseUtils.executeInsert(
    'INSERT INTO users(username,password,role,name,enabled) VALUES(?,?,?,?,1)',
    [username, 'unused', role, username],
  );
  await databaseUtils.execute('INSERT OR IGNORE INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [id, role]);
  return id;
}

await databaseUtils.execute("INSERT OR IGNORE INTO roles(code,name,description,is_system) VALUES('review-scoped','审阅测试角色','只允许测试用批注',0)");
await databaseUtils.execute(`
  INSERT OR IGNORE INTO role_permissions(role_id,permission_id)
  SELECT r.id,p.id FROM roles r,permissions p
  WHERE r.code='review-scoped' AND p.code='workflow:comment'
`);
const memberId = await createUser('review-member', 'review-scoped');
const editorId = await createUser('review-editor', 'editor');
const outsiderId = await createUser('review-outsider', 'review-scoped');
const topicId = await databaseUtils.executeInsert(
  "INSERT INTO topics(title,status,creator_id,assignee_id) VALUES('审阅线程测试','production',?,?)",
  [memberId, memberId],
);
const productionId = await databaseUtils.executeInsert(
  "INSERT INTO production(topic_id,version,content,status,operator_id) VALUES(?,'v1.0','<p>原始段落内容</p>','draft',?)",
  [topicId, memberId],
);
const outsiderTopicId = await databaseUtils.executeInsert(
  "INSERT INTO topics(title,status,creator_id,assignee_id) VALUES('无权稿件','production',?,?)",
  [outsiderId, outsiderId],
);
const outsiderProductionId = await databaseUtils.executeInsert(
  "INSERT INTO production(topic_id,version,content,status,operator_id) VALUES(?,'v1.0','<p>保密稿件</p>','draft',?)",
  [outsiderTopicId, outsiderId],
);
const memberToken = signToken({ userId: memberId, username: 'review-member', role: 'member' });
const editorToken = signToken({ userId: editorId, username: 'review-editor', role: 'editor' });
const outsiderToken = signToken({ userId: outsiderId, username: 'review-outsider', role: 'member' });
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const base = `http://127.0.0.1:${address.port}/api/workflow/production/${productionId}/review-threads`;
const request = (url: string, token: string, method = 'GET', body?: unknown) => fetch(url, {
  method,
  headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const anchor = { quote: '原始段落', context: JSON.stringify({ before: '', after: '内容' }), from: 1, to: 5 };

try {
  assert.equal((await request(base, outsiderToken)).status, 403, 'review records retain production visibility scope');
  assert.equal((await request(`${base}?version=v9.0`, memberToken)).status, 404, 'unknown versions cannot be used as thread scopes');
  assert.equal((await request(base, memberToken, 'POST', { version: 'v2.0', kind: 'comment', anchor, summary: '不允许跨版本创建' })).status, 409);
  assert.equal((await request(base, memberToken, 'POST', { version: 'v1.0', kind: 'comment', anchor: { ...anchor, to: 0 }, summary: '错误锚点' })).status, 400);

  const commentCreated = await request(base, memberToken, 'POST', {
    version: 'v1.0', kind: 'comment', anchor, summary: '请核对这段表述。',
  });
  assert.equal(commentCreated.status, 201);
  const commentId = Number((await commentCreated.json() as { id: number }).id);
  const suggestionCreated = await request(base, memberToken, 'POST', {
    version: 'v1.0', kind: 'suggestion', anchor,
    summary: '改成更易懂的表述。', proposed_text: '建议后的句子',
  });
  assert.equal(suggestionCreated.status, 201);
  const suggestionId = Number((await suggestionCreated.json() as { id: number }).id);
  const keyedSuggestionCreated = await request(base, memberToken, 'POST', {
    version: 'v1.0', kind: 'suggestion', anchor,
    summary: '这条建议用于状态幂等回归。', proposed_text: '幂等回归后的句子',
  });
  assert.equal(keyedSuggestionCreated.status, 201);
  const keyedSuggestionId = Number((await keyedSuggestionCreated.json() as { id: number }).id);

  const keyedThreadRequestId = randomUUID();
  const keyedThreadBody = {
    version: 'v1.0', kind: 'comment', anchor, summary: '这条批注需要支持安全恢复。',
    client_request_id: keyedThreadRequestId,
  };
  const concurrentThreads = await Promise.all([
    request(base, memberToken, 'POST', keyedThreadBody),
    request(base, memberToken, 'POST', keyedThreadBody),
  ]);
  assert.deepEqual(concurrentThreads.map((response) => response.status).sort(), [200, 201]);
  const concurrentThreadResults = await Promise.all(concurrentThreads.map((response) => response.json() as Promise<{ id: number }>));
  assert.equal(concurrentThreadResults[0].id, concurrentThreadResults[1].id, 'same-key concurrent retries resolve to one thread');
  const concurrentThreadCount = await databaseUtils.queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM production_review_threads WHERE production_id=? AND summary=?',
    [productionId, keyedThreadBody.summary],
  );
  assert.equal(Number(concurrentThreadCount?.count), 1, 'same-key concurrent retries insert exactly one thread');
  assert.equal((await request(base, memberToken, 'POST', { ...keyedThreadBody, summary: '不同说明' })).status, 409,
    'a thread request key cannot be reused for a different payload');
  assert.equal((await request(base, editorToken, 'POST', keyedThreadBody)).status, 409,
    'a thread request key cannot be reused by another actor');

  const keyedThreadFingerprint = createHash('sha256').update(JSON.stringify({
    version: keyedThreadBody.version,
    kind: keyedThreadBody.kind,
    anchor: { quote: anchor.quote, context: anchor.context, from: anchor.from, to: anchor.to },
    summary: keyedThreadBody.summary,
    proposed_text: null,
  })).digest('hex');
  const keyedThreadStatusUrl = `${base}/requests/${keyedThreadRequestId}?fingerprint=${keyedThreadFingerprint}`;
  const keyedThreadStatus = await request(keyedThreadStatusUrl, memberToken);
  assert.equal(keyedThreadStatus.status, 200);
  assert.equal(keyedThreadStatus.headers.get('cache-control'), 'no-store', 'thread request status is never cached');
  const keyedThreadStatusBody = await keyedThreadStatus.json() as { status: string; threadId: number };
  assert.equal(keyedThreadStatusBody.status, 'applied');
  assert.equal(keyedThreadStatusBody.threadId, concurrentThreadResults[0].id);
  assert.deepEqual(await request(keyedThreadStatusUrl, editorToken).then((response) => response.json()), { status: 'not_found' },
    'another actor cannot discover the request result');
  assert.deepEqual(await request(`${base}/requests/${randomUUID()}?fingerprint=${keyedThreadFingerprint}`, memberToken)
    .then((response) => response.json()), { status: 'not_found' }, 'unknown request IDs safely read as not found');
  assert.equal((await request(`${base}/requests/${keyedThreadRequestId}?fingerprint=${'0'.repeat(64)}`, memberToken)).status, 409,
    'status lookup rejects a mismatched payload fingerprint');

  const rollbackThreadRequestId = randomUUID();
  const rollbackThreadSummary = '账本写入失败时批注也必须回滚。';
  await databaseUtils.execute(`
    CREATE TRIGGER fail_production_review_thread_request_key
    BEFORE INSERT ON production_review_thread_request_keys
    BEGIN SELECT RAISE(ABORT, 'intentional isolated test failure'); END
  `);
  assert.equal((await request(base, memberToken, 'POST', {
    version: 'v1.0', kind: 'comment', anchor, summary: rollbackThreadSummary,
    client_request_id: rollbackThreadRequestId,
  })).status, 500, 'ledger failure is reported without claiming the thread was saved');
  const rolledBackThreadCount = await databaseUtils.queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM production_review_threads WHERE production_id=? AND summary=?',
    [productionId, rollbackThreadSummary],
  );
  assert.equal(Number(rolledBackThreadCount?.count), 0, 'thread insertion rolls back when its request ledger cannot be written');
  await databaseUtils.execute('DROP TRIGGER fail_production_review_thread_request_key');
  const rollbackThreadRetry = await request(base, memberToken, 'POST', {
    version: 'v1.0', kind: 'comment', anchor, summary: rollbackThreadSummary,
    client_request_id: rollbackThreadRequestId,
  });
  assert.equal(rollbackThreadRetry.status, 201, 'a rolled-back request can safely retry using the same key');

  const reply = await request(`${base}/${commentId}/replies`, memberToken, 'POST', { content: '我会补充依据。' });
  assert.equal(reply.status, 201);
  const list = await request(base, memberToken);
  assert.equal(list.status, 200);
  const listed = (await list.json() as { data: Array<{ id: number; kind: string; anchor_quote: string; replies: Array<{ content: string }> }> }).data;
  assert.equal(listed.length, 5);
  assert.equal(listed.find((thread) => thread.id === commentId)?.replies[0]?.content, '我会补充依据。');
  assert.equal(listed.find((thread) => thread.id === suggestionId)?.anchor_quote, anchor.quote);

  const keyedReplyUrl = `${base}/${commentId}/replies`;
  const keyedReplyId = randomUUID();
  const keyedReplyContent = '这是一条应支持安全重试的回复。';
  const keyedReplyBody = { content: keyedReplyContent, client_request_id: keyedReplyId };
  const concurrentReplies = await Promise.all([
    request(keyedReplyUrl, memberToken, 'POST', keyedReplyBody),
    request(keyedReplyUrl, memberToken, 'POST', keyedReplyBody),
  ]);
  assert.deepEqual(concurrentReplies.map((response) => response.status).sort(), [200, 201]);
  const concurrentReplyResults = await Promise.all(concurrentReplies.map((response) => response.json() as Promise<{ id: number }>));
  assert.equal(concurrentReplyResults[0].id, concurrentReplyResults[1].id, 'same-key concurrent retries resolve to one reply');
  const concurrentReplyCount = await databaseUtils.queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM production_review_replies WHERE thread_id=? AND content=?',
    [commentId, keyedReplyContent],
  );
  assert.equal(Number(concurrentReplyCount?.count), 1, 'same-key concurrent retries insert exactly one reply');

  assert.equal((await request(keyedReplyUrl, memberToken, 'POST', { ...keyedReplyBody, content: '不同内容' })).status, 409,
    'a request key cannot be reused for different content');
  assert.equal((await request(`${base}/${suggestionId}/replies`, memberToken, 'POST', keyedReplyBody)).status, 409,
    'a request key cannot be reused for a different thread');
  assert.equal((await request(keyedReplyUrl, editorToken, 'POST', keyedReplyBody)).status, 409,
    'a request key cannot be reused by another actor, even when that actor can access the same thread');

  const fingerprint = createHash('sha256').update(keyedReplyContent).digest('hex');
  const statusUrl = `${keyedReplyUrl}/requests/${keyedReplyId}?fingerprint=${fingerprint}`;
  const appliedStatus = await request(statusUrl, memberToken);
  assert.equal(appliedStatus.status, 200);
  assert.equal(appliedStatus.headers.get('cache-control'), 'no-store', 'request status is never cached');
  const appliedStatusBody = await appliedStatus.json() as { status: string; replyId: number };
  assert.equal(appliedStatusBody.status, 'applied');
  assert.equal(appliedStatusBody.replyId, concurrentReplyResults[0].id);
  assert.deepEqual(await request(statusUrl, outsiderToken).then((response) => response.json()), { status: 'not_found' },
    'another actor cannot discover the request result');
  assert.deepEqual(await request(`${keyedReplyUrl}/requests/${randomUUID()}?fingerprint=${fingerprint}`, memberToken)
    .then((response) => response.json()), { status: 'not_found' }, 'unknown request IDs safely read as not found');
  assert.equal((await request(`${keyedReplyUrl}/requests/${keyedReplyId}?fingerprint=${'0'.repeat(64)}`, memberToken)).status, 409,
    'status lookup rejects a mismatched content fingerprint');

  const rollbackRequestId = randomUUID();
  const rollbackContent = '账本写入失败时回复也必须回滚。';
  await databaseUtils.execute(`
    CREATE TRIGGER fail_production_review_reply_request_key
    BEFORE INSERT ON production_review_reply_request_keys
    BEGIN SELECT RAISE(ABORT, 'intentional isolated test failure'); END
  `);
  assert.equal((await request(keyedReplyUrl, memberToken, 'POST', {
    content: rollbackContent, client_request_id: rollbackRequestId,
  })).status, 500, 'ledger failure is reported without claiming the reply was saved');
  const rolledBackReplyCount = await databaseUtils.queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM production_review_replies WHERE thread_id=? AND content=?',
    [commentId, rollbackContent],
  );
  assert.equal(Number(rolledBackReplyCount?.count), 0, 'reply insertion rolls back when its request ledger cannot be written');
  await databaseUtils.execute('DROP TRIGGER fail_production_review_reply_request_key');
  const rollbackRetry = await request(keyedReplyUrl, memberToken, 'POST', {
    content: rollbackContent, client_request_id: rollbackRequestId,
  });
  assert.equal(rollbackRetry.status, 201, 'a rolled-back request can safely retry using the same key');

  const duplicateIntent = await request(keyedReplyUrl, memberToken, 'POST', {
    content: keyedReplyContent, client_request_id: randomUUID(),
  });
  assert.equal(duplicateIntent.status, 201, 'a new request ID preserves intentional duplicate replies');
  assert.notEqual((await duplicateIntent.json() as { id: number }).id, concurrentReplyResults[0].id);

  const memberAccept = await request(`${base}/${suggestionId}/status`, memberToken, 'PATCH', { status: 'accepted' });
  assert.equal(memberAccept.status, 403, 'comment permission alone cannot accept a content change');
  const accepted = await request(`${base}/${suggestionId}/status`, editorToken, 'PATCH', { status: 'accepted' });
  assert.equal(accepted.status, 200);
  const staleAccept = await request(`${base}/${suggestionId}/status`, editorToken, 'PATCH', { status: 'rejected' });
  assert.equal(staleAccept.status, 409, 'a suggestion can be processed only once');

  const keyedStatusRequestId = randomUUID();
  const keyedStatusUrl = `${base}/${keyedSuggestionId}/status`;
  const keyedStatusBody = { status: 'accepted', client_request_id: keyedStatusRequestId };
  const concurrentStatuses = await Promise.all([
    request(keyedStatusUrl, editorToken, 'PATCH', keyedStatusBody),
    request(keyedStatusUrl, editorToken, 'PATCH', keyedStatusBody),
  ]);
  assert.deepEqual(concurrentStatuses.map((response) => response.status), [200, 200], 'same-key concurrent status transitions replay successfully');
  const statusLedger = await databaseUtils.queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM production_review_status_request_keys WHERE client_request_id=?',
    [keyedStatusRequestId],
  );
  assert.equal(Number(statusLedger?.count), 1, 'concurrent transition writes one request receipt');
  const keyedStatusReadUrl = `${keyedStatusUrl}-requests/${keyedStatusRequestId}?status=accepted`;
  const appliedTransition = await request(keyedStatusReadUrl, editorToken);
  assert.equal(appliedTransition.status, 200);
  assert.equal(appliedTransition.headers.get('cache-control'), 'no-store', 'status request verification is never cached');
  assert.deepEqual(await appliedTransition.json(), { status: 'applied', appliedStatus: 'accepted' });
  assert.deepEqual(await request(keyedStatusReadUrl, memberToken).then((response) => response.json()), { status: 'not_found' },
    'status receipts are isolated to the actor who issued the request');
  assert.deepEqual(await request(`${keyedStatusUrl}-requests/${randomUUID()}?status=accepted`, editorToken).then((response) => response.json()), { status: 'not_found' },
    'unknown status request IDs are safe to verify');
  assert.equal((await request(`${keyedStatusUrl}-requests/${keyedStatusRequestId}?status=rejected`, editorToken)).status, 409,
    'status verification rejects a request ID reused with a different target');
  assert.equal((await request(keyedStatusUrl, memberToken, 'PATCH', { status: 'accepted', client_request_id: keyedStatusRequestId })).status, 403,
    'status request replay does not bypass acceptance permission checks');

  const statusRollbackComment = await request(base, memberToken, 'POST', {
    version: 'v1.0', kind: 'comment', anchor, summary: '状态账本失败时讨论状态必须回滚。',
  });
  const statusRollbackThreadId = Number((await statusRollbackComment.json() as { id: number }).id);
  const statusRollbackRequestId = randomUUID();
  await databaseUtils.execute(`
    CREATE TRIGGER fail_production_review_status_request_key
    BEFORE INSERT ON production_review_status_request_keys
    BEGIN SELECT RAISE(ABORT, 'intentional isolated test failure'); END
  `);
  assert.equal((await request(`${base}/${statusRollbackThreadId}/status`, memberToken, 'PATCH', {
    status: 'resolved', client_request_id: statusRollbackRequestId,
  })).status, 500, 'status ledger failure is not reported as a successful transition');
  const rolledBackStatus = await databaseUtils.queryOne<{ status: string }>(
    'SELECT status FROM production_review_threads WHERE id=?', [statusRollbackThreadId],
  );
  assert.equal(rolledBackStatus?.status, 'open', 'status change rolls back if its request receipt cannot be written');
  await databaseUtils.execute('DROP TRIGGER fail_production_review_status_request_key');
  assert.equal((await request(`${base}/${statusRollbackThreadId}/status`, memberToken, 'PATCH', {
    status: 'resolved', client_request_id: statusRollbackRequestId,
  })).status, 200, 'a rolled-back status request can retry with the same ID');
  assert.equal((await request(`${base}/${keyedSuggestionId}/status`, editorToken, 'PATCH', {
    status: 'rejected', client_request_id: keyedStatusRequestId,
  })).status, 409, 'a request ID cannot be reused for a different status transition');

  assert.equal((await request(`${base}/${commentId}/status`, memberToken, 'PATCH', { status: 'resolved' })).status, 200);
  assert.equal((await request(`${base}/${commentId}/replies`, memberToken, 'POST', { content: '结束后的回复' })).status, 409);
  assert.equal((await request(`${base}/${commentId}/status`, editorToken, 'PATCH', { status: 'resolved' })).status, 403, 'another reviewer cannot resolve someone else\'s thread without moderation permission');

  const crossProduction = `http://127.0.0.1:${address.port}/api/workflow/production/${outsiderProductionId}/review-threads/${commentId}/replies`;
  assert.equal((await request(crossProduction, outsiderToken, 'POST', { content: '跨稿件回复' })).status, 404);

  await databaseUtils.execute(
    "INSERT INTO production_history(production_id,version,content,status,change_type,operator_id) VALUES(?,'v1.0','<p>原始段落内容</p>','draft','major',?)",
    [productionId, memberId],
  );
  await databaseUtils.execute("UPDATE production SET version='v2.0' WHERE id=?", [productionId]);
  const replayAfterVersionChange = await request(base, memberToken, 'POST', keyedThreadBody);
  assert.equal(replayAfterVersionChange.status, 200, 'a confirmed request can replay even after the created version becomes historical');
  assert.equal((await replayAfterVersionChange.json() as { id: number }).id, concurrentThreadResults[0].id);
  const historical = await request(`${base}?version=v1.0`, memberToken);
  assert.equal(historical.status, 200, 'historical thread reads remain available');
  assert.equal((await request(`${base}/${commentId}/replies`, memberToken, 'POST', { content: '历史版本不可写' })).status, 409);
  console.log('production review thread HTTP tests passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await database.closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
