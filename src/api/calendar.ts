import { useAuthStore } from '../store';
import type { CalendarEvent } from '@shared/types';

const BASE_URL = '/api';

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type { CalendarEvent };

async function getErrorMessage(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  if (payload && typeof payload === 'object' && 'message' in payload) return String((payload as { message: unknown }).message);
  return fallback;
}

export async function getCalendarEvents(params: { year: number; month: number }): Promise<{ data: CalendarEvent[] }> {
  const query = new URLSearchParams({ year: String(params.year), month: String(params.month) });
  const response = await fetch(`${BASE_URL}/calendar?${query}`, {
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('获取日历事件失败');
  const result = await response.json();
  if (!result || !Array.isArray(result.data)) throw new Error('日历数据格式不正确');
  return result;
}

export type CalendarEventCreatePayload = { title: string; description?: string; event_date: string; event_type?: string; topic_id?: number };

export async function getCalendarEventCreateStatus(clientRequestId: string): Promise<
  | { status: 'missing' }
  | { status: 'deleted' }
  | { status: 'created'; eventId: number }
> {
  const response = await fetch(`${BASE_URL}/calendar/create-request/${encodeURIComponent(clientRequestId)}`, {
    cache: 'no-store',
    headers: getAuthHeader(),
  });
  if (response.status === 404) return { status: 'missing' };
  if (response.status === 410) return { status: 'deleted' };
  if (!response.ok) throw new Error(await getErrorMessage(response, '核实日历事件创建状态失败'));
  const payload: unknown = await response.json();
  const eventId = Number((payload as { eventId?: unknown } | null)?.eventId);
  if (!Number.isSafeInteger(eventId) || eventId <= 0) throw new Error('日历事件状态与请求编号不一致');
  return { status: 'created', eventId };
}

export async function createCalendarEvent(data: CalendarEventCreatePayload, clientRequestId?: string): Promise<{ message: string; id: number; idempotent_replay?: boolean }> {
  const response = await fetch(`${BASE_URL}/calendar`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(clientRequestId ? { ...data, client_request_id: clientRequestId } : data)
  });
  if (!response.ok) {
    const error = new Error(await getErrorMessage(response, '创建日历事件失败')) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function updateCalendarEvent(id: number, data: Partial<{ title: string; description: string; event_date: string; event_type: string; topic_id: number }>): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/calendar/${id}`, {
    method: 'PUT',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('更新日历事件失败');
  return response.json();
}

export async function deleteCalendarEvent(id: number): Promise<{ message: string }> {
  const response = await fetch(`${BASE_URL}/calendar/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader()
  });
  if (!response.ok) throw new Error('删除日历事件失败');
  return response.json();
}
