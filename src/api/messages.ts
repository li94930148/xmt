import { useAuthStore } from '../store';
import type { Message } from '../types';

const BASE_URL = '/api';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getMessages(params?: { page?: number; limit?: number; type?: string; read?: string }): Promise<{ data: Message[]; total: number; page: number; limit: number }> {
  const query = new URLSearchParams(params as Record<string, string>);
  const response = await fetch(`${BASE_URL}/messages?${query}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取消息列表失败');
  return response.json();
}

export async function getUnreadCount(): Promise<{ unreadCount: number }> {
  const response = await fetch(`${BASE_URL}/messages/unread`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取未读消息数失败');
  return response.json();
}

export async function markMessageAsRead(id: number): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/messages/${id}`, {
    method: 'PUT',
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('标记消息失败');
  return response.json();
}

export async function clearMessages(): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/messages`, {
    method: 'DELETE',
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('清空消息失败');
  return response.json();
}

export async function markAllAsRead(ids?: number[]): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/messages/read-all`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids })
  });
  if (!response.ok) throw new Error('批量标记失败');
  return response.json();
}
