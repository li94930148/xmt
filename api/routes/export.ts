import express from 'express';
import { beijingNow, beijingToday, queryOne, queryAll } from '../database/utils';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { sendSafeServerError } from '../utils/response';
import { getLegacyAnalyticsInventory, getPublishingMetricFacts, sumPublishingMetricFacts } from '../services/publishingMetrics';

const router = express.Router();

function dateDaysAgo(baseDate: string, days: number): string {
  const date = new Date(`${baseDate}T08:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
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
    sendSafeServerError(res, '导出选题数据失败', 'export:topics', error);
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
      WHERE created_at >= datetime('now', '+8 hours', '-30 days')
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
    sendSafeServerError(res, '导出分析数据失败', 'export:analytics', error);
  }
});

router.get('/weekly-report', authenticate, requirePermission('export:data'), async (req, res) => {
  try {
    const reportEnd = beijingToday();
    const daysSinceSunday = new Date(`${reportEnd}T08:00:00+08:00`).getUTCDay();
    const reportStart = dateDaysAgo(reportEnd, daysSinceSunday);
    const completedTopics = await queryAll(`
      SELECT t.*, u.name as creator_name
      FROM topics t
      LEFT JOIN users u ON t.creator_id = u.id
      WHERE t.status = 'completed'
        AND date(t.updated_at) BETWEEN date(?) AND date(?)
      ORDER BY t.updated_at DESC
    `, [reportStart, reportEnd]);

    const publishedVideos = await queryAll(`
      SELECT p.id, t.title as topic_title,
             CASE WHEN dw.id IS NOT NULL THEN 'douyin' ELSE p.platform END AS platform,
             COALESCE(dw.publish_time,p.publish_time) AS publish_time
      FROM publishing p
      LEFT JOIN topics t ON p.topic_id = t.id
      LEFT JOIN publishing_douyin_links link ON link.publishing_id=p.id
      LEFT JOIN douyin_works dw ON dw.id=link.douyin_work_id
      WHERE (dw.id IS NOT NULL OR p.status = 'published')
        AND date(COALESCE(dw.publish_time,p.publish_time)) BETWEEN date(?) AND date(?)
      ORDER BY COALESCE(dw.publish_time,p.publish_time) DESC,p.id DESC
    `, [reportStart, reportEnd]);

    const newTopics = await queryAll(`
      SELECT t.*, u.name as creator_name
      FROM topics t
      LEFT JOIN users u ON t.creator_id = u.id
      WHERE date(t.created_at) BETWEEN date(?) AND date(?)
      ORDER BY t.created_at DESC
    `, [reportStart, reportEnd]);

    const [metricFacts, legacyMetricInventory] = await Promise.all([
      getPublishingMetricFacts({ startDate: reportStart, endDate: reportEnd, publishedOnly: true }),
      getLegacyAnalyticsInventory(reportStart, reportEnd),
    ]);
    const analyticsResult = sumPublishingMetricFacts(metricFacts);

    const pomodoroStats = await queryOne(`
      SELECT
        COUNT(*) as total_sessions,
        COALESCE(SUM(duration), 0) as total_minutes
      FROM pomodoro_sessions
      WHERE completed = 1
        AND date(ended_at) BETWEEN date(?) AND date(?)
    `, [reportStart, reportEnd]);

    const newInspirations = await queryAll(`
      SELECT i.*, u.name as creator_name
      FROM inspirations i
      LEFT JOIN users u ON i.creator_id = u.id
      WHERE date(i.created_at) BETWEEN date(?) AND date(?)
      ORDER BY i.votes DESC
      LIMIT 5
    `, [reportStart, reportEnd]);

    res.json({
      period: {
        start: reportStart,
        end: reportEnd,
      },
      summary: {
        completedTopics: completedTopics.length,
        publishedVideos: publishedVideos.length,
        newTopics: newTopics.length,
        totalViews: analyticsResult.total_views,
        totalLikes: analyticsResult.total_likes,
        totalShares: analyticsResult.total_shares,
        totalComments: analyticsResult.total_comments,
        metricSourceCounts: analyticsResult.sourceCounts,
        excludedLegacyAnalyticsCount: Number(legacyMetricInventory?.unlinked_count || 0) + Number(legacyMetricInventory?.ambiguous_count || 0),
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
    sendSafeServerError(res, '生成周报失败', 'export:weekly', error);
  }
});

export default router;
