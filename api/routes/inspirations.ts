import express from 'express';
import { beijingNow, queryOne, queryAll, executeInsert, runInTransaction } from '../database/utils';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { createMessage } from '../utils/messageHelper';
import { broadcastToRoom } from '../utils/socket';
import { InspirationPromotionError, promoteInspirationInTransaction } from '../modules/inspirations/inspiration-promotion';

const router = express.Router();

const inspirationSelect = `
  SELECT
    i.*,
    u.name as creator_name,
    CASE WHEN iv.id IS NOT NULL THEN 1 ELSE 0 END as voted,
    (
      SELECT COUNT(*)
      FROM inspiration_comments ic
      WHERE ic.inspiration_id = i.id
    ) as comment_count
`;

const inspirationFrom = `
  FROM inspirations i
  LEFT JOIN users u ON i.creator_id = u.id
  LEFT JOIN inspiration_votes iv ON iv.inspiration_id = i.id AND iv.user_id = ?
`;

const inspirationWhere = `
  WHERE 1=1
`;

async function getInspirationById(id: number, userId: number) {
  return queryOne(
    `
      ${inspirationSelect}
      ${inspirationFrom}
      ${inspirationWhere}
      AND i.id = ?
    `,
    [userId, id]
  );
}

// GET / - 获取灵感列表（支持分页、搜索、分类筛选）
router.get('/', authenticate, async (req, res) => {
  try {
    const { search, category, page = 1, limit = 20 } = req.query;
    const userId = Number(req.user?.id);

    let whereClause = inspirationWhere;
    const whereParams: Array<string | number> = [];

    if (search) {
      whereClause += ` AND (i.title LIKE ? OR i.description LIKE ?)`;
      whereParams.push(`%${search}%`, `%${search}%`);
    }

    if (category) {
      whereClause += ` AND i.category = ?`;
      whereParams.push(String(category));
    }

    const totalRow = await queryOne(
      `
        SELECT COUNT(*) as total
        FROM inspirations i
        ${whereClause}
      `,
      whereParams
    );

    const inspirations = await queryAll(
      `
        ${inspirationSelect}
        ${inspirationFrom}
        ${whereClause}
        ORDER BY i.created_at DESC
        LIMIT ? OFFSET ?
      `,
      [
        userId,
        ...whereParams,
        parseInt(limit as string, 10),
        (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10),
      ]
    );

    res.json({
      data: inspirations,
      total: totalRow?.total || 0,
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
    });
  } catch {
    res.status(500).json({ message: '获取灵感列表失败' });
  }
});

// POST / - 创建灵感
router.post('/', authenticate, async (req, res) => {
  try {
    const { title, description, category } = req.body;
    const userId = Number(req.user?.id);

    if (!title) {
      return res.status(400).json({ message: '灵感标题不能为空' });
    }

    const inspirationId = await executeInsert(
      `INSERT INTO inspirations (title, description, category, creator_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [title, description, category || 'general', userId, beijingNow(), beijingNow()]
    );

    const newInspiration = await getInspirationById(inspirationId, userId);
    broadcastToRoom('inspirations', 'inspiration:created', newInspiration);

    res.json({ message: '灵感创建成功', id: inspirationId, inspiration: newInspiration });
  } catch {
    res.status(500).json({ message: '创建灵感失败' });
  }
});

// GET /:id - 获取灵感详情和评论
router.get('/:id', authenticate, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const userId = Number(req.user?.id);

    const inspiration = await getInspirationById(id, userId);
    if (!inspiration) {
      return res.status(404).json({ message: '灵感不存在' });
    }

    const comments = await queryAll(
      `
        SELECT
          ic.*,
          u.name as creator_name
        FROM inspiration_comments ic
        LEFT JOIN users u ON ic.creator_id = u.id
        WHERE ic.inspiration_id = ?
        ORDER BY ic.created_at ASC, ic.id ASC
      `,
      [id]
    );

    res.json({ inspiration, comments });
  } catch {
    res.status(500).json({ message: '获取灵感详情失败' });
  }
});

// POST /:id/comments - 评论灵感
router.post('/:id/comments', authenticate, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const userId = Number(req.user?.id);
    const content = String(req.body?.content || '').trim();

    if (!content) {
      return res.status(400).json({ message: '评论内容不能为空' });
    }

    const result = await runInTransaction(async (tx) => {
      const inspiration = await tx.queryOne<{ id: number }>(`SELECT id FROM inspirations WHERE id = ?`, [id]);
      if (!inspiration) return null;

      const commentId = await tx.executeInsert(
        `INSERT INTO inspiration_comments (inspiration_id, creator_id, content, created_at) VALUES (?, ?, ?, ?)`,
        [id, userId, content, beijingNow()]
      );

      const updatedRows = await tx.execute(
        `UPDATE inspirations SET updated_at = datetime('now', '+8 hours') WHERE id = ?`,
        [id]
      );
      if (updatedRows !== 1) throw new Error('INSPIRATION_COMMENT_PARENT_UPDATE_FAILED');

      const comment = await tx.queryOne(
        `
          SELECT
            ic.*,
            u.name as creator_name
          FROM inspiration_comments ic
          LEFT JOIN users u ON ic.creator_id = u.id
          WHERE ic.id = ?
        `,
        [commentId]
      );
      const commentCountRow = await tx.queryOne<{ total: number }>(
        `SELECT COUNT(*) as total FROM inspiration_comments WHERE inspiration_id = ?`,
        [id]
      );
      if (!comment || !commentCountRow) throw new Error('INSPIRATION_COMMENT_RESPONSE_UNAVAILABLE');

      return { comment, commentCount: Number(commentCountRow.total) };
    });

    if (!result) {
      return res.status(404).json({ message: '灵感不存在' });
    }

    broadcastToRoom('inspirations', 'inspiration:commented', {
      inspirationId: id,
      comment: result.comment,
      comment_count: result.commentCount,
    });

    res.json({
      message: '评论成功',
      comment: result.comment,
      comment_count: result.commentCount,
    });
  } catch {
    res.status(500).json({ message: '评论失败' });
  }
});

// POST /:id/vote - 投票/取消投票（toggle）
router.post('/:id/vote', authenticate, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const userId = Number(req.user?.id);

    const result = await runInTransaction(async (tx) => {
      const inspiration = await tx.queryOne<{ id: number }>(`SELECT id FROM inspirations WHERE id = ?`, [id]);
      if (!inspiration) return null;

      const existingVote = await tx.queryOne<{ id: number }>(
        `SELECT id FROM inspiration_votes WHERE inspiration_id = ? AND user_id = ?`,
        [id, userId]
      );

      let voted: boolean;
      if (existingVote) {
        const deletedRows = await tx.execute(
          `DELETE FROM inspiration_votes WHERE inspiration_id = ? AND user_id = ?`,
          [id, userId]
        );
        if (deletedRows !== 1) throw new Error('INSPIRATION_VOTE_DELETE_FAILED');
        voted = false;
      } else {
        await tx.executeInsert(
          `INSERT INTO inspiration_votes (inspiration_id, user_id) VALUES (?, ?)`,
          [id, userId]
        );
        voted = true;
      }

      const voteCount = await tx.queryOne<{ total: number }>(
        `SELECT COUNT(*) as total FROM inspiration_votes WHERE inspiration_id = ?`,
        [id]
      );
      if (!voteCount) throw new Error('INSPIRATION_VOTE_COUNT_UNAVAILABLE');

      const votes = Number(voteCount.total);
      const updatedRows = await tx.execute(
        `UPDATE inspirations SET votes = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?`,
        [votes, id]
      );
      if (updatedRows !== 1) throw new Error('INSPIRATION_VOTE_PARENT_UPDATE_FAILED');

      return { voted, votes };
    });

    if (!result) {
      return res.status(404).json({ message: '灵感不存在' });
    }

    broadcastToRoom('inspirations', 'inspiration:voted', { id, votes: result.votes, userId });
    res.json({ message: result.voted ? '投票成功' : '取消投票成功', voted: result.voted });
  } catch {
    res.status(500).json({ message: '投票操作失败' });
  }
});

// DELETE /:id - 删除灵感（仅创建者或管理员）
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const userId = Number(req.user?.id);
    const result = await runInTransaction(async (tx) => {
      const inspiration = await tx.queryOne<{ id: number; creator_id: number | null }>(
        `SELECT id, creator_id FROM inspirations WHERE id = ?`,
        [id]
      );
      if (!inspiration) return 'not_found' as const;

      const permission = await tx.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM permissions p
         JOIN role_permissions rp ON p.id = rp.permission_id
         JOIN user_roles ur ON rp.role_id = ur.role_id
         WHERE ur.user_id = ? AND p.code = ?`,
        [userId, 'inspiration:delete']
      );
      const canDelete = Number(inspiration.creator_id) === userId || req.user?.role === 'admin' || Number(permission?.count || 0) > 0;
      if (!canDelete) return 'forbidden' as const;

      await tx.execute(`DELETE FROM inspiration_comments WHERE inspiration_id = ?`, [id]);
      await tx.execute(`DELETE FROM inspiration_votes WHERE inspiration_id = ?`, [id]);
      const deletedRows = await tx.execute(`DELETE FROM inspirations WHERE id = ?`, [id]);
      if (deletedRows !== 1) throw new Error('INSPIRATION_DELETE_PARENT_FAILED');
      return 'deleted' as const;
    });

    if (result === 'not_found') {
      return res.status(404).json({ message: '灵感不存在' });
    }
    if (result === 'forbidden') {
      return res.status(403).json({ message: '无权限删除此灵感' });
    }

    broadcastToRoom('inspirations', 'inspiration:deleted', { id });

    res.json({ message: '灵感删除成功' });
  } catch {
    res.status(500).json({ message: '删除灵感失败' });
  }
});

// POST /:id/promote - 将灵感转为正式选题
router.post('/:id/promote', authenticate, requirePermission('inspiration:promote'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const userId = Number(req.user?.id);
    const result = await runInTransaction((tx) => promoteInspirationInTransaction(tx, id, userId));

    if (result.created && Number(result.inspiration.creator_id) !== userId) {
      createMessage(
        Number(result.inspiration.creator_id),
        '灵感已转为选题',
        `您的灵感「${result.inspiration.title}」已被转为正式选题`,
        'success'
      );
    }

    res.json({ message: result.created ? '灵感已转为选题' : '已返回关联选题', topicId: result.topicId });
  } catch (error) {
    if (error instanceof InspirationPromotionError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: '转为选题失败' });
  }
});

export default router;
