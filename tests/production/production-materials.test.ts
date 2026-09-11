import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-production-materials-'));
process.env.XMT_DB_PATH = path.join(directory, 'materials.db');
process.env.JWT_SECRET = 'production-materials-test-secret';

const { initDatabase, closeDatabase, db } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: routes } = await import('../../api/routes/production-resources.js');
const { productionMaterialsWorkspaceMigration } = await import('../../api/database/migrations/010_production_materials_workspace.js');
const { sanitizeRichText } = await import('../../api/utils/sanitize-rich-text.js');

await initDatabase();

async function createUser(username: string, role: string) {
  const id = await executeInsert(`INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`, [username, 'unused', `${username}@example.invalid`, role, username]);
  await execute(`INSERT OR IGNORE INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?`, [id, role]);
  return id;
}

const editorId = await createUser('materials-editor', 'editor');
const memberId = await createUser('materials-member', 'member');
const topicId = await executeInsert(`INSERT INTO topics(title,description,platform,creator_id,assignee_id,status) VALUES('资料测试','test','douyin',?,?,'production')`, [editorId, editorId]);
const productionId = await executeInsert(`INSERT INTO production(topic_id,version,content,status,operator_id) VALUES(?,'v1.0','<p>正文</p>','draft',?)`, [topicId, editorId]);
const secondProductionId = await executeInsert(`INSERT INTO production(topic_id,version,content,status,operator_id) VALUES(?,'v1.0','','draft',?)`, [topicId, editorId]);
const resourceId = await executeInsert(`INSERT INTO resources(name,title,summary,library_type,visibility,status,content_text,source_type,source_uri,owner_id,uploader_id,created_by,updated_by) VALUES('来源资料','来源资料','摘要','knowledge','team','published','第一段\n\n第二段','manual','https://example.com/source',?,?,?,?)`, [editorId, editorId, editorId, editorId]);

// A legacy relation created before this migration is safely backfilled, and reruns are idempotent.
await execute(`INSERT INTO resource_relations(resource_id,target_type,target_id,relation_type,created_by) VALUES(?,'production',?,'reference',?)`, [resourceId, productionId, editorId]);
await productionMaterialsWorkspaceMigration.up(db);
await productionMaterialsWorkspaceMigration.up(db);
assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) count FROM production_materials WHERE production_id=? AND source_resource_id=?', [productionId, resourceId]))?.count, 1);

const app = express();
app.use(express.json({ limit: '16mb' }));
app.use('/api/productions', routes);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api/productions`;
const editorHeaders = { Authorization: `Bearer ${signToken({ userId: editorId })}`, 'Content-Type': 'application/json' };
const memberHeaders = { Authorization: `Bearer ${signToken({ userId: memberId })}`, 'Content-Type': 'application/json' };

try {
  const list = await fetch(`${base}/${productionId}/materials`, { headers: editorHeaders });
  assert.equal(list.status, 200);
  const snapshot = (await list.json()).data[0];
  assert.match(snapshot.content_html, /第一段/);
  const legacyList = await fetch(`${base}/${productionId}/resources`, { headers: editorHeaders });
  assert.equal(legacyList.status, 200);
  assert.equal((await legacyList.json()).data[0].id, resourceId);

  await execute(`UPDATE resources SET title='已修改来源',content_text='已修改来源正文' WHERE id=?`, [resourceId]);
  const stable = (await (await fetch(`${base}/${productionId}/materials`, { headers: editorHeaders })).json()).data[0];
  assert.equal(stable.title, '来源资料', 'library edits do not mutate the production snapshot');
  assert.match(stable.content_html, /第一段/);

  const duplicate = await fetch(`${base}/${productionId}/resources`, { method: 'POST', headers: editorHeaders, body: JSON.stringify({ resource_ids: [resourceId] }) });
  assert.equal(duplicate.status, 409);

  const manual = await fetch(`${base}/${productionId}/materials/manual`, { method: 'POST', headers: editorHeaders, body: JSON.stringify({ title: '', content_html: '<p>手动正文</p><script>alert(1)</script><a href="javascript:alert(1)">坏链接</a>' }) });
  assert.equal(manual.status, 201);
  const manualItem = (await manual.json()).data;
  assert.equal(manualItem.title, '手动正文坏链接');
  assert.equal(manualItem.content_html.includes('<script'), false);
  assert.equal(manualItem.content_html.includes('javascript:'), false);

  const updated = await fetch(`${base}/${productionId}/materials/${manualItem.id}`, { method: 'PUT', headers: editorHeaders, body: JSON.stringify({ title: '整理后', content_html: '<p><strong>最终内容</strong></p>', revision: manualItem.revision }) });
  assert.equal(updated.status, 200);
  const updatedItem = (await updated.json()).data;
  assert.equal(updatedItem.revision, 2);
  const stale = await fetch(`${base}/${productionId}/materials/${manualItem.id}`, { method: 'PUT', headers: editorHeaders, body: JSON.stringify({ title: '旧请求', content_html: '<p>旧内容</p>', revision: 1 }) });
  assert.equal(stale.status, 409, 'stale autosave cannot overwrite newer content');

  const readonly = await fetch(`${base}/${productionId}/materials/${manualItem.id}`, { method: 'PUT', headers: memberHeaders, body: JSON.stringify({ title: '越权', content_html: '<p>越权</p>', revision: 2 }) });
  assert.equal(readonly.status, 403);
  const crossProduction = await fetch(`${base}/${secondProductionId}/materials/${manualItem.id}`, { method: 'PUT', headers: editorHeaders, body: JSON.stringify({ title: '跨创作', content_html: '<p>跨创作</p>', revision: 2 }) });
  assert.equal(crossProduction.status, 404);

  const removed = await fetch(`${base}/${productionId}/materials/${snapshot.id}`, { method: 'DELETE', headers: editorHeaders });
  assert.equal(removed.status, 200);
  assert.ok(await queryOne('SELECT id FROM resources WHERE id=?', [resourceId]), 'deleting a snapshot preserves the library resource');
  assert.equal(await queryOne('SELECT id FROM resource_relations WHERE resource_id=? AND target_type=\'production\' AND target_id=?', [resourceId, productionId]), null);

  assert.equal(sanitizeRichText('<iframe src=x></iframe><p onclick="x()">安全</p>').includes('iframe'), false);
  assert.equal((await queryOne<{ quick_check: string }>('PRAGMA quick_check'))?.quick_check, 'ok');
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) count FROM pragma_foreign_key_check'))?.count, 0);
  console.log('production materials workspace tests passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
