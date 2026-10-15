import assert from 'node:assert/strict';
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

  const reply = await request(`${base}/${commentId}/replies`, memberToken, 'POST', { content: '我会补充依据。' });
  assert.equal(reply.status, 201);
  const list = await request(base, memberToken);
  assert.equal(list.status, 200);
  const listed = (await list.json() as { data: Array<{ id: number; kind: string; anchor_quote: string; replies: Array<{ content: string }> }> }).data;
  assert.equal(listed.length, 2);
  assert.equal(listed.find((thread) => thread.id === commentId)?.replies[0]?.content, '我会补充依据。');
  assert.equal(listed.find((thread) => thread.id === suggestionId)?.anchor_quote, anchor.quote);

  const memberAccept = await request(`${base}/${suggestionId}/status`, memberToken, 'PATCH', { status: 'accepted' });
  assert.equal(memberAccept.status, 403, 'comment permission alone cannot accept a content change');
  const accepted = await request(`${base}/${suggestionId}/status`, editorToken, 'PATCH', { status: 'accepted' });
  assert.equal(accepted.status, 200);
  const staleAccept = await request(`${base}/${suggestionId}/status`, editorToken, 'PATCH', { status: 'rejected' });
  assert.equal(staleAccept.status, 409, 'a suggestion can be processed only once');

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
  const historical = await request(`${base}?version=v1.0`, memberToken);
  assert.equal(historical.status, 200, 'historical thread reads remain available');
  assert.equal((await request(`${base}/${commentId}/replies`, memberToken, 'POST', { content: '历史版本不可写' })).status, 409);
  console.log('production review thread HTTP tests passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await database.closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
