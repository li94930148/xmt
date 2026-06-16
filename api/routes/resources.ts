﻿import express from 'express';
import { queryOne, queryAll, execute, executeInsert } from '../database/utils';
import { authenticate } from '../middleware/auth';
import { canManageOwnedResource, isPrivilegedUser } from '../utils/access';

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const { category, page = 1, limit = 20 } = req.query;
    
    let query = `SELECT r.id, r.name, r.type, r.file_path, r.category, r.content, r.uploader_id, r.created_at, r.updated_at, u.name as uploader_name FROM resources r 
                 LEFT JOIN users u ON r.uploader_id = u.id WHERE 1=1`;
    const params: any[] = [];
    
    if (category) {
      query += ` AND r.category = ?`;
      params.push(category);
    }

    if (!isPrivilegedUser(req.user)) {
      query += ` AND r.uploader_id = ?`;
      params.push(req.user?.id);
    }
    
    query += ` ORDER BY r.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit as string), (parseInt(page as string) - 1) * parseInt(limit as string));
    
    const resources = await queryAll(query, params);
    
    const countQuery = query.replace(/ORDER BY.*$/, '');
    const countResult = await queryOne(`SELECT COUNT(*) as total FROM (${countQuery}) as temp`, params.slice(0, -2));
    
    res.json({
      data: resources,
      total: countResult?.total || 0,
      page: parseInt(page as string),
      limit: parseInt(limit as string)
    });
  } catch (error) {
    res.status(500).json({ message: '获取资源列表失败', error });
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
    res.status(500).json({ message: '获取归档列表失败', error });
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
    res.status(500).json({ message: '获取归档详情失败', error });
  }
});

router.get('/categories', authenticate, async (req, res) => {
  try {
    const categories = await queryAll(
      `SELECT DISTINCT category FROM resources WHERE category IS NOT NULL${isPrivilegedUser(req.user) ? '' : ' AND uploader_id = ?'}`,
      isPrivilegedUser(req.user) ? [] : [req.user?.id],
    );
    
    res.json(categories.map((c: any) => c.category));
  } catch (error) {
    res.status(500).json({ message: '获取分类列表失败', error });
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
    res.status(500).json({ message: '获取资源详情失败', error });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, type, file_path, category, content } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: '资源名称不能为空' });
    }
    
    const resourceId = await executeInsert(`INSERT INTO resources (name, type, file_path, category, content, uploader_id) 
            VALUES (?, ?, ?, ?, ?, ?)`, [name, type, file_path, category, content, req.user?.id]);
    
    res.json({ message: '资源上传成功', resourceId });
  } catch (error) {
    res.status(500).json({ message: '上传资源失败', error });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, file_path, category, content } = req.body;
    
    const resource = await queryOne(`SELECT * FROM resources WHERE id = ?`, [id]);
    if (!resource) {
      return res.status(404).json({ message: '资源不存在' });
    }
    if (!canManageOwnedResource(req.user, resource as Record<string, unknown>)) {
      return res.status(403).json({ message: '无权限修改该资源' });
    }
    
    const updateFields: string[] = [];
    const params: any[] = [];
    
    if (name !== undefined) { updateFields.push('name = ?'); params.push(name); }
    if (type !== undefined) { updateFields.push('type = ?'); params.push(type); }
    if (file_path !== undefined) { updateFields.push('file_path = ?'); params.push(file_path); }
    if (category !== undefined) { updateFields.push('category = ?'); params.push(category); }
    if (content !== undefined) { updateFields.push('content = ?'); params.push(content); }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ message: '没有需要更新的字段' });
    }
    
    params.push(id);
    
    await execute(`UPDATE resources SET ${updateFields.join(', ')}, updated_at = datetime('now', '+8 hours') WHERE id = ?`, params);
    
    res.json({ message: '资源更新成功' });
  } catch (error) {
    res.status(500).json({ message: '更新资源失败', error });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    const resource = await queryOne(`SELECT * FROM resources WHERE id = ?`, [id]);
    if (!resource) {
      return res.status(404).json({ message: '资源不存在' });
    }
    if (!canManageOwnedResource(req.user, resource as Record<string, unknown>)) {
      return res.status(403).json({ message: '无权限删除该资源' });
    }
    
    await execute(`DELETE FROM resources WHERE id = ?`, [id]);
    
    res.json({ message: '资源删除成功' });
  } catch (error) {
    res.status(500).json({ message: '删除资源失败', error });
  }
});

export default router;
