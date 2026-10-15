import { queryAll, queryOne } from '../database/utils';

export const PUBLISHING_METRIC_FIELDS = ['views', 'likes', 'shares', 'comments'] as const;
export type PublishingMetricField = (typeof PUBLISHING_METRIC_FIELDS)[number];
export type PublishingMetricSource =
  | 'douyin_official_export'
  | 'manual'
  | 'douyin_creator_collection'
  | 'douyin_legacy_current'
  | 'legacy_analytics'
  | 'unavailable';

const metricColumns: Record<PublishingMetricField, {
  manual: string;
  snapshot: string;
  presence: string;
}> = {
  views: { manual: 'manual_views', snapshot: 'play_count', presence: 'has_play_count' },
  likes: { manual: 'manual_likes', snapshot: 'like_count', presence: 'has_like_count' },
  shares: { manual: 'manual_shares', snapshot: 'share_count', presence: 'has_share_count' },
  comments: { manual: 'manual_comments', snapshot: 'comment_count', presence: 'has_comment_count' },
};

function metricSql(field: PublishingMetricField): string {
  const columns = metricColumns[field];
  return `CASE
    WHEN official_snapshot.id IS NOT NULL AND official_snapshot.${columns.presence}=1 THEN official_snapshot.${columns.snapshot}
    WHEN p.${columns.manual} IS NOT NULL THEN p.${columns.manual}
    WHEN collection_snapshot.id IS NOT NULL AND collection_snapshot.${columns.presence}=1 THEN collection_snapshot.${columns.snapshot}
    WHEN dw.id IS NOT NULL AND official_snapshot.id IS NULL AND collection_snapshot.id IS NULL THEN dw.${columns.snapshot}
    WHEN legacy_analytics.id IS NOT NULL THEN legacy_analytics.${field}
    ELSE 0 END`;
}

function sourceSql(field: PublishingMetricField): string {
  const columns = metricColumns[field];
  return `CASE
    WHEN official_snapshot.id IS NOT NULL AND official_snapshot.${columns.presence}=1 THEN 'douyin_official_export'
    WHEN p.${columns.manual} IS NOT NULL THEN 'manual'
    WHEN collection_snapshot.id IS NOT NULL AND collection_snapshot.${columns.presence}=1 THEN 'douyin_creator_collection'
    WHEN dw.id IS NOT NULL AND official_snapshot.id IS NULL AND collection_snapshot.id IS NULL THEN 'douyin_legacy_current'
    WHEN legacy_analytics.id IS NOT NULL THEN 'legacy_analytics'
    ELSE 'unavailable' END`;
}

export const publishingMetricSelect = `
  p.id,p.topic_id,p.operator_id,p.status AS publishing_status,p.publish_time AS publishing_publish_time,
  CASE WHEN dw.id IS NOT NULL THEN 'douyin' ELSE p.platform END AS metric_platform,
  COALESCE(dw.publish_time,p.publish_time) AS metric_publish_time,
  p.manual_views,p.manual_likes,p.manual_shares,p.manual_comments,p.manual_metrics_updated_at,p.manual_metrics_updated_by,
  dw.id AS douyin_work_id,official_snapshot.snapshot_time AS official_metrics_observed_at,
  official_snapshot.source_file_sha256 AS official_source_file_sha256,
  ${PUBLISHING_METRIC_FIELDS.map((field) => `${metricSql(field)} AS ${field}`).join(',\n  ')},
  ${PUBLISHING_METRIC_FIELDS.map((field) => `${sourceSql(field)} AS ${field}_source`).join(',\n  ')}
`;

export const publishingMetricJoins = `
  LEFT JOIN publishing_douyin_links link ON link.publishing_id=p.id
  LEFT JOIN douyin_works dw ON dw.id=link.douyin_work_id
  LEFT JOIN douyin_work_snapshots official_snapshot ON official_snapshot.id=(
    SELECT snapshot.id FROM douyin_work_snapshots snapshot
    WHERE snapshot.work_id=dw.id AND snapshot.source_type='douyin_official_export'
    ORDER BY snapshot.snapshot_time DESC,snapshot.id DESC LIMIT 1
  )
  LEFT JOIN douyin_work_snapshots collection_snapshot ON collection_snapshot.id=(
    SELECT snapshot.id FROM douyin_work_snapshots snapshot
    WHERE snapshot.work_id=dw.id AND snapshot.source_type='douyin_creator_collection'
    ORDER BY snapshot.snapshot_time DESC,snapshot.id DESC LIMIT 1
  )
  LEFT JOIN analytics legacy_analytics ON legacy_analytics.id=(
    SELECT old.id FROM analytics old
    WHERE old.topic_id=p.topic_id
      AND date(old.data_date)=date(COALESCE(dw.publish_time,p.publish_time))
      AND (
        SELECT COUNT(*) FROM publishing same_day
        LEFT JOIN publishing_douyin_links same_day_link ON same_day_link.publishing_id=same_day.id
        LEFT JOIN douyin_works same_day_work ON same_day_work.id=same_day_link.douyin_work_id
        WHERE same_day.topic_id=p.topic_id
          AND date(COALESCE(same_day_work.publish_time,same_day.publish_time))=date(COALESCE(dw.publish_time,p.publish_time))
      )=1
    ORDER BY old.id DESC LIMIT 1
  )
`;

export type PublishingMetricFact = {
  id: number;
  topic_id: number;
  operator_id: number | null;
  publishing_status: string;
  metric_platform: string | null;
  publishing_publish_time: string | null;
  metric_publish_time: string | null;
  manual_views: number | null;
  manual_likes: number | null;
  manual_shares: number | null;
  manual_comments: number | null;
  manual_metrics_updated_at: string | null;
  manual_metrics_updated_by: number | null;
  douyin_work_id: number | null;
  official_metrics_observed_at: string | null;
  official_source_file_sha256: string | null;
} & Record<PublishingMetricField, number> & Record<`${PublishingMetricField}_source`, PublishingMetricSource>;

export async function getPublishingMetricFacts(options: {
  startDate?: string;
  endDate?: string;
  topicId?: number;
  topicIds?: number[];
  publishingId?: number;
  publishedOnly?: boolean;
} = {}): Promise<PublishingMetricFact[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (options.startDate) {
    conditions.push(`date(COALESCE(dw.publish_time,p.publish_time))>=date(?)`);
    params.push(options.startDate);
  }
  if (options.endDate) {
    conditions.push(`date(COALESCE(dw.publish_time,p.publish_time))<=date(?)`);
    params.push(options.endDate);
  }
  if (options.topicId) {
    conditions.push('p.topic_id=?');
    params.push(options.topicId);
  }
  if (options.topicIds) {
    if (options.topicIds.length === 0) return [];
    conditions.push(`p.topic_id IN (${options.topicIds.map(() => '?').join(',')})`);
    params.push(...options.topicIds);
  }
  if (options.publishingId) {
    conditions.push('p.id=?');
    params.push(options.publishingId);
  }
  if (options.publishedOnly) conditions.push(`(dw.id IS NOT NULL OR p.status='published')`);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await queryAll<Record<string, unknown>>(
    `SELECT ${publishingMetricSelect}
     FROM publishing p
     ${publishingMetricJoins}
     ${where}
     ORDER BY COALESCE(dw.publish_time,p.publish_time) DESC,p.id DESC`,
    params,
  );
  return rows.map((row) => ({
    ...row,
    id: Number(row.id),
    topic_id: Number(row.topic_id),
    operator_id: row.operator_id == null ? null : Number(row.operator_id),
    publishing_status: String(row.publishing_status || ''),
    metric_platform: row.metric_platform == null ? null : String(row.metric_platform),
    publishing_publish_time: row.publishing_publish_time == null ? null : String(row.publishing_publish_time),
    metric_publish_time: row.metric_publish_time == null ? null : String(row.metric_publish_time),
    manual_views: row.manual_views == null ? null : Number(row.manual_views),
    manual_likes: row.manual_likes == null ? null : Number(row.manual_likes),
    manual_shares: row.manual_shares == null ? null : Number(row.manual_shares),
    manual_comments: row.manual_comments == null ? null : Number(row.manual_comments),
    manual_metrics_updated_at: row.manual_metrics_updated_at == null ? null : String(row.manual_metrics_updated_at),
    manual_metrics_updated_by: row.manual_metrics_updated_by == null ? null : Number(row.manual_metrics_updated_by),
    douyin_work_id: row.douyin_work_id == null ? null : Number(row.douyin_work_id),
    official_metrics_observed_at: row.official_metrics_observed_at == null ? null : String(row.official_metrics_observed_at),
    official_source_file_sha256: row.official_source_file_sha256 == null ? null : String(row.official_source_file_sha256),
    views: Number(row.views || 0),
    likes: Number(row.likes || 0),
    shares: Number(row.shares || 0),
    comments: Number(row.comments || 0),
    views_source: String(row.views_source || 'unavailable') as PublishingMetricSource,
    likes_source: String(row.likes_source || 'unavailable') as PublishingMetricSource,
    shares_source: String(row.shares_source || 'unavailable') as PublishingMetricSource,
    comments_source: String(row.comments_source || 'unavailable') as PublishingMetricSource,
  })) as PublishingMetricFact[];
}

export async function getLegacyAnalyticsInventory(startDate: string, endDate: string) {
  return queryOne<{ unlinked_count: number; ambiguous_count: number }>(
    `SELECT
       SUM(CASE WHEN match_count=0 THEN 1 ELSE 0 END) AS unlinked_count,
       SUM(CASE WHEN match_count>1 THEN 1 ELSE 0 END) AS ambiguous_count
     FROM (
       SELECT old.id,(
         SELECT COUNT(*) FROM publishing same_day
         LEFT JOIN publishing_douyin_links same_day_link ON same_day_link.publishing_id=same_day.id
         LEFT JOIN douyin_works same_day_work ON same_day_work.id=same_day_link.douyin_work_id
         WHERE same_day.topic_id=old.topic_id
           AND date(COALESCE(same_day_work.publish_time,same_day.publish_time))=date(old.data_date)
       ) AS match_count
       FROM analytics old
       WHERE date(old.data_date) BETWEEN date(?) AND date(?)
     )`,
    [startDate, endDate],
  );
}

export function sumPublishingMetricFacts(facts: PublishingMetricFact[]) {
  const sourceCounts: Record<PublishingMetricSource, number> = {
    douyin_official_export: 0,
    manual: 0,
    douyin_creator_collection: 0,
    douyin_legacy_current: 0,
    legacy_analytics: 0,
    unavailable: 0,
  };
  const totals = { total_views: 0, total_likes: 0, total_shares: 0, total_comments: 0 };
  for (const fact of facts) {
    totals.total_views += fact.views;
    totals.total_likes += fact.likes;
    totals.total_shares += fact.shares;
    totals.total_comments += fact.comments;
    for (const field of PUBLISHING_METRIC_FIELDS) sourceCounts[fact[`${field}_source`]] += 1;
  }
  return { ...totals, sourceCounts };
}
