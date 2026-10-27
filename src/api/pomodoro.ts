import { useAuthStore } from '../store';
import type { PomodoroSession, PomodoroStats, PomodoroRanking } from '@shared/types';

const BASE_URL = '/api';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type { PomodoroSession, PomodoroStats, PomodoroRanking };

export type ActivePomodoroSession = {
  id: number;
  sessionId: number;
  duration: number;
  topicId: number | null;
  startedAt: string;
  remainingSeconds: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function startPomodoro(data?: { duration?: number; topic_id?: number }): Promise<{
  sessionId: number;
  message: string;
  duration?: number;
  startedAt?: string;
  remainingSeconds?: number;
  resumed?: boolean;
}> {
  const response = await fetch(`${BASE_URL}/pomodoro/start`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {})
  });
  if (!response.ok) throw new Error('开始番茄钟失败');
  return response.json();
}

export async function getActivePomodoro(): Promise<ActivePomodoroSession | null> {
  const response = await fetch(`${BASE_URL}/pomodoro/active`, {
    headers: getAuthHeader(),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('读取当前番茄钟失败');
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Object.prototype.hasOwnProperty.call(payload, 'session')) {
    throw new Error('当前番茄钟数据格式异常');
  }
  if (payload.session === null) return null;
  if (!isRecord(payload.session)) throw new Error('当前番茄钟数据格式异常');

  const session = payload.session;
  const id = session.id;
  const sessionId = session.sessionId;
  const duration = session.duration;
  const topicId = session.topicId;
  const startedAt = session.startedAt;
  const remainingSeconds = session.remainingSeconds;
  const isPositiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
  if (!isPositiveInteger(id)
    || !isPositiveInteger(sessionId)
    || id !== sessionId
    || !isPositiveInteger(duration)
    || duration > 180
    || !(topicId === null || isPositiveInteger(topicId))
    || typeof startedAt !== 'string'
    || !Number.isFinite(Date.parse(startedAt))
    || typeof remainingSeconds !== 'number'
    || !Number.isSafeInteger(remainingSeconds)
    || remainingSeconds < 0
    || remainingSeconds > duration * 60) {
    throw new Error('当前番茄钟数据格式异常');
  }

  return { id, sessionId, duration, topicId, startedAt, remainingSeconds };
}

export async function cancelPomodoro(id: number): Promise<void> {
  const response = await fetch(`${BASE_URL}/pomodoro/${id}/cancel`, {
    method: 'POST', headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('放弃番茄钟失败');
}

export async function completePomodoro(id: number): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/pomodoro/${id}/complete`, {
    method: 'POST',
    headers: getAuthHeader()
  });
  if (!response.ok) {
    if (response.status === 400) {
      const payload = await response.json().catch(() => null) as { message?: unknown } | null;
      if (payload?.message === '该番茄钟已完成') return { message: '番茄钟完成！' };
    }
    throw new Error('完成番茄钟失败');
  }
  return response.json();
}

export async function getPomodoroStats(): Promise<{ today: number; week: number; totalMinutes: number }> {
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
  const payload = await response.json() as { data?: PomodoroRanking[] };
  return Array.isArray(payload.data) ? payload.data : [];
}
