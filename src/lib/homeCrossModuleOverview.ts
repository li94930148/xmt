import type { HomeAttentionSummary } from '@/api';

export type HomeCrossModuleSummary = Pick<
  HomeAttentionSummary,
  'scope' | 'counts' | 'today_publishing' | 'sync_anomalies' | 'production_reviews' | 'topic_stages'
>;

export type HomeCrossModuleMetric = {
  id: string;
  label: string;
  count: number;
  detail: string;
  path: string;
};

export type HomeCrossModuleOptions = {
  isManagementRole: boolean;
  hasTopicAudit: boolean;
  hasPublishingAccess: boolean;
  actionableMessageCount: number | null;
};

export function buildHomeCrossModuleMetrics(
  summary: HomeCrossModuleSummary | null,
  options: HomeCrossModuleOptions,
): HomeCrossModuleMetric[] {
  if (!summary) return [];

  const metrics: HomeCrossModuleMetric[] = [{
    id: 'topic-attention',
    label: '选题卡点',
    count: summary.counts.total,
    detail: `逾期 ${summary.counts.overdue} · 卡点 ${summary.counts.stalled} · 临近 ${summary.counts.due_soon}`,
    path: '/topics',
  }];

  if (options.hasTopicAudit) metrics.push({
    id: 'topic-review',
    label: '待审选题',
    count: summary.topic_stages.pending.total,
    detail: '进入选题审核',
    path: '/topics?status=pending',
  });

  if (summary.production_reviews.available) metrics.push({
    id: 'production-review',
    label: '待审稿件',
    count: summary.production_reviews.total,
    detail: '按现有稿件权限范围',
    path: '/production',
  });

  if (options.hasPublishingAccess) metrics.push({
    id: 'today-publishing',
    label: '今日待发布',
    count: summary.today_publishing.total,
    detail: '按现有发布权限范围',
    path: '/publishing',
  });

  if (options.isManagementRole && summary.sync_anomalies.available) metrics.push({
    id: 'sync-anomalies',
    label: '同步异常',
    count: summary.sync_anomalies.total,
    detail: '失败或未完整的账号',
    path: '/analytics/creator-center',
  });

  if (options.isManagementRole && options.actionableMessageCount !== null) metrics.push({
    id: 'actionable-messages',
    label: '待办消息',
    count: options.actionableMessageCount,
    detail: '未读且可跟进',
    path: '/messages?filter=actionable',
  });

  return metrics;
}
