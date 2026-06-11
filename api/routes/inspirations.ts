import express from 'express';
import { beijingNow, queryOne, queryAll, execute, executeInsert } from '../database/utils';
import { authenticate, requireRole } from '../middleware/auth';
import { createMessage } from '../utils/messageHelper';
import { broadcastToRoom } from '../utils/socket';

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
  } catch (error) {
    res.status(500).json({ message: '获取灵感列表失败', error });
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

    res.json({ message: '灵感创建成功', id: inspirationId });
  } catch (error) {
    res.status(500).json({ message: '创建灵感失败', error });
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
  } catch (error) {
    res.status(500).json({ message: '获取灵感详情失败', error });
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

    const inspiration = await getInspirationById(id, userId);
    if (!inspiration) {
      return res.status(404).json({ message: '灵感不存在' });
    }

    const commentId = await executeInsert(
      `INSERT INTO inspiration_comments (inspiration_id, creator_id, content, created_at) VALUES (?, ?, ?, ?)`,
      [id, userId, content, beijingNow()]
    );

    await execute(
      `UPDATE inspirations SET updated_at = datetime('now', '+8 hours') WHERE id = ?`,
      [id]
    );

    const comment = await queryOne(
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

    const commentCountRow = await queryOne(
      `SELECT COUNT(*) as total FROM inspiration_comments WHERE inspiration_id = ?`,
      [id]
    );

    broadcastToRoom('inspirations', 'inspiration:commented', {
      inspirationId: id,
      comment,
      comment_count: commentCountRow?.total || 0,
    });

    res.json({
      message: '评论成功',
      comment,
      comment_count: commentCountRow?.total || 0,
    });
  } catch (error) {
    res.status(500).json({ message: '评论失败', error });
  }
});

// POST /:id/vote - 投票/取消投票（toggle）
router.post('/:id/vote', authenticate, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const userId = Number(req.user?.id);

    const inspiration = await queryOne(`SELECT * FROM inspirations WHERE id = ?`, [id]);
    if (!inspiration) {
      return res.status(404).json({ message: '灵感不存在' });
    }

    const existingVote = await queryOne(
      `SELECT * FROM inspiration_votes WHERE inspiration_id = ? AND user_id = ?`,
      [id, userId]
    );

    if (existingVote) {
      await execute(
        `DELETE FROM inspiration_votes WHERE inspiration_id = ? AND user_id = ?`,
        [id, userId]
      );
      await execute(
        `UPDATE inspirations SET votes = votes - 1, updated_at = datetime('now', '+8 hours') WHERE id = ?`,
        [id]
      );
      const updated = await queryOne(`SELECT votes FROM inspirations WHERE id = ?`, [id]);
      broadcastToRoom('inspirations', 'inspiration:voted', { id, votes: updated?.votes, userId });

      res.json({ message: '取消投票成功', voted: false });
    } else {
      await execute(
        `INSERT INTO inspiration_votes (inspiration_id, user_id) VALUES (?, ?)`,
        [id, userId]
      );
      await execute(
        `UPDATE inspirations SET votes = votes + 1, updated_at = datetime('now', '+8 hours') WHERE id = ?`,
        [id]
      );
      const updated = await queryOne(`SELECT votes FROM inspirations WHERE id = ?`, [id]);
      broadcastToRoom('inspirations', 'inspiration:voted', { id, votes: updated?.votes, userId });

      res.json({ message: '投票成功', voted: true });
    }
  } catch (error) {
    res.status(500).json({ message: '投票操作失败', error });
  }
});

// DELETE /:id - 删除灵感（仅创建者或管理员）
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const userId = Number(req.user?.id);
    const userRole = req.user?.role;

    const inspiration = await queryOne(`SELECT * FROM inspirations WHERE id = ?`, [id]);
    if (!inspiration) {
      return res.status(404).json({ message: '灵感不存在' });
    }

    if (Number(inspiration.creator_id) !== userId && userRole !== 'admin') {
      return res.status(403).json({ message: '无权限删除此灵感' });
    }

    await execute(`DELETE FROM inspiration_comments WHERE inspiration_id = ?`, [id]);
    await execute(`DELETE FROM inspiration_votes WHERE inspiration_id = ?`, [id]);
    await execute(`DELETE FROM inspirations WHERE id = ?`, [id]);
    broadcastToRoom('inspirations', 'inspiration:deleted', { id });

    res.json({ message: '灵感删除成功' });
  } catch (error) {
    res.status(500).json({ message: '删除灵感失败', error });
  }
});

// POST /:id/promote - 将灵感转为正式选题
router.post('/:id/promote', authenticate, requireRole(['admin', 'director']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const userId = Number(req.user?.id);

    const inspiration: any = await queryOne(`SELECT * FROM inspirations WHERE id = ?`, [id]);
    if (!inspiration) {
      return res.status(404).json({ message: '灵感不存在' });
    }

    const topicId = await executeInsert(
      `INSERT INTO topics (title, description, status, creator_id) VALUES (?, ?, 'pending', ?)`,
      [inspiration.title, inspiration.description, userId]
    );

    await execute(
      `INSERT INTO topic_history (topic_id, action, comment, operator_id) VALUES (?, ?, ?, ?)`,
      [topicId, 'created', `从灵感「${inspiration.title}」转为正式选题`, userId]
    );

    await execute(
      `UPDATE inspirations SET status = 'promoted', updated_at = datetime('now', '+8 hours') WHERE id = ?`,
      [id]
    );

    if (Number(inspiration.creator_id) !== userId) {
      createMessage(
        inspiration.creator_id,
        '灵感已转为选题',
        `您的灵感「${inspiration.title}」已被转为正式选题`,
        'success'
      );
    }

    res.json({ message: '灵感已转为选题', topicId });
  } catch (error) {
    res.status(500).json({ message: '转为选题失败', error });
  }
});

export default router;
