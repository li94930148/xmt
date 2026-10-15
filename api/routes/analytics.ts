import express from 'express';
import { beijingNow, beijingToday, queryOne, queryAll, runInTransaction } from '../database/utils';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { canAccessTopic, getTopicScopeById } from '../utils/access';
import { getLegacyAnalyticsInventory, getPublishingMetricFacts, sumPublishingMetricFacts } from '../services/publishingMetrics';

const router = express.Router();
const ANALYTICS_METRIC_FIELDS = ['views', 'likes', 'shares', 'comments'] as const;

function parseAnalyticsMetric(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
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

    const monthKey = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
    const startDate = `${monthKey}-01`;
    const endDate = `${monthKey}-${String(new Date(targetYear, targetMonth, 0).getDate()).padStart(2, '0')}`;
    const [facts, legacyInventory] = await Promise.all([
      getPublishingMetricFacts({ startDate, endDate, publishedOnly: true }),
      getLegacyAnalyticsInventory(startDate, endDate),
    ]);
    const result = sumPublishingMetricFacts(facts);

    res.json({
      month: targetMonth,
      year: targetYear,
      total_views: result.total_views,
      total_likes: result.total_likes,
      total_shares: result.total_shares,
      total_comments: result.total_comments,
      topic_count: new Set(facts.map((fact) => fact.topic_id)).size,
      publication_count: facts.length,
      metric_source_counts: result.sourceCounts,
      legacy_unlinked_count: Number(legacyInventory?.unlinked_count || 0),
      legacy_ambiguous_count: Number(legacyInventory?.ambiguous_count || 0),
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

    const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const endDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(new Date(targetYear, targetMonth, 0).getDate()).padStart(2, '0')}`;
    const [topicStats, facts] = await Promise.all([
      queryAll<{ user_id: number; user_name: string; topic_count: number }>(
        `SELECT u.name AS user_name,u.id AS user_id,
           COUNT(DISTINCT CASE WHEN date(t.created_at) BETWEEN date(?) AND date(?) THEN t.id END) AS topic_count
         FROM users u
         LEFT JOIN topics t ON u.id=t.creator_id OR u.id=t.assignee_id
         GROUP BY u.id`,
        [startDate, endDate],
      ),
      getPublishingMetricFacts({ startDate, endDate, publishedOnly: true }),
    ]);
    const metricTotals = new Map<number, { total_views: number; total_likes: number }>();
    for (const fact of facts) {
      if (fact.operator_id == null) continue;
      const totals = metricTotals.get(fact.operator_id) || { total_views: 0, total_likes: 0 };
      totals.total_views += fact.views;
      totals.total_likes += fact.likes;
      metricTotals.set(fact.operator_id, totals);
    }
    const userStats = topicStats.map((user) => ({
      ...user,
      total_views: metricTotals.get(user.user_id)?.total_views || 0,
      total_likes: metricTotals.get(user.user_id)?.total_likes || 0,
    })).filter((user) => user.topic_count > 0 || metricTotals.has(user.user_id))
      .sort((left, right) => right.topic_count - left.topic_count);

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
    const publishingId = Number(req.body.publishing_id);
    if (!Number.isSafeInteger(publishingId) || publishingId <= 0) {
      return res.status(400).json({ message: '请选择具体发布记录；历史选题级数据仅保留查看' });
    }
    const publishing = await queryOne<{ id: number; topic_id: number }>(
      'SELECT id,topic_id FROM publishing WHERE id=?',
      [publishingId],
    );
    if (!publishing) return res.status(404).json({ message: '发布记录不存在' });
    const topic = await getTopicScopeById(publishing.topic_id);
    if (!topic) return res.status(404).json({ message: '选题不存在' });
    if (!canAccessTopic(req.user, topic)) return res.status(403).json({ message: '无权限录入该发布记录数据' });

    const { views, likes, shares, comments } = req.body;
    const rawMetrics = { views, likes, shares, comments };
    const metrics = Object.fromEntries(
      ANALYTICS_METRIC_FIELDS.filter((field) => rawMetrics[field] !== undefined)
        .map((field) => [field, rawMetrics[field] == null || rawMetrics[field] === '' ? null : parseAnalyticsMetric(rawMetrics[field])]),
    ) as Partial<Record<(typeof ANALYTICS_METRIC_FIELDS)[number], number | null>>;
    if (Object.keys(metrics).length === 0) return res.status(400).json({ message: '至少填写一项手工补充指标' });
    if (ANALYTICS_METRIC_FIELDS.some((field) => rawMetrics[field] !== undefined
      && rawMetrics[field] != null && rawMetrics[field] !== '' && metrics[field] === null)) {
      return res.status(400).json({ message: '播放、点赞、分享和评论必须是非负整数' });
    }
    await runInTransaction(async (tx) => {
      const fields = Object.keys(metrics).map((field) => `manual_${field}=?`);
      await tx.execute(
        `UPDATE publishing SET ${fields.join(',')},manual_metrics_updated_at=?,manual_metrics_updated_by=?,updated_at=? WHERE id=?`,
        [...Object.values(metrics), beijingNow(), req.user?.id ?? null, beijingNow(), publishingId],
      );
    });

    res.json({ message: '手工补充数据已保存到发布记录' });
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

    const [facts, legacy] = await Promise.all([
      getPublishingMetricFacts({ topicId: Number(topicId) }),
      queryAll<Record<string, unknown>>(
        `SELECT old.*,'legacy_analytics' AS record_type,
           (SELECT COUNT(*) FROM publishing same_day
            LEFT JOIN publishing_douyin_links same_day_link ON same_day_link.publishing_id=same_day.id
            LEFT JOIN douyin_works same_day_work ON same_day_work.id=same_day_link.douyin_work_id
            WHERE same_day.topic_id=old.topic_id
              AND date(COALESCE(same_day_work.publish_time,same_day.publish_time))=date(old.data_date)) AS publication_match_count
         FROM analytics old
         WHERE old.topic_id=? AND NOT EXISTS (
           SELECT 1 FROM publishing unique_day
           LEFT JOIN publishing_douyin_links unique_day_link ON unique_day_link.publishing_id=unique_day.id
           LEFT JOIN douyin_works unique_day_work ON unique_day_work.id=unique_day_link.douyin_work_id
           WHERE unique_day.topic_id=old.topic_id
             AND date(COALESCE(unique_day_work.publish_time,unique_day.publish_time))=date(old.data_date)
             AND (SELECT COUNT(*) FROM publishing same_day
                  LEFT JOIN publishing_douyin_links same_day_link ON same_day_link.publishing_id=same_day.id
                  LEFT JOIN douyin_works same_day_work ON same_day_work.id= same_day_link.douyin_work_id
                  WHERE same_day.topic_id=old.topic_id
                    AND date(COALESCE(same_day_work.publish_time,same_day.publish_time))=date(old.data_date))=1
         ) ORDER BY old.data_date DESC,old.id DESC`,
        [topicId],
      ),
    ]);
    const timeline: Array<Record<string, unknown> & { data_date: string }> = [
      ...facts.map((fact) => ({
        id: fact.id,
        topic_id: fact.topic_id,
        data_date: fact.metric_publish_time?.slice(0, 10) || fact.publishing_publish_time?.slice(0, 10) || '',
        views: fact.views,
        likes: fact.likes,
        shares: fact.shares,
        comments: fact.comments,
        views_source: fact.views_source,
        likes_source: fact.likes_source,
        shares_source: fact.shares_source,
        comments_source: fact.comments_source,
        record_type: 'publishing',
        created_at: fact.official_metrics_observed_at || fact.metric_publish_time || '',
      })),
      ...legacy.map((row) => ({
        ...row,
        data_date: String(row.data_date || ''),
        views_source: 'legacy_analytics',
        likes_source: 'legacy_analytics',
        shares_source: 'legacy_analytics',
        comments_source: 'legacy_analytics',
      })),
    ];
    res.json(timeline.sort((left, right) => String(right.data_date).localeCompare(String(left.data_date))));
  } catch {
    res.status(500).json({ message: '获取选题数据失败' });
  }
});

export default router;
