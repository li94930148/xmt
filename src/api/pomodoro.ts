import { useAuthStore } from '../store';
import type { PomodoroSession, PomodoroStats, PomodoroRanking } from '@shared/types';

const BASE_URL = '/api';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type { PomodoroSession, PomodoroStats, PomodoroRanking };

export async function startPomodoro(data?: { duration?: number; topic_id?: number }): Promise<PomodoroSession> {
  const response = await fetch(`${BASE_URL}/pomodoro/start`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {})
  });
  if (!response.ok) throw new Error('开始番茄钟失败');
  return response.json();
}

export async function completePomodoro(id: number): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/pomodoro/${id}/complete`, {
    method: 'POST',
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('完成番茄钟失败');
  return response.json();
}

export async function getPomodoroStats(): Promise<PomodoroStats> {
  const response = await fetch(`${BASE_URL}/pomodoro/stats`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取番茄钟统计失败');
  return response.json();
}

export async function getPomodoroRanking(): Promise<PomodoroRanking[]> {
  const response = await fetch(`${BASE_URL}/pomodoro/ranking`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取番茄钟排行榜失败');
  return response.json();
}
