import { useAuthStore } from '../store';
import type { Topic } from '../types';

const BASE_URL = '/api';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function getErrorMessage(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  if (payload && typeof payload === 'object') {
    const record = payload as { message?: unknown; error?: unknown };
    if (typeof record.message === 'string' && record.message) {
      return record.message;
    }
    if (typeof record.error === 'string' && record.error) {
      return record.error;
    }
  }
  return fallback;
}

function buildTopicsQuery(params?: { status?: string; search?: string; page?: number; limit?: number }): string {
  const query = new URLSearchParams();
  const status = params?.status?.trim();
  const search = params?.search?.trim();
  if (status) query.set('status', status);
  if (search) query.set('search', search);
  query.set('page', String(params?.page ?? 1));
  query.set('limit', String(params?.limit ?? 10));
  return query.toString();
}

type TopicsListResponse = {
  data: Topic[];
  total: number;
  page: number;
  limit: number;
};

export async function getTopics(params?: { status?: string; search?: string; page?: number; limit?: number }): Promise<TopicsListResponse> {
  const query = buildTopicsQuery(params);
  const response = await fetch(`${BASE_URL}/topics?${query}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, '获取选题列表失败'));

  const result = await response.json();

  if (result?.success) {
    return {
      data: result.data || [],
      total: result.pagination?.total || 0,
      page: result.pagination?.page || params?.page || 1,
      limit: result.pagination?.limit || params?.limit || 10,
    };
  }

  return {
    data: result?.data || [],
    total: result?.total || 0,
    page: result?.page || params?.page || 1,
    limit: result?.limit || params?.limit || 10,
  };
}

export async function getTopic(id: number): Promise<Topic> {
  const response = await fetch(`${BASE_URL}/topics/${id}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取选题详情失败');
  const result = await response.json();
  return result.data;
}

export async function createTopic(data: { title: string; description: string; outline?: string; platform: string; deadline: string; assignee_id?: number | null }): Promise<{ message: string; topicId: number }> {
  const response = await fetch(`${BASE_URL}/topics`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('创建选题失败');
  const result = await response.json();
  return { message: result.message, topicId: result.data.topicId };
}

export async function updateTopic(id: number, data: Partial<Topic>): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/topics/${id}`, {
    method: 'PUT',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, '更新选题失败'));
  return response.json();
}

export async function deleteTopic(id: number): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/topics/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('删除选题失败');
  return response.json();
}

export async function auditTopic(id: number, data: { status: 'approved' | 'rejected'; comment: string; assignee_id?: number }): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/topics/${id}/audit`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('审核选题失败');
  return response.json();
}

export async function updateTopicStatus(id: number, status: string): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/topics/${id}/status`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  if (!response.ok) throw new Error('更新状态失败');
  return response.json();
}

export interface TopicResource {
  id: number;
  title: string;
  summary: string | null;
  library_type: 'project' | 'content_archive' | 'knowledge' | 'media';
  category: { id: number; name: string; path?: string } | null;
}

export async function getTopicResources(topicId: number): Promise<TopicResource[]> {
  const response = await fetch(`${BASE_URL}/topics/${topicId}/resources`, { headers: getAuthHeader() });
  if (!response.ok) throw new Error(await getErrorMessage(response, '获取关联资料失败'));
  return (await response.json()).data;
}

export async function addTopicResource(topicId: number, resourceId: number): Promise<void> {
  const response = await fetch(`${BASE_URL}/topics/${topicId}/resources`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ resource_id: resourceId }),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, '关联资料失败'));
}

export async function removeTopicResource(topicId: number, resourceId: number): Promise<void> {
  const response = await fetch(`${BASE_URL}/topics/${topicId}/resources/${resourceId}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, '解除关联失败'));
}
