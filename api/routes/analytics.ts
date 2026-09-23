import express from 'express';
import { beijingToday, queryOne, queryAll, runInTransaction } from '../database/utils';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { canAccessTopic, getTopicScopeById } from '../utils/access';

const router = express.Router();
const ANALYTICS_METRIC_FIELDS = ['views', 'likes', 'shares', 'comments'] as const;

function parseAnalyticsMetric(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function isValidDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

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
  } catch {
    res.status(500).json({ message: '获取月度统计失败' });
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
  } catch {
    res.status(500).json({ message: '获取用户统计失败' });
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
  } catch {
    res.status(500).json({ message: '获取团队统计失败' });
  }
});

router.post('/', authenticate, requirePermission('analytics:create'), async (req, res) => {
  try {
    const { topic_id, views, likes, shares, comments, data_date } = req.body;

    const topicId = Number(topic_id);
    if (!Number.isSafeInteger(topicId) || topicId <= 0) {
      return res.status(400).json({ message: '选题ID不能为空' });
    }
    if (!isValidDateKey(data_date)) return res.status(400).json({ message: '数据日期格式无效' });
    const rawMetrics = { views, likes, shares, comments };
    const metrics = Object.fromEntries(
      ANALYTICS_METRIC_FIELDS.map((field) => [field, parseAnalyticsMetric(rawMetrics[field] ?? 0)]),
    ) as Record<(typeof ANALYTICS_METRIC_FIELDS)[number], number | null>;
    if (Object.values(metrics).some((value) => value === null)) {
      return res.status(400).json({ message: '播放、点赞、分享和评论必须是非负整数' });
    }
    const topic = await getTopicScopeById(topicId);
    if (!topic) return res.status(404).json({ message: '选题不存在' });
    if (!canAccessTopic(req.user, topic)) return res.status(403).json({ message: '无权限录入该选题数据' });

    await runInTransaction(async (tx) => {
      const existing = await tx.queryOne<{ id: number }>(
        `SELECT id FROM analytics WHERE topic_id=? AND data_date=? ORDER BY id DESC LIMIT 1`,
        [topicId, data_date],
      );
      const metricValues = ANALYTICS_METRIC_FIELDS.map((field) => metrics[field] as number);
      if (existing) {
        await tx.execute(
          `UPDATE analytics SET views=?,likes=?,shares=?,comments=? WHERE id=?`,
          [...metricValues, existing.id],
        );
      } else {
        await tx.execute(
          `INSERT INTO analytics(topic_id,views,likes,shares,comments,data_date) VALUES(?,?,?,?,?,?)`,
          [topicId, ...metricValues, data_date],
        );
      }
    });

    res.json({ message: '数据录入成功' });
  } catch {
    res.status(500).json({ message: '录入数据失败' });
  }
});

router.get('/topic/:topicId', authenticate, requirePermission('analytics:view'), async (req, res) => {
  try {
    const { topicId } = req.params;
    const topic = await getTopicScopeById(topicId);
    if (!topic) return res.status(404).json({ message: '选题不存在' });
    if (!canAccessTopic(req.user, topic)) return res.status(403).json({ message: '无权限查看该选题数据' });

    const analytics = await queryAll(`SELECT * FROM analytics WHERE topic_id = ? ORDER BY data_date DESC`, [topicId]);
    res.json(analytics);
  } catch {
    res.status(500).json({ message: '获取选题数据失败' });
  }
});

export default router;
