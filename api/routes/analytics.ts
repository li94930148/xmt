import express from 'express';
import { beijingToday, queryOne, queryAll, execute } from '../database/utils';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { canAccessTopic, getTopicScopeById } from '../utils/access';

const router = express.Router();

function getBeijingMonthYear() {
  const [year, month] = beijingToday().split('-');
  return { year: Number(year), month: Number(month) };
}

router.get('/monthly', authenticate, requirePermission('analytics:view'), async (req, res) => {
  try {
    const { month, year } = req.query;
    const current = getBeijingMonthYear();
    const targetMonth = parseInt(month as string) || current.month;
    const targetYear = parseInt(year as string) || current.year;

    const result = await queryOne(
      `SELECT
        SUM(views) as total_views,
        SUM(likes) as total_likes,
        SUM(shares) as total_shares,
        SUM(comments) as total_comments,
        COUNT(DISTINCT topic_id) as topic_count
      FROM analytics
      WHERE strftime('%Y', data_date) = ? AND strftime('%m', data_date) = ?`,
      [targetYear.toString(), targetMonth.toString().padStart(2, '0')]
    );

    res.json({
      month: targetMonth,
      year: targetYear,
      total_views: result?.total_views || 0,
      total_likes: result?.total_likes || 0,
      total_shares: result?.total_shares || 0,
      total_comments: result?.total_comments || 0,
      topic_count: result?.topic_count || 0,
    });
  } catch (error) {
    res.status(500).json({ message: '获取月度统计失败', error });
  }
});

router.get('/user', authenticate, requirePermission('analytics:view'), async (req, res) => {
  try {
    const { month, year } = req.query;
    const current = getBeijingMonthYear();
    const targetMonth = parseInt(month as string) || current.month;
    const targetYear = parseInt(year as string) || current.year;

    const userStats = await queryAll(
      `SELECT
        u.name as user_name,
        u.id as user_id,
        COUNT(DISTINCT t.id) as topic_count,
        SUM(a.views) as total_views,
        SUM(a.likes) as total_likes
      FROM users u
      LEFT JOIN topics t ON u.id = t.creator_id OR u.id = t.assignee_id
      LEFT JOIN analytics a ON t.id = a.topic_id
      WHERE (strftime('%Y', t.created_at) = ? AND strftime('%m', t.created_at) = ?)
         OR (strftime('%Y', a.data_date) = ? AND strftime('%m', a.data_date) = ?)
      GROUP BY u.id
      ORDER BY topic_count DESC`,
      [
        targetYear.toString(),
        targetMonth.toString().padStart(2, '0'),
        targetYear.toString(),
        targetMonth.toString().padStart(2, '0'),
      ]
    );

    res.json(userStats);
  } catch (error) {
    res.status(500).json({ message: '获取用户统计失败', error });
  }
});

router.get('/team', authenticate, requirePermission('analytics:view'), async (req, res) => {
  try {
    const { month, year } = req.query;
    const current = getBeijingMonthYear();
    const targetMonth = parseInt(month as string) || current.month;
    const targetYear = parseInt(year as string) || current.year;

    const completedTopics = await queryOne(
      `SELECT COUNT(*) as count FROM topics
       WHERE status = 'completed'
         AND strftime('%Y', created_at) = ? AND strftime('%m', created_at) = ?`,
      [targetYear.toString(), targetMonth.toString().padStart(2, '0')]
    );

    const totalTopics = await queryOne(
      `SELECT COUNT(*) as count FROM topics
       WHERE strftime('%Y', created_at) = ? AND strftime('%m', created_at) = ?`,
      [targetYear.toString(), targetMonth.toString().padStart(2, '0')]
    );

    const overdueTopics = await queryOne(
      `SELECT COUNT(*) as count FROM topics
       WHERE deadline < datetime('now', '+8 hours') AND status != 'completed'
         AND strftime('%Y', created_at) = ? AND strftime('%m', created_at) = ?`,
      [targetYear.toString(), targetMonth.toString().padStart(2, '0')]
    );

    const avgDays = await queryOne(
      `SELECT AVG(julianday(updated_at) - julianday(created_at)) as avg_days
       FROM topics
       WHERE status = 'completed'
         AND strftime('%Y', created_at) = ? AND strftime('%m', created_at) = ?`,
      [targetYear.toString(), targetMonth.toString().padStart(2, '0')]
    );

    res.json({
      month: targetMonth,
      year: targetYear,
      completed_count: Number(completedTopics?.count) || 0,
      total_count: Number(totalTopics?.count) || 0,
      overdue_count: Number(overdueTopics?.count) || 0,
      completion_rate:
        totalTopics && Number(totalTopics.count)
          ? ((Number(completedTopics?.count) || 0) / Number(totalTopics.count) * 100).toFixed(1)
          : '0',
      overdue_rate:
        totalTopics && Number(totalTopics.count)
          ? ((Number(overdueTopics?.count) || 0) / Number(totalTopics.count) * 100).toFixed(1)
          : '0',
      avg_days: avgDays && Number(avgDays.avg_days) ? Number(avgDays.avg_days).toFixed(1) : '0',
    });
  } catch (error) {
    res.status(500).json({ message: '获取团队统计失败', error });
  }
});

router.post('/', authenticate, requirePermission('analytics:create'), async (req, res) => {
  try {
    const { topic_id, views, likes, shares, comments, data_date } = req.body;

    if (!topic_id) {
      return res.status(400).json({ message: '选题ID不能为空' });
    }

    const exists = await queryOne(
      `SELECT COUNT(*) as count FROM analytics WHERE topic_id = ? AND data_date = ?`,
      [topic_id, data_date]
    );

    if (Number(exists?.count) > 0) {
      await execute(
        `UPDATE analytics SET views = ?, likes = ?, shares = ?, comments = ?
         WHERE topic_id = ? AND data_date = ?`,
        [views, likes, shares, comments, topic_id, data_date]
      );
    } else {
      await execute(
        `INSERT INTO analytics (topic_id, views, likes, shares, comments, data_date)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [topic_id, views, likes, shares, comments, data_date]
      );
    }

    res.json({ message: '数据录入成功' });
  } catch (error) {
    res.status(500).json({ message: '录入数据失败', error });
  }
});

router.get('/topic/:topicId', authenticate, async (req, res) => {
  try {
    const { topicId } = req.params;
    const topic = await getTopicScopeById(topicId);
    if (!topic) return res.status(404).json({ message: '选题不存在' });
    if (!canAccessTopic(req.user, topic)) return res.status(403).json({ message: '无权限查看该选题数据' });

    const analytics = await queryAll(`SELECT * FROM analytics WHERE topic_id = ? ORDER BY data_date DESC`, [topicId]);
    res.json(analytics);
  } catch (error) {
    res.status(500).json({ message: '获取选题数据失败', error });
  }
});

export default router;
