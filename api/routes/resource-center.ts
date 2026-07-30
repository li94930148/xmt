import express from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { execute, executeInsert, queryAll, queryOne, runInTransaction } from '../database/utils';
import {
  RESOURCE_LIBRARY_TYPES,
  RESOURCE_TARGET_TABLES,
  RESOURCE_VISIBILITIES,
  attachTag,
  canModifyResource,
  createResourceRecord,
  getResourceTags,
  getScopedResource,
  nonNegativeInteger,
  normalizeTagName,
  positiveInteger,
  recordResourceAudit,
  resourceScopeArgs,
  resourceScopePredicate,
  userHasPermission,
  validateCategory,
  validateTarget,
} from '../services/resourceCenter';

const router = express.Router();
router.use(authenticate);

function isOneOf(value: unknown, allowed: readonly string[]) {
  return typeof value === 'string' && allowed.includes(value);
}

function cleanOptionalText(value: unknown) {
  if (value === undefined || value === null) return null;
  return String(value).trim() || null;
}

function parsePagination(query: Record<string, unknown>) {
  const page = Math.max(1, positiveInteger(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, positiveInteger(query.page_size) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

async function requireScopedResource(req: express.Request, res: express.Response) {
  const id = positiveInteger(req.params.id);
  if (!id) {
    res.status(400).json({ message: '资料 ID 无效' });
    return null;
  }
  const resource = await getScopedResource(id, req.user);
  if (!resource) {
    res.status(404).json({ message: '资料不存在或无权访问' });
    return null;
  }
  return resource;
}

router.get('/resources', requirePermission('resource:view'), async (req, res) => {
  try {
    const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
    const canManage = await userHasPermission(req.user, 'resource:manage');
    const where = [resourceScopePredicate('r')];
    const args: unknown[] = resourceScopeArgs(req.user!.id, canManage);

    const filters: Array<[unknown, string, (value: unknown) => unknown]> = [
      [req.query.library_type, 'r.library_type = ?', String],
      [req.query.category_id, 'r.category_id = ?', Number],
      [req.query.parent_id, 'r.parent_id = ?', Number],
      [req.query.status, 'r.status = ?', String],
      [req.query.visibility, 'r.visibility = ?', String],
      [req.query.owner_id, 'r.owner_id = ?', Number],
    ];
    for (const [value, clause, convert] of filters) {
      if (value !== undefined && value !== '') {
        where.push(clause);
        args.push(convert(value));
      }
    }
    if (req.query.tag) {
      where.push(`EXISTS (
        SELECT 1 FROM resource_tag_relations frt
        JOIN resource_tags ft ON ft.id = frt.tag_id
        WHERE frt.resource_id = r.id AND (ft.normalized_name = ? OR CAST(ft.id AS TEXT) = ?)
      )`);
      args.push(normalizeTagName(req.query.tag), String(req.query.tag));
    }
    if (req.query.keyword) {
      where.push(`r.id IN (SELECT rowid FROM resource_fts WHERE resource_fts MATCH ?)`);
      args.push(`"${String(req.query.keyword).replace(/"/g, '""')}"`);
    }

    const whereSql = where.join(' AND ');
    const totalRow = await queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM resources r WHERE ${whereSql}`, args);
    const rows = await queryAll<Record<string, unknown>>(`
      SELECT r.id, r.title, r.summary, r.library_type, r.visibility, r.status, r.created_at, r.updated_at,
             CASE WHEN c.id IS NULL THEN NULL ELSE json_object('id', c.id, 'name', c.name, 'path', c.path) END AS category_json,
             COALESCE((SELECT json_group_array(json_object('id', t.id, 'name', t.name))
                       FROM resource_tag_relations rt JOIN resource_tags t ON t.id = rt.tag_id
                       WHERE rt.resource_id = r.id), '[]') AS tags_json,
             (SELECT COUNT(*) FROM resource_files rf WHERE rf.resource_id = r.id) AS file_count,
             CASE WHEN owner.id IS NULL THEN NULL ELSE json_object('id', owner.id, 'name', owner.name, 'username', owner.username) END AS owner_json
      FROM resources r
      LEFT JOIN resource_categories c ON c.id = r.category_id
      LEFT JOIN users owner ON owner.id = COALESCE(r.owner_id, r.uploader_id)
      WHERE ${whereSql}
      ORDER BY r.updated_at DESC, r.id DESC
      LIMIT ? OFFSET ?
    `, [...args, pageSize, offset]);

    res.json({
      data: rows.map((row) => ({
        ...row,
        category: row.category_json ? JSON.parse(String(row.category_json)) : null,
        tags: JSON.parse(String(row.tags_json || '[]')),
        owner: row.owner_json ? JSON.parse(String(row.owner_json)) : null,
        category_json: undefined,
        tags_json: undefined,
        owner_json: undefined,
      })),
      pagination: { page, page_size: pageSize, total: Number(totalRow?.total || 0), total_pages: Math.ceil(Number(totalRow?.total || 0) / pageSize) },
    });
  } catch (error) {
    res.status(500).json({ message: '查询资料失败', error: error instanceof Error ? error.message : String(error) });
  }
});

router.get('/search', requirePermission('resource:view'), async (req, res) => {
  try {
    const keyword = cleanOptionalText(req.query.keyword);
    if (!keyword) return res.status(400).json({ message: 'keyword 不能为空' });
    const canManage = await userHasPermission(req.user, 'resource:manage');
    const where = [resourceScopePredicate('r'), `resource_fts MATCH ?`];
    const args: unknown[] = [...resourceScopeArgs(req.user!.id, canManage), `"${keyword.replace(/"/g, '""')}"`];
    if (req.query.library_type) { where.push('r.library_type = ?'); args.push(String(req.query.library_type)); }
    if (req.query.category_id) { where.push('r.category_id = ?'); args.push(Number(req.query.category_id)); }
    const rows = await queryAll(`
      SELECT r.id AS resource_id, r.title, r.summary, r.library_type,
             CASE WHEN c.id IS NULL THEN NULL ELSE json_object('id', c.id, 'name', c.name, 'path', c.path) END AS category_json,
             snippet(resource_fts, 2, '<mark>', '</mark>', '…', 24) AS snippet
      FROM resource_fts JOIN resources r ON r.id = resource_fts.rowid
      LEFT JOIN resource_categories c ON c.id = r.category_id
      WHERE ${where.join(' AND ')}
      ORDER BY bm25(resource_fts), r.updated_at DESC
      LIMIT 100
    `, args);
    res.json({
      data: rows.map((row) => ({
        ...row,
        category: row.category_json ? JSON.parse(String(row.category_json)) : null,
        category_json: undefined,
      })),
      total: rows.length,
    });
  } catch (error) {
    res.status(500).json({ message: '全文搜索失败', error: error instanceof Error ? error.message : String(error) });
  }
});

router.post('/resources', requirePermission('resource:create'), async (req, res) => {
  try {
    const title = cleanOptionalText(req.body.title);
    const libraryType = req.body.library_type;
    const visibility = req.body.visibility || 'team';
    const categoryId = req.body.category_id == null ? null : positiveInteger(req.body.category_id);
    if (!title || !isOneOf(libraryType, RESOURCE_LIBRARY_TYPES) || !isOneOf(visibility, RESOURCE_VISIBILITIES)) {
      return res.status(400).json({ message: 'title、library_type 或 visibility 无效' });
    }
    if (req.body.category_id != null && !categoryId) return res.status(400).json({ message: 'category_id 无效' });
    if (!await validateCategory(categoryId, libraryType)) return res.status(400).json({ message: '分类不存在或不属于当前资料库' });

    const resourceId = await createResourceRecord({
      title,
      summary: cleanOptionalText(req.body.summary),
      library_type: libraryType,
      category_id: categoryId,
      visibility,
      content_text: cleanOptionalText(req.body.content_text),
      source_type: cleanOptionalText(req.body.source_type) || 'manual',
      source_uri: cleanOptionalText(req.body.source_uri),
    }, req.user!.id);
    await recordResourceAudit(resourceId, req.user!.id, 'create', { title, library_type: libraryType, category_id: categoryId, visibility });
    res.status(201).json({ message: '资料创建成功', id: resourceId });
  } catch (error) {
    res.status(500).json({ message: '创建资料失败', error: error instanceof Error ? error.message : String(error) });
  }
});

router.get('/resources/:id', requirePermission('resource:view'), async (req, res) => {
  try {
    const resource = await requireScopedResource(req, res);
    if (!resource) return;
    const id = Number(resource.id);
    const [category, tags, files, relations, audit] = await Promise.all([
      resource.category_id ? queryOne(`SELECT id, library_type, parent_id, name, code, path FROM resource_categories WHERE id = ?`, [resource.category_id]) : null,
      getResourceTags(id),
      queryAll(`SELECT id, original_name, storage_key, mime_type, extension, size_bytes, sha256, is_primary, status, created_by, created_at FROM resource_files WHERE resource_id = ? ORDER BY is_primary DESC, id`, [id]),
      queryAll(`SELECT id, target_type, target_id, relation_type, created_by, created_at FROM resource_relations WHERE resource_id = ? ORDER BY id`, [id]),
      queryOne(`SELECT COUNT(*) AS total, MAX(created_at) AS last_at,
                       (SELECT action FROM resource_audit_logs WHERE resource_id = ? ORDER BY created_at DESC, id DESC LIMIT 1) AS last_action
                FROM resource_audit_logs WHERE resource_id = ?`, [id, id]),
    ]);
    res.json({ ...resource, category, tags, files, relations, versions: [], audit_summary: audit });
  } catch (error) {
    res.status(500).json({ message: '获取资料详情失败', error: error instanceof Error ? error.message : String(error) });
  }
});

router.get('/resources/:id/audit', requirePermission('resource:audit'), async (req, res) => {
  const resource = await requireScopedResource(req, res);
  if (!resource) return;
  const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
  const total = await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM resource_audit_logs WHERE resource_id=?', [resource.id]);
  const rows = await queryAll(`
    SELECT a.id,a.action,a.detail_json,a.created_at,
           CASE WHEN u.id IS NULL THEN NULL ELSE json_object('id',u.id,'name',u.name,'username',u.username) END AS user
    FROM resource_audit_logs a LEFT JOIN users u ON u.id=a.user_id
    WHERE a.resource_id=? ORDER BY a.created_at DESC,a.id DESC LIMIT ? OFFSET ?
  `,[resource.id,pageSize,offset]);
  res.json({ data: rows, pagination: { page, page_size: pageSize, total: Number(total?.total || 0) } });
});

router.put('/resources/:id', requirePermission('resource:update'), async (req, res) => {
  try {
    const resource = await requireScopedResource(req, res);
    if (!resource) return;
    if (!await canModifyResource(resource, req.user)) return res.status(403).json({ message: '无权修改该资料' });

    const updates: Record<string, unknown> = {};
    const allowed = ['title', 'summary', 'category_id', 'visibility', 'content_text'] as const;
    for (const field of allowed) if (Object.prototype.hasOwnProperty.call(req.body, field)) updates[field] = req.body[field];
    if (updates.title !== undefined && !cleanOptionalText(updates.title)) return res.status(400).json({ message: 'title 不能为空' });
    if (updates.visibility !== undefined && !isOneOf(updates.visibility, RESOURCE_VISIBILITIES)) return res.status(400).json({ message: 'visibility 无效' });
    const categoryId = updates.category_id === undefined ? undefined : updates.category_id == null ? null : positiveInteger(updates.category_id);
    if (updates.category_id != null && !categoryId) return res.status(400).json({ message: 'category_id 无效' });
    if (categoryId !== undefined && !await validateCategory(categoryId, String(resource.library_type))) return res.status(400).json({ message: '分类不存在或不属于当前资料库' });

    const assignments: string[] = [];
    const args: unknown[] = [];
    for (const field of allowed) {
      if (updates[field] === undefined) continue;
      assignments.push(`${field} = ?`);
      args.push(field === 'title' || field === 'summary' || field === 'content_text' ? cleanOptionalText(updates[field]) : field === 'category_id' ? categoryId : updates[field]);
      if (field === 'title') { assignments.push('name = ?'); args.push(cleanOptionalText(updates[field])); }
    }
    if (assignments.length === 0 && !Array.isArray(req.body.tag_ids)) return res.status(400).json({ message: '没有需要更新的字段' });
    const before = Object.fromEntries(allowed.map((field) => [field, resource[field]]));
    await runInTransaction(async (tx) => {
      if (assignments.length) {
        await tx.execute(`UPDATE resources SET ${assignments.join(', ')}, updated_by = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?`, [...args, req.user!.id, resource.id]);
      }
      if (Array.isArray(req.body.tag_ids)) {
        const tagIds = [...new Set(req.body.tag_ids.map(positiveInteger).filter(Boolean))] as number[];
        if (tagIds.length !== req.body.tag_ids.length) throw new Error('tag_ids 无效');
        if (tagIds.length) {
          const found = await tx.queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM resource_tags WHERE id IN (${tagIds.map(() => '?').join(',')})`, tagIds);
          if (Number(found?.count || 0) !== tagIds.length) throw new Error('标签不存在');
        }
        await tx.execute('DELETE FROM resource_tag_relations WHERE resource_id = ?', [resource.id]);
        for (const tagId of tagIds) await tx.execute(`INSERT INTO resource_tag_relations(resource_id, tag_id, created_by, created_at) VALUES (?, ?, ?, datetime('now', '+8 hours'))`, [resource.id, tagId, req.user!.id]);
      }
      await tx.execute(`INSERT INTO resource_audit_logs(resource_id,user_id,action,detail_json,created_at) VALUES(?,?, 'update', ?, datetime('now', '+8 hours'))`, [resource.id, req.user!.id, JSON.stringify({ before, changes: updates, tag_ids: req.body.tag_ids })]);
    });
    res.json({ message: '资料更新成功' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(message.includes('无效') || message.includes('不存在') ? 400 : 500).json({ message });
  }
});

router.delete('/resources/:id', requirePermission('resource:delete'), async (req, res) => {
  try {
    const resource = await requireScopedResource(req, res);
    if (!resource) return;
    if (!await canModifyResource(resource, req.user)) return res.status(403).json({ message: '无权删除该资料' });
    await execute(`UPDATE resources SET status='deleted', deleted_at=datetime('now','+8 hours'), updated_by=?, updated_at=datetime('now','+8 hours') WHERE id=?`, [req.user!.id, resource.id]);
    await recordResourceAudit(Number(resource.id), req.user!.id, 'delete', { previous_status: resource.status });
    res.json({ message: '资料已移入回收状态' });
  } catch (error) { res.status(500).json({ message: '删除资料失败', error: error instanceof Error ? error.message : String(error) }); }
});

router.post('/resources/:id/restore', requirePermission('resource:delete'), async (req, res) => {
  try {
    const resource = await requireScopedResource(req, res);
    if (!resource) return;
    if (!await canModifyResource(resource, req.user)) return res.status(403).json({ message: '无权恢复该资料' });
    await execute(`UPDATE resources SET status='published', deleted_at=NULL, updated_by=?, updated_at=datetime('now','+8 hours') WHERE id=?`, [req.user!.id, resource.id]);
    await recordResourceAudit(Number(resource.id), req.user!.id, 'restore', { previous_status: resource.status });
    res.json({ message: '资料已恢复' });
  } catch (error) { res.status(500).json({ message: '恢复资料失败', error: error instanceof Error ? error.message : String(error) }); }
});

router.get('/categories', requirePermission('resource:view'), async (req, res) => {
  const args: unknown[] = [];
  let where = '';
  if (req.query.library_type) { where = 'WHERE c.library_type = ?'; args.push(String(req.query.library_type)); }
  const rows = await queryAll(`SELECT c.*, (SELECT COUNT(*) FROM resources r WHERE r.category_id=c.id) AS resource_count FROM resource_categories c ${where} ORDER BY c.library_type,c.path,c.sort_order,c.id`, args);
  res.json({ data: rows });
});

router.post('/categories', requirePermission('resource:category_manage'), async (req, res) => {
  try {
    const name = cleanOptionalText(req.body.name);
    const libraryType = req.body.library_type;
    const parentId = req.body.parent_id == null ? null : positiveInteger(req.body.parent_id);
    if (!name || !isOneOf(libraryType, RESOURCE_LIBRARY_TYPES)) return res.status(400).json({ message: 'name 或 library_type 无效' });
    const parent = parentId ? await queryOne<Record<string, unknown>>('SELECT * FROM resource_categories WHERE id=?', [parentId]) : null;
    if (parentId && (!parent || parent.library_type !== libraryType)) return res.status(400).json({ message: '父分类不存在或资料库不一致' });
    const path = `${parent?.path || ''}/${name}`.replace(/^\/+/, '/');
    const id = await executeInsert(`INSERT INTO resource_categories(library_type,parent_id,name,code,path,sort_order,enabled,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,datetime('now','+8 hours'),datetime('now','+8 hours'))`, [libraryType,parentId,name,cleanOptionalText(req.body.code),path,nonNegativeInteger(req.body.sort_order) || 0,req.user!.id]);
    res.status(201).json({ message: '分类创建成功', id });
  } catch (error) { res.status(400).json({ message: '创建分类失败', error: error instanceof Error ? error.message : String(error) }); }
});

router.put('/categories/:id', requirePermission('resource:category_manage'), async (req, res) => {
  try {
    const id = positiveInteger(req.params.id);
    const current = id ? await queryOne<Record<string, unknown>>('SELECT * FROM resource_categories WHERE id=?', [id]) : null;
    if (!current) return res.status(404).json({ message: '分类不存在' });
    const name = cleanOptionalText(req.body.name) || String(current.name);
    const parentId = req.body.parent_id === undefined ? current.parent_id : req.body.parent_id == null ? null : positiveInteger(req.body.parent_id);
    if (Number(parentId) === id) return res.status(400).json({ message: '分类不能以自身为父级' });
    const parent = parentId ? await queryOne<Record<string, unknown>>('SELECT * FROM resource_categories WHERE id=?', [parentId]) : null;
    if (parentId && (!parent || parent.library_type !== current.library_type || String(parent.path).startsWith(`${current.path}/`))) return res.status(400).json({ message: '父分类无效或形成循环' });
    const path = `${parent?.path || ''}/${name}`.replace(/^\/+/, '/');
    await execute(`UPDATE resource_categories SET parent_id=?,name=?,code=?,path=?,sort_order=?,enabled=?,updated_at=datetime('now','+8 hours') WHERE id=?`, [parentId,name,req.body.code === undefined ? current.code : cleanOptionalText(req.body.code),path,req.body.sort_order === undefined ? current.sort_order : nonNegativeInteger(req.body.sort_order),req.body.enabled === undefined ? current.enabled : req.body.enabled ? 1 : 0,id]);
    res.json({ message: '分类更新成功' });
  } catch (error) { res.status(400).json({ message: '更新分类失败', error: error instanceof Error ? error.message : String(error) }); }
});

router.delete('/categories/:id', requirePermission('resource:category_manage'), async (req, res) => {
  const id = positiveInteger(req.params.id);
  if (!id) return res.status(400).json({ message: '分类 ID 无效' });
  const usage = await queryOne<{ resources: number; children: number }>(`SELECT (SELECT COUNT(*) FROM resources WHERE category_id=?) resources,(SELECT COUNT(*) FROM resource_categories WHERE parent_id=?) children`, [id,id]);
  if (Number(usage?.resources || 0) > 0) return res.status(409).json({ message: '分类下存在资料，禁止删除' });
  if (Number(usage?.children || 0) > 0) return res.status(409).json({ message: '分类下存在子分类，禁止删除' });
  const changed = await execute('DELETE FROM resource_categories WHERE id=?', [id]);
  res.status(changed ? 200 : 404).json({ message: changed ? '分类已删除' : '分类不存在' });
});

router.get('/tags', requirePermission('resource:view'), async (_req, res) => {
  res.json({ data: await queryAll(`SELECT t.*, (SELECT COUNT(*) FROM resource_tag_relations rt WHERE rt.tag_id=t.id) resource_count FROM resource_tags t ORDER BY t.name`) });
});

router.post('/tags', requirePermission('resource:category_manage'), async (req, res) => {
  const name = cleanOptionalText(req.body.name);
  const normalized = normalizeTagName(name);
  if (!name || !normalized) return res.status(400).json({ message: '标签名称不能为空' });
  try {
    const id = await executeInsert(`INSERT INTO resource_tags(name,normalized_name,created_by,created_at) VALUES(?,?,?,datetime('now','+8 hours'))`, [name,normalized,req.user!.id]);
    res.status(201).json({ message: '标签创建成功', id });
  } catch { res.status(409).json({ message: '标签已存在' }); }
});

router.delete('/tags/:id', requirePermission('resource:category_manage'), async (req, res) => {
  const id = positiveInteger(req.params.id);
  if (!id) return res.status(400).json({ message: '标签 ID 无效' });
  const changed = await execute('DELETE FROM resource_tags WHERE id=?', [id]);
  res.status(changed ? 200 : 404).json({ message: changed ? '标签已删除' : '标签不存在' });
});

router.post('/resources/:id/tags', requirePermission('resource:update'), async (req, res) => {
  const resource = await requireScopedResource(req, res); if (!resource) return;
  if (!await canModifyResource(resource, req.user)) return res.status(403).json({ message: '无权修改该资料' });
  const tagId = positiveInteger(req.body.tag_id);
  if (!tagId || !await queryOne('SELECT id FROM resource_tags WHERE id=?', [tagId])) return res.status(404).json({ message: '标签不存在' });
  await attachTag(Number(resource.id), tagId, req.user!.id);
  await recordResourceAudit(Number(resource.id), req.user!.id, 'update', { tag_add: tagId });
  res.status(201).json({ message: '标签绑定成功' });
});

router.delete('/resources/:id/tags/:tagId', requirePermission('resource:update'), async (req, res) => {
  const resource = await requireScopedResource(req, res); if (!resource) return;
  if (!await canModifyResource(resource, req.user)) return res.status(403).json({ message: '无权修改该资料' });
  const tagId = positiveInteger(req.params.tagId); if (!tagId) return res.status(400).json({ message: '标签 ID 无效' });
  await execute('DELETE FROM resource_tag_relations WHERE resource_id=? AND tag_id=?', [resource.id,tagId]);
  await recordResourceAudit(Number(resource.id), req.user!.id, 'update', { tag_remove: tagId });
  res.json({ message: '标签解绑成功' });
});

router.get('/resources/:id/relations', requirePermission('resource:view'), async (req, res) => {
  const resource = await requireScopedResource(req, res); if (!resource) return;
  res.json({ data: await queryAll('SELECT * FROM resource_relations WHERE resource_id=? ORDER BY id', [resource.id]) });
});

router.post('/resources/:id/relations', requirePermission('resource:update'), async (req, res) => {
  try {
    const resource = await requireScopedResource(req, res); if (!resource) return;
    if (!await canModifyResource(resource, req.user)) return res.status(403).json({ message: '无权修改该资料' });
    const targetType = String(req.body.target_type || ''); const targetId = positiveInteger(req.body.target_id); const relationType = cleanOptionalText(req.body.relation_type);
    if (!(targetType in RESOURCE_TARGET_TABLES) || !targetId || !relationType) return res.status(400).json({ message: '关联参数无效' });
    if (!await validateTarget(targetType,targetId)) return res.status(404).json({ message: '关联目标不存在' });
    const id = await executeInsert(`INSERT INTO resource_relations(resource_id,target_type,target_id,relation_type,created_by,created_at) VALUES(?,?,?,?,?,datetime('now','+8 hours'))`, [resource.id,targetType,targetId,relationType,req.user!.id]);
    await recordResourceAudit(Number(resource.id),req.user!.id,'relation_add',{ relation_id:id,target_type:targetType,target_id:targetId,relation_type:relationType });
    res.status(201).json({ message: '关联创建成功', id });
  } catch { res.status(409).json({ message: '关联已存在' }); }
});

router.delete('/resources/:id/relations/:relationId', requirePermission('resource:update'), async (req, res) => {
  const resource = await requireScopedResource(req, res); if (!resource) return;
  if (!await canModifyResource(resource, req.user)) return res.status(403).json({ message: '无权修改该资料' });
  const relationId = positiveInteger(req.params.relationId); if (!relationId) return res.status(400).json({ message: '关联 ID 无效' });
  const relation = await queryOne<Record<string,unknown>>('SELECT * FROM resource_relations WHERE id=? AND resource_id=?',[relationId,resource.id]);
  if (!relation) return res.status(404).json({ message: '关联不存在' });
  await execute('DELETE FROM resource_relations WHERE id=?',[relationId]);
  await recordResourceAudit(Number(resource.id),req.user!.id,'relation_remove',relation);
  res.json({ message: '关联已删除' });
});

router.get('/resources/:id/files', requirePermission('resource:view'), async (req, res) => {
  const resource = await requireScopedResource(req, res); if (!resource) return;
  res.json({ data: await queryAll('SELECT * FROM resource_files WHERE resource_id=? ORDER BY is_primary DESC,id',[resource.id]) });
});

router.post('/resources/:id/files', requirePermission('resource:update'), async (req, res) => {
  const resource = await requireScopedResource(req, res); if (!resource) return;
  if (!await canModifyResource(resource, req.user)) return res.status(403).json({ message: '无权修改该资料' });
  const originalName = cleanOptionalText(req.body.original_name); const storageKey = cleanOptionalText(req.body.storage_key); const size = req.body.size_bytes == null ? null : nonNegativeInteger(req.body.size_bytes);
  if (!originalName || !storageKey || (req.body.size_bytes != null && size == null)) return res.status(400).json({ message: '文件元数据无效' });
  const id = await executeInsert(`INSERT INTO resource_files(resource_id,original_name,storage_key,mime_type,extension,size_bytes,sha256,is_primary,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,datetime('now','+8 hours'))`,[resource.id,originalName,storageKey,cleanOptionalText(req.body.mime_type),cleanOptionalText(req.body.extension),size,cleanOptionalText(req.body.sha256),req.body.is_primary?1:0,cleanOptionalText(req.body.status)||'pending',req.user!.id]);
  await recordResourceAudit(Number(resource.id),req.user!.id,'update',{ file_metadata_add:id });
  res.status(201).json({ message: '文件元数据创建成功；当前阶段未上传文件内容', id });
});

router.delete('/files/:id', requirePermission('resource:update'), async (req, res) => {
  const fileId = positiveInteger(req.params.id); if (!fileId) return res.status(400).json({ message: '文件 ID 无效' });
  const file = await queryOne<Record<string,unknown>>('SELECT * FROM resource_files WHERE id=?',[fileId]); if (!file) return res.status(404).json({ message: '文件不存在' });
  const resource = await getScopedResource(Number(file.resource_id),req.user); if (!resource || !await canModifyResource(resource,req.user)) return res.status(403).json({ message: '无权删除该文件元数据' });
  await execute('DELETE FROM resource_files WHERE id=?',[fileId]);
  await recordResourceAudit(Number(resource.id),req.user!.id,'update',{ file_metadata_remove:fileId });
  res.json({ message: '文件元数据已删除；未执行物理文件操作' });
});

export default router;
