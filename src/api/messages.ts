import { useAuthStore } from '../store';
import type { Message } from '../types';

const BASE_URL = '/api';

export interface MessageListParams {
  page?: number;
  limit?: number;
  type?: string;
  read?: 'unread' | 'read';
  link?: 'present' | 'absent';
}

export interface MessageListResponse {
  data: Message[];
  total: number;
  page: number;
  limit: number;
  summary: {
    total: number;
    unread: number;
    actionable: number;
  };
}

export interface MessageReadResult {
  message: string;
  updatedCount: number;
  requestedCount?: number;
  distinctCount?: number;
  matchedCount?: number;
  ignoredCount?: number;
}

export type MessageReadStatus =
  | { state: 'available'; id: number; read: boolean }
  | { state: 'missing' };

export interface MessageClearResult {
  message: string;
  deletedCount: number;
  replayed: boolean;
}

export type MessageClearRequestStatus =
  | { state: 'cleared'; deletedCount: number }
  | { state: 'not_found' };

export type MessageReadAllRequestStatus =
  | { state: 'processed'; updatedCount: number }
  | { state: 'not_found' };

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getMessages(params?: MessageListParams): Promise<MessageListResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined) query.set(key, String(value));
  }
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

export async function getMessageReadStatus(id: number): Promise<MessageReadStatus> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('消息编号无效');
  const response = await fetch(`${BASE_URL}/messages/${id}/read-status`, {
    headers: getAuthHeader(),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('暂时无法核实消息状态');
  const result: unknown = await response.json();
  if (!result || typeof result !== 'object') throw new Error('消息状态响应格式无法确认');
  const status = result as Record<string, unknown>;
  if (status.state === 'missing') return { state: 'missing' };
  if (status.state !== 'available' || status.id !== id || typeof status.read !== 'boolean') {
    throw new Error('消息状态响应格式无法确认');
  }
  return { state: 'available', id, read: status.read };
}

export async function clearMessages(clientRequestId: string): Promise<MessageClearResult> {
  const response = await fetch(`${BASE_URL}/messages`, {
    method: 'DELETE',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_request_id: clientRequestId }),
  });
  if (!response.ok) throw new Error('清空消息失败');
  return response.json();
}

export async function getMessageClearRequestStatus(requestId: string): Promise<MessageClearRequestStatus> {
  const response = await fetch(`${BASE_URL}/messages/clear-requests/${encodeURIComponent(requestId)}`, {
    headers: getAuthHeader(),
  });
  if (!response.ok) throw new Error('暂时无法核实清空结果');
  return response.json();
}

export async function getMessageReadAllRequestStatus(requestId: string): Promise<MessageReadAllRequestStatus> {
  const response = await fetch(`${BASE_URL}/messages/read-all-requests/${encodeURIComponent(requestId)}`, {
    headers: getAuthHeader(),
  });
  if (!response.ok) throw new Error('暂时无法核实批量已读结果');
  return response.json();
}

export async function markAllAsRead(ids?: number[], clientRequestId?: string): Promise<MessageReadResult> {
  const body: { ids?: number[]; client_request_id?: string } = {};
  if (ids !== undefined) body.ids = ids;
  if (clientRequestId) body.client_request_id = clientRequestId;
  const response = await fetch(`${BASE_URL}/messages/read-all`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error('批量标记失败');
  return response.json();
}
