import express from 'express';
import { queryAll, queryOne, runInTransaction } from '../database/utils';
import { authenticate } from '../middleware/auth';
import { noStoreResponse } from '../middleware/no-store';
import { requireAllPermissions, requirePermission } from '../middleware/permissions';
import { canEditTopic, canViewTopic } from '../utils/access';
import { getScopedResource, normalizeTagName, positiveInteger, recordResourceAuditInTransaction, resourceScopeArgs, resourceScopePredicate, userHasPermission } from '../services/resourceCenter';
import { sendSafeServerError } from '../utils/response';

const router = express.Router();

async function getTopic(id: number) {
  return queryOne<{ id: number; creator_id: number | null; assignee_id: number | null }>(
    'SELECT id, creator_id, assignee_id FROM topics WHERE id = ?',
    [id],
  );
}

const ASSET_DIMENSION_TYPES = ['city', 'person', 'project'] as const;
type AssetDimensionType = typeof ASSET_DIMENSION_TYPES[number];
const ASSET_DIMENSION_LABELS: Record<AssetDimensionType, string> = { city: '城市', person: '人物', project: '项目' };

function parseAssetDimension(value: unknown): { type: AssetDimensionType; value: string; normalizedValue: string } | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  if (typeof input.type !== 'string' || !ASSET_DIMENSION_TYPES.includes(input.type as AssetDimensionType) || typeof input.value !== 'string') return null;
  const label = input.value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  const hasControlCharacters = Array.from(label).some((character) => {
    const codePoint = character.codePointAt(0) || 0;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
  });
  if (!label || Array.from(label).length > 80 || hasControlCharacters) return null;
  const normalizedValue = normalizeTagName(label);
  if (!normalizedValue) return null;
  return { type: input.type as AssetDimensionType, value: label, normalizedValue };
}

router.get('/:id/asset-dimensions', authenticate, requirePermission('topic:view'), async (req, res) => {
  const topicId = positiveInteger(req.params.id);
  if (!topicId) return res.status(400).json({ message: '选题 ID 无效' });
  const topic = await getTopic(topicId);
  if (!topic) return res.status(404).json({ message: '选题不存在' });
  if (!canViewTopic(req.user, topic)) return res.status(403).json({ message: '无权查看该选题' });

  try {
    const data = await queryAll(`SELECT id, dimension_type AS type, value, created_by, created_at
      FROM topic_asset_dimensions WHERE topic_id = ? ORDER BY dimension_type, normalized_value, id`, [topicId]);
    return res.json({ data });
  } catch (error) {
    return sendSafeServerError(res, '读取选题维度失败', 'topic-assets:dimensions-read', error);
  }
});

router.post('/:id/asset-dimensions', authenticate, requirePermission('topic:update'), async (req, res) => {
  const topicId = positiveInteger(req.params.id);
  const dimension = parseAssetDimension(req.body);
  if (!topicId || !dimension) return res.status(400).json({ message: '维度类型或名称无效；名称需为 1–80 个字符' });
  const topic = await getTopic(topicId);
  if (!topic) return res.status(404).json({ message: '选题不存在' });
  if (!canEditTopic(req.user, topic)) return res.status(403).json({ message: '无权修改该选题' });
  const existing = await queryOne<{ id: number }>(
    'SELECT id FROM topic_asset_dimensions WHERE topic_id = ? AND dimension_type = ? AND normalized_value = ?',
    [topicId, dimension.type, dimension.normalizedValue],
  );
  if (existing) return res.status(409).json({ message: '该选题已登记此维度' });

  try {
    const id = await runInTransaction(async (tx) => {
      const dimensionId = await tx.executeInsert(`INSERT INTO topic_asset_dimensions(topic_id, dimension_type, value, normalized_value, created_by)
        VALUES (?, ?, ?, ?, ?)`, [topicId, dimension.type, dimension.value, dimension.normalizedValue, req.user!.id]);
      await tx.execute(`INSERT INTO topic_history(topic_id, action, comment, operator_id, created_at)
        VALUES (?, 'asset_dimension_added', ?, ?, datetime('now', '+8 hours'))`, [topicId, `${ASSET_DIMENSION_LABELS[dimension.type]}：${dimension.value}`, req.user!.id]);
      return dimensionId;
    });
    return res.status(201).json({ message: '维度已登记', id, data: { id, type: dimension.type, value: dimension.value } });
  } catch (error) {
    if (String(error).toLowerCase().includes('unique constraint')) return res.status(409).json({ message: '该选题已登记此维度' });
    return sendSafeServerError(res, '登记选题维度失败', 'topic-assets:dimensions-add', error);
  }
});

router.delete('/:topicId/asset-dimensions/:dimensionId', authenticate, requirePermission('topic:update'), async (req, res) => {
  const topicId = positiveInteger(req.params.topicId);
  const dimensionId = positiveInteger(req.params.dimensionId);
  if (!topicId || !dimensionId) return res.status(400).json({ message: '维度参数无效' });
  const topic = await getTopic(topicId);
  if (!topic) return res.status(404).json({ message: '选题不存在' });
  if (!canEditTopic(req.user, topic)) return res.status(403).json({ message: '无权修改该选题' });
  try {
    const removed = await runInTransaction(async (tx) => {
      const dimension = await tx.queryOne<{ dimension_type: string; value: string }>(
        'SELECT dimension_type, value FROM topic_asset_dimensions WHERE id = ? AND topic_id = ?',
        [dimensionId, topicId],
      );
      if (!dimension) return false;
      await tx.execute('DELETE FROM topic_asset_dimensions WHERE id = ? AND topic_id = ?', [dimensionId, topicId]);
      await tx.execute(`INSERT INTO topic_history(topic_id, action, comment, operator_id, created_at)
        VALUES (?, 'asset_dimension_removed', ?, ?, datetime('now', '+8 hours'))`, [topicId, `${ASSET_DIMENSION_LABELS[dimension.dimension_type as AssetDimensionType] || '内容维度'}：${dimension.value}`, req.user!.id]);
      return true;
    });
    if (!removed) return res.status(404).json({ message: '维度记录不存在' });
    return res.json({ message: '维度已移除' });
  } catch (error) {
    return sendSafeServerError(res, '移除选题维度失败', 'topic-assets:dimensions-remove', error);
  }
});

router.get('/:id/resources', noStoreResponse, authenticate, requirePermission('topic:view'), async (req, res) => {
  const topicId = positiveInteger(req.params.id);
  if (!topicId) return res.status(400).json({ message: '选题 ID 无效' });
  const topic = await getTopic(topicId);
  if (!topic) return res.status(404).json({ message: '选题不存在' });
  if (!canViewTopic(req.user, topic)) return res.status(403).json({ message: '无权查看该选题' });

  const canManageResources = await userHasPermission(req.user, 'resource:manage');
  const resources = await queryAll(`
    SELECT r.id, r.title, r.summary, r.library_type,
           CASE WHEN c.id IS NULL THEN NULL ELSE json_object('id', c.id, 'name', c.name, 'path', c.path) END AS category_json
    FROM resource_relations rr
    JOIN resources r ON r.id = rr.resource_id
    LEFT JOIN resource_categories c ON c.id = r.category_id
    WHERE rr.target_type = 'topic' AND rr.target_id = ? AND rr.relation_type = 'reference'
      AND r.status <> 'deleted' AND r.deleted_at IS NULL
      AND ${resourceScopePredicate('r')}
    ORDER BY rr.created_at DESC, rr.id DESC
  `, [topicId, ...resourceScopeArgs(req.user!.id, canManageResources)]);

  res.json({
    data: resources.map((resource) => ({
      ...resource,
      category: resource.category_json ? JSON.parse(String(resource.category_json)) : null,
      category_json: undefined,
    })),
  });
});

router.post('/:id/resources', authenticate, requireAllPermissions('topic:update', 'resource:view'), async (req, res) => {
  const topicId = positiveInteger(req.params.id);
  const resourceId = positiveInteger(req.body.resource_id);
  if (!topicId || !resourceId) return res.status(400).json({ message: '关联参数无效' });
  const topic = await getTopic(topicId);
  if (!topic) return res.status(404).json({ message: '选题不存在' });
  if (!canEditTopic(req.user, topic)) return res.status(403).json({ message: '无权修改该选题' });
  const resource = await getScopedResource(resourceId, req.user);
  if (!resource) return res.status(404).json({ message: '资料不存在或无权访问' });

  try {
    const relationId = await runInTransaction(async (tx) => {
      const id = await tx.executeInsert(`
        INSERT INTO resource_relations(resource_id, target_type, target_id, relation_type, created_by, created_at)
        VALUES (?, 'topic', ?, 'reference', ?, datetime('now', '+8 hours'))
      `, [resourceId, topicId, req.user!.id]);
      await recordResourceAuditInTransaction(tx, resourceId, req.user!.id, 'relation_add', {
        relation_id: id,
        target_type: 'topic',
        target_id: topicId,
        relation_type: 'reference',
      });
      return id;
    });
    return res.status(201).json({ message: '资料关联成功', id: relationId });
  } catch (error) {
    if (String(error).toLowerCase().includes('unique constraint')) return res.status(409).json({ message: '资料已关联' });
    return sendSafeServerError(res, '关联资料失败', 'topic-resources:add', error);
  }
});

router.delete('/:topicId/resources/:resourceId', authenticate, requirePermission('topic:update'), async (req, res) => {
  const topicId = positiveInteger(req.params.topicId);
  const resourceId = positiveInteger(req.params.resourceId);
  if (!topicId || !resourceId) return res.status(400).json({ message: '关联参数无效' });
  const topic = await getTopic(topicId);
  if (!topic) return res.status(404).json({ message: '选题不存在' });
  if (!canEditTopic(req.user, topic)) return res.status(403).json({ message: '无权修改该选题' });
  try {
    const relation = await runInTransaction(async (tx) => {
      const current = await tx.queryOne<{ id: number }>(`
        SELECT id FROM resource_relations
        WHERE resource_id = ? AND target_type = 'topic' AND target_id = ? AND relation_type = 'reference'
      `, [resourceId, topicId]);
      if (!current) return null;
      const removed = await tx.execute('DELETE FROM resource_relations WHERE id = ?', [current.id]);
      if (!removed) return null;
      await recordResourceAuditInTransaction(tx, resourceId, req.user!.id, 'relation_remove', {
        relation_id: current.id,
        target_type: 'topic',
        target_id: topicId,
        relation_type: 'reference',
      });
      return current;
    });
    if (!relation) return res.status(404).json({ message: '关联不存在' });
    return res.json({ message: '资料关联已解除' });
  } catch (error) {
    return sendSafeServerError(res, '解除资料关联失败', 'topic-resources:remove', error);
  }
});

export default router;
