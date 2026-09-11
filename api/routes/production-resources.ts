import express from 'express';
import { queryAll, queryOne, runInTransaction } from '../database/utils';
import { authenticate } from '../middleware/auth';
import { requireAllPermissions, requirePermission } from '../middleware/permissions';
import { canEditProduction, canViewProduction } from '../utils/access';
import { getScopedResource, positiveInteger, resourceScopeArgs, resourceScopePredicate, userHasPermission } from '../services/resourceCenter';
import { MATERIAL_HTML_MAX_LENGTH, normalizeMaterialTitle, plainTextToSafeHtml, sanitizeRichText } from '../utils/sanitize-rich-text';

const router = express.Router();
const MAX_LIBRARY_MATERIALS_PER_REQUEST = 50;

type ProductionScope = { id: number; status: string; creator_id: number | null; assignee_id: number | null; participant_id: number | null };
type MaterialRow = {
  id: number; production_id: number; source_resource_id: number | null;
  material_type: 'library' | 'manual'; title: string; content_html: string;
  content_format: string; source_name: string; source_url: string | null;
  sort_order: number; revision: number; created_by: number | null;
  updated_by: number | null; creator_name: string | null; updater_name: string | null;
  created_at: string; updated_at: string;
};

async function getProductionScope(id: number) {
  return queryOne<ProductionScope>(`
    SELECT p.id, p.status, t.creator_id, t.assignee_id, p.operator_id AS participant_id
    FROM production p JOIN topics t ON t.id = p.topic_id WHERE p.id = ?
  `, [id]);
}

function mapMaterial(row: MaterialRow) {
  return {
    ...row,
    content_html: row.content_format === 'plain_text' ? plainTextToSafeHtml(row.content_html) : sanitizeRichText(row.content_html),
  };
}

async function listMaterials(productionId: number) {
  const rows = await queryAll<MaterialRow>(`
    SELECT pm.*, creator.name AS creator_name, updater.name AS updater_name
    FROM production_materials pm
    LEFT JOIN users creator ON creator.id = pm.created_by
    LEFT JOIN users updater ON updater.id = pm.updated_by
    WHERE pm.production_id = ?
    ORDER BY pm.sort_order ASC, pm.id ASC
  `, [productionId]);
  return rows.map(mapMaterial);
}

async function requireVisibleProduction(req: express.Request, res: express.Response) {
  const productionId = positiveInteger(req.params.id ?? req.params.productionId);
  if (!productionId) { res.status(400).json({ message: '创作 ID 无效' }); return null; }
  const production = await getProductionScope(productionId);
  if (!production) { res.status(404).json({ message: '创作记录不存在' }); return null; }
  if (!canViewProduction(req.user, production)) { res.status(403).json({ message: '无权查看该创作记录' }); return null; }
  return { productionId, production };
}

async function requireEditableProduction(req: express.Request, res: express.Response) {
  const access = await requireVisibleProduction(req, res);
  if (!access) return null;
  if (!canEditProduction(req.user, access.production)) { res.status(403).json({ message: '无权修改该创作记录' }); return null; }
  if (access.production.status === 'approved') { res.status(423).json({ message: '已通过审核的稿件为只读状态' }); return null; }
  return access;
}

router.get('/:id/materials', authenticate, requirePermission('production:view'), async (req, res) => {
  const access = await requireVisibleProduction(req, res);
  if (!access) return;
  return res.json({ data: await listMaterials(access.productionId) });
});

// Rolling-deploy compatibility for older clients that still render the
// title-only resource relation list.
router.get('/:id/resources', authenticate, requireAllPermissions('production:view', 'resource:view'), async (req, res) => {
  const access = await requireVisibleProduction(req, res);
  if (!access) return;
  const canManageResources = await userHasPermission(req.user, 'resource:manage');
  const rows = await queryAll(`
    SELECT r.id, r.title, r.summary, r.library_type,
           CASE WHEN c.id IS NULL THEN NULL ELSE json_object('id',c.id,'name',c.name,'path',c.path) END AS category_json
    FROM resource_relations rr JOIN resources r ON r.id=rr.resource_id
    LEFT JOIN resource_categories c ON c.id=r.category_id
    WHERE rr.target_type='production' AND rr.target_id=? AND rr.relation_type='reference'
      AND r.status<>'deleted' AND r.deleted_at IS NULL AND ${resourceScopePredicate('r')}
    ORDER BY rr.created_at DESC,rr.id DESC
  `, [access.productionId, ...resourceScopeArgs(req.user!.id, canManageResources)]);
  return res.json({ data: rows.map((row) => ({ ...row, category: row.category_json ? JSON.parse(String(row.category_json)) : null, category_json: undefined })) });
});

router.post('/:id/resources', authenticate, requireAllPermissions('production:update', 'resource:view'), async (req, res) => {
  const access = await requireEditableProduction(req, res);
  if (!access) return;
  const input: unknown[] = Array.isArray(req.body.resource_ids) ? req.body.resource_ids : [req.body.resource_id];
  const resourceIds: number[] = [...new Set(input.map(positiveInteger).filter((id): id is number => id !== null))];
  if (resourceIds.length === 0 || resourceIds.length > MAX_LIBRARY_MATERIALS_PER_REQUEST) {
    return res.status(400).json({ message: `资料 ID 无效或一次超过 ${MAX_LIBRARY_MATERIALS_PER_REQUEST} 条` });
  }

  const resources: Record<string, unknown>[] = [];
  for (const resourceId of resourceIds) {
    const resource = await getScopedResource(resourceId, req.user);
    if (!resource || resource.status === 'deleted' || resource.deleted_at) return res.status(404).json({ message: `资料 ${resourceId} 不存在或无权访问` });
    resources.push(resource);
  }

  const result = await runInTransaction(async (tx) => {
    const addedIds: number[] = [];
    const skippedIds: number[] = [];
    for (const resource of resources) {
      const resourceId = Number(resource.id);
      const duplicate = await tx.queryOne<{ id: number }>('SELECT id FROM production_materials WHERE production_id=? AND source_resource_id=?', [access.productionId, resourceId]);
      if (duplicate) { skippedIds.push(resourceId); continue; }
      await tx.execute(`INSERT OR IGNORE INTO resource_relations(resource_id,target_type,target_id,relation_type,created_by,created_at) VALUES(?,'production',?,'reference',?,datetime('now','+8 hours'))`, [resourceId, access.productionId, req.user!.id]);
      const sort = await tx.queryOne<{ next_sort: number }>('SELECT COALESCE(MAX(sort_order),-1)+1 AS next_sort FROM production_materials WHERE production_id=?', [access.productionId]);
      const materialId = await tx.executeInsert(`
        INSERT INTO production_materials(production_id,source_resource_id,material_type,title,content_html,content_format,source_name,source_url,sort_order,revision,created_by,updated_by,created_at,updated_at)
        VALUES(?,?,'library',?,?,'plain_text',?,?,?,1,?,?,datetime('now','+8 hours'),datetime('now','+8 hours'))
      `, [
        access.productionId, resourceId, normalizeMaterialTitle(resource.title ?? resource.name, ''), String(resource.content_text ?? ''),
        ({ project: '项目资料库', content_archive: '内容档案库', knowledge: '知识库', media: '素材归档库' } as Record<string, string>)[String(resource.library_type)] || '资料库',
        resource.source_uri ? String(resource.source_uri) : null, Number(sort?.next_sort || 0), req.user!.id, req.user!.id,
      ]);
      await tx.execute(`INSERT INTO resource_audit_logs(resource_id,user_id,action,detail_json,created_at) VALUES(?,?,'relation_add',?,datetime('now','+8 hours'))`, [resourceId, req.user!.id, JSON.stringify({ target_type: 'production', target_id: access.productionId, material_id: materialId })]);
      addedIds.push(materialId);
    }
    return { addedIds, skippedIds };
  });

  if (result.addedIds.length === 0) return res.status(409).json({ message: '所选资料均已添加', skipped_resource_ids: result.skippedIds });
  return res.status(201).json({ data: await listMaterials(access.productionId), skipped_resource_ids: result.skippedIds });
});

router.post('/:id/materials/manual', authenticate, requirePermission('production:update'), async (req, res) => {
  const access = await requireEditableProduction(req, res);
  if (!access) return;
  const rawHtml = String(req.body.content_html ?? '');
  if (rawHtml.length > MATERIAL_HTML_MAX_LENGTH) return res.status(413).json({ message: '资料正文过长' });
  const contentHtml = sanitizeRichText(rawHtml);
  if (!contentHtml) return res.status(400).json({ message: '资料正文不能为空' });
  const title = normalizeMaterialTitle(req.body.title, contentHtml);
  const materialId = await runInTransaction(async (tx) => {
    const sort = await tx.queryOne<{ next_sort: number }>('SELECT COALESCE(MAX(sort_order),-1)+1 AS next_sort FROM production_materials WHERE production_id=?', [access.productionId]);
    return tx.executeInsert(`INSERT INTO production_materials(production_id,material_type,title,content_html,content_format,source_name,sort_order,revision,created_by,updated_by,created_at,updated_at) VALUES(?,'manual',?,?,'html_v1','手动整理',?,1,?,?,datetime('now','+8 hours'),datetime('now','+8 hours'))`, [access.productionId, title, contentHtml, Number(sort?.next_sort || 0), req.user!.id, req.user!.id]);
  });
  const material = await queryOne<MaterialRow>(`SELECT pm.*,creator.name AS creator_name,updater.name AS updater_name FROM production_materials pm LEFT JOIN users creator ON creator.id=pm.created_by LEFT JOIN users updater ON updater.id=pm.updated_by WHERE pm.id=?`, [materialId]);
  return res.status(201).json({ data: material ? mapMaterial(material) : null });
});

router.put('/:productionId/materials/:materialId', authenticate, requirePermission('production:update'), async (req, res) => {
  const access = await requireEditableProduction(req, res);
  if (!access) return;
  const materialId = positiveInteger(req.params.materialId);
  const revision = positiveInteger(req.body.revision);
  if (!materialId || !revision) return res.status(400).json({ message: '资料 ID 或版本无效' });
  const existing = await queryOne<MaterialRow>('SELECT * FROM production_materials WHERE id=? AND production_id=?', [materialId, access.productionId]);
  if (!existing) return res.status(404).json({ message: '创作资料不存在' });
  const rawHtml = req.body.content_html === undefined ? existing.content_html : String(req.body.content_html);
  if (rawHtml.length > MATERIAL_HTML_MAX_LENGTH) return res.status(413).json({ message: '资料正文过长' });
  const contentHtml = req.body.content_html === undefined ? (existing.content_format === 'plain_text' ? plainTextToSafeHtml(existing.content_html) : sanitizeRichText(existing.content_html)) : sanitizeRichText(rawHtml);
  const title = req.body.title === undefined ? existing.title : normalizeMaterialTitle(req.body.title, contentHtml);
  const affected = await runInTransaction((tx) => tx.execute(`UPDATE production_materials SET title=?,content_html=?,content_format='html_v1',updated_by=?,updated_at=datetime('now','+8 hours'),revision=revision+1 WHERE id=? AND production_id=? AND revision=?`, [title, contentHtml, req.user!.id, materialId, access.productionId, revision]));
  if (affected === 0) return res.status(409).json({ message: '资料已被其他人更新，请刷新后重试' });
  const updated = await queryOne<MaterialRow>(`SELECT pm.*,creator.name AS creator_name,updater.name AS updater_name FROM production_materials pm LEFT JOIN users creator ON creator.id=pm.created_by LEFT JOIN users updater ON updater.id=pm.updated_by WHERE pm.id=?`, [materialId]);
  return res.json({ data: updated ? mapMaterial(updated) : null });
});

router.delete('/:productionId/materials/:materialId', authenticate, requirePermission('production:update'), async (req, res) => {
  const access = await requireEditableProduction(req, res);
  if (!access) return;
  const materialId = positiveInteger(req.params.materialId);
  if (!materialId) return res.status(400).json({ message: '资料 ID 无效' });
  const material = await queryOne<MaterialRow>('SELECT * FROM production_materials WHERE id=? AND production_id=?', [materialId, access.productionId]);
  if (!material) return res.status(404).json({ message: '创作资料不存在' });
  await runInTransaction(async (tx) => {
    await tx.execute('DELETE FROM production_materials WHERE id=? AND production_id=?', [materialId, access.productionId]);
    if (material.source_resource_id) {
      await tx.execute(`DELETE FROM resource_relations WHERE resource_id=? AND target_type='production' AND target_id=? AND relation_type='reference'`, [material.source_resource_id, access.productionId]);
      await tx.execute(`INSERT INTO resource_audit_logs(resource_id,user_id,action,detail_json,created_at) VALUES(?,?,'relation_remove',?,datetime('now','+8 hours'))`, [material.source_resource_id, req.user!.id, JSON.stringify({ target_type: 'production', target_id: access.productionId, material_id: material.id })]);
    }
  });
  return res.json({ message: '创作资料已从当前创作移除' });
});

router.delete('/:productionId/resources/:resourceId', authenticate, requirePermission('production:update'), async (req, res) => {
  const access = await requireEditableProduction(req, res);
  if (!access) return;
  const resourceId = positiveInteger(req.params.resourceId);
  if (!resourceId) return res.status(400).json({ message: '资料 ID 无效' });
  const material = await queryOne<MaterialRow>('SELECT * FROM production_materials WHERE production_id=? AND source_resource_id=?', [access.productionId, resourceId]);
  if (!material) return res.status(404).json({ message: '关联不存在' });
  await runInTransaction(async (tx) => {
    await tx.execute('DELETE FROM production_materials WHERE id=?', [material.id]);
    await tx.execute(`DELETE FROM resource_relations WHERE resource_id=? AND target_type='production' AND target_id=? AND relation_type='reference'`, [resourceId, access.productionId]);
    await tx.execute(`INSERT INTO resource_audit_logs(resource_id,user_id,action,detail_json,created_at) VALUES(?,?,'relation_remove',?,datetime('now','+8 hours'))`, [resourceId, req.user!.id, JSON.stringify({ target_type: 'production', target_id: access.productionId, material_id: material.id })]);
  });
  return res.json({ message: '资料关联已解除' });
});

export default router;
