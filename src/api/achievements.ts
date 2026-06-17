import { useAuthStore } from '../store';
import type { Achievement, AchievementStats, AchievementProgress, LeaderboardEntry, RecentAchievement } from '@shared/types';

const BASE_URL = '/api';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type { Achievement, AchievementStats, AchievementProgress, LeaderboardEntry, RecentAchievement };

// 获取所有成就定义
export async function getAchievements(category?: string, rarity?: string): Promise<Achievement[]> {
  const params = new URLSearchParams();
  if (category && category !== 'all') params.set('category', category);
  if (rarity && rarity !== 'all') params.set('rarity', rarity);
  const qs = params.toString();
  const url = `${BASE_URL}/achievements${qs ? '?' + qs : ''}`;

  const response = await fetch(url, { headers: getAuthHeader() });
  if (!response.ok) throw new Error('获取成就列表失败');
  const json = await response.json();
  return json.data || json;
}

// 获取当前用户的成就
export async function getMyAchievements(): Promise<Achievement[]> {
  const response = await fetch(`${BASE_URL}/achievements/me`, { headers: getAuthHeader() });
  if (!response.ok) throw new Error('获取我的成就失败');
  const json = await response.json();
  return json.data || json;
}

// 获取成就进度
export async function getAchievementProgress(): Promise<Record<number, AchievementProgress>> {
  const response = await fetch(`${BASE_URL}/achievements/progress`, { headers: getAuthHeader() });
  if (!response.ok) throw new Error('获取成就进度失败');
  const json = await response.json();
  return json.data || json;
}

// 获取成就统计
export async function getAchievementStats(): Promise<AchievementStats> {
  const response = await fetch(`${BASE_URL}/achievements/stats`, { headers: getAuthHeader() });
  if (!response.ok) throw new Error('获取成就统计失败');
  const json = await response.json();
  return json.data || json;
}

// 获取积分排行榜
export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const response = await fetch(`${BASE_URL}/achievements/leaderboard`, { headers: getAuthHeader() });
  if (!response.ok) throw new Error('获取排行榜失败');
  const json = await response.json();
  return json.data || json;
}

// 获取最近获得的成就
export async function getRecentAchievements(limit = 10): Promise<RecentAchievement[]> {
  const response = await fetch(`${BASE_URL}/achievements/recent?limit=${limit}`, { headers: getAuthHeader() });
  if (!response.ok) throw new Error('获取最近成就失败');
  const json = await response.json();
  return json.data || json;
}

// 检查并授予成就
export async function checkAchievements(): Promise<{ message: string; newAchievements: Achievement[] }> {
  const response = await fetch(`${BASE_URL}/achievements/check`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error('检查成就失败');
  return response.json();
}

// 创建成就（管理员）
export async function createAchievement(data: Partial<Achievement>): Promise<{ id: number }> {
  const response = await fetch(`${BASE_URL}/achievements`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('创建成就失败');
  return response.json();
}

// 更新成就（管理员）
export async function updateAchievement(id: number, data: Partial<Achievement>): Promise<void> {
  const response = await fetch(`${BASE_URL}/achievements/${id}`, {
    method: 'PUT',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('更新成就失败');
}

// 删除成就（管理员）
export async function deleteAchievement(id: number): Promise<void> {
  const response = await fetch(`${BASE_URL}/achievements/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  });
  if (!response.ok) throw new Error('删除成就失败');
}

// 初始化预设成就（管理员）
export async function seedAchievements(): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/achievements/seed`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error('初始化成就失败');
  return response.json();
}
