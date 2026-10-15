import express from 'express';
import { queryOne, queryAll, execute, runInTransaction } from '../database/utils';
import { authenticate } from '../middleware/auth';
import { localizeMessage } from '../utils/messageLocalization';

const router = express.Router();

function parsePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== 'string' && typeof value !== 'number') return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// 获取消息列表（支持类型筛选）
router.get('/', authenticate, async (req, res) => {
  try {
    const page = parsePositiveInteger(req.query.page, 1);
    const limit = Math.min(parsePositiveInteger(req.query.limit, 20), 100);
    const { type, read: readFilter, link: linkFilter } = req.query;
    const userId = req.user?.id;
    
    let query = `SELECT * FROM messages WHERE user_id = ?`;
    const params: unknown[] = [userId];
    
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

    // 按是否关联站内业务页面筛选，和消息中心的“待处理/系统”口径一致。
    if (linkFilter === 'present') {
      query += ` AND link IS NOT NULL AND link <> ''`;
    } else if (linkFilter === 'absent') {
      query += ` AND (link IS NULL OR link = '')`;
    }
    
    // 计算总数
    const countResult = await queryOne(`SELECT COUNT(*) as total FROM (${query})`, params);

    // 汇总卡片不随当前筛选或分页变化，且始终限制在当前用户范围内。
    const summaryResult = await queryOne<{ total: number; unread: number; actionable: number }>(
      `SELECT
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN read = 0 THEN 1 ELSE 0 END), 0) AS unread,
        COALESCE(SUM(CASE WHEN read = 0 AND link IS NOT NULL AND link <> '' THEN 1 ELSE 0 END), 0) AS actionable
       FROM messages WHERE user_id = ?`,
      [userId],
    );
    
    query += ` ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`;
    params.push(limit, (page - 1) * limit);
    
    const messages = (await queryAll(query, params)).map(localizeMessage);
    
    res.json({
      data: messages,
      total: Number(countResult?.total || 0),
      page,
      limit,
      summary: {
        total: Number(summaryResult?.total || 0),
        unread: Number(summaryResult?.unread || 0),
        actionable: Number(summaryResult?.actionable || 0),
      },
    });
  } catch {
    res.status(500).json({ message: '获取消息列表失败' });
  }
});

// 获取未读消息数
router.get('/unread', authenticate, async (req, res) => {
  try {
    const countResult = await queryOne(`SELECT COUNT(*) as count FROM messages WHERE user_id = ? AND read = 0`, [req.user?.id]);
    res.json({ unreadCount: countResult?.count || 0 });
  } catch {
    res.status(500).json({ message: '获取未读消息数失败' });
  }
});

// 标记单条消息为已读
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await execute(`UPDATE messages SET read = 1 WHERE id = ? AND user_id = ?`, [id, req.user?.id]);
    if (updated === 0) {
      return res.status(404).json({ message: '消息不存在' });
    }
    res.json({ message: '消息已标记为已读' });
  } catch {
    res.status(500).json({ message: '更新消息状态失败' });
  }
});

// 批量标记已读
router.post('/read-all', authenticate, async (req, res) => {
  try {
    const body = req.body === undefined ? {} : req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ message: '批量已读参数格式不正确' });
    }
    const hasIds = Object.prototype.hasOwnProperty.call(body, 'ids');
    const { ids } = body;

    if (hasIds && !Array.isArray(ids)) {
      return res.status(400).json({ message: '消息ID列表格式不正确' });
    }

    if (Array.isArray(ids) && ids.length > 0) {
      if (ids.some((id: unknown) => typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0)) {
        return res.status(400).json({ message: '消息ID必须为正整数' });
      }

      const uniqueIds = [...new Set(ids as number[])];
      const result = await runInTransaction(async (tx) => {
        const placeholders = uniqueIds.map(() => '?').join(',');
        const owned = await tx.queryAll<{ id: number }>(
          `SELECT id FROM messages WHERE id IN (${placeholders}) AND user_id = ?`,
          [...uniqueIds, req.user!.id],
        );
        const updatedCount = await tx.execute(
          `UPDATE messages SET read = 1 WHERE id IN (${placeholders}) AND user_id = ? AND read = 0`,
          [...uniqueIds, req.user!.id],
        );
        return { matchedCount: owned.length, updatedCount };
      });

      res.json({
        message: `已确认 ${result.matchedCount} 条消息为已读`,
        requestedCount: ids.length,
        distinctCount: uniqueIds.length,
        matchedCount: result.matchedCount,
        updatedCount: result.updatedCount,
        ignoredCount: uniqueIds.length - result.matchedCount,
      });
    } else {
      const updatedCount = await runInTransaction((tx) =>
        tx.execute(`UPDATE messages SET read = 1 WHERE user_id = ? AND read = 0`, [req.user!.id]),
      );
      res.json({ message: '所有消息已标记为已读', updatedCount });
    }
  } catch {
    res.status(500).json({ message: '批量标记失败' });
  }
});

// 清空消息
router.delete('/', authenticate, async (req, res) => {
  try {
    await execute(`DELETE FROM messages WHERE user_id = ?`, [req.user?.id]);
    res.json({ message: '消息已清空' });
  } catch {
    res.status(500).json({ message: '清空消息失败' });
  }
});

export default router;
