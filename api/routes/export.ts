import express from 'express';
import { beijingNow, beijingToday, queryOne, queryAll } from '../database/utils';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = express.Router();

function queryDateDaysAgo(days: number): string {
  const date = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  date.setDate(date.getDate() - days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

router.get('/topics', authenticate, requirePermission('export:data'), async (req, res) => {
  try {
    const { status, start_date, end_date } = req.query;

    let query = `
      SELECT
        t.id,
        t.title,
        t.description,
        t.status,
        t.platform,
        t.deadline,
        u1.name as creator_name,
        u2.name as assignee_name,
        t.created_at,
        t.updated_at
      FROM topics t
      LEFT JOIN users u1 ON t.creator_id = u1.id
      LEFT JOIN users u2 ON t.assignee_id = u2.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      query += ` AND t.status = ?`;
      params.push(status);
    }
    if (start_date) {
      query += ` AND t.created_at >= ?`;
      params.push(start_date);
    }
    if (end_date) {
      query += ` AND t.created_at <= ?`;
      params.push(end_date);
    }

    query += ` ORDER BY t.created_at DESC`;
    const topics = await queryAll(query, params);

    const stats = {
      total: topics.length,
      byStatus: {} as Record<string, number>,
      byPlatform: {} as Record<string, number>,
    };

    topics.forEach((topic: any) => {
      stats.byStatus[topic.status] = (stats.byStatus[topic.status] || 0) + 1;
      if (topic.platform) {
        stats.byPlatform[topic.platform] = (stats.byPlatform[topic.platform] || 0) + 1;
      }
    });

    res.json({ data: topics, stats, exportTime: beijingNow() });
  } catch (error) {
    res.status(500).json({ message: '导出选题数据失败', error });
  }
});

router.get('/analytics', authenticate, requirePermission('export:data'), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    let topicQuery = `SELECT status, COUNT(*) as count FROM topics WHERE 1=1`;
    const topicParams: any[] = [];

    if (start_date) {
      topicQuery += ` AND created_at >= ?`;
      topicParams.push(start_date);
    }
    if (end_date) {
      topicQuery += ` AND created_at <= ?`;
      topicParams.push(end_date);
    }

    topicQuery += ` GROUP BY status`;
    const topicStats = await queryAll(topicQuery, topicParams);

    const userActivity = await queryAll(`
      SELECT
        u.id,
        u.name,
        COUNT(DISTINCT t.id) as topics_created,
        COUNT(DISTINCT ps.id) as pomodoros_completed
      FROM users u
      LEFT JOIN topics t ON t.creator_id = u.id
      LEFT JOIN pomodoro_sessions ps ON ps.user_id = u.id AND ps.completed = 1
      WHERE u.enabled = 1
      GROUP BY u.id
      ORDER BY topics_created DESC
    `);

    const dailyTrend = await queryAll(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as topics_created
      FROM topics
      WHERE created_at >= datetime('now', '-30 days')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    const platformDist = await queryAll(`
      SELECT platform, COUNT(*) as count
      FROM topics
      WHERE platform IS NOT NULL AND platform != ''
      GROUP BY platform
      ORDER BY count DESC
    `);

    res.json({
      topicStats,
      userActivity,
      dailyTrend,
      platformDistribution: platformDist,
      exportTime: beijingNow(),
    });
  } catch (error) {
    res.status(500).json({ message: '导出分析数据失败', error });
  }
});

router.get('/weekly-report', authenticate, requirePermission('export:data'), async (req, res) => {
  try {
    const completedTopics = await queryAll(`
      SELECT t.*, u.name as creator_name
      FROM topics t
      LEFT JOIN users u ON t.creator_id = u.id
      WHERE t.status = 'completed'
        AND t.updated_at >= datetime('now', 'weekday 0', '-7 days')
      ORDER BY t.updated_at DESC
    `);

    const publishedVideos = await queryAll(`
      SELECT p.*, t.title as topic_title
      FROM publishing p
      LEFT JOIN topics t ON p.topic_id = t.id
      WHERE p.status = 'published'
        AND p.publish_time >= datetime('now', 'weekday 0', '-7 days')
      ORDER BY p.publish_time DESC
    `);

    const newTopics = await queryAll(`
      SELECT t.*, u.name as creator_name
      FROM topics t
      LEFT JOIN users u ON t.creator_id = u.id
      WHERE t.created_at >= datetime('now', 'weekday 0', '-7 days')
      ORDER BY t.created_at DESC
    `);

    const analyticsResult = await queryOne(`
      SELECT
        COALESCE(SUM(views), 0) as total_views,
        COALESCE(SUM(likes), 0) as total_likes,
        COALESCE(SUM(shares), 0) as total_shares,
        COALESCE(SUM(comments), 0) as total_comments
      FROM analytics
      WHERE data_date >= date('now', 'weekday 0', '-7 days')
    `);

    const pomodoroStats = await queryOne(`
      SELECT
        COUNT(*) as total_sessions,
        COALESCE(SUM(duration), 0) as total_minutes
      FROM pomodoro_sessions
      WHERE completed = 1
        AND ended_at >= datetime('now', 'weekday 0', '-7 days')
    `);

    const newInspirations = await queryAll(`
      SELECT i.*, u.name as creator_name
      FROM inspirations i
      LEFT JOIN users u ON i.creator_id = u.id
      WHERE i.created_at >= datetime('now', 'weekday 0', '-7 days')
      ORDER BY i.votes DESC
      LIMIT 5
    `);

    res.json({
      period: {
        start: queryDateDaysAgo(7),
        end: beijingToday(),
      },
      summary: {
        completedTopics: completedTopics.length,
        publishedVideos: publishedVideos.length,
        newTopics: newTopics.length,
        totalViews: analyticsResult?.total_views || 0,
        totalLikes: analyticsResult?.total_likes || 0,
        totalShares: analyticsResult?.total_shares || 0,
        totalComments: analyticsResult?.total_comments || 0,
        pomodoroSessions: pomodoroStats?.total_sessions || 0,
        focusMinutes: pomodoroStats?.total_minutes || 0,
      },
      details: {
        completedTopics,
        publishedVideos,
        newTopics,
        topInspirations: newInspirations,
      },
      generatedAt: beijingNow(),
    });
  } catch (error) {
    res.status(500).json({ message: '生成周报失败', error });
  }
});

export default router;
