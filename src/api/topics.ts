import { useAuthStore } from '../store';
import type { Topic } from '../types';

const BASE_URL = '/api';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getTopics(params?: { status?: string; search?: string; page?: number; limit?: number }): Promise<{ data: Topic[]; total: number; page: number; limit: number }> {
  const query = new URLSearchParams(params as Record<string, string>);
  const response = await fetch(`${BASE_URL}/topics?${query}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取选题列表失败');
  return response.json();
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
  return response.json();
}

export async function updateTopic(id: number, data: Partial<Topic>): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/topics/${id}`, {
    method: 'PUT',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('更新选题失败');
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
