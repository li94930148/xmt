import express from 'express';
import { queryOne, queryAll, execute } from '../database/utils';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// 获取消息列表（支持类型筛选）
router.get('/', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20, type, read: readFilter } = req.query;
    
    let query = `SELECT * FROM messages WHERE user_id = ?`;
    const params: unknown[] = [req.user?.id];
    
    // 按类型筛选
    if (type && type !== 'all') {
      query += ` AND type = ?`;
      params.push(type);
    }
    
    // 按已读状态筛选
    if (readFilter === 'unread') {
      query += ` AND read = 0`;
    } else if (readFilter === 'read') {
      query += ` AND read = 1`;
    }
    
    // 计算总数
    const countResult = await queryOne(`SELECT COUNT(*) as total FROM (${query})`, params);
    
    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit as string), (parseInt(page as string) - 1) * parseInt(limit as string));
    
    const messages = await queryAll(query, params);
    
    res.json({
      data: messages,
      total: countResult?.total || 0,
      page: parseInt(page as string),
      limit: parseInt(limit as string)
    });
  } catch (error) {
    res.status(500).json({ message: '获取消息列表失败', error });
  }
});

// 获取未读消息数
router.get('/unread', authenticate, async (req, res) => {
  try {
    const countResult = await queryOne(`SELECT COUNT(*) as count FROM messages WHERE user_id = ? AND read = 0`, [req.user?.id]);
    res.json({ unreadCount: countResult?.count || 0 });
  } catch (error) {
    res.status(500).json({ message: '获取未读消息数失败', error });
  }
});

// 标记单条消息为已读
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const message = await queryOne(`SELECT * FROM messages WHERE id = ? AND user_id = ?`, [id, req.user?.id]);
    if (!message) {
      return res.status(404).json({ message: '消息不存在' });
    }
    await execute(`UPDATE messages SET read = 1 WHERE id = ?`, [id]);
    res.json({ message: '消息已标记为已读' });
  } catch (error) {
    res.status(500).json({ message: '更新消息状态失败', error });
  }
});

// 批量标记已读
router.post('/read-all', authenticate, async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (Array.isArray(ids) && ids.length > 0) {
      // 标记指定消息为已读
      const placeholders = ids.map(() => '?').join(',');
      await execute(
        `UPDATE messages SET read = 1 WHERE id IN (${placeholders}) AND user_id = ?`,
        [...ids, req.user?.id]
      );
      res.json({ message: `已标记 ${ids.length} 条消息为已读` });
    } else {
      // 标记所有消息为已读
      await execute(`UPDATE messages SET read = 1 WHERE user_id = ? AND read = 0`, [req.user?.id]);
      res.json({ message: '所有消息已标记为已读' });
    }
  } catch (error) {
    res.status(500).json({ message: '批量标记失败', error });
  }
});

// 清空消息
router.delete('/', authenticate, async (req, res) => {
  try {
    await execute(`DELETE FROM messages WHERE user_id = ?`, [req.user?.id]);
    res.json({ message: '消息已清空' });
  } catch (error) {
    res.status(500).json({ message: '清空消息失败', error });
  }
});

export default router;
