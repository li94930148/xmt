import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-published-archive-source-lineage-'));
process.env.XMT_DB_PATH = path.join(directory, 'archive-source-lineage.db');
process.env.JWT_SECRET = 'published-archive-source-lineage-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { clearPermissionCache } = await import('../../api/middleware/permissions.js');
const { default: resourcesRouter } = await import('../../api/routes/resources.js');
const { default: workflowRouter } = await import('../../api/routes/workflow.js');
const { syncPublishedArchive } = await import('../../api/services/publishedArchive.js');

await initDatabase();

async function createRole(code: string) {
  const roleId = await executeInsert(
    'INSERT INTO roles(code,name,description,is_system) VALUES(?,?,?,0)',
    [code, code, 'published archive source lineage test'],
  );
  await execute(
    'INSERT INTO role_permissions(role_id,permission_id) SELECT ?,id FROM permissions WHERE code=?',
    [roleId, 'production:view'],
  );
  return roleId;
}

async function createUser(username: string, roleCode: string) {
  const userId = await executeInsert(
    'INSERT INTO users(username,password,role,name,enabled) VALUES(?,?,?,?,1)',
    [username, 'unused', roleCode, username],
  );
  await execute('INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [userId, roleCode]);
  return userId;
}

await createRole('archive-lineage-reader');
const sourceOwnerId = await createUser('archive-source-owner', 'archive-lineage-reader');
const archiveOwnerId = await createUser('archive-b-owner', 'archive-lineage-reader');

async function createTopic(title: string, ownerId: number) {
  return executeInsert(
    `INSERT INTO topics(title,description,platform,creator_id,assignee_id,status)
     VALUES(?, '', 'douyin', ?, ?, 'shooting')`,
    [title, ownerId, ownerId],
  );
}

const sourceTopicId = await createTopic('A 原来源选题', sourceOwnerId);
const archiveTopicId = await createTopic('B 当前归档选题', archiveOwnerId);
const sourceProductionId = await executeInsert(
  `INSERT INTO production(topic_id,version,content,status,operator_id)
   VALUES(?,'v2.0','<p>仅属于 B 的当前稿</p>','approved',?)`,
  [archiveTopicId, archiveOwnerId],
);
await execute(
  `INSERT INTO production_history(production_id,version,content,status,change_type,operator_id,source_topic_id)
   VALUES(?,'v1.0','<p>仅属于 A 的历史来源正文</p>','approved','major',?,?)`,
  [sourceProductionId, sourceOwnerId, sourceTopicId],
);
await execute(
  `INSERT INTO production_history(production_id,version,content,status,change_type,operator_id,source_topic_id)
   VALUES(?,'v0.9','<p>无可验证归属的旧正文</p>','approved','minor',?,NULL)`,
  [sourceProductionId, sourceOwnerId],
);
await execute(
  `INSERT INTO production_history(production_id,version,content,status,change_type,operator_id,source_topic_id)
   VALUES(?,'v1.1','<p>重复候选一</p>','approved','minor',?,?),(?,'v1.1','<p>重复候选二</p>','approved','minor',?,?)`,
  [sourceProductionId, sourceOwnerId, sourceTopicId, sourceProductionId, archiveOwnerId, archiveTopicId],
);

async function createPublishedRecord(version: string, publishTime: string) {
  return executeInsert(
    `INSERT INTO publishing(topic_id,platform,status,publish_time,operator_id,script_content,
                            script_source_production_id,script_source_version)
     VALUES(?,'抖音','published',?, ?,NULL,?,?)`,
    [archiveTopicId, publishTime, archiveOwnerId, sourceProductionId, version],
  );
}

const crossTopicHistoryPublishingId = await createPublishedRecord('v1.0', '2026-10-28 10:00:00');
const currentPublishingId = await createPublishedRecord('v2.0', '2026-10-29 10:00:00');
const legacyPublishingId = await createPublishedRecord('v0.9', '2026-10-27 10:00:00');
const ambiguousPublishingId = await createPublishedRecord('v1.1', '2026-10-26 10:00:00');

clearPermissionCache();
await syncPublishedArchive(archiveTopicId, archiveOwnerId);
const archiveRow = await queryOne<{ id: number; content: string; uploader_id: number }>(
  `SELECT id,content,uploader_id FROM resources WHERE file_path=? AND category='已完成'`,
  [`archive/topic-${archiveTopicId}`],
);
assert(archiveRow, 'the published B topic produces an archive resource');
assert.equal(archiveRow.uploader_id, archiveOwnerId, 'archive ownership follows B and does not inherit A access');
const archive = JSON.parse(archiveRow.content);
const recordsById = new Map(archive.published_records.map((record: { publishing_id: number }) => [record.publishing_id, record]));
const crossTopicRecord = recordsById.get(crossTopicHistoryPublishingId) as Record<string, any> | undefined;
assert(crossTopicRecord);
assert.deepEqual(crossTopicRecord.script_source, {
  topic_id: archiveTopicId,
  production_id: sourceProductionId,
  version: 'v1.0',
  state: 'derived',
  source_topic_id: sourceTopicId,
}, 'the A history pointer stays derived in the B archive and records its authoritative A provenance');
assert.equal(archive.script_source_snapshots.some((snapshot: { production_id: number; version: string }) =>
  snapshot.production_id === sourceProductionId && snapshot.version === 'v1.0'), false,
'a B archive does not embed the cross-topic A source body');
assert.equal(JSON.stringify(archive).includes('仅属于 A 的历史来源正文'), false, 'the archive payload contains no A source content');
assert.equal(archive.script_source_snapshots.some((snapshot: { production_id: number; version: string; content: string }) =>
  snapshot.production_id === sourceProductionId && snapshot.version === 'v2.0' && snapshot.content.includes('仅属于 B 的当前稿')), true,
'same-topic B source content remains available in B archive snapshots');
assert.equal((recordsById.get(legacyPublishingId) as Record<string, any>).script_source.state, 'unavailable', 'NULL source provenance remains unavailable');
assert.equal((recordsById.get(ambiguousPublishingId) as Record<string, any>).script_source.state, 'unavailable', 'duplicate version provenance remains unavailable');
assert.equal((recordsById.get(currentPublishingId) as Record<string, any>).script_source.state, 'derived');

const app = express();
app.use(express.json());
app.use('/api/resources', resourcesRouter);
app.use('/api/workflow', workflowRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api`;
const headersFor = (userId: number) => ({ authorization: `Bearer ${signToken({ userId })}` });

try {
  const archiveResponse = await fetch(`${base}/resources/archives/${archiveRow.id}`, { headers: headersFor(archiveOwnerId) });
  assert.equal(archiveResponse.status, 200, 'the B archive owner can read the archive');
  const visibleArchive = await archiveResponse.json();
  assert.equal(JSON.stringify(visibleArchive.archive).includes('仅属于 A 的历史来源正文'), false, 'the B archive HTTP response cannot disclose A history text');

  const sourceSnapshotPath = `/workflow/production/${sourceProductionId}/source-snapshot?version=v1.0`;
  const aCanOpenLinkedSource = await fetch(`${base}${sourceSnapshotPath}`, { headers: headersFor(sourceOwnerId) });
  assert.equal(aCanOpenLinkedSource.status, 200, 'the A source owner can open the exact version from its archive source link');
  assert.equal((await aCanOpenLinkedSource.json()).source_topic_id, sourceTopicId);
  const bCannotOpenLinkedSource = await fetch(`${base}${sourceSnapshotPath}`, { headers: headersFor(archiveOwnerId) });
  assert.equal(bCannotOpenLinkedSource.status, 403, 'B-only archive access does not grant read access to A source history');
  assert.equal(JSON.stringify(await bCannotOpenLinkedSource.json()).includes('仅属于 A 的历史来源正文'), false);

  const aCannotOpenBArchive = await fetch(`${base}/resources/archives/${archiveRow.id}`, { headers: headersFor(sourceOwnerId) });
  assert.equal(aCannotOpenBArchive.status, 403, 'A source access does not grant access to B archive details');
  console.log('Published archive source lineage HTTP tests passed.');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
