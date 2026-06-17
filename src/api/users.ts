import { useAuthStore } from '../store';
import type { User } from '../types';

const BASE_URL = '/api';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getUsers(params?: { page?: number; limit?: number }): Promise<{ data: User[]; total: number; page: number; limit: number }> {
  const query = new URLSearchParams(params as Record<string, string>);
  const response = await fetch(`${BASE_URL}/users?${query}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取用户列表失败');
  return response.json();
}

export async function createUser(data: { username: string; password: string; email?: string; role?: string; name?: string }): Promise<{ message: string; userId: number }> {
  const response = await fetch(`${BASE_URL}/users`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('创建用户失败');
  return response.json();
}

export async function updateUser(id: number, data: Partial<User>): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/users/${id}`, {
    method: 'PUT',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('更新用户失败');
  return response.json();
}

export async function deleteUser(id: number): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/users/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('删除用户失败');
  return response.json();
}

export async function getLogs(params?: { page?: number; limit?: number }): Promise<{ data: any[]; total: number; page: number; limit: number }> {
  const query = new URLSearchParams(params as Record<string, string>);
  const response = await fetch(`${BASE_URL}/users/logs?${query}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取操作日志失败');
  return response.json();
}

export async function getActivityLogs(params?: { page?: number; limit?: number; user_id?: number }): Promise<{ data: import('../types').ActivityLog[]; total: number }> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.user_id) query.set('user_id', String(params.user_id));
  const response = await fetch(`${BASE_URL}/users/activity-logs?${query}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取活动日志失败');
  return response.json();
}
