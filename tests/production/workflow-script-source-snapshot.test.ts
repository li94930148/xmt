import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { productionSourceSnapshotHref } from '../../src/lib/productionSourceSnapshot';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-workflow-source-snapshot-'));
process.env.XMT_DB_PATH = path.join(directory, 'source-snapshot.db');
process.env.JWT_SECRET = 'workflow-source-snapshot-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { clearPermissionCache } = await import('../../api/middleware/permissions.js');
const { default: workflowRouter } = await import('../../api/routes/workflow.js');

await initDatabase();

async function createRole(code: string, permission: string | null) {
  const roleId = await executeInsert(
    'INSERT INTO roles(code,name,description,is_system) VALUES(?,?,?,0)',
    [code, code, 'source snapshot HTTP test'],
  );
  if (permission) {
    await execute(
      'INSERT INTO role_permissions(role_id,permission_id) SELECT ?,id FROM permissions WHERE code=?',
      [roleId, permission],
    );
  }
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

await createRole('source-snapshot-viewer', 'production:view');
await createRole('source-snapshot-no-view', null);
const sourceUserId = await createUser('source-topic-reader', 'source-snapshot-viewer');
const currentUserId = await createUser('current-topic-reader', 'source-snapshot-viewer');
const bothUserId = await createUser('both-topic-reader', 'source-snapshot-viewer');
const noViewUserId = await createUser('no-production-view-reader', 'source-snapshot-no-view');
const sourceTopicOwnerId = await createUser('source-topic-owner', 'source-snapshot-viewer');

async function createTopic(title: string, creatorId: number, assigneeId = creatorId) {
  return executeInsert(
    `INSERT INTO topics(title,description,platform,creator_id,assignee_id,status)
     VALUES(?, '', 'douyin', ?, ?, 'shooting')`,
    [title, creatorId, assigneeId],
  );
}

const sourceTopicId = await createTopic('原来源选题 A', sourceTopicOwnerId, bothUserId);
const currentTopicId = await createTopic('当前关联选题 B', currentUserId, bothUserId);
const productionId = await executeInsert(
  `INSERT INTO production(topic_id,version,content,status,operator_id)
   VALUES(?,'v2.0','<p>当前稿只属于 B</p>','approved',?)`,
  [sourceTopicId, sourceUserId],
);
await execute(
  `INSERT INTO production_history(production_id,version,content,status,change_type,operator_id,source_topic_id)
   VALUES(?,'v1.0','<p>来源选题 A 的精确历史稿</p>','approved','major',?,?)`,
  [productionId, sourceUserId, sourceTopicId],
);
await execute('UPDATE production SET topic_id=?,operator_id=? WHERE id=?', [currentTopicId, currentUserId, productionId]);
const shootingId = await executeInsert(
  `INSERT INTO shooting(topic_id,status,script_content,operator_id,script_source_production_id,script_source_version)
   VALUES(?,'in_progress','<p>成片衍生稿</p>',?,?,'v1.0')`,
  [sourceTopicId, sourceTopicOwnerId, productionId],
);
const reassignedTopicShootingId = await executeInsert(
  `INSERT INTO shooting(topic_id,status,script_content,operator_id,script_source_production_id,script_source_version)
   VALUES(?,'in_progress','<p>B 选题成片衍生稿</p>',?,?,'v1.0')`,
  [currentTopicId, currentUserId, productionId],
);
const currentOnSourceTopicProductionId = await executeInsert(
  `INSERT INTO production(topic_id,version,content,status,operator_id)
   VALUES(?,'v3.0','<p>仍属于来源选题的当前稿</p>','approved',?)`,
  [sourceTopicId, sourceUserId],
);

const legacyProductionId = await executeInsert(
  `INSERT INTO production(topic_id,version,content,status,operator_id)
   VALUES(?,'v2.0','<p>新选题当前稿，不得回退显示</p>','approved',?)`,
  [currentTopicId, currentUserId],
);
await execute(
  `INSERT INTO production_history(production_id,version,content,status,change_type,operator_id,source_topic_id)
   VALUES(?,'v1.0','<p>来源 topic 未记录</p>','approved','major',?,NULL)`,
  [legacyProductionId, currentUserId],
);
const ambiguousProductionId = await executeInsert(
  `INSERT INTO production(topic_id,version,content,status,operator_id)
   VALUES(?,'v2.0','<p>当前稿</p>','approved',?)`,
  [sourceTopicId, sourceUserId],
);
await execute(
  `INSERT INTO production_history(production_id,version,content,status,change_type,operator_id,source_topic_id)
   VALUES(?,'v1.1','<p>候选一</p>','approved','minor',?,?),(?,'v1.1','<p>候选二</p>','approved','minor',?,?)`,
  [ambiguousProductionId, sourceUserId, sourceTopicId, ambiguousProductionId, sourceUserId, sourceTopicId],
);
const noViewTopicId = await createTopic('缺少创作查看权的选题', noViewUserId);
const noViewProductionId = await executeInsert(
  `INSERT INTO production(topic_id,version,content,status,operator_id)
   VALUES(?,'v1.0','<p>无权内容</p>','approved',?)`,
  [noViewTopicId, noViewUserId],
);

clearPermissionCache();
const app = express();
app.use(express.json());
app.use('/api/workflow', workflowRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api/workflow`;
const headersFor = (userId: number) => ({ Authorization: `Bearer ${signToken({ userId })}` });
const sourceUrl = (id: number, version: string, sourceTopicConstraint?: number) =>
  `${base}/production/${id}/source-snapshot?version=${encodeURIComponent(version)}${sourceTopicConstraint ? `&source_topic_id=${sourceTopicConstraint}` : ''}`;

try {
  const originalReaderCurrentProduction = await fetch(`${base}/production/${productionId}`, { headers: headersFor(sourceUserId) });
  assert.equal(originalReaderCurrentProduction.status, 403, 'the existing production endpoint remains scoped to current topic B');
  const originalReaderHistory = await fetch(`${base}/production/${productionId}/history?version=v1.0`, { headers: headersFor(sourceUserId) });
  assert.equal(originalReaderHistory.status, 403, 'the existing history endpoint is not broadened to topic A');

  const shootingDetail = await fetch(`${base}/shooting/${shootingId}`, { headers: headersFor(sourceTopicOwnerId) }).then((response) => response.json());
  assert.equal(shootingDetail.script_source_production.content, '<p>来源选题 A 的精确历史稿</p>', 'the source topic owner can see the precise referenced history on the stage detail');
  const reassignedTopicShooting = await fetch(`${base}/shooting/${reassignedTopicShootingId}`, { headers: headersFor(currentUserId) }).then((response) => response.json());
  assert.equal(reassignedTopicShooting.topic_id, currentTopicId, 'the stage record belongs to reassigned topic B');
  assert.equal(reassignedTopicShooting.script_source_production_id, productionId);
  assert.equal(reassignedTopicShooting.script_source_version, 'v1.0');
  assert.equal(reassignedTopicShooting.script_source_production, null, 'the existing stage resolver does not use B to mislabel A history as a B source');
  const reassignedStageHref = productionSourceSnapshotHref(reassignedTopicShooting.script_source_production_id, reassignedTopicShooting.script_source_version);
  assert.equal(reassignedStageHref, `/production/${productionId}/source-snapshot?version=v1.0`, 'a B-stage link carries only production id and version for server-side provenance resolution');

  const sourceSnapshotResponse = await fetch(sourceUrl(productionId, 'v1.0'), { headers: headersFor(sourceTopicOwnerId) });
  assert.equal(sourceSnapshotResponse.status, 200, 'the original source topic owner can open the read-only source snapshot');
  const sourceSnapshot = await sourceSnapshotResponse.json();
  assert.equal(sourceSnapshot.source_topic_id, sourceTopicId);
  assert.equal(sourceSnapshot.version, 'v1.0');
  assert.equal(sourceSnapshot.content, '<p>来源选题 A 的精确历史稿</p>');
  assert.equal(sourceSnapshot.content.includes('当前稿只属于 B'), false, 'the source snapshot response never falls through to current topic B content');
  const historicalOperatorWithoutSourceTopicScope = await fetch(sourceUrl(productionId, 'v1.0'), { headers: headersFor(sourceUserId) });
  assert.equal(historicalOperatorWithoutSourceTopicScope.status, 403, 'being the historical version operator alone does not create source-topic access after reassignment');
  const currentProductionOperator = await fetch(sourceUrl(currentOnSourceTopicProductionId, 'v3.0'), { headers: headersFor(sourceUserId) });
  assert.equal(currentProductionOperator.status, 200, 'the current production operator retains the existing participant access while the source production still belongs to topic A');
  assert.match((await currentProductionOperator.json()).content, /仍属于来源选题的当前稿/);

  const currentTopicOnly = await fetch(sourceUrl(productionId, 'v1.0'), { headers: headersFor(currentUserId) });
  assert.equal(currentTopicOnly.status, 403, 'access to current topic B does not grant read access to source topic A');
  const originalTopicReaderCannotReadCurrentBVersion = await fetch(sourceUrl(productionId, 'v2.0'), { headers: headersFor(sourceTopicOwnerId) });
  assert.equal(originalTopicReaderCannotReadCurrentBVersion.status, 403, 'source topic A access does not grant access to the production current version owned by B');
  assert.equal(JSON.stringify(await originalTopicReaderCannotReadCurrentBVersion.json()).includes('当前稿只属于 B'), false);
  const staleTopicConstraint = await fetch(sourceUrl(productionId, 'v1.0', currentTopicId), { headers: headersFor(sourceTopicOwnerId) });
  assert.equal(staleTopicConstraint.status, 404, 'a client topic id that disagrees with the stored A source is rejected');
  const currentTopicCanStillReadCurrentProduction = await fetch(`${base}/production/${productionId}`, { headers: headersFor(currentUserId) });
  assert.equal(currentTopicCanStillReadCurrentProduction.status, 200);
  const currentProductionPayload = await currentTopicCanStillReadCurrentProduction.json();
  assert.match(currentProductionPayload.content, /当前稿只属于 B/);
  const currentUserSourceBody = await currentTopicOnly.json();
  assert.equal(JSON.stringify(currentUserSourceBody).includes('当前稿只属于 B'), false);
  const currentTopicSnapshot = await fetch(sourceUrl(productionId, 'v2.0'), { headers: headersFor(currentUserId) });
  assert.equal(currentTopicSnapshot.status, 200, 'the exact current version is readable when its recorded source topic is the current topic B');
  assert.match((await currentTopicSnapshot.json()).content, /当前稿只属于 B/);

  const bothTopicsReader = await fetch(sourceUrl(productionId, 'v1.0'), { headers: headersFor(bothUserId) });
  assert.equal(bothTopicsReader.status, 200, 'a reader with access to both topics can read the exact source version');
  assert.equal((await bothTopicsReader.json()).content, '<p>来源选题 A 的精确历史稿</p>');
  const archiveSource = { topic_id: currentTopicId, production_id: productionId, version: 'v1.0' };
  const archiveSourceHref = productionSourceSnapshotHref(archiveSource.production_id, archiveSource.version);
  assert.equal(archiveSourceHref, `/production/${productionId}/source-snapshot?version=v1.0`, 'an archive reference on topic B also lets the server resolve source topic A from the exact production version');
  const archiveSourceRead = await fetch(`${base}${archiveSourceHref}`, { headers: headersFor(sourceTopicOwnerId) });
  assert.equal(archiveSourceRead.status, 200);
  assert.equal((await archiveSourceRead.json()).source_topic_id, sourceTopicId);

  const permissionDenied = await fetch(sourceUrl(noViewProductionId, 'v1.0'), { headers: headersFor(noViewUserId) });
  assert.equal(permissionDenied.status, 403, 'topic ownership alone does not replace production:view');
  assert.deepEqual((await permissionDenied.json()).required, ['production:view']);

  const legacyNullSource = await fetch(sourceUrl(legacyProductionId, 'v1.0'), { headers: headersFor(sourceTopicOwnerId) });
  assert.equal(legacyNullSource.status, 404, 'a NULL historical source topic is not inferred after reassignment');
  const ambiguousVersion = await fetch(sourceUrl(ambiguousProductionId, 'v1.1'), { headers: headersFor(sourceUserId) });
  assert.equal(ambiguousVersion.status, 404, 'duplicate matching source versions fail closed instead of selecting an arbitrary row');
  const missingVersion = await fetch(sourceUrl(productionId, ''), { headers: headersFor(sourceUserId) });
  assert.equal(missingVersion.status, 400, 'a missing source version is rejected rather than showing current content');
  console.log('Workflow script source snapshot HTTP tests passed.');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
