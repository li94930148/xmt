import { useAuthStore } from '../store';
import type { Analytics, TeamStats, MonthlyStats, UserStats } from '../types';

const BASE_URL = '/api';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getTeamStats(params?: { month?: number; year?: number }): Promise<TeamStats> {
  const query = new URLSearchParams(params as Record<string, string>);
  const response = await fetch(`${BASE_URL}/analytics/team?${query}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取团队统计失败');
  return response.json();
}

export async function getMonthlyStats(params?: { month?: number; year?: number }): Promise<MonthlyStats> {
  const query = new URLSearchParams(params as Record<string, string>);
  const response = await fetch(`${BASE_URL}/analytics/monthly?${query}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取月度统计失败');
  return response.json();
}

export async function getUserStats(params?: { month?: number; year?: number }): Promise<UserStats[]> {
  const query = new URLSearchParams(params as Record<string, string>);
  const response = await fetch(`${BASE_URL}/analytics/user?${query}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取用户统计失败');
  return response.json();
}

export async function createAnalytics(data: { topic_id: number; views: number; likes: number; shares: number; comments: number; data_date: string }): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/analytics`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('录入数据失败');
  return response.json();
}

export async function getTopicAnalytics(topicId: number): Promise<Analytics[]> {
  const response = await fetch(`${BASE_URL}/analytics/topic/${topicId}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取选题数据失败');
  return response.json();
}
