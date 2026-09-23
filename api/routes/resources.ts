﻿import express from 'express';
import { queryOne, queryAll, execute } from '../database/utils';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { canManageOwnedResource, isPrivilegedUser } from '../utils/access';
import { sendSafeServerError } from '../utils/response';

const router = express.Router();

router.use((_, res, next) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Link', '</api/resource-center/resources>; rel="successor-version"');
  next();
});

const legacyWriteRetired = (_req: express.Request, res: express.Response) => res.status(410).json({
  message: '旧资料写入接口已停用，请使用资料中心',
  successor: '/api/resource-center/resources',
});

router.get('/', authenticate, async (req, res) => {
  try {
    const { category, page = 1, limit = 20 } = req.query;
    
    let query = `SELECT r.id, r.name, r.type, r.file_path, r.category, r.content, r.uploader_id, r.created_at, r.updated_at, u.name as uploader_name FROM resources r 
                 LEFT JOIN users u ON r.uploader_id = u.id WHERE 1=1`;
    const params: unknown[] = [];
    
    if (category) {
      query += ` AND r.category = ?`;
      params.push(category);
    }

    if (!isPrivilegedUser(req.user)) {
      query += ` AND r.uploader_id = ?`;
      params.push(req.user?.id);
    }
    
    const countResult = await queryOne(`SELECT COUNT(*) as total FROM (${query}) as temp`, params);
    query += ` ORDER BY r.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit as string), (parseInt(page as string) - 1) * parseInt(limit as string));
    const resources = await queryAll(query, params);
    
    res.json({
      data: resources,
      total: countResult?.total || 0,
      page: parseInt(page as string),
      limit: parseInt(limit as string)
    });
  } catch (error) {
    sendSafeServerError(res, '获取资源列表失败', 'resources:list', error);
  }
});

// 获取归档列表（已完成的选题）
router.get('/archives', authenticate, async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    
    let query = `SELECT r.id, r.name, r.file_path, r.content, r.created_at, r.updated_at, u.name as uploader_name 
                 FROM resources r LEFT JOIN users u ON r.uploader_id = u.id 
                 WHERE r.category = '已完成'`;
    const params: unknown[] = [];
    
    if (search) {
      query += ` AND r.name LIKE ?`;
      params.push(`%${search}%`);
    }

    if (!isPrivilegedUser(req.user)) {
      query += ` AND r.uploader_id = ?`;
      params.push(req.user?.id);
    }
    
    const countResult = await queryOne(`SELECT COUNT(*) as total FROM (${query})`, params);
    
    query += ` ORDER BY r.updated_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit as string), (parseInt(page as string) - 1) * parseInt(limit as string));
    
    const archives = await queryAll(query, params);
    
    const data = archives.map((a: Record<string, unknown>) => {
      let summary: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(String(a.content || '{}'));
        summary = {
          platform: parsed.topic?.platform || '',
          scriptVersion: parsed.script?.version || '',
          shootingCommentCount: parsed.shooting?.comments?.length || 0,
          publishedAt: parsed.publishing?.publish_time || '',
          views: parsed.analytics?.views || 0,
          likes: parsed.analytics?.likes || 0,
          archived_at: parsed.archived_at || ''
        };
      } catch { /* 忽略解析错误 */ }
      
      return {
        id: a.id,
        name: a.name,
        file_path: a.file_path,
        uploader_name: a.uploader_name,
        created_at: a.created_at,
        updated_at: a.updated_at,
        ...summary
      };
    });
    
    res.json({ data, total: countResult?.total || 0, page: parseInt(page as string), limit: parseInt(limit as string) });
  } catch (error) {
    sendSafeServerError(res, '获取归档列表失败', 'resources:archive-list', error);
  }
});

// 获取归档详情
router.get('/archives/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    const resource = await queryOne(`SELECT r.*, u.name as uploader_name FROM resources r LEFT JOIN users u ON r.uploader_id = u.id WHERE r.id = ? AND r.category = '已完成'`, [id]);
    if (!resource) {
      return res.status(404).json({ message: '归档不存在' });
    }
    if (!canManageOwnedResource(req.user, resource as Record<string, unknown>)) {
      return res.status(403).json({ message: '无权限查看该归档' });
    }
    
    const record = resource as Record<string, unknown>;
    let archiveData = {};
    try {
      archiveData = JSON.parse(String(record.content || '{}'));
    } catch { /* 忽略 */ }
    
    res.json({
      id: record.id,
      name: record.name,
      file_path: record.file_path,
      uploader_name: record.uploader_name,
      created_at: record.created_at,
      updated_at: record.updated_at,
      archive: archiveData
    });
  } catch (error) {
    sendSafeServerError(res, '获取归档详情失败', 'resources:archive-detail', error);
  }
});

router.delete('/archives/:id', authenticate, requirePermission('resource:delete'), async (req, res) => {
  try {
    const resource = await queryOne('SELECT * FROM resources WHERE id = ? AND category = ?', [req.params.id, '已完成']);
    if (!resource) return res.status(404).json({ message: '归档不存在' });
    if (!canManageOwnedResource(req.user, resource as Record<string, unknown>)) {
      return res.status(403).json({ message: '无权限删除该归档' });
    }
    await execute('DELETE FROM resources WHERE id = ?', [req.params.id]);
    return res.json({ message: '归档删除成功' });
  } catch (error) {
    return sendSafeServerError(res, '删除归档失败', 'resources:archive-delete', error);
  }
});

router.get('/categories', authenticate, async (req, res) => {
  try {
    const categories = await queryAll(
      `SELECT DISTINCT category FROM resources WHERE category IS NOT NULL${isPrivilegedUser(req.user) ? '' : ' AND uploader_id = ?'}`,
      isPrivilegedUser(req.user) ? [] : [req.user?.id],
    );
    
    res.json(categories.map((c) => c.category));
  } catch (error) {
    sendSafeServerError(res, '获取分类列表失败', 'resources:categories', error);
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    const resource = await queryOne(`SELECT r.id, r.name, r.type, r.file_path, r.category, r.content, r.uploader_id, r.created_at, r.updated_at, u.name as uploader_name FROM resources r 
                           LEFT JOIN users u ON r.uploader_id = u.id WHERE r.id = ?`, [id]);
    
    if (!resource) {
      return res.status(404).json({ message: '资源不存在' });
    }
    if (!canManageOwnedResource(req.user, resource as Record<string, unknown>)) {
      return res.status(403).json({ message: '无权限查看该资源' });
    }
    
    res.json(resource);
  } catch (error) {
    sendSafeServerError(res, '获取资源详情失败', 'resources:detail', error);
  }
});

router.post('/', authenticate, requirePermission('resource:create'), legacyWriteRetired);

router.put('/:id', authenticate, requirePermission('resource:update'), legacyWriteRetired);

router.delete('/:id', authenticate, requirePermission('resource:delete'), legacyWriteRetired);

export default router;
