import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-resource-center-api-'));
process.env.XMT_DB_PATH = path.join(tempDir, 'resource-center.test.db');
process.env.JWT_SECRET = 'resource-center-api-test-secret';

const [{ default: app }, { initDatabase }, database, { signToken }] = await Promise.all([
  import('../api/app.js'),
  import('../api/database/db.js'),
  import('../api/database/utils.js'),
  import('../api/utils/jwt.js'),
]);

await initDatabase();

const now = '2026-07-29 18:00:00';
const adminId = await database.executeInsert(
  `INSERT INTO users(username,password,role,name,enabled,created_at,updated_at) VALUES(?,?,'admin','资料管理员',1,?,?)`,
  ['resource_admin', 'unused', now, now],
);
const memberId = await database.executeInsert(
  `INSERT INTO users(username,password,role,name,enabled,created_at,updated_at) VALUES(?,?,'member','普通成员',1,?,?)`,
  ['resource_member', 'unused', now, now],
);
await database.execute(`INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='admin'`, [adminId]);
await database.execute(`INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='member'`, [memberId]);

const topicId = await database.executeInsert(
  `INSERT INTO topics(title,status,creator_id,created_at,updated_at) VALUES(?,'pending',?, ?, ?)`,
  ['地情选题', adminId, now, now],
);
const adminToken = signToken({ userId: adminId, username: 'resource_admin', role: 'admin' });
const memberToken = signToken({ userId: memberId, username: 'resource_member', role: 'member' });
const adminHeaders = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };
const memberHeaders = { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' };

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const base = `http://127.0.0.1:${address.port}/api/resource-center`;

async function json<T>(response: Response) {
  return await response.json() as T;
}

try {
  const categoryResponse = await fetch(`${base}/categories`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ library_type: 'knowledge', name: '山东地情', code: 'shandong-local-history' }),
  });
  assert.equal(categoryResponse.status, 201);
  const categoryId = Number((await json<{ id: number }>(categoryResponse)).id);
  assert.ok(categoryId > 0);

  const memberCreate = await fetch(`${base}/resources`, {
    method: 'POST', headers: memberHeaders,
    body: JSON.stringify({ title: '越权资料', library_type: 'knowledge', visibility: 'team' }),
  });
  assert.equal(memberCreate.status, 403);

  const createResponse = await fetch(`${base}/resources`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({
      title: '山东地情测试资料',
      summary: '泰安地方历史资料摘要',
      library_type: 'knowledge',
      category_id: categoryId,
      visibility: 'team',
      content_text: '山东地情全文检索测试，包含泰安历史文化内容。',
      source_type: 'manual',
    }),
  });
  assert.equal(createResponse.status, 201);
  const resourceId = Number((await json<{ id: number }>(createResponse)).id);
  assert.ok(resourceId > 0);

  const listResponse = await fetch(`${base}/resources?library_type=knowledge&category_id=${categoryId}`, { headers: memberHeaders });
  assert.equal(listResponse.status, 200);
  const list = await json<{ pagination: { total: number }; data: Array<{ title: string; category: { id: number } }> }>(listResponse);
  assert.equal(list.pagination.total, 1);
  assert.equal(list.data[0].title, '山东地情测试资料');
  assert.equal(list.data[0].category.id, categoryId);

  const searchResponse = await fetch(`${base}/search?keyword=${encodeURIComponent('山东地情全文检索测试')}`, { headers: memberHeaders });
  assert.equal(searchResponse.status, 200);
  const search = await json<{ total: number; data: Array<{ resource_id: number; snippet: string }> }>(searchResponse);
  assert.equal(search.total, 1);
  assert.equal(Number(search.data[0].resource_id), resourceId);
  assert.match(String(search.data[0].snippet), /mark/);

  const tagResponse = await fetch(`${base}/tags`, {
    method: 'POST', headers: adminHeaders, body: JSON.stringify({ name: '地方文化' }),
  });
  assert.equal(tagResponse.status, 201);
  const tagId = Number((await json<{ id: number }>(tagResponse)).id);
  const bindTagResponse = await fetch(`${base}/resources/${resourceId}/tags`, {
    method: 'POST', headers: adminHeaders, body: JSON.stringify({ tag_id: tagId }),
  });
  assert.equal(bindTagResponse.status, 201);

  const relationResponse = await fetch(`${base}/resources/${resourceId}/relations`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ target_type: 'topic', target_id: topicId, relation_type: 'reference' }),
  });
  assert.equal(relationResponse.status, 201);
  const relationId = Number((await json<{ id: number }>(relationResponse)).id);

  const detailResponse = await fetch(`${base}/resources/${resourceId}`, { headers: adminHeaders });
  assert.equal(detailResponse.status, 200);
  const detail = await json<{ tags: unknown[]; relations: unknown[]; versions: unknown[] }>(detailResponse);
  assert.equal(detail.tags.length, 1);
  assert.equal(detail.relations.length, 1);
  assert.deepEqual(detail.versions, []);

  const deleteResponse = await fetch(`${base}/resources/${resourceId}`, { method: 'DELETE', headers: adminHeaders });
  assert.equal(deleteResponse.status, 200);
  const deleted = await database.queryOne<Record<string, unknown>>('SELECT status,deleted_at FROM resources WHERE id=?', [resourceId]);
  assert.equal(deleted?.status, 'deleted');
  assert.ok(deleted?.deleted_at);

  const restoreResponse = await fetch(`${base}/resources/${resourceId}/restore`, { method: 'POST', headers: adminHeaders });
  assert.equal(restoreResponse.status, 200);
  const restored = await database.queryOne<Record<string, unknown>>('SELECT status,deleted_at FROM resources WHERE id=?', [resourceId]);
  assert.equal(restored?.status, 'published');
  assert.equal(restored?.deleted_at, null);

  const removeRelationResponse = await fetch(`${base}/resources/${resourceId}/relations/${relationId}`, { method: 'DELETE', headers: adminHeaders });
  assert.equal(removeRelationResponse.status, 200);

  const audits = await database.queryAll<{ action: string }>('SELECT action FROM resource_audit_logs WHERE resource_id=? ORDER BY id', [resourceId]);
  const actions = audits.map((row) => row.action);
  for (const expected of ['create', 'update', 'relation_add', 'delete', 'restore', 'relation_remove']) {
    assert.ok(actions.includes(expected), `missing audit action ${expected}`);
  }

  const migration = await database.queryOne<Record<string, unknown>>(`SELECT status FROM database_migrations WHERE version='002'`);
  assert.equal(migration?.status, 'applied');
  console.log(JSON.stringify({
    passed: true,
    cases: 9,
    resourceId,
    categoryId,
    tagId,
    topicId,
    auditActions: actions,
  }, null, 2));
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  fs.rmSync(tempDir, { recursive: true, force: true });
}
