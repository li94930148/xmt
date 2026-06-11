import express from 'express';
import { beijingNow, queryOne, queryAll, execute, executeInsert } from '../database/utils';
import { authenticate, requireRole } from '../middleware/auth';

const router = express.Router();

// GET / - 获取公告列表（pinned 排前面）
router.get('/', authenticate, async (req, res) => {
  try {
    const announcements = await queryAll(`
      SELECT a.*, u.name as creator_name
      FROM announcements a
      LEFT JOIN users u ON a.creator_id = u.id
      ORDER BY a.pinned DESC, a.created_at DESC
    `);

    res.json({ data: announcements });
  } catch (error) {
    res.status(500).json({ message: '获取公告列表失败', error });
  }
});

// POST / - 创建公告
router.post('/', authenticate, requireRole(['admin', 'director']), async (req, res) => {
  try {
    const { content, type, pinned } = req.body;
    const userId = req.user?.id;

    if (!content) {
      return res.status(400).json({ message: '公告内容不能为空' });
    }

    const announcementId = await executeInsert(
      `INSERT INTO announcements (content, type, pinned, creator_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [content, type || 'note', pinned ? 1 : 0, userId, beijingNow(), beijingNow()]
    );

    res.json({ message: '公告创建成功', id: announcementId });
  } catch (error) {
    res.status(500).json({ message: '创建公告失败', error });
  }
});

// PUT /:id - 更新公告
router.put('/:id', authenticate, requireRole(['admin', 'director']), async (req, res) => {
  try {
    const { id } = req.params;
    const { content, type, pinned } = req.body;

    const announcement = await queryOne(`SELECT * FROM announcements WHERE id = ?`, [id]);
    if (!announcement) {
      return res.status(404).json({ message: '公告不存在' });
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (content) { updates.push('content = ?'); params.push(content); }
    if (type) { updates.push('type = ?'); params.push(type); }
    if (pinned !== undefined) { updates.push('pinned = ?'); params.push(pinned ? 1 : 0); }

    if (updates.length === 0) {
      return res.status(400).json({ message: '没有需要更新的字段' });
    }

    updates.push("updated_at = datetime('now', '+8 hours')");
    params.push(id);

    await execute(`UPDATE announcements SET ${updates.join(', ')} WHERE id = ?`, params);

    res.json({ message: '公告更新成功' });
  } catch (error) {
    res.status(500).json({ message: '更新公告失败', error });
  }
});

// DELETE /:id - 删除公告
router.delete('/:id', authenticate, requireRole(['admin', 'director']), async (req, res) => {
  try {
    const { id } = req.params;

    const announcement = await queryOne(`SELECT * FROM announcements WHERE id = ?`, [id]);
    if (!announcement) {
      return res.status(404).json({ message: '公告不存在' });
    }

    await execute(`DELETE FROM announcements WHERE id = ?`, [id]);

    res.json({ message: '公告删除成功' });
  } catch (error) {
    res.status(500).json({ message: '删除公告失败', error });
  }
});

export default router;
