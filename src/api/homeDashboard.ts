import { useAuthStore } from '../store';

export type HomeAttentionTopic = {
  id: number;
  title: string;
  status: string;
  deadline: string | null;
  stage_entered_at: string | null;
  assignee_name?: string | null;
  is_overdue: boolean;
  is_due_soon: boolean;
  is_stalled: boolean;
};

export type HomePipelineTopic = {
  id: number;
  title: string;
  status: 'pending' | 'approved' | 'production' | 'shooting' | 'publishing' | 'completed';
  created_at: string;
  stage_entered_at: string | null;
  creator_name: string | null;
  assignee_name: string | null;
};

export type HomePipelineStage = 'pending' | 'production' | 'shooting' | 'publishing' | 'completed';

export type HomeDraftTask = {
  id: number;
  topic_id: number | null;
  topic_title: string | null;
  status: 'draft' | 'rejected';
  version: string | null;
  updated_at: string;
};

export type HomeAttentionSummary = {
  scope: 'all-visible-content' | 'personal';
  generated_at: string;
  stale_stage_days: number;
  active_topics: { total: number; topics: Array<{ id: number; title: string; status: string }> };
  counts: { overdue: number; due_soon: number; stalled: number; stage_time_unknown: number; total: number };
  today_publishing: {
    total: number;
    tasks: HomeTodayPublishingTask[];
  };
  sync_anomalies: {
    available: boolean;
    total: number;
    tasks: HomeSyncAnomalyTask[];
  };
  production_reviews: {
    available: boolean;
    total: number;
    tasks: HomeProductionReviewTask[];
  };
  retrospectives: {
    available: boolean;
    total: number;
    tasks: HomeRetrospectiveTask[];
  };
  topics: HomeAttentionTopic[];
  topic_stages: Record<HomePipelineStage, { total: number; topics: HomePipelineTopic[] }>;
  my_drafts: { tasks: HomeDraftTask[] };
};

export type HomeActivityEvent = {
  id: string;
  kind: 'version' | 'review' | 'reply' | 'topic_status';
  label: string;
  title: string;
  detail: string;
  occurred_at: string;
  path: string;
};

export type HomeActivitySummary = {
  scope: 'all-visible-content' | 'personal';
  generated_at: string;
  events: HomeActivityEvent[];
};

const INVALID_HOME_ATTENTION_MESSAGE = '工作台摘要数据格式暂不兼容，请重新加载；如问题持续，请联系管理员。';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(isRecord);
}

function hasCountAndRecords(value: unknown): value is Record<string, unknown> & { total: number; tasks: Record<string, unknown>[] } {
  return isRecord(value) && typeof value.total === 'number' && Number.isFinite(value.total) && isRecordArray(value.tasks);
}

function isHomeAttentionSummary(value: unknown): value is HomeAttentionSummary {
  if (!isRecord(value) || !isRecord(value.active_topics) || !isRecord(value.counts)) return false;

  const counts = value.counts;
  const stages = value.topic_stages;
  const stageNames: HomePipelineStage[] = ['pending', 'production', 'shooting', 'publishing', 'completed'];
  const hasStagePreviews = isRecord(stages) && stageNames.every((stage) => {
    const entry = stages[stage];
    return isRecord(entry) && typeof entry.total === 'number' && Number.isFinite(entry.total) && isRecordArray(entry.topics);
  });

  return (value.scope === 'all-visible-content' || value.scope === 'personal')
    && typeof value.generated_at === 'string'
    && typeof value.stale_stage_days === 'number' && Number.isFinite(value.stale_stage_days)
    && typeof value.active_topics.total === 'number' && Number.isFinite(value.active_topics.total)
    && isRecordArray(value.active_topics.topics)
    && ['overdue', 'due_soon', 'stalled', 'stage_time_unknown', 'total'].every((key) => typeof counts[key] === 'number' && Number.isFinite(counts[key]))
    && hasCountAndRecords(value.today_publishing)
    && hasCountAndRecords(value.sync_anomalies)
    && typeof value.sync_anomalies.available === 'boolean'
    && hasCountAndRecords(value.production_reviews)
    && typeof value.production_reviews.available === 'boolean'
    && hasCountAndRecords(value.retrospectives)
    && typeof value.retrospectives.available === 'boolean'
    && isRecordArray(value.topics)
    && hasStagePreviews
    && isRecord(value.my_drafts) && isRecordArray(value.my_drafts.tasks);
}

export type HomeTodayPublishingTask = {
  id: number;
  topic_id: number;
  topic_title: string;
  platform: string | null;
  publish_time: string;
  status: 'pending' | 'scheduled';
  operator_name: string | null;
};

export type HomeSyncAnomalyTask = {
  id: number;
  platform: string;
  account_name: string;
  account_uid: string;
  status: 'failed' | 'partial_success';
  start_time: string;
  success_count: number;
  failed_count: number;
  owner_name: string | null;
};

export type HomeProductionReviewTask = {
  id: number;
  topic_id: number;
  topic_title: string;
  version: string | null;
  updated_at: string;
  operator_name: string | null;
  assignee_name: string | null;
};

export type HomeRetrospectiveTask = {
  id: number;
  title: string;
  period_start: string;
  period_end: string;
  status: 'draft' | 'published' | 'archived';
  updated_at: string;
};

export async function getHomeAttention(signal?: AbortSignal): Promise<HomeAttentionSummary> {
  const token = useAuthStore.getState().token;
  const response = await fetch('/api/dashboard/home-attention', {
    signal,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload && typeof payload.message === 'string' ? payload.message : '工作台摘要暂时无法读取，请重试。';
    throw new Error(message);
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!isHomeAttentionSummary(payload)) throw new Error(INVALID_HOME_ATTENTION_MESSAGE);
  return payload;
}

export async function getHomeActivity(signal?: AbortSignal): Promise<HomeActivitySummary> {
  const token = useAuthStore.getState().token;
  const response = await fetch('/api/dashboard/home-activity', {
    signal,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload && typeof payload.message === 'string' ? payload.message : '获取最近变化失败';
    throw new Error(message);
  }
  return response.json();
}
