import { useAuthStore } from '../store';

const BASE_URL = '/api';

export interface TopicExportRecord {
  id: number;
  title: string;
  description?: string | null;
  status: string;
  platform?: string | null;
  deadline?: string | null;
  creator_name?: string | null;
  assignee_name?: string | null;
  creator_id?: number | null;
  assignee_id?: number | null;
  created_at: string;
  updated_at: string;
}

export interface TopicsExportResponse {
  data: TopicExportRecord[];
  stats: { total: number; byStatus: Record<string, number>; byPlatform: Record<string, number> };
  exportTime: string;
}

export interface AnalyticsExportResponse {
  topicStats: { status: string; count: number }[];
  userActivity: { id: number; name: string; topics_created: number; pomodoros_completed: number }[];
  dailyTrend: { date: string; topics_created: number }[];
  platformDistribution: { platform: string; count: number }[];
  exportTime: string;
}

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function exportTopics(): Promise<TopicsExportResponse> {
  const response = await fetch(`${BASE_URL}/export/topics`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('导出选题数据失败');
  return response.json() as Promise<TopicsExportResponse>;
}

export async function exportAnalytics(): Promise<AnalyticsExportResponse> {
  const response = await fetch(`${BASE_URL}/export/analytics`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('导出分析数据失败');
  return response.json() as Promise<AnalyticsExportResponse>;
}

export async function getWeeklyReport(): Promise<{
  period: { start: string; end: string };
  summary: {
    completedTopics: number;
    publishedVideos: number;
    newTopics: number;
    totalViews: number;
    totalLikes: number;
    totalShares: number;
    totalComments: number;
    pomodoroSessions: number;
    focusMinutes: number;
  };
  details: {
    completedTopics: { id: number; title: string; updated_at: string; creator_name?: string }[];
    publishedVideos: { id: number; topic_title: string; platform: string; publish_time: string }[];
    newTopics: { id: number; title: string; created_at: string }[];
    topInspirations: { id: number; title: string; votes: number }[];
  };
  generatedAt: string;
}> {
  const response = await fetch(`${BASE_URL}/export/weekly-report`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取周报数据失败');
  return response.json();
}
