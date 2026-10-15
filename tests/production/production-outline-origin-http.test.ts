import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-production-outline-origin-http-'));
process.env.XMT_DB_PATH = path.join(tempDirectory, 'test.db');
process.env.JWT_SECRET = 'production-outline-origin-test-secret';

const [{ default: app }, { initDatabase, closeDatabase }, database, { signToken }] = await Promise.all([
  import('../../api/app.js'),
  import('../../api/database/db.js'),
  import('../../api/database/utils.js'),
  import('../../api/utils/jwt.js'),
]);

await initDatabase();
const userId = await database.executeInsert(
  "INSERT INTO users(username,password,role,name,enabled) VALUES('outline_origin_editor','unused','editor','大纲来源测试',1)",
);
await database.execute("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='editor'", [userId]);
const token = signToken({ userId, username: 'outline_origin_editor', role: 'editor' });
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const base = `http://127.0.0.1:${address.port}/api/workflow/production`;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

async function createTopic(title: string, outline: string) {
  return database.executeInsert(
    'INSERT INTO topics(title,description,platform,creator_id,assignee_id,status,outline) VALUES(?,?,?,?,?,?,?)',
    [title, '', 'douyin', userId, userId, 'production', outline],
  );
}

async function createProduction(topicId: number, content: string, originType?: string) {
  return fetch(base, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      topic_id: topicId,
      version: 'v1.0',
      content,
      status: 'draft',
      ...(originType ? { origin_type: originType } : {}),
    }),
  });
}

try {
  const originalOutline = '<p>创建时的大纲快照</p>';
  const topicId = await createTopic('有来源的大纲选题', originalOutline);
  await database.execute(`INSERT INTO workflow_document_versions
    (document_type,document_id,version,content,change_type,is_baseline,operator_id,created_at)
    VALUES ('topic_outline',?,'v1.2',?,'minor',0,?,datetime('now'))`, [String(topicId), originalOutline, userId]);
  await database.execute(`INSERT INTO workflow_document_versions
    (document_type,document_id,version,content,change_type,is_baseline,operator_id,created_at)
    VALUES ('topic_outline',?,'v1.3','<p>后续不同的大纲版本</p>','minor',0,?,datetime('now'))`, [String(topicId), userId]);
  await database.execute('UPDATE topics SET outline=? WHERE id=?', ['<p>后续不同的大纲版本</p>', topicId]);
  await database.execute('UPDATE topics SET outline=? WHERE id=?', [originalOutline, topicId]);
  const created = await createProduction(topicId, originalOutline, 'topic_outline');
  assert.equal(created.status, 200);
  const createdPayload = await created.json() as { productionId: number };
  const source = await database.queryOne<{
    source_type: string;
    source_content_snapshot: string;
    source_outline_version: string | null;
    captured_at: string;
  }>('SELECT source_type,source_content_snapshot,source_outline_version,captured_at FROM production_origin_snapshots WHERE production_id=?', [createdPayload.productionId]);
  assert.equal(source?.source_type, 'topic_outline');
  assert.equal(source?.source_content_snapshot, originalOutline);
  assert.equal(source?.source_outline_version, 'v1.2', 'a uniquely matching explicit outline version is linked to the exact snapshot');
  assert.ok(source?.captured_at, 'source snapshot includes its capture time');

  const detail = await fetch(`${base}/${createdPayload.productionId}`, { headers });
  assert.equal(detail.status, 200);
  const detailPayload = await detail.json() as Record<string, unknown>;
  assert.equal(detailPayload.origin_source_type, 'topic_outline');
  assert.equal(detailPayload.origin_source_content_snapshot, originalOutline);
  assert.equal(detailPayload.origin_source_outline_version, 'v1.2');

  await database.execute('UPDATE topics SET outline=? WHERE id=?', ['后续修改的大纲', topicId]);
  await database.execute('UPDATE production SET content=? WHERE id=?', ['持续改写后的创作正文', createdPayload.productionId]);
  assert.equal(
    (await database.queryOne<{ source_content_snapshot: string; source_outline_version: string | null }>(
      'SELECT source_content_snapshot,source_outline_version FROM production_origin_snapshots WHERE production_id=?',
      [createdPayload.productionId],
    ))?.source_content_snapshot,
    originalOutline,
    'later outline/manuscript edits do not rewrite the creation-time snapshot',
  );
  assert.equal((await database.queryOne<{ source_outline_version: string | null }>(
    'SELECT source_outline_version FROM production_origin_snapshots WHERE production_id=?',
    [createdPayload.productionId],
  ))?.source_outline_version, 'v1.2', 'later outline changes do not alter the recorded source version');

  const staleTopicId = await createTopic('大纲变化竞态选题', '<p>新大纲</p>');
  const staleCreate = await createProduction(staleTopicId, '<p>旧页面的大纲</p>', 'topic_outline');
  assert.equal(staleCreate.status, 409, 'stale client outline cannot be recorded as the current source');
  assert.equal((await staleCreate.json() as { code?: string }).code, 'TOPIC_OUTLINE_CHANGED');
  assert.equal(Number((await database.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM production WHERE topic_id=?', [staleTopicId]))?.count || 0), 0, 'stale origin rejection leaves no production record');

  const manualTopicId = await createTopic('手工起稿选题', '<p>大纲</p>');
  const manualCreate = await createProduction(manualTopicId, '<p>自行撰写的稿件</p>');
  assert.equal(manualCreate.status, 200);
  const manualPayload = await manualCreate.json() as { productionId: number };
  assert.equal(await database.queryOne('SELECT production_id FROM production_origin_snapshots WHERE production_id=?', [manualPayload.productionId]), null, 'manual production content is not mislabeled as outline-derived');

  const baselineTopicId = await createTopic('只有未标版本基线的选题', '基线大纲');
  await database.execute(`INSERT INTO workflow_document_versions
    (document_type,document_id,version,content,change_type,is_baseline)
    VALUES ('topic_outline',?,'baseline','基线大纲','baseline',1)`, [String(baselineTopicId)]);
  const baselineCreate = await createProduction(baselineTopicId, '基线大纲', 'topic_outline');
  assert.equal(baselineCreate.status, 200);
  const baselinePayload = await baselineCreate.json() as { productionId: number };
  assert.equal((await database.queryOne<{ source_outline_version: string | null }>(
    'SELECT source_outline_version FROM production_origin_snapshots WHERE production_id=?', [baselinePayload.productionId],
  ))?.source_outline_version, null, 'an unversioned baseline is not presented as an explicit version');

  const ambiguousTopicId = await createTopic('重复内容的多个版本选题', '重复大纲');
  await database.execute(`INSERT INTO workflow_document_versions
    (document_type,document_id,version,content,change_type,is_baseline)
    VALUES ('topic_outline',?,'v1.0','重复大纲','minor',0),
           ('topic_outline',?,'v1.1','重复大纲','minor',0)`, [String(ambiguousTopicId), String(ambiguousTopicId)]);
  const ambiguousCreate = await createProduction(ambiguousTopicId, '重复大纲', 'topic_outline');
  assert.equal(ambiguousCreate.status, 200);
  const ambiguousPayload = await ambiguousCreate.json() as { productionId: number };
  assert.equal((await database.queryOne<{ source_outline_version: string | null }>(
    'SELECT source_outline_version FROM production_origin_snapshots WHERE production_id=?', [ambiguousPayload.productionId],
  ))?.source_outline_version, null, 'identical content in multiple explicit versions remains unlinked rather than guessed');

  const invalidOrigin = await createProduction(manualTopicId, '不应创建', 'unknown');
  assert.equal(invalidOrigin.status, 400, 'unknown provenance kinds fail closed');
  console.log('Production outline origin HTTP tests passed.');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
