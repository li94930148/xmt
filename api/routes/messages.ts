import express from 'express';
import { queryOne, queryAll, execute, runInTransaction, beijingNow } from '../database/utils';
import { authenticate } from '../middleware/auth';
import { localizeMessage } from '../utils/messageLocalization';

const router = express.Router();
const MESSAGE_CLEAR_REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidMessageClearRequestId(value: unknown): value is string {
  return typeof value === 'string' && MESSAGE_CLEAR_REQUEST_ID_PATTERN.test(value);
}

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

    const hasClientRequestId = Object.prototype.hasOwnProperty.call(body, 'client_request_id');
    const clientRequestId = (body as { client_request_id?: unknown }).client_request_id;
    if (hasClientRequestId && !isValidMessageClearRequestId(clientRequestId)) {
      return res.status(400).json({ message: '批量已读请求编号格式不正确' });
    }

    // Request-key replay is intentionally scoped to the account-wide operation.
    // Selected-ID requests keep their existing contract and cannot reuse an all-read key.
    if (hasClientRequestId && Array.isArray(ids) && ids.length > 0) {
      return res.status(400).json({ message: '指定消息已读不支持批量请求编号' });
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
      if (!hasClientRequestId) {
        const updatedCount = await runInTransaction((tx) =>
          tx.execute(`UPDATE messages SET read = 1 WHERE user_id = ? AND read = 0`, [req.user!.id]),
        );
        return res.json({ message: '所有消息已标记为已读', updatedCount });
      }

      const actorId = req.user!.id;
      if (!isValidMessageClearRequestId(clientRequestId)) {
        return res.status(400).json({ message: '批量已读请求编号格式不正确' });
      }
      const normalizedRequestId = clientRequestId.toLowerCase();
      const result = await runInTransaction(async (tx) => {
        const existing = await tx.queryOne<{ actor_id: number; updated_count: number }>(
          'SELECT actor_id, updated_count FROM message_read_all_request_keys WHERE client_request_id = ?',
          [normalizedRequestId],
        );
        if (existing) {
          if (Number(existing.actor_id) !== actorId) return { conflict: true as const };
          return { conflict: false as const, updatedCount: Number(existing.updated_count), replayed: true };
        }

        const updatedCount = await tx.execute(
          'UPDATE messages SET read = 1 WHERE user_id = ? AND read = 0',
          [actorId],
        );
        await tx.executeInsert(
          `INSERT INTO message_read_all_request_keys(client_request_id, actor_id, updated_count, created_at)
           VALUES(?,?,?,?)`,
          [normalizedRequestId, actorId, updatedCount, beijingNow()],
        );
        return { conflict: false as const, updatedCount, replayed: false };
      });

      if (result.conflict) return res.status(409).json({ message: '批量已读请求编号已被使用，请重新核实' });
      return res.json({ message: '所有消息已标记为已读', updatedCount: result.updatedCount, replayed: result.replayed });
    }
  } catch {
    res.status(500).json({ message: '批量标记失败' });
  }
});

// Read-only verification for a keyed account-wide read-all request.
router.get('/read-all-requests/:requestId', authenticate, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const { requestId } = req.params;
  if (!isValidMessageClearRequestId(requestId)) {
    return res.status(400).json({ message: '批量已读请求编号格式不正确' });
  }

  try {
    const record = await queryOne<{ updated_count: number }>(
      'SELECT updated_count FROM message_read_all_request_keys WHERE client_request_id = ? AND actor_id = ?',
      [requestId.toLowerCase(), req.user!.id],
    );
    if (!record) return res.json({ state: 'not_found' });
    return res.json({ state: 'processed', updatedCount: Number(record.updated_count) });
  } catch {
    return res.status(500).json({ message: '暂时无法核实批量已读结果' });
  }
});

// 只读核实清空结果；记录按当前操作者隔离。
router.get('/clear-requests/:requestId', authenticate, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const { requestId } = req.params;
  if (!isValidMessageClearRequestId(requestId)) {
    return res.status(400).json({ message: '清空请求编号格式不正确' });
  }

  try {
    const record = await queryOne<{ deleted_count: number }>(
      'SELECT deleted_count FROM message_clear_request_keys WHERE client_request_id = ? AND actor_id = ?',
      [requestId.toLowerCase(), req.user!.id],
    );
    if (!record) return res.json({ state: 'not_found' });
    return res.json({ state: 'cleared', deletedCount: Number(record.deleted_count) });
  } catch {
    return res.status(500).json({ message: '暂时无法核实清空结果' });
  }
});

// 清空消息
router.delete('/', authenticate, async (req, res) => {
  try {
    const body = req.body;
    // Keep the old unkeyed contract available to already-open clients during rollout.
    if (body === undefined || (body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 0)) {
      await execute(`DELETE FROM messages WHERE user_id = ?`, [req.user?.id]);
      return res.json({ message: '消息已清空' });
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)
      || !Object.prototype.hasOwnProperty.call(body, 'client_request_id')) {
      return res.status(400).json({ message: '清空请求参数格式不正确' });
    }

    const clientRequestId = (body as { client_request_id?: unknown }).client_request_id;
    if (!isValidMessageClearRequestId(clientRequestId)) {
      return res.status(400).json({ message: '清空请求编号格式不正确' });
    }

    const actorId = req.user!.id;
    const normalizedRequestId = clientRequestId.toLowerCase();
    const result = await runInTransaction(async (tx) => {
      const existing = await tx.queryOne<{ actor_id: number; deleted_count: number }>(
        'SELECT actor_id, deleted_count FROM message_clear_request_keys WHERE client_request_id = ?',
        [normalizedRequestId],
      );
      if (existing) {
        if (Number(existing.actor_id) !== actorId) return { conflict: true as const };
        return { conflict: false as const, deletedCount: Number(existing.deleted_count), replayed: true };
      }

      const deletedCount = await tx.execute('DELETE FROM messages WHERE user_id = ?', [actorId]);
      await tx.executeInsert(
        `INSERT INTO message_clear_request_keys(client_request_id, actor_id, deleted_count, created_at)
         VALUES(?,?,?,?)`,
        [normalizedRequestId, actorId, deletedCount, beijingNow()],
      );
      return { conflict: false as const, deletedCount, replayed: false };
    });

    if (result.conflict) return res.status(409).json({ message: '清空请求编号已被使用，请重新核实' });
    return res.json({ message: '消息已清空', deletedCount: result.deletedCount, replayed: result.replayed });
  } catch {
    return res.status(500).json({ message: '清空消息失败' });
  }
});

export default router;
