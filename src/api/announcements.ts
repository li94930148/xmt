import { useAuthStore } from '../store';
import type { Announcement } from '@shared/types';

const BASE_URL = '/api';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type { Announcement };

export async function getAnnouncements(): Promise<Announcement[]> {
  const response = await fetch(`${BASE_URL}/announcements`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取公告列表失败');
  const json = await response.json();
  return Array.isArray(json) ? json : (json.data || []);
}

export async function createAnnouncement(data: { content: string; type?: string; pinned?: boolean }): Promise<{ message: string; id: number }> {
  const response = await fetch(`${BASE_URL}/announcements`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('创建公告失败');
  return response.json();
}

export async function updateAnnouncement(id: number, data: Partial<{ content: string; type: string; pinned: boolean }>): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/announcements/${id}`, {
    method: 'PUT',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('更新公告失败');
  return response.json();
}

export async function deleteAnnouncement(id: number): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/announcements/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('删除公告失败');
  return response.json();
}
