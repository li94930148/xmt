import express from 'express';
import { execute, executeInsert, queryAll, queryOne } from '../database/utils';
import { authenticate } from '../middleware/auth';
import { requireAllPermissions, requirePermission } from '../middleware/permissions';
import { canEditProduction, canViewProduction } from '../utils/access';
import { getScopedResource, positiveInteger, recordResourceAudit, resourceScopeArgs, resourceScopePredicate, userHasPermission } from '../services/resourceCenter';

const router = express.Router();

async function getProductionScope(id: number) {
  return queryOne<{ id: number; creator_id: number | null; assignee_id: number | null; participant_id: number | null }>(`
    SELECT p.id, t.creator_id, t.assignee_id, p.operator_id AS participant_id
    FROM production p JOIN topics t ON t.id = p.topic_id WHERE p.id = ?
  `, [id]);
}

router.get('/:id/resources', authenticate, requireAllPermissions('production:view', 'resource:view'), async (req, res) => {
  const productionId = positiveInteger(req.params.id);
  if (!productionId) return res.status(400).json({ message: '创作 ID 无效' });
  const production = await getProductionScope(productionId);
  if (!production) return res.status(404).json({ message: '创作记录不存在' });
  if (!canViewProduction(req.user, production)) return res.status(403).json({ message: '无权查看该创作记录' });
  const canManageResources = await userHasPermission(req.user, 'resource:manage');
  const rows = await queryAll(`
    SELECT r.id, r.title, r.summary, r.library_type,
           CASE WHEN c.id IS NULL THEN NULL ELSE json_object('id', c.id, 'name', c.name, 'path', c.path) END AS category_json
    FROM resource_relations rr
    JOIN resources r ON r.id = rr.resource_id
    LEFT JOIN resource_categories c ON c.id = r.category_id
    WHERE rr.target_type = 'production' AND rr.target_id = ? AND rr.relation_type = 'reference'
      AND r.status <> 'deleted' AND r.deleted_at IS NULL AND ${resourceScopePredicate('r')}
    ORDER BY rr.created_at DESC, rr.id DESC
  `, [productionId, ...resourceScopeArgs(req.user!.id, canManageResources)]);
  return res.json({ data: rows.map((row) => ({ ...row, category: row.category_json ? JSON.parse(String(row.category_json)) : null, category_json: undefined })) });
});

router.post('/:id/resources', authenticate, requireAllPermissions('production:update', 'resource:view'), async (req, res) => {
  const productionId = positiveInteger(req.params.id);
  const resourceId = positiveInteger(req.body.resource_id);
  if (!productionId || !resourceId) return res.status(400).json({ message: '关联参数无效' });
  const production = await getProductionScope(productionId);
  if (!production) return res.status(404).json({ message: '创作记录不存在' });
  if (!canEditProduction(req.user, production)) return res.status(403).json({ message: '无权修改该创作记录' });
  const resource = await getScopedResource(resourceId, req.user);
  if (!resource) return res.status(404).json({ message: '资料不存在或无权访问' });
  try {
    const relationId = await executeInsert(`INSERT INTO resource_relations(resource_id,target_type,target_id,relation_type,created_by,created_at) VALUES(?,'production',?,'reference',?,datetime('now','+8 hours'))`, [resourceId, productionId, req.user!.id]);
    await recordResourceAudit(resourceId, req.user!.id, 'relation_add', { relation_id: relationId, target_type: 'production', target_id: productionId, relation_type: 'reference' });
    return res.status(201).json({ message: '资料关联成功', id: relationId });
  } catch {
    return res.status(409).json({ message: '资料已关联' });
  }
});

router.delete('/:productionId/resources/:resourceId', authenticate, requirePermission('production:update'), async (req, res) => {
  const productionId = positiveInteger(req.params.productionId);
  const resourceId = positiveInteger(req.params.resourceId);
  if (!productionId || !resourceId) return res.status(400).json({ message: '关联参数无效' });
  const production = await getProductionScope(productionId);
  if (!production) return res.status(404).json({ message: '创作记录不存在' });
  if (!canEditProduction(req.user, production)) return res.status(403).json({ message: '无权修改该创作记录' });
  const relation = await queryOne<{ id: number }>(`SELECT id FROM resource_relations WHERE resource_id=? AND target_type='production' AND target_id=? AND relation_type='reference'`, [resourceId, productionId]);
  if (!relation) return res.status(404).json({ message: '关联不存在' });
  await execute('DELETE FROM resource_relations WHERE id=?', [relation.id]);
  await recordResourceAudit(resourceId, req.user!.id, 'relation_remove', { relation_id: relation.id, target_type: 'production', target_id: productionId, relation_type: 'reference' });
  return res.json({ message: '资料关联已解除' });
});

export default router;
