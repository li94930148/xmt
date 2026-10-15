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
  status: 'pending' | 'production' | 'shooting' | 'publishing' | 'completed';
  created_at: string;
  stage_entered_at: string | null;
  creator_name: string | null;
  assignee_name: string | null;
};

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
  counts: { overdue: number; due_soon: number; stalled: number; total: number };
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
  topic_stages: Record<HomePipelineTopic['status'], { total: number; topics: HomePipelineTopic[] }>;
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
  return response.json();
}

export async function getHomeActivity(): Promise<HomeActivitySummary> {
  const token = useAuthStore.getState().token;
  const response = await fetch('/api/dashboard/home-activity', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload && typeof payload.message === 'string' ? payload.message : '获取最近变化失败';
    throw new Error(message);
  }
  return response.json();
}
