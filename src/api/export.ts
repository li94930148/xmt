import { useAuthStore } from '../store';

const BASE_URL = '/api';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function exportTopics(): Promise<any[]> {
  const response = await fetch(`${BASE_URL}/export/topics`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('导出选题数据失败');
  return response.json();
}

export async function exportAnalytics(): Promise<any[]> {
  const response = await fetch(`${BASE_URL}/export/analytics`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('导出分析数据失败');
  return response.json();
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
