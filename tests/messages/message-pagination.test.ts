import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-message-pagination-'));
process.env.XMT_DB_PATH = path.join(directory, 'messages.db');
process.env.JWT_SECRET = 'message-pagination-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: messagesRoutes } = await import('../../api/routes/messages.js');
const { generateOpenApiDocument } = await import('../../api/openapi.js');

await initDatabase();
const ownerId = await executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
  ['message-pagination-owner', 'unused', 'message-owner@example.invalid', 'admin', 'Owner'],
);
const otherUserId = await executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
  ['message-pagination-other', 'unused', 'message-other@example.invalid', 'member', 'Other'],
);

for (let index = 0; index < 45; index += 1) {
  await executeInsert(
    `INSERT INTO messages(user_id,title,content,type,read,link,created_at) VALUES(?,?,?,?,?,?,?)`,
    [ownerId, `Message ${index + 1}`, 'Pagination contract', 'info', index % 3 === 0 ? 1 : 0, index % 2 === 0 ? '/topics/1' : null, '2026-09-28 12:00:00'],
  );
}
await executeInsert(
  `INSERT INTO messages(user_id,title,content,type,read,link,created_at) VALUES(?,?,?,?,?,?,?)`,
  [otherUserId, 'Private message 1', 'must not leak', 'info', 0, '/topics/99', '2026-09-28 12:00:00'],
);
await executeInsert(
  `INSERT INTO messages(user_id,title,content,type,read,link,created_at) VALUES(?,?,?,?,?,?,?)`,
  [otherUserId, 'Private message 2', 'must not leak', 'info', 0, null, '2026-09-28 12:00:00'],
);

const app = express();
app.use(express.json());
let loseNextMessageClearResponse = false;
let loseNextMessageReadAllResponse = false;
app.use('/api/messages', (req, res, next) => {
  if ((req.method === 'DELETE' && req.path === '/') || (req.method === 'POST' && req.path === '/read-all')) {
    const sendJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (req.method === 'DELETE' && loseNextMessageClearResponse) {
        loseNextMessageClearResponse = false;
        res.statusCode = 503;
      }
      if (req.method === 'POST' && req.path === '/read-all' && loseNextMessageReadAllResponse) {
        loseNextMessageReadAllResponse = false;
        res.statusCode = 503;
      }
      return sendJson(body);
    }) as typeof res.json;
  }
  next();
});
app.use('/api/messages', messagesRoutes);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api/messages`;
const headers = { Authorization: `Bearer ${signToken({ userId: ownerId })}`, 'Content-Type': 'application/json' };
const otherHeaders = { Authorization: `Bearer ${signToken({ userId: otherUserId })}`, 'Content-Type': 'application/json' };
const messageOpenApi = generateOpenApiDocument();
for (const path of [
  '/api/messages/read-all-requests/{requestId}',
  '/api/messages/clear-requests/{requestId}',
] as const) {
  const operation = messageOpenApi.paths[path]?.get;
  assert.ok(operation, `OpenAPI documents ${path}`);
  const responses = operation.responses as unknown as Record<string, {
    headers?: Record<string, { schema?: { enum?: string[] } }>;
  }>;
  for (const status of ['200', '400', '401', '500']) {
    assert.equal(responses[status]?.headers?.['Cache-Control']?.schema?.enum?.[0], 'no-store', `${path} ${status} is documented as non-cacheable`);
  }
}

async function getList(query: string) {
  const response = await fetch(`${base}${query ? `?${query}` : ''}`, { headers });
  assert.equal(response.status, 200);
  return response.json() as Promise<{
    data: Array<{ id: number; user_id: number; link?: string | null; read: number | boolean }>;
    total: number;
    page: number;
    limit: number;
    summary: { total: number; unread: number; actionable: number };
  }>;
}

try {
  const pageTwo = await getList('page=2&limit=20');
  assert.equal(pageTwo.total, 45);
  assert.equal(pageTwo.page, 2);
  assert.equal(pageTwo.limit, 20);
  assert.equal(pageTwo.data.length, 20);
  assert.equal(new Set(pageTwo.data.map((message) => message.id)).size, 20, 'page order remains stable when timestamps tie');
  assert.ok(pageTwo.data.every((message) => message.user_id === ownerId), 'rows from other users never enter a page');
  assert.deepEqual(pageTwo.summary, { total: 45, unread: 30, actionable: 15 }, 'global counters use only the authenticated user and ignore current page');

  const unread = await getList('page=1&limit=20&read=unread');
  assert.equal(unread.total, 30);
  assert.equal(unread.data.length, 20);
  assert.ok(unread.data.every((message) => !message.read));

  const linked = await getList('link=present');
  assert.equal(linked.total, 23);
  assert.ok(linked.data.every((message) => Boolean(message.link?.trim())));

  const system = await getList('link=absent');
  assert.equal(system.total, 22);
  assert.ok(system.data.every((message) => !message.link?.trim()));

  const unreadLinked = await getList('read=unread&link=present');
  assert.equal(unreadLinked.total, 15);
  assert.ok(unreadLinked.data.every((message) => !message.read && Boolean(message.link?.trim())));

  const invalidPage = await getList('page=0&limit=invalid');
  assert.equal(invalidPage.page, 1, 'invalid pagination values safely fall back to defaults');
  assert.equal(invalidPage.limit, 20);
  const cappedLimit = await getList('page=1&limit=1000');
  assert.equal(cappedLimit.limit, 100, 'requested page size is capped');
  assert.equal(cappedLimit.data.length, 45);

  const ownerUnread = await queryOne<{ id: number }>(`SELECT id FROM messages WHERE user_id=? AND read=0 ORDER BY id LIMIT 1`, [ownerId]);
  const ownerRead = await queryOne<{ id: number }>(`SELECT id FROM messages WHERE user_id=? AND read=1 ORDER BY id LIMIT 1`, [ownerId]);
  const otherMessage = await queryOne<{ id: number }>(`SELECT id FROM messages WHERE user_id=? ORDER BY id LIMIT 1`, [otherUserId]);
  assert(ownerUnread && ownerRead && otherMessage);

  const malformedIds = await fetch(`${base}/read-all`, { method: 'POST', headers, body: JSON.stringify({ ids: 'not-an-array' }) });
  assert.equal(malformedIds.status, 400, 'malformed selected IDs are rejected instead of falling through to mark-all');
  const malformedBody = await fetch(`${base}/read-all`, { method: 'POST', headers, body: JSON.stringify(['unexpected', 'array']) });
  assert.equal(malformedBody.status, 400, 'non-object JSON bodies are rejected instead of falling through to mark-all');
  const invalidIds = await fetch(`${base}/read-all`, { method: 'POST', headers, body: JSON.stringify({ ids: [ownerUnread.id, 0] }) });
  assert.equal(invalidIds.status, 400, 'invalid IDs reject the whole request without partially marking messages');
  assert.equal(Number((await queryOne<{ read: number }>(`SELECT read FROM messages WHERE id=? AND user_id=?`, [ownerUnread.id, ownerId]))?.read), 0);

  const selectedReadResponse = await fetch(`${base}/read-all`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ids: [ownerUnread.id, ownerUnread.id, ownerRead.id, otherMessage.id, 99999999] }),
  });
  assert.equal(selectedReadResponse.status, 200);
  assert.deepEqual(await selectedReadResponse.json(), {
    message: '已确认 2 条消息为已读',
    requestedCount: 5,
    distinctCount: 4,
    matchedCount: 2,
    updatedCount: 1,
    ignoredCount: 2,
  }, 'selected bulk read reports unique, account-scoped, actually changed counts');

  const secondOwnerUnread = await queryOne<{ id: number }>(`SELECT id FROM messages WHERE user_id=? AND read=0 ORDER BY id LIMIT 1`, [ownerId]);
  assert(secondOwnerUnread);
  const unreadReadStatus = await fetch(`${base}/${secondOwnerUnread.id}/read-status`, { headers });
  assert.equal(unreadReadStatus.status, 200);
  assert.equal(unreadReadStatus.headers.get('cache-control'), 'no-store', 'single-message read status must never be cached');
  assert.deepEqual(await unreadReadStatus.json(), { state: 'available', id: secondOwnerUnread.id, read: false });
  assert.equal(Number((await queryOne<{ read: number }>(`SELECT read FROM messages WHERE id=? AND user_id=?`, [secondOwnerUnread.id, ownerId]))?.read), 0, 'status lookup is read-only');
  const singleRead = await fetch(`${base}/${secondOwnerUnread.id}`, { method: 'PUT', headers });
  assert.equal(singleRead.status, 200, 'single-message read uses an account-scoped update');
  assert.deepEqual(await singleRead.json(), { message: '消息已标记为已读' });
  const confirmedReadStatus = await fetch(`${base}/${secondOwnerUnread.id}/read-status`, { headers });
  assert.equal(confirmedReadStatus.status, 200);
  assert.deepEqual(await confirmedReadStatus.json(), { state: 'available', id: secondOwnerUnread.id, read: true });
  const foreignReadStatus = await fetch(`${base}/${otherMessage.id}/read-status`, { headers });
  assert.equal(foreignReadStatus.status, 200);
  assert.equal(foreignReadStatus.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await foreignReadStatus.json(), { state: 'missing' }, 'another account message is indistinguishable from a missing ID');
  const invalidReadStatus = await fetch(`${base}/not-an-id/read-status`, { headers });
  assert.equal(invalidReadStatus.status, 400);
  assert.equal(invalidReadStatus.headers.get('cache-control'), 'no-store', 'validation errors must also be non-cacheable');
  const unauthenticatedReadStatus = await fetch(`${base}/${secondOwnerUnread.id}/read-status`);
  assert.equal(unauthenticatedReadStatus.status, 401);
  assert.equal(unauthenticatedReadStatus.headers.get('cache-control'), 'no-store', 'authentication failures must also be non-cacheable');
  const foreignSingleRead = await fetch(`${base}/${otherMessage.id}`, { method: 'PUT', headers });
  assert.equal(foreignSingleRead.status, 404, 'single-message read does not expose another account message');
  assert.equal(Number((await queryOne<{ read: number }>(`SELECT read FROM messages WHERE id=? AND user_id=?`, [otherMessage.id, otherUserId]))?.read), 0);

  const allRead = await fetch(`${base}/read-all`, { method: 'POST', headers, body: JSON.stringify({}) });
  assert.equal(allRead.status, 200);
  assert.deepEqual(await allRead.json(), { message: '所有消息已标记为已读', updatedCount: 28 });
  const afterRead = await getList('page=2&limit=20');
  assert.deepEqual(afterRead.summary, { total: 45, unread: 0, actionable: 0 }, 'bulk read updates the account-wide counters across all pages');
  const otherUnread = await queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM messages WHERE user_id=? AND read=0`, [otherUserId]);
  assert.equal(otherUnread?.count, 2, 'bulk read cannot modify another account');

  const firstReadAllMessageId = await executeInsert(
    `INSERT INTO messages(user_id,title,content,type,read,link,created_at) VALUES(?,?,?,?,?,?,?)`,
    [ownerId, '批量已读一', '验证丢响应恢复', 'info', 0, null, '2026-10-23 12:00:00'],
  );
  const secondReadAllMessageId = await executeInsert(
    `INSERT INTO messages(user_id,title,content,type,read,link,created_at) VALUES(?,?,?,?,?,?,?)`,
    [ownerId, '批量已读二', '验证事务结果回放', 'info', 0, null, '2026-10-23 12:00:01'],
  );
  const foreignReadAllMessageId = await executeInsert(
    `INSERT INTO messages(user_id,title,content,type,read,link,created_at) VALUES(?,?,?,?,?,?,?)`,
    [otherUserId, '其他账号未读', '不得被当前请求修改', 'info', 0, null, '2026-10-23 12:00:02'],
  );

  const readAllRequestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a71';
  const missingReadAllStatus = await fetch(`${base}/read-all-requests/${readAllRequestId}`, { headers });
  assert.equal(missingReadAllStatus.status, 200);
  assert.equal(missingReadAllStatus.headers.get('cache-control'), 'no-store', 'actor-scoped read-all outcomes must not be cached across shared sessions');
  assert.deepEqual(await missingReadAllStatus.json(), { state: 'not_found' });
  assert.equal(Number((await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM messages WHERE user_id=? AND read=0', [ownerId],
  ))?.count), 2, 'read-only recovery lookup does not mutate messages');
  const unauthenticatedReadAllStatus = await fetch(`${base}/read-all-requests/${readAllRequestId}`);
  assert.equal(unauthenticatedReadAllStatus.status, 401, 'read-all status requires authentication');
  assert.equal(unauthenticatedReadAllStatus.headers.get('cache-control'), 'no-store', 'unauthenticated read-all status must not be cached');
  const invalidReadAllStatus = await fetch(`${base}/read-all-requests/not-a-request-id`, { headers });
  assert.equal(invalidReadAllStatus.status, 400, 'read-all status rejects malformed request IDs');
  const invalidReadAllRequest = await fetch(`${base}/read-all`, {
    method: 'POST', headers, body: JSON.stringify({ client_request_id: 'not-a-request-id' }),
  });
  assert.equal(invalidReadAllRequest.status, 400, 'read-all rejects malformed request IDs before mutating messages');
  assert.equal(Number((await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM messages WHERE user_id=? AND read=0', [ownerId],
  ))?.count), 2);

  loseNextMessageReadAllResponse = true;
  const lostReadAllResponse = await fetch(`${base}/read-all`, {
    method: 'POST', headers, body: JSON.stringify({ client_request_id: readAllRequestId }),
  });
  assert.equal(lostReadAllResponse.status, 503, 'the fixture loses the response after the keyed read-all transaction commits');
  assert.equal(Number((await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM messages WHERE user_id=? AND read=0', [ownerId],
  ))?.count), 0, 'the first keyed transaction marks only the actor unread rows read');
  assert.equal(Number((await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM messages WHERE user_id=? AND read=0', [otherUserId],
  ))?.count), 3, 'the keyed read-all transaction is limited to its actor');

  const postCommitMessageId = await executeInsert(
    `INSERT INTO messages(user_id,title,content,type,read,link,created_at) VALUES(?,?,?,?,?,?,?)`,
    [ownerId, '事务后到达', '相同请求重放不得标记这条消息', 'info', 0, null, '2026-10-23 12:00:03'],
  );
  const recoveredReadAllStatus = await fetch(`${base}/read-all-requests/${readAllRequestId}`, { headers });
  assert.equal(recoveredReadAllStatus.status, 200);
  assert.deepEqual(await recoveredReadAllStatus.json(), { state: 'processed', updatedCount: 2 });
  const foreignReadAllStatus = await fetch(`${base}/read-all-requests/${readAllRequestId}`, { headers: otherHeaders });
  assert.equal(foreignReadAllStatus.status, 200);
  assert.deepEqual(await foreignReadAllStatus.json(), { state: 'not_found' }, 'another actor cannot observe the stored outcome');

  const replayedReadAll = await fetch(`${base}/read-all`, {
    method: 'POST', headers, body: JSON.stringify({ client_request_id: readAllRequestId.toUpperCase() }),
  });
  assert.equal(replayedReadAll.status, 200);
  assert.deepEqual(await replayedReadAll.json(), {
    message: '所有消息已标记为已读', updatedCount: 2, replayed: true,
  }, 'the same key returns its original result regardless of UUID casing');
  assert.equal(Number((await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM messages WHERE user_id=? AND read=0', [ownerId],
  ))?.count), 1, 'replaying the key does not mark a message arriving after the original transaction');
  const foreignReadAllReplay = await fetch(`${base}/read-all`, {
    method: 'POST', headers: otherHeaders, body: JSON.stringify({ client_request_id: readAllRequestId }),
  });
  assert.equal(foreignReadAllReplay.status, 409, 'a request key cannot be rebound to a different actor');
  assert.equal(Number((await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM messages WHERE user_id=? AND read=0', [otherUserId],
  ))?.count), 3, 'a cross-actor request-key collision does not mutate messages');

  await execute(`CREATE TRIGGER reject_message_read_all_ledger BEFORE INSERT ON message_read_all_request_keys BEGIN SELECT RAISE(ABORT, 'simulated ledger failure'); END`);
  const failedAtomicReadAll = await fetch(`${base}/read-all`, {
    method: 'POST', headers, body: JSON.stringify({ client_request_id: 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a72' }),
  });
  assert.equal(failedAtomicReadAll.status, 500, 'ledger insertion failure rejects the keyed operation');
  assert.equal(Number((await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM messages WHERE user_id=? AND read=0', [ownerId],
  ))?.count), 1, 'the read update rolls back if its outcome cannot be persisted');
  await execute('DROP TRIGGER reject_message_read_all_ledger');

  const legacyReadAll = await fetch(`${base}/read-all`, { method: 'POST', headers, body: JSON.stringify({}) });
  assert.equal(legacyReadAll.status, 200);
  assert.deepEqual(await legacyReadAll.json(), { message: '所有消息已标记为已读', updatedCount: 1 }, 'legacy clients keep the unkeyed response contract');
  await execute('DELETE FROM messages WHERE id IN (?,?,?)', [firstReadAllMessageId, secondReadAllMessageId, postCommitMessageId]);
  await execute('DELETE FROM messages WHERE id=?', [foreignReadAllMessageId]);

  const clearRequestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a61';
  const missingClearStatus = await fetch(`${base}/clear-requests/${clearRequestId}`, { headers });
  assert.equal(missingClearStatus.status, 200);
  assert.equal(missingClearStatus.headers.get('cache-control'), 'no-store', 'actor-scoped clear outcomes must not be cached across shared sessions');
  assert.deepEqual(await missingClearStatus.json(), { state: 'not_found' }, 'clear recovery starts with a read-only not-found state');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM messages WHERE user_id=?', [ownerId]))?.count), 45, 'read-only status lookup does not mutate messages');
  const unauthenticatedClearStatus = await fetch(`${base}/clear-requests/${clearRequestId}`);
  assert.equal(unauthenticatedClearStatus.status, 401, 'clear status is not publicly discoverable');
  assert.equal(unauthenticatedClearStatus.headers.get('cache-control'), 'no-store', 'unauthenticated clear status must not be cached');
  const invalidClearStatus = await fetch(`${base}/clear-requests/not-a-request-id`, { headers });
  assert.equal(invalidClearStatus.status, 400, 'malformed clear request IDs are rejected');
  const invalidClearMutation = await fetch(base, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ client_request_id: 'not-a-request-id' }),
  });
  assert.equal(invalidClearMutation.status, 400, 'malformed clear IDs cannot mutate messages');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM messages WHERE user_id=?', [ownerId]))?.count), 45);

  loseNextMessageClearResponse = true;
  const lostClearResponse = await fetch(base, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ client_request_id: clearRequestId }),
  });
  assert.equal(lostClearResponse.status, 503, 'the fixture loses the response after the clear transaction commits');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM messages WHERE user_id=?', [ownerId]))?.count), 0, 'the first clear transaction committed before its response was lost');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM messages WHERE user_id=?', [otherUserId]))?.count), 2, 'the clear transaction is limited to its actor');

  await executeInsert(
    `INSERT INTO messages(user_id,title,content,type,read,link,created_at) VALUES(?,?,?,?,?,?,?)`,
    [ownerId, '后来到达的消息', '同编号重放必须保留此消息', 'info', 0, null, '2026-10-23 12:00:00'],
  );
  const recoveredClearStatus = await fetch(`${base}/clear-requests/${clearRequestId}`, { headers });
  assert.equal(recoveredClearStatus.status, 200);
  assert.deepEqual(await recoveredClearStatus.json(), { state: 'cleared', deletedCount: 45 }, 'status lookup confirms the committed clear without writing');
  const foreignClearStatus = await fetch(`${base}/clear-requests/${clearRequestId}`, { headers: otherHeaders });
  assert.equal(foreignClearStatus.status, 200);
  assert.deepEqual(await foreignClearStatus.json(), { state: 'not_found' }, 'another account cannot observe the original actor clear record');

  const replayedClear = await fetch(base, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ client_request_id: clearRequestId }),
  });
  assert.equal(replayedClear.status, 200);
  assert.deepEqual(await replayedClear.json(), { message: '消息已清空', deletedCount: 45, replayed: true }, 'same-key retry returns the stored outcome');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM messages WHERE user_id=?', [ownerId]))?.count), 1, 'same-key retry does not delete messages that arrived after the first commit');

  const keyCollision = await fetch(base, {
    method: 'DELETE',
    headers: otherHeaders,
    body: JSON.stringify({ client_request_id: clearRequestId }),
  });
  assert.equal(keyCollision.status, 409, 'a request key cannot be rebound across actors');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM messages WHERE user_id=?', [otherUserId]))?.count), 2);

  await execute(`CREATE TRIGGER reject_message_clear_ledger BEFORE INSERT ON message_clear_request_keys BEGIN SELECT RAISE(ABORT, 'simulated ledger failure'); END`);
  const failedAtomicClear = await fetch(base, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ client_request_id: 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a62' }),
  });
  assert.equal(failedAtomicClear.status, 500, 'ledger insertion failure rejects the entire transaction');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM messages WHERE user_id=?', [ownerId]))?.count), 1, 'transaction rollback preserves messages when no outcome record can be stored');
  await execute('DROP TRIGGER reject_message_clear_ledger');

  const legacyClear = await fetch(base, { method: 'DELETE', headers: { Authorization: headers.Authorization } });
  assert.equal(legacyClear.status, 200, 'older clients without a request key remain compatible');
  assert.deepEqual(await legacyClear.json(), { message: '消息已清空' });
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM messages WHERE user_id=?', [ownerId]))?.count), 0);

  console.log('message pagination, filtering, summary scope, bulk-read, and clear idempotency tests passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
