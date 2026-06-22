import { useAuthStore } from '../store';
import type { ContentOSContext, ContentOSInsight, ContentOSResolvedState } from '../content/orchestrator/types';

const BASE_URL = '/api/content/os';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: getAuthHeader(),
  });

  if (!response.ok) {
    throw new Error('获取内容操作系统上下文失败');
  }

  return response.json();
}

export function getContentOSContext(docId: string) {
  return request<ContentOSContext>(`/context/${encodeURIComponent(docId)}`);
}

export function getContentOSInsight(docId: string) {
  return request<ContentOSInsight>(`/insight/${encodeURIComponent(docId)}`);
}

export function getContentOSState(docId: string) {
  return request<{
    docId: string;
    state: ContentOSResolvedState;
  }>(`/state/${encodeURIComponent(docId)}`);
}
