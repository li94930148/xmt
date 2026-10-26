import { useAuthStore } from '../store';
import type { Announcement } from '@shared/types';

const BASE_URL = '/api';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type { Announcement };

export type AnnouncementCreateRequestStatus =
  | { state: 'not_found' | 'deleted' | 'conflict' }
  | { state: 'committed'; announcementId: number };

export async function getAnnouncements(): Promise<Announcement[]> {
  const response = await fetch(`${BASE_URL}/announcements`, {
    headers: getAuthHeader(),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('获取公告列表失败');
  const payload: unknown = await response.json();
  const data = Array.isArray(payload) ? payload : (payload as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) throw new Error('公告列表数据格式无效');
  return data as Announcement[];
}

export async function createAnnouncement(data: { content: string; type?: string; pinned?: boolean }, requestId: string): Promise<{ message: string; id: number; idempotent_replay?: boolean }> {
  const response = await fetch(`${BASE_URL}/announcements`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, client_request_id: requestId })
  });
  if (!response.ok) {
    const error = new Error('创建公告失败') as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function getAnnouncementCreateRequestStatus(requestId: string): Promise<AnnouncementCreateRequestStatus> {
  const response = await fetch(`${BASE_URL}/announcements/create-request/${encodeURIComponent(requestId)}`, {
    headers: getAuthHeader(),
    cache: 'no-store',
  });
  if (!response.ok) {
    const error = new Error('核实公告创建状态失败') as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  const body = await response.json() as AnnouncementCreateRequestStatus;
  if (!body || !['not_found', 'deleted', 'conflict', 'committed'].includes(body.state)) {
    throw new Error('公告创建状态响应格式无效');
  }
  if (body.state === 'committed' && !Number.isSafeInteger(body.announcementId)) {
    throw new Error('公告创建状态响应格式无效');
  }
  return body;
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
  if (!response.ok) {
    const error = new Error('删除公告失败') as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json();
}
