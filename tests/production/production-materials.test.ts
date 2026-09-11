import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-production-material-draft-'));
process.env.XMT_DB_PATH = path.join(directory, 'materials.db');
process.env.JWT_SECRET = 'production-material-draft-test-secret';

const { initDatabase, closeDatabase, db } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: routes } = await import('../../api/routes/production-resources.js');
const { productionMaterialsWorkspaceMigration } = await import('../../api/database/migrations/010_production_materials_workspace.js');
const { productionMaterialDraftMigration } = await import('../../api/database/migrations/011_production_material_draft.js');

await initDatabase();

async function createUser(username: string, role: string) {
  const id = await executeInsert(
    `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
    [username, 'unused', `${username}@example.invalid`, role, username],
  );
  await execute(`INSERT OR IGNORE INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?`, [id, role]);
  return id;
}

const editorId = await createUser('draft-editor', 'editor');
const memberId = await createUser('draft-reader', 'member');
const outsiderId = await createUser('draft-outsider', 'editor');
await execute(`INSERT INTO roles(code,name,description,is_system) VALUES('scoped-draft-editor','受限编辑','测试角色',0)`);
const scopedEditorId = await createUser('scoped-draft-editor-user', 'scoped-draft-editor');
await execute(`
  INSERT INTO role_permissions(role_id,permission_id)
  SELECT r.id,p.id FROM roles r,permissions p
  WHERE r.code='scoped-draft-editor' AND p.code IN ('production:view','production:update')
`);
const topicId = await executeInsert(
  `INSERT INTO topics(title,description,platform,creator_id,assignee_id,status) VALUES('资料草稿测试','test','douyin',?,?,'production')`,
  [editorId, editorId],
);
const productionId = await executeInsert(
  `INSERT INTO production(topic_id,version,content,status,operator_id) VALUES(?,'v1.0','<p>正式稿</p>','draft',?)`,
  [topicId, memberId],
);
const emptyProductionId = await executeInsert(
  `INSERT INTO production(topic_id,version,content,status,operator_id) VALUES(?,'v1.0','','draft',?)`,
  [topicId, editorId],
);
const outsiderTopicId = await executeInsert(
  `INSERT INTO topics(title,description,platform,creator_id,assignee_id,status) VALUES('他人资料草稿','test','douyin',?,?,'production')`,
  [outsiderId, outsiderId],
);
const outsiderProductionId = await executeInsert(
  `INSERT INTO production(topic_id,version,content,status,operator_id) VALUES(?,'v1.0','','draft',?)`,
  [outsiderTopicId, outsiderId],
);
const resourceId = await executeInsert(
  `INSERT INTO resources(name,title,summary,library_type,visibility,status,content_text,source_type,source_uri,owner_id,uploader_id,created_by,updated_by) VALUES('来源一','来源一','摘要','knowledge','team','published','第一段\n\n第二段','manual','https://example.com/source',?,?,?,?)`,
  [editorId, editorId, editorId, editorId],
);
const secondResourceId = await executeInsert(
  `INSERT INTO resources(name,title,summary,library_type,visibility,status,content_text,source_type,owner_id,uploader_id,created_by,updated_by) VALUES('来源二','来源二','摘要','knowledge','team','published','第三段','manual',?,?,?,?)`,
  [editorId, editorId, editorId, editorId],
);
const emptyResourceId = await executeInsert(
  `INSERT INTO resources(name,title,summary,library_type,visibility,status,content_text,source_type,owner_id,uploader_id,created_by,updated_by) VALUES('空资料','空资料','摘要','knowledge','team','published','','manual',?,?,?,?)`,
  [editorId, editorId, editorId, editorId],
);

// Simulate the already-deployed v2.20.22 card data, then merge it once by sort order.
await execute(`INSERT INTO resource_relations(resource_id,target_type,target_id,relation_type,created_by) VALUES(?,'production',?,'reference',?)`, [resourceId, productionId, editorId]);
await productionMaterialsWorkspaceMigration.up(db);
await execute(`
  INSERT INTO production_materials(
    production_id,material_type,title,content_html,content_format,source_name,sort_order,revision,created_by,updated_by
  ) VALUES(?,'manual','旧手动卡片','<p><strong>卡片二</strong></p>','html_v1','手动整理',2,1,?,?)
`, [productionId, editorId, editorId]);
await productionMaterialDraftMigration.up(db);
await productionMaterialDraftMigration.up(db);
const migrated = await queryOne<{ content_html: string; count: number }>(
  `SELECT content_html,(SELECT COUNT(*) FROM production_material_drafts WHERE production_id=?) count FROM production_material_drafts WHERE production_id=?`,
  [productionId, productionId],
);
assert.equal(migrated?.count, 1, 'migration reruns never append a second draft');
assert.ok((migrated?.content_html.indexOf('第一段') ?? -1) < (migrated?.content_html.indexOf('卡片二') ?? -1));
assert.match(migrated?.content_html ?? '', /<p><br><\/p>/);

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
const scopedEditorHeaders = { Authorization: `Bearer ${signToken({ userId: scopedEditorId })}`, 'Content-Type': 'application/json' };

try {
  const initial = await fetch(`${base}/${productionId}/material-draft`, { headers: editorHeaders });
  assert.equal(initial.status, 200);
  const initialDraft = (await initial.json()).data;
  assert.match(initialDraft.content_html, /第一段/);
  assert.match(initialDraft.content_html, /卡片二/);

  const insertions = await fetch(`${base}/${productionId}/material-draft/resources`, {
    method: 'POST',
    headers: editorHeaders,
    body: JSON.stringify({ resource_ids: [secondResourceId, emptyResourceId, resourceId] }),
  });
  assert.equal(insertions.status, 200);
  const insertionPayload = await insertions.json();
  assert.deepEqual(insertionPayload.data.map((item: { resource_id: number }) => item.resource_id), [secondResourceId, resourceId]);
  assert.deepEqual(insertionPayload.empty_resource_ids, [emptyResourceId]);
  assert.match(insertionPayload.data[0].content_html, /第三段/);
  assert.match(insertionPayload.data[1].content_html, /第一段/);

  const saved = await fetch(`${base}/${productionId}/material-draft`, {
    method: 'PUT',
    headers: editorHeaders,
    body: JSON.stringify({
      content_html: '<p>统一草稿</p><script>alert(1)</script><a href="javascript:alert(1)">坏链接</a>',
      revision: initialDraft.revision,
    }),
  });
  assert.equal(saved.status, 200);
  const savedDraft = (await saved.json()).data;
  assert.equal(savedDraft.revision, initialDraft.revision + 1);
  assert.equal(savedDraft.content_html.includes('<script'), false);
  assert.equal(savedDraft.content_html.includes('javascript:'), false);

  const stale = await fetch(`${base}/${productionId}/material-draft`, {
    method: 'PUT', headers: editorHeaders,
    body: JSON.stringify({ content_html: '<p>旧请求</p>', revision: initialDraft.revision }),
  });
  assert.equal(stale.status, 409, 'stale autosave cannot overwrite the current draft');

  const readerView = await fetch(`${base}/${productionId}/material-draft`, { headers: memberHeaders });
  assert.equal(readerView.status, 200, 'a visible read-only participant can read the draft');
  const readerWrite = await fetch(`${base}/${productionId}/material-draft`, {
    method: 'PUT', headers: memberHeaders,
    body: JSON.stringify({ content_html: '<p>越权</p>', revision: savedDraft.revision }),
  });
  assert.equal(readerWrite.status, 403);
  const crossUserWrite = await fetch(`${base}/${outsiderProductionId}/material-draft`, {
    method: 'PUT', headers: scopedEditorHeaders,
    body: JSON.stringify({ content_html: '<p>跨用户越权</p>', revision: 0 }),
  });
  assert.equal(crossUserWrite.status, 403);

  const firstSave = await fetch(`${base}/${emptyProductionId}/material-draft`, {
    method: 'PUT', headers: editorHeaders,
    body: JSON.stringify({ content_html: '<p>直接输入</p>', revision: 0 }),
  });
  assert.equal(firstSave.status, 200);
  assert.equal((await firstSave.json()).data.revision, 1);

  await execute(`UPDATE resources SET content_text='来源已变化' WHERE id=?`, [resourceId]);
  const stableDraft = (await (await fetch(`${base}/${productionId}/material-draft`, { headers: editorHeaders })).json()).data;
  assert.match(stableDraft.content_html, /统一草稿/);
  assert.equal(stableDraft.content_html.includes('来源已变化'), false, 'editing the library source never changes the saved draft');
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) count FROM production_materials WHERE production_id=?', [productionId]))?.count, 2, 'legacy card data is retained');

  const removedManualEndpoint = await fetch(`${base}/${productionId}/materials/manual`, {
    method: 'POST', headers: editorHeaders, body: JSON.stringify({ content_html: '<p>不可达</p>' }),
  });
  assert.equal(removedManualEndpoint.status, 404);

  assert.equal((await queryOne<{ quick_check: string }>('PRAGMA quick_check'))?.quick_check, 'ok');
  assert.equal((await queryOne<{ count: number }>('SELECT COUNT(*) count FROM pragma_foreign_key_check'))?.count, 0);
  console.log('unified production material draft tests passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
