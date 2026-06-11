import { useAuthStore } from '../store';
import type { Inspiration, InspirationComment } from '@shared/types';

const BASE_URL = '/api';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type { Inspiration, InspirationComment };

export async function getInspirations(params?: {
  search?: string;
  category?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: Inspiration[]; total: number }> {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.category) query.set('category', params.category);
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));

  const response = await fetch(`${BASE_URL}/inspirations?${query}`, {
    headers: getAuthHeader(),
  });
  if (!response.ok) throw new Error('获取灵感列表失败');
  return response.json();
}

export async function createInspirition(data: {
  title: string;
  description?: string;
  category?: string;
}): Promise<{ message: string; id: number }> {
  const response = await fetch(`${BASE_URL}/inspirations`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('创建灵感失败');
  return response.json();
}

export async function voteInspiration(id: number): Promise<{ message: string; voted: boolean }> {
  const response = await fetch(`${BASE_URL}/inspirations/${id}/vote`, {
    method: 'POST',
    headers: getAuthHeader(),
  });
  if (!response.ok) throw new Error('投票失败');
  return response.json();
}

export async function deleteInspiration(id: number): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/inspirations/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  });
  if (!response.ok) throw new Error('删除灵感失败');
  return response.json();
}

export async function promoteInspiration(id: number): Promise<{ message: string; topicId: number }> {
  const response = await fetch(`${BASE_URL}/inspirations/${id}/promote`, {
    method: 'POST',
    headers: getAuthHeader(),
  });
  if (!response.ok) throw new Error('转为选题失败');
  return response.json();
}

export async function getInspirationDetail(
  id: number
): Promise<{ inspiration: Inspiration; comments: InspirationComment[] }> {
  const response = await fetch(`${BASE_URL}/inspirations/${id}`, {
    headers: getAuthHeader(),
  });
  if (!response.ok) throw new Error('获取灵感详情失败');
  return response.json();
}

export async function createInspirationComment(
  id: number,
  content: string
): Promise<{ message: string; comment: InspirationComment; comment_count: number }> {
  const response = await fetch(`${BASE_URL}/inspirations/${id}/comments`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!response.ok) throw new Error('发表评论失败');
  return response.json();
}
