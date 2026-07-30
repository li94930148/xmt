import express from 'express';
import { execute, executeInsert, queryAll, queryOne } from '../database/utils';
import { authenticate } from '../middleware/auth';
import { requireAllPermissions, requirePermission } from '../middleware/permissions';
import { canEditTopic, canViewTopic } from '../utils/access';
import { getScopedResource, positiveInteger, recordResourceAudit, resourceScopeArgs, resourceScopePredicate, userHasPermission } from '../services/resourceCenter';

const router = express.Router();

async function getTopic(id: number) {
  return queryOne<{ id: number; creator_id: number | null; assignee_id: number | null }>(
    'SELECT id, creator_id, assignee_id FROM topics WHERE id = ?',
    [id],
  );
}

router.get('/:id/resources', authenticate, requirePermission('topic:view'), async (req, res) => {
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
    const relationId = await executeInsert(`
      INSERT INTO resource_relations(resource_id, target_type, target_id, relation_type, created_by, created_at)
      VALUES (?, 'topic', ?, 'reference', ?, datetime('now', '+8 hours'))
    `, [resourceId, topicId, req.user!.id]);
    await recordResourceAudit(resourceId, req.user!.id, 'relation_add', {
      relation_id: relationId,
      target_type: 'topic',
      target_id: topicId,
      relation_type: 'reference',
    });
    return res.status(201).json({ message: '资料关联成功', id: relationId });
  } catch {
    return res.status(409).json({ message: '资料已关联' });
  }
});

router.delete('/:topicId/resources/:resourceId', authenticate, requirePermission('topic:update'), async (req, res) => {
  const topicId = positiveInteger(req.params.topicId);
  const resourceId = positiveInteger(req.params.resourceId);
  if (!topicId || !resourceId) return res.status(400).json({ message: '关联参数无效' });
  const topic = await getTopic(topicId);
  if (!topic) return res.status(404).json({ message: '选题不存在' });
  if (!canEditTopic(req.user, topic)) return res.status(403).json({ message: '无权修改该选题' });
  const relation = await queryOne<{ id: number }>(`
    SELECT id FROM resource_relations
    WHERE resource_id = ? AND target_type = 'topic' AND target_id = ? AND relation_type = 'reference'
  `, [resourceId, topicId]);
  if (!relation) return res.status(404).json({ message: '关联不存在' });
  await execute('DELETE FROM resource_relations WHERE id = ?', [relation.id]);
  await recordResourceAudit(resourceId, req.user!.id, 'relation_remove', {
    relation_id: relation.id,
    target_type: 'topic',
    target_id: topicId,
    relation_type: 'reference',
  });
  return res.json({ message: '资料关联已解除' });
});

export default router;
