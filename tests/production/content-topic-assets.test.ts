import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-content-topic-assets-'));
process.env.XMT_DB_PATH = path.join(directory, 'assets.db');
process.env.JWT_SECRET = 'content-topic-assets-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: resourceCenterRoutes } = await import('../../api/routes/resource-center.js');
const { default: topicResourcesRoutes } = await import('../../api/routes/topic-resources.js');

await initDatabase();

async function createUser(username: string, permissions: string[]) {
  const userId = await executeInsert(
    `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
    [username, 'unused', `${username}@example.invalid`, username, username],
  );
  const roleId = await executeInsert(`INSERT INTO roles(code,name,description,is_system) VALUES(?,?,?,0)`, [username, username, 'asset test']);
  await execute('INSERT INTO user_roles(user_id,role_id) VALUES(?,?)', [userId, roleId]);
  for (const code of permissions) {
    await execute(`INSERT INTO role_permissions(role_id,permission_id) SELECT ?,id FROM permissions WHERE code=?`, [roleId, code]);
  }
  return userId;
}

const ownerId = await createUser('asset-owner', ['resource:view', 'topic:view', 'topic:update', 'analytics:view']);
const resourceOnlyId = await createUser('asset-resource-only', ['resource:view']);
const outsiderId = await createUser('asset-outsider', ['resource:view', 'topic:view']);
const topicId = await executeInsert(
  `INSERT INTO topics(title,platform,creator_id,assignee_id,status) VALUES(?,?,?,?,?)`,
  ['旧城早餐主题', 'douyin', ownerId, ownerId, 'completed'],
);
const hiddenTopicId = await executeInsert(
  `INSERT INTO topics(title,platform,creator_id,assignee_id,status) VALUES(?,?,?,?,?)`,
  ['不可见主题', 'douyin', outsiderId, outsiderId, 'completed'],
);
const olderTopicId = await executeInsert(
  `INSERT INTO topics(title,platform,creator_id,assignee_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`,
  ['早期主题', 'douyin', ownerId, ownerId, 'completed', '2026-01-01 00:00:00', '2026-01-01 00:00:00'],
);
await executeInsert(
  `INSERT INTO topics(title,platform,creator_id,assignee_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`,
  ['未登记维度主题', 'douyin', ownerId, ownerId, 'completed', '2025-08-01 00:00:00', '2025-08-01 00:00:00'],
);
await execute(
  `INSERT INTO topic_asset_dimensions(topic_id,dimension_type,value,normalized_value,created_by) VALUES(?,?,?,?,?)`,
  [hiddenTopicId, 'city', '仅对外部账号可见的城市', '仅对外部账号可见的城市', outsiderId],
);
const productionId = await executeInsert(
  `INSERT INTO production(topic_id,version,content,status,operator_id) VALUES(?,?,?,?,?)`,
  [topicId, 'v2.0', '<p>历史稿</p>', 'approved', ownerId],
);
await executeInsert(
  `INSERT INTO shooting(topic_id,location,status,operator_id) VALUES(?,?,?,?)`,
  [topicId, '旧城', 'completed', ownerId],
);
const publishingId = await executeInsert(
  `INSERT INTO publishing(topic_id,platform,status,publish_time,operator_id,manual_views) VALUES(?,?,?,?,?,?)`,
  [topicId, 'douyin', 'published', '2026-09-28 12:00:00', ownerId, 300],
);

async function createResource(title: string, visibility: string, owner: number) {
  return executeInsert(
    `INSERT INTO resources(name,title,library_type,visibility,status,owner_id,uploader_id,created_by,updated_by)
     VALUES(?,?,'content_archive',?,'published',?,?,?,?)`,
    [title, title, visibility, owner, owner, owner, owner],
  );
}

const directlyLinked = await createResource('可见资料', 'team', ownerId);
const linkedThroughPublishing = await createResource('发布资料', 'team', ownerId);
const citedOnlyInManuscript = await createResource('正文引用资料', 'team', ownerId);
const arbitraryLinkResource = await createResource('普通超链接资料', 'team', ownerId);
const draftOnlyResource = await createResource('仅资料草稿引用', 'team', ownerId);
const privateToOutsider = await createResource('他人私密资料', 'private', outsiderId);
const hiddenTopicResource = await createResource('不可见选题资料', 'team', outsiderId);
const deletedTopicResource = await createResource('已删除资料', 'team', ownerId);
const topicMutationResource = await createResource('选题关联原子性测试资料', 'team', ownerId);
await execute(`UPDATE resources SET status='deleted', deleted_at=datetime('now', '+8 hours') WHERE id=?`, [deletedTopicResource]);
await execute(`INSERT INTO resource_relations(resource_id,target_type,target_id,relation_type,created_by) VALUES(?,'topic',?,'reference',?)`, [directlyLinked, topicId, ownerId]);
await execute(`INSERT INTO resource_relations(resource_id,target_type,target_id,relation_type,created_by) VALUES(?,'production',?,'reference',?)`, [directlyLinked, productionId, ownerId]);
await execute(`INSERT INTO resource_relations(resource_id,target_type,target_id,relation_type,created_by) VALUES(?,'topic',?,'reference',?)`, [directlyLinked, olderTopicId, ownerId]);
await execute(`INSERT INTO resource_relations(resource_id,target_type,target_id,relation_type,created_by) VALUES(?,'publishing',?,'reference',?)`, [linkedThroughPublishing, publishingId, ownerId]);
await execute(`INSERT INTO resource_relations(resource_id,target_type,target_id,relation_type,created_by) VALUES(?,'topic',?,'reference',?)`, [privateToOutsider, topicId, ownerId]);
await execute(`INSERT INTO resource_relations(resource_id,target_type,target_id,relation_type,created_by) VALUES(?,'topic',?,'reference',?)`, [hiddenTopicResource, hiddenTopicId, outsiderId]);
await execute(`INSERT INTO resource_relations(resource_id,target_type,target_id,relation_type,created_by) VALUES(?,'topic',?,'reference',?)`, [deletedTopicResource, topicId, ownerId]);
await execute(`UPDATE production SET content=? WHERE id=?`, [
  `<p><a href="/asset-center/resources/${directlyLinked}">来源：可见资料</a></p>
   <p><a href="/asset-center/resources/${citedOnlyInManuscript}">来源：正文引用资料</a></p>
   <p><a href="/asset-center/resources/${citedOnlyInManuscript}/">来源：正文引用资料</a></p>
   <p><a href="/asset-center/resources/${arbitraryLinkResource}">相关内容</a></p>
   <p><a href="https://example.invalid/asset-center/resources/${citedOnlyInManuscript}">来源：外部链接</a></p>
   <p><a href="/asset-center/resources/${deletedTopicResource}">来源：已删除资料</a></p>
   <p><a href="/asset-center/resources/${privateToOutsider}">来源：他人私密资料</a></p>`,
  productionId,
]);
await execute(`INSERT INTO production_material_drafts(production_id,content_html,created_by,updated_by) VALUES(?,?,?,?)`, [
  productionId,
  `<p><a href="/asset-center/resources/${draftOnlyResource}">来源：仅资料草稿引用</a></p>`,
  ownerId,
  ownerId,
]);
await execute(`INSERT INTO analytics(topic_id,views,likes,shares,comments,data_date) VALUES(?,?,?,?,?,?)`, [topicId, 100, 10, 4, 2, '2026-09-01']);
await execute(`INSERT INTO analytics(topic_id,views,likes,shares,comments,data_date) VALUES(?,?,?,?,?,?)`, [topicId, 250, 20, 8, 5, '2026-09-28']);

const app = express();
app.use(express.json());
app.use('/api/resource-center', resourceCenterRoutes);
app.use('/api/topics', topicResourcesRoutes);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const endpoint = `http://127.0.0.1:${address.port}/api/resource-center/content-topics`;
const ownerHeaders = { Authorization: `Bearer ${signToken({ userId: ownerId })}` };
const resourceOnlyHeaders = { Authorization: `Bearer ${signToken({ userId: resourceOnlyId })}` };
const outsiderHeaders = { Authorization: `Bearer ${signToken({ userId: outsiderId })}` };

try {
  const topicResourceUrl = `http://127.0.0.1:${address.port}/api/topics/${topicId}/resources`;
  const assertNoStore = (response: Response) => assert.match(response.headers.get('cache-control') || '', /no-store/i);
  const unauthenticatedTopicResources = await fetch(topicResourceUrl);
  assert.equal(unauthenticatedTopicResources.status, 401);
  assertNoStore(unauthenticatedTopicResources);
  const forbiddenTopicResources = await fetch(`http://127.0.0.1:${address.port}/api/topics/${hiddenTopicId}/resources`, { headers: ownerHeaders });
  assert.equal(forbiddenTopicResources.status, 403, 'topic visibility remains enforced for resource links');
  assertNoStore(forbiddenTopicResources);
  const missingTopicResources = await fetch(`http://127.0.0.1:${address.port}/api/topics/999999/resources`, { headers: ownerHeaders });
  assert.equal(missingTopicResources.status, 404, 'missing topics remain hidden behind the existing response');
  assertNoStore(missingTopicResources);
  const initialTopicResources = await fetch(topicResourceUrl, { headers: ownerHeaders });
  assert.equal(initialTopicResources.status, 200);
  assertNoStore(initialTopicResources);
  const initialTopicResourceIds = ((await initialTopicResources.json() as { data: Array<{ id: number }> }).data)
    .map((resource) => resource.id);
  assert.deepEqual(initialTopicResourceIds, [directlyLinked], 'the cache contract keeps the existing visible resource scope');
  const topicMutationHeaders = { ...ownerHeaders, 'Content-Type': 'application/json' };
  await execute(`
    CREATE TRIGGER reject_topic_relation_add_audit
    BEFORE INSERT ON resource_audit_logs
    WHEN NEW.resource_id = ${topicMutationResource} AND NEW.action = 'relation_add'
    BEGIN SELECT RAISE(ABORT, 'simulated topic relation audit failure'); END
  `);
  const failedTopicRelationAdd = await fetch(topicResourceUrl, {
    method: 'POST', headers: topicMutationHeaders,
    body: JSON.stringify({ resource_id: topicMutationResource }),
  });
  assert.equal(failedTopicRelationAdd.status, 500, 'audit failure is not mislabeled as an existing relation');
  const failedAddPayload = await failedTopicRelationAdd.json() as { message?: string };
  assert.equal(String(failedAddPayload.message || '').includes('simulated topic relation audit failure'), false, 'database failure text is not exposed');
  assert.equal((await queryOne<{ count: number }>(`
    SELECT COUNT(*) AS count FROM resource_relations
    WHERE resource_id = ? AND target_type = 'topic' AND target_id = ? AND relation_type = 'reference'
  `, [topicMutationResource, topicId]))?.count, 0, 'failed topic relation add rolls back');
  await execute('DROP TRIGGER reject_topic_relation_add_audit');

  const topicRelationAdd = await fetch(topicResourceUrl, {
    method: 'POST', headers: topicMutationHeaders,
    body: JSON.stringify({ resource_id: topicMutationResource }),
  });
  assert.equal(topicRelationAdd.status, 201);
  const duplicateTopicRelationAdd = await fetch(topicResourceUrl, {
    method: 'POST', headers: topicMutationHeaders,
    body: JSON.stringify({ resource_id: topicMutationResource }),
  });
  assert.equal(duplicateTopicRelationAdd.status, 409, 'a real unique relation conflict keeps the duplicate response');
  const topicRelationCount = await queryOne<{ count: number }>(`
    SELECT COUNT(*) AS count FROM resource_relations
    WHERE resource_id = ? AND target_type = 'topic' AND target_id = ? AND relation_type = 'reference'
  `, [topicMutationResource, topicId]);
  assert.equal(topicRelationCount?.count, 1, 'duplicate relation attempt does not create another row');

  await execute(`
    CREATE TRIGGER reject_topic_relation_remove_audit
    BEFORE INSERT ON resource_audit_logs
    WHEN NEW.resource_id = ${topicMutationResource} AND NEW.action = 'relation_remove'
    BEGIN SELECT RAISE(ABORT, 'simulated topic relation removal audit failure'); END
  `);
  const topicResourceDeleteUrl = `${topicResourceUrl}/${topicMutationResource}`;
  const failedTopicRelationRemove = await fetch(topicResourceDeleteUrl, {
    method: 'DELETE', headers: ownerHeaders,
  });
  assert.equal(failedTopicRelationRemove.status, 500, 'failed relation removal returns an internal error');
  const failedRemovePayload = await failedTopicRelationRemove.json() as { message?: string };
  assert.equal(String(failedRemovePayload.message || '').includes('simulated topic relation removal audit failure'), false, 'database failure text is not exposed');
  assert.equal((await queryOne<{ count: number }>(`
    SELECT COUNT(*) AS count FROM resource_relations
    WHERE resource_id = ? AND target_type = 'topic' AND target_id = ? AND relation_type = 'reference'
  `, [topicMutationResource, topicId]))?.count, 1, 'failed topic relation removal rolls back');
  await execute('DROP TRIGGER reject_topic_relation_remove_audit');
  const topicRelationRemove = await fetch(topicResourceDeleteUrl, { method: 'DELETE', headers: ownerHeaders });
  assert.equal(topicRelationRemove.status, 200);
  assert.equal((await queryOne<{ count: number }>(`
    SELECT COUNT(*) AS count FROM resource_audit_logs WHERE resource_id = ? AND action IN ('relation_add', 'relation_remove')
  `, [topicMutationResource]))?.count, 2, 'successful link and unlink each leave one matching audit entry');

  const ownerResponse = await fetch(endpoint, { headers: ownerHeaders });
  assert.equal(ownerResponse.status, 200);
  const ownerPayload = await ownerResponse.json() as {
    data: Array<Record<string, unknown>>;
    pagination: { total: number };
    analytics_visible: boolean;
    available_dimensions: Array<{ dimension_type: string; value: string }>;
    dimension_coverage: { visible_topics_total: number; registered_topic_counts: Record<string, number> };
  };
  assert.equal(ownerPayload.pagination.total, 3, 'foreign topics are not included in the caller’s content asset index');
  assert.deepEqual(ownerPayload.dimension_coverage, {
    visible_topics_total: 3,
    registered_topic_counts: { city: 0, person: 0, project: 0 },
  }, 'initial coverage includes visible topics even when no dimensions have been registered');
  assert.equal(ownerPayload.data[0]?.id, topicId);
  assert.equal(ownerPayload.data[0]?.production_count, 1);
  assert.equal(ownerPayload.data[0]?.shooting_count, 1);
  assert.equal(ownerPayload.data[0]?.publishing_count, 1);
  assert.equal(ownerPayload.data[0]?.resource_count, 2, 'direct and workflow-linked resources are deduplicated and private resources are excluded');
  const linkedResources = ownerPayload.data[0]?.linked_resources as Array<{ id: number; title: string; library_type: string; updated_at: string }>;
  assert.deepEqual(linkedResources.map(({ id }) => id).sort((left, right) => left - right), [directlyLinked, linkedThroughPublishing].sort((left, right) => left - right), 'the asset response returns each accessible formal resource exactly once and excludes private/deleted resources');
  assert.equal(linkedResources.find(({ id }) => id === directlyLinked)?.title, '可见资料');
  assert.equal(linkedResources.find(({ id }) => id === directlyLinked)?.library_type, 'content_archive');
  assert.equal(typeof linkedResources.find(({ id }) => id === directlyLinked)?.updated_at, 'string');
  const referencedResources = ownerPayload.data[0]?.referenced_resources as Array<{ id: number; title: string; library_type: string; updated_at: string }>;
  assert.deepEqual(referencedResources.map(({ id }) => id), [citedOnlyInManuscript], 'only unique, accessible source links in the current manuscript are returned; formal links are not duplicated');
  assert.equal(referencedResources[0]?.title, '正文引用资料');
  assert.equal(referencedResources[0]?.library_type, 'content_archive');
  assert.equal(typeof referencedResources[0]?.updated_at, 'string');
  const latestMetrics = ownerPayload.data[0]?.latest_analytics as Record<string, unknown>;
  assert.equal(latestMetrics?.data_date, '2026-09-28 12:00:00');
  assert.equal(latestMetrics?.views, 300, 'the asset view uses the publication-level manual supplement instead of the old topic total');
  assert.equal((latestMetrics?.sources as Record<string, unknown>)?.views, 'manual');
  assert.equal((latestMetrics?.sources as Record<string, unknown>)?.likes, 'legacy_analytics');
  assert.equal(ownerPayload.analytics_visible, true);
  assert.deepEqual(ownerPayload.data[0]?.dimensions, []);
  assert.equal(ownerPayload.data[0]?.can_manage_dimensions, true);
  assert.deepEqual(ownerPayload.available_dimensions, []);

  const secondPlatformPublishingId = await executeInsert(
    `INSERT INTO publishing(topic_id,platform,status,publish_time,operator_id,manual_views) VALUES(?,'weixin','published','2026-09-29 12:00:00',?,450)`,
    [topicId, ownerId],
  );
  const multiplePublicationResponse = await fetch(endpoint, { headers: ownerHeaders });
  const multiplePublicationPayload = await multiplePublicationResponse.json() as { data: Array<Record<string, unknown>> };
  const multiplePublicationTopic = multiplePublicationPayload.data.find((item) => item.id === topicId);
  assert.equal(multiplePublicationTopic?.publishing_count, 2);
  assert.deepEqual(
    multiplePublicationTopic?.latest_analytics,
    {
      publishing_id: secondPlatformPublishingId,
      platform: 'weixin',
      data_date: '2026-09-29 12:00:00',
      views: 450,
      likes: 0,
      shares: 0,
      comments: 0,
      sources: { views: 'manual', likes: 'unavailable', shares: 'unavailable', comments: 'unavailable' },
    },
    'topic asset summary identifies the single latest publication and does not merge metrics across platforms',
  );

  const addCity = await fetch(`http://127.0.0.1:${address.port}/api/topics/${topicId}/asset-dimensions`, {
    method: 'POST', headers: { ...ownerHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'city', value: '杭州' }),
  });
  assert.equal(addCity.status, 201);
  const addOlderCity = await fetch(`http://127.0.0.1:${address.port}/api/topics/${olderTopicId}/asset-dimensions`, {
    method: 'POST', headers: { ...ownerHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'city', value: '杭州' }),
  });
  assert.equal(addOlderCity.status, 201);
  const cityPayload = await addCity.json() as { id: number };
  const addPerson = await fetch(`http://127.0.0.1:${address.port}/api/topics/${topicId}/asset-dimensions`, {
    method: 'POST', headers: { ...ownerHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'person', value: '李师傅' }),
  });
  assert.equal(addPerson.status, 201);
  const addProject = await fetch(`http://127.0.0.1:${address.port}/api/topics/${topicId}/asset-dimensions`, {
    method: 'POST', headers: { ...ownerHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'project', value: '运河早餐系列' }),
  });
  assert.equal(addProject.status, 201);
  const addSecondCityToSameTopic = await fetch(`http://127.0.0.1:${address.port}/api/topics/${topicId}/asset-dimensions`, {
    method: 'POST', headers: { ...ownerHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'city', value: '苏州' }),
  });
  assert.equal(addSecondCityToSameTopic.status, 201);
  const readTopicDimensions = await fetch(`http://127.0.0.1:${address.port}/api/topics/${topicId}/asset-dimensions`, { headers: ownerHeaders });
  const topicDimensionsPayload = await readTopicDimensions.json() as { data: Array<{ type: string; value: string; created_by: number }> };
  assert.equal(readTopicDimensions.status, 200);
  assert.deepEqual(topicDimensionsPayload.data.map(({ type, value }) => ({ type, value })), [
    { type: 'city', value: '杭州' },
    { type: 'city', value: '苏州' },
    { type: 'person', value: '李师傅' },
    { type: 'project', value: '运河早餐系列' },
  ]);
  assert(topicDimensionsPayload.data.every(({ created_by }) => created_by === ownerId), 'the topic detail dimension endpoint preserves audit identity');
  const duplicateCity = await fetch(`http://127.0.0.1:${address.port}/api/topics/${topicId}/asset-dimensions`, {
    method: 'POST', headers: { ...ownerHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'city', value: ' 杭州 ' }),
  });
  assert.equal(duplicateCity.status, 409, 'normalization prevents duplicate whitespace variants');
  const invalidDimension = await fetch(`http://127.0.0.1:${address.port}/api/topics/${topicId}/asset-dimensions`, {
    method: 'POST', headers: { ...ownerHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'city', value: 'x'.repeat(81) }),
  });
  assert.equal(invalidDimension.status, 400);

  const dimensionFiltered = await fetch(`${endpoint}?dimension_type=city&dimension_value=%E6%9D%AD%E5%B7%9E`, { headers: ownerHeaders });
  const dimensionPayload = await dimensionFiltered.json() as {
    data: Array<{ id: number; dimensions: Array<{ type: string; value: string }> }>;
    pagination: { total: number };
    available_dimensions: Array<{ dimension_type: string; value: string }>;
    dimension_summaries: Array<{ dimension_type: string; value: string; topic_count: number; production_count: number; resource_count: number; shooting_count: number; publishing_count: number }>;
    dimension_coverage: { visible_topics_total: number; registered_topic_counts: Record<string, number> };
  };
  assert.equal(dimensionFiltered.status, 200);
  assert.equal(dimensionPayload.pagination.total, 2);
  assert.equal(dimensionPayload.data[0]?.id, topicId);
  assert.equal(dimensionPayload.data[0]?.dimensions.length, 4);
  assert.deepEqual(dimensionPayload.available_dimensions, [
    { dimension_type: 'city', value: '杭州' },
    { dimension_type: 'city', value: '苏州' },
    { dimension_type: 'person', value: '李师傅' },
    { dimension_type: 'project', value: '运河早餐系列' },
  ]);
  assert.deepEqual(dimensionPayload.dimension_coverage, {
    visible_topics_total: 3,
    registered_topic_counts: { city: 2, person: 1, project: 1 },
  }, 'coverage counts distinct visible topics, not dimension values, and does not change with filters');
  assert.deepEqual(dimensionPayload.dimension_summaries.find(({ dimension_type }) => dimension_type === 'city'), {
    dimension_type: 'city', value: '杭州', topic_count: 2, production_count: 1, resource_count: 2, shooting_count: 1, publishing_count: 2,
  }, 'dimension summaries preserve the true per-publication count without joining or collapsing by platform');

  const forbiddenDimensionView = await fetch(`http://127.0.0.1:${address.port}/api/topics/${topicId}/asset-dimensions`, { headers: outsiderHeaders });
  assert.equal(forbiddenDimensionView.status, 403, 'topic visibility is checked before returning dimension metadata');
  const forbiddenDimensionEdit = await fetch(`http://127.0.0.1:${address.port}/api/topics/${hiddenTopicId}/asset-dimensions`, {
    method: 'POST', headers: { ...outsiderHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'city', value: '绍兴' }),
  });
  assert.equal(forbiddenDimensionEdit.status, 403, 'topic:update is required even for an owned topic');
  const outsiderAssets = await fetch(endpoint, { headers: outsiderHeaders });
  const outsiderAssetPayload = await outsiderAssets.json() as {
    available_dimensions: Array<{ value: string }>;
    dimension_coverage: { visible_topics_total: number; registered_topic_counts: Record<string, number> };
  };
  assert.equal(outsiderAssetPayload.available_dimensions.some(({ value }) => value === '杭州'), false, 'dimension options exclude labels on invisible topics');
  assert.deepEqual(outsiderAssetPayload.dimension_coverage, {
    visible_topics_total: 1,
    registered_topic_counts: { city: 1, person: 0, project: 0 },
  }, 'coverage follows the caller visible-topic scope and does not expose other users’ dimensions');

  const removeCity = await fetch(`http://127.0.0.1:${address.port}/api/topics/${topicId}/asset-dimensions/${cityPayload.id}`, { method: 'DELETE', headers: ownerHeaders });
  assert.equal(removeCity.status, 200);
  const dimensionHistory = await queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM topic_history WHERE topic_id = ? AND action IN ('asset_dimension_added', 'asset_dimension_removed')`, [topicId]);
  assert.equal(Number(dimensionHistory?.count), 5, 'dimension changes are recorded in topic history');

  const searchResponse = await fetch(`${endpoint}?keyword=%E6%97%A7%E5%9F%8E&page=1&page_size=1`, { headers: ownerHeaders });
  const searchPayload = await searchResponse.json() as {
    data: Array<{ title: string }>;
    pagination: { total: number; page_size: number };
    dimension_coverage: { visible_topics_total: number; registered_topic_counts: Record<string, number> };
  };
  assert.equal(searchResponse.status, 200);
  assert.equal(searchPayload.pagination.total, 1);
  assert.equal(searchPayload.pagination.page_size, 1);
  assert.equal(searchPayload.data[0]?.title, '旧城早餐主题');
  assert.deepEqual(searchPayload.dimension_coverage, {
    visible_topics_total: 3,
    registered_topic_counts: { city: 2, person: 1, project: 1 },
  }, 'keyword search does not narrow the account-wide dimension coverage counts');

  const secondPageResponse = await fetch(`${endpoint}?page=2&page_size=1`, { headers: ownerHeaders });
  const secondPagePayload = await secondPageResponse.json() as { data: Array<{ id: number }>; pagination: { total_pages: number } };
  assert.equal(secondPageResponse.status, 200);
  assert.equal(secondPagePayload.pagination.total_pages, 3);
  assert.equal(secondPagePayload.data[0]?.id, olderTopicId, 'pagination is stable and does not repeat the first topic');

  const noAnalyticsResponse = await fetch(endpoint, { headers: outsiderHeaders });
  const noAnalyticsPayload = await noAnalyticsResponse.json() as { analytics_visible: boolean; data: Array<Record<string, unknown>> };
  assert.equal(noAnalyticsResponse.status, 200);
  assert.equal(noAnalyticsPayload.data[0]?.id, hiddenTopicId);
  assert.equal(noAnalyticsPayload.analytics_visible, false);
  assert.equal(noAnalyticsPayload.data[0]?.latest_analytics, null, 'analytics are not returned without analytics:view');

  const missingTopicPermission = await fetch(endpoint, { headers: resourceOnlyHeaders });
  assert.equal(missingTopicPermission.status, 403, 'content aggregation requires topic:view in addition to resource:view');

  const oversizedSearch = await fetch(`${endpoint}?keyword=${'x'.repeat(101)}`, { headers: ownerHeaders });
  assert.equal(oversizedSearch.status, 400);
  console.log('content topic asset aggregation, scoping, deduplication, analytics permission, search, and pagination passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
