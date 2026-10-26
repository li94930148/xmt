import express from 'express';
import { beijingNow, beijingToday, queryAll, queryOne } from '../database/utils';
import { authenticate } from '../middleware/auth';
import { userHasPermission } from '../middleware/permissions';
import { canManageCreatorData } from '../services/creatorDataVisibility';
import { getHomeRetrospectiveSummary } from '../services/retrospectives';
import { canEditAllContent, canViewAllContent } from '../utils/access';

const router = express.Router();
const STALE_STAGE_DAYS = 2;
const ATTENTION_LIMIT = 8;
const TODAY_PUBLISHING_LIMIT = 8;
const SYNC_ANOMALY_LIMIT = 8;
const PRODUCTION_REVIEW_LIMIT = 8;
const TOPIC_STAGE_PREVIEW_LIMIT = 3;
const MY_DRAFT_PREVIEW_LIMIT = 12;
const HOME_ACTIVITY_LIMIT = 12;
const HOME_ACTIVITY_SOURCE_LIMIT = 12;
const HOME_TOPIC_STAGE_STATUSES = ['pending', 'production', 'shooting', 'publishing', 'completed'] as const;
const HOME_TOPIC_QUERY_STATUSES = ['pending', 'approved', 'production', 'shooting', 'publishing', 'completed'] as const;

const overdueSql = `t.status NOT IN ('completed', 'rejected') AND t.deadline IS NOT NULL AND date(t.deadline) < date(?)`;
const dueSoonSql = `t.status NOT IN ('completed', 'rejected') AND t.deadline IS NOT NULL AND date(t.deadline) >= date(?) AND date(t.deadline) <= date(?, '+2 days')`;
const stalledSql = `t.status NOT IN ('completed', 'rejected') AND t.stage_entered_at IS NOT NULL AND datetime(t.stage_entered_at) < datetime(?, '-${STALE_STAGE_DAYS} days')`;

function topicScope(user: NonNullable<Express.Request['user']>) {
  if (canViewAllContent(user)) return { sql: '', params: [] as unknown[] };
  return { sql: ' AND (t.creator_id = ? OR t.assignee_id = ?)', params: [user.id, user.id] };
}

function topicActivityScope(user: NonNullable<Express.Request['user']>) {
  if (canViewAllContent(user)) return { sql: '', params: [] as unknown[] };
  return { sql: ' AND (topic.creator_id = ? OR topic.assignee_id = ?)', params: [user.id, user.id] };
}

function publishingScope(user: NonNullable<Express.Request['user']>) {
  if (canViewAllContent(user)) return { sql: '', params: [] as unknown[] };
  return { sql: ' AND (t.creator_id = ? OR t.assignee_id = ? OR p.operator_id = ?)', params: [user.id, user.id, user.id] };
}

function productionActivityScope(user: NonNullable<Express.Request['user']>) {
  if (canViewAllContent(user)) return { sql: '', params: [] as unknown[] };
  return { sql: ' AND (t.creator_id = ? OR t.assignee_id = ? OR p.operator_id = ?)', params: [user.id, user.id, user.id] };
}

const todayPublishingWhere = `t.status = 'publishing'
  AND p.status IN ('pending', 'scheduled')
  AND date(p.publish_time) = date(?)
  AND NOT EXISTS (
    SELECT 1
    FROM publishing resolved
    LEFT JOIN publishing_douyin_links resolved_link ON resolved_link.publishing_id = resolved.id
    LEFT JOIN douyin_works resolved_work ON resolved_work.id = resolved_link.douyin_work_id
    WHERE resolved.topic_id = t.id
      AND (resolved.status = 'published' OR resolved_work.id IS NOT NULL)
  )`;

const latestCreatorSyncCte = `WITH latest_syncs AS (
  SELECT task.id, task.platform, task.account, task.status, task.start_time,
    task.success_count, task.failed_count,
    COALESCE(
      (SELECT account.user_id FROM creator_platform_accounts account
       WHERE account.platform=task.platform AND account.platform_uid=task.account
       ORDER BY account.id DESC LIMIT 1),
      agent.user_id
    ) AS owner_id,
    ROW_NUMBER() OVER (
      PARTITION BY task.platform, task.account
      ORDER BY datetime(task.start_time) DESC, task.id DESC
    ) AS rank
  FROM creator_sync_tasks task
  LEFT JOIN creator_agents agent ON agent.id = task.agent_id
)`;

const creatorSyncAnomalyWhere = `rank = 1 AND status IN ('failed', 'partial_success')`;

router.get('/home-attention', authenticate, async (req, res) => {
  try {
    const today = beijingToday();
    const now = beijingNow();
    const scope = topicScope(req.user!);
    const publishing = publishingScope(req.user!);
    const where = `t.status NOT IN ('completed', 'rejected')${scope.sql}`;
    const canViewSyncAnomalies = canManageCreatorData(req.user!.role)
      && await userHasPermission(req.user!.id, 'creator:data:view');
    const canViewProductionReviews = await userHasPermission(req.user!.id, 'production:update');
    const productionReviewScope = canEditAllContent(req.user)
      ? { sql: '', params: [] as unknown[] }
      : { sql: ' AND (t.creator_id = ? OR t.assignee_id = ? OR p.operator_id = ?)', params: [req.user!.id, req.user!.id, req.user!.id] };
    const retrospectiveSummary = getHomeRetrospectiveSummary(req.user).catch(() => ({
      available: false,
      total: 0,
      tasks: [],
    }));
    const [count, activeTopicRows, todayPublishingCount, todayPublishingRows, topics, topicStageRows, myDraftRows, syncAnomalyCount, syncAnomalyRows, productionReviewCount, productionReviewRows, retrospectives] = await Promise.all([
      queryOne<{ overdue: number; due_soon: number; stalled: number; stage_time_unknown: number; total: number; active_total: number }>(
      `SELECT
         COUNT(CASE WHEN t.status NOT IN ('completed', 'rejected') THEN t.id END) AS active_total,
         COUNT(CASE WHEN ${overdueSql} THEN t.id END) AS overdue,
         COUNT(CASE WHEN ${dueSoonSql} THEN t.id END) AS due_soon,
         COUNT(CASE WHEN ${stalledSql} THEN t.id END) AS stalled,
         COUNT(CASE WHEN t.status NOT IN ('completed', 'rejected') AND datetime(t.stage_entered_at) IS NULL THEN t.id END) AS stage_time_unknown,
         COUNT(DISTINCT CASE WHEN (${overdueSql}) OR (${dueSoonSql}) OR (${stalledSql}) THEN t.id END) AS total
       FROM topics t WHERE ${where}`,
      [today, today, today, now, today, today, today, now, ...scope.params],
      ),
      queryAll<Record<string, unknown>>(
        `SELECT t.id, t.title, t.status
         FROM topics t
         WHERE t.status NOT IN ('completed', 'rejected')${scope.sql}
         ORDER BY datetime(t.created_at) DESC, t.id DESC
         LIMIT ${TOPIC_STAGE_PREVIEW_LIMIT}`,
        scope.params,
      ),
      queryOne<{ total: number }>(
        `SELECT COUNT(DISTINCT p.id) AS total
         FROM publishing p
         JOIN topics t ON t.id = p.topic_id
         WHERE ${todayPublishingWhere}${publishing.sql}`,
        [today, ...publishing.params],
      ),
      queryAll<Record<string, unknown>>(
        `SELECT p.id, p.topic_id, t.title AS topic_title, p.platform, p.publish_time, p.status, u.name AS operator_name
         FROM publishing p
         JOIN topics t ON t.id = p.topic_id
         LEFT JOIN users u ON u.id = p.operator_id
         WHERE ${todayPublishingWhere}${publishing.sql}
         ORDER BY datetime(p.publish_time) ASC, p.id ASC
         LIMIT ${TODAY_PUBLISHING_LIMIT}`,
        [today, ...publishing.params],
      ),
      queryAll<Record<string, unknown>>(
      `SELECT t.id, t.title, t.status, t.deadline, t.stage_entered_at,
         u.name AS assignee_name,
         CASE WHEN ${overdueSql} THEN 1 ELSE 0 END AS is_overdue,
         CASE WHEN ${dueSoonSql} THEN 1 ELSE 0 END AS is_due_soon,
         CASE WHEN ${stalledSql} THEN 1 ELSE 0 END AS is_stalled
       FROM topics t
       LEFT JOIN users u ON u.id = t.assignee_id
       WHERE ${where} AND ((${overdueSql}) OR (${dueSoonSql}) OR (${stalledSql}))
       ORDER BY is_overdue DESC, is_stalled DESC, is_due_soon DESC,
         date(t.deadline) ASC, datetime(t.stage_entered_at) ASC
       LIMIT ${ATTENTION_LIMIT}`,
      [today, today, today, now, ...scope.params, today, today, today, now],
      ),
      queryAll<Record<string, unknown>>(
        `SELECT id, title, status, stage_key, created_at, stage_entered_at, creator_name, assignee_name, stage_total
         FROM (
           SELECT t.id, t.title, t.status,
             CASE WHEN t.status IN ('approved', 'production') THEN 'production' ELSE t.status END AS stage_key,
             t.created_at, t.stage_entered_at,
             creator.name AS creator_name, assignee.name AS assignee_name,
             COUNT(*) OVER (PARTITION BY CASE WHEN t.status IN ('approved', 'production') THEN 'production' ELSE t.status END) AS stage_total,
             ROW_NUMBER() OVER (PARTITION BY CASE WHEN t.status IN ('approved', 'production') THEN 'production' ELSE t.status END ORDER BY datetime(t.created_at) DESC, t.id DESC) AS preview_rank
           FROM topics t
           LEFT JOIN users creator ON creator.id = t.creator_id
           LEFT JOIN users assignee ON assignee.id = t.assignee_id
           WHERE t.status IN (${HOME_TOPIC_QUERY_STATUSES.map(() => '?').join(',')})${scope.sql}
         )
         WHERE preview_rank <= ${TOPIC_STAGE_PREVIEW_LIMIT}
         ORDER BY stage_key, preview_rank`,
        [...HOME_TOPIC_QUERY_STATUSES, ...scope.params],
      ),
      queryAll<Record<string, unknown>>(
        `SELECT p.id, p.topic_id, p.status, p.version, p.updated_at, t.title AS topic_title
         FROM production p
         LEFT JOIN topics t ON t.id = p.topic_id
         WHERE p.operator_id = ? AND p.status IN ('draft', 'rejected')
         ORDER BY datetime(p.created_at) DESC, p.id DESC
         LIMIT ${MY_DRAFT_PREVIEW_LIMIT}`,
        [req.user!.id],
      ),
      canViewSyncAnomalies
        ? queryOne<{ total: number }>(
          `${latestCreatorSyncCte}
           SELECT COUNT(*) AS total FROM latest_syncs WHERE ${creatorSyncAnomalyWhere}`,
        )
        : Promise.resolve({ total: 0 }),
      canViewSyncAnomalies
        ? queryAll<Record<string, unknown>>(
          `${latestCreatorSyncCte}
           SELECT latest_syncs.id, latest_syncs.platform, latest_syncs.status,
             latest_syncs.start_time, latest_syncs.success_count, latest_syncs.failed_count,
             owner.name AS owner_name,
             COALESCE(
               (SELECT NULLIF(account.nickname, '') FROM creator_platform_accounts account
                WHERE account.platform=latest_syncs.platform AND account.platform_uid=latest_syncs.account
                ORDER BY account.id DESC LIMIT 1),
               (SELECT NULLIF(account.account_name, '') FROM creator_platform_accounts account
                WHERE account.platform=latest_syncs.platform AND account.platform_uid=latest_syncs.account
                ORDER BY account.id DESC LIMIT 1),
               '抖音账号 · ' || substr(latest_syncs.account, -4)
             ) AS account_name,
             latest_syncs.account AS account_uid
           FROM latest_syncs
           LEFT JOIN users owner ON owner.id = latest_syncs.owner_id
           WHERE ${creatorSyncAnomalyWhere}
           ORDER BY datetime(latest_syncs.start_time) DESC, latest_syncs.id DESC
           LIMIT ${SYNC_ANOMALY_LIMIT}`,
        )
        : Promise.resolve([]),
      canViewProductionReviews
        ? queryOne<{ total: number }>(
          `SELECT COUNT(*) AS total
           FROM production p
           JOIN topics t ON t.id = p.topic_id
           WHERE p.status = 'review'${productionReviewScope.sql}`,
          productionReviewScope.params,
        )
        : Promise.resolve({ total: 0 }),
      canViewProductionReviews
        ? queryAll<Record<string, unknown>>(
          `SELECT p.id, p.topic_id, p.version, p.updated_at,
             t.title AS topic_title, operator.name AS operator_name, assignee.name AS assignee_name
           FROM production p
           JOIN topics t ON t.id = p.topic_id
           LEFT JOIN users operator ON operator.id = p.operator_id
           LEFT JOIN users assignee ON assignee.id = t.assignee_id
           WHERE p.status = 'review'${productionReviewScope.sql}
           ORDER BY datetime(p.updated_at) ASC, p.id ASC
           LIMIT ${PRODUCTION_REVIEW_LIMIT}`,
          productionReviewScope.params,
        )
        : Promise.resolve([]),
      retrospectiveSummary,
    ]);

    const topicStages = Object.fromEntries(HOME_TOPIC_STAGE_STATUSES.map((status) => [status, { total: 0, topics: [] as Array<Record<string, unknown>> }])) as Record<typeof HOME_TOPIC_STAGE_STATUSES[number], { total: number; topics: Array<Record<string, unknown>> }>;
    for (const row of topicStageRows) {
      const stageKey = String(row.stage_key) as typeof HOME_TOPIC_STAGE_STATUSES[number];
      const stage = topicStages[stageKey];
      if (!stage) continue;
      stage.total = Number(row.stage_total) || 0;
      stage.topics.push({
        id: Number(row.id),
        title: String(row.title || ''),
        status: String(row.status),
        created_at: String(row.created_at || ''),
        stage_entered_at: row.stage_entered_at === null ? null : String(row.stage_entered_at || ''),
        creator_name: row.creator_name === null ? null : String(row.creator_name || ''),
        assignee_name: row.assignee_name === null ? null : String(row.assignee_name || ''),
      });
    }

    return res.json({
      scope: canViewAllContent(req.user) ? 'all-visible-content' : 'personal',
      generated_at: now,
      stale_stage_days: STALE_STAGE_DAYS,
      active_topics: { total: Number(count?.active_total || 0), topics: activeTopicRows },
      counts: {
        overdue: Number(count?.overdue || 0),
        due_soon: Number(count?.due_soon || 0),
        stalled: Number(count?.stalled || 0),
        stage_time_unknown: Number(count?.stage_time_unknown || 0),
        total: Number(count?.total || 0),
      },
      today_publishing: {
        total: Number(todayPublishingCount?.total || 0),
        tasks: todayPublishingRows,
      },
      sync_anomalies: {
        available: canViewSyncAnomalies,
        total: Number(syncAnomalyCount?.total || 0),
        tasks: syncAnomalyRows,
      },
      production_reviews: {
        available: canViewProductionReviews,
        total: Number(productionReviewCount?.total || 0),
        tasks: productionReviewRows,
      },
      retrospectives,
      topics: topics.map((topic) => ({
        ...topic,
        is_overdue: Number(topic.is_overdue) === 1,
        is_due_soon: Number(topic.is_due_soon) === 1,
        is_stalled: Number(topic.is_stalled) === 1,
      })),
      topic_stages: topicStages,
      my_drafts: {
        tasks: myDraftRows.map((row) => ({
          id: Number(row.id),
          topic_id: row.topic_id === null ? null : Number(row.topic_id),
          topic_title: row.topic_title === null ? null : String(row.topic_title || ''),
          status: String(row.status),
          version: row.version === null ? null : String(row.version || ''),
          updated_at: String(row.updated_at || ''),
        })),
      },
    });
  } catch {
    return res.status(500).json({ message: '工作台摘要暂时无法读取，请重试。' });
  }
});

router.get('/home-activity', authenticate, async (req, res) => {
  try {
    const topic = topicActivityScope(req.user!);
    const production = productionActivityScope(req.user!);
    const [versions, reviewThreads, replies, topicTransitions] = await Promise.all([
      queryAll<Record<string, unknown>>(
        `SELECT ph.id, ph.production_id, ph.version, ph.change_type, ph.superseded_by_version, ph.created_at,
           t.title AS topic_title
         FROM production_history ph
         JOIN production p ON p.id = ph.production_id
         JOIN topics t ON t.id = p.topic_id
         WHERE ph.change_type IN ('major', 'minor')${production.sql}
         ORDER BY datetime(ph.created_at) DESC, ph.id DESC
         LIMIT ${HOME_ACTIVITY_SOURCE_LIMIT}`,
        production.params,
      ),
      queryAll<Record<string, unknown>>(
        `SELECT thread.id, thread.production_id, thread.version, thread.kind, thread.created_at,
           t.title AS topic_title
         FROM production_review_threads thread
         JOIN production p ON p.id = thread.production_id
         JOIN topics t ON t.id = p.topic_id
         WHERE 1=1${production.sql}
         ORDER BY datetime(thread.created_at) DESC, thread.id DESC
         LIMIT ${HOME_ACTIVITY_SOURCE_LIMIT}`,
        production.params,
      ),
      queryAll<Record<string, unknown>>(
        `SELECT reply.id, reply.thread_id, reply.created_at, thread.production_id, thread.version,
           t.title AS topic_title
         FROM production_review_replies reply
         JOIN production_review_threads thread ON thread.id = reply.thread_id
         JOIN production p ON p.id = thread.production_id
         JOIN topics t ON t.id = p.topic_id
         WHERE 1=1${production.sql}
         ORDER BY datetime(reply.created_at) DESC, reply.id DESC
         LIMIT ${HOME_ACTIVITY_SOURCE_LIMIT}`,
        production.params,
      ),
      queryAll<Record<string, unknown>>(
        `SELECT history.id, history.topic_id, history.action, history.created_at, topic.title AS topic_title
         FROM topic_history history
         JOIN topics topic ON topic.id = history.topic_id
         WHERE (history.action GLOB 'status_*' OR history.action IN ('approved', 'rejected'))${topic.sql}
         ORDER BY datetime(history.created_at) DESC, history.id DESC
         LIMIT ${HOME_ACTIVITY_SOURCE_LIMIT}`,
        topic.params,
      ),
    ]);

    const topicStatusText: Record<string, string> = {
      pending: '待审核',
      approved: '已通过',
      rejected: '已退回',
      production: '创作中',
      shooting: '成片制作',
      publishing: '待发布',
      completed: '已发布',
    };
    const events = [
      ...versions.map((row) => {
        const changeType = String(row.change_type || '');
        const previousVersion = String(row.version || '当前版本');
        const nextVersion = typeof row.superseded_by_version === 'string' ? row.superseded_by_version : null;
        return {
          id: `version-${row.id}`,
          kind: 'version' as const,
          label: '稿件版本',
          title: String(row.topic_title || '创作稿件'),
          detail: changeType === 'major' && nextVersion
            ? `另开新版 · ${previousVersion} → ${nextVersion}`
            : `小修 · 基于 ${previousVersion}`,
          occurred_at: String(row.created_at || ''),
          path: `/production/${row.production_id}`,
        };
      }),
      ...reviewThreads.map((row) => {
        const kind = row.kind === 'suggestion' ? '稿件建议' : '稿件批注';
        const version = String(row.version || '当前版本');
        return {
          id: `review-${row.id}`,
          kind: 'review' as const,
          label: kind,
          title: String(row.topic_title || '创作稿件'),
          detail: `${version} · 新增${row.kind === 'suggestion' ? '建议' : '批注'}`,
          occurred_at: String(row.created_at || ''),
          path: `/production/${row.production_id}?version=${encodeURIComponent(version)}`,
        };
      }),
      ...replies.map((row) => {
        const version = String(row.version || '当前版本');
        return {
          id: `reply-${row.id}`,
          kind: 'reply' as const,
          label: '批注回复',
          title: String(row.topic_title || '创作稿件'),
          detail: `${version} · 有新回复`,
          occurred_at: String(row.created_at || ''),
          path: `/production/${row.production_id}?version=${encodeURIComponent(version)}`,
        };
      }),
      ...topicTransitions.map((row) => {
        const action = String(row.action || '');
        const status = action.startsWith('status_') ? action.slice('status_'.length) : action;
        const statusText = topicStatusText[status];
        return {
          id: `topic-status-${row.id}`,
          kind: 'topic_status' as const,
          label: '选题状态',
          title: String(row.topic_title || '选题'),
          detail: statusText ? `阶段更新至${statusText}` : '选题阶段有更新',
          occurred_at: String(row.created_at || ''),
          path: `/topics/${row.topic_id}`,
        };
      }),
    ].sort((left, right) => Date.parse(right.occurred_at) - Date.parse(left.occurred_at)).slice(0, HOME_ACTIVITY_LIMIT);

    return res.json({
      scope: canViewAllContent(req.user) ? 'all-visible-content' : 'personal',
      generated_at: beijingNow(),
      events,
    });
  } catch {
    return res.status(500).json({ message: '获取最近变化失败' });
  }
});

export default router;
