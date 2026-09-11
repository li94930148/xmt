import express from 'express';
import { queryOne, runInTransaction } from '../database/utils';
import { authenticate } from '../middleware/auth';
import { requireAllPermissions, requirePermission } from '../middleware/permissions';
import { canEditProduction, canViewProduction } from '../utils/access';
import { getScopedResource, positiveInteger } from '../services/resourceCenter';
import { MATERIAL_HTML_MAX_LENGTH, plainTextToSafeHtml, sanitizeRichText } from '../utils/sanitize-rich-text';

const router = express.Router();
const MAX_LIBRARY_MATERIALS_PER_REQUEST = 50;

type ProductionScope = {
  id: number;
  status: string;
  creator_id: number | null;
  assignee_id: number | null;
  participant_id: number | null;
};

type MaterialDraftRow = {
  production_id: number;
  content_html: string;
  revision: number;
  created_by: number | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
};

async function getProductionScope(id: number) {
  return queryOne<ProductionScope>(`
    SELECT p.id, p.status, t.creator_id, t.assignee_id, p.operator_id AS participant_id
    FROM production p JOIN topics t ON t.id = p.topic_id WHERE p.id = ?
  `, [id]);
}

async function requireVisibleProduction(req: express.Request, res: express.Response) {
  const productionId = positiveInteger(req.params.id);
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

function mapDraft(productionId: number, row: MaterialDraftRow | null) {
  return row ? { ...row, content_html: sanitizeRichText(row.content_html) } : {
    production_id: productionId,
    content_html: '',
    revision: 0,
    created_by: null,
    updated_by: null,
    created_at: null,
    updated_at: null,
  };
}

router.get('/:id/material-draft', authenticate, requirePermission('production:view'), async (req, res) => {
  const access = await requireVisibleProduction(req, res);
  if (!access) return;
  const draft = await queryOne<MaterialDraftRow>('SELECT * FROM production_material_drafts WHERE production_id=?', [access.productionId]);
  return res.json({ data: mapDraft(access.productionId, draft) });
});

router.put('/:id/material-draft', authenticate, requirePermission('production:update'), async (req, res) => {
  const access = await requireEditableProduction(req, res);
  if (!access) return;
  const revision = Number(req.body.revision);
  if (!Number.isInteger(revision) || revision < 0) return res.status(400).json({ message: '草稿版本无效' });
  const rawHtml = String(req.body.content_html ?? '');
  if (rawHtml.length > MATERIAL_HTML_MAX_LENGTH) return res.status(413).json({ message: '创作资料草稿过长' });
  const contentHtml = sanitizeRichText(rawHtml);

  const outcome = await runInTransaction(async (tx) => {
    const existing = await tx.queryOne<MaterialDraftRow>('SELECT * FROM production_material_drafts WHERE production_id=?', [access.productionId]);
    if (!existing) {
      if (revision !== 0) return 'conflict' as const;
      await tx.execute(`
        INSERT INTO production_material_drafts(
          production_id,content_html,revision,created_by,updated_by,created_at,updated_at
        ) VALUES(?,?,1,?,?,datetime('now','+8 hours'),datetime('now','+8 hours'))
      `, [access.productionId, contentHtml, req.user!.id, req.user!.id]);
      return 'saved' as const;
    }
    if (existing.revision !== revision) return 'conflict' as const;
    const affected = await tx.execute(`
      UPDATE production_material_drafts
      SET content_html=?,updated_by=?,updated_at=datetime('now','+8 hours'),revision=revision+1
      WHERE production_id=? AND revision=?
    `, [contentHtml, req.user!.id, access.productionId, revision]);
    return affected === 1 ? 'saved' as const : 'conflict' as const;
  });
  if (outcome === 'conflict') return res.status(409).json({ message: '创作资料草稿已被其他人更新，请刷新后重试' });
  const updated = await queryOne<MaterialDraftRow>('SELECT * FROM production_material_drafts WHERE production_id=?', [access.productionId]);
  return res.json({ data: mapDraft(access.productionId, updated) });
});

router.post('/:id/material-draft/resources', authenticate, requireAllPermissions('production:update', 'resource:view'), async (req, res) => {
  const access = await requireEditableProduction(req, res);
  if (!access) return;
  const input: unknown[] = Array.isArray(req.body.resource_ids) ? req.body.resource_ids : [];
  const resourceIds = input.map(positiveInteger);
  if (resourceIds.some((id) => id === null) || resourceIds.length === 0 || resourceIds.length > MAX_LIBRARY_MATERIALS_PER_REQUEST) {
    return res.status(400).json({ message: `资料 ID 无效或一次超过 ${MAX_LIBRARY_MATERIALS_PER_REQUEST} 条` });
  }

  const data: Array<{ resource_id: number; content_html: string }> = [];
  const emptyResourceIds: number[] = [];
  for (const resourceId of resourceIds as number[]) {
    const resource = await getScopedResource(resourceId, req.user);
    if (!resource || resource.status === 'deleted' || resource.deleted_at) {
      return res.status(404).json({ message: `资料 ${resourceId} 不存在或无权访问` });
    }
    const body = String(resource.content_text ?? '');
    if (!body.trim()) {
      emptyResourceIds.push(resourceId);
      continue;
    }
    data.push({ resource_id: resourceId, content_html: plainTextToSafeHtml(body) });
  }

  return res.json({
    data,
    empty_resource_ids: emptyResourceIds,
    message: data.length === 0 ? '该资料暂无可插入的正文内容。' : undefined,
  });
});

export default router;
